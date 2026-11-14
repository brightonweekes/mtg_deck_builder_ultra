import { describe, expect, it } from 'vitest';
import {
  buildCommanderSynergyQuery,
  canAddCardToDeck,
  canHaveSecondCommander,
  canPairCommanders,
  getChooseCommanderFilter,
  getCombinedColorIdentity,
  getCompatiblePartnerFilter,
  getMaxAllowedCopies,
  isCardWithinColorIdentity,
} from '../search/commanderRules.js';
import type { CompactCard } from '../types/card.js';
import { DEFAULT_SEARCH_FILTER } from '../types/search.js';

function makeCard(overrides: Partial<CompactCard> = {}): CompactCard {
  const id = overrides.id ?? 'card-1';
  const name = overrides.name ?? 'Test Card';
  return {
    id,
    oracleId: `oracle-${id}`,
    name,
    manaCost: '{2}',
    cmc: 2,
    typeLine: 'Legendary Creature — Human Wizard',
    oracleText: '',
    colors: [],
    colorIdentity: [],
    keywords: [],
    edhrecRank: 100,
    priceUsd: 1.0,
    imageNormal: '',
    imageSmall: '',
    layout: 'normal',
    isCommanderEligible: true,
    roles: [],
    themes: [],
    ...overrides,
  };
}

describe('commanderRules', () => {
  it('identifies whether a commander supports a second commander', () => {
    expect(canHaveSecondCommander(makeCard({ partnerType: 'partner' }))).toBe(true);
    expect(canHaveSecondCommander(makeCard({ partnerType: 'choose-background' }))).toBe(true);
    expect(canHaveSecondCommander(makeCard({ partnerType: undefined }))).toBe(false);
    expect(
      canHaveSecondCommander(makeCard({ isCommanderEligible: false, partnerType: 'partner' })),
    ).toBe(false);
  });

  it('validates all 5 Commander pairing mechanics and rejects invalid combinations', () => {
    const thrasios = makeCard({
      id: 'p1',
      name: 'Thrasios, Triton Hero',
      partnerType: 'partner',
    });
    const tymna = makeCard({
      id: 'p2',
      name: 'Tymna the Weaver',
      partnerType: 'partner',
    });
    const eleven = makeCard({
      id: 'ff1',
      name: 'Cecily, Haunted Mage',
      partnerType: 'friends-forever',
    });
    const mike = makeCard({
      id: 'ff2',
      name: 'Othelm, Sigardian Outcast',
      partnerType: 'friends-forever',
    });
    const pir = makeCard({
      id: 'pw1',
      name: 'Pir, Imaginative Rascal',
      partnerType: 'partner-with',
      partnerWithName: 'Toothy, Imaginary Friend',
    });
    const toothy = makeCard({
      id: 'pw2',
      name: 'Toothy, Imaginary Friend',
      partnerType: 'partner-with',
      partnerWithName: 'Pir, Imaginative Rascal',
    });
    const blas = makeCard({
      id: 'pw3',
      name: 'Nikara, Lair Scavenger',
      partnerType: 'partner-with',
      partnerWithName: 'Yannik, Scavenging Sentinel',
    });
    const karlach = makeCard({
      id: 'cb1',
      name: 'Karlach, Fury of Avernus',
      partnerType: 'choose-background',
    });
    const folkHero = makeCard({
      id: 'bg1',
      name: 'Folk Hero',
      typeLine: 'Legendary Enchantment — Background',
      partnerType: 'background',
    });
    const doctor = makeCard({
      id: 'dr1',
      name: 'The Tenth Doctor',
      typeLine: 'Legendary Creature — Time Lord Doctor',
      partnerType: 'time-lord-doctor',
    });
    const companion = makeCard({
      id: 'dc1',
      name: 'Rose Tyler',
      partnerType: 'doctors-companion',
    });
    const regularCmd = makeCard({
      id: 'reg1',
      name: 'Atraxa, Praetors’ Voice',
    });

    // Valid pairings
    expect(canPairCommanders(thrasios, tymna)).toBe(true);
    expect(canPairCommanders(eleven, mike)).toBe(true);
    expect(canPairCommanders(pir, toothy)).toBe(true);
    expect(canPairCommanders(karlach, folkHero)).toBe(true);
    expect(canPairCommanders(folkHero, karlach)).toBe(true);
    expect(canPairCommanders(doctor, companion)).toBe(true);
    expect(canPairCommanders(companion, doctor)).toBe(true);

    // Invalid cross-mechanic & duplicate pairings
    expect(canPairCommanders(thrasios, thrasios)).toBe(false);
    expect(canPairCommanders(thrasios, makeCard({ id: 'p1-alt', name: 'Thrasios, Triton Hero', partnerType: 'partner' }))).toBe(false);
    expect(canPairCommanders(thrasios, eleven)).toBe(false);
    expect(canPairCommanders(thrasios, folkHero)).toBe(false);
    expect(canPairCommanders(pir, blas)).toBe(false);
    expect(canPairCommanders(karlach, karlach)).toBe(false);
    expect(canPairCommanders(karlach, makeCard({ id: 'cb2', name: 'Jaheira', partnerType: 'choose-background' }))).toBe(false);
    expect(canPairCommanders(folkHero, makeCard({ id: 'bg2', name: 'Cultist', partnerType: 'background' }))).toBe(false);
    expect(canPairCommanders(doctor, makeCard({ id: 'dr2', name: 'The Eleventh Doctor', partnerType: 'time-lord-doctor' }))).toBe(false);
    expect(canPairCommanders(companion, makeCard({ id: 'dc2', name: 'Clara Oswald', partnerType: 'doctors-companion' }))).toBe(false);
    expect(canPairCommanders(thrasios, regularCmd)).toBe(false);
    expect(canPairCommanders(thrasios, makeCard({ id: 'nc', name: 'Not Legal', isCommanderEligible: false, partnerType: 'partner' }))).toBe(false);
  });

  it('merges combined color identity in canonical WUBRG order and checks 99 legality', () => {
    const c1 = makeCard({ id: '1', name: 'Cmd1', colorIdentity: ['G', 'U'] });
    const c2 = makeCard({ id: '2', name: 'Cmd2', colorIdentity: ['B', 'W', 'U'] });

    expect(getCombinedColorIdentity([])).toEqual([]);
    expect(getCombinedColorIdentity([c1])).toEqual(['U', 'G']);
    expect(getCombinedColorIdentity([c1, c2])).toEqual(['W', 'U', 'B', 'G']);

    const solRing = makeCard({ id: 'sr', name: 'Sol Ring', colorIdentity: [], isCommanderEligible: false });
    const dovescape = makeCard({ id: 'ds', name: 'Dovescape', colorIdentity: ['W', 'U'], isCommanderEligible: false });
    const lightningBolt = makeCard({ id: 'lb', name: 'Lightning Bolt', colorIdentity: ['R'], isCommanderEligible: false });

    expect(isCardWithinColorIdentity(solRing, [])).toBe(true);
    expect(isCardWithinColorIdentity(dovescape, ['W', 'U', 'B', 'G'])).toBe(true);
    expect(isCardWithinColorIdentity(lightningBolt, ['W', 'U', 'B', 'G'])).toBe(false);
  });

  it('enforces copy limits (singleton, custom 7/9 caps, unlimited) and Commander zone/color checks', () => {
    const cmd = makeCard({
      id: 'cmd-g',
      name: 'Omnath, Locus of Mana',
      colorIdentity: ['G'],
    });
    const llanowar = makeCard({
      id: 'llano',
      name: 'Llanowar Elves',
      typeLine: 'Creature — Elf Druid',
      colorIdentity: ['G'],
      isCommanderEligible: false,
    });
    const forest = makeCard({
      id: 'forest',
      name: 'Forest',
      typeLine: 'Basic Land — Forest',
      colorIdentity: ['G'],
      isCommanderEligible: false,
      maxCopies: null,
    });
    const dwarves = makeCard({
      id: '7d',
      name: 'Seven Dwarves',
      typeLine: 'Creature — Dwarf',
      colorIdentity: ['R'],
      isCommanderEligible: false,
      maxCopies: 7,
    });
    const nazgul = makeCard({
      id: 'naz',
      name: 'Nazgul',
      typeLine: 'Creature — Wraith Knight',
      colorIdentity: ['B'],
      isCommanderEligible: false,
      maxCopies: 9,
    });
    const counterspell = makeCard({
      id: 'cs',
      name: 'Counterspell',
      typeLine: 'Instant',
      colorIdentity: ['U'],
      isCommanderEligible: false,
    });

    expect(getMaxAllowedCopies(llanowar)).toBe(1);
    expect(getMaxAllowedCopies(forest)).toBe(Infinity);
    expect(getMaxAllowedCopies(dwarves)).toBe(7);
    expect(getMaxAllowedCopies(nazgul)).toBe(9);

    // Already in Command Zone
    expect(canAddCardToDeck(cmd, 0, [cmd], true)).toEqual({
      allowed: false,
      reason: 'Already in Command Zone',
    });

    // Color identity checks
    expect(canAddCardToDeck(counterspell, 0, [cmd], true)).toEqual({
      allowed: false,
      reason: 'Outside Commander color identity',
    });
    expect(canAddCardToDeck(counterspell, 0, [cmd], false)).toEqual({ allowed: true });
    expect(canAddCardToDeck(counterspell, 0, [], true)).toEqual({ allowed: true });

    // Singleton limit
    expect(canAddCardToDeck(llanowar, 0, [cmd], true)).toEqual({ allowed: true });
    expect(canAddCardToDeck(llanowar, 1, [cmd], true)).toEqual({
      allowed: false,
      reason: 'Singleton limit (1 copy)',
    });

    // Basic land unlimited copies
    expect(canAddCardToDeck(forest, 35, [cmd], true)).toEqual({ allowed: true });

    // Seven Dwarves / Nazgul special limits
    expect(canAddCardToDeck(dwarves, 6, [], false)).toEqual({ allowed: true });
    expect(canAddCardToDeck(dwarves, 7, [], false)).toEqual({
      allowed: false,
      reason: 'Max copies (7) reached',
    });
    expect(canAddCardToDeck(nazgul, 8, [], false)).toEqual({ allowed: true });
    expect(canAddCardToDeck(nazgul, 9, [], false)).toEqual({
      allowed: false,
      reason: 'Max copies (9) reached',
    });
  });

  it('builds Method A commander synergy queries prioritized by themes then roles (max 6 tags)', () => {
    const korvold = makeCard({
      id: 'k',
      name: 'Korvold',
      themes: ['aristocrats', 'tokens', 'counters', 'treasures'],
      roles: ['draw'],
    });
    const companion = makeCard({
      id: 'c',
      name: 'Partner',
      themes: ['tokens', 'graveyard'],
      roles: ['ramp', 'recursion'],
    });

    const q = buildCommanderSynergyQuery([korvold, companion]);
    expect(q).toBe('aristocrats tokens counters treasures graveyard draw');
    expect(q.split(' ').length).toBeLessThanOrEqual(6);
    expect(buildCommanderSynergyQuery([makeCard()])).toBe('');
  });

  it('produces compatible partner search filters for all partner mechanics', () => {
    expect(
      getCompatiblePartnerFilter(makeCard({ partnerType: 'partner' })),
    ).toEqual({ commanderOnly: true, partnerType: 'partner', query: '' });

    expect(
      getCompatiblePartnerFilter(makeCard({ partnerType: 'friends-forever' })),
    ).toEqual({ commanderOnly: true, partnerType: 'friends-forever', query: '' });

    expect(
      getCompatiblePartnerFilter(makeCard({ partnerType: 'choose-background' })),
    ).toEqual({ commanderOnly: true, partnerType: 'background', query: '' });

    expect(
      getCompatiblePartnerFilter(makeCard({ partnerType: 'background' })),
    ).toEqual({ commanderOnly: true, partnerType: 'choose-background', query: '' });

    expect(
      getCompatiblePartnerFilter(makeCard({ partnerType: 'time-lord-doctor' })),
    ).toEqual({ commanderOnly: true, partnerType: 'doctors-companion', query: '' });

    expect(
      getCompatiblePartnerFilter(makeCard({ partnerType: 'doctors-companion' })),
    ).toEqual({ commanderOnly: true, partnerType: 'time-lord-doctor', query: '' });

    expect(
      getCompatiblePartnerFilter(
        makeCard({
          partnerType: 'partner-with',
          partnerWithName: 'Toothy, Imaginary Friend',
        }),
      ),
    ).toEqual({
      commanderOnly: true,
      partnerType: 'partner-with',
      query: '"Toothy, Imaginary Friend"',
    });

    expect(getCompatiblePartnerFilter(makeCard({ partnerType: undefined }))).toBeNull();
  });

  it('builds a clean commander-only catalog filter for Studio Choose Commander action', () => {
    expect(getChooseCommanderFilter()).toEqual({
      ...DEFAULT_SEARCH_FILTER,
      commanderOnly: true,
    });

    expect(
      getChooseCommanderFilter({
        sortBy: 'price-desc',
        pageSize: 96,
      }),
    ).toEqual({
      ...DEFAULT_SEARCH_FILTER,
      commanderOnly: true,
      sortBy: 'price-desc',
      pageSize: 96,
    });

    expect(
      getChooseCommanderFilter({
        sortBy: 'synergy',
        pageSize: 48,
      }),
    ).toEqual({
      ...DEFAULT_SEARCH_FILTER,
      commanderOnly: true,
      sortBy: 'edhrec',
      pageSize: 48,
    });
  });
});
