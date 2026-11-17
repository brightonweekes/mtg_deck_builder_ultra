import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { BudgetSwapsModal } from '../components/BudgetSwapsModal.js';
import { CardDetailModal } from '../components/CardDetailModal.js';
import { DeckAuditModal } from '../components/DeckAuditModal.js';
import { DeckWorkspace } from '../components/DeckWorkspace.js';
import { QuickDeckDrawer } from '../components/QuickDeckDrawer.js';
import { computeDeckAnalytics } from '../deck/deckAnalytics.js';
import { swapCardInDeckDraft } from '../hooks/useDeckDraft.js';
import {
  collectDeckExcludedCardIds,
  computeDeckSwapPotentialSavings,
  findBudgetSwapsForTargets,
  isBasicLandCard,
  selectExpensiveDeckTargets,
} from '../search/budgetSwapEngine.js';
import { CardSearchEngine } from '../search/searchEngine.js';
import {
  hydrateCompactCard,
  type CompactCard,
  type DataManifest,
  type SerializedCompactCard,
} from '../types/card.js';
import type { DeckDraft } from '../types/deck.js';
import {
  type BudgetSwapScanResponse,
  type WorkerResponseMessage,
} from '../types/search.js';
import { SearchWorkerController } from '../workers/searchWorker.js';

const IS_CI = Boolean(process.env.CI);
const MAX_COLD_ENGINE_MS = IS_CI ? 200 : 100;
const MAX_DECK_BATCH_SCAN_MS = IS_CI ? 300 : 150;

function makeDraft(overrides: Partial<DeckDraft> = {}): DeckDraft {
  const now = '2026-11-16T00:00:00.000Z';
  return {
    id: 'budget-test-deck',
    name: 'Budget Test Deck',
    commanders: [],
    mainboard: {},
    sideboard: {},
    lockSearchToCommanderIdentity: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeSyntheticCard(
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
    edhrecRank: 500,
    priceUsd: 1.0,
    imageNormal: '',
    imageSmall: '',
    layout: 'normal',
    isCommanderEligible: false,
    roles: [],
    themes: [],
    ...overrides,
  };
}

describe('Budget Card Substitution Engine & UI', () => {
  let cards: CompactCard[] = [];
  let byName = new Map<string, CompactCard>();
  let engine: CardSearchEngine;
  let coldInitMs = 0;

  beforeAll(() => {
    const cardsPath = path.resolve(process.cwd(), 'public', 'data', 'cards.min.json');
    const raw = JSON.parse(readFileSync(cardsPath, 'utf8')) as SerializedCompactCard[];
    cards = raw.map(hydrateCompactCard);
    byName = new Map(cards.map((c) => [c.name, c]));

    const t0 = performance.now();
    engine = new CardSearchEngine(cards);
    coldInitMs = performance.now() - t0;

    // Warm lazy indexes for query tests
    engine.findBudgetSwaps({
      targetCardIds: [byName.get('Cyclonic Rift')!.id],
      commanderIds: [],
      excludeCardIds: [],
      colorIdentity: ['U'],
      maxSwapPriceUsd: 2.0,
      perTargetLimit: 5,
    });
  });

  it('keeps CardSearchEngine cold startup unaffected via lazy BudgetSwapIndex construction', () => {
    expect(coldInitMs).toBeLessThan(MAX_COLD_ENGINE_MS);
  });

  it('matches genuine same-job spell substitutions across iconic Commander staples', () => {
    const deckExclude = [
      byName.get('Command Tower')!.id,
      byName.get('Sol Ring')!.id,
    ];

    const cyclonic = byName.get('Cyclonic Rift')!;
    const cycRes = engine.findBudgetSwaps({
      targetCardIds: [cyclonic.id],
      commanderIds: [],
      excludeCardIds: deckExclude,
      colorIdentity: ['U'],
      maxSwapPriceUsd: 2.0,
      perTargetLimit: 6,
    });
    const cycNames = cycRes.results[0]!.suggestions.map((s) => s.card.name);
    expect(cycNames.some((n) => ['Whelming Wave', 'Evacuation', 'Devastation Tide', "River's Rebuke", 'Aetherize'].includes(n))).toBe(true);
    expect(cycNames).not.toContain('Snapback');

    const fierce = byName.get('Fierce Guardianship')!;
    const fierceRes = engine.findBudgetSwaps({
      targetCardIds: [fierce.id],
      commanderIds: [],
      excludeCardIds: deckExclude,
      colorIdentity: ['U'],
      maxSwapPriceUsd: 2.0,
      perTargetLimit: 6,
    });
    const fierceNames = fierceRes.results[0]!.suggestions.map((s) => s.card.name);
    expect(fierceNames.some((n) => ['Negate', 'Saw It Coming', 'Disallow', 'Refute'].includes(n))).toBe(true);
    expect(fierceRes.results[0]!.suggestions[0]!.reasons).toContain('Counterspell');

    const demonic = byName.get('Demonic Tutor')!;
    const demonicRes = engine.findBudgetSwaps({
      targetCardIds: [demonic.id],
      commanderIds: [],
      excludeCardIds: deckExclude,
      colorIdentity: ['B'],
      maxSwapPriceUsd: 2.0,
      perTargetLimit: 6,
    });
    const demonicNames = demonicRes.results[0]!.suggestions.map((s) => s.card.name);
    expect(demonicNames.some((n) => ['Infernal Tutor', 'Demonic Bargain', 'Case of the Stashed Skeleton', 'Diabolic Tutor'].includes(n))).toBe(true);

    const threeVisits = byName.get('Three Visits')!;
    const visitsRes = engine.findBudgetSwaps({
      targetCardIds: [threeVisits.id],
      commanderIds: [],
      excludeCardIds: deckExclude,
      colorIdentity: ['G'],
      maxSwapPriceUsd: 2.0,
      perTargetLimit: 6,
    });
    const visitsNames = visitsRes.results[0]!.suggestions.map((s) => s.card.name);
    expect(visitsNames.some((n) => ["Nature's Lore", 'Rampant Growth', 'Cultivate', 'Shared Roots'].includes(n))).toBe(true);

    const hoof = byName.get('Craterhoof Behemoth')!;
    const hoofRes = engine.findBudgetSwaps({
      targetCardIds: [hoof.id],
      commanderIds: [],
      excludeCardIds: deckExclude,
      colorIdentity: ['G'],
      maxSwapPriceUsd: 2.0,
      perTargetLimit: 6,
    });
    const hoofNames = hoofRes.results[0]!.suggestions.map((s) => s.card.name);
    expect(hoofNames.some((n) => ['End-Raze Forerunners', 'Glacier Godmaw', 'Jubilation', 'Overwhelming Stampede'].includes(n))).toBe(true);
  });

  it('matches dual, fetch, and utility lands cleanly without Demolition Field or tribal false positives', () => {
    const commonDeckLands = [
      byName.get('Command Tower')!.id,
      byName.get('Exotic Orchard')!.id,
      byName.get('Evolving Wilds')!.id,
      byName.get('Terramorphic Expanse')!.id,
    ];

    const breedingPool = byName.get('Breeding Pool')!;
    const poolRes = engine.findBudgetSwaps({
      targetCardIds: [breedingPool.id],
      commanderIds: [],
      excludeCardIds: commonDeckLands,
      colorIdentity: ['U', 'G'],
      maxSwapPriceUsd: 2.0,
      perTargetLimit: 6,
    });
    const poolNames = poolRes.results[0]!.suggestions.map((s) => s.card.name);
    expect(poolNames.some((n) => ['Sodden Verdure', 'Hinterland Harbor', 'Yavimaya Coast', 'Dreamroot Cascade', 'Flooded Grove'].includes(n))).toBe(true);
    for (const s of poolRes.results[0]!.suggestions) {
      expect(isBasicLandCard(s.card)).toBe(false);
    }

    // Fetchland with empty Scryfall colorIdentity: [] inside U/B Commander matches U/B budget duals
    const delta = byName.get('Polluted Delta')!;
    expect(delta.colorIdentity).toEqual([]);
    const deltaRes = engine.findBudgetSwaps({
      targetCardIds: [delta.id],
      commanderIds: [],
      excludeCardIds: commonDeckLands,
      colorIdentity: ['U', 'B'],
      maxSwapPriceUsd: 2.0,
      perTargetLimit: 6,
    });
    const deltaNames = deltaRes.results[0]!.suggestions.map((s) => s.card.name);
    expect(deltaNames.some((n) => ['Sunken Hollow', 'Drowned Catacomb', 'Underground River', 'Shipwreck Marsh', 'Darkwater Catacombs'].includes(n))).toBe(true);

    // Demolition Field's opponent "basic land card" text must NOT make it show up as a U/B color fixer for Polluted Delta!
    expect(deltaNames).not.toContain('Demolition Field');

    // Boseiju removal land shouldn't rank tribal-restricted rainbow lands at the top
    const boseiju = byName.get('Boseiju, Who Endures')!;
    const boseijuRes = engine.findBudgetSwaps({
      targetCardIds: [boseiju.id],
      commanderIds: [],
      excludeCardIds: commonDeckLands,
      colorIdentity: ['G'],
      maxSwapPriceUsd: 2.0,
      perTargetLimit: 5,
    });
    const boseijuNames = boseijuRes.results[0]!.suggestions.map((s) => s.card.name);
    expect(boseijuNames[0]).not.toBe('Secluded Courtyard');
    expect(boseijuNames[0]).not.toBe('Unclaimed Territory');
  });

  it('enforces Commander color identity, oracleId exclusion, price ceilings, and batch scan latency', () => {
    const yawgmoth = byName.get('Yawgmoth, Thran Physician')!;
    const altar = byName.get('Phyrexian Altar')!;
    const meren = byName.get('Meren of Clan Nel Toth')!;

    // Mono-black deck: Phyrexian Altar must NOT suggest Red cards like Thermopod
    const monoBlackRes = engine.findBudgetSwaps({
      targetCardIds: [altar.id],
      commanderIds: [yawgmoth.id],
      excludeCardIds: [yawgmoth.id],
      colorIdentity: yawgmoth.colorIdentity,
      maxSwapPriceUsd: 2.0,
      perTargetLimit: 8,
    });
    const monoNames = monoBlackRes.results[0]!.suggestions.map((s) => s.card.name);
    expect(monoNames).not.toContain('Thermopod');
    for (const s of monoBlackRes.results[0]!.suggestions) {
      expect(s.card.colorIdentity.every((c) => c === 'B')).toBe(true);
      expect(s.card.priceUsd).not.toBeNull();
      expect(s.card.priceUsd!).toBeLessThanOrEqual(2.0);
      expect(s.card.oracleId).not.toBe(altar.oracleId);
    }

    // Commander Ripple tie-breaker tags Meren synergy swaps accurately
    const merenAltarRes = engine.findBudgetSwaps({
      targetCardIds: [altar.id],
      commanderIds: [meren.id],
      excludeCardIds: [meren.id],
      colorIdentity: meren.colorIdentity,
      maxSwapPriceUsd: 2.0,
      perTargetLimit: 6,
    });
    expect(
      merenAltarRes.results[0]!.suggestions.some(
        (s) => s.fitsCommanderRipple && s.reasons.includes('Fits Meren of Clan Nel Toth'),
      ),
    ).toBe(true);

    // Batch full-deck scan across 12 real pricey staples finishes smoothly in milliseconds
    const batchTargets = [
      'Cyclonic Rift',
      'Rhystic Study',
      'Smothering Tithe',
      'The Great Henge',
      'Demonic Tutor',
      'Fierce Guardianship',
      "Teferi's Protection",
      'Phyrexian Altar',
      'Parallel Lives',
      'Craterhoof Behemoth',
      'Breeding Pool',
      'Polluted Delta',
    ].map((n) => byName.get(n)!.id);

    const batchRes = engine.findBudgetSwaps({
      targetCardIds: batchTargets,
      commanderIds: [],
      excludeCardIds: batchTargets,
      colorIdentity: ['W', 'U', 'B', 'R', 'G'],
      maxSwapPriceUsd: 2.0,
      perTargetLimit: 5,
    });
    expect(batchRes.results).toHaveLength(12);
    expect(batchRes.executionTimeMs).toBeLessThan(MAX_DECK_BATCH_SCAN_MS);
  });

  it('selects non-basic expensive targets, excludes owned slots, and swaps/undoes atomically on DeckDraft', () => {
    const forest = byName.get('Forest')!;
    const craterhoof = byName.get('Craterhoof Behemoth')!;
    const forerunners = byName.get('End-Raze Forerunners')!;
    const rhystic = byName.get('Rhystic Study')!;
    const breedingPool = byName.get('Breeding Pool')!;
    const hinter = byName.get('Hinterland Harbor')!;
    const solRing = byName.get('Sol Ring')!;
    const hareApparent = byName.get('Hare Apparent')!;
    const yarok = byName.get('Yarok, the Desecrated')!; // W/U/B/G? Actually U/B/G!

    const draft = makeDraft({
      commanders: [yarok],
      mainboard: {
        [forest.id]: { card: { ...forest, priceUsd: 10 }, quantity: 10 },
        [craterhoof.id]: { card: craterhoof, quantity: 1 },
        [breedingPool.id]: { card: breedingPool, quantity: 1 },
        [solRing.id]: { card: solRing, quantity: 1 },
        [hareApparent.id]: { card: hareApparent, quantity: 2 },
      },
      sideboard: {
        [rhystic.id]: { card: rhystic, quantity: 1 },
      },
    });

    // Basic lands never qualify as expensive targets even if a printing has high priceUsd
    const withLands = selectExpensiveDeckTargets(draft, { minPriceUsd: 5, includeLands: true });
    expect(withLands.map((e) => e.card.id)).not.toContain(forest.id);
    expect(withLands.map((e) => e.card.id)).toEqual([craterhoof.id, breedingPool.id]);

    const withoutLands = selectExpensiveDeckTargets(draft, { minPriceUsd: 5, includeLands: false });
    expect(withoutLands.map((e) => e.card.id)).toEqual([craterhoof.id]);

    // Excluded IDs include commanders + mainboard + sideboard
    const excluded = collectDeckExcludedCardIds(draft);
    expect(excluded).toEqual(
      expect.arrayContaining([yarok.id, craterhoof.id, breedingPool.id, solRing.id, rhystic.id]),
    );

    // Off-color red card cannot swap into Sultai Yarok deck
    const redCard = makeSyntheticCard({
      id: 'red-bolt',
      name: 'Lightning Bolt',
      colorIdentity: ['R'],
      colors: ['R'],
    });
    const blocked = swapCardInDeckDraft(draft, craterhoof.id, redCard, { moveOutToSideboard: true });
    expect(blocked.swapped).toBe(false);

    // Valid forward swap moves Craterhoof -> Maybeboard and adds Forerunners cleanly
    const forward = swapCardInDeckDraft(draft, craterhoof.id, forerunners, {
      moveOutToSideboard: true,
    });
    expect(forward.swapped).toBe(true);
    expect(forward.draft.mainboard[craterhoof.id]).toBeUndefined();
    expect(forward.draft.mainboard[forerunners.id]?.quantity).toBe(1);
    expect(forward.draft.sideboard[craterhoof.id]?.quantity).toBe(1);

    // Multi-copy swap decrements only 1 copy of Hare Apparent
    const multiCopySwap = swapCardInDeckDraft(forward.draft, hareApparent.id, hinter, {
      moveOutToSideboard: false,
    });
    expect(multiCopySwap.swapped).toBe(true);
    expect(multiCopySwap.draft.mainboard[hareApparent.id]?.quantity).toBe(1);
    expect(multiCopySwap.draft.mainboard[hinter.id]?.quantity).toBe(1);

    // Exact inverse Undo restores Craterhoof to Mainboard & cleans it out of Maybeboard
    const undone = swapCardInDeckDraft(forward.draft, forerunners.id, craterhoof, {
      moveOutToSideboard: false,
      removeInFromSideboard: true,
    });
    expect(undone.swapped).toBe(true);
    expect(undone.draft.mainboard[forerunners.id]).toBeUndefined();
    expect(undone.draft.mainboard[craterhoof.id]?.quantity).toBe(1);
    expect(undone.draft.sideboard[craterhoof.id]).toBeUndefined();

    // Potential savings computation
    const swapResults = findBudgetSwapsForTargets(cards, {
      targetCardIds: [craterhoof.id, breedingPool.id],
      commanderIds: [yarok.id],
      excludeCardIds: excluded,
      colorIdentity: yarok.colorIdentity,
      maxSwapPriceUsd: 2.0,
      perTargetLimit: 3,
    });
    const summary = computeDeckSwapPotentialSavings(draft, swapResults);
    expect(summary.targetsWithSwaps).toBe(2);
    expect(summary.totalPotentialSavingsUsd).toBeGreaterThan(20);
  });

  it('queues and executes FIND_BUDGET_SWAPS safely in SearchWorkerController including error recovery', async () => {
    const sampleCards = [
      makeSyntheticCard({
        id: 'expensive-counter',
        oracleId: 'o-exp-counter',
        name: 'Force of Negation',
        typeLine: 'Instant',
        oracleText: 'Counter target noncreature spell.',
        colors: ['U'],
        colorIdentity: ['U'],
        priceUsd: 40,
        roles: ['removal'],
      }),
      makeSyntheticCard({
        id: 'cheap-counter',
        oracleId: 'o-cheap-counter',
        name: 'Negate',
        typeLine: 'Instant',
        oracleText: 'Counter target noncreature spell.',
        colors: ['U'],
        colorIdentity: ['U'],
        priceUsd: 0.35,
        roles: ['removal'],
      }),
    ];

    let resolveSync: (res: {
      cards: CompactCard[];
      manifest: DataManifest;
      fromCache: boolean;
      loadTimeMs: number;
    }) => void;
    const posted: WorkerResponseMessage[] = [];
    const controller = new SearchWorkerController((msg) => posted.push(msg), {
      clearCache: async () => {},
      syncCatalog: () =>
        new Promise((resolve) => {
          resolveSync = resolve;
        }),
    });

    controller.handleMessage({ type: 'INIT' });
    controller.handleMessage({
      type: 'FIND_BUDGET_SWAPS',
      requestId: 55,
      request: {
        targetCardIds: ['expensive-counter'],
        commanderIds: [],
        excludeCardIds: ['expensive-counter'],
        colorIdentity: ['U'],
        maxSwapPriceUsd: 2,
        perTargetLimit: 4,
      },
    });
    expect(posted).toEqual([]);

    const manifest: DataManifest = {
      version: 'swap-test',
      generatedAt: '2026-11-16T00:00:00.000Z',
      scryfallUpdatedAt: '2026-11-16T00:00:00.000Z',
      totalCards: sampleCards.length,
      commanderCount: 0,
      rawSizeBytes: 100,
      gzipSizeBytes: 50,
      brotliSizeBytes: 40,
      roleCounts: { ramp: 0, draw: 0, removal: 2, wipe: 0, tutor: 0, recursion: 0, protection: 0 },
      themeCounts: {},
    };
    resolveSync!({ cards: sampleCards, manifest, fromCache: true, loadTimeMs: 4 });
    await Promise.resolve();
    await Promise.resolve();

    const swapMsg = posted.find((m) => m.type === 'BUDGET_SWAPS_RESULT');
    expect(swapMsg?.type).toBe('BUDGET_SWAPS_RESULT');
    if (swapMsg?.type === 'BUDGET_SWAPS_RESULT') {
      expect(swapMsg.payload.requestId).toBe(55);
      expect(swapMsg.payload.results[0]?.suggestions.map((s) => s.card.name)).toEqual(['Negate']);
    }

    // Catalog load error resolves queued + subsequent FIND_BUDGET_SWAPS with empty results rather than hanging
    const failedPosts: WorkerResponseMessage[] = [];
    const failing = new SearchWorkerController((msg) => failedPosts.push(msg), {
      clearCache: async () => {},
      syncCatalog: async () => {
        throw new Error('Offline');
      },
    });
    failing.handleMessage({ type: 'INIT' });
    failing.handleMessage({
      type: 'FIND_BUDGET_SWAPS',
      requestId: 77,
      request: {
        targetCardIds: ['x'],
        commanderIds: [],
        excludeCardIds: [],
        colorIdentity: null,
        maxSwapPriceUsd: 2,
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    const failedQueued = failedPosts.find((m) => m.type === 'BUDGET_SWAPS_RESULT');
    expect(failedQueued).toEqual({
      type: 'BUDGET_SWAPS_RESULT',
      payload: { requestId: 77, results: [], executionTimeMs: 0 },
    });

    failing.handleMessage({
      type: 'FIND_BUDGET_SWAPS',
      requestId: 78,
      request: {
        targetCardIds: ['x'],
        commanderIds: [],
        excludeCardIds: [],
        colorIdentity: null,
        maxSwapPriceUsd: 2,
      },
    });
    expect(failedPosts.at(-1)).toEqual({
      type: 'BUDGET_SWAPS_RESULT',
      payload: { requestId: 78, results: [], executionTimeMs: 0 },
    });
  });

  it('renders BudgetSwapsModal and surface triggers cleanly across Workspace, Drawer, Audit, and Detail', () => {
    const yarok = byName.get('Yarok, the Desecrated')!;
    const craterhoof = byName.get('Craterhoof Behemoth')!;
    const forest = byName.get('Forest')!;
    const draft = makeDraft({
      commanders: [yarok],
      mainboard: {
        [craterhoof.id]: { card: craterhoof, quantity: 1 },
        [forest.id]: { card: forest, quantity: 10 },
      },
    });
    const analytics = computeDeckAnalytics(draft);
    const noopFindBudgetSwaps = async (): Promise<BudgetSwapScanResponse> => ({
      requestId: 1,
      results: [],
      executionTimeMs: 1,
    });

    const modalHtml = renderToStaticMarkup(
      <BudgetSwapsModal
        open={true}
        draft={draft}
        totalDeckPriceUsd={30}
        findBudgetSwaps={noopFindBudgetSwaps}
        onSwapCard={() => true}
        onInspectCard={() => {}}
        onClose={() => {}}
      />,
    );
    expect(modalHtml).toContain('Budget Swaps');
    expect(modalHtml).toContain('Replace cards over:');
    expect(modalHtml).toContain('Swaps up to:');
    expect(modalHtml).toContain('Stash cuts in Maybeboard');

    const workspaceHtml = renderToStaticMarkup(
      <DeckWorkspace
        deck={draft}
        analytics={analytics}
        totalDeckPriceUsd={30}
        combinedColorIdentity={yarok.colorIdentity}
        basicLands={{ Forest: forest }}
        onRenameDeck={() => {}}
        onRemoveCommander={() => {}}
        onToggleIdentityLock={() => {}}
        onMatchSynergy={() => {}}
        onFindPartner={() => {}}
        onAddCard={() => {}}
        onRemoveOneCard={() => {}}
        onDeleteCard={() => {}}
        onMoveToSideboard={() => {}}
        onMoveToMainboard={() => {}}
        onAddToSideboard={() => {}}
        onRemoveOneSideboard={() => {}}
        onDeleteSideboard={() => {}}
        onAutoFillBasics={() => {}}
        onMoveIllegalToSideboard={() => {}}
        onQuickFilterRole={() => {}}
        onOpenDeckManager={() => {}}
        onOpenBudgetSwaps={() => {}}
        onChooseCommander={() => {}}
        onInspectCard={() => {}}
      />,
    );
    expect(workspaceHtml).toContain('Budget Swaps');
    expect(workspaceHtml).toContain(`Find budget swaps for ${craterhoof.name}`);

    const drawerHtml = renderToStaticMarkup(
      <QuickDeckDrawer
        open={true}
        deck={draft}
        totalCardCount={12}
        sideboardCardCount={0}
        totalDeckPriceUsd={30}
        combinedColorIdentity={yarok.colorIdentity}
        onClose={() => {}}
        onRenameDeck={() => {}}
        onRemoveCommander={() => {}}
        onAddCard={() => {}}
        onRemoveOneCard={() => {}}
        onDeleteCard={() => {}}
        onMoveToSideboard={() => {}}
        onMoveToMainboard={() => {}}
        onDeleteSideboard={() => {}}
        onClearDeck={() => {}}
        onToggleIdentityLock={() => {}}
        onMatchSynergy={() => {}}
        onOpenFullWorkspace={() => {}}
        onOpenDeckManager={() => {}}
        onOpenBudgetSwaps={() => {}}
        onInspectCard={() => {}}
      />,
    );
    expect(drawerHtml).toContain('Budget Swaps');

    const auditHtml = renderToStaticMarkup(
      <DeckAuditModal
        open={true}
        activeDeck={draft}
        activeDeckPriceUsd={30}
        initialAuditResult={{ draft, missingNames: [], isCurrentDeck: false }}
        initialUpgradeMatches={[]}
        resolveCards={async () => ({ byId: {}, byName: {} })}
        findBudgetSwaps={noopFindBudgetSwaps}
        onClose={() => {}}
        onImportDeckDraft={() => {}}
        onFindMissingRole={() => {}}
      />,
    );
    expect(auditHtml).toContain('Budget Swaps');

    const detailHtml = renderToStaticMarkup(
      <CardDetailModal
        match={{ card: craterhoof, synergyScore: 0, matchedReasons: [] }}
        commanders={[yarok]}
        enforceColorIdentity={true}
        quantityInDeck={1}
        isCommander={false}
        findBudgetSwaps={noopFindBudgetSwaps}
        onSwapInDeck={() => true}
        onClose={() => {}}
        onAddCard={() => {}}
        onRemoveOneCard={() => {}}
        onSetCommander={() => {}}
        onAddPartner={() => {}}
        onFilterByRole={() => {}}
        onFilterByTheme={() => {}}
        onFindSimilar={() => {}}
      />,
    );
    expect(detailHtml).toContain('Budget Alternatives');

    // Basic lands / sub-$1.50 cards should NOT clutter CardDetailModal with Budget Alternatives button
    const cheapDetailHtml = renderToStaticMarkup(
      <CardDetailModal
        match={{ card: forest, synergyScore: 0, matchedReasons: [] }}
        commanders={[yarok]}
        enforceColorIdentity={true}
        quantityInDeck={10}
        isCommander={false}
        findBudgetSwaps={noopFindBudgetSwaps}
        onSwapInDeck={() => true}
        onClose={() => {}}
        onAddCard={() => {}}
        onRemoveOneCard={() => {}}
        onSetCommander={() => {}}
        onAddPartner={() => {}}
        onFilterByRole={() => {}}
        onFilterByTheme={() => {}}
        onFindSimilar={() => {}}
      />,
    );
    expect(cheapDetailHtml).not.toContain('Budget Alternatives');
  });
});
