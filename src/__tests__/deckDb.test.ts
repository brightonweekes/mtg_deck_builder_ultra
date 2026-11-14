import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { MtgCardDatabase } from '../db/cardDb.js';
import {
  collectRecordCardIds,
  deleteSavedDeckRecord,
  duplicateSavedDeckRecord,
  getSavedDeckRecord,
  hydrateSavedRecordToDraft,
  listSavedDeckRecords,
  saveDeckToDb,
} from '../db/deckDb.js';
import type { CompactCard } from '../types/card.js';
import type { DeckDraft } from '../types/deck.js';

function makeSampleCard(id: string, name: string, isCommander = false): CompactCard {
  return {
    id,
    oracleId: `oracle-${id}`,
    name,
    manaCost: '{2}',
    cmc: 2,
    typeLine: isCommander ? 'Legendary Creature — Elf' : 'Artifact',
    oracleText: '',
    colors: ['G'],
    colorIdentity: ['G'],
    keywords: [],
    edhrecRank: 1,
    priceUsd: 2.5,
    imageNormal: '',
    imageSmall: '',
    layout: 'normal',
    isCommanderEligible: isCommander,
    roles: [],
    themes: [],
  };
}

describe('deckDb Multi-Deck IndexedDB Persistence', () => {
  const createdDbs: MtgCardDatabase[] = [];

  function createTestDb(suffix: string): MtgCardDatabase {
    const db = new MtgCardDatabase(`mtg-deck-test-${suffix}-${Math.random().toString(36).slice(2)}`);
    createdDbs.push(db);
    return db;
  }

  afterEach(async () => {
    while (createdDbs.length > 0) {
      const db = createdDbs.pop()!;
      db.close();
      await db.delete();
    }
  });

  it('saves, lists, duplicates, deletes, and hydrates multiple Commander decks in IndexedDB', async () => {
    const db = createTestDb('crud');
    const marwyn = makeSampleCard('cmd-marwyn', 'Marwyn, the Nurturer', true);
    const solRing = makeSampleCard('sol-ring', 'Sol Ring');
    const eternalWitness = makeSampleCard('ewit', 'Eternal Witness');

    const draftA: DeckDraft = {
      id: 'deck-a',
      name: 'Marwyn Elfball',
      commanders: [marwyn],
      mainboard: {
        [solRing.id]: { card: solRing, quantity: 1 },
      },
      sideboard: {
        [eternalWitness.id]: { card: eternalWitness, quantity: 1 },
      },
      lockSearchToCommanderIdentity: true,
      createdAt: '2026-11-13T10:00:00.000Z',
      updatedAt: '2026-11-13T10:00:00.000Z',
    };

    const draftB: DeckDraft = {
      id: 'deck-b',
      name: 'Mono-Blue Control',
      commanders: [],
      mainboard: {
        [solRing.id]: { card: solRing, quantity: 1 },
      },
      sideboard: {},
      lockSearchToCommanderIdentity: true,
      createdAt: '2026-11-13T11:00:00.000Z',
      updatedAt: '2026-11-13T11:00:00.000Z',
    };

    await saveDeckToDb(draftA, db);
    await saveDeckToDb(draftB, db);

    const listed = await listSavedDeckRecords(db);
    expect(listed.length).toBe(2);
    // Sorted by updatedAt descending (deck-b is newer)
    expect(listed[0]!.id).toBe('deck-b');
    expect(listed[1]!.id).toBe('deck-a');

    // Duplicate draftA
    const duplicated = await duplicateSavedDeckRecord('deck-a', 'Marwyn Budget Version', db);
    expect(duplicated).not.toBeNull();
    expect(duplicated!.id).not.toBe('deck-a');
    expect(duplicated!.name).toBe('Marwyn Budget Version');
    expect(duplicated!.commanderIds).toEqual(['cmd-marwyn']);
    expect(duplicated!.mainboard).toEqual({ 'sol-ring': 1 });
    expect(duplicated!.sideboard).toEqual({ ewit: 1 });

    // Hydrate record back into a full DeckDraft
    const fetched = await getSavedDeckRecord('deck-a', db);
    expect(fetched).toBeDefined();
    const ids = collectRecordCardIds(fetched!);
    expect(ids).toEqual(['cmd-marwyn', 'sol-ring', 'ewit']);

    const hydrated = hydrateSavedRecordToDraft(fetched!, {
      'cmd-marwyn': marwyn,
      'sol-ring': solRing,
      ewit: eternalWitness,
    });
    expect(hydrated.commanders[0]!.name).toBe('Marwyn, the Nurturer');
    expect(hydrated.mainboard['sol-ring']?.quantity).toBe(1);
    expect(hydrated.sideboard.ewit?.card.name).toBe('Eternal Witness');

    // Delete deck-b
    await deleteSavedDeckRecord('deck-b', db);
    const remaining = await listSavedDeckRecords(db);
    expect(remaining.some((d) => d.id === 'deck-b')).toBe(false);
    expect(remaining.length).toBe(2);
  });
});
