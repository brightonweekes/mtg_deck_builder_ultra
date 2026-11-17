import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  MANA_COLOR_CONFIG,
  THEME_BY_ID,
  THEME_METADATA,
} from '../../src/config/searchConfig.js';
import {
  buildRippleIndex,
  extractRippleProfile,
  HIDDEN_GEM_MAX_EDHREC_RANK,
  HIDDEN_GEM_MIN_EDHREC_RANK,
  prepareRippleMatcher,
  scoreRippleCard,
  type RippleIndex,
  type RippleMatcher,
  type RippleProfile,
} from '../../src/search/rippleEngine.js';
import { CardSearchEngine, colorArrayToMask } from '../../src/search/searchEngine.js';
import {
  hydrateCompactCard,
  type CompactCard,
  type DataManifest,
  type ManaColor,
  type SerializedCompactCard,
} from '../../src/types/card.js';
import { DEFAULT_SEARCH_FILTER } from '../../src/types/search.js';

export const SITE_ORIGIN = 'https://ripple99.pages.dev';
export const BUDGET_PAGE_MAX_USD = 2.0;
export const CLOUDFLARE_PAGES_FILE_LIMIT = 20_000;

const RE_BASIC_LAND_TYPE = /\bbasic\b.*\bland\b/i;

export interface SeoRankedCard {
  card: CompactCard;
  score: number;
  reasons: string[];
}

export interface CommanderSeoSummary {
  card: CompactCard;
  slug: string;
  profile: RippleProfile;
  starters: SeoRankedCard[];
  payoffs: SeoRankedCard[];
  hiddenGems: SeoRankedCard[];
  budgetEssentials: CompactCard[];
}

export interface SeoBuildStats {
  commanderPages: number;
  themePages: number;
  budgetPages: number;
  toolPages: number;
  hubPages: number;
  sitemapFiles: number;
  totalGeneratedFiles: number;
  elapsedMs: number;
}

/**
 * Escapes HTML special characters safely for static HTML rendering.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Serializes JSON-LD cleanly while escaping `<` to prevent `</script>` breakout.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/**
 * Converts a Commander or theme name into a stable lowercase URL-safe slug.
 */
export function slugifyText(input: string): string {
  const normalized = input
    .split(' // ')[0]!
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'card';
}

/**
 * Assigns 100% unique URL slugs across all Commander-eligible cards.
 */
export function assignCommanderSlugs(
  commanders: readonly CompactCard[],
): Map<string, string> {
  const slugByCardId = new Map<string, string>();
  const usedSlugs = new Set<string>();

  const sorted = [...commanders].sort(
    (a, b) =>
      (a.edhrecRank ?? 999_999) - (b.edhrecRank ?? 999_999) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );

  for (const cmd of sorted) {
    const base = slugifyText(cmd.name);
    let candidate = base;
    if (usedSlugs.has(candidate)) {
      const shortId = cmd.id.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || 'alt';
      candidate = `${base}-${shortId}`;
      let counter = 2;
      while (usedSlugs.has(candidate)) {
        candidate = `${base}-${shortId}-${counter++}`;
      }
    }
    usedSlugs.add(candidate);
    slugByCardId.set(cmd.id, candidate);
  }

  return slugByCardId;
}

function formatPrice(priceUsd: number | null): string {
  return priceUsd !== null ? `$${priceUsd.toFixed(2)}` : '—';
}

function formatColorIdentityText(colors: readonly ManaColor[]): string {
  if (colors.length === 0) return 'Colorless';
  const labels: Record<ManaColor, string> = {
    W: 'White',
    U: 'Blue',
    B: 'Black',
    R: 'Red',
    G: 'Green',
  };
  return colors.map((c) => labels[c]).join(' / ');
}

function renderColorPillsHtml(colors: readonly ManaColor[]): string {
  if (colors.length === 0) {
    return '<span class="ci-pill ci-C" title="Colorless">C</span>';
  }
  return colors
    .map((c) => {
      const meta = MANA_COLOR_CONFIG.find((m) => m.code === c);
      return `<span class="ci-pill ci-${c}" title="${escapeHtml(meta?.name ?? c)}">${c}</span>`;
    })
    .join('');
}

function insertTopRanked(
  list: Array<{ idx: number; score: number }>,
  item: { idx: number; score: number },
  limit: number,
  cards: readonly CompactCard[],
): void {
  if (item.score <= 0) return;
  if (list.length === limit) {
    const last = list[list.length - 1]!;
    if (item.score < last.score) return;
    if (
      item.score === last.score &&
      (cards[item.idx]!.edhrecRank ?? 999_999) >= (cards[last.idx]!.edhrecRank ?? 999_999)
    ) {
      return;
    }
  }

  list.push(item);
  list.sort(
    (a, b) =>
      b.score - a.score ||
      (cards[a.idx]!.edhrecRank ?? 999_999) - (cards[b.idx]!.edhrecRank ?? 999_999),
  );
  if (list.length > limit) {
    list.length = limit;
  }
}

function renderSeoCss(): string {
  return `*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;background:#020617;color:#e2e8f0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.55}
a{color:#93c5fd;text-decoration:none}
a:hover{text-decoration:underline;color:#fde68a}
.wrap{max-width:1160px;margin:0 auto;padding:1.25rem 1rem 3rem}
.nav{border-bottom:1px solid #1e293b;background:rgba(2,6,23,.95);position:sticky;top:0;z-index:20;backdrop-filter:blur(8px)}
.nav-inner{max-width:1160px;margin:0 auto;padding:.75rem 1rem;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.75rem}
.brand{display:inline-flex;align-items:center;gap:.5rem;font-weight:800;color:#f8fafc;font-size:1rem;letter-spacing:-.01em}
.brand-sub{font-size:.75rem;color:#94a3b8;font-weight:500}
.nav-links{display:flex;flex-wrap:wrap;gap:.9rem;font-size:.82rem;font-weight:600}
.hero{margin-top:1rem;display:grid;grid-template-columns:220px 1fr;gap:1.25rem;background:#0f172a;border:1px solid #1e293b;border-radius:1rem;padding:1.25rem}
.hero-single{margin-top:1rem;background:#0f172a;border:1px solid #1e293b;border-radius:1rem;padding:1.5rem}
@media(max-width:700px){.hero{grid-template-columns:1fr}.hero-art{max-width:220px;margin:0 auto}}
.hero-art img{width:100%;height:auto;border-radius:.75rem;border:1px solid #334155;display:block;background:#020617}
.badge-row{display:flex;flex-wrap:wrap;gap:.45rem;align-items:center;margin-bottom:.5rem}
.badge{display:inline-flex;align-items:center;gap:.3rem;padding:.2rem .55rem;border-radius:.45rem;font-size:.72rem;font-weight:700;background:#1e293b;color:#cbd5e1;border:1px solid #334155}
.badge-amber{background:rgba(245,158,11,.15);color:#fde68a;border-color:rgba(245,158,11,.35)}
.badge-cyan{background:rgba(6,182,212,.15);color:#a5f3fc;border-color:rgba(6,182,212,.35)}
.badge-violet{background:rgba(139,92,246,.16);color:#ddd6fe;border-color:rgba(139,92,246,.35)}
.badge-emerald{background:rgba(16,185,129,.15);color:#a7f3d0;border-color:rgba(16,185,129,.35)}
h1{margin:.2rem 0 .35rem;font-size:1.65rem;line-height:1.2;color:#f8fafc}
h2{margin:1.75rem 0 .65rem;font-size:1.15rem;color:#f8fafc;border-bottom:1px solid #1e293b;padding-bottom:.4rem}
.oracle{margin:.65rem 0;padding:.75rem .9rem;background:#020617;border:1px solid #1e293b;border-radius:.65rem;font-size:.87rem;color:#cbd5e1;white-space:pre-line}
.ripple-box{margin:.65rem 0;padding:.65rem .85rem;border-radius:.65rem;background:rgba(139,92,246,.12);border:1px solid rgba(139,92,246,.32);font-size:.86rem;color:#ede9fe}
.cta-row{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:.9rem}
.btn{display:inline-flex;align-items:center;gap:.4rem;padding:.55rem .95rem;border-radius:.65rem;font-size:.84rem;font-weight:700;border:1px solid #334155;background:#020617;color:#f8fafc}
.btn-primary{background:#f59e0b;color:#020617;border-color:#f59e0b}
.btn-primary:hover{background:#fbbf24;color:#020617;text-decoration:none}
.btn-emerald{background:rgba(16,185,129,.18);color:#a7f3d0;border-color:rgba(16,185,129,.45)}
.ci-pill{display:inline-flex;align-items:center;justify-content:center;width:1.3rem;height:1.3rem;border-radius:999px;font-size:.7rem;font-weight:800;margin-right:.2rem}
.ci-W{background:#fef3c7;color:#1e293b}.ci-U{background:#38bdf8;color:#020617}.ci-B{background:#7e22ce;color:#fff}.ci-R{background:#f43f5e;color:#fff}.ci-G{background:#10b981;color:#020617}.ci-C{background:#64748b;color:#fff}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(265px,1fr));gap:.75rem}
.card{background:#0f172a;border:1px solid #1e293b;border-radius:.75rem;padding:.8rem;display:flex;flex-direction:column;gap:.4rem}
.card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem}
.card-name{font-weight:700;color:#f1f5f9;font-size:.9rem}
.card-meta{font-size:.75rem;color:#94a3b8;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.chips{display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.25rem}
.chip{display:inline-block;padding:.15rem .45rem;border-radius:.4rem;font-size:.7rem;background:#1e293b;color:#cbd5e1;border:1px solid #334155}
.dir-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:.6rem;margin-top:.75rem}
.dir-link{display:flex;justify-content:space-between;align-items:center;padding:.6rem .8rem;background:#0f172a;border:1px solid #1e293b;border-radius:.65rem;font-size:.84rem;color:#e2e8f0;font-weight:600}
.dir-link:hover{border-color:#f59e0b;text-decoration:none}
.breadcrumbs{font-size:.78rem;color:#94a3b8;margin-bottom:.5rem}
.footer{margin-top:2.5rem;padding-top:1rem;border-top:1px solid #1e293b;font-size:.76rem;color:#64748b}
`;
}

function renderLayout(opts: {
  title: string;
  description: string;
  canonicalPath: string;
  ogImage?: string | null;
  ogType?: string;
  jsonLd: unknown;
  bodyHtml: string;
}): string {
  const canonicalUrl = `${SITE_ORIGIN}${opts.canonicalPath}`;
  const safeTitle = escapeHtml(opts.title);
  const safeDesc = escapeHtml(opts.description);
  const safeUrl = escapeHtml(canonicalUrl);
  const twitterCard = opts.ogImage ? 'summary_large_image' : 'summary';
  const imageMeta = opts.ogImage
    ? `\n  <meta property="og:image" content="${escapeHtml(opts.ogImage)}" />\n  <meta name="twitter:image" content="${escapeHtml(opts.ogImage)}" />`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDesc}" />
  <meta name="theme-color" content="#020617" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="canonical" href="${safeUrl}" />
  <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
  <link rel="stylesheet" href="/seo.css" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDesc}" />
  <meta property="og:type" content="${escapeHtml(opts.ogType ?? 'website')}" />
  <meta property="og:site_name" content="Ripple99" />
  <meta property="og:url" content="${safeUrl}" />${imageMeta}
  <meta name="twitter:card" content="${twitterCard}" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDesc}" />
  <script type="application/ld+json">${safeJsonLd(opts.jsonLd)}</script>
</head>
<body>
  <header class="nav">
    <div class="nav-inner">
      <a href="/" class="brand">Ripple99 <span class="brand-sub">— Build Decks, Not Piles</span></a>
      <nav class="nav-links" aria-label="Primary sections">
        <a href="/">Open Deck Studio</a>
        <a href="/commander/">Commanders</a>
        <a href="/theme/">Themes</a>
        <a href="/budget/">Budget &le; $2</a>
        <a href="/tools/">Deck Tools</a>
      </nav>
    </div>
  </header>
  <main class="wrap">
${opts.bodyHtml}
    <footer class="footer">
      <p>Ripple99 is a free, ad-free, local-first MTG Commander builder &amp; synergy analyzer (<a href="/">Launch App</a>).</p>
      <p>Unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy. Not approved/endorsed by Wizards. Card data &amp; imagery provided by Scryfall.</p>
    </footer>
  </main>
</body>
</html>
`;
}

function renderCardGrid(
  items: readonly SeoRankedCard[],
  badgeVariant: 'cyan' | 'violet' | 'emerald',
  emptyText: string,
): string {
  if (items.length === 0) {
    return `<p style="color:#94a3b8;font-size:.86rem">${escapeHtml(emptyText)}</p>`;
  }

  const badgeClass =
    badgeVariant === 'cyan'
      ? 'badge badge-cyan'
      : badgeVariant === 'emerald'
        ? 'badge badge-emerald'
        : 'badge badge-violet';

  return `<div class="grid">${items
    .map(({ card, reasons }) => {
      const chipsHtml = reasons
        .slice(0, 3)
        .map((r) => `<span class="${badgeClass}">${escapeHtml(r)}</span>`)
        .join('');
      const edhText = card.edhrecRank !== null ? ` · #${card.edhrecRank.toLocaleString()}` : '';
      return `<article class="card">
        <div class="card-top">
          <span class="card-name">${escapeHtml(card.name)}</span>
          <span class="badge badge-emerald">${escapeHtml(formatPrice(card.priceUsd))}</span>
        </div>
        <div class="card-meta">MV ${card.cmc} · ${escapeHtml(card.typeLine.split(' — ')[0] ?? card.typeLine)}${escapeHtml(edhText)}</div>
        <div class="chips">${chipsHtml}</div>
      </article>`;
    })
    .join('')}</div>`;
}

function writeHtmlPage(outDir: string, relUrlPath: string, html: string): void {
  const cleanRel = relUrlPath.replace(/^\/+/, '').replace(/\/+$/, '');
  const targetDir = cleanRel ? path.join(outDir, cleanRel) : outDir;
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(path.join(targetDir, 'index.html'), html, 'utf8');
}

function formatXmlSitemapUrlSet(
  urls: ReadonlyArray<{ loc: string; lastmod: string; changefreq: string; priority: string }>,
): string {
  const body = urls
    .map(
      (u) =>
        `  <url><loc>${escapeHtml(u.loc)}</loc><lastmod>${escapeHtml(u.lastmod)}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function scoreTopBudgetEssentials(
  cards: readonly CompactCard[],
  nonBasicBudgetIndices: readonly number[],
  cardCiMasks: Uint8Array,
  cmdCiMask: number,
  limit = 8,
): CompactCard[] {
  const out: CompactCard[] = [];
  const seenOracle = new Set<string>();
  for (let p = 0; p < nonBasicBudgetIndices.length; p++) {
    const idx = nonBasicBudgetIndices[p]!;
    if ((cardCiMasks[idx]! & ~cmdCiMask) !== 0) continue;
    const card = cards[idx]!;
    if (card.roles.length === 0) continue;
    if (card.oracleId && seenOracle.has(card.oracleId)) continue;
    if (card.oracleId) seenOracle.add(card.oracleId);
    out.push(card);
    if (out.length >= limit) break;
  }
  return out;
}

function computeFastCommanderRecommendations(
  cmd: CompactCard,
  profile: RippleProfile,
  cards: readonly CompactCard[],
  rIdx: RippleIndex,
  typeLowers: readonly string[],
  cardCiMasks: Uint8Array,
  rankedCandidatePool: readonly number[],
  fullNonBasicPool: readonly number[],
): {
  starters: SeoRankedCard[];
  payoffs: SeoRankedCard[];
  hiddenGems: SeoRankedCard[];
} {
  const cmdCiMask = colorArrayToMask(cmd.colorIdentity);
  const matcherAll = prepareRippleMatcher(profile, 'all', null, null);
  const matcherEn = prepareRippleMatcher(profile, 'enablers', null, null);
  const matcherPay = prepareRippleMatcher(profile, 'payoffs', null, null);
  const matcherGem = prepareRippleMatcher(profile, 'hidden-gems', null, null);

  const needsFullScan =
    matcherAll.compiledSubtypes.length > 0 ||
    matcherAll.compiledCustomTerms.length > 0 ||
    matcherAll.includeStax ||
    matcherAll.includeTheft ||
    profile.wantTypesInclude.length > 0;
  const pool = needsFullScan ? fullNonBasicPool : rankedCandidatePool;

  const enBits = matcherEn.neededEnablerBits;
  const payBits = matcherPay.neededPayoffBits;
  const checkBitGate = !needsFullScan;

  const topEn: Array<{ idx: number; score: number }> = [];
  const topPay: Array<{ idx: number; score: number }> = [];
  const topGem: Array<{ idx: number; score: number }> = [];

  for (let p = 0; p < pool.length; p++) {
    const i = pool[p]!;
    if ((cardCiMasks[i]! & ~cmdCiMask) !== 0) continue;
    const card = cards[i]!;
    if (card.id === cmd.id) continue;

    if (checkBitGate) {
      const cardEn = rIdx.enablerMasks[i]!;
      const cardPay = rIdx.payoffMasks[i]!;
      if ((cardEn & enBits) === 0 && (cardPay & payBits) === 0) continue;
    }

    const tLow = typeLowers[i]!;
    if (enBits !== 0 || needsFullScan) {
      const hitEn = scoreRippleCard(i, card, tLow, rIdx, matcherEn, false);
      if (hitEn.score > 0) insertTopRanked(topEn, { idx: i, score: hitEn.score }, 8, cards);
    }
    if (payBits !== 0 || needsFullScan) {
      const hitPay = scoreRippleCard(i, card, tLow, rIdx, matcherPay, false);
      if (hitPay.score > 0) insertTopRanked(topPay, { idx: i, score: hitPay.score }, 8, cards);
    }

    if (
      card.priceUsd !== null &&
      card.priceUsd <= 5.0 &&
      card.edhrecRank !== null &&
      card.edhrecRank >= HIDDEN_GEM_MIN_EDHREC_RANK &&
      card.edhrecRank <= HIDDEN_GEM_MAX_EDHREC_RANK
    ) {
      const hitGem = scoreRippleCard(i, card, tLow, rIdx, matcherGem, false);
      if (hitGem.score > 0) insertTopRanked(topGem, { idx: i, score: hitGem.score }, 8, cards);
    }
  }

  const hydrateList = (
    items: readonly { idx: number; score: number }[],
    matcher: RippleMatcher,
  ): SeoRankedCard[] =>
    items.map(({ idx, score }) => {
      const card = cards[idx]!;
      const detailed = scoreRippleCard(idx, card, typeLowers[idx]!, rIdx, matcher, true);
      return { card, score, reasons: detailed.reasons };
    });

  return {
    starters: hydrateList(topEn, matcherEn),
    payoffs: hydrateList(topPay, matcherPay),
    hiddenGems: hydrateList(topGem, matcherGem),
  };
}

/**
 * Generates static HTML SEO pages (`/commander/*`, `/theme/*`, `/budget/*`, `/tools/*`),
 * hub directories, `seo.css`, and XML sitemaps into `outDir`.
 */
export function generateSeoPages(options: {
  cards: readonly CompactCard[];
  manifest: DataManifest;
  outDir: string;
}): SeoBuildStats {
  const startMs = performance.now();
  const { cards, manifest, outDir } = options;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'seo.css'), renderSeoCss(), 'utf8');

  const lastmod = (manifest.generatedAt || new Date().toISOString()).slice(0, 10);
  const rIdx = buildRippleIndex(cards);
  const typeLowers = rIdx.typeLowers;
  const cardCiMasks = new Uint8Array(cards.length);
  const commanders: CompactCard[] = [];
  const fullNonBasicPool: number[] = [];
  const rankedCandidatePool: number[] = [];
  const budgetRolePool: number[] = [];

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i]!;
    cardCiMasks[i] = colorArrayToMask(c.colorIdentity);
    if (c.isCommanderEligible) {
      commanders.push(c);
    }
    if (!RE_BASIC_LAND_TYPE.test(typeLowers[i]!)) {
      fullNonBasicPool.push(i);
      if (c.edhrecRank !== null && c.edhrecRank <= HIDDEN_GEM_MAX_EDHREC_RANK + 500) {
        rankedCandidatePool.push(i);
      }
      if (
        c.priceUsd !== null &&
        c.priceUsd <= BUDGET_PAGE_MAX_USD &&
        c.roles.length > 0
      ) {
        budgetRolePool.push(i);
      }
    }
  }

  budgetRolePool.sort(
    (a, b) =>
      (cards[a]!.edhrecRank ?? 999_999) - (cards[b]!.edhrecRank ?? 999_999),
  );

  const commanderSlugs = assignCommanderSlugs(commanders);

  // Build commander buckets per theme for cross-linking & theme hubs
  const commandersByTheme = new Map<string, Array<{ card: CompactCard; slug: string }>>();
  const commanderProfiles = new Map<string, RippleProfile>();

  for (const cmd of commanders) {
    const profile = extractRippleProfile([cmd]);
    commanderProfiles.set(cmd.id, profile);
    const slug = commanderSlugs.get(cmd.id)!;
    for (const themeId of profile.defaultThemes) {
      let arr = commandersByTheme.get(themeId);
      if (!arr) {
        arr = [];
        commandersByTheme.set(themeId, arr);
      }
      arr.push({ card: cmd, slug });
    }
  }
  for (const list of commandersByTheme.values()) {
    list.sort(
      (a, b) =>
        (a.card.edhrecRank ?? 999_999) - (b.card.edhrecRank ?? 999_999),
    );
  }

  const commanderSitemapUrls: Array<{
    loc: string;
    lastmod: string;
    changefreq: string;
    priority: string;
  }> = [];

  // 1. Render all 3,759 Commander pages
  for (const cmd of commanders) {
    const slug = commanderSlugs.get(cmd.id)!;
    const profile = commanderProfiles.get(cmd.id)!;
    const { starters, payoffs, hiddenGems } = computeFastCommanderRecommendations(
      cmd,
      profile,
      cards,
      rIdx,
      typeLowers,
      cardCiMasks,
      rankedCandidatePool,
      fullNonBasicPool,
    );
    const cmdCiMask = colorArrayToMask(cmd.colorIdentity);
    const budgetEssentials = scoreTopBudgetEssentials(
      cards,
      budgetRolePool,
      cardCiMasks,
      cmdCiMask,
      6,
    );

    const primaryTheme = profile.defaultThemes[0];
    const relatedCmds = (primaryTheme ? (commandersByTheme.get(primaryTheme) ?? []) : [])
      .filter((entry) => entry.card.id !== cmd.id)
      .slice(0, 6);

    const colorText = formatColorIdentityText(cmd.colorIdentity);
    const title = `${cmd.name} Commander Synergy, Ripple Chains & Budget Gems | Ripple99`;
    const description = `${cmd.name} (${colorText}) EDH guide: ${profile.summarySentence}. Explore Starters, Payoffs, and Hidden Gems <= $5, then build live in Ripple99.`;
    const canonicalPath = `/commander/${slug}/`;

    const themeChipsHtml = profile.defaultThemes
      .map((tId) => {
        const label = THEME_BY_ID[tId]?.label ?? tId;
        const cleanSlug = slugifyText(tId);
        return THEME_BY_ID[tId]
          ? `<a href="/theme/${cleanSlug}/" class="badge badge-violet">${escapeHtml(label)}</a>`
          : `<span class="badge">${escapeHtml(label)}</span>`;
      })
      .join('');

    const budgetEssentialsHtml = budgetEssentials.length
      ? `<div class="grid">${budgetEssentials
          .map(
            (c) => `<article class="card">
            <div class="card-top">
              <span class="card-name">${escapeHtml(c.name)}</span>
              <span class="badge badge-emerald">${escapeHtml(formatPrice(c.priceUsd))}</span>
            </div>
            <div class="card-meta">MV ${c.cmc} · ${escapeHtml(c.roles.join(', '))}</div>
          </article>`,
          )
          .join('')}</div>`
      : '';

    const relatedHtml = relatedCmds.length
      ? `<section><h2>Similar Commanders</h2><div class="dir-grid">${relatedCmds
          .map(
            (r) =>
              `<a href="/commander/${escapeHtml(r.slug)}/" class="dir-link"><span>${escapeHtml(r.card.name)}</span><span class="badge">${escapeHtml(formatPrice(r.card.priceUsd))}</span></a>`,
          )
          .join('')}</div></section>`
      : '';

    const partnerLine = cmd.partnerType
      ? `<span class="badge badge-violet">${escapeHtml(cmd.partnerType.replace(/-/g, ' '))}${cmd.partnerWithName ? `: ${escapeHtml(cmd.partnerWithName)}` : ''}</span>`
      : '';

    const html = renderLayout({
      title,
      description,
      canonicalPath,
      ogImage: cmd.imageNormal || null,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `${cmd.name} — Ripple99 Commander Guide`,
        description,
        url: `${SITE_ORIGIN}${canonicalPath}`,
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Ripple99', item: `${SITE_ORIGIN}/` },
            { '@type': 'ListItem', position: 2, name: 'Commanders', item: `${SITE_ORIGIN}/commander/` },
            { '@type': 'ListItem', position: 3, name: cmd.name, item: `${SITE_ORIGIN}${canonicalPath}` },
          ],
        },
      },
      bodyHtml: `
        <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Ripple99</a> / <a href="/commander/">Commanders</a> / ${escapeHtml(cmd.name)}</nav>
        <section class="hero">
          <div class="hero-art">
            ${cmd.imageNormal ? `<img src="${escapeHtml(cmd.imageNormal)}" alt="${escapeHtml(cmd.name)} card image" loading="eager" width="244" height="340" />` : ''}
          </div>
          <div>
            <div class="badge-row">
              ${renderColorPillsHtml(cmd.colorIdentity)}
              <span class="badge badge-amber">Commander</span>
              <span class="badge">${escapeHtml(colorText)}</span>
              <span class="badge badge-emerald">${escapeHtml(formatPrice(cmd.priceUsd))}</span>
              ${cmd.edhrecRank !== null ? `<span class="badge">EDHREC #${cmd.edhrecRank.toLocaleString()}</span>` : ''}
              ${partnerLine}
            </div>
            <h1>${escapeHtml(cmd.name)}</h1>
            <div class="card-meta">${escapeHtml(cmd.typeLine)} · MV ${cmd.cmc}${cmd.manaCost ? ` · ${escapeHtml(cmd.manaCost)}` : ''}</div>
            ${cmd.oracleText ? `<div class="oracle">${escapeHtml(cmd.oracleText)}</div>` : ''}
            <div class="ripple-box"><strong>Ripple Strategy:</strong> ${escapeHtml(profile.summarySentence)}</div>
            ${themeChipsHtml ? `<div class="badge-row" style="margin-top:.5rem">${themeChipsHtml}</div>` : ''}
            <div class="cta-row">
              <a href="/?commander=${encodeURIComponent(cmd.id)}" class="btn btn-primary">Build With ${escapeHtml(cmd.name.split(',')[0]!)} in Ripple99 Studio</a>
              <a href="/?commander=${encodeURIComponent(cmd.id)}&amp;mode=hidden-gems" class="btn btn-emerald">Browse Hidden Gems &le; $5</a>
              <a href="/tools/budget-swaps/" class="btn">Budget Swap Finder</a>
            </div>
          </div>
        </section>

        <section>
          <h2>Starters (Enablers &amp; Fuel)</h2>
          ${renderCardGrid(starters, 'cyan', 'Explore all starters inside Ripple99 Studio.')}
        </section>

        <section>
          <h2>Payoffs (Triggers, Multipliers &amp; Rewards)</h2>
          ${renderCardGrid(payoffs, 'violet', 'Explore full payoffs inside Ripple99 Studio.')}
        </section>

        <section>
          <h2>Hidden Gems (&le; $5.00 Sleepers)</h2>
          ${renderCardGrid(hiddenGems, 'emerald', 'No narrow sleeper gems ranked in #2,200–#14,000 under $5 — open Studio to tune filters.')}
        </section>

        ${
          budgetEssentialsHtml
            ? `<section><h2>Under-$2 Role Staples in ${escapeHtml(colorText)}</h2>${budgetEssentialsHtml}</section>`
            : ''
        }

        ${relatedHtml}
      `,
    });

    writeHtmlPage(outDir, canonicalPath, html);
    commanderSitemapUrls.push({
      loc: `${SITE_ORIGIN}${canonicalPath}`,
      lastmod,
      changefreq: 'daily',
      priority: cmd.edhrecRank !== null && cmd.edhrecRank <= 1500 ? '0.8' : '0.6',
    });
  }

  // 2. Render 40 Theme + 40 Budget (<= $2.00) pages via CardSearchEngine
  const engine = new CardSearchEngine(cards);
  engine.ensureRippleIndex();
  const themeSitemapUrls: Array<{
    loc: string;
    lastmod: string;
    changefreq: string;
    priority: string;
  }> = [];

  for (const theme of THEME_METADATA) {
    const themeSlug = slugifyText(theme.id);
    const themeLabel = theme.label;
    const themeCommanders = (commandersByTheme.get(theme.id) ?? []).slice(0, 8);

    const startersRes = engine.search({
      ...DEFAULT_SEARCH_FILTER,
      themes: [theme.id],
      rippleMode: 'enablers',
      sortBy: 'synergy',
      pageSize: 12,
    });
    const payoffsRes = engine.search({
      ...DEFAULT_SEARCH_FILTER,
      themes: [theme.id],
      rippleMode: 'payoffs',
      sortBy: 'synergy',
      pageSize: 12,
    });
    const budgetRes = engine.search({
      ...DEFAULT_SEARCH_FILTER,
      themes: [theme.id],
      maxPriceUsd: BUDGET_PAGE_MAX_USD,
      sortBy: 'synergy',
      pageSize: 24,
    });

    const cmdLinksHtml = themeCommanders.length
      ? `<section><h2>Top ${escapeHtml(themeLabel)} Commanders</h2><div class="dir-grid">${themeCommanders
          .map(
            (entry) =>
              `<a href="/commander/${escapeHtml(entry.slug)}/" class="dir-link"><span>${escapeHtml(entry.card.name)}</span><span class="badge">${escapeHtml(formatPrice(entry.card.priceUsd))}</span></a>`,
          )
          .join('')}</div></section>`
      : '';

    const themePath = `/theme/${themeSlug}/`;
    const themeTitle = `${themeLabel} Commander Synergy & Top EDH Cards | Ripple99`;
    const themeDesc = `Best ${themeLabel} Commanders, Starters, Payoffs, and under-$2 budget staples analyzed across ${cards.length.toLocaleString()} Commander-legal cards.`;

    writeHtmlPage(
      outDir,
      themePath,
      renderLayout({
        title: themeTitle,
        description: themeDesc,
        canonicalPath: themePath,
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: themeTitle,
          description: themeDesc,
          url: `${SITE_ORIGIN}${themePath}`,
        },
        bodyHtml: `
          <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Ripple99</a> / <a href="/theme/">Themes</a> / ${escapeHtml(themeLabel)}</nav>
          <section class="hero-single">
            <div class="badge-row">
              <span class="badge badge-violet">${escapeHtml(theme.category)}</span>
              <span class="badge badge-amber">Mechanical Theme</span>
            </div>
            <h1>${escapeHtml(themeLabel)} — Commander Synergy Guide</h1>
            <p style="color:#cbd5e1;margin:.5rem 0">Discover ${escapeHtml(themeLabel)} Starters, Payoffs, leading Commanders, and under-$2 sleepers powered by Ripple99's deterministic rules engine.</p>
            <div class="cta-row">
              <a href="/?theme=${encodeURIComponent(theme.id)}" class="btn btn-primary">Search All ${escapeHtml(themeLabel)} Cards in Studio</a>
              <a href="/budget/${escapeHtml(themeSlug)}/" class="btn btn-emerald">View Strict Under-$2 ${escapeHtml(themeLabel)} Picks</a>
            </div>
          </section>
          ${cmdLinksHtml}
          <section>
            <h2>Top ${escapeHtml(themeLabel)} Starters</h2>
            ${renderCardGrid(
              startersRes.matches.map((m) => ({
                card: m.card,
                score: m.synergyScore,
                reasons: m.matchedReasons,
              })),
              'cyan',
              'Explore more starters in Ripple99 Studio.',
            )}
          </section>
          <section>
            <h2>Top ${escapeHtml(themeLabel)} Payoffs</h2>
            ${renderCardGrid(
              payoffsRes.matches.map((m) => ({
                card: m.card,
                score: m.synergyScore,
                reasons: m.matchedReasons,
              })),
              'violet',
              'Explore more payoffs in Ripple99 Studio.',
            )}
          </section>
        `,
      }),
    );
    themeSitemapUrls.push({
      loc: `${SITE_ORIGIN}${themePath}`,
      lastmod,
      changefreq: 'daily',
      priority: '0.8',
    });

    const budgetPath = `/budget/${themeSlug}/`;
    const budgetTitle = `Budget ${themeLabel} Commander Cards Under $2 | Ripple99`;
    const budgetDesc = `Affordable ${themeLabel} EDH staples priced $2.00 or less across ${cards.length.toLocaleString()} Commander cards — ranked by Ripple synergy score.`;
    const budgetCmds = themeCommanders.filter(
      (entry) => entry.card.priceUsd !== null && entry.card.priceUsd <= BUDGET_PAGE_MAX_USD,
    );
    const budgetCmdHtml = budgetCmds.length
      ? `<section><h2>Under-$2 ${escapeHtml(themeLabel)} Commanders</h2><div class="dir-grid">${budgetCmds
          .map(
            (entry) =>
              `<a href="/commander/${escapeHtml(entry.slug)}/" class="dir-link"><span>${escapeHtml(entry.card.name)}</span><span class="badge badge-emerald">${escapeHtml(formatPrice(entry.card.priceUsd))}</span></a>`,
          )
          .join('')}</div></section>`
      : cmdLinksHtml;

    writeHtmlPage(
      outDir,
      budgetPath,
      renderLayout({
        title: budgetTitle,
        description: budgetDesc,
        canonicalPath: budgetPath,
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: budgetTitle,
          description: budgetDesc,
          url: `${SITE_ORIGIN}${budgetPath}`,
        },
        bodyHtml: `
          <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Ripple99</a> / <a href="/budget/">Budget &le; $2</a> / ${escapeHtml(themeLabel)}</nav>
          <section class="hero-single">
            <div class="badge-row">
              <span class="badge badge-emerald">Strict &le; $2.00 USD</span>
              <span class="badge badge-violet">${escapeHtml(theme.category)}</span>
            </div>
            <h1>Budget ${escapeHtml(themeLabel)} Commander Cards (&le; $2.00)</h1>
            <p style="color:#cbd5e1;margin:.5rem 0">High-synergy ${escapeHtml(themeLabel)} cards priced $2.00 or less for Commander brews on any budget.</p>
            <div class="cta-row">
              <a href="/?theme=${encodeURIComponent(theme.id)}&amp;budget=2" class="btn btn-primary">Filter Under-$2 ${escapeHtml(themeLabel)} in Studio</a>
              <a href="/theme/${escapeHtml(themeSlug)}/" class="btn">View All ${escapeHtml(themeLabel)} Cards</a>
              <a href="/tools/budget-swaps/" class="btn btn-emerald">Run Budget Swap Finder</a>
            </div>
          </section>
          ${budgetCmdHtml}
          <section>
            <h2>Top Under-$2 ${escapeHtml(themeLabel)} Staples</h2>
            ${renderCardGrid(
              budgetRes.matches.map((m) => ({
                card: m.card,
                score: m.synergyScore,
                reasons: m.matchedReasons,
              })),
              'emerald',
              'Explore budget picks inside Ripple99 Studio.',
            )}
          </section>
        `,
      }),
    );
    themeSitemapUrls.push({
      loc: `${SITE_ORIGIN}${budgetPath}`,
      lastmod,
      changefreq: 'daily',
      priority: '0.8',
    });
  }

  // 3. Render Standalone Tool Pages (4 shipped tools)
  const toolDefs = [
    {
      slug: 'deck-auditor',
      title: 'Instant 99 Commander Deck Auditor | Ripple99',
      h1: 'Instant 99 Commander Deck Auditor',
      desc: 'Paste any Moxfield, Archidekt, or plain-text Commander decklist for an instant 5-second mana curve, color-pip, role deficit, and under-$1 upgrade audit.',
      launchUrl: '/?tool=audit',
      cta: 'Paste a Decklist to Audit Now',
      bullets: [
        'Checks Ramp, Card Draw, Targeted Removal, Board Wipes, Lands, Recursion, and Protection targets automatically.',
        'Compares color pips in your spells against color production in your lands and ramp.',
        'Recommends missing under-$1 Ripple synergy upgrades outside your list and exports straight back to Moxfield text.',
      ],
    },
    {
      slug: 'budget-swaps',
      title: '1-Click MTG Commander Budget Swap Finder | Ripple99',
      h1: '1-Click Commander Budget Swap Finder',
      desc: 'Scan your 100-card Commander deck for expensive staples and swap in cheaper same-job alternatives ($0.50–$2) that stay strictly inside your Commander color identity.',
      launchUrl: '/?tool=budget-swaps',
      cta: 'Open Budget Swap Finder',
      bullets: [
        'Matches same-job slots (counterspells to counterspells, mass bounce to mass bounce, dual/fetch lands by color fix & untapped speed).',
        'Strictly enforces your Commander color identity, skips cards you already run, and stashes cut cards cleanly in Maybeboard with 1-click Undo.',
        'Calculates total dollars trimmed across your entire 99.',
      ],
    },
    {
      slug: 'ripple-synergy',
      title: 'Ripple Chains — Directional MTG Commander Synergy Finder | Ripple99',
      h1: 'Ripple Chains Synergy Explorer',
      desc: 'Go beyond generic popularity lists with directional Trigger <-> Enabler <-> Payoff Commander synergy search across 32,643 cards in under 25ms.',
      launchUrl: '/?tool=ripple',
      cta: 'Explore Commander Ripple Chains',
      bullets: [
        'Separates Starters (cards that trigger or fuel your Commander) from Payoffs (cards that scale or multiply the effect).',
        'Dedicated Hidden Gems mode surfaces high-synergy sleepers <= $5.00 outside top EDHREC staples.',
        'Supports two-Commander Partner and Background pairs plus single-card "Find Similar" chains.',
      ],
    },
    {
      slug: 'partner-finder',
      title: 'MTG Partner, Background & Companion Commander Finder | Ripple99',
      h1: 'Commander Partner & Background Compatibility Finder',
      desc: 'Filter legal Partner, Partner With, Friends Forever, Choose a Background, and Doctor’s Companion Commanders across all 3,759 eligible legends.',
      launchUrl: '/?tool=partner',
      cta: 'Browse Partner Commanders',
      bullets: [
        'Automatically filters legal second Commanders compatible with your chosen primary Partner or Background legend.',
        'Computes merged two-Commander color identity and fused Ripple synergy profiles instantaneously.',
      ],
    },
  ] as const;

  const coreSitemapUrls: Array<{
    loc: string;
    lastmod: string;
    changefreq: string;
    priority: string;
  }> = [
    { loc: `${SITE_ORIGIN}/`, lastmod, changefreq: 'daily', priority: '1.0' },
    { loc: `${SITE_ORIGIN}/commander/`, lastmod, changefreq: 'daily', priority: '0.9' },
    { loc: `${SITE_ORIGIN}/theme/`, lastmod, changefreq: 'weekly', priority: '0.9' },
    { loc: `${SITE_ORIGIN}/budget/`, lastmod, changefreq: 'weekly', priority: '0.9' },
    { loc: `${SITE_ORIGIN}/tools/`, lastmod, changefreq: 'weekly', priority: '0.9' },
  ];

  for (const t of toolDefs) {
    const toolPath = `/tools/${t.slug}/`;
    writeHtmlPage(
      outDir,
      toolPath,
      renderLayout({
        title: t.title,
        description: t.desc,
        canonicalPath: toolPath,
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: t.h1,
          description: t.desc,
          applicationCategory: 'UtilitiesApplication',
          operatingSystem: 'Any',
          url: `${SITE_ORIGIN}${toolPath}`,
        },
        bodyHtml: `
          <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Ripple99</a> / <a href="/tools/">Tools</a> / ${escapeHtml(t.h1)}</nav>
          <section class="hero-single">
            <span class="badge badge-cyan">Free Local-First Tool</span>
            <h1 style="margin-top:.5rem">${escapeHtml(t.h1)}</h1>
            <p style="color:#cbd5e1;margin:.6rem 0">${escapeHtml(t.desc)}</p>
            <ul style="color:#cbd5e1;font-size:.9rem;padding-left:1.25rem;margin:1rem 0">${t.bullets.map((b) => `<li style="margin-bottom:.35rem">${escapeHtml(b)}</li>`).join('')}</ul>
            <div class="cta-row">
              <a href="${escapeHtml(t.launchUrl)}" class="btn btn-primary">${escapeHtml(t.cta)}</a>
              <a href="/commander/" class="btn">Browse All ${commanders.length.toLocaleString()} Commanders</a>
            </div>
          </section>
        `,
      }),
    );
    coreSitemapUrls.push({
      loc: `${SITE_ORIGIN}${toolPath}`,
      lastmod,
      changefreq: 'weekly',
      priority: '0.85',
    });
  }

  // 4. Hub Index Pages (/commander/, /theme/, /budget/, /tools/) for <= 2-hop crawl depth
  const sortedCommandersForDir = [...commanders].sort(
    (a, b) =>
      (a.edhrecRank ?? 999_999) - (b.edhrecRank ?? 999_999) ||
      a.name.localeCompare(b.name),
  );
  writeHtmlPage(
    outDir,
    '/commander/',
    renderLayout({
      title: `All ${commanders.length.toLocaleString()} MTG Commanders — Ripple Synergy Directory | Ripple99`,
      description: `Browse Ripple Chain synergy guides and under-$5 Hidden Gems for all ${commanders.length.toLocaleString()} Commander-legal Magic legends.`,
      canonicalPath: '/commander/',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'MTG Commander Directory — Ripple99',
        url: `${SITE_ORIGIN}/commander/`,
      },
      bodyHtml: `
        <section class="hero-single">
          <h1>All ${commanders.length.toLocaleString()} Commander Synergy Guides</h1>
          <p style="color:#cbd5e1">Every Commander-legal legendary creature, vehicle, planeswalker, or background with deterministic Starters, Payoffs, and under-$5 Hidden Gems.</p>
          <div class="cta-row"><a href="/?tool=ripple" class="btn btn-primary">Search Commanders Live in App</a></div>
        </section>
        <div class="dir-grid">${sortedCommandersForDir
          .map((c) => {
            const slug = commanderSlugs.get(c.id)!;
            return `<a href="/commander/${escapeHtml(slug)}/" class="dir-link"><span>${escapeHtml(c.name)}</span><span class="badge">${c.colorIdentity.join('') || 'C'}</span></a>`;
          })
          .join('')}</div>
      `,
    }),
  );

  writeHtmlPage(
    outDir,
    '/theme/',
    renderLayout({
      title: '40 MTG Commander Mechanical Themes Directory | Ripple99',
      description: 'Explore top Commander cards and leaders across all 40 Ripple99 mechanical themes including Aristocrats, Landfall, Spellslinger, Blink, and Enchantress.',
      canonicalPath: '/theme/',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Commander Themes Directory — Ripple99',
        url: `${SITE_ORIGIN}/theme/`,
      },
      bodyHtml: `
        <section class="hero-single">
          <h1>Commander Mechanical Themes (${THEME_METADATA.length})</h1>
          <p style="color:#cbd5e1">Curated Starters, Payoffs, and synergistic Commanders for every major EDH mechanic.</p>
        </section>
        <div class="dir-grid">${THEME_METADATA.map((t) => {
          const slug = slugifyText(t.id);
          return `<a href="/theme/${escapeHtml(slug)}/" class="dir-link"><span>${escapeHtml(t.label)}</span><span class="badge badge-violet">${escapeHtml(t.category)}</span></a>`;
        }).join('')}</div>
      `,
    }),
  );

  writeHtmlPage(
    outDir,
    '/budget/',
    renderLayout({
      title: 'Under-$2 MTG Commander Budget Guides by Theme | Ripple99',
      description: 'Discover the strongest under-$2.00 Commander cards across 40 archetypes — built for budget brewers.',
      canonicalPath: '/budget/',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Under-$2 Commander Budget Guides — Ripple99',
        url: `${SITE_ORIGIN}/budget/`,
      },
      bodyHtml: `
        <section class="hero-single">
          <h1>Budget Commander Guides (&le; $2.00 USD)</h1>
          <p style="color:#cbd5e1">High-synergy Commander staples $2.00 or less across every archetype.</p>
          <div class="cta-row"><a href="/tools/budget-swaps/" class="btn btn-emerald">Try 1-Click Budget Swap Finder</a></div>
        </section>
        <div class="dir-grid">${THEME_METADATA.map((t) => {
          const slug = slugifyText(t.id);
          return `<a href="/budget/${escapeHtml(slug)}/" class="dir-link"><span>${escapeHtml(t.label)} &le; $2</span><span class="badge badge-emerald">Budget</span></a>`;
        }).join('')}</div>
      `,
    }),
  );

  writeHtmlPage(
    outDir,
    '/tools/',
    renderLayout({
      title: 'Free MTG Commander Deck Tools (Audit, Budget Swaps, Ripple & Partners) | Ripple99',
      description: 'Free local-first Commander deckbuilding utilities: Instant 99 Audit, 1-Click Budget Swap Finder, Ripple Chains Synergy, and Partner Finder.',
      canonicalPath: '/tools/',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Ripple99 Deckbuilding Tools',
        url: `${SITE_ORIGIN}/tools/`,
      },
      bodyHtml: `
        <section class="hero-single">
          <h1>Ripple99 Free Commander Tools</h1>
          <p style="color:#cbd5e1">Fast, ad-free, local-first Commander tools running entirely in your browser.</p>
        </section>
        <div class="dir-grid">${toolDefs
          .map(
            (t) =>
              `<a href="/tools/${escapeHtml(t.slug)}/" class="dir-link"><span>${escapeHtml(t.h1)}</span><span class="badge badge-cyan">Open</span></a>`,
          )
          .join('')}</div>
      `,
    }),
  );

  // 5. XML Sitemaps (`sitemap.xml` index + 3 child sitemaps)
  writeFileSync(
    path.join(outDir, 'sitemap-core.xml'),
    formatXmlSitemapUrlSet(coreSitemapUrls),
    'utf8',
  );
  writeFileSync(
    path.join(outDir, 'sitemap-themes.xml'),
    formatXmlSitemapUrlSet(themeSitemapUrls),
    'utf8',
  );
  writeFileSync(
    path.join(outDir, 'sitemap-commanders.xml'),
    formatXmlSitemapUrlSet(commanderSitemapUrls),
    'utf8',
  );
  const sitemapIndexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${SITE_ORIGIN}/sitemap-core.xml</loc><lastmod>${escapeHtml(lastmod)}</lastmod></sitemap>
  <sitemap><loc>${SITE_ORIGIN}/sitemap-themes.xml</loc><lastmod>${escapeHtml(lastmod)}</lastmod></sitemap>
  <sitemap><loc>${SITE_ORIGIN}/sitemap-commanders.xml</loc><lastmod>${escapeHtml(lastmod)}</lastmod></sitemap>
</sitemapindex>
`;
  writeFileSync(path.join(outDir, 'sitemap.xml'), sitemapIndexXml, 'utf8');

  const themeCount = THEME_METADATA.length;
  const stats: SeoBuildStats = {
    commanderPages: commanders.length,
    themePages: themeCount,
    budgetPages: themeCount,
    toolPages: toolDefs.length,
    hubPages: 4,
    sitemapFiles: 4,
    totalGeneratedFiles: commanders.length + themeCount * 2 + toolDefs.length + 4 + 4 + 1,
    elapsedMs: Math.round(performance.now() - startMs),
  };

  return stats;
}

export function loadCatalogForSeo(rootDir = process.cwd()): {
  cards: CompactCard[];
  manifest: DataManifest;
} {
  const cardsPath = path.join(rootDir, 'public', 'data', 'cards.min.json');
  const manifestPath = path.join(rootDir, 'public', 'data', 'manifest.json');
  if (!existsSync(cardsPath) || !existsSync(manifestPath)) {
    throw new Error('Missing public/data/cards.min.json or manifest.json for SEO generation.');
  }
  const rawCards = JSON.parse(readFileSync(cardsPath, 'utf8')) as SerializedCompactCard[];
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as DataManifest;
  return {
    cards: rawCards.map(hydrateCompactCard),
    manifest,
  };
}
