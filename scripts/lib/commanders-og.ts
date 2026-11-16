import type { CompactCard, ManaColor } from '../../src/types/card.js';

export const SCRYFALL_IMAGE_PREFIX = 'https://cards.scryfall.io/';

const WUBRG_ORDER: readonly ManaColor[] = ['W', 'U', 'B', 'R', 'G'];

export type CommanderOgRow = [name: string, colorIdentity: string, imagePath: string];

export interface CommanderOgEntry {
  name: string;
  colorIdentity: string;
  imageUrl: string;
}

export interface CommandersOgIndex {
  version?: number;
  imagePrefix?: string;
  rows: CommanderOgRow[];
  byId: Record<string, number>;
  byOracleId: Record<string, number>;
}

function isSafeLookupKey(key: string): boolean {
  return key.length > 0 && key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
}

/**
 * Formats a mana color array or code string into canonical WUBRG order (`'C'` when colorless).
 */
export function formatColorIdentityCode(colors: readonly string[] | string): string {
  const present = new Set<ManaColor>();
  const tokens = typeof colors === 'string' ? colors.toUpperCase().split('') : colors;
  for (const token of tokens) {
    const upper = token.toUpperCase();
    if (upper === 'W' || upper === 'U' || upper === 'B' || upper === 'R' || upper === 'G') {
      present.add(upper);
    }
  }
  const ordered = WUBRG_ORDER.filter((c) => present.has(c));
  return ordered.length > 0 ? ordered.join('') : 'C';
}

/**
 * Strips the common `https://cards.scryfall.io/` prefix when present to minimize JSON size.
 */
export function stripScryfallImagePrefix(imageUrl: string): string {
  const trimmed = typeof imageUrl === 'string' ? imageUrl.trim() : '';
  if (!trimmed) return '';
  return trimmed.startsWith(SCRYFALL_IMAGE_PREFIX)
    ? trimmed.slice(SCRYFALL_IMAGE_PREFIX.length)
    : trimmed;
}

/**
 * Restores a compact Scryfall image path back into a full image URL.
 */
export function restoreScryfallImageUrl(
  imagePath: string,
  imagePrefix = SCRYFALL_IMAGE_PREFIX,
): string {
  const trimmed = typeof imagePath === 'string' ? imagePath.trim() : '';
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = imagePrefix || SCRYFALL_IMAGE_PREFIX;
  return `${base}${trimmed.replace(/^\/+/, '')}`;
}

/**
 * Builds a deduplicated, ultra-compact Open Graph lookup index for all Commander-eligible cards.
 */
export function buildCommandersOgIndex(cards: readonly CompactCard[]): CommandersOgIndex {
  const rows: CommanderOgRow[] = [];
  const rowIndexByKey = new Map<string, number>();
  const byId: Record<string, number> = {};
  const byOracleId: Record<string, number> = {};

  for (const card of cards) {
    if (!card.isCommanderEligible) continue;

    const name = card.name.trim();
    const colorIdentity = formatColorIdentityCode(card.colorIdentity);
    const rawImage = card.imageNormal || card.faces?.[0]?.imageNormal || '';
    const imagePath = stripScryfallImagePrefix(rawImage);

    const dedupeKey = `${name}\0${colorIdentity}\0${imagePath}`;
    let rowIdx = rowIndexByKey.get(dedupeKey);
    if (rowIdx === undefined) {
      rowIdx = rows.length;
      rows.push([name, colorIdentity, imagePath]);
      rowIndexByKey.set(dedupeKey, rowIdx);
    }

    const id = typeof card.id === 'string' ? card.id.trim() : '';
    if (isSafeLookupKey(id)) {
      byId[id] = rowIdx;
    }

    const oracleId = typeof card.oracleId === 'string' ? card.oracleId.trim() : '';
    if (isSafeLookupKey(oracleId) && !Object.hasOwn(byOracleId, oracleId)) {
      byOracleId[oracleId] = rowIdx;
    }
  }

  return {
    version: 1,
    imagePrefix: SCRYFALL_IMAGE_PREFIX,
    rows,
    byId,
    byOracleId,
  };
}

/**
 * Resolves a Commander OG entry by either Scryfall card `id` (`?d=`) or `oracleId` (`?deck=`).
 */
export function resolveCommanderOgEntry(
  index: CommandersOgIndex | null | undefined,
  idOrOracleId: string | null | undefined,
): CommanderOgEntry | null {
  if (!index || !Array.isArray(index.rows) || typeof idOrOracleId !== 'string') {
    return null;
  }

  const key = idOrOracleId.trim();
  if (!isSafeLookupKey(key)) {
    return null;
  }

  let rowIdx: number | undefined;
  if (index.byId && Object.hasOwn(index.byId, key)) {
    rowIdx = index.byId[key];
  } else if (index.byOracleId && Object.hasOwn(index.byOracleId, key)) {
    rowIdx = index.byOracleId[key];
  }

  if (
    typeof rowIdx !== 'number' ||
    !Number.isInteger(rowIdx) ||
    rowIdx < 0 ||
    rowIdx >= index.rows.length
  ) {
    return null;
  }

  const row = index.rows[rowIdx];
  if (!Array.isArray(row) || typeof row[0] !== 'string') {
    return null;
  }

  const prefix =
    typeof index.imagePrefix === 'string' && index.imagePrefix
      ? index.imagePrefix
      : SCRYFALL_IMAGE_PREFIX;

  return {
    name: row[0],
    colorIdentity: typeof row[1] === 'string' && row[1] ? row[1] : 'C',
    imageUrl: typeof row[2] === 'string' ? restoreScryfallImageUrl(row[2], prefix) : '',
  };
}
