import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCloudUrlIntents } from '../cloud/validation.js';
import { MtgCardDatabase, type SavedDeckRecord } from '../db/cardDb.js';
import {
  getSavedDeckRecord,
  listSavedDeckRecords,
} from '../db/deckDb.js';
import {
  CLOUD_PUSH_DEBOUNCE_MS,
  CloudSyncController,
  computeDeckSynergyThemes,
  hydrateCloudDeckToClonedDraft,
  type ExternalDecksUpdatedMeta,
} from '../hooks/useCloudSync.js';
import { deleteSavedDeckByPolicy } from '../hooks/useDeckDraft.js';
import type { CompactCard, ManaColor } from '../types/card.js';
import type {
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
    typeLine: options.isCommander ? 'Legendary Creature — Angel Horror' : 'Artifact',
    oracleText: '',
    colors: colorIdentity,
    colorIdentity,
    keywords: [],
    edhrecRank: 15,
    priceUsd: 3.5,
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
  signOutCalls = 0;

  private clockMs = Date.parse('2026-11-15T00:00:00.000Z');

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
      uid: 'uid-alice',
      email,
      emailVerified: false,
      displayName: handle,
      providerIds: ['password'],
    };
  }

  async signInWithEmail(email: string): Promise<CloudUser> {
    return {
      uid: 'uid-alice',
      email,
      emailVerified: true,
      displayName: 'alice',
      providerIds: ['password'],
    };
  }

  async signInWithGoogle(): Promise<CloudUser> {
    return {
      uid: 'uid-alice',
      email: 'alice@example.com',
      emailVerified: true,
      displayName: 'Alice',
      providerIds: ['google.com'],
    };
  }

  async resendVerificationEmail(): Promise<void> {}
  async reloadUser(): Promise<CloudUser | null> {
    return null;
  }
  async sendPasswordReset(): Promise<void> {}
  async signOut(): Promise<void> {
    this.signOutCalls += 1;
  }
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

  async pullCardListsSince(): Promise<CloudCardListRecord[]> {
    return [];
  }

  async pushCardList(
    list: CloudCardListRecord,
    expectedRevision: number,
  ): Promise<PushResult<CloudCardListRecord>> {
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
    throw new Error('Not needed in integration test');
  }
  async acceptFriendRequest(): Promise<void> {}
  async removeFriendship(): Promise<void> {}
  async getFriendDecks(): Promise<FriendDeckSummary[]> {
    return [];
  }
  async deleteAccountAndData(): Promise<void> {}
}

class FakeEventTarget {
  private listeners = new Map<string, Set<() => void>>();
  visibilityState: DocumentVisibilityState = 'visible';

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const fn =
      typeof listener === 'function'
        ? (listener as () => void)
        : () => listener.handleEvent(new Event(type));
    const bucket = this.listeners.get(type) ?? new Set();
    bucket.add(fn);
    this.listeners.set(type, bucket);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (typeof listener !== 'function') return;
    this.listeners.get(type)?.delete(listener as () => void);
  }

  dispatch(type: string): void {
    const bucket = this.listeners.get(type);
    if (!bucket) return;
    for (const fn of bucket) {
      fn();
    }
  }
}

const VERIFIED_USER: CloudUser = {
  uid: 'uid-alice',
  email: 'alice@example.com',
  emailVerified: true,
  displayName: 'Alice',
  providerIds: ['password'],
};

const ALICE_PROFILE: UserProfile = {
  uid: 'uid-alice',
  handle: 'alice_edh',
  handleLower: 'alice_edh',
  displayName: 'Alice',
  createdAt: '2026-11-15T00:00:00.000Z',
  updatedAt: '2026-11-15T00:00:00.000Z',
};

describe('App Cloud Sync Integration', () => {
  const createdDbs: MtgCardDatabase[] = [];
  const controllers: CloudSyncController[] = [];

  function createTestDb(suffix: string): MtgCardDatabase {
    const db = new MtgCardDatabase(
      `mtg-app-cloud-int-${suffix}-${Math.random().toString(36).slice(2)}`,
    );
    createdDbs.push(db);
    return db;
  }

  async function flushAsyncWork(): Promise<void> {
    for (let i = 0; i < 20; i += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  afterEach(async () => {
    vi.useRealTimers();
    for (const controller of controllers.splice(0)) {
      controller.dispose();
    }
    for (const db of createdDbs.splice(0)) {
      db.close();
      await db.delete();
    }
  });

  it('batches rapid deck edits into one cloud push after 4s trailing debounce and flushes immediately on hidden visibility / pagehide', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });

    const db = createTestDb('debounce');
    const provider = new InMemoryCloudProvider();
    const fakeWindow = new FakeEventTarget();
    const fakeDocument = new FakeEventTarget();
    const externalUpdates: ExternalDecksUpdatedMeta[] = [];

    const cmd = makeCard('print-cmd', 'Atraxa, Praetors Voice', 'oracle-atraxa', {
      isCommander: true,
      colorIdentity: ['W', 'U', 'B', 'G'],
      themes: ['counters', 'proliferate'],
    });
    const solRing = makeCard('print-sol', 'Sol Ring', 'oracle-sol-ring', {
      themes: ['ramp'],
    });
    const cardMap: Record<string, CompactCard> = {
      [cmd.id]: cmd,
      [solRing.id]: solRing,
      [cmd.oracleId]: cmd,
      [solRing.oracleId]: solRing,
    };

    const controller = new CloudSyncController({
      provider,
      db,
      resolveCardsByIds: async (ids) => {
        const out: Record<string, CompactCard> = {};
        for (const id of ids) {
          if (cardMap[id]) out[id] = cardMap[id]!;
        }
        return out;
      },
      onExternalDecksUpdated: (meta) => {
        externalUpdates.push(meta);
      },
      windowTarget: fakeWindow as unknown as Pick<Window, 'addEventListener' | 'removeEventListener'>,
      documentTarget: fakeDocument as unknown as Pick<
        Document,
        'addEventListener' | 'removeEventListener'
      > & { visibilityState?: DocumentVisibilityState },
    });
    controllers.push(controller);
    const detach = controller.attachListeners();

    // Unverified user must not auto-sync
    controller.setAuthContext({ ...VERIFIED_USER, emailVerified: false }, ALICE_PROFILE);
    await flushAsyncWork();
    expect(provider.pullDecksCalls).toHaveLength(0);

    // Verified user + profile triggers initial pull/push sync
    controller.setAuthContext(VERIFIED_USER, ALICE_PROFILE);
    await flushAsyncWork();
    expect(provider.pullDecksCalls).toHaveLength(1);

    // Save a local pending deck and simulate rapid clicks
    const deckRecord: SavedDeckRecord = {
      id: 'deck-atraxa',
      name: 'Atraxa Brew',
      description: 'Turn 4 proliferate',
      commanderIds: [cmd.id],
      mainboard: { [solRing.id]: 1 },
      sideboard: {},
      lockSearchToCommanderIdentity: true,
      visibility: 'private',
      revision: 0,
      syncStatus: 'pending',
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-15T00:00:01.000Z',
    };
    await db.decks.put(deckRecord);

    // Rapid schedule calls across < 4s must NOT trigger pushDeck prematurely
    controller.scheduleCloudPush();
    expect(controller.getSnapshot().overallSyncStatus).toBe('pending');
    await vi.advanceTimersByTimeAsync(2000);
    expect(provider.pushDeckCalls).toHaveLength(0);

    await db.decks.update('deck-atraxa', {
      name: 'Atraxa Superfriends',
      updatedAt: '2026-11-15T00:00:03.000Z',
    });
    controller.scheduleCloudPush();
    await vi.advanceTimersByTimeAsync(3500);
    expect(provider.pushDeckCalls).toHaveLength(0);

    // Advancing past remaining 500ms fires the single batched push
    await vi.advanceTimersByTimeAsync(CLOUD_PUSH_DEBOUNCE_MS);
    await flushAsyncWork();

    expect(provider.pushDeckCalls).toHaveLength(1);
    expect(provider.decks.get('deck-atraxa')?.name).toBe('Atraxa Superfriends');
    expect(provider.decks.get('deck-atraxa')?.revision).toBe(1);
    expect(externalUpdates.some((u) => u.reason === 'push')).toBe(true);

    // Edit again and hide tab -> flushes immediately without waiting 4s
    await db.decks.update('deck-atraxa', {
      name: 'Atraxa V2',
      syncStatus: 'pending',
      updatedAt: '2026-11-15T00:01:00.000Z',
    });
    controller.scheduleCloudPush();
    fakeDocument.visibilityState = 'hidden';
    fakeDocument.dispatch('visibilitychange');
    await flushAsyncWork();
    await vi.advanceTimersByTimeAsync(1);
    await flushAsyncWork();

    expect(provider.pushDeckCalls).toHaveLength(2);
    expect(provider.decks.get('deck-atraxa')?.name).toBe('Atraxa V2');
    expect(provider.decks.get('deck-atraxa')?.revision).toBe(2);

    detach();
  });

  it('detects sync conflicts and resolves them across keep-cloud, keep-local, and keep-both', async () => {
    const db = createTestDb('conflict');
    const provider = new InMemoryCloudProvider();
    const externalUpdates: ExternalDecksUpdatedMeta[] = [];

    const cmd = makeCard('cmd-1', 'Krenko, Mob Boss', 'oracle-krenko', {
      isCommander: true,
      colorIdentity: ['R'],
      themes: ['tokens'],
    });
    const cardMap: Record<string, CompactCard> = {
      [cmd.id]: cmd,
      [cmd.oracleId]: cmd,
    };

    // Cloud starts at revision 2 (updated from another device)
    provider.decks.set('deck-conflict', {
      id: 'deck-conflict',
      ownerUid: VERIFIED_USER.uid,
      ownerHandle: ALICE_PROFILE.handle,
      name: 'Krenko Cloud Rev 2',
      commanderOracleIds: [cmd.oracleId],
      colorIdentity: ['R'],
      mainboard: {},
      sideboard: {},
      cardCount: 1,
      lockSearchToCommanderIdentity: true,
      visibility: 'friends',
      sharedWithUids: [],
      synergyThemes: ['tokens'],
      revision: 2,
      deletedAt: null,
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-15T00:05:00.000Z',
    });

    // Local device has stale revision 1 with pending local edits
    await db.decks.put({
      id: 'deck-conflict',
      ownerUid: VERIFIED_USER.uid,
      ownerHandle: ALICE_PROFILE.handle,
      name: 'Krenko Local Pending',
      commanderIds: [cmd.id],
      mainboard: {},
      sideboard: {},
      lockSearchToCommanderIdentity: true,
      visibility: 'private',
      revision: 1,
      syncStatus: 'pending',
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-15T00:04:00.000Z',
    });

    const controller = new CloudSyncController({
      provider,
      db,
      resolveCardsByIds: async (ids) => {
        const out: Record<string, CompactCard> = {};
        for (const id of ids) {
          if (cardMap[id]) out[id] = cardMap[id]!;
        }
        return out;
      },
      onExternalDecksUpdated: (meta) => {
        externalUpdates.push(meta);
      },
      windowTarget: null,
      documentTarget: null,
    });
    controllers.push(controller);

    controller.setAuthContext(VERIFIED_USER, ALICE_PROFILE);
    await controller.syncNow();

    let snap = controller.getSnapshot();
    expect(snap.conflicts).toHaveLength(1);
    expect(snap.activeConflict?.id).toBe('deck-conflict');
    expect(snap.overallSyncStatus).toBe('conflict');

    // Dismissing hides activeConflict without erasing the underlying conflict state
    controller.dismissActiveConflict();
    expect(controller.getSnapshot().activeConflict).toBeNull();
    expect(controller.getSnapshot().conflicts).toHaveLength(1);

    controller.openConflictModal();
    expect(controller.getSnapshot().activeConflict?.id).toBe('deck-conflict');

    // Keep-both preserves local copy under a new ID and updates original deck from cloud
    await controller.resolveActiveConflict('keep-both');
    snap = controller.getSnapshot();
    expect(snap.conflicts).toHaveLength(0);
    expect(snap.activeConflict).toBeNull();
    expect(externalUpdates.some((u) => u.reason === 'conflict')).toBe(true);

    const allDecks = await listSavedDeckRecords(db);
    expect(allDecks).toHaveLength(2);
    expect(allDecks.find((d) => d.id === 'deck-conflict')?.name).toBe('Krenko Cloud Rev 2');
    expect(allDecks.some((d) => d.id !== 'deck-conflict' && d.name.includes('Krenko Local Pending'))).toBe(true);
  });

  it('creates soft-delete tombstones for cloud-backed decks vs permanent delete for local-only decks', async () => {
    const db = createTestDb('delete-policy');
    const provider = new InMemoryCloudProvider();

    const cloudBackedLocal: SavedDeckRecord = {
      id: 'deck-cloud-1',
      ownerUid: VERIFIED_USER.uid,
      ownerHandle: ALICE_PROFILE.handle,
      name: 'Cloud Deck',
      commanderIds: [],
      mainboard: {},
      sideboard: {},
      lockSearchToCommanderIdentity: true,
      revision: 1,
      syncStatus: 'synced',
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-15T00:00:00.000Z',
    };
    const pureLocalOnly: SavedDeckRecord = {
      id: 'deck-local-1',
      name: 'Local Only Deck',
      commanderIds: [],
      mainboard: {},
      sideboard: {},
      lockSearchToCommanderIdentity: true,
      revision: 0,
      syncStatus: 'local',
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-15T00:00:00.000Z',
    };

    await db.decks.put(cloudBackedLocal);
    await db.decks.put(pureLocalOnly);
    provider.decks.set('deck-cloud-1', {
      id: 'deck-cloud-1',
      ownerUid: VERIFIED_USER.uid,
      ownerHandle: ALICE_PROFILE.handle,
      name: 'Cloud Deck',
      commanderOracleIds: [],
      colorIdentity: [],
      mainboard: {},
      sideboard: {},
      cardCount: 0,
      lockSearchToCommanderIdentity: true,
      visibility: 'private',
      sharedWithUids: [],
      synergyThemes: [],
      revision: 1,
      deletedAt: null,
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-15T00:00:00.000Z',
    });

    const cloudRes = await deleteSavedDeckByPolicy('deck-cloud-1', db);
    expect(cloudRes).toEqual({ deleted: true, cloudBacked: true });

    const localRes = await deleteSavedDeckByPolicy('deck-local-1', db);
    expect(localRes).toEqual({ deleted: true, cloudBacked: false });

    // Neither deck is shown in visible list
    expect(await listSavedDeckRecords(db)).toHaveLength(0);

    // Local-only deck is permanently gone; cloud-backed deck has pending tombstone
    expect(await getSavedDeckRecord('deck-local-1', db)).toBeUndefined();
    const tombstone = await getSavedDeckRecord('deck-cloud-1', db);
    expect(tombstone?.deletedAt).toBeTruthy();
    expect(tombstone?.syncStatus).toBe('pending');

    // Flushing pushes tombstone to cloud
    const controller = new CloudSyncController({
      provider,
      db,
      resolveCardsByIds: async () => ({}),
      windowTarget: null,
      documentTarget: null,
    });
    controllers.push(controller);
    controller.setAuthContext(VERIFIED_USER, ALICE_PROFILE);
    await controller.flushPendingPush();

    expect(provider.decks.get('deck-cloud-1')?.deletedAt).toBeTruthy();
    expect(provider.decks.get('deck-cloud-1')?.revision).toBe(2);
    expect(provider.pushDeckCalls.some((c) => c.id === 'deck-local-1')).toBe(false);
  });

  it('parses ?deck & ?addFriend intents and hydrates cloned ?deck=<id> cards via oracleId', async () => {
    const intents = parseCloudUrlIntents('?deck=shared-99&addFriend=mana_mage');
    expect(intents).toEqual({
      sharedDeckId: 'shared-99',
      addFriendHandle: 'mana_mage',
    });

    const localAtraxa = makeCard('print-2xm-atraxa', 'Atraxa, Praetors Voice', 'oracle-atraxa', {
      isCommander: true,
      colorIdentity: ['W', 'U', 'B', 'G'],
      themes: ['counters', 'proliferate'],
    });
    const localSolRing = makeCard('print-c21-solring', 'Sol Ring', 'oracle-sol-ring', {
      themes: ['ramp'],
    });
    const localSwords = makeCard(
      'print-mh2-swords',
      'Swords to Plowshares',
      'oracle-swords',
      { colorIdentity: ['W'], themes: ['removal'] },
    );

    const oracleCatalog: Record<string, CompactCard> = {
      [localAtraxa.oracleId]: localAtraxa,
      [localSolRing.oracleId]: localSolRing,
      [localSwords.oracleId]: localSwords,
    };

    const sharedCloudDeck: CloudDeckRecord = {
      id: 'shared-99',
      ownerUid: 'uid-friend',
      ownerHandle: 'friend_brew',
      name: 'Friend Atraxa',
      description: 'Infect + Planeswalkers',
      commanderOracleIds: ['oracle-atraxa'],
      colorIdentity: ['W', 'U', 'B', 'G'],
      mainboard: { 'oracle-sol-ring': 1 },
      sideboard: { 'oracle-swords': 1 },
      cardCount: 2,
      lockSearchToCommanderIdentity: true,
      visibility: 'link',
      sharedWithUids: [],
      synergyThemes: ['counters'],
      revision: 4,
      deletedAt: null,
      createdAt: '2026-11-10T00:00:00.000Z',
      updatedAt: '2026-11-14T12:00:00.000Z',
    };

    const cloned = await hydrateCloudDeckToClonedDraft(sharedCloudDeck, async ({ ids }) => {
      const byId: Record<string, CompactCard> = {};
      for (const id of ids ?? []) {
        if (oracleCatalog[id]) byId[id] = oracleCatalog[id]!;
      }
      return { byId };
    });

    expect(cloned.id).not.toBe(sharedCloudDeck.id);
    expect(cloned.name).toBe('Friend Atraxa');
    expect(cloned.description).toBe('Infect + Planeswalkers');
    expect(cloned.revision).toBe(0);
    expect(cloned.syncStatus).toBe('local');
    expect(cloned.visibility).toBe('private');
    expect(cloned.ownerUid).toBeUndefined();
    expect(cloned.commanders.map((c) => c.id)).toEqual(['print-2xm-atraxa']);
    expect(cloned.mainboard['print-c21-solring']?.quantity).toBe(1);
    expect(cloned.sideboard['print-mh2-swords']?.quantity).toBe(1);
    expect(cloned.synergyThemes).toEqual(['counters']);

    // When cloud synergyThemes is empty, Method A themes are computed from commanders + cards
    const clonedNoThemes = await hydrateCloudDeckToClonedDraft(
      { ...sharedCloudDeck, synergyThemes: [] },
      async ({ ids }) => {
        const byId: Record<string, CompactCard> = {};
        for (const id of ids ?? []) {
          if (oracleCatalog[id]) byId[id] = oracleCatalog[id]!;
        }
        return { byId };
      },
    );
    expect(clonedNoThemes.synergyThemes).toEqual(['counters', 'proliferate', 'ramp']);

    expect(
      computeDeckSynergyThemes([localAtraxa], [{ card: localSolRing, quantity: 1 }], 6),
    ).toEqual(['counters', 'proliferate', 'ramp']);
  });

  it('wipes cloud decks on shared-device sign-out while keeping local-only decks and supports JSON export', async () => {
    const db = createTestDb('signout-cleanup');
    const provider = new InMemoryCloudProvider();
    let signOutHookCalled = 0;
    const externalUpdates: ExternalDecksUpdatedMeta[] = [];

    const aliceCloudDeck: SavedDeckRecord = {
      id: 'alice-cloud-deck',
      ownerUid: VERIFIED_USER.uid,
      ownerHandle: ALICE_PROFILE.handle,
      name: 'Alice Synced Deck',
      commanderIds: [],
      mainboard: {},
      sideboard: {},
      lockSearchToCommanderIdentity: true,
      visibility: 'private',
      revision: 2,
      syncStatus: 'synced',
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-15T00:00:00.000Z',
    };
    const otherOwnerDeck: SavedDeckRecord = {
      id: 'bob-cached-deck',
      ownerUid: 'uid-bob',
      ownerHandle: 'bob_edh',
      name: 'Bob Cached Deck',
      commanderIds: [],
      mainboard: {},
      sideboard: {},
      lockSearchToCommanderIdentity: true,
      visibility: 'private',
      revision: 1,
      syncStatus: 'synced',
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-15T00:00:00.000Z',
    };
    const localOnlyDeck: SavedDeckRecord = {
      id: 'local-guest-deck',
      name: 'Guest Unsynced Brew',
      commanderIds: [],
      mainboard: {},
      sideboard: {},
      lockSearchToCommanderIdentity: true,
      revision: 0,
      syncStatus: 'local',
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-15T00:00:00.000Z',
    };

    await db.decks.put(aliceCloudDeck);
    await db.decks.put(otherOwnerDeck);

    const controller = new CloudSyncController({
      provider,
      db,
      resolveCardsByIds: async () => ({}),
      onSignOut: async () => {
        signOutHookCalled += 1;
      },
      onExternalDecksUpdated: (meta) => {
        externalUpdates.push(meta);
      },
      windowTarget: null,
      documentTarget: null,
    });
    controllers.push(controller);
    controller.setAuthContext(VERIFIED_USER, ALICE_PROFILE);
    await controller.syncNow();

    // Add an unsynced local-only deck before sign-out
    await db.decks.put(localOnlyDeck);

    const bundle = await controller.exportAllData();
    expect(bundle.decks.map((d) => d.id).sort()).toEqual([
      'alice-cloud-deck',
      'bob-cached-deck',
      'local-guest-deck',
    ]);

    await controller.signOutWithCleanup(true);
    expect(signOutHookCalled).toBe(1);
    expect(externalUpdates.at(-1)).toEqual({
      reason: 'signout',
      clearedCloudCopies: true,
      signedOutUid: VERIFIED_USER.uid,
    });

    const remaining = await listSavedDeckRecords(db);
    expect(remaining.map((d) => d.id).sort()).toEqual(['bob-cached-deck', 'local-guest-deck']);
  });
});
