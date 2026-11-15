import type { ManaColor } from '../types/card.js';

export type DeckVisibility = 'private' | 'friends' | 'link' | 'public';

export type CardListType = 'collection' | 'wishlist' | 'trade' | 'synergy-package';

export interface CardListEntry {
  quantity: number;
  foilQuantity?: number;
  forTradeQuantity?: number;
  note?: string;
}

export const HANDLE_MIN_LEN = 3;
export const HANDLE_MAX_LEN = 24;
export const HANDLE_REGEX = /^[a-zA-Z0-9_-]+$/;

export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  'admin',
  'administrator',
  'system',
  'support',
  'moderator',
  'mod',
  'wizards',
  'wotc',
  'official',
  'staff',
  'team',
  'security',
  'abuse',
  'owner',
  'root',
  'help',
  'bot',
  'null',
  'undefined',
  'anonymous',
  'guest',
  'scryfall',
  'firebase',
  'noreply',
  'no-reply',
  'postmaster',
  'webmaster',
  'api',
  'auth',
  'account',
  'profile',
  'profiles',
  'handle',
  'handles',
]);

export const MAX_DECK_NAME_LEN = 120;
export const MAX_DECK_DESC_LEN = 2000;
export const MAX_MAINBOARD_KEYS = 250;
export const MAX_SIDEBOARD_KEYS = 200;
export const MAX_CARDLIST_KEYS = 1000;
export const MAX_CARDLIST_NOTE_LEN = 120;
export const MAX_DECK_CARD_QTY = 99;
export const MAX_COMMANDER_IDS = 2;
export const MAX_CLOUD_PAYLOAD_BYTES = 40000;

export const VALID_DECK_VISIBILITIES: readonly DeckVisibility[] = [
  'private',
  'friends',
  'link',
  'public',
] as const;

export const VALID_CARD_LIST_TYPES: readonly CardListType[] = [
  'collection',
  'wishlist',
  'trade',
  'synergy-package',
] as const;

const VALID_VISIBILITY_SET: ReadonlySet<string> = new Set(VALID_DECK_VISIBILITIES);
const VALID_CARD_LIST_TYPE_SET: ReadonlySet<string> = new Set(VALID_CARD_LIST_TYPES);

const RE_EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_EMAIL_STRICT = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_DECK_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const RE_FIREBASE_CODE_IN_MESSAGE = /\(((?:auth|firestore)\/[a-z0-9-]+)\)/i;

const ALNUM_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

const COMMON_WEAK_PASSWORDS: ReadonlySet<string> = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  '1234567890',
  'qwertyui',
  'qwerty123',
  'letmein1',
  'iloveyou',
  'admin123',
]);

export interface HandleValidationResult {
  valid: boolean;
  normalized: string;
  error?: string;
}

export interface EmailValidationResult {
  valid: boolean;
  normalized: string;
  error?: string;
}

export interface PasswordValidationResult {
  valid: boolean;
  score: 0 | 1 | 2 | 3;
  error?: string;
}

export interface SanitizableDeckPayload {
  id?: string;
  ownerUid?: string;
  ownerHandle?: string;
  name: string;
  description?: string;
  commanderOracleIds?: string[];
  colorIdentity?: ManaColor[];
  mainboard: Record<string, number>;
  sideboard?: Record<string, number>;
  synergyThemes?: string[];
  cardCount?: number;
  lockSearchToCommanderIdentity?: boolean;
  visibility?: DeckVisibility | string;
  sharedWithUids?: string[];
  revision?: number;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export type SanitizedDeckPayload<T extends SanitizableDeckPayload> = Omit<
  T,
  'name' | 'description' | 'visibility' | 'mainboard' | 'sideboard'
> & {
  name: string;
  description?: string;
  visibility: DeckVisibility;
  mainboard: Record<string, number>;
  sideboard: Record<string, number>;
};

export interface SanitizableCardListPayload {
  id?: string;
  ownerUid?: string | null;
  ownerHandle?: string;
  name: string;
  description?: string;
  listType: CardListType | string;
  entries: Record<string, CardListEntry>;
  visibility?: DeckVisibility | string;
  sharedWithUids?: string[];
  revision?: number;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export type SanitizedCardListPayload<T extends SanitizableCardListPayload> = Omit<
  T,
  'name' | 'description' | 'listType' | 'entries' | 'visibility'
> & {
  name: string;
  description?: string;
  listType: CardListType;
  entries: Record<string, CardListEntry>;
  visibility: DeckVisibility;
};

export interface CloudUrlIntents {
  sharedDeckId: string | null;
  addFriendHandle: string | null;
}

export interface HumanizedCloudError {
  code: string;
  message: string;
  isQuotaOrRateLimit: boolean;
  isOffline: boolean;
  requiresRecentLogin: boolean;
}

interface CloudErrorDescriptor {
  message: string;
  isQuotaOrRateLimit?: boolean;
  isOffline?: boolean;
  requiresRecentLogin?: boolean;
}

const CLOUD_ERROR_MAP: Readonly<Record<string, CloudErrorDescriptor>> = {
  'auth/email-already-in-use': {
    message: 'An account with this email already exists. Try signing in instead.',
  },
  'auth/invalid-credential': {
    message: 'Incorrect email or password. Please check your credentials and try again.',
  },
  'auth/wrong-password': {
    message: 'Incorrect password. Please try again or reset your password.',
  },
  'auth/user-not-found': {
    message: 'No account was found with that email address.',
  },
  'auth/too-many-requests': {
    message: 'Too many requests in a short time. Please wait a moment before trying again.',
    isQuotaOrRateLimit: true,
  },
  'auth/popup-blocked': {
    message:
      'Sign-in popup was blocked by your browser. Please allow popups for this site and try again.',
  },
  'auth/popup-closed-by-user': {
    message: 'Sign-in popup was closed before completing. Please try again.',
  },
  'auth/cancelled-popup-request': {
    message: 'Sign-in popup was cancelled because another sign-in window was opened.',
  },
  'auth/account-exists-with-different-credential': {
    message:
      'An account with this email already exists using a different sign-in method (such as Google or Email/Password).',
  },
  'auth/requires-recent-login': {
    message: 'For your security, please sign in again before completing this action.',
    requiresRecentLogin: true,
  },
  'auth/network-request-failed': {
    message: 'Network request failed. Check your internet connection and try again.',
    isOffline: true,
  },
  'auth/invalid-email': {
    message: 'Please enter a valid email address.',
  },
  'auth/weak-password': {
    message: 'Password is too weak. Use at least 8 characters.',
  },
  'auth/user-disabled': {
    message: 'This account has been disabled.',
  },
  'auth/operation-not-allowed': {
    message: 'This sign-in method is not enabled for this project.',
  },
  'auth/expired-action-code': {
    message: 'That email link has expired or has already been used. Please request a new one.',
  },
  'auth/invalid-action-code': {
    message: 'That email link has expired or has already been used. Please request a new one.',
  },
  'permission-denied': {
    message:
      'Permission denied. Make sure you are signed in, your email is verified, and you have access to this data.',
  },
  'resource-exhausted': {
    message:
      'Cloud quota or rate limit reached. Your changes remain safely stored locally and can sync later.',
    isQuotaOrRateLimit: true,
  },
  unavailable: {
    message:
      'Cloud service is temporarily unavailable or you are offline. Your changes remain saved locally.',
    isOffline: true,
  },
  'deadline-exceeded': {
    message: 'Cloud request timed out. Please check your connection and try again.',
    isOffline: true,
  },
  'failed-precondition': {
    message:
      'Cloud sync precondition failed (for example, a conflicting revision or missing index). Refresh and try again.',
  },
  unauthenticated: {
    message: 'Your session has expired. Please sign in again.',
  },
  'already-exists': {
    message: 'That record or handle already exists.',
  },
  'not-found': {
    message: 'The requested cloud item could not be found.',
  },
};

function isSafeRecordKey(key: string): boolean {
  return key.length > 0 && key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
}

function safeSlice(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  let end = maxLen;
  // Avoid leaving an unpaired UTF-16 high surrogate at the truncation boundary.
  const trailingCode = value.charCodeAt(end - 1);
  if (trailingCode >= 0xd800 && trailingCode <= 0xdbff) {
    end -= 1;
  }
  return value.slice(0, end);
}

function randomAlnumSuffix(length: number): string {
  const chars: string[] = [];
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    const bytes = new Uint8Array(length);
    globalThis.crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      chars.push(ALNUM_CHARS[bytes[i]! % ALNUM_CHARS.length]!);
    }
    return chars.join('');
  }

  for (let i = 0; i < length; i++) {
    chars.push(ALNUM_CHARS[Math.floor(Math.random() * ALNUM_CHARS.length)]!);
  }
  return chars.join('');
}

/**
 * Normalizes a public handle by trimming whitespace, stripping an optional leading `@`,
 * and converting to lowercase.
 */
export function normalizeHandle(raw: string): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  const withoutLeadingAt = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  return withoutLeadingAt.toLowerCase();
}

/**
 * Validates a public user handle against length, character, email-leak, and reserved-word rules.
 */
export function validateHandle(raw: string): HandleValidationResult {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  const normalized = normalizeHandle(trimmed);

  // Reject email-like values early so users never accidentally expose their email publicly.
  if (normalized.includes('@') || RE_EMAIL_LIKE.test(trimmed) || RE_EMAIL_LIKE.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Handle cannot be an email address. Choose a public username instead.',
    };
  }

  if (normalized.length === 0) {
    return {
      valid: false,
      normalized,
      error: 'Handle is required.',
    };
  }

  if (normalized.length < HANDLE_MIN_LEN) {
    return {
      valid: false,
      normalized,
      error: `Handle must be at least ${HANDLE_MIN_LEN} characters.`,
    };
  }

  if (normalized.length > HANDLE_MAX_LEN) {
    return {
      valid: false,
      normalized,
      error: `Handle must be ${HANDLE_MAX_LEN} characters or fewer.`,
    };
  }

  if (!HANDLE_REGEX.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Handle may only contain letters, numbers, underscores, and hyphens.',
    };
  }

  if (RESERVED_HANDLES.has(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'That handle is reserved. Please choose another.',
    };
  }

  return { valid: true, normalized };
}

/**
 * Suggests a safe default handle derived from an email local part plus 4 random alphanumeric
 * characters, omitting `@` and the email domain and always passing `validateHandle`.
 */
export function suggestHandleFromEmail(email: string): string {
  const trimmed = typeof email === 'string' ? email.trim() : '';
  const atIndex = trimmed.indexOf('@');
  const localPart = atIndex >= 0 ? trimmed.slice(0, atIndex) : trimmed;

  const maxPrefixLen = HANDLE_MAX_LEN - 5; // reserve '_' + 4 alnum chars
  let prefix = localPart
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, maxPrefixLen)
    .replace(/[_-]+$/g, '');

  if (!prefix) {
    prefix = 'player';
  }

  const suffix = randomAlnumSuffix(4);
  const candidate = `${prefix}_${suffix}`;
  if (validateHandle(candidate).valid) {
    return candidate;
  }

  return `player_${suffix}`;
}

/**
 * Computes a deterministic Firestore friendship document ID from two distinct, non-empty UIDs.
 */
export function makeFriendPairId(uidA: string, uidB: string): string {
  const a = typeof uidA === 'string' ? uidA.trim() : '';
  const b = typeof uidB === 'string' ? uidB.trim() : '';

  if (!a || !b) {
    throw new Error('Both user IDs must be non-empty strings.');
  }

  if (a.includes('/') || b.includes('/')) {
    throw new Error('User IDs cannot contain forward slashes.');
  }

  if (a === b) {
    throw new Error('Cannot create a friendship pair with the same user ID.');
  }

  // Use code-unit lexicographical comparison to match Firestore Rules `a < b`.
  const [first, second] = a < b ? [a, b] : [b, a];
  return `${first}_${second}`;
}

/**
 * Validates and normalizes an email address.
 */
export function validateEmail(email: string): EmailValidationResult {
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!normalized) {
    return {
      valid: false,
      normalized,
      error: 'Email address is required.',
    };
  }

  if (/\s/.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Email address cannot contain spaces.',
    };
  }

  if (normalized.length > 254 || !RE_EMAIL_STRICT.test(normalized)) {
    return {
      valid: false,
      normalized,
      error:
        normalized.length > 254 ? 'Email address is too long.' : 'Please enter a valid email address.',
    };
  }

  const atIdx = normalized.indexOf('@');
  const local = normalized.slice(0, atIdx);
  const domain = normalized.slice(atIdx + 1);

  if (
    local.length > 64 ||
    local.startsWith('.') ||
    local.endsWith('.') ||
    local.includes('..') ||
    domain.startsWith('.') ||
    domain.endsWith('.') ||
    domain.startsWith('-') ||
    domain.endsWith('-') ||
    domain.includes('..')
  ) {
    return {
      valid: false,
      normalized,
      error: 'Please enter a valid email address.',
    };
  }

  return { valid: true, normalized };
}

/**
 * Validates a password (>= 8 chars, non-trivial) and provides an entropy/variety score (`0..3`).
 */
export function validatePassword(password: string): PasswordValidationResult {
  if (typeof password !== 'string' || password.length === 0) {
    return {
      valid: false,
      score: 0,
      error: 'Password is required.',
    };
  }

  if (password.length < 8) {
    return {
      valid: false,
      score: 0,
      error: 'Password must be at least 8 characters.',
    };
  }

  const uniqueChars = new Set(password).size;
  if (uniqueChars < 3) {
    return {
      valid: false,
      score: 0,
      error: 'Password is too repetitive. Mix more distinct characters.',
    };
  }

  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) {
    return {
      valid: false,
      score: 0,
      error: 'That password is too common. Please choose a stronger one.',
    };
  }

  const classCount = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length;

  let score: 1 | 2 | 3 = 1;
  if (
    (password.length >= 16 && uniqueChars >= 6) ||
    (password.length >= 12 && classCount >= 2 && uniqueChars >= 6) ||
    (password.length >= 10 && classCount >= 3) ||
    (password.length >= 8 && classCount === 4)
  ) {
    score = 3;
  } else if (classCount >= 2 || password.length >= 12) {
    score = 2;
  }

  return { valid: true, score };
}

/**
 * Returns the exact UTF-8 encoded byte length of a string.
 */
export function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function validateVisibility(rawVisibility: DeckVisibility | string | undefined): DeckVisibility {
  if (rawVisibility === undefined) {
    return 'private';
  }
  if (typeof rawVisibility === 'string' && VALID_VISIBILITY_SET.has(rawVisibility)) {
    return rawVisibility as DeckVisibility;
  }
  throw new Error(
    `Invalid visibility "${String(rawVisibility)}". Expected one of: ${VALID_DECK_VISIBILITIES.join(', ')}.`,
  );
}

function sanitizeCardCountMap(
  rawMap: Record<string, number> | undefined,
  maxKeys: number,
  sectionLabel: string,
): Record<string, number> {
  const sanitized: Record<string, number> = {};
  if (!rawMap || typeof rawMap !== 'object') {
    return sanitized;
  }

  let count = 0;
  for (const [rawKey, rawQty] of Object.entries(rawMap)) {
    const key = rawKey.trim();
    if (!isSafeRecordKey(key)) continue;
    if (typeof rawQty !== 'number' || !Number.isFinite(rawQty)) continue;

    const qty = Math.floor(rawQty);
    if (qty < 1) continue;

    count += 1;
    if (count > maxKeys) {
      throw new Error(
        `Deck ${sectionLabel} exceeds maximum of ${maxKeys} unique card entries.`,
      );
    }

    sanitized[key] = Math.min(MAX_DECK_CARD_QTY, qty);
  }

  return sanitized;
}

function sanitizeStringList(
  items: readonly string[] | undefined,
  maxItems?: number,
  maxItemLen?: number,
): string[] | undefined {
  if (!Array.isArray(items)) return undefined;
  const deduped = new Set<string>();
  for (const item of items) {
    if (typeof item !== 'string') continue;
    let clean = item.trim();
    if (!clean) continue;
    if (maxItemLen !== undefined) {
      clean = safeSlice(clean, maxItemLen);
    }
    deduped.add(clean);
    if (maxItems !== undefined && deduped.size >= maxItems) break;
  }
  return Array.from(deduped);
}

function buildBaseCloudMetadata(
  payload: {
    name: string;
    description?: string;
    visibility?: DeckVisibility | string;
    sharedWithUids?: string[];
    revision?: number;
  },
  fallbackName: string,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...payload };
  const rawName = typeof payload.name === 'string' ? payload.name.trim() : '';
  sanitized.name = safeSlice(rawName, MAX_DECK_NAME_LEN) || fallbackName;

  if (typeof payload.description === 'string') {
    sanitized.description = safeSlice(payload.description.trim(), MAX_DECK_DESC_LEN);
  } else {
    delete sanitized.description;
  }

  sanitized.visibility = validateVisibility(payload.visibility);

  if (payload.sharedWithUids !== undefined) {
    sanitized.sharedWithUids = sanitizeStringList(payload.sharedWithUids) ?? [];
  }

  if (typeof payload.revision === 'number') {
    sanitized.revision = Number.isFinite(payload.revision)
      ? Math.max(1, Math.floor(payload.revision))
      : 1;
  }

  return sanitized;
}

function assertWithinCloudByteLimit(payload: unknown, label: string): void {
  const byteLength = getUtf8ByteLength(JSON.stringify(payload));
  if (byteLength > MAX_CLOUD_PAYLOAD_BYTES) {
    throw new Error(
      `${label} payload exceeds maximum cloud size of ${MAX_CLOUD_PAYLOAD_BYTES} bytes (got ${byteLength} bytes).`,
    );
  }
}

/**
 * Sanitizes and validates a deck payload before writing it to Firestore.
 * Caps name/description lengths, validates visibility, filters card quantities to `1..99`,
 * enforces section key caps, and rejects payloads exceeding `MAX_CLOUD_PAYLOAD_BYTES`.
 */
export function sanitizeDeckPayloadForCloud<T extends SanitizableDeckPayload>(
  payload: T,
): SanitizedDeckPayload<T> {
  const sanitized = buildBaseCloudMetadata(payload, 'Untitled Commander Deck');
  sanitized.mainboard = sanitizeCardCountMap(payload.mainboard, MAX_MAINBOARD_KEYS, 'mainboard');
  sanitized.sideboard = sanitizeCardCountMap(payload.sideboard, MAX_SIDEBOARD_KEYS, 'sideboard');

  if (payload.commanderOracleIds !== undefined) {
    const commanders = sanitizeStringList(payload.commanderOracleIds) ?? [];
    if (commanders.length > MAX_COMMANDER_IDS) {
      throw new Error(`Deck cannot have more than ${MAX_COMMANDER_IDS} commanders.`);
    }
    sanitized.commanderOracleIds = commanders;
  }

  if (payload.synergyThemes !== undefined) {
    sanitized.synergyThemes = sanitizeStringList(payload.synergyThemes, 30, 60) ?? [];
  }

  assertWithinCloudByteLimit(sanitized, 'Deck cloud');
  return sanitized as SanitizedDeckPayload<T>;
}

function sanitizeNonNegativeInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

/**
 * Sanitizes a map of card list entries: enforces non-negative integer counts,
 * trims optional notes to `120` chars, drops entries with all-zero quantities,
 * and caps the total entry count at `maxKeys` (default `MAX_CARDLIST_KEYS`).
 */
export function sanitizeCardListEntries(
  entries: Record<string, CardListEntry>,
  maxKeys = MAX_CARDLIST_KEYS,
): Record<string, CardListEntry> {
  const sanitized: Record<string, CardListEntry> = {};
  if (!entries || typeof entries !== 'object' || maxKeys <= 0) {
    return sanitized;
  }

  let count = 0;
  for (const [rawKey, rawEntry] of Object.entries(entries)) {
    if (count >= maxKeys) break;

    const key = rawKey.trim();
    if (!isSafeRecordKey(key)) continue;
    if (!rawEntry || typeof rawEntry !== 'object') continue;

    const quantity = sanitizeNonNegativeInt(rawEntry.quantity);
    const foilQuantity = sanitizeNonNegativeInt(rawEntry.foilQuantity);
    const forTradeQuantity = sanitizeNonNegativeInt(rawEntry.forTradeQuantity);

    if (quantity === 0 && foilQuantity === 0 && forTradeQuantity === 0) {
      continue;
    }

    const cleanEntry: CardListEntry = { quantity };
    if (foilQuantity > 0) {
      cleanEntry.foilQuantity = foilQuantity;
    }
    if (forTradeQuantity > 0) {
      cleanEntry.forTradeQuantity = forTradeQuantity;
    }
    if (typeof rawEntry.note === 'string') {
      const cleanNote = safeSlice(rawEntry.note.trim(), MAX_CARDLIST_NOTE_LEN);
      if (cleanNote.length > 0) {
        cleanEntry.note = cleanNote;
      }
    }

    sanitized[key] = cleanEntry;
    count += 1;
  }

  return sanitized;
}

/**
 * Sanitizes and validates a card list payload before writing it to Firestore.
 */
export function sanitizeCardListPayloadForCloud<T extends SanitizableCardListPayload>(
  payload: T,
): SanitizedCardListPayload<T> {
  if (typeof payload.listType !== 'string' || !VALID_CARD_LIST_TYPE_SET.has(payload.listType)) {
    throw new Error(
      `Invalid card list type "${String(payload.listType)}". Expected one of: ${VALID_CARD_LIST_TYPES.join(', ')}.`,
    );
  }

  const sanitized = buildBaseCloudMetadata(payload, 'Untitled Card List');
  sanitized.listType = payload.listType as CardListType;
  sanitized.entries = sanitizeCardListEntries(payload.entries, MAX_CARDLIST_KEYS);

  assertWithinCloudByteLimit(sanitized, 'Card list cloud');
  return sanitized as SanitizedCardListPayload<T>;
}

/**
 * Parses cloud share and friend-invite query parameters (`?deck=<id>` and `?addFriend=<handle>`),
 * returning `null` for missing, empty, or invalid values.
 */
export function parseCloudUrlIntents(search: string): CloudUrlIntents {
  if (typeof search !== 'string' || !search.trim()) {
    return { sharedDeckId: null, addFriendHandle: null };
  }

  try {
    const params = new URLSearchParams(search);
    const rawDeck = params.get('deck')?.trim() ?? '';
    const sharedDeckId = rawDeck && RE_DECK_ID.test(rawDeck) ? rawDeck : null;

    const rawFriend = params.get('addFriend') ?? '';
    const handleCheck = validateHandle(rawFriend);
    const addFriendHandle = handleCheck.valid ? handleCheck.normalized : null;

    return { sharedDeckId, addFriendHandle };
  } catch {
    return { sharedDeckId: null, addFriendHandle: null };
  }
}

function buildBaseHttpUrl(origin: string, pathname: string, contextLabel: string): URL {
  const trimmedOrigin = typeof origin === 'string' ? origin.trim() : '';
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(trimmedOrigin);
  } catch {
    throw new Error(`Invalid origin for ${contextLabel}: "${trimmedOrigin}".`);
  }

  if (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') {
    throw new Error(`Origin protocol must be http or https for ${contextLabel}.`);
  }

  const base = new URL(parsedOrigin.origin);
  const rawPath = typeof pathname === 'string' ? (pathname.split('?')[0]?.split('#')[0] ?? '') : '';
  // Collapse multiple leading slashes so protocol-relative paths like `//evil.com` cannot alter host.
  const normalizedPath = rawPath ? `/${rawPath.replace(/^\/+/, '')}` : '/';
  base.pathname = normalizedPath;
  return base;
}

/**
 * Builds an absolute friend invite URL (`<origin><pathname>?addFriend=<handle>`).
 */
export function buildFriendInviteUrl(origin: string, pathname: string, handle: string): string {
  const handleCheck = validateHandle(handle);
  if (!handleCheck.valid) {
    throw new Error(handleCheck.error ?? 'Invalid handle for friend invite URL.');
  }

  const url = buildBaseHttpUrl(origin, pathname, 'friend invite URL');
  url.searchParams.set('addFriend', handleCheck.normalized);
  return url.toString();
}

/**
 * Builds an absolute shared cloud deck URL (`<origin><pathname>?deck=<deckId>`).
 */
export function buildSharedDeckUrl(origin: string, pathname: string, deckId: string): string {
  const trimmedId = typeof deckId === 'string' ? deckId.trim() : '';
  if (!RE_DECK_ID.test(trimmedId)) {
    throw new Error('Invalid deck ID for shared deck URL.');
  }

  const url = buildBaseHttpUrl(origin, pathname, 'shared deck URL');
  url.searchParams.set('deck', trimmedId);
  return url.toString();
}

function extractErrorCodeAndMessage(err: unknown): { code: string; rawMessage: string } {
  if (typeof err === 'string') {
    const codeMatch = RE_FIREBASE_CODE_IN_MESSAGE.exec(err);
    return {
      code: codeMatch?.[1]?.toLowerCase() ?? 'unknown',
      rawMessage: err.trim(),
    };
  }

  if (err && typeof err === 'object') {
    const record = err as { code?: unknown; message?: unknown };
    const rawMessage = typeof record.message === 'string' ? record.message.trim() : '';

    if (typeof record.code === 'string' && record.code.trim()) {
      return {
        code: record.code.trim(),
        rawMessage,
      };
    }

    const codeMatch = RE_FIREBASE_CODE_IN_MESSAGE.exec(rawMessage);
    return {
      code: codeMatch?.[1]?.toLowerCase() ?? 'unknown',
      rawMessage,
    };
  }

  return { code: 'unknown', rawMessage: '' };
}

/**
 * Translates Firebase Auth, Firestore, and generic runtime errors into user-friendly
 * messages and actionable retry/auth flags.
 */
export function humanizeCloudError(err: unknown): HumanizedCloudError {
  const { code, rawMessage } = extractErrorCodeAndMessage(err);
  const lookupCode = code.toLowerCase().replace(/^firestore\//, '');
  const descriptor = CLOUD_ERROR_MAP[lookupCode];

  return {
    code,
    message: descriptor?.message ?? (rawMessage || 'An unexpected cloud error occurred.'),
    isQuotaOrRateLimit: descriptor?.isQuotaOrRateLimit ?? false,
    isOffline: descriptor?.isOffline ?? false,
    requiresRecentLogin: descriptor?.requiresRecentLogin ?? false,
  };
}
