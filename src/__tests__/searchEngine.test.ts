import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildCommanderSynergyQuery,
  canPairCommanders,
  getChooseCommanderFilter,
  getCombinedColorIdentity,
  getCompatiblePartnerFilter,
} from '../search/commanderRules.js';
import { CardSearchEngine } from '../search/searchEngine.js';
import type { CompactCard } from '../types/card.js';
import { DEFAULT_SEARCH_FILTER, type SearchFilter } from '../types/search.js';

function withFilter(patch: Partial<SearchFilter>): SearchFilter {
  return { ...DEFAULT_SEARCH_FILTER, ...patch };
}

describe('CardSearchEngine against real 31,597-card Commander catalog', () => {
  let realCards: CompactCard[] = [];
  let engine: CardSearchEngine;
  let indexBuildTimeMs = 0;

  beforeAll(() => {
    const cardsPath = path.resolve(process.cwd(), 'public', 'data', 'cards.min.json');
    realCards = JSON.parse(readFileSync(cardsPath, 'utf8')) as CompactCard[];

    const start = performance.now();
    engine = new CardSearchEngine(realCards);
    indexBuildTimeMs = performance.now() - start;
  });

  it('indexes all ~31,597 cards in under 100ms', () => {
    expect(engine.totalCount).toBeGreaterThan(28_000);
    expect(indexBuildTimeMs).toBeLessThan(100);
  });

  it('executes complex queries across all 31,597 cards in under 25ms', () => {
    const broadRes = engine.search(withFilter({}));
    expect(broadRes.totalMatches).toBe(engine.totalCount);
    expect(broadRes.executionTimeMs).toBeLessThan(25);

    const complexRes = engine.search(
      withFilter({
        colorIdentity: ['B', 'R', 'G'],
        roles: ['ramp'],
        cmcOperator: '<=',
        cmcValue: 3,
        maxPriceUsd: 10,
        sortBy: 'price-asc',
      }),
    );
    expect(complexRes.totalMatches).toBeGreaterThan(20);
    expect(complexRes.executionTimeMs).toBeLessThan(25);

    const themeRes = engine.search(
      withFilter({
        colorIdentity: ['B', 'R', 'G'],
        themeQuery: 'aristocrats sacrifice tokens',
      }),
    );
    expect(themeRes.totalMatches).toBeGreaterThan(50);
    expect(themeRes.executionTimeMs).toBeLessThan(25);
  });

  it('enforces strict Commander Color Identity bitmask lock', () => {
    const golgariRes = engine.search(
      withFilter({
        colorIdentity: ['B', 'G'],
        pageSize: 200,
      }),
    );

    expect(golgariRes.matches.length).toBeGreaterThan(0);
    for (const { card } of golgariRes.matches) {
      for (const c of card.colorIdentity) {
        expect(['B', 'G']).toContain(c);
      }
    }

    // Colorless lock must only allow cards with empty colorIdentity
    const colorlessRes = engine.search(
      withFilter({
        colorIdentity: [],
        pageSize: 100,
      }),
    );
    expect(colorlessRes.totalMatches).toBeGreaterThan(500);
    for (const { card } of colorlessRes.matches) {
      expect(card.colorIdentity).toEqual([]);
    }
  });

  it('supports card color matching modes (include, exact, at-most, colorlessOnly)', () => {
    const exactAzorius = engine.search(
      withFilter({
        colors: ['W', 'U'],
        colorMatchMode: 'exact',
      }),
    );
    expect(exactAzorius.totalMatches).toBeGreaterThan(50);
    for (const { card } of exactAzorius.matches) {
      expect(card.colors).toEqual(['W', 'U']);
    }

    const colorlessCards = engine.search(
      withFilter({
        colorlessOnly: true,
      }),
    );
    for (const { card } of colorlessCards.matches) {
      expect(card.colors).toEqual([]);
    }
  });

  it('supports CMC operators, card types without Island/Land collision, and subtypes', () => {
    const zeroMvArtifacts = engine.search(
      withFilter({
        cardTypes: ['Artifact'],
        cmcOperator: '=',
        cmcValue: 0,
      }),
    );
    expect(zeroMvArtifacts.totalMatches).toBeGreaterThan(20);
    for (const { card } of zeroMvArtifacts.matches) {
      expect(card.cmc).toBe(0);
      expect(card.typeLine.toLowerCase()).toContain('artifact');
    }

    // Filtering by Land should include Lands, and never non-land cards with "Island" in name/subtype
    const landsOnly = engine.search(
      withFilter({
        cardTypes: ['Land'],
        pageSize: 100,
      }),
    );
    expect(landsOnly.totalMatches).toBeGreaterThan(500);
    for (const { card } of landsOnly.matches) {
      expect(card.typeLine).toMatch(/\bLand\b/);
    }

    const dragons = engine.search(
      withFilter({
        subtypes: ['Dragon'],
        commanderOnly: true,
      }),
    );
    expect(dragons.totalMatches).toBeGreaterThan(30);
    expect(dragons.matches.some((m) => m.card.name.includes('Korvold'))).toBe(true);
  });

  it('supports exact quoted phrase search and multi-word query matching', () => {
    const exactPhrase = engine.search(
      withFilter({
        query: '"whenever you sacrifice a permanent"',
      }),
    );
    expect(exactPhrase.totalMatches).toBeGreaterThan(0);
    expect(
      exactPhrase.matches.some((m) => m.card.name === 'Korvold, Fae-Cursed King'),
    ).toBe(true);

    const multiWord = engine.search(
      withFilter({
        query: 'sol ring',
      }),
    );
    expect(multiWord.matches[0]?.card.name).toBe('Sol Ring');
  });

  it('scores and ranks cards via Method A Theme Matcher with human-readable reasons', () => {
    const aristocrats = engine.search(
      withFilter({
        colorIdentity: ['W', 'B'],
        themeQuery: 'aristocrats sacrifice tokens',
        pageSize: 60,
      }),
    );

    expect(aristocrats.totalMatches).toBeGreaterThan(50);
    const topMatches = aristocrats.matches;
    expect(topMatches[0]!.synergyScore).toBeGreaterThanOrEqual(
      topMatches[topMatches.length - 1]!.synergyScore,
    );
    expect(topMatches[0]!.matchedReasons.length).toBeGreaterThan(0);

    // Cards hitting all three concepts (aristocrats + sacrifice + tokens) should rank highest
    const topNames = new Set(topMatches.map((m) => m.card.name));
    expect(
      topNames.has('Bastion of Remembrance') ||
        topNames.has('Pitiless Plunderer') ||
        topNames.has('Elenda, the Dusk Rose') ||
        topNames.has('Warren Soultrader'),
    ).toBe(true);

    // Pure aristocrats query should surface Blood Artist / Zulaport Cutthroat / Cruel Celebrant
    const pureAristocrats = engine.search(
      withFilter({
        colorIdentity: ['W', 'B'],
        themeQuery: 'aristocrats',
        pageSize: 60,
      }),
    );
    const pureNames = new Set(pureAristocrats.matches.map((m) => m.card.name));
    expect(
      pureNames.has('Zulaport Cutthroat') ||
        pureNames.has('Blood Artist') ||
        pureNames.has('Cruel Celebrant'),
    ).toBe(true);
  });

  it('supports Commander-only, partnerType, price cap, sorting, pagination, and getCardsByIds', () => {
    const partnerWith = engine.search(
      withFilter({
        commanderOnly: true,
        partnerType: 'partner-with',
      }),
    );
    expect(partnerWith.totalMatches).toBeGreaterThan(10);
    for (const { card } of partnerWith.matches) {
      expect(card.isCommanderEligible).toBe(true);
      expect(card.partnerType).toBe('partner-with');
    }

    const budgetAsc = engine.search(
      withFilter({
        roles: ['removal'],
        maxPriceUsd: 1,
        sortBy: 'price-asc',
        pageSize: 20,
      }),
    );
    expect(budgetAsc.matches.length).toBe(20);
    for (let i = 1; i < budgetAsc.matches.length; i++) {
      const prev = budgetAsc.matches[i - 1]!.card.priceUsd!;
      const curr = budgetAsc.matches[i]!.card.priceUsd!;
      expect(curr).toBeLessThanOrEqual(1);
      expect(prev).toBeLessThanOrEqual(curr);
    }

    const page1 = engine.search(withFilter({ page: 1, pageSize: 10 }));
    const page2 = engine.search(withFilter({ page: 2, pageSize: 10 }));
    expect(page1.matches[0]!.card.id).not.toBe(page2.matches[0]!.card.id);

    const ids = page1.matches.slice(0, 3).map((m) => m.card.id);
    const fetched = engine.getCardsByIds(ids);
    expect(fetched.map((c) => c.id)).toEqual(ids);
  });

  it('integrates getCompatiblePartnerFilter and buildCommanderSynergyQuery against the real catalog', () => {
    const backgroundCmd = realCards.find(
      (c) => c.isCommanderEligible && c.partnerType === 'choose-background',
    );
    expect(backgroundCmd).toBeDefined();

    const bgPartnerFilter = getCompatiblePartnerFilter(backgroundCmd!);
    expect(bgPartnerFilter).not.toBeNull();
    const bgResults = engine.search(withFilter({ ...bgPartnerFilter!, pageSize: 50 }));
    expect(bgResults.totalMatches).toBeGreaterThan(15);
    for (const { card } of bgResults.matches) {
      expect(canPairCommanders(backgroundCmd!, card)).toBe(true);
    }

    const pir = realCards.find(
      (c) => c.name === 'Pir, Imaginative Rascal' && c.partnerType === 'partner-with',
    );
    expect(pir).toBeDefined();
    const pirPartnerFilter = getCompatiblePartnerFilter(pir!);
    expect(pirPartnerFilter).not.toBeNull();
    const pirResults = engine.search(withFilter(pirPartnerFilter!));
    expect(pirResults.matches.some((m) => m.card.name === 'Toothy, Imaginary Friend')).toBe(true);

    const korvold = realCards.find((c) => c.name === 'Korvold, Fae-Cursed King');
    expect(korvold).toBeDefined();
    const synergyQuery = buildCommanderSynergyQuery([korvold!]);
    expect(synergyQuery.length).toBeGreaterThan(0);

    const synergyRes = engine.search(
      withFilter({
        colorIdentity: getCombinedColorIdentity([korvold!]),
        themeQuery: synergyQuery,
        sortBy: 'synergy',
        pageSize: 48,
      }),
    );
    expect(synergyRes.executionTimeMs).toBeLessThan(25);
    expect(synergyRes.totalMatches).toBeGreaterThan(50);
    expect(synergyRes.matches[0]!.synergyScore).toBeGreaterThan(0);
    for (const { card } of synergyRes.matches) {
      for (const color of card.colorIdentity) {
        expect(['B', 'R', 'G']).toContain(color);
      }
    }
  });

  it('resolves cards by exact name, case-insensitive name, front-face DFC alias, and canonical basic lands', () => {
    const resolved = engine.getCardsByNames([
      'sol ring',
      'Arcane Signet',
      'Bala Ged Recovery',
      'Does Not Exist Card 999',
    ]);

    expect(resolved['sol ring']?.name).toBe('Sol Ring');
    expect(resolved['arcane signet']?.name).toBe('Arcane Signet');
    expect(resolved['bala ged recovery']?.name).toBe('Bala Ged Recovery // Bala Ged Sanctuary');
    expect(resolved['does not exist card 999']).toBeUndefined();

    const basics = engine.getBasicLands();
    for (const landName of ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes']) {
      expect(basics[landName]).toBeDefined();
      expect(basics[landName]?.maxCopies).toBeNull();
    }
  });

  it('includes restored Reserved List staples and sorts price-desc correctly above Gaea\'s Cradle (BUG-001)', () => {
    const priceDesc = engine.search(withFilter({ sortBy: 'price-desc', pageSize: 15 }));
    const topNames = priceDesc.matches.map((m) => m.card.name);

    // Cards above Gaea's Cradle must have higher USD prices and strictly non-increasing prices
    for (let i = 1; i < priceDesc.matches.length; i++) {
      expect(priceDesc.matches[i - 1]!.card.priceUsd!).toBeGreaterThanOrEqual(
        priceDesc.matches[i]!.card.priceUsd!,
      );
    }

    const cradleIndex = topNames.indexOf("Gaea's Cradle");
    const twisterIndex = topNames.indexOf('Timetwister');
    expect(twisterIndex).toBeGreaterThanOrEqual(0);
    expect(cradleIndex).toBeGreaterThan(twisterIndex);

    const staples = engine.getCardsByNames([
      'Timetwister',
      'Underground Sea',
      'Mox Diamond',
      'The Tabernacle at Pendrell Vale',
      'Crucible of Worlds',
    ]);
    for (const name of [
      'Timetwister',
      'Underground Sea',
      'Mox Diamond',
      'The Tabernacle at Pendrell Vale',
      'Crucible of Worlds',
    ]) {
      const card = staples[name.toLowerCase()];
      expect(card).toBeDefined();
      expect(card!.priceUsd).not.toBeNull();
      expect(card!.priceUsd!).toBeGreaterThan(0);
    }
  });

  it('filters exclusively to eligible commanders when using getChooseCommanderFilter', () => {
    const cmdFilter = getChooseCommanderFilter({ sortBy: 'synergy', pageSize: 48 });
    const result = engine.search(cmdFilter);

    expect(cmdFilter.commanderOnly).toBe(true);
    expect(cmdFilter.sortBy).toBe('edhrec');
    expect(result.totalMatches).toBeGreaterThan(3_700);
    expect(result.totalMatches).toBeLessThan(engine.totalCount);
    expect(result.matches.length).toBe(48);
    expect(result.executionTimeMs).toBeLessThan(25);
    for (const { card } of result.matches) {
      expect(card.isCommanderEligible).toBe(true);
    }
  });

  it('resolves both card.id and oracleId fallback in getCardsByIdMap, getCardsByIds, and getOracleIdMap', () => {
    const solRing = engine.getCardByName('Sol Ring')!;
    const korvold = engine.getCardByName('Korvold, Fae-Cursed King')!;
    expect(solRing).toBeDefined();
    expect(korvold).toBeDefined();
    expect(solRing.id).not.toBe(solRing.oracleId);
    expect(korvold.id).not.toBe(korvold.oracleId);

    const byIdMap = engine.getCardsByIdMap([
      solRing.id,
      korvold.oracleId,
      'missing-card-id',
    ]);
    expect(byIdMap[solRing.id]?.name).toBe('Sol Ring');
    expect(byIdMap[korvold.oracleId]?.name).toBe('Korvold, Fae-Cursed King');
    expect(byIdMap['missing-card-id']).toBeUndefined();

    const byIds = engine.getCardsByIds([
      solRing.oracleId,
      korvold.id,
      'missing-card-id',
    ]);
    expect(byIds.map((c) => c.name)).toEqual([
      'Sol Ring',
      'Korvold, Fae-Cursed King',
    ]);

    const oracleMap = engine.getOracleIdMap([solRing.id, korvold.oracleId, 'missing']);
    expect(oracleMap).toEqual({
      [solRing.id]: solRing.oracleId,
      [korvold.oracleId]: korvold.oracleId,
    });

    // Direct card.id lookup takes precedence over oracleId fallback if an ID collides
    const firstPrinting: CompactCard = {
      ...solRing,
      id: 'printing-1',
      oracleId: 'shared-oracle',
      name: 'First Printing',
    };
    const secondPrinting: CompactCard = {
      ...solRing,
      id: 'printing-2',
      oracleId: 'shared-oracle',
      name: 'Second Printing',
    };
    const syntheticEngine = new CardSearchEngine([firstPrinting, secondPrinting]);

    const syntheticMap = syntheticEngine.getCardsByIdMap(['printing-2', 'shared-oracle']);
    expect(syntheticMap['printing-2']?.name).toBe('Second Printing');
    expect(syntheticMap['shared-oracle']?.name).toBe('First Printing');
    expect(
      syntheticEngine.getCardsByIds(['shared-oracle', 'printing-2']).map((c) => c.id),
    ).toEqual(['printing-1', 'printing-2']);

    // Verify cardByOracleId stays lazy across constructor and card.id hits, building only on miss
    const lazyEngine = new CardSearchEngine(realCards);
    expect(
      (lazyEngine as unknown as { cardByOracleId: Map<string, CompactCard> | null }).cardByOracleId,
    ).toBeNull();
    expect(lazyEngine.getCardsByIdMap([solRing.id])[solRing.id]?.name).toBe('Sol Ring');
    expect(lazyEngine.getOracleIdMap([solRing.id])).toEqual({ [solRing.id]: solRing.oracleId });
    expect(
      (lazyEngine as unknown as { cardByOracleId: Map<string, CompactCard> | null }).cardByOracleId,
    ).toBeNull();

    expect(lazyEngine.getOracleIdMap([korvold.oracleId])).toEqual({
      [korvold.oracleId]: korvold.oracleId,
    });
    expect(
      (lazyEngine as unknown as { cardByOracleId: Map<string, CompactCard> | null }).cardByOracleId,
    ).toBeInstanceOf(Map);
    expect(lazyEngine.getCardsByIds([solRing.oracleId]).map((c) => c.name)).toEqual(['Sol Ring']);
  });
});
