import { describe, expect, it, vi } from 'vitest';
import { computeDeckAnalytics } from '../deck/deckAnalytics.js';
import {
  buildDeckSnapshotSummary,
  buildDefaultSnapshotShareUrl,
  buildSnapshotFilename,
  calculateDeckPriceUsd,
  DEFAULT_SNAPSHOT_ORIGIN,
  renderDeckSnapshotCanvas,
  SNAPSHOT_CANVAS_HEIGHT,
  SNAPSHOT_CANVAS_WIDTH,
  SNAPSHOT_FOOTER_TEXT,
  SNAPSHOT_QR_BADGE_SIZE,
  SNAPSHOT_QR_BADGE_X,
  SNAPSHOT_QR_BADGE_Y,
} from '../deck/deckCardExporter.js';
import { decodeDeckFromUrlParam } from '../deck/urlCodec.js';
import type { CompactCard, FunctionalRole, ManaColor } from '../types/card.js';
import type { DeckCardEntry, DeckDraft } from '../types/deck.js';

function makeCard(
  overrides: Partial<CompactCard> & { id: string; name: string },
): CompactCard {
  return {
    oracleId: `oracle-${overrides.id}`,
    manaCost: '{2}',
    cmc: 2,
    typeLine: 'Artifact',
    oracleText: '',
    colors: [],
    colorIdentity: [],
    keywords: [],
    edhrecRank: 100,
    priceUsd: 1.5,
    imageNormal: '',
    imageSmall: '',
    layout: 'normal',
    isCommanderEligible: false,
    roles: [],
    themes: [],
    ...overrides,
  };
}

function makeDeck(overrides: Partial<DeckDraft> = {}): DeckDraft {
  return {
    id: 'deck-test-1',
    name: 'Test Commander Deck',
    commanders: [],
    mainboard: {},
    sideboard: {},
    lockSearchToCommanderIdentity: true,
    createdAt: '2026-11-15T00:00:00.000Z',
    updatedAt: '2026-11-15T00:00:00.000Z',
    ...overrides,
  };
}

function createFakeCanvas2D() {
  const fillTextCalls: string[] = [];
  const gradientStub = { addColorStop: vi.fn() };
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    clip: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => gradientStub),
    createRadialGradient: vi.fn(() => gradientStub),
    measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
    fillText: vi.fn((text: string) => {
      fillTextCalls.push(text);
    }),
  };

  const fakeCanvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
  } as unknown as HTMLCanvasElement;

  return { fakeCanvas, ctx, fillTextCalls };
}

describe('deckCardExporter', () => {
  it('builds a clean summary for an empty deck', () => {
    const emptyDeck = makeDeck({ name: '' });
    const analytics = computeDeckAnalytics(emptyDeck);
    const summary = buildDeckSnapshotSummary(emptyDeck, analytics, 0);

    expect(summary.title).toBe('Untitled Commander Deck');
    expect(summary.commanderNames).toEqual([]);
    expect(summary.commanderDisplay).toBe('No Commander Selected');
    expect(summary.colorIdentity).toEqual([]);
    expect(summary.totalCount).toBe(0);
    expect(summary.legalBadge).toEqual({
      isLegal: false,
      label: 'Needs Commander',
      tone: 'warning',
    });
    expect(summary.formattedAvgMv).toBe('0.00');
    expect(summary.formattedPrice).toBe('$0.00');
    expect(summary.cmcBuckets).toHaveLength(8);
    expect(summary.cmcBuckets.every((b) => b.total === 0)).toBe(true);
    expect(summary.roleGauges.map((g) => g.label)).toEqual([
      'Lands',
      'Ramp',
      'Draw',
      'Removal',
      'Wipes',
    ]);
    expect(summary.roleGauges.every((g) => g.count === 0 && g.status === 'deficit')).toBe(true);
    expect(summary.topThemes).toEqual([]);
    expect(summary.filename).toBe('ripple99-commander-deck.png');
    expect(summary.footerText).toBe(SNAPSHOT_FOOTER_TEXT);
  });

  it('supports partner commanders, WUBRG color identity order, and THEME_BY_ID label mapping', () => {
    const thrasios = makeCard({
      id: 'cmd-thrasios',
      name: 'Thrasios, Triton Hero',
      manaCost: '{G}{U}',
      cmc: 2,
      typeLine: 'Legendary Creature — Merfolk Wizard',
      colors: ['G', 'U'],
      colorIdentity: ['G', 'U'],
      isCommanderEligible: true,
      partnerType: 'partner',
      themes: ['ramp', 'lands-matter'],
      priceUsd: 18.25,
    });
    const tymna = makeCard({
      id: 'cmd-tymna',
      name: 'Tymna the Weaver',
      manaCost: '{1}{W}{B}',
      cmc: 3,
      typeLine: 'Legendary Creature — Human Cleric',
      colors: ['W', 'B'],
      colorIdentity: ['W', 'B'],
      isCommanderEligible: true,
      partnerType: 'partner',
      themes: ['draw-payoff', 'combat-damage-trigger'],
      priceUsd: 31.75,
    });
    const rhystic = makeCard({
      id: 'card-rhystic',
      name: 'Rhystic Study',
      manaCost: '{2}{U}',
      cmc: 3,
      typeLine: 'Enchantment',
      colors: ['U'],
      colorIdentity: ['U'],
      roles: ['draw'],
      themes: ['draw-payoff'],
      priceUsd: 40.0,
    });

    const deck = makeDeck({
      name: 'TnT Midrange Value',
      commanders: [thrasios, tymna],
      mainboard: {
        [rhystic.id]: { card: rhystic, quantity: 1 },
      },
      synergyThemes: ['plus-one-counters', 'draw-payoff', 'lands-matter'],
    });

    const analytics = computeDeckAnalytics(deck);
    const summary = buildDeckSnapshotSummary(deck, analytics);

    expect(summary.commanderNames).toEqual(['Thrasios, Triton Hero', 'Tymna the Weaver']);
    expect(summary.commanderDisplay).toBe('Thrasios, Triton Hero + Tymna the Weaver');
    expect(summary.colorIdentity).toEqual(['W', 'U', 'B', 'G']);
    expect(summary.totalPriceUsd).toBe(90);
    expect(summary.formattedPrice).toBe('$90.00');
    expect(summary.topThemes).toEqual([
      { id: 'plus-one-counters', label: '+1/+1 Counters' },
      { id: 'draw-payoff', label: 'Draw Payoff' },
      { id: 'lands-matter', label: 'Lands Matter' },
    ]);
    expect(summary.filename).toBe('ripple99-tnt-midrange-value.png');
  });

  it('flags legal 100-card decks, over-100 decks, and off-color / copy-limit illegal decks', () => {
    const cmd = makeCard({
      id: 'cmd-krenko',
      name: 'Krenko, Mob Boss',
      manaCost: '{2}{R}{R}',
      cmc: 4,
      typeLine: 'Legendary Creature — Goblin Warrior',
      colors: ['R'],
      colorIdentity: ['R'],
      isCommanderEligible: true,
      themes: ['tokens'],
    });
    const mountain = makeCard({
      id: 'basic-mountain',
      name: 'Mountain',
      manaCost: '',
      cmc: 0,
      typeLine: 'Basic Land — Mountain',
      colorIdentity: ['R'],
      maxCopies: null,
    });

    const buildCards = (count: number, extra: Record<string, DeckCardEntry> = {}): DeckDraft => {
      const mainboard: Record<string, DeckCardEntry> = {
        [mountain.id]: { card: mountain, quantity: 36 },
        ...extra,
      };
      let current = 36 + Object.values(extra).reduce((sum, e) => sum + e.quantity, 0);
      let idx = 0;
      while (current < count) {
        idx += 1;
        const roles: FunctionalRole[] =
          idx <= 10 ? ['ramp'] : idx <= 20 ? ['draw'] : idx <= 28 ? ['removal'] : idx <= 31 ? ['wipe'] : [];
        const card = makeCard({
          id: `goblin-${idx}`,
          name: `Goblin Raider ${idx}`,
          manaCost: '{1}{R}',
          cmc: 2,
          typeLine: 'Creature — Goblin',
          colors: ['R'],
          colorIdentity: ['R'],
          roles,
        });
        mainboard[card.id] = { card, quantity: 1 };
        current += 1;
      }
      return makeDeck({
        name: 'Krenko Legal 100',
        commanders: [cmd],
        mainboard,
      });
    };

    const legalDeck = buildCards(99);
    const legalSummary = buildDeckSnapshotSummary(legalDeck, computeDeckAnalytics(legalDeck), 125.5);
    expect(legalSummary.totalCount).toBe(100);
    expect(legalSummary.legalBadge).toEqual({
      isLegal: true,
      label: 'Commander Legal',
      tone: 'legal',
    });
    expect(legalSummary.roleGauges.every((g) => g.status === 'healthy')).toBe(true);

    const overDeck = buildCards(103);
    const overSummary = buildDeckSnapshotSummary(overDeck, computeDeckAnalytics(overDeck), 130);
    expect(overSummary.totalCount).toBe(104);
    expect(overSummary.legalBadge).toEqual({
      isLegal: false,
      label: 'Over 100 (104/100)',
      tone: 'error',
    });

    const offColorCard = makeCard({
      id: 'off-color-counterspell',
      name: 'Counterspell',
      manaCost: '{U}{U}',
      cmc: 2,
      typeLine: 'Instant',
      colors: ['U'],
      colorIdentity: ['U'],
      roles: ['removal'],
    });
    const offColorDeck = buildCards(99, {
      [offColorCard.id]: { card: offColorCard, quantity: 1 },
    });
    const offColorSummary = buildDeckSnapshotSummary(offColorDeck, computeDeckAnalytics(offColorDeck));
    expect(offColorSummary.legalBadge).toEqual({
      isLegal: false,
      label: 'Color Identity Error',
      tone: 'error',
    });
  });

  it('sanitizes long, accented, and punctuation-heavy deck names into safe .png filenames', () => {
    expect(buildSnapshotFilename("Atraxa's +1/+1 Superfriends!! 🚀🔥")).toBe(
      'ripple99-atraxa-s-1-1-superfriends.png',
    );
    expect(buildSnapshotFilename('Café Brûlée — Esper Control')).toBe(
      'ripple99-cafe-brulee-esper-control.png',
    );
    expect(buildSnapshotFilename('   🚀🔥✨   ')).toBe('ripple99-commander-deck.png');

    const longTitle = `${'very-long-commander-deck-name-'.repeat(5)}end`;
    const filename = buildSnapshotFilename(longTitle);
    expect(filename.startsWith('ripple99-')).toBe(true);
    expect(filename.endsWith('.png')).toBe(true);
    expect(filename).not.toMatch(/-\.png$/);
    expect(filename.length).toBeLessThanOrEqual('ripple99-'.length + 64 + '.png'.length);
  });

  it('calculates deck USD price excluding sideboard and null card prices', () => {
    const cmd = makeCard({ id: 'c1', name: 'Cmd', priceUsd: 10.25, isCommanderEligible: true });
    const sol = makeCard({ id: 'm1', name: 'Sol Ring', priceUsd: 2.1 });
    const free = makeCard({ id: 'm2', name: 'Token Card', priceUsd: null });
    const sb = makeCard({ id: 's1', name: 'Expensive Bench', priceUsd: 99.99 });

    const deck = makeDeck({
      commanders: [cmd],
      mainboard: {
        [sol.id]: { card: sol, quantity: 2 },
        [free.id]: { card: free, quantity: 3 },
      },
      sideboard: {
        [sb.id]: { card: sb, quantity: 1 },
      },
    });

    expect(calculateDeckPriceUsd(deck)).toBe(14.45);
  });

  it('renders a 1200x675 canvas with mana circle fallback when SVG Image loading is unavailable', async () => {
    const cmd = makeCard({
      id: 'cmd-1',
      name: 'Veyran, Voice of Duality',
      manaCost: '{1}{U}{R}',
      cmc: 3,
      typeLine: 'Legendary Creature — Efreet Wizard',
      colors: ['U', 'R'] as ManaColor[],
      colorIdentity: ['U', 'R'] as ManaColor[],
      isCommanderEligible: true,
      themes: ['magecraft', 'spellslinger'],
    });
    const bolt = makeCard({
      id: 'bolt',
      name: 'Lightning Bolt',
      manaCost: '{R}',
      cmc: 1,
      typeLine: 'Instant',
      colors: ['R'],
      colorIdentity: ['R'],
      roles: ['removal'],
    });

    const deck = makeDeck({
      name: 'Veyran Spellslinger',
      commanders: [cmd],
      mainboard: { [bolt.id]: { card: bolt, quantity: 1 } },
    });
    const analytics = computeDeckAnalytics(deck);
    const { fakeCanvas, ctx, fillTextCalls } = createFakeCanvas2D();

    const result = await renderDeckSnapshotCanvas(deck, analytics, 12.34, fakeCanvas);
    expect(result.canvas.width).toBe(SNAPSHOT_CANVAS_WIDTH);
    expect(result.canvas.height).toBe(SNAPSHOT_CANVAS_HEIGHT);
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(fillTextCalls).toContain('Veyran Spellslinger');
    expect(fillTextCalls).toContain(SNAPSHOT_FOOTER_TEXT);
    // Fallback color circles drew 'U' and 'R' cleanly without Image global
    expect(fillTextCalls).toContain('U');
    expect(fillTextCalls).toContain('R');
    expect(result.summary.qr.included).toBe(true);
    expect(result.summary.qr.version).toBeGreaterThanOrEqual(1);
  });

  it('builds default snapshot share URLs and embeds scannable integer-scaled QR badges with 100-card fallback', async () => {
    const assertBadgeQrGeometry = (
      fillRectCalls: unknown[][],
      expectedModulePx: number,
    ) => {
      const qrRects = fillRectCalls
        .map((call) => call as [number, number, number, number])
        .filter(
          ([x, y, w, h]) =>
            x >= SNAPSHOT_QR_BADGE_X &&
            y >= SNAPSHOT_QR_BADGE_Y &&
            x + w <= SNAPSHOT_QR_BADGE_X + SNAPSHOT_QR_BADGE_SIZE &&
            y + h <= SNAPSHOT_QR_BADGE_Y + SNAPSHOT_QR_BADGE_SIZE,
        );

      expect(qrRects.length).toBeGreaterThan(20);
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxRight = Number.NEGATIVE_INFINITY;
      let maxBottom = Number.NEGATIVE_INFINITY;

      for (const [x, y, w, h] of qrRects) {
        expect(Number.isInteger(x)).toBe(true);
        expect(Number.isInteger(y)).toBe(true);
        expect(Number.isInteger(w)).toBe(true);
        expect(Number.isInteger(h)).toBe(true);
        expect(h).toBe(expectedModulePx);
        expect(expectedModulePx).toBeGreaterThanOrEqual(2);
        expect(w % expectedModulePx).toBe(0);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxRight = Math.max(maxRight, x + w);
        maxBottom = Math.max(maxBottom, y + h);
      }

      const requiredQuietPx = expectedModulePx * 4;
      expect(minX - SNAPSHOT_QR_BADGE_X).toBeGreaterThanOrEqual(requiredQuietPx);
      expect(SNAPSHOT_QR_BADGE_X + SNAPSHOT_QR_BADGE_SIZE - maxRight).toBeGreaterThanOrEqual(
        requiredQuietPx,
      );
      expect(minY - SNAPSHOT_QR_BADGE_Y).toBeGreaterThanOrEqual(requiredQuietPx);
      expect(SNAPSHOT_QR_BADGE_Y + SNAPSHOT_QR_BADGE_SIZE - maxBottom).toBeGreaterThanOrEqual(
        requiredQuietPx,
      );
    };

    const cmd = makeCard({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Atraxa, Praetors Voice',
      isCommanderEligible: true,
      colorIdentity: ['W', 'U', 'B', 'G'],
    });
    const solRing = makeCard({
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Sol Ring',
    });
    const smallDeck = makeDeck({
      name: 'Atraxa QR Test',
      commanders: [cmd],
      mainboard: { [solRing.id]: { card: solRing, quantity: 1 } },
    });
    const smallAnalytics = computeDeckAnalytics(smallDeck);

    const defaultSmallUrl = buildDefaultSnapshotShareUrl(smallDeck);
    expect(defaultSmallUrl.startsWith('https://ripple99.pages.dev/?d=')).toBe(true);
    const param = defaultSmallUrl.split('?d=')[1]!;
    expect(decodeDeckFromUrlParam(param)?.name).toBe('Atraxa QR Test');

    // Small 2-card UUID ?d= deck (104 bytes) fits inside 100x100 badge at V6-M, 2 px/module
    const smallSummary = buildDeckSnapshotSummary(smallDeck, smallAnalytics, 25);
    expect(smallSummary.qr).toEqual({
      shareUrl: defaultSmallUrl,
      included: true,
      isFallback: false,
      label: 'Scan to Open',
      modulePx: 2,
      version: 6,
      size: 41,
      ecLevel: 'M',
    });

    // 120-byte URL overflows V6-M (106 B) -> drops to V6-L (134 B) to stay scannable at 2 px/module
    const mediumCustomUrl = `https://ripple99.pages.dev/?deck=${'x'.repeat(88)}`; // 118 bytes
    const mediumSummary = buildDeckSnapshotSummary(smallDeck, smallAnalytics, 25, {
      shareUrl: mediumCustomUrl,
    });
    expect(mediumSummary.qr).toEqual({
      shareUrl: mediumCustomUrl,
      included: true,
      isFallback: false,
      label: 'Scan to Open',
      modulePx: 2,
      version: 6,
      size: 41,
      ecLevel: 'L',
    });

    // Short ?deck= cloud link uses Medium EC, integer module scaling, and "Scan to Open"
    const cloudCanvas = createFakeCanvas2D();
    const cloudResult = await renderDeckSnapshotCanvas(
      smallDeck,
      smallAnalytics,
      25,
      cloudCanvas.fakeCanvas,
      { shareUrl: 'https://ripple99.pages.dev/?deck=abc' },
    );
    expect(cloudResult.summary.qr).toEqual({
      shareUrl: 'https://ripple99.pages.dev/?deck=abc',
      included: true,
      isFallback: false,
      label: 'Scan to Open',
      modulePx: 2,
      version: 3,
      size: 29,
      ecLevel: 'M',
    });
    expect(cloudCanvas.fillTextCalls).toContain('Scan to Open');
    assertBadgeQrGeometry(cloudCanvas.ctx.fillRect.mock.calls, 2);

    // Realistic 100-card offline ?d= deck (1 commander + 65 unique UUIDs + 34 Forest)
    // is too dense for >=2 px/module + >=4-module quiet zone -> falls back cleanly to Ripple99 URL
    const fullMainboard: Record<string, DeckCardEntry> = {};
    const forest = makeCard({
      id: '33333333-3333-4333-8333-000000000099',
      name: 'Forest',
      manaCost: '',
      cmc: 0,
      typeLine: 'Basic Land — Forest',
      colorIdentity: ['G'],
      maxCopies: null,
    });
    fullMainboard[forest.id] = { card: forest, quantity: 34 };
    for (let i = 1; i <= 65; i++) {
      const hexIdx = i.toString(16).padStart(12, '0');
      const card = makeCard({
        id: `44444444-4444-4444-8444-${hexIdx}`,
        name: `Test Spell ${i}`,
        colorIdentity: ['G'],
      });
      fullMainboard[card.id] = { card, quantity: 1 };
    }
    const hundredCardDeck = makeDeck({
      name: 'Realistic 100-Card Commander Brew',
      commanders: [cmd],
      mainboard: fullMainboard,
    });
    const hundredAnalytics = computeDeckAnalytics(hundredCardDeck);
    expect(hundredAnalytics.totalCount).toBe(100);
    expect(buildDefaultSnapshotShareUrl(hundredCardDeck).length).toBeGreaterThan(1400);

    const hundredCanvas = createFakeCanvas2D();
    const hundredResult = await renderDeckSnapshotCanvas(
      hundredCardDeck,
      hundredAnalytics,
      150,
      hundredCanvas.fakeCanvas,
    );
    expect(hundredResult.summary.qr).toEqual({
      shareUrl: DEFAULT_SNAPSHOT_ORIGIN,
      included: true,
      isFallback: true,
      label: 'Scan for Ripple99',
      modulePx: 3,
      version: 2,
      size: 25,
      ecLevel: 'M',
    });
    expect(hundredCanvas.fillTextCalls).toContain('Scan for Ripple99');
    assertBadgeQrGeometry(hundredCanvas.ctx.fillRect.mock.calls, 3);

    // Oversized > 2,953-byte share URL also gracefully falls back to Ripple99 URL
    const oversizedUrl = `https://ripple99.pages.dev/?d=${'a'.repeat(3000)}`;
    const oversizedCanvas = createFakeCanvas2D();
    const oversizedResult = await renderDeckSnapshotCanvas(
      smallDeck,
      smallAnalytics,
      25,
      oversizedCanvas.fakeCanvas,
      { shareUrl: oversizedUrl },
    );
    expect(oversizedResult.summary.qr).toEqual({
      shareUrl: DEFAULT_SNAPSHOT_ORIGIN,
      included: true,
      isFallback: true,
      label: 'Scan for Ripple99',
      modulePx: 3,
      version: 2,
      size: 25,
      ecLevel: 'M',
    });
    expect(oversizedCanvas.fillTextCalls).toContain('Scan for Ripple99');
    assertBadgeQrGeometry(oversizedCanvas.ctx.fillRect.mock.calls, 3);

    // Explicit empty shareUrl skips QR badge entirely
    const emptyCanvas = createFakeCanvas2D();
    const emptyResult = await renderDeckSnapshotCanvas(
      smallDeck,
      smallAnalytics,
      25,
      emptyCanvas.fakeCanvas,
      { shareUrl: '' },
    );
    expect(emptyResult.summary.qr).toEqual({
      shareUrl: '',
      included: false,
      isFallback: false,
      label: null,
      modulePx: null,
      version: null,
      size: null,
      ecLevel: null,
    });
    expect(emptyCanvas.ctx.fillRect.mock.calls.length).toBeLessThan(
      cloudCanvas.ctx.fillRect.mock.calls.length,
    );

    // Supports passing SnapshotExportOptions directly as 4th argument when document creates canvas
    const autoCanvas = createFakeCanvas2D();
    vi.stubGlobal('document', {
      createElement: vi.fn(() => autoCanvas.fakeCanvas),
    });
    try {
      const directOptionsResult = await renderDeckSnapshotCanvas(smallDeck, smallAnalytics, 25, {
        shareUrl: 'https://ripple99.pages.dev/?deck=direct-opt',
      });
      expect(directOptionsResult.summary.qr.included).toBe(true);
      expect(directOptionsResult.summary.qr.isFallback).toBe(false);
      expect(directOptionsResult.summary.qr.shareUrl).toBe(
        'https://ripple99.pages.dev/?deck=direct-opt',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
