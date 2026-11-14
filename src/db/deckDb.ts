import type { CompactCard } from '../types/card.js';
import type { DeckCardEntry, DeckDraft } from '../types/deck.js';
import { cardDb, type MtgCardDatabase, type SavedDeckRecord } from './cardDb.js';

export function generateDeckId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `deck-${crypto.randomUUID()}`;
  }
  return `deck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Converts a hydrated in-memory DeckDraft to the compact IndexedDB SavedDeckRecord format.
 */
export function deckDraftToSavedRecord(deck: DeckDraft): SavedDeckRecord {
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

  return {
    id: deck.id,
    name: deck.name.trim() || 'Untitled Commander Deck',
    commanderIds: deck.commanders.map((c) => c.id),
    mainboard,
    sideboard,
    createdAt: deck.createdAt || deck.updatedAt,
    updatedAt: deck.updatedAt || new Date().toISOString(),
  };
}

/**
 * Collects all unique card IDs referenced by a SavedDeckRecord for fast catalog hydration.
 */
export function collectRecordCardIds(record: SavedDeckRecord): string[] {
  const ids = new Set<string>(record.commanderIds);
  for (const id of Object.keys(record.mainboard)) ids.add(id);
  for (const id of Object.keys(record.sideboard)) ids.add(id);
  return Array.from(ids);
}

/**
 * Hydrates a SavedDeckRecord from IndexedDB back into a full DeckDraft using resolved catalog cards.
 */
export function hydrateSavedRecordToDraft(
  record: SavedDeckRecord,
  cardMap: Record<string, CompactCard>,
  lockSearchToCommanderIdentity = true,
): DeckDraft {
  const commanders: CompactCard[] = [];
  for (const cmdId of record.commanderIds) {
    const card = cardMap[cmdId];
    if (card) commanders.push(card);
  }

  const mainboard: Record<string, DeckCardEntry> = {};
  for (const [id, qty] of Object.entries(record.mainboard)) {
    const card = cardMap[id];
    if (card && qty > 0) {
      mainboard[id] = { card, quantity: qty };
    }
  }

  const sideboard: Record<string, DeckCardEntry> = {};
  for (const [id, qty] of Object.entries(record.sideboard)) {
    const card = cardMap[id];
    if (card && qty > 0) {
      sideboard[id] = { card, quantity: qty };
    }
  }

  return {
    id: record.id,
    name: record.name,
    commanders,
    mainboard,
    sideboard,
    lockSearchToCommanderIdentity,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function saveDeckToDb(
  deck: DeckDraft,
  db: MtgCardDatabase = cardDb,
): Promise<SavedDeckRecord> {
  const record = deckDraftToSavedRecord(deck);
  await db.decks.put(record);
  return record;
}

export async function listSavedDeckRecords(
  db: MtgCardDatabase = cardDb,
): Promise<SavedDeckRecord[]> {
  const all = await db.decks.toArray();
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
    createdAt: now,
    updatedAt: now,
  };
  await db.decks.put(copy);
  return copy;
}
