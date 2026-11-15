import 'fake-indexeddb/auto';
import Dexie, { type Table } from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { MtgCardDatabase } from '../db/cardDb.js';
import {
  clearCloudDecksForOwner,
  collectCardIdsFromRecords,
  collectRecordCardIds,
  convertCardIdMapToOracleIds,
  convertOracleMapToCardIds,
  deckDraftToSavedRecord,
  deleteSavedDeckRecord,
  duplicateSavedDeckRecord,
  getSavedDeckRecord,
  getSyncMeta,
  hydrateSavedRecordToDraft,
  listSavedDeckRecords,
  saveDeckToDb,
  setSyncMeta,
  softDeleteSavedDeckRecord,
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

  it('preserves description, lockSearchToCommanderIdentity, and cloud/synergy metadata across save and hydrate', async () => {
    const db = createTestDb('cloud-fields');
    const marwyn = makeSampleCard('cmd-marwyn', 'Marwyn, the Nurturer', true);
    const solRing = makeSampleCard('sol-ring', 'Sol Ring');

    const draft: DeckDraft = {
      id: 'deck-cloud-1',
      name: 'Marwyn Cloud Sync',
      description: 'High-power mono-green elfball combo list.',
      commanders: [marwyn],
      mainboard: {
        [solRing.id]: { card: solRing, quantity: 1 },
      },
      sideboard: {},
      lockSearchToCommanderIdentity: false,
      visibility: 'friends',
      sharedWithUids: ['friend-1', 'friend-2'],
      synergyThemes: ['elves', 'counters', 'mana-dorks'],
      ownerUid: 'uid-alice',
      ownerHandle: 'alice_mtg',
      revision: 4,
      syncStatus: 'synced',
      cloudUpdatedAt: '2026-11-14T10:00:00.000Z',
      deletedAt: null,
      createdAt: '2026-11-13T10:00:00.000Z',
      updatedAt: '2026-11-14T10:00:00.000Z',
    };

    const directRecord = deckDraftToSavedRecord(draft);
    expect(directRecord.description).toBe('High-power mono-green elfball combo list.');
    expect(directRecord.lockSearchToCommanderIdentity).toBe(false);
    expect(directRecord.visibility).toBe('friends');
    expect(directRecord.sharedWithUids).toEqual(['friend-1', 'friend-2']);
    expect(directRecord.synergyThemes).toEqual(['elves', 'counters', 'mana-dorks']);
    expect(directRecord.ownerUid).toBe('uid-alice');
    expect(directRecord.ownerHandle).toBe('alice_mtg');
    expect(directRecord.revision).toBe(4);
    expect(directRecord.syncStatus).toBe('synced');
    expect(directRecord.cloudUpdatedAt).toBe('2026-11-14T10:00:00.000Z');
    expect(directRecord.deletedAt).toBeNull();

    await saveDeckToDb(draft, db);

    // Updating a draft that omits optional cloud metadata preserves stored cloud fields
    const partialUpdateDraft: DeckDraft = {
      id: 'deck-cloud-1',
      name: 'Marwyn Cloud Sync Updated',
      commanders: [marwyn],
      mainboard: {
        [solRing.id]: { card: solRing, quantity: 1 },
      },
      sideboard: {},
      lockSearchToCommanderIdentity: false,
      createdAt: '2026-11-13T10:00:00.000Z',
      updatedAt: '2026-11-14T11:00:00.000Z',
    };
    const updatedRecord = await saveDeckToDb(partialUpdateDraft, db);
    expect(updatedRecord.description).toBe('High-power mono-green elfball combo list.');
    expect(updatedRecord.visibility).toBe('friends');
    expect(updatedRecord.sharedWithUids).toEqual(['friend-1', 'friend-2']);
    expect(updatedRecord.synergyThemes).toEqual(['elves', 'counters', 'mana-dorks']);
    expect(updatedRecord.ownerUid).toBe('uid-alice');
    expect(updatedRecord.revision).toBe(4);
    expect(updatedRecord.syncStatus).toBe('synced');

    const hydrated = hydrateSavedRecordToDraft(updatedRecord, {
      'cmd-marwyn': marwyn,
      'sol-ring': solRing,
    });
    expect(hydrated.description).toBe('High-power mono-green elfball combo list.');
    expect(hydrated.lockSearchToCommanderIdentity).toBe(false);
    expect(hydrated.visibility).toBe('friends');
    expect(hydrated.sharedWithUids).toEqual(['friend-1', 'friend-2']);
    expect(hydrated.synergyThemes).toEqual(['elves', 'counters', 'mana-dorks']);
    expect(hydrated.ownerUid).toBe('uid-alice');
    expect(hydrated.ownerHandle).toBe('alice_mtg');
    expect(hydrated.revision).toBe(4);
    expect(hydrated.syncStatus).toBe('synced');
    expect(hydrated.cloudUpdatedAt).toBe('2026-11-14T10:00:00.000Z');
    expect(hydrated.deletedAt).toBeNull();

    // Duplicating resets cloud sync revision/status so the duplicate acts as a fresh local deck
    const dup = await duplicateSavedDeckRecord('deck-cloud-1', 'Marwyn Clone', db);
    expect(dup).not.toBeNull();
    expect(dup!.revision).toBe(0);
    expect(dup!.syncStatus).toBe('local');
    expect(dup!.cloudUpdatedAt).toBeUndefined();
    expect(dup!.deletedAt).toBeNull();
    expect(dup!.description).toBe('High-power mono-green elfball combo list.');
  });

  it('supports soft-delete tombstones, includeDeleted listing, owner clearing, and syncMeta', async () => {
    const db = createTestDb('tombstones-and-owner');
    const solRing = makeSampleCard('sol-ring', 'Sol Ring');

    const baseDraft = (id: string, ownerUid: string | null, updatedAt: string): DeckDraft => ({
      id,
      name: `Deck ${id}`,
      commanders: [],
      mainboard: { [solRing.id]: { card: solRing, quantity: 1 } },
      sideboard: {},
      lockSearchToCommanderIdentity: true,
      ownerUid,
      syncStatus: ownerUid ? 'synced' : 'local',
      revision: ownerUid ? 2 : 0,
      createdAt: updatedAt,
      updatedAt,
    });

    await saveDeckToDb(baseDraft('local-1', null, '2026-11-14T08:00:00.000Z'), db);
    await saveDeckToDb(baseDraft('alice-1', 'uid-alice', '2026-11-14T09:00:00.000Z'), db);
    await saveDeckToDb(baseDraft('alice-2', 'uid-alice', '2026-11-14T10:00:00.000Z'), db);
    await saveDeckToDb(baseDraft('bob-1', 'uid-bob', '2026-11-14T11:00:00.000Z'), db);

    const tombstoned = await softDeleteSavedDeckRecord('alice-1', db);
    expect(tombstoned).not.toBeNull();
    expect(tombstoned!.deletedAt).toBeTruthy();
    expect(tombstoned!.syncStatus).toBe('pending');
    expect(tombstoned!.updatedAt).toBe(tombstoned!.deletedAt);

    // Default listing excludes soft-deleted decks
    const activeDecks = await listSavedDeckRecords(db);
    expect(activeDecks.map((d) => d.id)).toEqual(['bob-1', 'alice-2', 'local-1']);

    // includeDeleted: true includes tombstoned decks
    const allDecks = await listSavedDeckRecords(db, { includeDeleted: true });
    expect(allDecks.map((d) => d.id)).toContain('alice-1');
    expect(allDecks).toHaveLength(4);

    // clearCloudDecksForOwner deletes only uid-alice's decks (including tombstones)
    const deletedCount = await clearCloudDecksForOwner('uid-alice', db);
    expect(deletedCount).toBe(2);

    const afterClear = await listSavedDeckRecords(db, { includeDeleted: true });
    expect(afterClear.map((d) => d.id)).toEqual(['bob-1', 'local-1']);

    // Sync metadata CRUD
    expect(await getSyncMeta('decksLastSyncAt', db)).toBeNull();
    await setSyncMeta('decksLastSyncAt', '2026-11-14T12:30:00.000Z', db);
    expect(await getSyncMeta('decksLastSyncAt', db)).toBe('2026-11-14T12:30:00.000Z');
    await setSyncMeta('decksLastSyncAt', null, db);
    expect(await getSyncMeta('decksLastSyncAt', db)).toBeNull();
  });

  it('collects card IDs across records and converts between card IDs and oracleIds', () => {
    const solA = { ...makeSampleCard('sol-c21', 'Sol Ring'), oracleId: 'oracle-sol' };
    const solB = { ...makeSampleCard('sol-lea', 'Sol Ring'), oracleId: 'oracle-sol' };
    const marwyn = { ...makeSampleCard('cmd-marwyn', 'Marwyn, the Nurturer', true), oracleId: 'oracle-marwyn' };

    const ids = collectCardIdsFromRecords([
      {
        commanderIds: [marwyn.id],
        mainboard: { [solA.id]: 1 },
        sideboard: {},
      },
      {
        commanderOracleIds: ['oracle-marwyn'],
        mainboard: { 'oracle-sol': 1 },
        sideboard: { [solB.id]: 1 },
      },
    ]);
    expect(new Set(ids)).toEqual(new Set(['cmd-marwyn', 'sol-c21', 'oracle-marwyn', 'oracle-sol', 'sol-lea']));

    // Two different printings with the same oracleId merge cleanly
    const oracleMap = convertCardIdMapToOracleIds(
      { 'sol-c21': 1, 'sol-lea': 2, 'unresolved-id': 1, 'zero-qty': 0 },
      { 'sol-c21': solA, 'sol-lea': solB },
    );
    expect(oracleMap).toEqual({
      'oracle-sol': 3,
      'unresolved-id': 1,
    });

    // Reverse conversion using resolved oracleId -> CompactCard map
    const cardIdMap = convertOracleMapToCardIds(
      { 'oracle-sol': 1, 'missing-oracle': 2 },
      { 'oracle-sol': solA },
    );
    expect(cardIdMap).toEqual({
      'sol-c21': 1,
      'missing-oracle': 2,
    });
  });

  it('safely upgrades a Dexie v1 database to v2 without losing existing decks or cache data', async () => {
    const dbName = `mtg-v1-upgrade-${Math.random().toString(36).slice(2)}`;

    class LegacyV1Db extends Dexie {
      catalogSnapshots!: Table<{ id: string; version: string; savedAt: string; cards: CompactCard[] }, string>;
      meta!: Table<{ key: string; value: unknown }, string>;
      decks!: Table<Record<string, unknown>, string>;
      collection!: Table<{ cardId: string; quantity: number; updatedAt: string }, string>;

      constructor(name: string) {
        super(name);
        this.version(1).stores({
          catalogSnapshots: 'id',
          meta: 'key',
          decks: 'id, name, updatedAt',
          collection: 'cardId',
        });
      }
    }

    const legacy = new LegacyV1Db(dbName);
    await legacy.decks.put({
      id: 'legacy-deck-1',
      name: 'Pre-Cloud Commander',
      commanderIds: ['cmd-1'],
      mainboard: { 'sol-1': 1 },
      sideboard: {},
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
    });
    await legacy.collection.put({
      cardId: 'sol-1',
      quantity: 3,
      updatedAt: '2026-10-02T00:00:00.000Z',
    });
    await legacy.catalogSnapshots.put({
      id: 'commander-oracle',
      version: 'v1-old',
      savedAt: '2026-10-01T00:00:00.000Z',
      cards: [makeSampleCard('sol-1', 'Sol Ring')],
    });
    legacy.close();

    const upgraded = new MtgCardDatabase(dbName);
    createdDbs.push(upgraded);

    const migratedDeck = await getSavedDeckRecord('legacy-deck-1', upgraded);
    expect(migratedDeck).toBeDefined();
    expect(migratedDeck!.name).toBe('Pre-Cloud Commander');
    expect(migratedDeck!.commanderIds).toEqual(['cmd-1']);
    expect(migratedDeck!.mainboard).toEqual({ 'sol-1': 1 });
    expect(migratedDeck!.visibility).toBe('private');
    expect(migratedDeck!.syncStatus).toBe('local');
    expect(migratedDeck!.revision).toBe(0);
    expect(migratedDeck!.ownerUid).toBeNull();
    expect(migratedDeck!.deletedAt).toBeNull();

    const listed = await listSavedDeckRecords(upgraded);
    expect(listed.map((d) => d.id)).toEqual(['legacy-deck-1']);

    const preservedCollection = await upgraded.collection.get('sol-1');
    expect(preservedCollection?.quantity).toBe(3);

    const preservedSnapshot = await upgraded.catalogSnapshots.get('commander-oracle');
    expect(preservedSnapshot?.cards).toHaveLength(1);

    await setSyncMeta('migratedCheck', 'ok', upgraded);
    expect(await getSyncMeta('migratedCheck', upgraded)).toBe('ok');
  });
});
