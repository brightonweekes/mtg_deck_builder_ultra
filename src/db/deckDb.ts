import type { CompactCard } from '../types/card.js';
import type { DeckCardEntry, DeckDraft } from '../types/deck.js';
import { cardDb, type MtgCardDatabase, type SavedDeckRecord } from './cardDb.js';

export interface ListSavedDecksOptions {
  includeDeleted?: boolean;
  activeUid?: string | null;
}

export interface CardIdContainingRecord {
  commanderIds?: readonly string[];
  commanderOracleIds?: readonly string[];
  mainboard?: Record<string, number>;
  sideboard?: Record<string, number>;
  entries?: Record<string, unknown>;
}

export type CardLookup =
  | Record<string, CompactCard | string | undefined>
  | ReadonlyMap<string, CompactCard | string>
  | ((id: string) => CompactCard | string | undefined);

export function generateDeckId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `deck-${crypto.randomUUID()}`;
  }
  return `deck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getLookupEntry(id: string, lookup: CardLookup): CompactCard | string | undefined {
  if (typeof lookup === 'function') {
    return lookup(id);
  }
  if (lookup instanceof Map) {
    return lookup.get(id);
  }
  return (lookup as Record<string, CompactCard | string | undefined>)[id];
}

/**
 * Resolves a local card ID to its canonical Scryfall `oracleId` using a card map, string map, or lookup function.
 * Falls back to the original ID if unresolved so entries are never dropped.
 */
export function resolveOracleIdFromLookup(id: string, cardLookup: CardLookup): string {
  const entry = getLookupEntry(id, cardLookup);
  if (typeof entry === 'string') return entry || id;
  if (entry && typeof entry === 'object' && entry.oracleId) return entry.oracleId;
  return id;
}

/**
 * Resolves a canonical `oracleId` back to a catalog printing `card.id`.
 * Falls back to the original `oracleId` if unresolved.
 */
export function resolveCardIdFromLookup(oracleId: string, resolvedByOracleId: CardLookup): string {
  const entry = getLookupEntry(oracleId, resolvedByOracleId);
  if (typeof entry === 'string') return entry || oracleId;
  if (entry && typeof entry === 'object' && entry.id) return entry.id;
  return oracleId;
}

function convertDeckMap(
  map: Record<string, number>,
  lookup: CardLookup,
  resolver: (key: string, cardLookup: CardLookup) => string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, qty] of Object.entries(map)) {
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const mappedKey = resolver(key, lookup);
    out[mappedKey] = (out[mappedKey] ?? 0) + qty;
  }
  return out;
}

/**
 * Converts a local `{ [cardId]: qty }` deck map to canonical `{ [oracleId]: qty }` keys for cloud storage.
 */
export function convertCardIdMapToOracleIds(
  map: Record<string, number>,
  cardLookup: CardLookup,
): Record<string, number> {
  return convertDeckMap(map, cardLookup, resolveOracleIdFromLookup);
}

/**
 * Converts a cloud `{ [oracleId]: qty }` deck map back to local `{ [cardId]: qty }` keys.
 */
export function convertOracleMapToCardIds(
  map: Record<string, number>,
  resolvedByOracleId: CardLookup,
): Record<string, number> {
  return convertDeckMap(map, resolvedByOracleId, resolveCardIdFromLookup);
}

/**
 * Converts a hydrated in-memory DeckDraft to the compact IndexedDB SavedDeckRecord format,
 * preserving optional cloud/synergy metadata from the draft or an existing DB record.
 */
export function deckDraftToSavedRecord(
  deck: DeckDraft,
  existing?: Partial<SavedDeckRecord>,
): SavedDeckRecord {
  const mainboard: Record<string, number> = {};
  for (const [id, entry] of Object.entries(deck.mainboard)) {
    if (entry.quantity > 0) {
      mainboard[id] = entry.quantity;
    }
  }

  const sideboard: Record<string, number> = {};
  for (const [id, entry] of Object.entries(deck.sideboard)) {
    if (entry.quantity > 0) {
      sideboard[id] = entry.quantity;
    }
  }

  const description = deck.description !== undefined ? deck.description : existing?.description;
  const lockSearchToCommanderIdentity =
    deck.lockSearchToCommanderIdentity ?? existing?.lockSearchToCommanderIdentity ?? true;
  const visibility = deck.visibility ?? existing?.visibility;
  const sharedWithUids = deck.sharedWithUids ?? existing?.sharedWithUids;
  const synergyThemes = deck.synergyThemes ?? existing?.synergyThemes;
  const ownerUid = deck.ownerUid !== undefined ? deck.ownerUid : existing?.ownerUid;
  const ownerHandle = deck.ownerHandle !== undefined ? deck.ownerHandle : existing?.ownerHandle;
  const revision = deck.revision !== undefined ? deck.revision : existing?.revision;
  const syncStatus = deck.syncStatus ?? existing?.syncStatus;
  const cloudUpdatedAt =
    deck.cloudUpdatedAt !== undefined ? deck.cloudUpdatedAt : existing?.cloudUpdatedAt;
  const deletedAt = deck.deletedAt !== undefined ? deck.deletedAt : existing?.deletedAt;

  return {
    id: deck.id,
    name: deck.name.trim() || 'Untitled Commander Deck',
    ...(description !== undefined ? { description } : {}),
    commanderIds: deck.commanders.map((c) => c.id),
    mainboard,
    sideboard,
    lockSearchToCommanderIdentity,
    ...(visibility !== undefined ? { visibility } : {}),
    ...(sharedWithUids !== undefined ? { sharedWithUids: [...sharedWithUids] } : {}),
    ...(synergyThemes !== undefined ? { synergyThemes: [...synergyThemes] } : {}),
    ...(ownerUid !== undefined ? { ownerUid } : {}),
    ...(ownerHandle !== undefined ? { ownerHandle } : {}),
    ...(revision !== undefined ? { revision } : {}),
    ...(syncStatus !== undefined ? { syncStatus } : {}),
    ...(cloudUpdatedAt !== undefined ? { cloudUpdatedAt } : {}),
    createdAt: deck.createdAt || deck.updatedAt,
    updatedAt: deck.updatedAt || new Date().toISOString(),
    ...(deletedAt !== undefined ? { deletedAt } : {}),
  };
}

/**
 * Collects all unique card IDs referenced by a single SavedDeckRecord for fast catalog hydration.
 */
export function collectRecordCardIds(record: SavedDeckRecord): string[] {
  return collectCardIdsFromRecords([record]);
}

/**
 * Collects all unique card or oracle IDs across multiple deck or card-list records.
 */
export function collectCardIdsFromRecords(records: readonly CardIdContainingRecord[]): string[] {
  const ids = new Set<string>();
  for (const record of records) {
    if (record.commanderIds) {
      for (const id of record.commanderIds) ids.add(id);
    }
    if (record.commanderOracleIds) {
      for (const id of record.commanderOracleIds) ids.add(id);
    }
    if (record.mainboard) {
      for (const id of Object.keys(record.mainboard)) ids.add(id);
    }
    if (record.sideboard) {
      for (const id of Object.keys(record.sideboard)) ids.add(id);
    }
    if (record.entries) {
      for (const id of Object.keys(record.entries)) ids.add(id);
    }
  }
  return Array.from(ids);
}

/**
 * Hydrates a SavedDeckRecord from IndexedDB back into a full DeckDraft using resolved catalog cards.
 */
export function hydrateSavedRecordToDraft(
  record: SavedDeckRecord,
  cardMap: Record<string, CompactCard>,
  lockSearchToCommanderIdentity?: boolean,
): DeckDraft {
  const commanders: CompactCard[] = [];
  for (const cmdId of record.commanderIds) {
    const card = cardMap[cmdId];
    if (card && !commanders.some((c) => c.id === card.id)) {
      commanders.push(card);
    }
  }

  const mainboard: Record<string, DeckCardEntry> = {};
  for (const [id, qty] of Object.entries(record.mainboard)) {
    const card = cardMap[id];
    if (card && qty > 0) {
      const targetId = card.id || id;
      const prev = mainboard[targetId];
      mainboard[targetId] = { card, quantity: (prev?.quantity ?? 0) + qty };
    }
  }

  const sideboard: Record<string, DeckCardEntry> = {};
  for (const [id, qty] of Object.entries(record.sideboard)) {
    const card = cardMap[id];
    if (card && qty > 0) {
      const targetId = card.id || id;
      const prev = sideboard[targetId];
      sideboard[targetId] = { card, quantity: (prev?.quantity ?? 0) + qty };
    }
  }

  return {
    id: record.id,
    name: record.name,
    ...(record.description !== undefined ? { description: record.description } : {}),
    commanders,
    mainboard,
    sideboard,
    lockSearchToCommanderIdentity:
      lockSearchToCommanderIdentity ?? record.lockSearchToCommanderIdentity ?? true,
    ...(record.visibility !== undefined ? { visibility: record.visibility } : {}),
    ...(record.sharedWithUids !== undefined
      ? { sharedWithUids: [...record.sharedWithUids] }
      : {}),
    ...(record.synergyThemes !== undefined ? { synergyThemes: [...record.synergyThemes] } : {}),
    ...(record.ownerUid !== undefined ? { ownerUid: record.ownerUid } : {}),
    ...(record.ownerHandle !== undefined ? { ownerHandle: record.ownerHandle } : {}),
    ...(record.revision !== undefined ? { revision: record.revision } : {}),
    ...(record.syncStatus !== undefined ? { syncStatus: record.syncStatus } : {}),
    ...(record.cloudUpdatedAt !== undefined ? { cloudUpdatedAt: record.cloudUpdatedAt } : {}),
    ...(record.deletedAt !== undefined ? { deletedAt: record.deletedAt } : {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function saveDeckToDb(
  deck: DeckDraft,
  db: MtgCardDatabase = cardDb,
): Promise<SavedDeckRecord> {
  const existing = await db.decks.get(deck.id);
  const record = deckDraftToSavedRecord(deck, existing);
  await db.decks.put(record);
  return record;
}

function isMtgDatabase(value: unknown): value is MtgCardDatabase {
  return Boolean(value && typeof value === 'object' && 'decks' in value);
}

export async function listSavedDeckRecords(
  db?: MtgCardDatabase,
  options?: ListSavedDecksOptions,
): Promise<SavedDeckRecord[]>;
export async function listSavedDeckRecords(
  options?: ListSavedDecksOptions,
): Promise<SavedDeckRecord[]>;
export async function listSavedDeckRecords(
  dbOrOptions?: MtgCardDatabase | ListSavedDecksOptions,
  maybeOptions?: ListSavedDecksOptions,
): Promise<SavedDeckRecord[]> {
  const db = isMtgDatabase(dbOrOptions) ? dbOrOptions : cardDb;
  const options = isMtgDatabase(dbOrOptions) ? maybeOptions : dbOrOptions;
  const includeDeleted = options?.includeDeleted ?? false;
  const hasActiveUidFilter = options?.activeUid !== undefined;
  const activeUid = options?.activeUid ?? null;

  const all = await db.decks.toArray();
  const visible = all.filter((record) => {
    if (!includeDeleted && record.deletedAt) return false;
    if (hasActiveUidFilter && record.ownerUid && record.ownerUid !== activeUid) {
      return false;
    }
    return true;
  });
  return visible.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getSavedDeckRecord(
  id: string,
  db: MtgCardDatabase = cardDb,
): Promise<SavedDeckRecord | undefined> {
  return db.decks.get(id);
}

export async function deleteSavedDeckRecord(
  id: string,
  db: MtgCardDatabase = cardDb,
): Promise<void> {
  await db.decks.delete(id);
}

/**
 * Marks a saved deck as soft-deleted with a tombstone timestamp and `pending` sync status.
 */
export async function softDeleteSavedDeckRecord(
  id: string,
  db: MtgCardDatabase = cardDb,
): Promise<SavedDeckRecord | null> {
  const existing = await db.decks.get(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const tombstoned: SavedDeckRecord = {
    ...existing,
    deletedAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  };
  await db.decks.put(tombstoned);
  return tombstoned;
}

/**
 * Deletes all saved deck records belonging to a specific cloud owner UID, leaving local-only decks untouched.
 */
export async function clearCloudDecksForOwner(
  ownerUid: string,
  db: MtgCardDatabase = cardDb,
): Promise<number> {
  if (!ownerUid) return 0;
  return db.decks.where('ownerUid').equals(ownerUid).delete();
}

export async function duplicateSavedDeckRecord(
  sourceId: string,
  newName?: string,
  db: MtgCardDatabase = cardDb,
): Promise<SavedDeckRecord | null> {
  const source = await db.decks.get(sourceId);
  if (!source) return null;

  const now = new Date().toISOString();
  const copy: SavedDeckRecord = {
    ...source,
    id: generateDeckId(),
    name: newName?.trim() || `${source.name} (Copy)`,
    commanderIds: [...source.commanderIds],
    mainboard: { ...source.mainboard },
    sideboard: { ...source.sideboard },
    ...(source.sharedWithUids ? { sharedWithUids: [...source.sharedWithUids] } : {}),
    ...(source.synergyThemes ? { synergyThemes: [...source.synergyThemes] } : {}),
    revision: 0,
    syncStatus: 'local',
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  delete copy.cloudUpdatedAt;
  await db.decks.put(copy);
  return copy;
}

export async function getSyncMeta(
  key: string,
  db: MtgCardDatabase = cardDb,
): Promise<string | null> {
  const record = await db.syncMeta.get(key);
  return record?.value ?? null;
}

export async function setSyncMeta(
  key: string,
  value: string | null,
  db: MtgCardDatabase = cardDb,
): Promise<void> {
  if (value === null) {
    await db.syncMeta.delete(key);
    return;
  }
  await db.syncMeta.put({ key, value });
}
