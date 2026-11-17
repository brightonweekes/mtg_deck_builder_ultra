import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { shouldRenderLegalFooter } from '../App.js';
import { HeaderBar } from '../components/HeaderBar.js';
import {
  buildHomeSynergyFilter,
  computeBiggestDeckGap,
  HomeLandingView,
  selectTopSynergyMatches,
  shouldShowActiveDeckBar,
} from '../components/HomeLandingView.js';
import type { SavedDeckRecord } from '../db/cardDb.js';
import { computeDeckAnalytics, type DeckAnalyticsReport } from '../deck/deckAnalytics.js';
import { CardSearchEngine } from '../search/searchEngine.js';
import {
  hydrateCompactCard,
  type CompactCard,
  type ManaColor,
  type SerializedCompactCard,
} from '../types/card.js';
import type { DeckDraft } from '../types/deck.js';
import {
  DEFAULT_SEARCH_FILTER,
  type ScoredCardMatch,
  type SearchResponsePayload,
  type SyncStatusPayload,
} from '../types/search.js';

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
    edhrecRank: 50,
    priceUsd: 2.5,
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
    id: 'deck-home-1',
    name: 'Test Commander Brew',
    commanders: [],
    mainboard: {},
    sideboard: {},
    lockSearchToCommanderIdentity: true,
    createdAt: '2026-11-16T00:00:00.000Z',
    updatedAt: '2026-11-16T00:00:00.000Z',
    ...overrides,
  };
}

function makeSavedRecord(overrides: Partial<SavedDeckRecord> = {}): SavedDeckRecord {
  return {
    id: 'deck-home-1',
    name: 'Test Commander Brew',
    commanderIds: [],
    mainboard: {},
    sideboard: {},
    createdAt: '2026-11-16T00:00:00.000Z',
    updatedAt: '2026-11-16T00:00:00.000Z',
    ...overrides,
  };
}

function makeAnalytics(overrides: Partial<DeckAnalyticsReport> = {}): DeckAnalyticsReport {
  const base = computeDeckAnalytics(makeDeck());
  return {
    ...base,
    ...overrides,
    roleCounts: {
      ...base.roleCounts,
      ...overrides.roleCounts,
    },
  };
}

const READY_SYNC: SyncStatusPayload = {
  stage: 'ready',
  progressPercent: 100,
  message: 'Ready',
};

const noopResolveCards = async () => ({ byId: {}, byName: {} });
const noopRunOneOffSearch = async (): Promise<SearchResponsePayload> => ({
  requestId: 1,
  matches: [],
  totalMatches: 0,
  page: 1,
  pageSize: 16,
  totalPages: 1,
  executionTimeMs: 0,
});

describe('HomeLandingView & Minimal Home Header', () => {
  it('renders minimal HeaderBar on Home while keeping full HeaderBar in Catalog and Studio', () => {
    const cmd = makeCard({
      id: 'cmd-meren',
      name: 'Meren of Clan Nel Toth',
      colorIdentity: ['B', 'G'],
      isCommanderEligible: true,
    });
    const baseProps = {
      query: '',
      onQueryChange: () => {},
      onTabChange: () => {},
      commanders: [cmd],
      totalDeckCards: 42,
      syncStatus: READY_SYNC,
      onOpenMobileFilters: () => {},
      onOpenDeckDrawer: () => {},
      onOpenDeckManager: () => {},
      onOpenAudit: () => {},
      onOpenFriends: () => {},
      onOpenCloudAuthOrAccount: () => {},
      onMatchCommanderSynergy: () => {},
      onFindPartner: () => {},
      onClearCommanders: () => {},
    };

    const homeHtml = renderToStaticMarkup(<HeaderBar {...baseProps} activeTab="home" />);
    expect(homeHtml).toContain('>Home<');
    expect(homeHtml).toContain('>Catalog<');
    expect(homeHtml).toContain('>Studio<');
    expect(homeHtml).toContain('>Decks<');
    expect(homeHtml).toContain('>Friends<');
    expect(homeHtml).toContain('>Sign In<');
    // Stripped secondary chrome on Home
    expect(homeHtml).not.toContain('Search name, type, or');
    expect(homeHtml).not.toContain('>Audit<');
    expect(homeHtml).not.toContain('42/100');
    expect(homeHtml).not.toContain('aria-label="Clear commander"');

    const catalogHtml = renderToStaticMarkup(<HeaderBar {...baseProps} activeTab="search" />);
    expect(catalogHtml).toContain('Search name, type, or');
    expect(catalogHtml).toContain('>Audit<');
    expect(catalogHtml).toContain('42/100');
    expect(catalogHtml).toContain('aria-label="Clear commander"');

    const studioHtml = renderToStaticMarkup(<HeaderBar {...baseProps} activeTab="deck" />);
    expect(studioHtml).toContain('Search name, type, or');
    expect(studioHtml).toContain('>Audit<');
    expect(studioHtml).toContain('42/100');
  });

  it('builds synergy filters properly for Commanders, colorless Commanders, and Non-Commanders', () => {
    const urCmd = makeCard({
      id: 'cmd-veyran',
      name: 'Veyran, Voice of Duality',
      colorIdentity: ['U', 'R'],
      isCommanderEligible: true,
      themes: ['spellslinger', 'magecraft'],
    });
    const bgCmd = makeCard({
      id: 'cmd-meren',
      name: 'Meren of Clan Nel Toth',
      colorIdentity: ['B', 'G'],
      isCommanderEligible: true,
      themes: ['aristocrats', 'reanimator'],
    });
    const colorlessCmd = makeCard({
      id: 'cmd-kozilek',
      name: 'Kozilek, the Great Distortion',
      colorIdentity: [],
      isCommanderEligible: true,
      themes: ['big-mana'],
    });
    const nonCmd = makeCard({
      id: 'card-scales',
      name: 'Hardened Scales',
      colorIdentity: ['G'],
      isCommanderEligible: false,
      themes: ['plus-one-counters'],
    });

    // 1. Previewing a Commander always scopes to that previewed Commander's identity (even if another Commander is active)
    const activeUrDeck = makeDeck({ commanders: [urCmd], lockSearchToCommanderIdentity: true });
    const merenFilter = buildHomeSynergyFilter(bgCmd, activeUrDeck);
    expect(merenFilter).toEqual({
      ...DEFAULT_SEARCH_FILTER,
      colorIdentity: ['B', 'G'],
      commanderOnly: false,
      partnerType: null,
      rippleSeedIds: ['cmd-meren'],
      rippleMode: 'all',
      rippleHookKey: null,
      themes: merenFilter.themes,
      themeQuery: '',
      excludeCardIds: ['cmd-meren'],
      sortBy: 'synergy',
      page: 1,
      pageSize: 16,
    });
    expect(merenFilter.themes.length).toBeGreaterThan(0);

    // 2. Colorless Commander sets empty array [] rather than null
    const colorlessFilter = buildHomeSynergyFilter(colorlessCmd, activeUrDeck);
    expect(colorlessFilter.colorIdentity).toEqual([]);

    // 3. Non-Commander with locked active Commander inherits active Commander's identity
    const nonCmdLocked = buildHomeSynergyFilter(nonCmd, activeUrDeck);
    expect(nonCmdLocked.colorIdentity).toEqual(['U', 'R']);
    expect(nonCmdLocked.rippleSeedIds).toEqual(['card-scales']);

    // 4. Non-Commander with unlocked identity or empty deck leaves colorIdentity null
    const unlockedDeck = makeDeck({ commanders: [urCmd], lockSearchToCommanderIdentity: false });
    expect(buildHomeSynergyFilter(nonCmd, unlockedDeck).colorIdentity).toBeNull();
    expect(buildHomeSynergyFilter(nonCmd, makeDeck()).colorIdentity).toBeNull();
  });

  it('selects top synergy matches while excluding basics, self, duplicate oracleIds, and edge limits', () => {
    const seed = makeCard({
      id: 'seed-1',
      oracleId: 'oracle-seed',
      name: 'Meren of Clan Nel Toth',
    });

    const candidates: ScoredCardMatch[] = [
      {
        card: makeCard({ id: 'basic-swamp', name: 'Swamp', typeLine: 'Basic Land — Swamp' }),
        synergyScore: 100,
        matchedReasons: [],
      },
      {
        card: makeCard({
          id: 'basic-snow',
          name: 'Snow-Covered Forest',
          typeLine: 'Basic Snow Land — Forest',
        }),
        synergyScore: 99,
        matchedReasons: [],
      },
      {
        card: makeCard({ id: 'seed-1', oracleId: 'oracle-seed', name: 'Meren Exact ID' }),
        synergyScore: 98,
        matchedReasons: [],
      },
      {
        card: makeCard({
          id: 'seed-reprint',
          oracleId: 'oracle-seed',
          name: 'Meren Secret Lair',
        }),
        synergyScore: 97,
        matchedReasons: [],
      },
      {
        card: makeCard({ id: 'syn-1', oracleId: 'oracle-a', name: 'Sakura-Tribe Elder' }),
        synergyScore: 95,
        matchedReasons: [],
      },
      {
        card: makeCard({
          id: 'syn-1-reprint',
          oracleId: 'oracle-a',
          name: 'Sakura-Tribe Elder (PLST)',
        }),
        synergyScore: 94,
        matchedReasons: [],
      },
      {
        // Empty oracleId should NOT collide with other empty-oracleId cards
        card: makeCard({ id: 'syn-2', oracleId: '', name: 'Spore Frog' }),
        synergyScore: 90,
        matchedReasons: [],
      },
      {
        card: makeCard({ id: 'syn-3', oracleId: '', name: 'Plaguecrafter' }),
        synergyScore: 88,
        matchedReasons: [],
      },
      {
        card: makeCard({ id: 'syn-4', oracleId: 'oracle-d', name: 'Syr Konrad, the Grim' }),
        synergyScore: 85,
        matchedReasons: [],
      },
      {
        card: makeCard({ id: 'syn-5', oracleId: 'oracle-e', name: 'Grim Haruspex' }),
        synergyScore: 80,
        matchedReasons: [],
      },
    ];

    expect(
      selectTopSynergyMatches(candidates, seed).map((m) => m.card.name),
    ).toEqual([
      'Sakura-Tribe Elder',
      'Spore Frog',
      'Plaguecrafter',
      'Syr Konrad, the Grim',
    ]);

    expect(selectTopSynergyMatches(candidates, seed, 2)).toHaveLength(2);
    expect(selectTopSynergyMatches(candidates, seed, 0)).toEqual([]);
    expect(selectTopSynergyMatches(candidates, seed, -1)).toEqual([]);
    expect(selectTopSynergyMatches([], seed)).toEqual([]);
  });

  it('controls Active Deck bar visibility cleanly across brand-new and returning user states', () => {
    const emptyDeck = makeDeck();
    expect(shouldShowActiveDeckBar(emptyDeck, [])).toBe(false);
    expect(shouldShowActiveDeckBar(emptyDeck, [makeSavedRecord()])).toBe(false);

    // Zero-quantity stale record entries should not trigger the bar
    expect(
      shouldShowActiveDeckBar(
        makeDeck({
          mainboard: {
            stale: { card: makeCard({ id: 'stale', name: 'Stale Card' }), quantity: 0 },
          },
        }),
        [makeSavedRecord({ mainboard: { stale: 0 }, sideboard: { other: 0 } })],
      ),
    ).toBe(false);

    // Commander set -> show
    expect(
      shouldShowActiveDeckBar(
        makeDeck({ commanders: [makeCard({ id: 'cmd', name: 'Atraxa', isCommanderEligible: true })] }),
        [],
      ),
    ).toBe(true);

    // Non-empty mainboard or sideboard -> show
    expect(
      shouldShowActiveDeckBar(
        makeDeck({
          mainboard: {
            sol: { card: makeCard({ id: 'sol', name: 'Sol Ring' }), quantity: 1 },
          },
        }),
        [],
      ),
    ).toBe(true);
    expect(
      shouldShowActiveDeckBar(
        makeDeck({
          sideboard: {
            maybe: { card: makeCard({ id: 'maybe', name: 'Maybeboard Card' }), quantity: 1 },
          },
        }),
        [],
      ),
    ).toBe(true);

    // Multiple saved decks -> show switcher even if empty
    expect(
      shouldShowActiveDeckBar(emptyDeck, [
        makeSavedRecord({ id: 'd1', name: 'Deck 1' }),
        makeSavedRecord({ id: 'd2', name: 'Deck 2' }),
      ]),
    ).toBe(true);

    // Single saved deck with saved commander/cards -> show
    expect(
      shouldShowActiveDeckBar(emptyDeck, [makeSavedRecord({ commanderIds: ['cmd-1'] })]),
    ).toBe(true);
  });

  it('computes the single highest-priority deck gap deterministically across edge cases', () => {
    const cmd = makeCard({ id: 'cmd', name: 'Meren', isCommanderEligible: true });

    // 1. Missing commander takes priority even when mainboard has gaps
    expect(
      computeBiggestDeckGap(
        makeDeck({ commanders: [] }),
        makeAnalytics({ totalCount: 15 }),
      ),
    ).toEqual({
      kind: 'commander',
      label: 'Pick a Commander in Catalog →',
    });

    // 2. Role deficits: picks largest deficit and breaks ties in order draw > ramp > removal > wipe
    const deckWithCmd = makeDeck({ commanders: [cmd] });
    const tieGap = computeBiggestDeckGap(
      deckWithCmd,
      makeAnalytics({
        roleCounts: {
          lands: 36,
          draw: 2, // deficit 6
          ramp: 2, // deficit 6 (tie -> draw wins)
          removal: 0, // deficit 6
          wipe: 0, // deficit 2
          tutor: 0,
          recursion: 0,
          protection: 0,
        },
      }),
    );
    expect(tieGap).toEqual({
      kind: 'role',
      role: 'draw',
      deficit: 6,
      label: 'Fix Biggest Gap: +6 Card Draw →',
    });

    // Ramp has strictly largest deficit
    expect(
      computeBiggestDeckGap(
        deckWithCmd,
        makeAnalytics({
          roleCounts: {
            lands: 36,
            draw: 6, // deficit 2
            ramp: 1, // deficit 7
            removal: 5, // deficit 1
            wipe: 2, // deficit 0
            tutor: 0,
            recursion: 0,
            protection: 0,
          },
        }),
      ),
    ).toEqual({
      kind: 'role',
      role: 'ramp',
      deficit: 7,
      label: 'Fix Biggest Gap: +7 Ramp →',
    });

    // Removal uses clean "Removal" wording
    expect(
      computeBiggestDeckGap(
        deckWithCmd,
        makeAnalytics({
          roleCounts: {
            lands: 36,
            draw: 8,
            ramp: 8,
            removal: 1, // deficit 5
            wipe: 2,
            tutor: 0,
            recursion: 0,
            protection: 0,
          },
        }),
      ),
    ).toEqual({
      kind: 'role',
      role: 'removal',
      deficit: 5,
      label: 'Fix Biggest Gap: +5 Removal →',
    });

    // 3. Lands deficit once core spell roles are healthy
    expect(
      computeBiggestDeckGap(
        deckWithCmd,
        makeAnalytics({
          totalCount: 60,
          roleCounts: {
            lands: 28, // deficit 6
            draw: 8,
            ramp: 8,
            removal: 6,
            wipe: 2,
            tutor: 0,
            recursion: 0,
            protection: 0,
          },
        }),
      ),
    ).toEqual({
      kind: 'role',
      role: 'lands',
      deficit: 6,
      label: 'Fix Biggest Gap: +6 Lands →',
    });

    // 4. Healthy roles + lands, but < 100 cards -> Find Synergies
    expect(
      computeBiggestDeckGap(
        deckWithCmd,
        makeAnalytics({
          totalCount: 78,
          roleCounts: {
            lands: 36,
            draw: 10,
            ramp: 10,
            removal: 8,
            wipe: 3,
            tutor: 0,
            recursion: 0,
            protection: 0,
          },
        }),
      ),
    ).toEqual({
      kind: 'synergy',
      remainingSlots: 22,
      label: 'Find Synergies (22 slots left) →',
    });

    // 5. Full 100-card healthy deck -> Run 99 Audit
    expect(
      computeBiggestDeckGap(
        deckWithCmd,
        makeAnalytics({
          totalCount: 100,
          roleCounts: {
            lands: 36,
            draw: 10,
            ramp: 10,
            removal: 8,
            wipe: 3,
            tutor: 0,
            recursion: 0,
            protection: 0,
          },
        }),
      ),
    ).toEqual({
      kind: 'audit',
      label: 'Run 99 Audit →',
    });
  });

  it('renders HomeLandingView cleanly across cold start, commander, partner, non-commander, and multi-deck edge cases', () => {
    const meren = makeCard({
      id: 'cmd-meren',
      name: 'Meren of Clan Nel Toth',
      manaCost: '{2}{B}{G}',
      colorIdentity: ['B', 'G'] as ManaColor[],
      isCommanderEligible: true,
      priceUsd: 8.5,
      imageNormal: 'https://cards.scryfall.io/normal/front/m/e/meren.jpg',
      imageSmall: 'https://cards.scryfall.io/small/front/m/e/meren.jpg',
    });
    const partnerA = makeCard({
      id: 'cmd-malcolm',
      name: 'Malcolm, Keen-Eyed Navigator',
      manaCost: '{2}{U}',
      colorIdentity: ['U'] as ManaColor[],
      isCommanderEligible: true,
      partnerType: 'partner',
    });
    const partnerB = makeCard({
      id: 'cmd-kediss',
      name: 'Kediss, Emberclaw Familiar',
      manaCost: '{1}{R}',
      colorIdentity: ['R'] as ManaColor[],
      isCommanderEligible: true,
      partnerType: 'partner',
    });
    const nonCmd = makeCard({
      id: 'card-scales',
      name: 'Hardened Scales',
      manaCost: '{G}',
      colorIdentity: ['G'] as ManaColor[],
      typeLine: 'Enchantment',
      isCommanderEligible: false,
    });

    // Missing-image and null-price synergy card edge case
    const unpricedNoImgSyn: ScoredCardMatch = {
      card: makeCard({
        id: 'syn-noimg',
        name: 'Spore Frog',
        manaCost: '{G}',
        colorIdentity: ['G'] as ManaColor[],
        typeLine: 'Creature — Frog',
        priceUsd: null,
        imageNormal: '',
        imageSmall: '',
      }),
      synergyScore: 92,
      matchedReasons: [],
    };
    const inDeckSyn: ScoredCardMatch = {
      card: makeCard({
        id: 'syn-ste',
        name: 'Sakura-Tribe Elder',
        manaCost: '{1}{G}',
        colorIdentity: ['G'] as ManaColor[],
        typeLine: 'Creature — Snake Shaman',
        priceUsd: 1.4,
        imageNormal: 'https://cards.scryfall.io/normal/front/s/t/ste.jpg',
      }),
      synergyScore: 95,
      matchedReasons: [],
    };

    const emptyDeck = makeDeck();
    const sharedProps = {
      savedDecks: [],
      analytics: computeDeckAnalytics(emptyDeck),
      totalCardCount: 0,
      syncReady: true,
      resolveCards: noopResolveCards,
      runOneOffSearch: noopRunOneOffSearch,
      getCardQuantity: () => 0,
      isCommander: () => false,
      onSetCommander: () => {},
      onAddPartner: () => {},
      onAddCard: () => {},
      onInspectCard: () => {},
      onExploreSynergiesInCatalog: () => {},
      onSearchQueryInCatalog: () => {},
      onQuickFilterRole: () => {},
      onChooseCommander: () => {},
      onOpenStudio: () => {},
      onOpenAudit: () => {},
      onSwitchDeck: () => {},
    };

    // 1. Cold start empty state hides Active Deck bar and renders single search + sample pills
    const coldHtml = renderToStaticMarkup(
      <HomeLandingView {...sharedProps} deck={emptyDeck} initialSelectedCard={null} />,
    );
    expect(coldHtml).toContain('Search Any Card. See Its Top Synergies.');
    expect(coldHtml).toContain('Surprise Me');
    expect(coldHtml).toContain('Atraxa');
    expect(coldHtml).toContain('Meren');
    expect(coldHtml).toContain('Veyran');
    expect(coldHtml).not.toContain('Active Deck');
    expect(coldHtml).not.toContain('Core Synergies');
    expect(coldHtml).not.toContain('On-Theme Ramp &amp; Draw');
    expect(coldHtml).not.toContain('Budget Sleepers');

    // 2. Selected Commander with missing-image/null-price synergy match & singleton already-in-deck card
    const deckWithSte = makeDeck({
      commanders: [meren],
      mainboard: {
        [inDeckSyn.card.id]: { card: inDeckSyn.card, quantity: 1 },
      },
    });
    const merenHtml = renderToStaticMarkup(
      <HomeLandingView
        {...sharedProps}
        deck={deckWithSte}
        savedDecks={[
          makeSavedRecord({ id: deckWithSte.id, name: 'Meren Aristocrats', commanderIds: [meren.id] }),
          makeSavedRecord({ id: 'deck-2', name: 'Veyran Spells' }),
        ]}
        analytics={computeDeckAnalytics(deckWithSte)}
        totalCardCount={2}
        initialSelectedCard={meren}
        initialSynergyMatches={[inDeckSyn, unpricedNoImgSyn]}
        getCardQuantity={(id) => (id === inDeckSyn.card.id ? 1 : 0)}
        isCommander={(id) => id === meren.id}
      />,
    );
    expect(merenHtml).toContain('Top Algorithmic Synergy Matches');
    expect(merenHtml).toContain('In Command Zone');
    expect(merenHtml).toContain('View All in Catalog');
    expect(merenHtml).toContain('Sakura-Tribe Elder');
    expect(merenHtml).toContain('$1.40');
    expect(merenHtml).toContain('In Deck');
    expect(merenHtml).toContain('Spore Frog');
    expect(merenHtml).toContain('—');
    expect(merenHtml).toContain('mtg-card-corners');
    expect(merenHtml).toContain('aria-label="Switch active deck"');
    expect(merenHtml).toContain('Meren Aristocrats');
    expect(merenHtml).toContain('Veyran Spells');
    expect(merenHtml).toContain('2/100');
    expect(merenHtml).toContain('Fix Biggest Gap: +8 Card Draw');
    expect(merenHtml).toContain('Open Studio');

    // 3. Partner Commander preview offers Add Partner alongside Set as Commander
    const partnerDeck = makeDeck({ commanders: [partnerA] });
    const partnerHtml = renderToStaticMarkup(
      <HomeLandingView
        {...sharedProps}
        deck={partnerDeck}
        initialSelectedCard={partnerB}
        initialSynergyMatches={[]}
      />,
    );
    expect(partnerHtml).toContain('Add Partner');
    expect(partnerHtml).toContain('Set as Commander');
    expect(partnerHtml).toContain('No direct synergy matches found');

    // 4. Non-commander card outside active Commander identity disables Add to Deck with reason
    const nonCmdBlockedHtml = renderToStaticMarkup(
      <HomeLandingView
        {...sharedProps}
        deck={partnerDeck}
        initialSelectedCard={nonCmd}
        initialSynergyMatches={[]}
      />,
    );
    expect(nonCmdBlockedHtml).toContain('Add to Deck');
    expect(nonCmdBlockedHtml).toContain('Outside Commander color identity');
    expect(nonCmdBlockedHtml).not.toContain('Set as Commander');
  });

  it('executes real 32k-card Home synergy lookups for Commander and non-Commander cards within latency budget', () => {
    const cardsPath = path.resolve(process.cwd(), 'public', 'data', 'cards.min.json');
    const raw = JSON.parse(readFileSync(cardsPath, 'utf8')) as SerializedCompactCard[];
    const cards = raw.map(hydrateCompactCard);
    const byName = new Map(cards.map((c) => [c.name, c]));

    const engine = new CardSearchEngine(cards);
    engine.ensureRippleIndex();

    const meren = byName.get('Meren of Clan Nel Toth')!;
    const scales = byName.get('Hardened Scales')!;
    const merenFilter = buildHomeSynergyFilter(meren, makeDeck());
    const scalesFilter = buildHomeSynergyFilter(scales, makeDeck());

    // Warm V8 JIT paths before measuring median latency under parallel test load
    engine.search(merenFilter);
    engine.search(scalesFilter);

    const measureMedianMs = (filter: typeof merenFilter) => {
      const samples: number[] = [];
      let lastRes!: ReturnType<CardSearchEngine['search']>;
      for (let i = 0; i < 3; i++) {
        lastRes = engine.search(filter);
        samples.push(lastRes.executionTimeMs);
      }
      samples.sort((a, b) => a - b);
      return { medianMs: samples[1]!, res: lastRes };
    };

    const maxBudgetMs = process.env.CI ? 50 : 25;

    const merenRun = measureMedianMs(merenFilter);
    const merenSelStart = performance.now();
    const merenTop4 = selectTopSynergyMatches(merenRun.res.matches, meren, 4);
    const merenSelMs = performance.now() - merenSelStart;

    expect(merenTop4).toHaveLength(4);
    expect(merenTop4.some((m) => m.card.id === meren.id)).toBe(false);
    expect(merenRun.medianMs).toBeLessThan(maxBudgetMs);
    expect(merenSelMs).toBeLessThan(5);

    const scalesRun = measureMedianMs(scalesFilter);
    const scalesSelStart = performance.now();
    const scalesTop4 = selectTopSynergyMatches(scalesRun.res.matches, scales, 4);
    const scalesSelMs = performance.now() - scalesSelStart;

    expect(scalesTop4).toHaveLength(4);
    expect(scalesTop4.some((m) => m.card.id === scales.id)).toBe(false);
    expect(scalesRun.medianMs).toBeLessThan(maxBudgetMs);
    expect(scalesSelMs).toBeLessThan(5);
  });

  it('omits LegalFooter on Home while keeping it on Catalog and Studio', () => {
    expect(shouldRenderLegalFooter('home')).toBe(false);
    expect(shouldRenderLegalFooter('search')).toBe(true);
    expect(shouldRenderLegalFooter('deck')).toBe(true);

    const appSource = readFileSync(path.resolve(process.cwd(), 'src', 'App.tsx'), 'utf8');
    expect(appSource).toContain('{shouldRenderLegalFooter(activeTab) && <LegalFooter />}');
    expect(appSource).not.toMatch(/^\s*<LegalFooter \/>\s*$/m);
  });
});
