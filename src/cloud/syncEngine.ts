import { cardDb, type MtgCardDatabase, type SavedDeckRecord } from '../db/cardDb.js';
import {
  clearCloudCardListsForOwner,
  convertCardListEntriesToOracleIds,
  convertOracleEntriesToCardListIds,
  generateCardListId,
  listCardLists,
} from '../db/cardListDb.js';
import {
  clearCloudDecksForOwner,
  collectCardIdsFromRecords,
  convertCardIdMapToOracleIds,
  convertOracleMapToCardIds,
  generateDeckId,
  getSyncMeta,
  listSavedDeckRecords,
  resolveCardIdFromLookup,
  resolveOracleIdFromLookup,
  setSyncMeta,
} from '../db/deckDb.js';
import { getCombinedColorIdentity } from '../search/commanderRules.js';
import type { CompactCard } from '../types/card.js';
import type {
  AccountExportBundle,
  CardListRecord,
  CloudCardListRecord,
  CloudDeckRecord,
  CloudProvider,
  PushResult,
  SyncConflict,
  SyncStatus,
  UserProfile,
} from '../types/cloud.js';
import {
  HANDLE_MAX_LEN,
  MAX_DECK_CARD_COUNT,
  MAX_DECK_NAME_LEN,
  MAX_SHARED_WITH_UIDS,
  MAX_SYNERGY_THEMES,
  humanizeCloudError,
  normalizeHandle,
  sanitizeCardListPayloadForCloud,
  sanitizeDeckPayloadForCloud,
  type HumanizedCloudError,
} from './validation.js';

const UNTOUCHED_STARTER_NAME = 'Untitled Commander Deck';

export type ConflictResolution = 'keep-cloud' | 'keep-local' | 'keep-both';

export interface SyncCardLookupCallbacks {
  resolveCardsByIds: (ids: string[]) => Promise<Record<string, CompactCard>>;
  getSynergyThemes?: (
    record: SavedDeckRecord,
    cardMap: Record<string, CompactCard>,
  ) => string[];
}

export interface CloudSyncEngineOptions extends SyncCardLookupCallbacks {
  provider: CloudProvider;
  db?: MtgCardDatabase;
}

export interface SyncErrorRecord {
  kind: 'deck' | 'cardlist' | 'pull-decks' | 'pull-cardlists';
  id?: string;
  code: string;
  message: string;
  isOffline: boolean;
  isQuotaOrRateLimit: boolean;
}

export interface SyncRunResult {
  pushedCount: number;
  pulledCount: number;
  conflicts: SyncConflict[];
  errors: SyncErrorRecord[];
}

export interface MergeGuestRecordsResult {
  mergedDeckCount: number;
  mergedCardListCount: number;
}

interface SyncEntityAdapter<
  TLocal extends {
    id: string;
    name: string;
    ownerUid?: string | null;
    ownerHandle?: string;
    revision?: number;
    syncStatus?: SyncStatus;
    cloudUpdatedAt?: string;
    updatedAt: string;
    deletedAt?: string | null;
  },
  TCloud extends {
    id: string;
    ownerUid: string;
    ownerHandle: string;
    revision: number;
    updatedAt: string;
    deletedAt: string | null;
  },
> {
  kind: 'deck' | 'cardlist';
  pullErrorKind: 'pull-decks' | 'pull-cardlists';
  getMetaKey: (uid: string) => string;
  getAllLocal: () => Promise<TLocal[]>;
  getLocalById: (id: string) => Promise<TLocal | undefined>;
  putLocal: (record: TLocal) => Promise<unknown>;
  isEligibleToPush: (record: TLocal, uid: string) => boolean;
  pullSince: (uid: string, sinceIso: string | null) => Promise<TCloud[]>;
  pushCloud: (record: TCloud, expectedRevision: number) => Promise<PushResult<TCloud>>;
  toCloud: (
    local: TLocal,
    uid: string,
    normalizedHandle: string,
    cardMap: Record<string, CompactCard>,
  ) => TCloud;
  fromCloud: (cloud: TCloud, cardMap: Record<string, CompactCard>) => TLocal;
  makeCopyForKeepBoth: (local: TLocal, uid: string, normalizedHandle: string) => TLocal;
}

/** Returns the per-user sync metadata key for delta deck pulls. */
export function getDeckSyncMetaKey(uid: string): string {
  return `lastDeckSyncAt:${uid}`;
}

/** Returns the per-user sync metadata key for delta cardlist pulls. */
export function getCardListSyncMetaKey(uid: string): string {
  return `lastCardListSyncAt:${uid}`;
}

/**
 * Returns true if `record` is an untouched empty starter deck draft created automatically
 * when opening the app, which should not be claimed or uploaded when signing into an account.
 */
export function isUntouchedStarterDeck(record: SavedDeckRecord): boolean {
  return (
    !record.deletedAt &&
    record.name === UNTOUCHED_STARTER_NAME &&
    record.commanderIds.length === 0 &&
    Object.keys(record.mainboard).length === 0 &&
    Object.keys(record.sideboard).length === 0 &&
    !record.description
  );
}

function createEmptySyncResult(): SyncRunResult {
  return {
    pushedCount: 0,
    pulledCount: 0,
    conflicts: [],
    errors: [],
  };
}

function sanitizeOwnerHandle(handle: string, fallbackHandle?: string): string {
  const normalized = normalizeHandle(handle || fallbackHandle || '');
  return normalized.slice(0, HANDLE_MAX_LEN);
}

function buildCardIdLookup(cardMap: Record<string, CompactCard>): Record<string, CompactCard> {
  const byId: Record<string, CompactCard> = { ...cardMap };
  for (const card of Object.values(cardMap)) {
    if (card?.id && !byId[card.id]) {
      byId[card.id] = card;
    }
  }
  return byId;
}

function buildOracleLookup(cardMap: Record<string, CompactCard>): Record<string, CompactCard> {
  const byOracle: Record<string, CompactCard> = {};
  for (const [key, card] of Object.entries(cardMap)) {
    if (!card) continue;
    if (card.oracleId && !byOracle[card.oracleId]) {
      byOracle[card.oracleId] = card;
    }
    if (!byOracle[key]) {
      byOracle[key] = card;
    }
  }
  return byOracle;
}

function deriveDefaultSynergyThemes(
  record: SavedDeckRecord,
  cardLookup: Record<string, CompactCard>,
): string[] {
  const themes: string[] = [];
  const seen = new Set<string>();
  for (const cmdId of record.commanderIds) {
    const card = cardLookup[cmdId];
    if (!card) continue;
    for (const theme of card.themes) {
      if (!seen.has(theme)) {
        seen.add(theme);
        themes.push(theme);
        if (themes.length >= 6) return themes;
      }
    }
  }
  return themes;
}

function hasUnsyncedLocalChanges(syncStatus: SyncStatus | undefined): boolean {
  const status = syncStatus ?? 'local';
  return status === 'pending' || status === 'local' || status === 'error';
}

function hasSyncConflict(
  local: { syncStatus?: SyncStatus; revision?: number; cloudUpdatedAt?: string },
  cloud: { revision: number; updatedAt: string },
): boolean {
  if (local.syncStatus === 'conflict') {
    return true;
  }
  if (!hasUnsyncedLocalChanges(local.syncStatus)) {
    return false;
  }
  const localRevision = local.revision ?? 0;
  if (localRevision !== cloud.revision) {
    return true;
  }
  return local.cloudUpdatedAt !== cloud.updatedAt;
}

function classifySyncError(err: unknown): HumanizedCloudError {
  const humanized = humanizeCloudError(err);
  if (!humanized.isOffline) {
    const browserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const msgLower = humanized.message.toLowerCase();
    if (
      browserOffline ||
      msgLower.includes('network') ||
      msgLower.includes('offline') ||
      msgLower.includes('failed to fetch')
    ) {
      return { ...humanized, isOffline: true };
    }
  }
  return humanized;
}

function makeLocalCopyName(name: string): string {
  const suffix = ' (Local Copy)';
  const trimmed = name.trim() || 'Untitled';
  const maxBaseLen = MAX_DECK_NAME_LEN - suffix.length;
  const base = trimmed.length > maxBaseLen ? trimmed.slice(0, maxBaseLen).trimEnd() : trimmed;
  return `${base}${suffix}`;
}

/**
 * Converts a local IndexedDB `SavedDeckRecord` into a canonical `CloudDeckRecord`
 * keyed by Scryfall `oracleId`, computing `colorIdentity` and `cardCount`,
 * normalizing `ownerHandle`, and sanitizing against Firestore limits.
 */
export function savedDeckToCloudDeck(
  record: SavedDeckRecord,
  uid: string,
  handle: string,
  cardMap: Record<string, CompactCard>,
  getSynergyThemes?: (record: SavedDeckRecord, cardMap: Record<string, CompactCard>) => string[],
): CloudDeckRecord {
  const cardLookup = buildCardIdLookup(cardMap);
  const commanderOracleIds: string[] = [];
  const commanderCards: CompactCard[] = [];
  const seenCommanderOracleIds = new Set<string>();

  for (const cmdId of record.commanderIds) {
    const oracleId = resolveOracleIdFromLookup(cmdId, cardLookup);
    if (!seenCommanderOracleIds.has(oracleId)) {
      seenCommanderOracleIds.add(oracleId);
      commanderOracleIds.push(oracleId);
    }
    const card = cardLookup[cmdId];
    if (card && !commanderCards.some((c) => c.id === card.id)) {
      commanderCards.push(card);
    }
  }

  const mainboardOracle = convertCardIdMapToOracleIds(record.mainboard, cardLookup);
  const sideboardOracle = convertCardIdMapToOracleIds(record.sideboard, cardLookup);

  const rawThemes = getSynergyThemes
    ? getSynergyThemes(record, cardLookup)
    : record.synergyThemes !== undefined
      ? [...record.synergyThemes]
      : deriveDefaultSynergyThemes(record, cardLookup);

  const now = new Date().toISOString();
  const createdAt = record.createdAt || record.updatedAt || now;
  const updatedAt = record.updatedAt || record.createdAt || now;
  const trimmedDescription = record.description?.trim();

  const payload: CloudDeckRecord = {
    id: record.id,
    ownerUid: uid,
    ownerHandle: sanitizeOwnerHandle(handle, record.ownerHandle),
    name: record.name,
    ...(trimmedDescription ? { description: trimmedDescription } : {}),
    commanderOracleIds,
    colorIdentity: getCombinedColorIdentity(commanderCards),
    mainboard: mainboardOracle,
    sideboard: sideboardOracle,
    synergyThemes: rawThemes.slice(0, MAX_SYNERGY_THEMES),
    cardCount: 0,
    lockSearchToCommanderIdentity: record.lockSearchToCommanderIdentity ?? true,
    visibility: record.visibility ?? 'private',
    sharedWithUids: (record.sharedWithUids ?? []).slice(0, MAX_SHARED_WITH_UIDS),
    revision: record.revision ?? 0,
    createdAt,
    updatedAt,
    deletedAt: record.deletedAt ?? null,
  };

  const sanitized = sanitizeDeckPayloadForCloud(payload);
  const sanitizedMainboardCount = Object.values(sanitized.mainboard).reduce(
    (sum, qty) => sum + qty,
    0,
  );
  sanitized.cardCount = Math.min(
    MAX_DECK_CARD_COUNT,
    (sanitized.commanderOracleIds?.length ?? 0) + sanitizedMainboardCount,
  );
  return sanitized;
}

/**
 * Converts a pulled `CloudDeckRecord` back into a local IndexedDB `SavedDeckRecord`,
 * resolving canonical `oracleId` references to active local catalog printing `card.id`s.
 */
export function cloudDeckToSavedDeck(
  cloud: CloudDeckRecord,
  cardMap: Record<string, CompactCard>,
): SavedDeckRecord {
  const oracleLookup = buildOracleLookup(cardMap);
  const commanderIds: string[] = [];
  for (const oracleId of cloud.commanderOracleIds) {
    const localId = resolveCardIdFromLookup(oracleId, oracleLookup);
    if (!commanderIds.includes(localId)) {
      commanderIds.push(localId);
    }
  }

  return {
    id: cloud.id,
    name: cloud.name,
    ...(cloud.description !== undefined ? { description: cloud.description } : {}),
    commanderIds,
    mainboard: convertOracleMapToCardIds(cloud.mainboard, oracleLookup),
    sideboard: convertOracleMapToCardIds(cloud.sideboard, oracleLookup),
    lockSearchToCommanderIdentity: cloud.lockSearchToCommanderIdentity ?? true,
    visibility: cloud.visibility ?? 'private',
    sharedWithUids: [...(cloud.sharedWithUids ?? [])],
    synergyThemes: [...(cloud.synergyThemes ?? [])],
    ownerUid: cloud.ownerUid,
    ownerHandle: cloud.ownerHandle,
    revision: cloud.revision,
    syncStatus: 'synced',
    cloudUpdatedAt: cloud.updatedAt,
    createdAt: cloud.createdAt,
    updatedAt: cloud.updatedAt,
    deletedAt: cloud.deletedAt ?? null,
  };
}

/**
 * Converts a local `CardListRecord` into a canonical `CloudCardListRecord`
 * keyed by Scryfall `oracleId` and sanitized against Firestore limits.
 */
export function cardListToCloudCardList(
  record: CardListRecord,
  uid: string,
  handle: string,
  cardMap: Record<string, CompactCard>,
): CloudCardListRecord {
  const cardLookup = buildCardIdLookup(cardMap);
  const oracleEntries = convertCardListEntriesToOracleIds(record.entries, cardLookup);
  const now = new Date().toISOString();
  const createdAt = record.createdAt || record.updatedAt || now;
  const updatedAt = record.updatedAt || record.createdAt || now;
  const trimmedDescription = record.description?.trim();

  const payload: CloudCardListRecord = {
    id: record.id,
    ownerUid: uid,
    ownerHandle: sanitizeOwnerHandle(handle, record.ownerHandle),
    name: record.name,
    ...(trimmedDescription ? { description: trimmedDescription } : {}),
    listType: record.listType,
    entries: oracleEntries,
    visibility: record.visibility ?? 'private',
    sharedWithUids: (record.sharedWithUids ?? []).slice(0, MAX_SHARED_WITH_UIDS),
    revision: record.revision ?? 0,
    createdAt,
    updatedAt,
    deletedAt: record.deletedAt ?? null,
  };

  return sanitizeCardListPayloadForCloud(payload);
}

/**
 * Converts a pulled `CloudCardListRecord` back into a local `CardListRecord`,
 * resolving canonical `oracleId` keys to active local catalog `card.id`s.
 */
export function cloudCardListToLocalCardList(
  cloud: CloudCardListRecord,
  cardMap: Record<string, CompactCard>,
): CardListRecord {
  const oracleLookup = buildOracleLookup(cardMap);
  return {
    id: cloud.id,
    name: cloud.name,
    ...(cloud.description !== undefined ? { description: cloud.description } : {}),
    listType: cloud.listType,
    entries: convertOracleEntriesToCardListIds(cloud.entries, oracleLookup),
    visibility: cloud.visibility ?? 'private',
    sharedWithUids: [...(cloud.sharedWithUids ?? [])],
    ownerUid: cloud.ownerUid,
    ownerHandle: cloud.ownerHandle,
    revision: cloud.revision,
    syncStatus: 'synced',
    cloudUpdatedAt: cloud.updatedAt,
    createdAt: cloud.createdAt,
    updatedAt: cloud.updatedAt,
    deletedAt: cloud.deletedAt ?? null,
  };
}

/**
 * Claims meaningful unowned guest decks and cardlists for a newly signed-in user,
 * skipping empty untouched starter deck drafts while preserving all local edits.
 */
export async function mergeGuestRecordsForUser(
  uid: string,
  handle: string,
  db: MtgCardDatabase = cardDb,
): Promise<MergeGuestRecordsResult> {
  if (!uid) {
    return { mergedDeckCount: 0, mergedCardListCount: 0 };
  }

  const normalizedHandle = sanitizeOwnerHandle(handle);
  let mergedDeckCount = 0;
  let mergedCardListCount = 0;

  await db.transaction('rw', db.decks, db.cardlists, async () => {
    const allDecks = await db.decks.toArray();
    const decksToUpdate: SavedDeckRecord[] = [];
    for (const deck of allDecks) {
      if (deck.ownerUid || isUntouchedStarterDeck(deck)) continue;
      decksToUpdate.push({
        ...deck,
        ownerUid: uid,
        ownerHandle: normalizedHandle,
        syncStatus: 'pending',
        revision: deck.revision ?? 0,
      });
    }
    if (decksToUpdate.length > 0) {
      await db.decks.bulkPut(decksToUpdate);
      mergedDeckCount = decksToUpdate.length;
    }

    const allLists = await db.cardlists.toArray();
    const listsToUpdate: CardListRecord[] = [];
    for (const list of allLists) {
      if (list.ownerUid) continue;
      listsToUpdate.push({
        ...list,
        ownerUid: uid,
        ownerHandle: normalizedHandle,
        syncStatus: 'pending',
        revision: list.revision ?? 0,
      });
    }
    if (listsToUpdate.length > 0) {
      await db.cardlists.bulkPut(listsToUpdate);
      mergedCardListCount = listsToUpdate.length;
    }
  });

  return { mergedDeckCount, mergedCardListCount };
}

/**
 * Builds a portable JSON backup bundle containing all non-deleted decks and cardlists.
 */
export async function buildAccountExportBundle(
  profile: UserProfile | null,
  db: MtgCardDatabase = cardDb,
): Promise<AccountExportBundle> {
  const [decks, cardlists] = await Promise.all([
    listSavedDeckRecords(db, { includeDeleted: false }),
    listCardLists(db, { includeDeleted: false }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    profile,
    decks,
    cardlists,
  };
}

/**
 * Clears per-user sync watermarks on sign-out and optionally removes cached cloud
 * decks and cardlists on shared computers while leaving guest/local records intact.
 */
export async function cleanupOnSignOut(
  uid: string,
  removeCachedCloudCopies: boolean,
  db: MtgCardDatabase = cardDb,
): Promise<void> {
  if (!uid) return;
  await setSyncMeta(getDeckSyncMetaKey(uid), null, db);
  await setSyncMeta(getCardListSyncMetaKey(uid), null, db);
  if (removeCachedCloudCopies) {
    await clearCloudDecksForOwner(uid, db);
    await clearCloudCardListsForOwner(uid, db);
  }
}

/**
 * Offline-first, delta-based cross-device sync coordinator bridging local Dexie IndexedDB
 * (`MtgCardDatabase`) with a `CloudProvider` for both decks and cardlists.
 */
export class CloudSyncEngine {
  private readonly provider: CloudProvider;
  private readonly db: MtgCardDatabase;
  private readonly resolveCardsByIds: SyncCardLookupCallbacks['resolveCardsByIds'];
  private readonly getSynergyThemes?: SyncCardLookupCallbacks['getSynergyThemes'];
  private readonly deckAdapter: SyncEntityAdapter<SavedDeckRecord, CloudDeckRecord>;
  private readonly cardListAdapter: SyncEntityAdapter<CardListRecord, CloudCardListRecord>;
  private syncQueueTail: Promise<void> = Promise.resolve();

  constructor(options: CloudSyncEngineOptions) {
    this.provider = options.provider;
    this.db = options.db ?? cardDb;
    this.resolveCardsByIds = options.resolveCardsByIds;
    this.getSynergyThemes = options.getSynergyThemes;

    this.deckAdapter = {
      kind: 'deck',
      pullErrorKind: 'pull-decks',
      getMetaKey: getDeckSyncMetaKey,
      getAllLocal: () => this.db.decks.toArray(),
      getLocalById: (id) => this.db.decks.get(id),
      putLocal: (record) => this.db.decks.put(record),
      isEligibleToPush: (record, uid) => {
        if (record.ownerUid && record.ownerUid !== uid) return false;
        if (!record.ownerUid && isUntouchedStarterDeck(record)) return false;
        return hasUnsyncedLocalChanges(record.syncStatus);
      },
      pullSince: (uid, sinceIso) => this.provider.pullDecksSince(uid, sinceIso),
      pushCloud: (record, expectedRevision) => this.provider.pushDeck(record, expectedRevision),
      toCloud: (local, uid, handle, cardMap) =>
        savedDeckToCloudDeck(local, uid, handle, cardMap, this.getSynergyThemes),
      fromCloud: (cloud, cardMap) => cloudDeckToSavedDeck(cloud, cardMap),
      makeCopyForKeepBoth: (local, uid, handle) => {
        const now = new Date().toISOString();
        const copy: SavedDeckRecord = {
          ...local,
          id: generateDeckId(),
          name: makeLocalCopyName(local.name),
          commanderIds: [...local.commanderIds],
          mainboard: { ...local.mainboard },
          sideboard: { ...local.sideboard },
          ...(local.sharedWithUids ? { sharedWithUids: [...local.sharedWithUids] } : {}),
          ...(local.synergyThemes ? { synergyThemes: [...local.synergyThemes] } : {}),
          ownerUid: uid,
          ownerHandle: handle,
          revision: 0,
          syncStatus: 'pending',
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        delete copy.cloudUpdatedAt;
        return copy;
      },
    };

    this.cardListAdapter = {
      kind: 'cardlist',
      pullErrorKind: 'pull-cardlists',
      getMetaKey: getCardListSyncMetaKey,
      getAllLocal: () => this.db.cardlists.toArray(),
      getLocalById: (id) => this.db.cardlists.get(id),
      putLocal: (record) => this.db.cardlists.put(record),
      isEligibleToPush: (record, uid) => {
        if (record.ownerUid && record.ownerUid !== uid) return false;
        return hasUnsyncedLocalChanges(record.syncStatus);
      },
      pullSince: (uid, sinceIso) => this.provider.pullCardListsSince(uid, sinceIso),
      pushCloud: (record, expectedRevision) => this.provider.pushCardList(record, expectedRevision),
      toCloud: (local, uid, handle, cardMap) =>
        cardListToCloudCardList(local, uid, handle, cardMap),
      fromCloud: (cloud, cardMap) => cloudCardListToLocalCardList(cloud, cardMap),
      makeCopyForKeepBoth: (local, uid, handle) => {
        const now = new Date().toISOString();
        const clonedEntries = Object.fromEntries(
          Object.entries(local.entries).map(([cardId, entry]) => [cardId, { ...entry }]),
        );
        const copy: CardListRecord = {
          ...local,
          id: generateCardListId(),
          name: makeLocalCopyName(local.name),
          entries: clonedEntries,
          ...(local.sharedWithUids ? { sharedWithUids: [...local.sharedWithUids] } : {}),
          ownerUid: uid,
          ownerHandle: handle,
          revision: 0,
          syncStatus: 'pending',
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        delete copy.cloudUpdatedAt;
        return copy;
      },
    };
  }

  private async resolveCardsForRecords(records: readonly unknown[]): Promise<Record<string, CompactCard>> {
    const ids = collectCardIdsFromRecords(
      records as Parameters<typeof collectCardIdsFromRecords>[0],
    );
    if (ids.length === 0) return {};
    return this.resolveCardsByIds(ids);
  }

  private async pullEntityUpdates<
    TLocal extends {
      id: string;
      name: string;
      ownerUid?: string | null;
      ownerHandle?: string;
      revision?: number;
      syncStatus?: SyncStatus;
      cloudUpdatedAt?: string;
      updatedAt: string;
      deletedAt?: string | null;
    },
    TCloud extends {
      id: string;
      ownerUid: string;
      ownerHandle: string;
      revision: number;
      updatedAt: string;
      deletedAt: string | null;
    },
  >(
    adapter: SyncEntityAdapter<TLocal, TCloud>,
    uid: string,
    handle: string,
  ): Promise<SyncRunResult> {
    const result = createEmptySyncResult();
    const metaKey = adapter.getMetaKey(uid);
    const since = await getSyncMeta(metaKey, this.db);

    let pulledRecords: TCloud[];
    try {
      pulledRecords = await adapter.pullSince(uid, since);
    } catch (err) {
      const classified = classifySyncError(err);
      result.errors.push({
        kind: adapter.pullErrorKind,
        code: classified.code,
        message: classified.message,
        isOffline: classified.isOffline,
        isQuotaOrRateLimit: classified.isQuotaOrRateLimit,
      });
      return result;
    }

    if (pulledRecords.length === 0) {
      return result;
    }

    const sortedPulled = [...pulledRecords].sort((a, b) =>
      a.updatedAt.localeCompare(b.updatedAt),
    );
    const activePulled = sortedPulled.filter((r) => r.deletedAt === null);

    let cardMap: Record<string, CompactCard> = {};
    try {
      if (activePulled.length > 0) {
        cardMap = await this.resolveCardsForRecords(activePulled);
      }
    } catch (err) {
      const classified = classifySyncError(err);
      result.errors.push({
        kind: adapter.pullErrorKind,
        code: classified.code,
        message: classified.message,
        isOffline: classified.isOffline,
        isQuotaOrRateLimit: classified.isQuotaOrRateLimit,
      });
      return result;
    }

    const fallbackHandle = sanitizeOwnerHandle(handle);
    let cleanWatermark: string | null = since;
    let encounteredConflict = false;

    for (const cloud of sortedPulled) {
      const local = await adapter.getLocalById(cloud.id);

      if (local && hasSyncConflict(local, cloud)) {
        const conflictedLocal: TLocal =
          local.syncStatus === 'conflict' ? local : { ...local, syncStatus: 'conflict' };
        if (local.syncStatus !== 'conflict') {
          await adapter.putLocal(conflictedLocal);
        }
        result.conflicts.push({
          kind: adapter.kind,
          id: cloud.id,
          localRecord: conflictedLocal as unknown as SavedDeckRecord | CardListRecord,
          cloudRecord: cloud as unknown as CloudDeckRecord | CloudCardListRecord,
          detectedAt: new Date().toISOString(),
        });
        encounteredConflict = true;
        continue;
      }

      // Local has pending edits based on this exact already-seen cloud revision; keep pending
      // rather than overwriting local changes before they can be pushed.
      if (local && hasUnsyncedLocalChanges(local.syncStatus)) {
        continue;
      }

      if (cloud.deletedAt !== null) {
        const tombstoned: TLocal = local
          ? {
              ...local,
              ownerUid: cloud.ownerUid || local.ownerUid || uid,
              ownerHandle: cloud.ownerHandle || local.ownerHandle || fallbackHandle,
              deletedAt: cloud.deletedAt,
              syncStatus: 'synced',
              revision: cloud.revision,
              cloudUpdatedAt: cloud.updatedAt,
              updatedAt: cloud.updatedAt,
            }
          : adapter.fromCloud(cloud, cardMap);
        await adapter.putLocal(tombstoned);
      } else {
        const upserted = adapter.fromCloud(cloud, cardMap);
        await adapter.putLocal(upserted);
      }

      result.pulledCount += 1;
      if (!encounteredConflict && (!cleanWatermark || cloud.updatedAt > cleanWatermark)) {
        cleanWatermark = cloud.updatedAt;
      }
    }

    if (cleanWatermark && cleanWatermark !== since) {
      await setSyncMeta(metaKey, cleanWatermark, this.db);
    }

    return result;
  }

  private async pushSingleEntity<
    TLocal extends {
      id: string;
      name: string;
      ownerUid?: string | null;
      ownerHandle?: string;
      revision?: number;
      syncStatus?: SyncStatus;
      cloudUpdatedAt?: string;
      updatedAt: string;
      deletedAt?: string | null;
    },
    TCloud extends {
      id: string;
      ownerUid: string;
      ownerHandle: string;
      revision: number;
      updatedAt: string;
      deletedAt: string | null;
    },
  >(
    adapter: SyncEntityAdapter<TLocal, TCloud>,
    local: TLocal,
    uid: string,
    normalizedHandle: string,
  ): Promise<SyncRunResult> {
    const result = createEmptySyncResult();

    try {
      const cardMap = await this.resolveCardsForRecords([local]);
      const cloudPayload = adapter.toCloud(local, uid, normalizedHandle, cardMap);
      const expectedRevision = local.revision ?? 0;
      const pushRes = await adapter.pushCloud(cloudPayload, expectedRevision);

      if (pushRes.status === 'synced') {
        const syncedLocal: TLocal = {
          ...local,
          ownerUid: uid,
          ownerHandle: normalizedHandle || pushRes.record.ownerHandle,
          revision: pushRes.record.revision,
          syncStatus: 'synced',
          cloudUpdatedAt: pushRes.record.updatedAt,
        };
        await adapter.putLocal(syncedLocal);
        result.pushedCount += 1;
      } else {
        const conflictedLocal: TLocal = {
          ...local,
          ownerUid: local.ownerUid ?? uid,
          ownerHandle: local.ownerHandle ?? normalizedHandle,
          syncStatus: 'conflict',
        };
        await adapter.putLocal(conflictedLocal);
        result.conflicts.push({
          kind: adapter.kind,
          id: local.id,
          localRecord: conflictedLocal as unknown as SavedDeckRecord | CardListRecord,
          cloudRecord: pushRes.serverRecord as unknown as CloudDeckRecord | CloudCardListRecord,
          detectedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      const classified = classifySyncError(err);
      const nextStatus: SyncStatus = classified.isOffline ? 'pending' : 'error';
      const erroredLocal: TLocal = {
        ...local,
        ownerUid: local.ownerUid ?? uid,
        ownerHandle: local.ownerHandle ?? normalizedHandle,
        syncStatus: nextStatus,
      };
      await adapter.putLocal(erroredLocal);
      result.errors.push({
        kind: adapter.kind,
        id: local.id,
        code: classified.code,
        message: classified.message,
        isOffline: classified.isOffline,
        isQuotaOrRateLimit: classified.isQuotaOrRateLimit,
      });
    }

    return result;
  }

  private async pushEntityQueue<
    TLocal extends {
      id: string;
      name: string;
      ownerUid?: string | null;
      ownerHandle?: string;
      revision?: number;
      syncStatus?: SyncStatus;
      cloudUpdatedAt?: string;
      updatedAt: string;
      deletedAt?: string | null;
    },
    TCloud extends {
      id: string;
      ownerUid: string;
      ownerHandle: string;
      revision: number;
      updatedAt: string;
      deletedAt: string | null;
    },
  >(
    adapter: SyncEntityAdapter<TLocal, TCloud>,
    uid: string,
    handle: string,
  ): Promise<SyncRunResult> {
    const result = createEmptySyncResult();
    const normalizedHandle = sanitizeOwnerHandle(handle);
    const allLocal = await adapter.getAllLocal();
    const pendingItems = allLocal.filter((record) => adapter.isEligibleToPush(record, uid));

    for (const item of pendingItems) {
      const single = await this.pushSingleEntity(adapter, item, uid, normalizedHandle);
      result.pushedCount += single.pushedCount;
      result.conflicts.push(...single.conflicts);
      result.errors.push(...single.errors);
    }

    return result;
  }

  private async resolveEntityConflict<
    TLocal extends {
      id: string;
      name: string;
      ownerUid?: string | null;
      ownerHandle?: string;
      revision?: number;
      syncStatus?: SyncStatus;
      cloudUpdatedAt?: string;
      updatedAt: string;
      deletedAt?: string | null;
    },
    TCloud extends {
      id: string;
      ownerUid: string;
      ownerHandle: string;
      revision: number;
      updatedAt: string;
      deletedAt: string | null;
    },
  >(
    adapter: SyncEntityAdapter<TLocal, TCloud>,
    conflict: SyncConflict,
    resolution: ConflictResolution,
    uid: string,
    handle: string,
  ): Promise<SyncRunResult> {
    const normalizedHandle = sanitizeOwnerHandle(handle);
    const cloud = conflict.cloudRecord as unknown as TCloud;
    const currentLocal =
      (await adapter.getLocalById(conflict.id)) ?? (conflict.localRecord as unknown as TLocal);

    if (resolution === 'keep-cloud') {
      const cardMap =
        cloud.deletedAt === null ? await this.resolveCardsForRecords([cloud]) : {};
      const synced = adapter.fromCloud(cloud, cardMap);
      await adapter.putLocal(synced);
      return {
        pushedCount: 0,
        pulledCount: 1,
        conflicts: [],
        errors: [],
      };
    }

    if (resolution === 'keep-local') {
      const preparedLocal: TLocal = {
        ...currentLocal,
        ownerUid: uid,
        ownerHandle: normalizedHandle || currentLocal.ownerHandle,
        revision: cloud.revision,
        syncStatus: 'pending',
        cloudUpdatedAt: cloud.updatedAt,
      };
      await adapter.putLocal(preparedLocal);
      if (!this.provider.isConfigured()) {
        return createEmptySyncResult();
      }
      return this.pushSingleEntity(adapter, preparedLocal, uid, normalizedHandle);
    }

    // 'keep-both': apply cloud to original ID and create + push a brand-new local copy
    const localCopy = adapter.makeCopyForKeepBoth(currentLocal, uid, normalizedHandle);
    const cardMap = cloud.deletedAt === null ? await this.resolveCardsForRecords([cloud]) : {};
    const cloudAsLocal = adapter.fromCloud(cloud, cardMap);

    await this.db.transaction('rw', this.db.decks, this.db.cardlists, async () => {
      await adapter.putLocal(cloudAsLocal);
      await adapter.putLocal(localCopy);
    });

    if (!this.provider.isConfigured()) {
      return {
        pushedCount: 0,
        pulledCount: 1,
        conflicts: [],
        errors: [],
      };
    }

    const pushCopyResult = await this.pushSingleEntity(adapter, localCopy, uid, normalizedHandle);
    return {
      pushedCount: pushCopyResult.pushedCount,
      pulledCount: 1,
      conflicts: pushCopyResult.conflicts,
      errors: pushCopyResult.errors,
    };
  }

  /**
   * Serializes mutating sync lifecycle operations on a single FIFO promise queue so concurrent
   * `syncAll` / `pushPending` / `pullUpdates` / `resolveConflict` calls never race on Dexie revisions.
   */
  private runSerialized<T>(task: () => Promise<T>): Promise<T> {
    const run = this.syncQueueTail.then(task);
    this.syncQueueTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async runPullUpdates(uid: string, handle = ''): Promise<SyncRunResult> {
    if (!uid || !this.provider.isConfigured()) {
      return createEmptySyncResult();
    }

    const deckResult = await this.pullEntityUpdates(this.deckAdapter, uid, handle);
    const listResult = await this.pullEntityUpdates(this.cardListAdapter, uid, handle);

    return {
      pushedCount: 0,
      pulledCount: deckResult.pulledCount + listResult.pulledCount,
      conflicts: [...deckResult.conflicts, ...listResult.conflicts],
      errors: [...deckResult.errors, ...listResult.errors],
    };
  }

  private async runPushPending(uid: string, handle = ''): Promise<SyncRunResult> {
    if (!uid || !this.provider.isConfigured()) {
      return createEmptySyncResult();
    }

    const deckResult = await this.pushEntityQueue(this.deckAdapter, uid, handle);
    const listResult = await this.pushEntityQueue(this.cardListAdapter, uid, handle);

    return {
      pushedCount: deckResult.pushedCount + listResult.pushedCount,
      pulledCount: 0,
      conflicts: [...deckResult.conflicts, ...listResult.conflicts],
      errors: [...deckResult.errors, ...listResult.errors],
    };
  }

  private async runSyncAll(uid: string, handle: string): Promise<SyncRunResult> {
    if (!uid) {
      return createEmptySyncResult();
    }

    await mergeGuestRecordsForUser(uid, handle, this.db);
    if (!this.provider.isConfigured()) {
      return createEmptySyncResult();
    }

    const firstPush = await this.runPushPending(uid, handle);
    const pull = await this.runPullUpdates(uid, handle);

    const isOffline =
      firstPush.errors.some((e) => e.isOffline) || pull.errors.some((e) => e.isOffline);
    const secondPush = isOffline ? createEmptySyncResult() : await this.runPushPending(uid, handle);

    const conflictMap = new Map<string, SyncConflict>();
    for (const conflict of [...firstPush.conflicts, ...pull.conflicts, ...secondPush.conflicts]) {
      conflictMap.set(`${conflict.kind}:${conflict.id}`, conflict);
    }

    const errorMap = new Map<string, SyncErrorRecord>();
    for (const err of [...firstPush.errors, ...pull.errors, ...secondPush.errors]) {
      errorMap.set(`${err.kind}:${err.id ?? ''}`, err);
    }

    return {
      pushedCount: firstPush.pushedCount + secondPush.pushedCount,
      pulledCount: pull.pulledCount,
      conflicts: Array.from(conflictMap.values()),
      errors: Array.from(errorMap.values()),
    };
  }

  private async runResolveConflict(
    conflict: SyncConflict,
    resolution: ConflictResolution,
    uid: string,
    handle = '',
  ): Promise<SyncRunResult> {
    if (conflict.kind === 'deck') {
      return this.resolveEntityConflict(this.deckAdapter, conflict, resolution, uid, handle);
    }
    return this.resolveEntityConflict(this.cardListAdapter, conflict, resolution, uid, handle);
  }

  /** Tags meaningful guest decks and cardlists with the signed-in user's ownership. */
  async mergeGuestRecordsForUser(uid: string, handle: string): Promise<MergeGuestRecordsResult> {
    return this.runSerialized(() => mergeGuestRecordsForUser(uid, handle, this.db));
  }

  /**
   * Pulls delta updates for decks and cardlists since the last clean per-user watermark,
   * preserving tombstones and flagging divergent edits as `SyncConflict`s.
   */
  async pullUpdates(uid: string, handle = ''): Promise<SyncRunResult> {
    return this.runSerialized(() => this.runPullUpdates(uid, handle));
  }

  /**
   * Pushes all pending, local, and retryable-error decks and cardlists (never `'conflict'`).
   */
  async pushPending(uid: string, handle = ''): Promise<SyncRunResult> {
    return this.runSerialized(() => this.runPushPending(uid, handle));
  }

  /**
   * Runs a complete offline-first sync cycle:
   * `mergeGuestRecordsForUser` -> `pushPending` -> `pullUpdates` -> `pushPending`.
   */
  async syncAll(uid: string, handle: string): Promise<SyncRunResult> {
    return this.runSerialized(() => this.runSyncAll(uid, handle));
  }

  /**
   * Resolves a sync conflict using `'keep-cloud'`, `'keep-local'`, or `'keep-both'`.
   */
  async resolveConflict(
    conflict: SyncConflict,
    resolution: ConflictResolution,
    uid: string,
    handle = '',
  ): Promise<SyncRunResult> {
    return this.runSerialized(() => this.runResolveConflict(conflict, resolution, uid, handle));
  }

  /** Exports all non-deleted local decks and cardlists into a portable JSON backup bundle. */
  async buildAccountExportBundle(profile: UserProfile | null): Promise<AccountExportBundle> {
    return buildAccountExportBundle(profile, this.db);
  }

  /** Clears per-user sync metadata and optionally deletes cached cloud copies on sign-out. */
  async cleanupOnSignOut(uid: string, removeCachedCloudCopies: boolean): Promise<void> {
    return this.runSerialized(() => cleanupOnSignOut(uid, removeCachedCloudCopies, this.db));
  }
}
