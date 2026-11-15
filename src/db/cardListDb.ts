import type { CompactCard } from '../types/card.js';
import type {
  CardListEntry,
  CardListRecord,
  CardListType,
  DeckVisibility,
} from '../types/cloud.js';
import { cardDb, type MtgCardDatabase } from './cardDb.js';
import {
  resolveCardIdFromLookup,
  resolveOracleIdFromLookup,
  type CardLookup,
} from './deckDb.js';

export interface CreateCardListInput {
  id?: string;
  name: string;
  description?: string;
  listType: CardListType;
  entries?: Record<string, CardListEntry>;
  visibility?: DeckVisibility;
  sharedWithUids?: string[];
  ownerUid?: string | null;
  ownerHandle?: string;
}

export interface ListCardListsOptions {
  includeDeleted?: boolean;
  listType?: CardListType;
  activeUid?: string | null;
}

export interface ParsedCardListLine {
  name: string;
  quantity: number;
  foilQuantity?: number;
  forTradeQuantity?: number;
  note?: string;
}

export interface ParsedCardListText {
  name?: string;
  description?: string;
  listType?: CardListType;
  lines: ParsedCardListLine[];
}

export interface ImportCardListResult {
  name?: string;
  description?: string;
  listType?: CardListType;
  entries: Record<string, CardListEntry>;
  importedCount: number;
  missingNames: string[];
}

const VALID_CARD_LIST_TYPES = new Set<CardListType>([
  'collection',
  'wishlist',
  'trade',
  'synergy-package',
]);

const DEFAULT_LIST_NAMES: Record<CardListType, string> = {
  collection: 'Collection Binder',
  wishlist: 'Wishlist',
  trade: 'Trade Binder',
  'synergy-package': 'Synergy Package',
};

const RE_NAME_COMMENT = /^\/\/\s*Name\s*:\s*(.+)$/i;
const RE_TYPE_COMMENT = /^\/\/\s*Type\s*:\s*(.+)$/i;
const RE_DESC_COMMENT = /^\/\/\s*Description\s*:\s*(.+)$/i;
const RE_SECTION_HEADER =
  /^(?:\/\/\s*)?(collection|binder|wishlist|trade|synergy-package|package|mainboard|main|cards)\s*:?\s*$/i;
const RE_LEADING_QTY = /^(\d+)x?\s+(.+)$/i;
const RE_INLINE_NOTE = /\s+\/\/\s*note:\s*(.+)$/i;
const RE_FOIL_TAG = /(?:^|\s)\*[Ff]\*(?=\s|$)/g;
const RE_HASH_FOIL = /(?:^|\s)#foil:(\d+)(?=\s|$)/gi;
const RE_HASH_TRADE = /(?:^|\s)#trade:(\d+)(?=\s|$)/gi;
const RE_TRAIL_CATEGORY = /\s+(?:#|\^)[^*\n]*$/;
const RE_TRAIL_SET_OR_MARK =
  /\s*(?:\*[FEACfeac]+\*|\([A-Za-z0-9]{2,6}\)(?:\s+[A-Za-z0-9★-]+)?|\[[A-Za-z0-9]{2,6}\](?:\s+[A-Za-z0-9★-]+)?)\s*$/;

export function generateCardListId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `list-${crypto.randomUUID()}`;
  }
  return `list-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function toNonNegativeInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

function sanitizeCardListEntry(entry: CardListEntry): CardListEntry | null {
  const quantity = toNonNegativeInt(entry.quantity);
  const foilQuantity = toNonNegativeInt(entry.foilQuantity);
  const forTradeQuantity = toNonNegativeInt(entry.forTradeQuantity);
  if (quantity === 0 && foilQuantity === 0 && forTradeQuantity === 0) {
    return null;
  }

  const trimmedNote = entry.note?.trim();
  return {
    quantity,
    ...(foilQuantity > 0 ? { foilQuantity } : {}),
    ...(forTradeQuantity > 0 ? { forTradeQuantity } : {}),
    ...(trimmedNote ? { note: trimmedNote } : {}),
  };
}

export function normalizeCardListEntries(
  entries: Record<string, CardListEntry>,
): Record<string, CardListEntry> {
  const normalized: Record<string, CardListEntry> = {};
  for (const [id, entry] of Object.entries(entries)) {
    const cleanId = id.trim();
    if (!cleanId) continue;
    const cleanEntry = sanitizeCardListEntry(entry);
    if (cleanEntry) {
      normalized[cleanId] = cleanEntry;
    }
  }
  return normalized;
}

function mergeCardListEntries(existing: CardListEntry | undefined, incoming: CardListEntry): CardListEntry {
  if (!existing) {
    return { ...incoming };
  }
  const quantity = existing.quantity + incoming.quantity;
  const foilQuantity = (existing.foilQuantity ?? 0) + (incoming.foilQuantity ?? 0);
  const forTradeQuantity = (existing.forTradeQuantity ?? 0) + (incoming.forTradeQuantity ?? 0);
  const note =
    existing.note && incoming.note && existing.note !== incoming.note
      ? `${existing.note}; ${incoming.note}`
      : existing.note || incoming.note;

  return {
    quantity,
    ...(foilQuantity > 0 ? { foilQuantity } : {}),
    ...(forTradeQuantity > 0 ? { forTradeQuantity } : {}),
    ...(note ? { note } : {}),
  };
}

function convertCardListEntryMap(
  entries: Record<string, CardListEntry>,
  lookup: CardLookup,
  resolver: (key: string, cardLookup: CardLookup) => string,
): Record<string, CardListEntry> {
  const out: Record<string, CardListEntry> = {};
  for (const [key, entry] of Object.entries(entries)) {
    const sanitized = sanitizeCardListEntry(entry);
    if (!sanitized) continue;
    const mappedKey = resolver(key, lookup);
    out[mappedKey] = mergeCardListEntries(out[mappedKey], sanitized);
  }
  return out;
}

/**
 * Converts local `{ [cardId]: CardListEntry }` keys into canonical `{ [oracleId]: CardListEntry }` keys.
 */
export function convertCardListEntriesToOracleIds(
  entries: Record<string, CardListEntry>,
  cardLookup: CardLookup,
): Record<string, CardListEntry> {
  return convertCardListEntryMap(entries, cardLookup, resolveOracleIdFromLookup);
}

/**
 * Converts cloud `{ [oracleId]: CardListEntry }` keys back into local `{ [cardId]: CardListEntry }` keys.
 */
export function convertOracleEntriesToCardListIds(
  entries: Record<string, CardListEntry>,
  resolvedByOracleId: CardLookup,
): Record<string, CardListEntry> {
  return convertCardListEntryMap(entries, resolvedByOracleId, resolveCardIdFromLookup);
}

/**
 * Creates and persists a new local card list (collection binder, wishlist, trade binder, or synergy package).
 */
export async function createCardList(
  input: CreateCardListInput,
  db: MtgCardDatabase = cardDb,
): Promise<CardListRecord> {
  const now = new Date().toISOString();
  const trimmedDesc = input.description?.trim();
  const record: CardListRecord = {
    id: input.id?.trim() || generateCardListId(),
    name: input.name.trim() || DEFAULT_LIST_NAMES[input.listType],
    ...(trimmedDesc ? { description: trimmedDesc } : {}),
    listType: input.listType,
    entries: normalizeCardListEntries(input.entries ?? {}),
    visibility: input.visibility ?? 'private',
    ...(input.sharedWithUids ? { sharedWithUids: [...input.sharedWithUids] } : {}),
    ownerUid: input.ownerUid !== undefined ? input.ownerUid : null,
    ...(input.ownerHandle !== undefined ? { ownerHandle: input.ownerHandle } : {}),
    revision: 0,
    syncStatus: 'local',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await db.cardlists.put(record);
  return record;
}

/**
 * Saves an existing or updated CardListRecord to IndexedDB.
 */
export async function saveCardList(
  list: CardListRecord,
  db: MtgCardDatabase = cardDb,
): Promise<CardListRecord> {
  const now = new Date().toISOString();
  const normalized: CardListRecord = {
    ...list,
    name: list.name.trim() || DEFAULT_LIST_NAMES[list.listType],
    entries: normalizeCardListEntries(list.entries),
    ...(list.sharedWithUids ? { sharedWithUids: [...list.sharedWithUids] } : {}),
    createdAt: list.createdAt || list.updatedAt || now,
    updatedAt: list.updatedAt || now,
  };
  await db.cardlists.put(normalized);
  return normalized;
}

function isMtgDatabase(value: unknown): value is MtgCardDatabase {
  return Boolean(value && typeof value === 'object' && 'cardlists' in value);
}

export async function listCardLists(
  db?: MtgCardDatabase,
  options?: ListCardListsOptions,
): Promise<CardListRecord[]>;
export async function listCardLists(
  options?: ListCardListsOptions,
): Promise<CardListRecord[]>;
export async function listCardLists(
  dbOrOptions?: MtgCardDatabase | ListCardListsOptions,
  maybeOptions?: ListCardListsOptions,
): Promise<CardListRecord[]> {
  const db = isMtgDatabase(dbOrOptions) ? dbOrOptions : cardDb;
  const options = isMtgDatabase(dbOrOptions) ? maybeOptions : dbOrOptions;
  const includeDeleted = options?.includeDeleted ?? false;
  const listType = options?.listType;
  const hasActiveUidFilter = options?.activeUid !== undefined;
  const activeUid = options?.activeUid ?? null;

  const all = await db.cardlists.toArray();
  const filtered = all.filter((record) => {
    if (!includeDeleted && record.deletedAt) return false;
    if (listType && record.listType !== listType) return false;
    if (hasActiveUidFilter && record.ownerUid && record.ownerUid !== activeUid) {
      return false;
    }
    return true;
  });
  return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getCardList(
  id: string,
  db: MtgCardDatabase = cardDb,
): Promise<CardListRecord | undefined> {
  return db.cardlists.get(id);
}

/**
 * Marks a card list as soft-deleted with a tombstone timestamp and `pending` sync status.
 */
export async function softDeleteCardList(
  id: string,
  db: MtgCardDatabase = cardDb,
): Promise<CardListRecord | null> {
  const existing = await db.cardlists.get(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const tombstoned: CardListRecord = {
    ...existing,
    deletedAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  };
  await db.cardlists.put(tombstoned);
  return tombstoned;
}

export async function deleteCardListPermanently(
  id: string,
  db: MtgCardDatabase = cardDb,
): Promise<void> {
  await db.cardlists.delete(id);
}

/**
 * Deletes all card list records belonging to a specific cloud owner UID, leaving local lists untouched.
 */
export async function clearCloudCardListsForOwner(
  ownerUid: string,
  db: MtgCardDatabase = cardDb,
): Promise<number> {
  if (!ownerUid) return 0;
  return db.cardlists.where('ownerUid').equals(ownerUid).delete();
}

/**
 * Serializes a CardListRecord into human-readable plain text with optional foil, trade, and note tags.
 */
export function exportCardListToText(
  list: CardListRecord,
  cardMap: Record<string, CompactCard>,
): string {
  const lines: string[] = [
    `// Name: ${list.name}`,
    `// Type: ${list.listType}`,
  ];
  if (list.description?.trim()) {
    lines.push(`// Description: ${list.description.trim()}`);
  }

  const resolvedRows = Object.entries(list.entries)
    .map(([id, entry]) => {
      const clean = sanitizeCardListEntry(entry);
      if (!clean) return null;
      const cardName = cardMap[id]?.name ?? id;
      return { cardName, entry: clean };
    })
    .filter((row): row is { cardName: string; entry: CardListEntry } => row !== null)
    .sort((a, b) => a.cardName.localeCompare(b.cardName));

  if (resolvedRows.length > 0) {
    lines.push('');
    for (const { cardName, entry } of resolvedRows) {
      const count = entry.quantity > 0 ? entry.quantity : entry.foilQuantity ?? 0;
      const parts: string[] = [`${count} ${cardName}`];

      if (entry.foilQuantity && entry.foilQuantity > 0) {
        if (entry.foilQuantity === count) {
          parts.push('*F*');
        } else {
          parts.push(`#foil:${entry.foilQuantity}`);
        }
      }
      if (entry.forTradeQuantity && entry.forTradeQuantity > 0) {
        parts.push(`#trade:${entry.forTradeQuantity}`);
      }
      if (entry.note) {
        const singleLineNote = entry.note.replace(/\s+/g, ' ').trim();
        if (singleLineNote) {
          parts.push(`// note: ${singleLineNote}`);
        }
      }
      lines.push(parts.join(' '));
    }
  }

  return lines.join('\n');
}

function stripTrailingAnnotations(rawName: string): string {
  let clean = rawName.trim();
  clean = clean.replace(RE_TRAIL_CATEGORY, '').trim();
  for (let i = 0; i < 4; i++) {
    const next = clean.replace(RE_TRAIL_SET_OR_MARK, '').trim();
    if (next === clean) break;
    clean = next;
  }
  return clean;
}

/**
 * Parses plain-text card list lines (including `*F*`, `#foil:N`, `#trade:N`, and `// note: ...` metadata).
 */
export function parseCardListText(rawText: string): ParsedCardListText {
  const result: ParsedCardListText = { lines: [] };

  for (const rawLine of rawText.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const nameMatch = RE_NAME_COMMENT.exec(trimmed);
    if (nameMatch?.[1]) {
      result.name = nameMatch[1].trim();
      continue;
    }

    const typeMatch = RE_TYPE_COMMENT.exec(trimmed);
    if (typeMatch?.[1]) {
      const candidate = typeMatch[1].trim().toLowerCase() as CardListType;
      if (VALID_CARD_LIST_TYPES.has(candidate)) {
        result.listType = candidate;
      }
      continue;
    }

    const descMatch = RE_DESC_COMMENT.exec(trimmed);
    if (descMatch?.[1]) {
      result.description = descMatch[1].trim();
      continue;
    }

    if (RE_SECTION_HEADER.test(trimmed)) continue;
    if (trimmed.startsWith('//') || trimmed.startsWith('#')) continue;

    let body = trimmed;
    let note: string | undefined;
    const noteMatch = RE_INLINE_NOTE.exec(body);
    if (noteMatch?.[1]) {
      note = noteMatch[1].trim();
      body = body.slice(0, noteMatch.index).trim();
    }

    let quantity = 1;
    const qtyMatch = RE_LEADING_QTY.exec(body);
    if (qtyMatch) {
      quantity = Math.max(1, Number.parseInt(qtyMatch[1]!, 10));
      body = qtyMatch[2]!;
    }

    let foilQuantity: number | undefined;
    let forTradeQuantity: number | undefined;

    body = body.replace(RE_HASH_FOIL, (_, num: string) => {
      foilQuantity = (foilQuantity ?? 0) + Math.max(0, Number.parseInt(num, 10));
      return '';
    });

    body = body.replace(RE_HASH_TRADE, (_, num: string) => {
      forTradeQuantity = (forTradeQuantity ?? 0) + Math.max(0, Number.parseInt(num, 10));
      return '';
    });

    RE_FOIL_TAG.lastIndex = 0;
    if (RE_FOIL_TAG.test(body)) {
      if (foilQuantity === undefined) {
        foilQuantity = quantity;
      }
      body = body.replace(RE_FOIL_TAG, ' ');
    }

    const cardName = stripTrailingAnnotations(body);
    if (!cardName) continue;

    result.lines.push({
      name: cardName,
      quantity,
      ...(foilQuantity && foilQuantity > 0 ? { foilQuantity } : {}),
      ...(forTradeQuantity && forTradeQuantity > 0 ? { forTradeQuantity } : {}),
      ...(note ? { note } : {}),
    });
  }

  return result;
}

/**
 * Parses plain-text card list input and resolves recognized cards into `CardListEntry` records.
 */
export function importCardListEntries(
  rawText: string,
  cardByName: Record<string, CompactCard>,
): ImportCardListResult {
  const parsed = parseCardListText(rawText);
  const normalizedLookup = new Map<string, CompactCard>();
  for (const [key, card] of Object.entries(cardByName)) {
    const lower = key.trim().toLowerCase();
    if (lower && !normalizedLookup.has(lower)) {
      normalizedLookup.set(lower, card);
    }
    const cardLower = card.name.trim().toLowerCase();
    if (cardLower && !normalizedLookup.has(cardLower)) {
      normalizedLookup.set(cardLower, card);
    }
  }

  const entries: Record<string, CardListEntry> = {};
  const missingNames: string[] = [];
  let importedCount = 0;

  for (const line of parsed.lines) {
    const lower = line.name.trim().toLowerCase();
    let card = cardByName[line.name] ?? normalizedLookup.get(lower);
    if (!card && lower.includes(' // ')) {
      const frontFace = lower.slice(0, lower.indexOf(' // ')).trim();
      card = normalizedLookup.get(frontFace);
    }

    if (!card) {
      if (!missingNames.includes(line.name)) {
        missingNames.push(line.name);
      }
      continue;
    }

    const entry: CardListEntry = {
      quantity: line.quantity,
      ...(line.foilQuantity ? { foilQuantity: line.foilQuantity } : {}),
      ...(line.forTradeQuantity ? { forTradeQuantity: line.forTradeQuantity } : {}),
      ...(line.note ? { note: line.note } : {}),
    };
    entries[card.id] = mergeCardListEntries(entries[card.id], entry);
    importedCount += line.quantity;
  }

  return {
    ...(parsed.name ? { name: parsed.name } : {}),
    ...(parsed.description ? { description: parsed.description } : {}),
    ...(parsed.listType ? { listType: parsed.listType } : {}),
    entries,
    importedCount,
    missingNames,
  };
}
