import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPendingHandleStorageKey } from '../cloud/firebaseProvider.js';
import {
  ACTIVE_DECK_STORAGE_KEY,
  CloudSyncEngine,
  buildAccountExportBundle,
  cardListToCloudCardList,
  cleanupOnSignOut,
  cloudCardListToLocalCardList,
  cloudDeckToSavedDeck,
  getCardListSyncMetaKey,
  getDeckSyncMetaKey,
  mergeGuestRecordsForUser,
  savedDeckToCloudDeck,
} from '../cloud/syncEngine.js';
import { MtgCardDatabase, type SavedDeckRecord } from '../db/cardDb.js';
import {
  createCardList,
  getCardList,
  listCardLists,
  saveCardList,
  softDeleteCardList,
} from '../db/cardListDb.js';
import {
  getSavedDeckRecord,
  getSyncMeta,
  listSavedDeckRecords,
  setSyncMeta,
  softDeleteSavedDeckRecord,
} from '../db/deckDb.js';
import { CardSearchEngine } from '../search/searchEngine.js';
import type { CompactCard, ManaColor } from '../types/card.js';
import type {
  CardListRecord,
  CloudCardListRecord,
  CloudDeckRecord,
  CloudProvider,
  CloudUser,
  FriendDeckSummary,
  FriendshipRecord,
  PushResult,
  UserProfile,
} from '../types/cloud.js';

function makeCard(
  id: string,
  name: string,
  oracleId: string,
  options: {
    isCommander?: boolean;
    colorIdentity?: ManaColor[];
    themes?: string[];
  } = {},
): CompactCard {
  const colorIdentity = options.colorIdentity ?? [];
  return {
    id,
    oracleId,
    name,
    manaCost: '{2}',
    cmc: 2,
    typeLine: options.isCommander ? 'Legendary Creature — Elf' : 'Artifact',
    oracleText: '',
    colors: colorIdentity,
    colorIdentity,
    keywords: [],
    edhrecRank: 10,
    priceUsd: 2.0,
    imageNormal: '',
    imageSmall: '',
    layout: 'normal',
    isCommanderEligible: Boolean(options.isCommander),
    roles: [],
    themes: options.themes ?? [],
  };
}

class InMemoryCloudProvider implements CloudProvider {
  configured = true;
  decks = new Map<string, CloudDeckRecord>();
  cardLists = new Map<string, CloudCardListRecord>();

  pullDecksCalls: Array<{ uid: string; sinceIso: string | null }> = [];
  pushDeckCalls: Array<{ id: string; expectedRevision: number }> = [];
  pullCardListsCalls: Array<{ uid: string; sinceIso: string | null }> = [];
  pushCardListCalls: Array<{ id: string; expectedRevision: number }> = [];

  nextPullDecksError: unknown = null;
  nextPushDeckError: unknown = null;
  nextPullCardListsError: unknown = null;
  nextPushCardListError: unknown = null;

  private clockMs = Date.parse('2026-11-14T10:00:00.000Z');

  nextIso(): string {
    this.clockMs += 1000;
    return new Date(this.clockMs).toISOString();
  }

  isConfigured(): boolean {
    return this.configured;
  }

  onAuthStateChanged(): () => void {
    return () => undefined;
  }

  async signUpWithEmail(email: string, _password: string, handle: string): Promise<CloudUser> {
    return {
      uid: 'uid-test',
      email,
      emailVerified: false,
      displayName: handle,
      providerIds: ['password'],
    };
  }

  async signInWithEmail(email: string): Promise<CloudUser> {
    return {
      uid: 'uid-test',
      email,
      emailVerified: true,
      displayName: 'test_user',
      providerIds: ['password'],
    };
  }

  async signInWithGoogle(): Promise<CloudUser> {
    return {
      uid: 'uid-test',
      email: 'test@example.com',
      emailVerified: true,
      displayName: 'Test User',
      providerIds: ['google.com'],
    };
  }

  async resendVerificationEmail(): Promise<void> {}
  async reloadUser(): Promise<CloudUser | null> {
    return null;
  }
  async sendPasswordReset(): Promise<void> {}
  async signOut(): Promise<void> {}
  async getMyProfile(): Promise<UserProfile | null> {
    return null;
  }
  async claimHandle(uid: string, handle: string): Promise<UserProfile> {
    const now = this.nextIso();
    return {
      uid,
      handle,
      handleLower: handle.toLowerCase(),
      displayName: handle,
      createdAt: now,
      updatedAt: now,
    };
  }

  async pullDecksSince(uid: string, sinceIso: string | null): Promise<CloudDeckRecord[]> {
    this.pullDecksCalls.push({ uid, sinceIso });
    if (this.nextPullDecksError !== null) {
      const err = this.nextPullDecksError;
      this.nextPullDecksError = null;
      throw err;
    }

    return Array.from(this.decks.values())
      .filter((d) => d.ownerUid === uid && (!sinceIso || d.updatedAt > sinceIso))
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .map((d) => structuredClone(d));
  }

  async pushDeck(
    deck: CloudDeckRecord,
    expectedRevision: number,
  ): Promise<PushResult<CloudDeckRecord>> {
    this.pushDeckCalls.push({ id: deck.id, expectedRevision });
    if (this.nextPushDeckError !== null) {
      const err = this.nextPushDeckError;
      this.nextPushDeckError = null;
      throw err;
    }

    const existing = this.decks.get(deck.id);
    const currentRev = existing?.revision ?? 0;
    if (currentRev !== expectedRevision) {
      return {
        status: 'conflict',
        serverRecord: structuredClone(existing!),
      };
    }

    const saved: CloudDeckRecord = {
      ...structuredClone(deck),
      revision: expectedRevision + 1,
      updatedAt: this.nextIso(),
    };
    this.decks.set(deck.id, saved);
    return {
      status: 'synced',
      record: structuredClone(saved),
    };
  }

  async pullCardListsSince(
    uid: string,
    sinceIso: string | null,
  ): Promise<CloudCardListRecord[]> {
    this.pullCardListsCalls.push({ uid, sinceIso });
    if (this.nextPullCardListsError !== null) {
      const err = this.nextPullCardListsError;
      this.nextPullCardListsError = null;
      throw err;
    }

    return Array.from(this.cardLists.values())
      .filter((l) => l.ownerUid === uid && (!sinceIso || l.updatedAt > sinceIso))
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .map((l) => structuredClone(l));
  }

  async pushCardList(
    list: CloudCardListRecord,
    expectedRevision: number,
  ): Promise<PushResult<CloudCardListRecord>> {
    this.pushCardListCalls.push({ id: list.id, expectedRevision });
    if (this.nextPushCardListError !== null) {
      const err = this.nextPushCardListError;
      this.nextPushCardListError = null;
      throw err;
    }

    const existing = this.cardLists.get(list.id);
    const currentRev = existing?.revision ?? 0;
    if (currentRev !== expectedRevision) {
      return {
        status: 'conflict',
        serverRecord: structuredClone(existing!),
      };
    }

    const saved: CloudCardListRecord = {
      ...structuredClone(list),
      revision: expectedRevision + 1,
      updatedAt: this.nextIso(),
    };
    this.cardLists.set(list.id, saved);
    return {
      status: 'synced',
      record: structuredClone(saved),
    };
  }

  async getSharedDeckById(deckId: string): Promise<CloudDeckRecord | null> {
    const found = this.decks.get(deckId);
    if (!found || found.deletedAt) return null;
    return structuredClone(found);
  }

  async listFriendships(): Promise<FriendshipRecord[]> {
    return [];
  }
  async sendFriendRequestByHandle(): Promise<FriendshipRecord> {
    throw new Error('Not implemented in sync test fake');
  }
  async acceptFriendRequest(): Promise<void> {}
  async removeFriendship(): Promise<void> {}
  async getFriendDecks(): Promise<FriendDeckSummary[]> {
    return [];
  }
  async deleteAccountAndData(): Promise<void> {}
}

describe('CloudSyncEngine & Offline-First Cross-Device Sync', () => {
  const createdDbs: MtgCardDatabase[] = [];

  function createTestDb(suffix: string): MtgCardDatabase {
    const db = new MtgCardDatabase(
      `mtg-sync-test-${suffix}-${Math.random().toString(36).slice(2)}`,
    );
    createdDbs.push(db);
    return db;
  }

  function createEngine(
    provider: CloudProvider,
    db: MtgCardDatabase,
    cards: readonly CompactCard[],
    getSynergyThemes?: (
      record: SavedDeckRecord,
      cardMap: Record<string, CompactCard>,
    ) => string[],
  ): CloudSyncEngine {
    const search = new CardSearchEngine(cards);
    return new CloudSyncEngine({
      provider,
      db,
      resolveCardsByIds: async (ids) => search.getCardsByIdMap(ids),
      getSynergyThemes,
    });
  }

  afterEach(async () => {
    while (createdDbs.length > 0) {
      const db = createdDbs.pop()!;
      db.close();
      await db.delete();
    }
  });

  const marwynV1 = makeCard('marwyn-cmr', 'Marwyn, the Nurturer', 'ora-marwyn', {
    isCommander: true,
    colorIdentity: ['G'],
    themes: ['elves', 'counters'],
  });
  const solRingV1 = makeCard('sol-c21', 'Sol Ring', 'ora-sol');
  const forestV1 = makeCard('forest-m21', 'Forest', 'ora-forest', { colorIdentity: ['G'] });
  const forestV1Alt = makeCard('forest-znr', 'Forest', 'ora-forest', { colorIdentity: ['G'] });
  const ewitV1 = makeCard('ewit-uma', 'Eternal Witness', 'ora-ewit', { colorIdentity: ['G'] });

  const marwynV2 = makeCard('marwyn-khm', 'Marwyn, the Nurturer', 'ora-marwyn', {
    isCommander: true,
    colorIdentity: ['G'],
    themes: ['elves', 'counters'],
  });
  const solRingV2 = makeCard('sol-blc', 'Sol Ring', 'ora-sol');
  const forestV2 = makeCard('forest-blb', 'Forest', 'ora-forest', { colorIdentity: ['G'] });
  const ewitV2 = makeCard('ewit-cmm', 'Eternal Witness', 'ora-ewit', { colorIdentity: ['G'] });

  it('merges meaningful guest decks and cardlists while skipping untouched starter drafts', async () => {
    const db = createTestDb('guest-merge');
    const provider = new InMemoryCloudProvider();
    const engine = createEngine(provider, db, [marwynV1, solRingV1]);

    // Empty untouched starter draft — should be skipped
    await db.decks.put({
      id: 'starter-draft',
      name: 'Untitled Commander Deck',
      commanderIds: [],
      mainboard: {},
      sideboard: {},
      lockSearchToCommanderIdentity: true,
      ownerUid: null,
      syncStatus: 'local',
      revision: 0,
      deletedAt: null,
      createdAt: '2026-11-14T08:00:00.000Z',
      updatedAt: '2026-11-14T08:00:00.000Z',
    });

    // Meaningful guest deck (has commander + cards)
    await db.decks.put({
      id: 'guest-marwyn',
      name: 'Guest Elfball',
      description: 'Built offline before signing in',
      commanderIds: [marwynV1.id],
      mainboard: { [solRingV1.id]: 1 },
      sideboard: {},
      lockSearchToCommanderIdentity: true,
      ownerUid: null,
      syncStatus: 'local',
      revision: 0,
      deletedAt: null,
      createdAt: '2026-11-14T08:30:00.000Z',
      updatedAt: '2026-11-14T09:00:00.000Z',
    });

    // Renamed empty deck — meaningful because user named it
    await db.decks.put({
      id: 'guest-named-only',
      name: 'Future Mono-Black Brew',
      commanderIds: [],
      mainboard: {},
      sideboard: {},
      ownerUid: null,
      syncStatus: 'local',
      revision: 0,
      deletedAt: null,
      createdAt: '2026-11-14T08:45:00.000Z',
      updatedAt: '2026-11-14T08:45:00.000Z',
    });

    // Guest cardlist
    await createCardList(
      {
        id: 'guest-binder',
        name: 'Offline Binder',
        listType: 'collection',
        entries: { [solRingV1.id]: { quantity: 2, foilQuantity: 1 } },
      },
      db,
    );

    const merged = await mergeGuestRecordsForUser('uid-alice', '@Alice_MTG', db);
    expect(merged).toEqual({ mergedDeckCount: 2, mergedCardListCount: 1 });

    // Starter draft remains unowned and local
    const starter = await getSavedDeckRecord('starter-draft', db);
    expect(starter?.ownerUid).toBeNull();
    expect(starter?.syncStatus).toBe('local');

    // Meaningful guest records are claimed & queued as pending
    const claimedDeck = await getSavedDeckRecord('guest-marwyn', db);
    expect(claimedDeck?.ownerUid).toBe('uid-alice');
    expect(claimedDeck?.ownerHandle).toBe('alice_mtg');
    expect(claimedDeck?.syncStatus).toBe('pending');
    expect(claimedDeck?.revision).toBe(0);
    expect(claimedDeck?.description).toBe('Built offline before signing in');

    const claimedList = await getCardList('guest-binder', db);
    expect(claimedList?.ownerUid).toBe('uid-alice');
    expect(claimedList?.ownerHandle).toBe('alice_mtg');
    expect(claimedList?.syncStatus).toBe('pending');

    // Full sync uploads the 2 meaningful decks + 1 cardlist, never uploading starter-draft
    const syncRes = await engine.syncAll('uid-alice', '@Alice_MTG');
    expect(syncRes.pushedCount).toBe(3);
    expect(syncRes.errors).toEqual([]);
    expect(provider.decks.has('starter-draft')).toBe(false);
    expect(provider.decks.has('guest-marwyn')).toBe(true);
    expect(provider.decks.has('guest-named-only')).toBe(true);
    expect(provider.cardLists.has('guest-binder')).toBe(true);
  });

  it('maps card IDs <-> canonical oracleIds across different Scryfall catalog printings and preserves unknown IDs', async () => {
    const dbA = createTestDb('oracle-a');
    const dbB = createTestDb('oracle-b');
    const provider = new InMemoryCloudProvider();

    const engineA = createEngine(
      provider,
      dbA,
      [marwynV1, solRingV1, forestV1, forestV1Alt, ewitV1],
      (record, cardMap) => {
        const themes = new Set<string>();
        for (const cmdId of record.commanderIds) {
          for (const t of cardMap[cmdId]?.themes ?? []) themes.add(t);
        }
        themes.add('mana-ramp');
        return Array.from(themes);
      },
    );
    const engineB = createEngine(provider, dbB, [marwynV2, solRingV2, forestV2, ewitV2]);

    // Direct helper check: merges duplicate printings and preserves unresolved IDs
    const directCloud = savedDeckToCloudDeck(
      {
        id: 'deck-ora',
        name: 'Marwyn Multi-Print',
        commanderIds: [marwynV1.id],
        mainboard: {
          [solRingV1.id]: 1,
          [forestV1.id]: 3,
          [forestV1Alt.id]: 5,
          'custom-missing-id': 1,
        },
        sideboard: { [ewitV1.id]: 1 },
        visibility: 'friends',
        ownerUid: 'uid-alice',
        revision: 0,
        syncStatus: 'pending',
        createdAt: '2026-11-14T09:00:00.000Z',
        updatedAt: '2026-11-14T09:00:00.000Z',
      },
      'uid-alice',
      '@Alice',
      {
        [marwynV1.id]: marwynV1,
        [solRingV1.id]: solRingV1,
        [forestV1.id]: forestV1,
        [forestV1Alt.id]: forestV1Alt,
        [ewitV1.id]: ewitV1,
      },
    );

    expect(directCloud.ownerHandle).toBe('alice');
    expect(directCloud.commanderOracleIds).toEqual(['ora-marwyn']);
    expect(directCloud.colorIdentity).toEqual(['G']);
    expect(directCloud.mainboard).toEqual({
      'ora-sol': 1,
      'ora-forest': 8,
      'custom-missing-id': 1,
    });
    expect(directCloud.sideboard).toEqual({ 'ora-ewit': 1 });
    expect(directCloud.cardCount).toBe(11);
    expect(directCloud.synergyThemes).toEqual(['elves', 'counters']);

    // Save on Device A and sync up
    await dbA.decks.put({
      id: 'deck-roundtrip',
      name: 'Marwyn Roundtrip',
      commanderIds: [marwynV1.id],
      mainboard: {
        [solRingV1.id]: 1,
        [forestV1.id]: 4,
        [forestV1Alt.id]: 4,
        'unmapped-promo-id': 1,
      },
      sideboard: { [ewitV1.id]: 1 },
      visibility: 'public',
      ownerUid: 'uid-alice',
      syncStatus: 'pending',
      revision: 0,
      createdAt: '2026-11-14T09:00:00.000Z',
      updatedAt: '2026-11-14T09:30:00.000Z',
    });

    const pushRes = await engineA.pushPending('uid-alice', 'alice');
    expect(pushRes.pushedCount).toBe(1);

    const cloudStored = provider.decks.get('deck-roundtrip')!;
    expect(cloudStored.commanderOracleIds).toEqual(['ora-marwyn']);
    expect(cloudStored.mainboard).toEqual({
      'ora-sol': 1,
      'ora-forest': 8,
      'unmapped-promo-id': 1,
    });
    expect(cloudStored.sideboard).toEqual({ 'ora-ewit': 1 });
    expect(cloudStored.synergyThemes).toEqual(['elves', 'counters', 'mana-ramp']);
    expect(cloudStored.cardCount).toBe(11);

    // Pull onto Device B which only has v2 Scryfall printing IDs
    const pullRes = await engineB.pullUpdates('uid-alice', 'alice');
    expect(pullRes.pulledCount).toBe(1);
    expect(pullRes.conflicts).toEqual([]);

    const onDeviceB = await getSavedDeckRecord('deck-roundtrip', dbB);
    expect(onDeviceB).toBeDefined();
    expect(onDeviceB?.commanderIds).toEqual([marwynV2.id]);
    expect(onDeviceB?.mainboard).toEqual({
      [solRingV2.id]: 1,
      [forestV2.id]: 8,
      'unmapped-promo-id': 1,
    });
    expect(onDeviceB?.sideboard).toEqual({ [ewitV2.id]: 1 });
    expect(onDeviceB?.syncStatus).toBe('synced');
    expect(onDeviceB?.revision).toBe(1);

    // Also verify direct cloudDeckToSavedDeck mapping
    const directLocal = cloudDeckToSavedDeck(cloudStored, {
      'ora-marwyn': marwynV2,
      'ora-sol': solRingV2,
      'ora-forest': forestV2,
      'ora-ewit': ewitV2,
    });
    expect(directLocal.commanderIds).toEqual([marwynV2.id]);
    expect(directLocal.mainboard[solRingV2.id]).toBe(1);
  });

  it('advances delta since timestamps only after clean pull and pulls incrementally', async () => {
    const dbA = createTestDb('delta-a');
    const dbB = createTestDb('delta-b');
    const provider = new InMemoryCloudProvider();
    const engineA = createEngine(provider, dbA, [marwynV1, solRingV1]);
    const engineB = createEngine(provider, dbB, [marwynV2, solRingV2]);

    await dbA.decks.put({
      id: 'deck-1',
      name: 'First Deck',
      commanderIds: [marwynV1.id],
      mainboard: { [solRingV1.id]: 1 },
      sideboard: {},
      ownerUid: 'uid-alice',
      syncStatus: 'pending',
      revision: 0,
      createdAt: '2026-11-14T09:00:00.000Z',
      updatedAt: '2026-11-14T09:00:00.000Z',
    });
    await engineA.pushPending('uid-alice', 'alice');

    // Initial pull on Device B passes since=null
    expect(await getSyncMeta(getDeckSyncMetaKey('uid-alice'), dbB)).toBeNull();
    const pull1 = await engineB.pullUpdates('uid-alice', 'alice');
    expect(pull1.pulledCount).toBe(1);
    expect(provider.pullDecksCalls[0]?.sinceIso).toBeNull();

    const watermark1 = await getSyncMeta(getDeckSyncMetaKey('uid-alice'), dbB);
    expect(watermark1).toBe(provider.decks.get('deck-1')!.updatedAt);

    // Simulate failed pull — watermark must remain unchanged
    provider.nextPullDecksError = { code: 'unavailable', message: 'Network down' };
    const failedPull = await engineB.pullUpdates('uid-alice', 'alice');
    expect(failedPull.errors).toHaveLength(1);
    expect(failedPull.errors[0]?.isOffline).toBe(true);
    expect(await getSyncMeta(getDeckSyncMetaKey('uid-alice'), dbB)).toBe(watermark1);

    // Clean incremental pull passes watermark1 and returns 0 when nothing changed
    const pull2 = await engineB.pullUpdates('uid-alice', 'alice');
    expect(pull2.pulledCount).toBe(0);
    expect(provider.pullDecksCalls[2]?.sinceIso).toBe(watermark1);

    // Device A adds a second deck -> Device B pulls only deck-2
    await dbA.decks.put({
      id: 'deck-2',
      name: 'Second Deck',
      commanderIds: [],
      mainboard: { [solRingV1.id]: 1 },
      sideboard: {},
      ownerUid: 'uid-alice',
      syncStatus: 'pending',
      revision: 0,
      createdAt: '2026-11-14T10:05:00.000Z',
      updatedAt: '2026-11-14T10:05:00.000Z',
    });
    await engineA.pushPending('uid-alice', 'alice');

    const pull3 = await engineB.pullUpdates('uid-alice', 'alice');
    expect(pull3.pulledCount).toBe(1);
    const watermark2 = await getSyncMeta(getDeckSyncMetaKey('uid-alice'), dbB);
    expect(watermark2).toBe(provider.decks.get('deck-2')!.updatedAt);
    expect(watermark2! > watermark1!).toBe(true);
  });

  it('syncs soft-delete tombstones across devices without resurrecting deleted decks', async () => {
    const dbA = createTestDb('tomb-a');
    const dbB = createTestDb('tomb-b');
    const dbC = createTestDb('tomb-c');
    const provider = new InMemoryCloudProvider();

    const engineA = createEngine(provider, dbA, [marwynV1, solRingV1]);
    const engineB = createEngine(provider, dbB, [marwynV2, solRingV2]);
    const engineC = createEngine(provider, dbC, [marwynV2, solRingV2]);

    await dbA.decks.put({
      id: 'deck-to-delete',
      name: 'Ephemeral Brew',
      commanderIds: [marwynV1.id],
      mainboard: { [solRingV1.id]: 1 },
      sideboard: {},
      ownerUid: 'uid-alice',
      syncStatus: 'pending',
      revision: 0,
      deletedAt: null,
      createdAt: '2026-11-14T09:00:00.000Z',
      updatedAt: '2026-11-14T09:00:00.000Z',
    });

    await engineA.syncAll('uid-alice', 'alice');
    await engineB.syncAll('uid-alice', 'alice');
    expect((await listSavedDeckRecords(dbB)).map((d) => d.id)).toEqual(['deck-to-delete']);

    // Device A soft-deletes and syncs tombstone
    const deletedA = await softDeleteSavedDeckRecord('deck-to-delete', dbA);
    expect(deletedA?.deletedAt).toBeTruthy();
    expect(deletedA?.syncStatus).toBe('pending');
    await engineA.syncAll('uid-alice', 'alice');

    const serverTombstone = provider.decks.get('deck-to-delete')!;
    expect(serverTombstone.deletedAt).toBeTruthy();
    expect(serverTombstone.revision).toBe(2);

    // Device B syncs -> hides deck locally and stores synced tombstone
    await engineB.syncAll('uid-alice', 'alice');
    expect(await listSavedDeckRecords(dbB)).toEqual([]);

    const storedTombstoneB = await getSavedDeckRecord('deck-to-delete', dbB);
    expect(storedTombstoneB?.deletedAt).toBe(serverTombstone.deletedAt);
    expect(storedTombstoneB?.syncStatus).toBe('synced');
    expect(storedTombstoneB?.revision).toBe(2);

    // Repeated syncs never resurrect the deck
    await engineB.syncAll('uid-alice', 'alice');
    await engineA.syncAll('uid-alice', 'alice');
    expect(await listSavedDeckRecords(dbA)).toEqual([]);
    expect(await listSavedDeckRecords(dbB)).toEqual([]);

    // Brand-new Device C pulling from scratch also respects tombstone
    await engineC.syncAll('uid-alice', 'alice');
    expect(await listSavedDeckRecords(dbC)).toEqual([]);
    expect((await getSavedDeckRecord('deck-to-delete', dbC))?.deletedAt).toBeTruthy();
  });

  it('detects pull/push conflicts without overwriting local edits and resolves via keep-cloud, keep-local, and keep-both', async () => {
    const dbA = createTestDb('conflict-a');
    const dbB = createTestDb('conflict-b');
    const provider = new InMemoryCloudProvider();
    const engineA = createEngine(provider, dbA, [marwynV1, solRingV1, forestV1]);
    const engineB = createEngine(provider, dbB, [marwynV1, solRingV1, forestV1]);

    // Seed shared deck at revision 1 on both devices
    await dbA.decks.put({
      id: 'shared-deck',
      name: 'Original Name',
      commanderIds: [marwynV1.id],
      mainboard: { [solRingV1.id]: 1 },
      sideboard: {},
      ownerUid: 'uid-alice',
      syncStatus: 'pending',
      revision: 0,
      createdAt: '2026-11-14T09:00:00.000Z',
      updatedAt: '2026-11-14T09:00:00.000Z',
    });
    await engineA.syncAll('uid-alice', 'alice');
    await engineB.syncAll('uid-alice', 'alice');

    // Device B edits & pushes -> server revision becomes 2
    const bLocal = (await getSavedDeckRecord('shared-deck', dbB))!;
    await dbB.decks.put({
      ...bLocal,
      name: 'Device B Edit',
      mainboard: { [solRingV1.id]: 1, [forestV1.id]: 2 },
      syncStatus: 'pending',
      updatedAt: '2026-11-14T11:00:00.000Z',
    });
    await engineB.syncAll('uid-alice', 'alice');
    expect(provider.decks.get('shared-deck')?.revision).toBe(2);

    // Device A edits offline based on revision 1
    const aLocal = (await getSavedDeckRecord('shared-deck', dbA))!;
    await dbA.decks.put({
      ...aLocal,
      name: 'Device A Offline Edit',
      mainboard: { [solRingV1.id]: 1, [forestV1.id]: 5 },
      syncStatus: 'pending',
      updatedAt: '2026-11-14T11:05:00.000Z',
    });

    // 1. Detect pullUpdates conflict without clobbering local
    const pullConflictRes = await engineA.pullUpdates('uid-alice', 'alice');
    expect(pullConflictRes.conflicts).toHaveLength(1);
    const conflict = pullConflictRes.conflicts[0]!;
    expect(conflict.kind).toBe('deck');
    expect(conflict.id).toBe('shared-deck');
    expect((conflict.localRecord as SavedDeckRecord).name).toBe('Device A Offline Edit');
    expect((conflict.cloudRecord as CloudDeckRecord).name).toBe('Device B Edit');

    // Watermark was not advanced past unresolved conflict, and local edits stay safe with status='conflict'
    expect(await getSyncMeta(getDeckSyncMetaKey('uid-alice'), dbA)).not.toBe(
      provider.decks.get('shared-deck')!.updatedAt,
    );
    const afterDetect = (await getSavedDeckRecord('shared-deck', dbA))!;
    expect(afterDetect.syncStatus).toBe('conflict');
    expect(afterDetect.name).toBe('Device A Offline Edit');
    expect(afterDetect.mainboard[forestV1.id]).toBe(5);

    // pushPending MUST NEVER auto-push a conflicted record
    const pushCountBefore = provider.pushDeckCalls.length;
    const skippedPush = await engineA.pushPending('uid-alice', 'alice');
    expect(skippedPush.pushedCount).toBe(0);
    expect(provider.pushDeckCalls.length).toBe(pushCountBefore);

    // Strategy 1: keep-cloud
    const resKeepCloud = await engineA.resolveConflict(conflict, 'keep-cloud', 'uid-alice', 'alice');
    expect(resKeepCloud.conflicts).toEqual([]);
    const afterKeepCloud = (await getSavedDeckRecord('shared-deck', dbA))!;
    expect(afterKeepCloud.name).toBe('Device B Edit');
    expect(afterKeepCloud.mainboard[forestV1.id]).toBe(2);
    expect(afterKeepCloud.syncStatus).toBe('synced');
    expect(afterKeepCloud.revision).toBe(2);

    // Create a second conflict via syncAll (push conflict + pull deduplication)
    await dbB.decks.put({
      ...afterKeepCloud,
      name: 'Cloud Revision 3',
      syncStatus: 'pending',
      updatedAt: '2026-11-14T12:00:00.000Z',
    });
    await engineB.syncAll('uid-alice', 'alice');
    expect(provider.decks.get('shared-deck')?.revision).toBe(3);

    await dbA.decks.put({
      ...afterKeepCloud,
      name: 'Local Winner Edit',
      mainboard: { [solRingV1.id]: 1, [forestV1.id]: 9 },
      syncStatus: 'pending',
      updatedAt: '2026-11-14T12:05:00.000Z',
    });
    const syncConflictRes = await engineA.syncAll('uid-alice', 'alice');
    // Deduplicated to a single conflict entry despite push + pull both seeing it
    expect(syncConflictRes.conflicts).toHaveLength(1);
    const conflict2 = syncConflictRes.conflicts[0]!;

    // Strategy 2: keep-local (bumps expectedRevision to cloud.revision=3 -> writes rev 4)
    const resKeepLocal = await engineA.resolveConflict(conflict2, 'keep-local', 'uid-alice', 'alice');
    expect(resKeepLocal.pushedCount).toBe(1);
    expect(resKeepLocal.conflicts).toEqual([]);
    const afterKeepLocal = (await getSavedDeckRecord('shared-deck', dbA))!;
    expect(afterKeepLocal.name).toBe('Local Winner Edit');
    expect(afterKeepLocal.syncStatus).toBe('synced');
    expect(afterKeepLocal.revision).toBe(4);
    expect(provider.decks.get('shared-deck')?.name).toBe('Local Winner Edit');
    expect(provider.decks.get('shared-deck')?.revision).toBe(4);

    // Create a third conflict and resolve with Strategy 3: keep-both
    await engineB.syncAll('uid-alice', 'alice');
    const bRev4 = (await getSavedDeckRecord('shared-deck', dbB))!;
    await dbB.decks.put({
      ...bRev4,
      name: 'Cloud Variant',
      mainboard: { [solRingV1.id]: 1, [forestV1.id]: 3 },
      syncStatus: 'pending',
      updatedAt: '2026-11-14T13:00:00.000Z',
    });
    await engineB.syncAll('uid-alice', 'alice');

    await dbA.decks.put({
      ...afterKeepLocal,
      name: 'Local Variant',
      mainboard: { [solRingV1.id]: 1, [forestV1.id]: 7 },
      syncStatus: 'pending',
      updatedAt: '2026-11-14T13:05:00.000Z',
    });
    const syncConflict3 = await engineA.syncAll('uid-alice', 'alice');
    expect(syncConflict3.conflicts).toHaveLength(1);

    const resKeepBoth = await engineA.resolveConflict(
      syncConflict3.conflicts[0]!,
      'keep-both',
      'uid-alice',
      'alice',
    );
    expect(resKeepBoth.pushedCount).toBe(1);
    expect(resKeepBoth.pulledCount).toBe(1);
    expect(resKeepBoth.conflicts).toEqual([]);

    const allDecksA = await listSavedDeckRecords(dbA);
    expect(allDecksA).toHaveLength(2);
    const originalAfterBoth = allDecksA.find((d) => d.id === 'shared-deck')!;
    const copyAfterBoth = allDecksA.find((d) => d.id !== 'shared-deck')!;
    expect(originalAfterBoth.name).toBe('Cloud Variant');
    expect(originalAfterBoth.syncStatus).toBe('synced');
    expect(originalAfterBoth.revision).toBe(5);
    expect(copyAfterBoth.name).toBe('Local Variant (Local Copy)');
    expect(copyAfterBoth.mainboard[forestV1.id]).toBe(7);
    expect(copyAfterBoth.syncStatus).toBe('synced');
    expect(copyAfterBoth.revision).toBe(1);
    expect(provider.decks.get(copyAfterBoth.id)?.name).toBe('Local Variant (Local Copy)');
  });

  it('syncs cardlists end-to-end (oracleId roundtrip, delta pull, tombstones, and conflict strategies)', async () => {
    const dbA = createTestDb('list-a');
    const dbB = createTestDb('list-b');
    const provider = new InMemoryCloudProvider();
    const engineA = createEngine(provider, dbA, [solRingV1, ewitV1]);
    const engineB = createEngine(provider, dbB, [solRingV2, ewitV2]);

    // Helper roundtrip test
    const localSampleList = await createCardList(
      {
        id: 'list-binder-1',
        name: 'Trade & Foil Binder',
        description: 'Commander staples for trade',
        listType: 'trade',
        visibility: 'friends',
        ownerUid: 'uid-alice',
        entries: {
          [solRingV1.id]: {
            quantity: 3,
            foilQuantity: 1,
            forTradeQuantity: 2,
            note: 'Near Mint',
          },
          [ewitV1.id]: { quantity: 1 },
        },
      },
      dbA,
    );

    const cloudShape = cardListToCloudCardList(localSampleList, 'uid-alice', '@Alice', {
      [solRingV1.id]: solRingV1,
      [ewitV1.id]: ewitV1,
    });
    expect(cloudShape.entries['ora-sol']).toEqual({
      quantity: 3,
      foilQuantity: 1,
      forTradeQuantity: 2,
      note: 'Near Mint',
    });
    const convertedBack = cloudCardListToLocalCardList(cloudShape, {
      'ora-sol': solRingV2,
      'ora-ewit': ewitV2,
    });
    expect(convertedBack.entries[solRingV2.id]?.forTradeQuantity).toBe(2);

    // Sync Device A -> Device B
    await engineA.syncAll('uid-alice', 'alice');
    await engineB.syncAll('uid-alice', 'alice');

    const listOnB = (await getCardList('list-binder-1', dbB))!;
    expect(listOnB.entries[solRingV2.id]).toEqual({
      quantity: 3,
      foilQuantity: 1,
      forTradeQuantity: 2,
      note: 'Near Mint',
    });
    expect(listOnB.syncStatus).toBe('synced');
    expect(listOnB.revision).toBe(1);
    expect(await getSyncMeta(getCardListSyncMetaKey('uid-alice'), dbB)).toBe(
      provider.cardLists.get('list-binder-1')!.updatedAt,
    );

    // Conflict on cardlist: Device B pushes rev 2, Device A edits offline
    await saveCardList(
      {
        ...listOnB,
        name: 'Binder B Rev 2',
        syncStatus: 'pending',
        updatedAt: '2026-11-14T11:00:00.000Z',
      },
      dbB,
    );
    await engineB.syncAll('uid-alice', 'alice');

    const listOnA = (await getCardList('list-binder-1', dbA))!;
    await saveCardList(
      {
        ...listOnA,
        name: 'Binder A Local Edit',
        entries: { [solRingV1.id]: { quantity: 5 } },
        syncStatus: 'pending',
        updatedAt: '2026-11-14T11:05:00.000Z',
      },
      dbA,
    );

    const conflictSync = await engineA.syncAll('uid-alice', 'alice');
    expect(conflictSync.conflicts).toHaveLength(1);
    expect(conflictSync.conflicts[0]?.kind).toBe('cardlist');
    expect((await getCardList('list-binder-1', dbA))?.syncStatus).toBe('conflict');

    // Resolve with keep-both
    const keepBothRes = await engineA.resolveConflict(
      conflictSync.conflicts[0]!,
      'keep-both',
      'uid-alice',
      'alice',
    );
    expect(keepBothRes.pushedCount).toBe(1);
    expect(keepBothRes.conflicts).toEqual([]);

    const listsA = await listCardLists(dbA);
    expect(listsA).toHaveLength(2);
    const copyList = listsA.find((l) => l.id !== 'list-binder-1')!;
    expect(copyList.name).toBe('Binder A Local Edit (Local Copy)');
    expect(copyList.entries[solRingV1.id]?.quantity).toBe(5);
    expect(copyList.syncStatus).toBe('synced');

    // Also test keep-cloud & keep-local on cardlist conflicts + tombstone
    const origA = (await getCardList('list-binder-1', dbA))!;
    expect(origA.name).toBe('Binder B Rev 2');

    // Device B pushes rev 3, Device A edits offline -> keep-cloud
    await engineB.syncAll('uid-alice', 'alice');
    const listOnBRev2 = (await getCardList('list-binder-1', dbB))!;
    await saveCardList(
      {
        ...listOnBRev2,
        name: 'Binder B Rev 3',
        entries: { [solRingV2.id]: { quantity: 6 } },
        syncStatus: 'pending',
        updatedAt: '2026-11-14T12:00:00.000Z',
      },
      dbB,
    );
    await engineB.syncAll('uid-alice', 'alice');

    await saveCardList(
      {
        ...origA,
        name: 'Binder A Conflicted Cloud Wins',
        entries: { [solRingV1.id]: { quantity: 1 } },
        syncStatus: 'pending',
        updatedAt: '2026-11-14T12:05:00.000Z',
      },
      dbA,
    );
    const listConflictCloud = await engineA.syncAll('uid-alice', 'alice');
    expect(listConflictCloud.conflicts).toHaveLength(1);
    await engineA.resolveConflict(
      listConflictCloud.conflicts[0]!,
      'keep-cloud',
      'uid-alice',
      'alice',
    );
    const afterListCloud = (await getCardList('list-binder-1', dbA))!;
    expect(afterListCloud.name).toBe('Binder B Rev 3');
    expect(afterListCloud.entries[solRingV1.id]?.quantity).toBe(6);
    expect(afterListCloud.revision).toBe(3);

    // Device B pushes rev 4, Device A edits offline -> keep-local
    await saveCardList(
      {
        ...listOnBRev2,
        name: 'Binder B Rev 4',
        revision: 3,
        syncStatus: 'pending',
        updatedAt: '2026-11-14T12:30:00.000Z',
      },
      dbB,
    );
    await engineB.syncAll('uid-alice', 'alice');

    await saveCardList(
      {
        ...afterListCloud,
        name: 'Binder A Local Wins',
        entries: { [solRingV1.id]: { quantity: 9 } },
        syncStatus: 'pending',
        updatedAt: '2026-11-14T12:35:00.000Z',
      },
      dbA,
    );
    const listConflictLocal = await engineA.syncAll('uid-alice', 'alice');
    expect(listConflictLocal.conflicts).toHaveLength(1);
    const resListLocal = await engineA.resolveConflict(
      listConflictLocal.conflicts[0]!,
      'keep-local',
      'uid-alice',
      'alice',
    );
    expect(resListLocal.pushedCount).toBe(1);
    const afterListLocal = (await getCardList('list-binder-1', dbA))!;
    expect(afterListLocal.name).toBe('Binder A Local Wins');
    expect(afterListLocal.revision).toBe(5);
    expect(provider.cardLists.get('list-binder-1')?.revision).toBe(5);

    await softDeleteCardList('list-binder-1', dbA);
    await engineA.syncAll('uid-alice', 'alice');
    await engineB.syncAll('uid-alice', 'alice');

    const visibleOnB = await listCardLists(dbB);
    expect(visibleOnB.some((l) => l.id === 'list-binder-1')).toBe(false);
    expect(visibleOnB.some((l) => l.id === copyList.id)).toBe(true);
    expect((await getCardList('list-binder-1', dbB))?.deletedAt).toBeTruthy();
  });

  it('preserves local changes safely on offline, quota, and unconfigured errors without throwing', async () => {
    const db = createTestDb('errors');
    const provider = new InMemoryCloudProvider();
    const engine = createEngine(provider, db, [marwynV1, solRingV1]);

    await db.decks.put({
      id: 'offline-deck',
      name: 'Offline Brew',
      commanderIds: [marwynV1.id],
      mainboard: { [solRingV1.id]: 1 },
      sideboard: {},
      ownerUid: 'uid-alice',
      syncStatus: 'pending',
      revision: 0,
      createdAt: '2026-11-14T09:00:00.000Z',
      updatedAt: '2026-11-14T09:00:00.000Z',
    });

    await createCardList(
      {
        id: 'quota-list',
        name: 'Big Binder',
        listType: 'collection',
        ownerUid: 'uid-alice',
        entries: { [solRingV1.id]: { quantity: 10 } },
      },
      db,
    );

    // 1. Offline error keeps deck status 'pending'
    provider.nextPushDeckError = { code: 'firestore/unavailable', message: 'Offline' };
    provider.nextPushCardListError = {
      code: 'firestore/resource-exhausted',
      message: 'Quota exceeded',
    };

    const errRun = await engine.pushPending('uid-alice', 'alice');
    expect(errRun.pushedCount).toBe(0);
    expect(errRun.errors).toHaveLength(2);
    expect(errRun.errors[0]?.isOffline).toBe(true);
    expect(errRun.errors[1]?.isQuotaOrRateLimit).toBe(true);

    expect((await getSavedDeckRecord('offline-deck', db))?.syncStatus).toBe('pending');
    expect((await getCardList('quota-list', db))?.syncStatus).toBe('error');

    // 2. When cloud recovers, both 'pending' and 'error' records retry and upload cleanly
    const recoveryRun = await engine.pushPending('uid-alice', 'alice');
    expect(recoveryRun.pushedCount).toBe(2);
    expect(recoveryRun.errors).toEqual([]);
    expect((await getSavedDeckRecord('offline-deck', db))?.syncStatus).toBe('synced');
    expect((await getCardList('quota-list', db))?.syncStatus).toBe('synced');

    // 3. Oversized/invalid deck fails cleanly without blocking other decks, and Bob's deck is isolated
    const oversizedMainboard: Record<string, number> = {};
    for (let i = 0; i < 251; i++) {
      oversizedMainboard[`card-${i}`] = 1;
    }
    await db.decks.put({
      id: 'oversized-deck',
      name: 'Too Many Unique Cards',
      commanderIds: [],
      mainboard: oversizedMainboard,
      sideboard: {},
      ownerUid: 'uid-alice',
      syncStatus: 'pending',
      revision: 0,
      createdAt: '2026-11-14T09:10:00.000Z',
      updatedAt: '2026-11-14T09:10:00.000Z',
    });
    await db.decks.put({
      id: 'bob-pending-deck',
      name: 'Bob Unsynced Deck',
      commanderIds: [],
      mainboard: { [solRingV1.id]: 1 },
      sideboard: {},
      ownerUid: 'uid-bob',
      syncStatus: 'pending',
      revision: 0,
      createdAt: '2026-11-14T09:15:00.000Z',
      updatedAt: '2026-11-14T09:15:00.000Z',
    });

    const isolationRun = await engine.pushPending('uid-alice', 'alice');
    expect(isolationRun.errors.some((e) => e.id === 'oversized-deck')).toBe(true);
    expect((await getSavedDeckRecord('oversized-deck', db))?.syncStatus).toBe('error');
    expect(provider.decks.has('bob-pending-deck')).toBe(false);
    expect((await getSavedDeckRecord('bob-pending-deck', db))?.syncStatus).toBe('pending');

    // CardList pull error preserves lastCardListSyncAt watermark
    await setSyncMeta(getCardListSyncMetaKey('uid-alice'), '2026-11-14T10:00:00.000Z', db);
    provider.nextPullCardListsError = { code: 'resource-exhausted', message: 'Quota' };
    const pullListErr = await engine.pullUpdates('uid-alice', 'alice');
    expect(pullListErr.errors.some((e) => e.kind === 'pull-cardlists' && e.isQuotaOrRateLimit)).toBe(true);
    expect(await getSyncMeta(getCardListSyncMetaKey('uid-alice'), db)).toBe('2026-11-14T10:00:00.000Z');

    // 4. Unconfigured provider does not throw or touch cloud
    provider.configured = false;
    const unconfiguredRes = await engine.syncAll('uid-alice', 'alice');
    expect(unconfiguredRes).toEqual({
      pushedCount: 0,
      pulledCount: 0,
      conflicts: [],
      errors: [],
    });
  });

  it('builds non-deleted account export bundles and performs shared-PC sign-out cleanup safely', async () => {
    const db = createTestDb('export-cleanup');
    const provider = new InMemoryCloudProvider();
    const engine = createEngine(provider, db, [marwynV1, solRingV1]);

    // Active deck for Alice
    await db.decks.put({
      id: 'alice-active',
      name: 'Alice Active',
      commanderIds: [marwynV1.id],
      mainboard: { [solRingV1.id]: 1 },
      sideboard: {},
      ownerUid: 'uid-alice',
      ownerHandle: 'alice',
      syncStatus: 'synced',
      revision: 1,
      deletedAt: null,
      createdAt: '2026-11-14T09:00:00.000Z',
      updatedAt: '2026-11-14T09:00:00.000Z',
    });

    // Soft-deleted deck for Alice — must NOT be included in export bundle
    await db.decks.put({
      id: 'alice-deleted',
      name: 'Alice Deleted',
      commanderIds: [],
      mainboard: {},
      sideboard: {},
      ownerUid: 'uid-alice',
      syncStatus: 'synced',
      revision: 2,
      deletedAt: '2026-11-14T10:00:00.000Z',
      createdAt: '2026-11-14T08:00:00.000Z',
      updatedAt: '2026-11-14T10:00:00.000Z',
    });

    // Local-only guest deck & another user's deck
    await db.decks.put({
      id: 'guest-only',
      name: 'Guest Local Brew',
      commanderIds: [],
      mainboard: { [solRingV1.id]: 1 },
      sideboard: {},
      ownerUid: null,
      syncStatus: 'local',
      revision: 0,
      deletedAt: null,
      createdAt: '2026-11-14T07:00:00.000Z',
      updatedAt: '2026-11-14T07:00:00.000Z',
    });
    await db.decks.put({
      id: 'bob-deck',
      name: 'Bob Deck',
      commanderIds: [],
      mainboard: { [solRingV1.id]: 1 },
      sideboard: {},
      ownerUid: 'uid-bob',
      syncStatus: 'synced',
      revision: 1,
      deletedAt: null,
      createdAt: '2026-11-14T07:30:00.000Z',
      updatedAt: '2026-11-14T07:30:00.000Z',
    });

    // Active & deleted cardlists
    await createCardList(
      {
        id: 'alice-list-active',
        name: 'Alice Wishlist',
        listType: 'wishlist',
        ownerUid: 'uid-alice',
        entries: { [solRingV1.id]: { quantity: 1 } },
      },
      db,
    );
    const deletedList = await createCardList(
      {
        id: 'alice-list-deleted',
        name: 'Alice Old Trades',
        listType: 'trade',
        ownerUid: 'uid-alice',
      },
      db,
    );
    await softDeleteCardList(deletedList.id, db);
    await createCardList(
      {
        id: 'guest-list',
        name: 'Guest Collection',
        listType: 'collection',
        ownerUid: null,
      },
      db,
    );

    const profile: UserProfile = {
      uid: 'uid-alice',
      handle: 'Alice',
      handleLower: 'alice',
      displayName: 'Alice',
      createdAt: '2026-11-14T00:00:00.000Z',
      updatedAt: '2026-11-14T00:00:00.000Z',
    };

    const bundle = await buildAccountExportBundle(profile, db);
    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.profile).toEqual(profile);
    expect(bundle.decks.map((d) => d.id)).not.toContain('alice-deleted');
    expect(bundle.decks.map((d) => d.id)).not.toContain('bob-deck');
    expect(bundle.decks.map((d) => d.id)).toContain('alice-active');
    expect(bundle.decks.map((d) => d.id)).toContain('guest-only');
    expect(bundle.cardlists.map((l) => l.id)).not.toContain('alice-list-deleted');
    expect(bundle.cardlists.map((l) => l.id)).toContain('alice-list-active');

    // Set sync meta and test sign-out cleanup WITHOUT removing cached copies
    await setSyncMeta(getDeckSyncMetaKey('uid-alice'), '2026-11-14T11:00:00.000Z', db);
    await setSyncMeta(getCardListSyncMetaKey('uid-alice'), '2026-11-14T11:00:00.000Z', db);

    await engine.cleanupOnSignOut('uid-alice', false);
    expect(await getSyncMeta(getDeckSyncMetaKey('uid-alice'), db)).toBeNull();
    expect(await getSyncMeta(getCardListSyncMetaKey('uid-alice'), db)).toBeNull();
    expect(await getSavedDeckRecord('alice-active', db)).toBeDefined();
    expect(await getCardList('alice-list-active', db)).toBeDefined();

    // Sign-out cleanup WITH removeCachedCloudCopies=true removes only uid-alice's records
    await setSyncMeta(getDeckSyncMetaKey('uid-alice'), '2026-11-14T12:00:00.000Z', db);
    await setSyncMeta(getCardListSyncMetaKey('uid-alice'), '2026-11-14T12:00:00.000Z', db);
    await cleanupOnSignOut('uid-alice', true, db);

    expect(await getSyncMeta(getDeckSyncMetaKey('uid-alice'), db)).toBeNull();
    expect(await getSyncMeta(getCardListSyncMetaKey('uid-alice'), db)).toBeNull();
    expect(await getSavedDeckRecord('alice-active', db)).toBeUndefined();
    expect(await getSavedDeckRecord('alice-deleted', db)).toBeUndefined();
    expect(await getCardList('alice-list-active', db)).toBeUndefined();
    expect(await getCardList('alice-list-deleted', db)).toBeUndefined();

    // Guest-only and Bob's records remain completely untouched
    expect(await getSavedDeckRecord('guest-only', db)).toBeDefined();
    expect(await getSavedDeckRecord('bob-deck', db)).toBeDefined();
    expect(await getCardList('guest-list', db)).toBeDefined();
  });

  it('isolates listSavedDeckRecords and listCardLists by activeUid and cleans localStorage handle and active draft on sign-out', async () => {
    const db = createTestDb('multi-user-isolation');
    await db.decks.bulkPut([
      {
        id: 'alice-deck',
        name: 'Alice Deck',
        commanderIds: [marwynV1.id],
        mainboard: { [solRingV1.id]: 1 },
        sideboard: {},
        ownerUid: 'uid-alice',
        syncStatus: 'synced',
        revision: 1,
        deletedAt: null,
        createdAt: '2026-11-14T10:00:00.000Z',
        updatedAt: '2026-11-14T10:00:00.000Z',
      },
      {
        id: 'bob-deck',
        name: 'Bob Deck',
        commanderIds: [],
        mainboard: { [solRingV1.id]: 1 },
        sideboard: {},
        ownerUid: 'uid-bob',
        syncStatus: 'synced',
        revision: 1,
        deletedAt: null,
        createdAt: '2026-11-14T10:05:00.000Z',
        updatedAt: '2026-11-14T10:05:00.000Z',
      },
      {
        id: 'guest-deck',
        name: 'Guest Deck',
        commanderIds: [],
        mainboard: { [solRingV1.id]: 1 },
        sideboard: {},
        ownerUid: null,
        syncStatus: 'local',
        revision: 0,
        deletedAt: null,
        createdAt: '2026-11-14T09:00:00.000Z',
        updatedAt: '2026-11-14T09:00:00.000Z',
      },
    ]);

    await createCardList(
      { id: 'alice-list', name: 'Alice List', listType: 'wishlist', ownerUid: 'uid-alice' },
      db,
    );
    await createCardList(
      { id: 'bob-list', name: 'Bob List', listType: 'wishlist', ownerUid: 'uid-bob' },
      db,
    );
    await createCardList(
      { id: 'guest-list', name: 'Guest List', listType: 'collection', ownerUid: null },
      db,
    );

    const aliceDecks = await listSavedDeckRecords(db, { activeUid: 'uid-alice' });
    expect(aliceDecks.map((d) => d.id)).toEqual(['alice-deck', 'guest-deck']);

    const guestOnlyDecks = await listSavedDeckRecords(db, { activeUid: null });
    expect(guestOnlyDecks.map((d) => d.id)).toEqual(['guest-deck']);

    const aliceLists = await listCardLists(db, { activeUid: 'uid-alice' });
    expect(aliceLists.map((l) => l.id).sort()).toEqual(['alice-list', 'guest-list']);

    const guestOnlyLists = await listCardLists(db, { activeUid: null });
    expect(guestOnlyLists.map((l) => l.id)).toEqual(['guest-list']);

    const store = new Map<string, string>();
    const mockStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    };
    vi.stubGlobal('window', { localStorage: mockStorage });

    try {
      expect(ACTIVE_DECK_STORAGE_KEY).toBe('ripple99_active_deck_v1');
      const pendingKey = getPendingHandleStorageKey('uid-alice');
      expect(pendingKey).toBe('ripple99_pending_handle_uid-alice');
      store.set(pendingKey, 'alice_mtg');
      store.set('ripple99_active_deck_v1', JSON.stringify({ id: 'alice-deck', ownerUid: 'uid-alice' }));

      await cleanupOnSignOut('uid-alice', false, db);
      expect(store.has(pendingKey)).toBe(false);
      expect(store.has('ripple99_active_deck_v1')).toBe(true);

      await cleanupOnSignOut('uid-alice', true, db);
      expect(store.has('ripple99_active_deck_v1')).toBe(false);

      // Should not delete another user's or guest's active draft in localStorage
      store.set('ripple99_active_deck_v1', JSON.stringify({ id: 'bob-deck', ownerUid: 'uid-bob' }));
      await cleanupOnSignOut('uid-alice', true, db);
      expect(store.has('ripple99_active_deck_v1')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('serializes overlapping syncAll, pushPending, and pullUpdates calls without duplicate pushes or self-conflicts', async () => {
    const db = createTestDb('mutex-sync');
    const provider = new InMemoryCloudProvider();
    const engine = createEngine(provider, db, [marwynV1, solRingV1]);

    await db.decks.put({
      id: 'concurrent-deck',
      name: 'Concurrent Brew',
      commanderIds: [marwynV1.id],
      mainboard: { [solRingV1.id]: 1 },
      sideboard: {},
      ownerUid: 'uid-alice',
      syncStatus: 'pending',
      revision: 0,
      deletedAt: null,
      createdAt: '2026-11-14T09:00:00.000Z',
      updatedAt: '2026-11-14T09:00:00.000Z',
    });

    await createCardList(
      {
        id: 'concurrent-list',
        name: 'Concurrent Binder',
        listType: 'collection',
        ownerUid: 'uid-alice',
        entries: { [solRingV1.id]: { quantity: 2 } },
      },
      db,
    );

    let activePushCount = 0;
    let maxConcurrentPushes = 0;
    let releaseFirstPush!: () => void;
    const firstPushStarted = new Promise<void>((resolve) => {
      const origPushDeck = provider.pushDeck.bind(provider);
      provider.pushDeck = async (deck, expectedRevision) => {
        activePushCount += 1;
        maxConcurrentPushes = Math.max(maxConcurrentPushes, activePushCount);
        if (provider.pushDeckCalls.length === 0) {
          resolve();
          await new Promise<void>((gateResolve) => {
            releaseFirstPush = gateResolve;
          });
        }
        try {
          return await origPushDeck(deck, expectedRevision);
        } finally {
          activePushCount -= 1;
        }
      };
    });

    // Launch overlapping syncAll -> pushPending -> pullUpdates -> syncAll while first push is in-flight
    const sync1Promise = engine.syncAll('uid-alice', 'alice');
    await firstPushStarted;
    const pushPromise = engine.pushPending('uid-alice', 'alice');
    const pullPromise = engine.pullUpdates('uid-alice', 'alice');
    const sync2Promise = engine.syncAll('uid-alice', 'alice');

    // Allow microtasks to settle so any non-serialized race would have entered pushDeck by now
    await Promise.resolve();
    await Promise.resolve();
    expect(activePushCount).toBe(1);

    releaseFirstPush();
    const [sync1, push2, pullRes, sync2] = await Promise.all([
      sync1Promise,
      pushPromise,
      pullPromise,
      sync2Promise,
    ]);

    expect(maxConcurrentPushes).toBe(1);
    expect(provider.pushDeckCalls).toEqual([{ id: 'concurrent-deck', expectedRevision: 0 }]);
    expect(provider.pushCardListCalls).toEqual([{ id: 'concurrent-list', expectedRevision: 0 }]);

    expect(sync1.pushedCount).toBe(2);
    expect(push2.pushedCount).toBe(0);
    expect(sync2.pushedCount).toBe(0);
    expect(pullRes.conflicts).toEqual([]);
    expect([...sync1.conflicts, ...push2.conflicts, ...sync2.conflicts]).toEqual([]);
    expect([...sync1.errors, ...push2.errors, ...pullRes.errors, ...sync2.errors]).toEqual([]);

    const savedDeck = await getSavedDeckRecord('concurrent-deck', db);
    expect(savedDeck?.syncStatus).toBe('synced');
    expect(savedDeck?.revision).toBe(1);
    const savedList = await getCardList('concurrent-list', db);
    expect(savedList?.syncStatus).toBe('synced');
    expect(savedList?.revision).toBe(1);
  });

  it('serializes resolveConflict against concurrent pushPending/syncAll and recovers cleanly after a thrown error', async () => {
    const db = createTestDb('mutex-resolve-recovery');
    const provider = new InMemoryCloudProvider();

    let failNextResolveCards = false;
    const search = new CardSearchEngine([marwynV1, solRingV1]);
    const engine = new CloudSyncEngine({
      provider,
      db,
      resolveCardsByIds: async (ids) => {
        if (failNextResolveCards) {
          failNextResolveCards = false;
          throw new Error('Catalog worker crashed');
        }
        return search.getCardsByIdMap(ids);
      },
    });

    // Seed cloud revision 2 for a deck that has diverged locally at revision 1
    provider.decks.set('conflict-deck', {
      id: 'conflict-deck',
      ownerUid: 'uid-alice',
      ownerHandle: 'alice',
      name: 'Cloud Revision 2',
      commanderOracleIds: ['ora-marwyn'],
      colorIdentity: ['G'],
      mainboard: { 'ora-sol': 1 },
      sideboard: {},
      synergyThemes: [],
      cardCount: 2,
      lockSearchToCommanderIdentity: true,
      visibility: 'private',
      sharedWithUids: [],
      revision: 2,
      createdAt: '2026-11-14T09:00:00.000Z',
      updatedAt: '2026-11-14T10:30:00.000Z',
      deletedAt: null,
    });

    await db.decks.put({
      id: 'conflict-deck',
      name: 'Local Conflict Winner',
      commanderIds: [marwynV1.id],
      mainboard: { [solRingV1.id]: 1 },
      sideboard: {},
      ownerUid: 'uid-alice',
      ownerHandle: 'alice',
      syncStatus: 'pending',
      revision: 1,
      cloudUpdatedAt: '2026-11-14T09:30:00.000Z',
      deletedAt: null,
      createdAt: '2026-11-14T09:00:00.000Z',
      updatedAt: '2026-11-14T10:35:00.000Z',
    });

    const pullRes = await engine.pullUpdates('uid-alice', 'alice');
    expect(pullRes.conflicts).toHaveLength(1);
    const conflict = pullRes.conflicts[0]!;

    // 1. Overlapping resolveConflict('keep-local') + pushPending + syncAll must only push once
    let activeResolvePushes = 0;
    let maxResolveConcurrentPushes = 0;
    let releaseResolvePush!: () => void;
    const origPushDeck = provider.pushDeck.bind(provider);
    const resolvePushStarted = new Promise<void>((resolve) => {
      provider.pushDeck = async (deck, expectedRevision) => {
        activeResolvePushes += 1;
        maxResolveConcurrentPushes = Math.max(maxResolveConcurrentPushes, activeResolvePushes);
        resolve();
        await new Promise<void>((gateResolve) => {
          releaseResolvePush = gateResolve;
        });
        try {
          return await origPushDeck(deck, expectedRevision);
        } finally {
          activeResolvePushes -= 1;
        }
      };
    });

    const resolvePromise = engine.resolveConflict(conflict, 'keep-local', 'uid-alice', 'alice');
    await resolvePushStarted;
    // At this point Dexie already holds preparedLocal with syncStatus='pending' & revision=2!
    const concurrentPushPromise = engine.pushPending('uid-alice', 'alice');
    const concurrentSyncPromise = engine.syncAll('uid-alice', 'alice');

    await Promise.resolve();
    await Promise.resolve();
    expect(activeResolvePushes).toBe(1);
    expect(provider.pushDeckCalls).toHaveLength(0);

    releaseResolvePush();
    const [resolveRes, concurrentPushRes, concurrentSyncRes] = await Promise.all([
      resolvePromise,
      concurrentPushPromise,
      concurrentSyncPromise,
    ]);

    expect(maxResolveConcurrentPushes).toBe(1);
    expect(provider.pushDeckCalls).toEqual([{ id: 'conflict-deck', expectedRevision: 2 }]);
    expect(resolveRes.pushedCount).toBe(1);
    expect(resolveRes.conflicts).toEqual([]);
    expect(concurrentPushRes.pushedCount).toBe(0);
    expect(concurrentPushRes.conflicts).toEqual([]);
    expect(concurrentSyncRes.pushedCount).toBe(0);
    expect(concurrentSyncRes.conflicts).toEqual([]);
    expect((await getSavedDeckRecord('conflict-deck', db))?.revision).toBe(3);

    // 2. Mutex recovery after a throwing operation: failure rejects caller without wedging queued calls
    provider.pushDeck = origPushDeck;
    await db.decks.put({
      id: 'recovery-deck',
      name: 'Queued After Failure',
      commanderIds: [marwynV1.id],
      mainboard: { [solRingV1.id]: 1 },
      sideboard: {},
      ownerUid: 'uid-alice',
      syncStatus: 'pending',
      revision: 0,
      deletedAt: null,
      createdAt: '2026-11-14T11:00:00.000Z',
      updatedAt: '2026-11-14T11:00:00.000Z',
    });

    // Force resolveConflict('keep-cloud') to throw out of the mutex via resolveCardsByIds
    // while another pushPending is already queued behind it on the mutex.
    failNextResolveCards = true;
    const failingResolve = engine.resolveConflict(conflict, 'keep-cloud', 'uid-alice', 'alice');
    const queuedPush = engine.pushPending('uid-alice', 'alice');

    const [resolveOutcome, queuedPushOutcome] = await Promise.allSettled([
      failingResolve,
      queuedPush,
    ]);
    expect(resolveOutcome.status).toBe('rejected');
    if (resolveOutcome.status === 'rejected') {
      expect(String(resolveOutcome.reason)).toContain('Catalog worker crashed');
    }
    expect(queuedPushOutcome.status).toBe('fulfilled');
    if (queuedPushOutcome.status === 'fulfilled') {
      expect(queuedPushOutcome.value.pushedCount).toBe(1);
      expect(queuedPushOutcome.value.errors).toEqual([]);
    }
    expect((await getSavedDeckRecord('recovery-deck', db))?.syncStatus).toBe('synced');
    expect((await getSavedDeckRecord('recovery-deck', db))?.revision).toBe(1);
  });
});
