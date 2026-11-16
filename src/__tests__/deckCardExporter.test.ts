import { describe, expect, it, vi } from 'vitest';
import { computeDeckAnalytics } from '../deck/deckAnalytics.js';
import {
  buildDeckSnapshotSummary,
  buildSnapshotFilename,
  calculateDeckPriceUsd,
  renderDeckSnapshotCanvas,
  SNAPSHOT_CANVAS_HEIGHT,
  SNAPSHOT_CANVAS_WIDTH,
  SNAPSHOT_FOOTER_TEXT,
} from '../deck/deckCardExporter.js';
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
  });
});
