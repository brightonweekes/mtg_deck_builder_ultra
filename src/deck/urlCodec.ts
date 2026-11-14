import type { DeckDraft } from '../types/deck.js';

export interface SerializedUrlDeck {
  name: string;
  commanderIds: string[];
  mainboard: Array<[string, number]>;
  sideboard: Array<[string, number]>;
}

const BINARY_MAGIC_V1 = 0x01;
const RE_UUID_CANONICAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(str: string): Uint8Array {
  let padded = str.replace(/-/g, '+').replace(/_/g, '/');
  while (padded.length % 4 !== 0) {
    padded += '=';
  }
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToUuid(bytes: Uint8Array, offset: number): string {
  let hex = '';
  for (let i = 0; i < 16; i++) {
    hex += bytes[offset + i]!.toString(16).padStart(2, '0');
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Encodes a Commander deck into a compact URL query parameter (`?d=...`)
 * using binary 16-byte UUID packing (or UTF-8 JSON fallback for non-UUID test IDs).
 */
export function encodeDeckToUrlParam(deck: DeckDraft): string {
  const mainEntries = Object.values(deck.mainboard)
    .filter((e) => e.quantity > 0)
    .map<[string, number]>((e) => [e.card.id, Math.min(255, Math.max(1, e.quantity))]);

  const sbEntries = Object.values(deck.sideboard)
    .filter((e) => e.quantity > 0)
    .map<[string, number]>((e) => [e.card.id, Math.min(255, Math.max(1, e.quantity))]);

  const commanderIds = deck.commanders.map((c) => c.id);
  const allIds = [...commanderIds, ...mainEntries.map(([id]) => id), ...sbEntries.map(([id]) => id)];
  const allAreUuids = allIds.every((id) => RE_UUID_CANONICAL.test(id));

  const encoder = new TextEncoder();

  if (!allAreUuids) {
    const jsonPayload: SerializedUrlDeck = {
      name: deck.name,
      commanderIds,
      mainboard: mainEntries,
      sideboard: sbEntries,
    };
    return `j_${bytesToBase64Url(encoder.encode(JSON.stringify(jsonPayload)))}`;
  }

  const nameBytes = encoder.encode(deck.name.slice(0, 120));
  const totalBytes =
    1 + // version
    2 + // name length
    nameBytes.length +
    1 + // commander count
    commanderIds.length * 16 +
    2 + // mainboard count
    mainEntries.length * 17 +
    2 + // sideboard count
    sbEntries.length * 17;

  const buf = new Uint8Array(totalBytes);
  const view = new DataView(buf.buffer);
  let pos = 0;

  buf[pos++] = BINARY_MAGIC_V1;
  view.setUint16(pos, nameBytes.length);
  pos += 2;
  buf.set(nameBytes, pos);
  pos += nameBytes.length;

  buf[pos++] = Math.min(255, commanderIds.length);
  for (const id of commanderIds) {
    buf.set(uuidToBytes(id), pos);
    pos += 16;
  }

  view.setUint16(pos, mainEntries.length);
  pos += 2;
  for (const [id, qty] of mainEntries) {
    buf.set(uuidToBytes(id), pos);
    pos += 16;
    buf[pos++] = qty;
  }

  view.setUint16(pos, sbEntries.length);
  pos += 2;
  for (const [id, qty] of sbEntries) {
    buf.set(uuidToBytes(id), pos);
    pos += 16;
    buf[pos++] = qty;
  }

  return bytesToBase64Url(buf);
}

/**
 * Decodes a `?d=...` URL query parameter back into card IDs and quantities.
 */
export function decodeDeckFromUrlParam(param: string): SerializedUrlDeck | null {
  try {
    const trimmed = param.trim();
    if (!trimmed) return null;

    const decoder = new TextDecoder('utf-8');

    if (trimmed.startsWith('j_')) {
      const jsonStr = decoder.decode(base64UrlToBytes(trimmed.slice(2)));
      const parsed = JSON.parse(jsonStr) as Partial<SerializedUrlDeck>;
      if (
        !parsed ||
        typeof parsed.name !== 'string' ||
        !Array.isArray(parsed.commanderIds) ||
        !Array.isArray(parsed.mainboard)
      ) {
        return null;
      }
      return {
        name: parsed.name,
        commanderIds: parsed.commanderIds,
        mainboard: parsed.mainboard,
        sideboard: Array.isArray(parsed.sideboard) ? parsed.sideboard : [],
      };
    }

    const buf = base64UrlToBytes(trimmed);
    if (buf.length < 8 || buf[0] !== BINARY_MAGIC_V1) return null;

    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let pos = 1;

    const nameLen = view.getUint16(pos);
    pos += 2;
    if (pos + nameLen > buf.length) return null;
    const name = decoder.decode(buf.subarray(pos, pos + nameLen));
    pos += nameLen;

    const cmdCount = buf[pos++];
    if (cmdCount === undefined || pos + cmdCount * 16 > buf.length) return null;
    const commanderIds: string[] = [];
    for (let i = 0; i < cmdCount; i++) {
      commanderIds.push(bytesToUuid(buf, pos));
      pos += 16;
    }

    if (pos + 2 > buf.length) return null;
    const mainCount = view.getUint16(pos);
    pos += 2;
    if (pos + mainCount * 17 > buf.length) return null;
    const mainboard: Array<[string, number]> = [];
    for (let i = 0; i < mainCount; i++) {
      const id = bytesToUuid(buf, pos);
      pos += 16;
      const qty = buf[pos++] ?? 1;
      mainboard.push([id, qty]);
    }

    if (pos + 2 > buf.length) return null;
    const sbCount = view.getUint16(pos);
    pos += 2;
    if (pos + sbCount * 17 > buf.length) return null;
    const sideboard: Array<[string, number]> = [];
    for (let i = 0; i < sbCount; i++) {
      const id = bytesToUuid(buf, pos);
      pos += 16;
      const qty = buf[pos++] ?? 1;
      sideboard.push([id, qty]);
    }

    return { name, commanderIds, mainboard, sideboard };
  } catch {
    return null;
  }
}
