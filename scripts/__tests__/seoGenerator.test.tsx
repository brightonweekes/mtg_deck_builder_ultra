import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it } from 'vitest';
import { LegalFooter } from '../../src/components/LegalFooter.js';
import { THEME_METADATA } from '../../src/config/searchConfig.js';
import {
  hasAppLaunchIntent,
  parseAppLaunchIntent,
} from '../../src/search/deepLinkIntent.js';
import {
  assignCommanderSlugs,
  CLOUDFLARE_PAGES_FILE_LIMIT,
  escapeHtml,
  generateSeoPages,
  loadCatalogForSeo,
  safeJsonLd,
  SITE_ORIGIN,
  slugifyText,
} from '../lib/seo-builder.js';

describe('Stage 4 Programmatic SEO & Deep-Link System', () => {
  const tempDirs: string[] = [];

  afterAll(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses deep-link launch parameters cleanly and rejects invalid inputs', () => {
    expect(hasAppLaunchIntent(parseAppLaunchIntent(''))).toBe(false);

    const cmdIntent = parseAppLaunchIntent(
      '?commander=1234-uuid&mode=hidden-gems&budget=5',
    );
    expect(hasAppLaunchIntent(cmdIntent)).toBe(true);
    expect(cmdIntent).toEqual({
      commanderQuery: '1234-uuid',
      rippleMode: 'hidden-gems',
      themeInput: null,
      maxPriceUsd: 5,
      tool: null,
    });

    const themeIntent = parseAppLaunchIntent('?theme=aristocrats&budget=2');
    expect(themeIntent).toEqual({
      commanderQuery: null,
      rippleMode: null,
      themeInput: 'aristocrats',
      maxPriceUsd: 2,
      tool: null,
    });

    const swapIntent = parseAppLaunchIntent('?tool=budget-swaps&budget=-10');
    expect(swapIntent).toEqual({
      commanderQuery: null,
      rippleMode: null,
      themeInput: null,
      maxPriceUsd: null,
      tool: 'budget-swaps',
    });

    const badMode = parseAppLaunchIntent('?commander=Atraxa&mode=bogus&budget=notanumber');
    expect(badMode.rippleMode).toBeNull();
    expect(badMode.maxPriceUsd).toBeNull();
  });

  it('produces unique URL-safe slugs and escapes HTML and JSON-LD script breakouts', () => {
    const { cards } = loadCatalogForSeo(process.cwd());
    const commanders = cards.filter((c) => c.isCommanderEligible);
    const slugs = assignCommanderSlugs(commanders);
    expect(slugs.size).toBe(commanders.length);
    expect(new Set(slugs.values()).size).toBe(commanders.length);

    expect(slugifyText('Atraxa, Praetors\' Voice')).toBe('atraxa-praetors-voice');
    expect(slugifyText('Meren of Clan Nel Toth')).toBe('meren-of-clan-nel-toth');
    expect(slugifyText('Esika, God of the Tree // The Prismatic Bridge')).toBe(
      'esika-god-of-the-tree',
    );

    expect(escapeHtml('<script>alert("x")</script> & \'test\'')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;test&#39;',
    );
    expect(safeJsonLd({ name: '</script><script>evil()' })).not.toContain('</script>');
  });

  it('generates all Commander, Theme, Budget <= $2, Tool pages and XML sitemaps within Cloudflare limits', () => {
    const { cards, manifest } = loadCatalogForSeo(process.cwd());
    const outDir = mkdtempSync(path.join(tmpdir(), 'ripple99-seo-test-'));
    tempDirs.push(outDir);

    const stats = generateSeoPages({ cards, manifest, outDir });
    expect(stats.commanderPages).toBe(manifest.commanderCount);
    expect(stats.themePages).toBe(THEME_METADATA.length);
    expect(stats.budgetPages).toBe(THEME_METADATA.length);
    expect(stats.toolPages).toBe(4);
    expect(stats.hubPages).toBe(4);
    expect(stats.sitemapFiles).toBe(4);
    expect(stats.totalGeneratedFiles).toBeLessThan(CLOUDFLARE_PAGES_FILE_LIMIT / 2);

    // Check shared CSS & Meren Commander Page
    const cssPath = path.join(outDir, 'seo.css');
    expect(existsSync(cssPath)).toBe(true);
    expect(statSync(cssPath).size).toBeGreaterThan(500);

    const merenHtml = readFileSync(
      path.join(outDir, 'commander', 'meren-of-clan-nel-toth', 'index.html'),
      'utf8',
    );
    expect(merenHtml).toContain(
      `<link rel="canonical" href="${SITE_ORIGIN}/commander/meren-of-clan-nel-toth/" />`,
    );
    expect(merenHtml).toContain('Meren of Clan Nel Toth');
    expect(merenHtml).toContain('Starters (Enablers &amp; Fuel)');
    expect(merenHtml).toContain('Payoffs (Triggers, Multipliers &amp; Rewards)');
    expect(merenHtml).toContain('Hidden Gems (&le; $5.00 Sleepers)');
    expect(merenHtml).toContain('/?commander=');
    expect(merenHtml).toContain('property="og:image"');

    // Check Theme & Budget <= $2 Pages (zero Precon routes shipped right now)
    expect(existsSync(path.join(outDir, 'precon'))).toBe(false);
    const themeHtml = readFileSync(
      path.join(outDir, 'theme', 'aristocrats', 'index.html'),
      'utf8',
    );
    expect(themeHtml).toContain('/?theme=aristocrats');
    expect(themeHtml).toContain('/budget/aristocrats/');

    const budgetHtml = readFileSync(
      path.join(outDir, 'budget', 'aristocrats', 'index.html'),
      'utf8',
    );
    expect(budgetHtml).toContain('Budget Aristocrats Commander Cards (&le; $2.00)');
    expect(budgetHtml).toContain('/?theme=aristocrats&amp;budget=2');

    // Every price badge inside the Budget <= $2 card grid must be <= $2.00
    const priceMatches = Array.from(
      budgetHtml.matchAll(/<article class="card">[\s\S]*?<span class="badge badge-emerald">\$(\d+\.\d{2})<\/span>/g),
    );
    expect(priceMatches.length).toBeGreaterThan(0);
    for (const match of priceMatches) {
      expect(Number(match[1])).toBeLessThanOrEqual(2.0);
    }

    // Check Tools & Sitemaps
    const swapsToolHtml = readFileSync(
      path.join(outDir, 'tools', 'budget-swaps', 'index.html'),
      'utf8',
    );
    expect(swapsToolHtml).toContain('/?tool=budget-swaps');

    const sitemapIndex = readFileSync(path.join(outDir, 'sitemap.xml'), 'utf8');
    expect(sitemapIndex).toContain(`${SITE_ORIGIN}/sitemap-commanders.xml`);
    expect(sitemapIndex).toContain(`${SITE_ORIGIN}/sitemap-themes.xml`);
    expect(sitemapIndex).toContain(`${SITE_ORIGIN}/sitemap-core.xml`);

    const commandersXml = readFileSync(
      path.join(outDir, 'sitemap-commanders.xml'),
      'utf8',
    );
    const locCount = (commandersXml.match(/<loc>/g) ?? []).length;
    expect(locCount).toBe(stats.commanderPages);
  }, 30_000);

  it('configures robots.txt, sw.js path-scoped root shell cache, and footer SEO links safely', () => {
    const robots = readFileSync(
      path.resolve(process.cwd(), 'public', 'robots.txt'),
      'utf8',
    );
    expect(robots).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);

    const swSource = readFileSync(
      path.resolve(process.cwd(), 'public', 'sw.js'),
      'utf8',
    );
    expect(swSource).toContain("const isRootShell = url.pathname === '/' || url.pathname === '/index.html'");
    expect(swSource).toContain("await cache.put(isRootShell ? '/' : request, response.clone())");

    const footerHtml = renderToStaticMarkup(<LegalFooter />);
    expect(footerHtml).toContain('/commander/');
    expect(footerHtml).toContain('/theme/');
    expect(footerHtml).toContain('/budget/');
    expect(footerHtml).toContain('/tools/');
  });
});
