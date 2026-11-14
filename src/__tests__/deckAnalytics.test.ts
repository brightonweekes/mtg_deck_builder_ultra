import { describe, expect, it } from 'vitest';
import {
  computeBasicLandAutoFill,
  computeDeckAnalytics,
} from '../deck/deckAnalytics.js';
import type { CompactCard } from '../types/card.js';
import type { DeckDraft } from '../types/deck.js';

function makeCard(overrides: Partial<CompactCard> = {}): CompactCard {
  const id = overrides.id ?? 'c-1';
  return {
    id,
    oracleId: `oracle-${id}`,
    name: overrides.name ?? 'Card',
    manaCost: '{2}',
    cmc: 2,
    typeLine: 'Artifact',
    oracleText: '',
    colors: [],
    colorIdentity: [],
    keywords: [],
    edhrecRank: 50,
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

function makeDraft(overrides: Partial<DeckDraft> = {}): DeckDraft {
  return {
    id: 'deck-test',
    name: 'Test Deck',
    commanders: [],
    mainboard: {},
    sideboard: {},
    lockSearchToCommanderIdentity: true,
    createdAt: '2026-11-13T00:00:00.000Z',
    updatedAt: '2026-11-13T00:00:00.000Z',
    ...overrides,
  };
}

describe('deckAnalytics', () => {
  it('computes CMC buckets, average CMC, pip demand, mana sources, and role counts while ignoring sideboard', () => {
    const cmd = makeCard({
      id: 'cmd',
      name: 'Meren of Clan Nel Toth',
      manaCost: '{2}{B}{G}',
      cmc: 4,
      typeLine: 'Legendary Creature — Human Shaman',
      colors: ['B', 'G'],
      colorIdentity: ['B', 'G'],
      isCommanderEligible: true,
      roles: ['recursion'],
    });
    const llanowar = makeCard({
      id: 'elf',
      name: 'Llanowar Elves',
      manaCost: '{G}',
      cmc: 1,
      typeLine: 'Creature — Elf Druid',
      oracleText: '{T}: Add {G}.',
      colors: ['G'],
      colorIdentity: ['G'],
      roles: ['ramp'],
    });
    const hybridSpell = makeCard({
      id: 'hybrid',
      name: 'Assassin Hybrid Test',
      manaCost: '{1}{B/G}{B}',
      cmc: 3,
      typeLine: 'Instant',
      colors: ['B', 'G'],
      colorIdentity: ['B', 'G'],
      roles: ['removal'],
    });
    const highDrop = makeCard({
      id: 'crater',
      name: 'Craterhoof Behemoth',
      manaCost: '{5}{G}{G}{G}',
      cmc: 8,
      typeLine: 'Creature — Beast',
      colors: ['G'],
      colorIdentity: ['G'],
    });
    const solRing = makeCard({
      id: 'sol',
      name: 'Sol Ring',
      manaCost: '{1}',
      cmc: 1,
      typeLine: 'Artifact',
      oracleText: '{T}: Add {C}{C}.',
      roles: ['ramp'],
    });
    const commandTower = makeCard({
      id: 'tower',
      name: 'Command Tower',
      manaCost: '',
      cmc: 0,
      typeLine: 'Land',
      oracleText: "{T}: Add one mana of any color in your commander's color identity.",
      roles: ['ramp'],
    });
    const swamp = makeCard({
      id: 'swamp',
      name: 'Swamp',
      manaCost: '',
      cmc: 0,
      typeLine: 'Basic Land — Swamp',
      colorIdentity: ['B'],
      maxCopies: null,
    });
    const benched = makeCard({
      id: 'sb1',
      name: 'Rhystic Study',
      manaCost: '{2}{U}',
      cmc: 3,
      typeLine: 'Enchantment',
      colorIdentity: ['U'],
      roles: ['draw'],
    });

    const deck = makeDraft({
      commanders: [cmd],
      mainboard: {
        [llanowar.id]: { card: llanowar, quantity: 1 },
        [hybridSpell.id]: { card: hybridSpell, quantity: 1 },
        [highDrop.id]: { card: highDrop, quantity: 1 },
        [solRing.id]: { card: solRing, quantity: 1 },
        [commandTower.id]: { card: commandTower, quantity: 1 },
        [swamp.id]: { card: swamp, quantity: 3 },
      },
      sideboard: {
        [benched.id]: { card: benched, quantity: 1 },
      },
    });

    const report = computeDeckAnalytics(deck);

    // 1 cmd + 8 mainboard = 9 (sideboard ignored from 100-card stats)
    expect(report.commanderCount).toBe(1);
    expect(report.mainboardCount).toBe(8);
    expect(report.totalCount).toBe(9);
    expect(report.sideboardCount).toBe(1);
    expect(report.landCount).toBe(4); // tower + 3 swamps
    expect(report.nonLandCount).toBe(4); // elf, hybrid, craterhoof, solRing

    // Buckets: MV 1 -> 2 (elf creature, sol ring non-creature), MV 3 -> 1, MV 7+ -> 1
    expect(report.cmcBuckets[1]).toEqual({ label: '1', total: 2, creatures: 1, nonCreatures: 1 });
    expect(report.cmcBuckets[3]).toEqual({ label: '3', total: 1, creatures: 0, nonCreatures: 1 });
    expect(report.cmcBuckets[7]).toEqual({ label: '7+', total: 1, creatures: 1, nonCreatures: 0 });

    // Avg CMC non-lands with commander: (4 + 1 + 3 + 8 + 1) / 5 = 3.4
    expect(report.averageCmc).toBe(3.4);

    // Pips: Meren(1B,1G) + Llanowar(1G) + Hybrid(2B,1G) + Crater(3G) => B: 3, G: 6
    expect(report.pipCounts.B).toBe(3);
    expect(report.pipCounts.G).toBe(6);
    expect(report.pipCounts.U).toBe(0);

    // Sources: Llanowar(G), Sol Ring(C), Command Tower(B,G), 3 Swamps(3 B) => B: 4, G: 2, C: 1
    expect(report.sourceCounts.B).toBe(4);
    expect(report.sourceCounts.G).toBe(2);
    expect(report.sourceCounts.C).toBe(1);

    // Roles: Lands 4, Ramp 3 (elf + solRing + commandTower), Removal 1
    expect(report.roleCounts.lands).toBe(4);
    expect(report.roleCounts.ramp).toBe(3);
    expect(report.roleCounts.removal).toBe(1);
    expect(report.roleCounts.draw).toBe(0); // sideboard card excluded

    // Sideboard blue card is NOT flagged as illegal in mainboard
    expect(report.illegalColorCardIds).toEqual([]);
  });

  it('flags off-color mainboard cards and copy limit violations accurately', () => {
    const cmd = makeCard({
      id: 'cmd',
      name: 'Talrand',
      colorIdentity: ['U'],
      isCommanderEligible: true,
    });
    const offColor = makeCard({
      id: 'bolt',
      name: 'Lightning Bolt',
      manaCost: '{R}',
      cmc: 1,
      typeLine: 'Instant',
      colorIdentity: ['R'],
    });
    const duplicate = makeCard({
      id: 'dup',
      name: 'Counterspell',
      manaCost: '{U}{U}',
      cmc: 2,
      typeLine: 'Instant',
      colorIdentity: ['U'],
    });

    const deck = makeDraft({
      commanders: [cmd],
      mainboard: {
        [offColor.id]: { card: offColor, quantity: 1 },
        [duplicate.id]: { card: duplicate, quantity: 2 },
      },
    });

    const report = computeDeckAnalytics(deck);
    expect(report.illegalColorCardIds).toEqual(['bolt']);
    expect(report.overCopyLimitCardIds).toEqual(['dup']);
    expect(report.isCommanderLegal100).toBe(false);
    expect(report.issues.some((i) => i.type === 'color-identity')).toBe(true);
    expect(report.issues.some((i) => i.type === 'copy-limit')).toBe(true);
  });

  it('auto-fills basic lands to 100 proportionally to colored mana pip demand', () => {
    const cmd = makeCard({
      id: 'cmd',
      name: 'Azorius Cmd',
      manaCost: '{W}{U}',
      cmc: 2,
      colorIdentity: ['W', 'U'],
      isCommanderEligible: true,
    });
    const heavyBlue = makeCard({
      id: 'u-spell',
      name: 'Cryptic Command',
      manaCost: '{1}{U}{U}{U}',
      cmc: 4,
      typeLine: 'Instant',
      colorIdentity: ['U'],
    });
    const deck = makeDraft({
      commanders: [cmd],
      mainboard: {
        [heavyBlue.id]: { card: heavyBlue, quantity: 1 },
      },
    });
    // Total cards so far = 2 -> need 98 basic lands
    // Pips: W = 1, U = 4 (ratio 20% W, 80% U -> ~20 Plains, ~78 Island)
    const basics: Record<string, CompactCard> = {
      Plains: makeCard({ id: 'plains', name: 'Plains', typeLine: 'Basic Land — Plains', manaCost: '', cmc: 0, maxCopies: null }),
      Island: makeCard({ id: 'island', name: 'Island', typeLine: 'Basic Land — Island', manaCost: '', cmc: 0, maxCopies: null }),
      Swamp: makeCard({ id: 'swamp', name: 'Swamp', typeLine: 'Basic Land — Swamp', manaCost: '', cmc: 0, maxCopies: null }),
    };

    const plan = computeBasicLandAutoFill(deck, basics, 100);
    const totalAdded = plan.reduce((acc, p) => acc + p.addQuantity, 0);
    expect(totalAdded).toBe(98);

    const plainsPlan = plan.find((p) => p.card.name === 'Plains');
    const islandPlan = plan.find((p) => p.card.name === 'Island');
    expect(plainsPlan).toBeDefined();
    expect(islandPlan).toBeDefined();
    expect(islandPlan!.addQuantity).toBeGreaterThan(plainsPlan!.addQuantity);
    expect(plan.some((p) => p.card.name === 'Swamp')).toBe(false);
  });
});
