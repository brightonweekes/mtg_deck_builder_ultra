import { resolveManaSymbolAsset } from '../assets/mana/manaSymbolRegistry.js';
import { THEME_BY_ID } from '../config/searchConfig.js';
import { getCombinedColorIdentity } from '../search/commanderRules.js';
import type { FunctionalRole, ManaColor } from '../types/card.js';
import type { DeckDraft } from '../types/deck.js';
import { ROLE_TARGETS, type CmcBucket, type DeckAnalyticsReport } from './deckAnalytics.js';

export const SNAPSHOT_CANVAS_WIDTH = 1200;
export const SNAPSHOT_CANVAS_HEIGHT = 675;
export const SNAPSHOT_FOOTER_TEXT = 'Ripple99 — Build Decks, Not Piles · ripple99.pages.dev';

const MAX_FILENAME_SLUG_LEN = 64;
const GAUGE_ROLES: ReadonlyArray<{
  role: FunctionalRole | 'lands';
  shortLabel: 'Lands' | 'Ramp' | 'Draw' | 'Removal' | 'Wipes';
}> = [
  { role: 'lands', shortLabel: 'Lands' },
  { role: 'ramp', shortLabel: 'Ramp' },
  { role: 'draw', shortLabel: 'Draw' },
  { role: 'removal', shortLabel: 'Removal' },
  { role: 'wipe', shortLabel: 'Wipes' },
];

const ROLE_TARGET_BY_ID = new Map(ROLE_TARGETS.map((target) => [target.role, target]));

const FALLBACK_MANA_PALETTE: Readonly<Record<string, { bg: string; fg: string; ring: string }>> = {
  W: { bg: '#f8f6d8', fg: '#1e293b', ring: '#eab308' },
  U: { bg: '#0e68ab', fg: '#f8fafc', ring: '#38bdf8' },
  B: { bg: '#1e1b2e', fg: '#f1f5f9', ring: '#a855f7' },
  R: { bg: '#d3202a', fg: '#fef2f2', ring: '#fb7185' },
  G: { bg: '#00733e', fg: '#ecfdf5', ring: '#34d399' },
  C: { bg: '#64748b', fg: '#f8fafc', ring: '#94a3b8' },
};

export interface DeckSnapshotRoleGauge {
  role: FunctionalRole | 'lands';
  label: 'Lands' | 'Ramp' | 'Draw' | 'Removal' | 'Wipes';
  count: number;
  targetMin: number;
  targetMax: number;
  recommended: number;
  pct: number;
  status: 'deficit' | 'healthy' | 'surplus';
}

export interface DeckSnapshotLegalBadge {
  isLegal: boolean;
  label: string;
  tone: 'legal' | 'warning' | 'error';
}

export interface DeckSnapshotSummary {
  title: string;
  commanderNames: string[];
  commanderDisplay: string;
  colorIdentity: ManaColor[];
  totalCount: number;
  landCount: number;
  nonLandCount: number;
  legalBadge: DeckSnapshotLegalBadge;
  averageCmc: number;
  formattedAvgMv: string;
  totalPriceUsd: number;
  formattedPrice: string;
  cmcBuckets: CmcBucket[];
  roleGauges: DeckSnapshotRoleGauge[];
  topThemes: Array<{ id: string; label: string }>;
  filename: string;
  footerText: string;
}

/**
 * Computes total estimated USD price across Command Zone and Mainboard cards.
 */
export function calculateDeckPriceUsd(deck: DeckDraft): number {
  let total = 0;
  for (const cmd of deck.commanders) {
    if (cmd.priceUsd !== null) {
      total += cmd.priceUsd;
    }
  }
  for (const entry of Object.values(deck.mainboard)) {
    if (entry.quantity > 0 && entry.card.priceUsd !== null) {
      total += entry.card.priceUsd * entry.quantity;
    }
  }
  return Math.round(total * 100) / 100;
}

/**
 * Builds a sanitized, length-bounded `.png` filename prefixed with `ripple99-`.
 */
export function buildSnapshotFilename(deckName: string): string {
  const normalized = (typeof deckName === 'string' ? deckName : '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const bounded = normalized.slice(0, MAX_FILENAME_SLUG_LEN).replace(/-+$/g, '');
  const slug = bounded || 'commander-deck';
  return `ripple99-${slug}.png`;
}

function buildLegalBadge(analytics: DeckAnalyticsReport): DeckSnapshotLegalBadge {
  if (analytics.isCommanderLegal100) {
    return {
      isLegal: true,
      label: 'Commander Legal',
      tone: 'legal',
    };
  }
  if (analytics.totalCount > 100) {
    return {
      isLegal: false,
      label: `Over 100 (${analytics.totalCount}/100)`,
      tone: 'error',
    };
  }
  if (analytics.illegalColorCardIds.length > 0) {
    return {
      isLegal: false,
      label: 'Color Identity Error',
      tone: 'error',
    };
  }
  if (analytics.overCopyLimitCardIds.length > 0) {
    return {
      isLegal: false,
      label: 'Copy Limit Error',
      tone: 'error',
    };
  }
  if (analytics.commanderCount === 0) {
    return {
      isLegal: false,
      label: 'Needs Commander',
      tone: 'warning',
    };
  }
  return {
    isLegal: false,
    label: `Incomplete (${analytics.totalCount}/100)`,
    tone: 'warning',
  };
}

function resolveTopThemes(deck: DeckDraft, limit = 5): Array<{ id: string; label: string }> {
  const candidateIds: string[] = [];

  if (deck.synergyThemes && deck.synergyThemes.length > 0) {
    for (const rawId of deck.synergyThemes) {
      const trimmed = rawId.trim();
      if (trimmed && !candidateIds.includes(trimmed)) {
        candidateIds.push(trimmed);
      }
      if (candidateIds.length >= limit) break;
    }
  } else {
    const counts = new Map<string, number>();
    for (const cmd of deck.commanders) {
      for (const theme of cmd.themes) {
        counts.set(theme, (counts.get(theme) ?? 0) + 3);
      }
    }
    for (const entry of Object.values(deck.mainboard)) {
      if (entry.quantity <= 0) continue;
      for (const theme of entry.card.themes) {
        counts.set(theme, (counts.get(theme) ?? 0) + entry.quantity);
      }
    }
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit);
    for (const [themeId] of sorted) {
      candidateIds.push(themeId);
    }
  }

  return candidateIds.map((id) => ({
    id,
    label: THEME_BY_ID[id]?.label ?? id,
  }));
}

/**
 * Pure summary builder used by both the PNG canvas renderer and unit tests.
 */
export function buildDeckSnapshotSummary(
  deck: DeckDraft,
  analytics: DeckAnalyticsReport,
  totalDeckPriceUsd?: number,
): DeckSnapshotSummary {
  const title = deck.name.trim() || 'Untitled Commander Deck';
  const commanderNames = deck.commanders.map((c) => c.name);
  const commanderDisplay =
    commanderNames.length > 0 ? commanderNames.join(' + ') : 'No Commander Selected';
  const colorIdentity = getCombinedColorIdentity(deck.commanders);
  const priceUsd =
    typeof totalDeckPriceUsd === 'number' && Number.isFinite(totalDeckPriceUsd)
      ? Math.max(0, Math.round(totalDeckPriceUsd * 100) / 100)
      : calculateDeckPriceUsd(deck);

  const roleGauges: DeckSnapshotRoleGauge[] = GAUGE_ROLES.map(({ role, shortLabel }) => {
    const target = ROLE_TARGET_BY_ID.get(role) ?? {
      role,
      label: shortLabel,
      targetMin: 0,
      targetMax: 0,
      recommended: 1,
    };
    const count = analytics.roleCounts[role] ?? 0;
    const pct = Math.min(100, Math.round((count / Math.max(1, target.recommended)) * 100));
    const status: DeckSnapshotRoleGauge['status'] =
      count < target.targetMin ? 'deficit' : count > target.targetMax ? 'surplus' : 'healthy';

    return {
      role,
      label: shortLabel,
      count,
      targetMin: target.targetMin,
      targetMax: target.targetMax,
      recommended: target.recommended,
      pct,
      status,
    };
  });

  return {
    title,
    commanderNames,
    commanderDisplay,
    colorIdentity,
    totalCount: analytics.totalCount,
    landCount: analytics.landCount,
    nonLandCount: analytics.nonLandCount,
    legalBadge: buildLegalBadge(analytics),
    averageCmc: analytics.averageCmc,
    formattedAvgMv: analytics.averageCmc.toFixed(2),
    totalPriceUsd: priceUsd,
    formattedPrice: `$${priceUsd.toFixed(2)}`,
    cmcBuckets: analytics.cmcBuckets.map((b) => ({ ...b })),
    roleGauges,
    topThemes: resolveTopThemes(deck),
    filename: buildSnapshotFilename(deck.name),
    footerText: SNAPSHOT_FOOTER_TEXT,
  };
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function truncateTextToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) {
    end -= 1;
  }
  return `${text.slice(0, Math.max(1, end))}…`;
}

function loadSvgImage(src: string, timeoutMs = 800): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, timeoutMs);

    img.onload = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(img);
      }
    };
    img.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    };
    img.src = src;
  });
}

function drawFallbackManaCircle(
  ctx: CanvasRenderingContext2D,
  symbol: string,
  cx: number,
  cy: number,
  radius: number,
): void {
  const upper = symbol.trim().toUpperCase();
  const palette = FALLBACK_MANA_PALETTE[upper] ?? {
    bg: '#334155',
    fg: '#f8fafc',
    ring: '#64748b',
  };
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = palette.bg;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = palette.ring;
  ctx.stroke();
  ctx.fillStyle = palette.fg;
  ctx.font = `700 ${Math.round(radius * 1.05)}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(upper, cx, cy + 1);
  ctx.restore();
}

function drawRippleEmblem(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const cx = x + size / 2;
  const cy = y + size / 2;

  ctx.save();
  drawRoundedRectPath(ctx, x, y, size, size, 12);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.36, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.24, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const rOuter = size * 0.28;
  const rInner = size * 0.1;
  ctx.beginPath();
  ctx.moveTo(cx, cy - rOuter);
  ctx.lineTo(cx + rInner, cy - rInner);
  ctx.lineTo(cx + rOuter, cy);
  ctx.lineTo(cx + rInner, cy + rInner);
  ctx.lineTo(cx, cy + rOuter);
  ctx.lineTo(cx - rInner, cy + rInner);
  ctx.lineTo(cx - rOuter, cy);
  ctx.lineTo(cx - rInner, cy - rInner);
  ctx.closePath();
  ctx.fillStyle = '#f59e0b';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.05, 0, Math.PI * 2);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.restore();
}

/**
 * Renders a 1200x675 dark-slate Ripple99 Deck Snapshot onto an HTMLCanvasElement.
 */
export async function renderDeckSnapshotCanvas(
  deck: DeckDraft,
  analytics: DeckAnalyticsReport,
  totalDeckPriceUsd?: number,
  targetCanvas?: HTMLCanvasElement,
): Promise<{ canvas: HTMLCanvasElement; summary: DeckSnapshotSummary }> {
  if (typeof document === 'undefined' && !targetCanvas) {
    throw new Error('Canvas rendering requires a browser DOM environment.');
  }

  const canvas = targetCanvas ?? document.createElement('canvas');
  canvas.width = SNAPSHOT_CANVAS_WIDTH;
  canvas.height = SNAPSHOT_CANVAS_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not acquire 2D canvas rendering context.');
  }

  const summary = buildDeckSnapshotSummary(deck, analytics, totalDeckPriceUsd);
  const identityTokens: string[] =
    summary.colorIdentity.length > 0
      ? summary.colorIdentity
      : deck.commanders.length > 0
        ? ['C']
        : [];

  const loadedManaAssets = await Promise.all(
    identityTokens.map(async (token) => {
      const asset = resolveManaSymbolAsset(token);
      if (asset.kind === 'svg-img') {
        const img = await loadSvgImage(asset.src);
        return { token, img };
      }
      return { token, img: null };
    }),
  );

  // 1. Dark Slate Background + Subtle Ripple Accents
  const bgGrad = ctx.createLinearGradient(0, 0, SNAPSHOT_CANVAS_WIDTH, SNAPSHOT_CANVAS_HEIGHT);
  bgGrad.addColorStop(0, '#020617');
  bgGrad.addColorStop(0.55, '#0b1224');
  bgGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, SNAPSHOT_CANVAS_WIDTH, SNAPSHOT_CANVAS_HEIGHT);

  const glowAmber = ctx.createRadialGradient(180, 120, 20, 180, 120, 420);
  glowAmber.addColorStop(0, 'rgba(245, 158, 11, 0.14)');
  glowAmber.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.fillStyle = glowAmber;
  ctx.fillRect(0, 0, SNAPSHOT_CANVAS_WIDTH, SNAPSHOT_CANVAS_HEIGHT);

  const glowViolet = ctx.createRadialGradient(1040, 560, 20, 1040, 560, 460);
  glowViolet.addColorStop(0, 'rgba(139, 92, 246, 0.14)');
  glowViolet.addColorStop(1, 'rgba(139, 92, 246, 0)');
  ctx.fillStyle = glowViolet;
  ctx.fillRect(0, 0, SNAPSHOT_CANVAS_WIDTH, SNAPSHOT_CANVAS_HEIGHT);

  // Decorative background ripple arcs
  ctx.save();
  for (const radius of [140, 220, 300]) {
    ctx.beginPath();
    ctx.arc(1100, 110, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.06)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();

  // Outer card frame
  drawRoundedRectPath(ctx, 24, 24, SNAPSHOT_CANVAS_WIDTH - 48, SNAPSHOT_CANVAS_HEIGHT - 48, 22);
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.9)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Top amber accent bar
  ctx.save();
  drawRoundedRectPath(ctx, 24, 24, SNAPSHOT_CANVAS_WIDTH - 48, 5, 3);
  ctx.fillStyle = '#f59e0b';
  ctx.fill();
  ctx.restore();

  // 2. Header: Ripple99 Emblem, Deck Title, Commander(s), Mana Color Identity
  drawRippleEmblem(ctx, 56, 56, 56);

  ctx.fillStyle = '#fbbf24';
  ctx.font = '700 13px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('RIPPLE99 COMMANDER SNAPSHOT', 128, 56);

  const badgeReserve = loadedManaAssets.length * 46 + 60;
  const maxTitleWidth = SNAPSHOT_CANVAS_WIDTH - 128 - badgeReserve - 40;
  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 32px Inter, system-ui, sans-serif';
  ctx.fillText(truncateTextToWidth(ctx, summary.title, maxTitleWidth), 128, 76);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 17px Inter, system-ui, sans-serif';
  const cmdLine =
    summary.commanderNames.length > 0
      ? `Commander: ${summary.commanderDisplay}`
      : 'No Commander Selected';
  ctx.fillText(truncateTextToWidth(ctx, cmdLine, maxTitleWidth), 128, 118);

  // Mana identity SVGs on top right
  const badgeSize = 36;
  const badgeGap = 10;
  const rightEdge = SNAPSHOT_CANVAS_WIDTH - 56;
  loadedManaAssets.forEach(({ token, img }, idx) => {
    const reverseIdx = loadedManaAssets.length - 1 - idx;
    const x = rightEdge - badgeSize - reverseIdx * (badgeSize + badgeGap);
    const y = 70;
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + badgeSize / 2, y + badgeSize / 2, badgeSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, x, y, badgeSize, badgeSize);
      ctx.restore();
    } else {
      drawFallbackManaCircle(ctx, token, x + badgeSize / 2, y + badgeSize / 2, badgeSize / 2);
    }
  });

  // 3. Stat Pills Row
  const badgeToneColors =
    summary.legalBadge.tone === 'legal'
      ? { bg: 'rgba(16, 185, 129, 0.18)', border: 'rgba(16, 185, 129, 0.5)', fg: '#a7f3d0' }
      : summary.legalBadge.tone === 'error'
        ? { bg: 'rgba(244, 63, 94, 0.18)', border: 'rgba(244, 63, 94, 0.5)', fg: '#fecdd3' }
        : { bg: 'rgba(245, 158, 11, 0.18)', border: 'rgba(245, 158, 11, 0.5)', fg: '#fde68a' };

  const statPills = [
    {
      label: summary.legalBadge.label,
      bg: badgeToneColors.bg,
      border: badgeToneColors.border,
      fg: badgeToneColors.fg,
    },
    {
      label: `${summary.totalCount} / 100 Cards`,
      bg: '#0f172a',
      border: '#334155',
      fg: '#e2e8f0',
    },
    {
      label: `Avg MV ${summary.formattedAvgMv}`,
      bg: '#0f172a',
      border: '#334155',
      fg: '#e2e8f0',
    },
    {
      label: `Est. ${summary.formattedPrice}`,
      bg: '#0f172a',
      border: '#334155',
      fg: '#e2e8f0',
    },
    {
      label: `${summary.landCount} Lands`,
      bg: '#0f172a',
      border: '#334155',
      fg: '#cbd5e1',
    },
  ];

  let pillX = 56;
  const pillY = 160;
  ctx.font = '700 14px Inter, system-ui, sans-serif';
  for (const pill of statPills) {
    const textW = ctx.measureText(pill.label).width;
    const pillW = textW + 28;
    drawRoundedRectPath(ctx, pillX, pillY, pillW, 34, 10);
    ctx.fillStyle = pill.bg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = pill.border;
    ctx.stroke();

    ctx.fillStyle = pill.fg;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(pill.label, pillX + 14, pillY + 17);
    pillX += pillW + 12;
  }

  // 4. Main Panels: Left = Mana Curve, Right = Role Targets
  const panelY = 216;
  const panelH = 324;
  const leftPanelX = 56;
  const leftPanelW = 544;
  const rightPanelX = 620;
  const rightPanelW = 524;

  // Left Panel: Mana Curve
  drawRoundedRectPath(ctx, leftPanelX, panelY, leftPanelW, panelH, 16);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#1e293b';
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 16px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`MANA CURVE (${summary.nonLandCount} SPELLS)`, leftPanelX + 24, panelY + 20);

  // Legend
  ctx.font = '600 12px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(leftPanelX + leftPanelW - 196, panelY + 24, 10, 10);
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('Creatures', leftPanelX + leftPanelW - 180, panelY + 22);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(leftPanelX + leftPanelW - 104, panelY + 24, 10, 10);
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('Spells', leftPanelX + leftPanelW - 88, panelY + 22);

  const maxBucket = Math.max(1, ...summary.cmcBuckets.map((b) => b.total));
  const chartBaseY = panelY + panelH - 52;
  const maxBarH = 190;
  const barSlotW = (leftPanelW - 56) / summary.cmcBuckets.length;
  const barW = Math.min(44, barSlotW - 14);

  summary.cmcBuckets.forEach((bucket, idx) => {
    const slotCenterX = leftPanelX + 28 + idx * barSlotW + barSlotW / 2;
    const barX = slotCenterX - barW / 2;

    // Bar track
    drawRoundedRectPath(ctx, barX, chartBaseY - maxBarH, barW, maxBarH, 6);
    ctx.fillStyle = 'rgba(2, 6, 23, 0.75)';
    ctx.fill();

    if (bucket.total > 0) {
      const totalH = Math.max(10, Math.round((bucket.total / maxBucket) * maxBarH));
      const creatureH = Math.round((bucket.creatures / bucket.total) * totalH);
      const nonCreatureH = totalH - creatureH;

      if (nonCreatureH > 0) {
        drawRoundedRectPath(
          ctx,
          barX,
          chartBaseY - totalH,
          barW,
          nonCreatureH + (creatureH > 0 ? 4 : 0),
          5,
        );
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
      }
      if (creatureH > 0) {
        drawRoundedRectPath(ctx, barX, chartBaseY - creatureH, barW, creatureH, 5);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
      }

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '700 13px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(String(bucket.total), slotCenterX, chartBaseY - totalH - 6);
    }

    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(bucket.label, slotCenterX, chartBaseY + 10);
  });

  // Right Panel: Role Gauges
  drawRoundedRectPath(ctx, rightPanelX, panelY, rightPanelW, panelH, 16);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#1e293b';
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 16px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('COMMANDER ROLE TARGETS', rightPanelX + 24, panelY + 20);

  summary.roleGauges.forEach((gauge, idx) => {
    const rowY = panelY + 62 + idx * 50;
    const barTrackX = rightPanelX + 24;
    const barTrackW = rightPanelW - 48;

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 14px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(gauge.label, barTrackX, rowY);

    ctx.fillStyle =
      gauge.status === 'healthy'
        ? '#6ee7b7'
        : gauge.status === 'surplus'
          ? '#7dd3fc'
          : '#fcd34d';
    ctx.font = '700 13px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${gauge.count} / ${gauge.recommended}`, barTrackX + barTrackW, rowY + 1);

    drawRoundedRectPath(ctx, barTrackX, rowY + 22, barTrackW, 12, 6);
    ctx.fillStyle = '#020617';
    ctx.fill();

    if (gauge.pct > 0) {
      const fillW = Math.max(12, Math.round((gauge.pct / 100) * barTrackW));
      drawRoundedRectPath(ctx, barTrackX, rowY + 22, fillW, 12, 6);
      ctx.fillStyle =
        gauge.status === 'healthy'
          ? '#10b981'
          : gauge.status === 'surplus'
            ? '#38bdf8'
            : '#f59e0b';
      ctx.fill();
    }
  });

  // 5. Mechanical Themes Strip
  const themesY = 560;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  if (summary.topThemes.length > 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 12px Inter, system-ui, sans-serif';
    ctx.fillText('THEMES', 56, themesY + 15);

    let tx = 124;
    ctx.font = '600 13px Inter, system-ui, sans-serif';
    for (const theme of summary.topThemes) {
      const labelW = ctx.measureText(theme.label).width;
      const chipW = labelW + 24;
      if (tx + chipW > SNAPSHOT_CANVAS_WIDTH - 56) break;

      drawRoundedRectPath(ctx, tx, themesY, chipW, 30, 8);
      ctx.fillStyle = 'rgba(139, 92, 246, 0.16)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(167, 139, 250, 0.45)';
      ctx.stroke();

      ctx.fillStyle = '#ede9fe';
      ctx.fillText(theme.label, tx + 12, themesY + 15);
      tx += chipW + 10;
    }
  } else {
    ctx.fillStyle = '#64748b';
    ctx.font = '500 13px Inter, system-ui, sans-serif';
    ctx.fillText('Add cards or choose a Commander to highlight deck synergies.', 56, themesY + 15);
  }

  // 6. Footer Bar
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 13px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(summary.footerText, 56, 624);

  ctx.fillStyle = '#64748b';
  ctx.font = '500 12px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('100% Free · Local-First · Ad-Free', SNAPSHOT_CANVAS_WIDTH - 56, 624);

  return { canvas, summary };
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } else {
      resolve(null);
    }
  });
}

/**
 * Renders the Ripple99 Deck Snapshot PNG and triggers a browser file download.
 */
export async function downloadDeckSnapshotPng(
  deck: DeckDraft,
  analytics: DeckAnalyticsReport,
  totalDeckPriceUsd?: number,
): Promise<DeckSnapshotSummary> {
  const { canvas, summary } = await renderDeckSnapshotCanvas(deck, analytics, totalDeckPriceUsd);
  const blob = await canvasToPngBlob(canvas);

  const a = document.createElement('a');
  a.download = summary.filename;

  if (blob && typeof URL.createObjectURL === 'function') {
    const objectUrl = URL.createObjectURL(blob);
    a.href = objectUrl;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } else {
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  return summary;
}
