import {
  createUserWithEmailAndPassword as fbCreateUserWithEmailAndPassword,
  deleteUser as fbDeleteUser,
  EmailAuthProvider,
  getIdToken as fbGetIdToken,
  GoogleAuthProvider,
  onAuthStateChanged as fbOnAuthStateChanged,
  reauthenticateWithCredential as fbReauthenticateWithCredential,
  reauthenticateWithPopup as fbReauthenticateWithPopup,
  reload as fbReload,
  sendEmailVerification as fbSendEmailVerification,
  sendPasswordResetEmail as fbSendPasswordResetEmail,
  signInWithEmailAndPassword as fbSignInWithEmailAndPassword,
  signInWithPopup as fbSignInWithPopup,
  signOut as fbSignOut,
  updateProfile as fbUpdateProfile,
  type Auth,
  type AuthCredential,
  type AuthProvider,
  type Unsubscribe,
  type User,
  type UserCredential,
} from 'firebase/auth';
import {
  collection as fbCollection,
  deleteDoc as fbDeleteDoc,
  doc as fbDoc,
  getDoc as fbGetDoc,
  getDocs as fbGetDocs,
  orderBy as fbOrderBy,
  query as fbQuery,
  runTransaction as fbRunTransaction,
  setDoc as fbSetDoc,
  where as fbWhere,
  writeBatch as fbWriteBatch,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Query,
  type QueryConstraint,
  type QuerySnapshot,
  type Transaction,
  type WriteBatch,
} from 'firebase/firestore';
import type { ManaColor } from '../types/card.js';
import type {
  CardListEntry,
  CardListType,
  CloudCardListRecord,
  CloudDeckRecord,
  CloudProvider,
  CloudUser,
  DeckVisibility,
  FriendDeckSummary,
  FriendshipRecord,
  FriendshipStatus,
  PushResult,
  UserProfile,
} from '../types/cloud.js';
import { getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from './firebaseConfig.js';
import {
  getUtf8ByteLength,
  humanizeCloudError,
  makeFriendPairId,
  normalizeHandle,
  sanitizeCardListPayloadForCloud,
  sanitizeDeckPayloadForCloud,
  validateEmail,
  validateHandle,
  validatePassword,
  type HumanizedCloudError,
} from './validation.js';

export const PENDING_HANDLE_STORAGE_PREFIX = 'mtg_pending_handle_';

const MAX_FRIEND_CATALOG_DECKS = 200;
const MAX_SYNERGY_THEMES = 20;
const MAX_SHARED_WITH_UIDS = 50;
const MAX_DELETE_BATCH_OPS = 450;
const VALID_MANA_COLORS = new Set<ManaColor>(['W', 'U', 'B', 'R', 'G']);
const VALID_VISIBILITIES = new Set<DeckVisibility>(['private', 'friends', 'link', 'public']);
const VALID_LIST_TYPES = new Set<CardListType>([
  'collection',
  'wishlist',
  'trade',
  'synergy-package',
]);

/**
 * Error subclass preserving structured `HumanizedCloudError` metadata alongside a user-friendly message.
 */
export class CloudProviderError extends Error {
  readonly code: string;
  readonly isQuotaOrRateLimit: boolean;
  readonly isOffline: boolean;
  readonly requiresRecentLogin: boolean;

  constructor(humanized: HumanizedCloudError, cause?: unknown) {
    super(humanized.message, cause !== undefined ? { cause } : undefined);
    this.name = 'CloudProviderError';
    this.code = humanized.code;
    this.isQuotaOrRateLimit = humanized.isQuotaOrRateLimit;
    this.isOffline = humanized.isOffline;
    this.requiresRecentLogin = humanized.requiresRecentLogin;
  }
}

export interface FirebaseAuthOps {
  onAuthStateChanged: (auth: Auth, cb: (user: User | null) => void) => Unsubscribe;
  createUserWithEmailAndPassword: (
    auth: Auth,
    email: string,
    password: string,
  ) => Promise<UserCredential>;
  signInWithEmailAndPassword: (
    auth: Auth,
    email: string,
    password: string,
  ) => Promise<UserCredential>;
  signInWithPopup: (auth: Auth, provider: AuthProvider) => Promise<UserCredential>;
  createGoogleAuthProvider: () => AuthProvider;
  createEmailCredential: (email: string, password: string) => AuthCredential;
  updateProfile: (user: User, profile: { displayName?: string | null }) => Promise<void>;
  sendEmailVerification: (user: User) => Promise<void>;
  reload: (user: User) => Promise<void>;
  getIdToken: (user: User, forceRefresh?: boolean) => Promise<string>;
  sendPasswordResetEmail: (auth: Auth, email: string) => Promise<void>;
  signOut: (auth: Auth) => Promise<void>;
  reauthenticateWithCredential: (user: User, credential: AuthCredential) => Promise<UserCredential>;
  reauthenticateWithPopup: (user: User, provider: AuthProvider) => Promise<UserCredential>;
  deleteUser: (user: User) => Promise<void>;
}

export interface FirebaseFirestoreOps {
  collection: (db: Firestore, path: string, ...pathSegments: string[]) => CollectionReference<DocumentData>;
  doc: (db: Firestore, path: string, ...pathSegments: string[]) => DocumentReference<DocumentData>;
  getDoc: (ref: DocumentReference<DocumentData>) => Promise<DocumentSnapshot<DocumentData>>;
  setDoc: (ref: DocumentReference<DocumentData>, data: DocumentData) => Promise<void>;
  deleteDoc: (ref: DocumentReference<DocumentData>) => Promise<void>;
  getDocs: (q: Query<DocumentData>) => Promise<QuerySnapshot<DocumentData>>;
  query: (q: Query<DocumentData>, ...constraints: QueryConstraint[]) => Query<DocumentData>;
  where: (
    fieldPath: string,
    opStr: '==' | '>' | '<' | '>=' | '<=' | 'array-contains',
    value: unknown,
  ) => QueryConstraint;
  orderBy: (fieldPath: string, directionStr?: 'asc' | 'desc') => QueryConstraint;
  runTransaction: <T>(
    db: Firestore,
    updateFunction: (transaction: Transaction) => Promise<T>,
  ) => Promise<T>;
  writeBatch: (db: Firestore) => WriteBatch;
}

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export interface FirebaseProviderDeps {
  isConfigured?: () => boolean;
  getAuth?: () => Auth | null;
  getDb?: () => Firestore | null;
  authOps?: Partial<FirebaseAuthOps>;
  firestoreOps?: Partial<FirebaseFirestoreOps>;
  storage?: StorageLike | null;
}

interface ResolvedProviderDeps {
  isConfigured: () => boolean;
  getAuth: () => Auth | null;
  getDb: () => Firestore | null;
  authOps: FirebaseAuthOps;
  firestoreOps: FirebaseFirestoreOps;
  storage?: StorageLike | null;
}

const DEFAULT_AUTH_OPS: FirebaseAuthOps = {
  onAuthStateChanged: (auth, cb) => fbOnAuthStateChanged(auth, cb),
  createUserWithEmailAndPassword: (auth, email, password) =>
    fbCreateUserWithEmailAndPassword(auth, email, password),
  signInWithEmailAndPassword: (auth, email, password) =>
    fbSignInWithEmailAndPassword(auth, email, password),
  signInWithPopup: (auth, provider) => fbSignInWithPopup(auth, provider),
  createGoogleAuthProvider: () => new GoogleAuthProvider(),
  createEmailCredential: (email, password) => EmailAuthProvider.credential(email, password),
  updateProfile: (user, profile) => fbUpdateProfile(user, profile),
  sendEmailVerification: (user) => fbSendEmailVerification(user),
  reload: (user) => (typeof user.reload === 'function' ? user.reload() : fbReload(user)),
  getIdToken: (user, forceRefresh) =>
    typeof user.getIdToken === 'function'
      ? user.getIdToken(forceRefresh)
      : fbGetIdToken(user, forceRefresh),
  sendPasswordResetEmail: (auth, email) => fbSendPasswordResetEmail(auth, email),
  signOut: (auth) => fbSignOut(auth),
  reauthenticateWithCredential: (user, credential) =>
    fbReauthenticateWithCredential(user, credential),
  reauthenticateWithPopup: (user, provider) => fbReauthenticateWithPopup(user, provider),
  deleteUser: (user) => fbDeleteUser(user),
};

const DEFAULT_FIRESTORE_OPS: FirebaseFirestoreOps = {
  collection: (db, path, ...segments) => fbCollection(db, path, ...segments),
  doc: (db, path, ...segments) => fbDoc(db, path, ...segments),
  getDoc: (ref) => fbGetDoc(ref),
  setDoc: (ref, data) => fbSetDoc(ref, data),
  deleteDoc: (ref) => fbDeleteDoc(ref),
  getDocs: (q) => fbGetDocs(q),
  query: (q, ...constraints) => fbQuery(q, ...constraints),
  where: (fieldPath, opStr, value) => fbWhere(fieldPath, opStr, value),
  orderBy: (fieldPath, directionStr) => fbOrderBy(fieldPath, directionStr),
  runTransaction: (db, updateFunction) => fbRunTransaction(db, updateFunction),
  writeBatch: (db) => fbWriteBatch(db),
};

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Ignore storage access failures in restricted browser modes.
  }
  return null;
}

export function getPendingHandleStorageKey(uid: string): string {
  return `${PENDING_HANDLE_STORAGE_PREFIX}${uid}`;
}

export function readPendingHandleFromStorage(
  uid: string,
  storage: StorageLike | null = getDefaultStorage(),
): string | null {
  if (!uid || !storage) return null;
  try {
    const raw = storage.getItem(getPendingHandleStorageKey(uid));
    if (!raw) return null;
    const check = validateHandle(raw);
    return check.valid ? check.normalized : null;
  } catch {
    return null;
  }
}

export function savePendingHandleToStorage(
  uid: string,
  handle: string,
  storage: StorageLike | null = getDefaultStorage(),
): void {
  if (!uid || !storage) return;
  const check = validateHandle(handle);
  if (!check.valid) return;
  try {
    storage.setItem(getPendingHandleStorageKey(uid), check.normalized);
  } catch {
    // Ignore storage quota / privacy mode errors.
  }
}

export function clearPendingHandleFromStorage(
  uid: string,
  storage: StorageLike | null = getDefaultStorage(),
): void {
  if (!uid || !storage) return;
  try {
    storage.removeItem(getPendingHandleStorageKey(uid));
  } catch {
    // Ignore storage errors.
  }
}

function toCloudError(err: unknown): CloudProviderError {
  if (err instanceof CloudProviderError) {
    return err;
  }
  return new CloudProviderError(humanizeCloudError(err), err);
}

/**
 * Recursively removes `undefined` properties from plain objects and arrays before writing to Firestore.
 */
function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined).map((item) => stripUndefinedDeep(item)) as T;
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry !== undefined) {
        result[key] = stripUndefinedDeep(entry);
      }
    }
    return result as T;
  }
  return value;
}

function clampTextForRules(value: string, maxChars: number, maxUtf8Bytes: number): string {
  let trimmed = value.trim();
  if (trimmed.length > maxChars) {
    let end = maxChars;
    const trailing = trimmed.charCodeAt(end - 1);
    if (trailing >= 0xd800 && trailing <= 0xdbff) {
      end -= 1;
    }
    trimmed = trimmed.slice(0, end);
  }

  while (trimmed.length > 0 && getUtf8ByteLength(trimmed) > maxUtf8Bytes) {
    let end = trimmed.length - 1;
    const trailing = trimmed.charCodeAt(end - 1);
    if (trailing >= 0xd800 && trailing <= 0xdbff) {
      end -= 1;
    }
    trimmed = trimmed.slice(0, Math.max(0, end));
  }
  return trimmed;
}

function ensureTimestampString(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length >= 10 && trimmed.length <= 40) {
      return trimmed;
    }
  }
  return fallback;
}

function clampOwnerHandle(rawHandle: string | undefined): string {
  const normalized = normalizeHandle(rawHandle ?? '');
  const candidate = normalized || 'player';
  return clampTextForRules(candidate, 24, 96) || 'player';
}

function preparePushMetadata(
  record: {
    id: string;
    ownerUid: string;
    ownerHandle?: string;
    createdAt?: string;
    updatedAt?: string;
    deletedAt?: string | null;
  },
  expectedRevision: number,
  label: string,
) {
  const cleanId = typeof record.id === 'string' ? record.id.trim() : '';
  if (!cleanId || cleanId.includes('/') || cleanId.length > 128) {
    throw new Error(`Invalid ${label} ID.`);
  }
  const cleanOwnerUid = typeof record.ownerUid === 'string' ? record.ownerUid.trim() : '';
  if (!cleanOwnerUid || cleanOwnerUid.includes('/')) {
    throw new Error(`Owner user ID is required to push ${label}.`);
  }

  const nowIso = new Date().toISOString();
  const cleanExpected = Math.max(0, Math.floor(expectedRevision));
  const nextRevision = cleanExpected + 1;
  const ownerHandle = clampOwnerHandle(record.ownerHandle);
  const createdAt = ensureTimestampString(record.createdAt, nowIso);
  const candidateUpdated = record.updatedAt ? ensureTimestampString(record.updatedAt, nowIso) : nowIso;
  const updatedAt = candidateUpdated > nowIso ? candidateUpdated : nowIso;
  const deletedAt = record.deletedAt ? ensureTimestampString(record.deletedAt, nowIso) : null;

  return {
    cleanId,
    cleanOwnerUid,
    nowIso,
    cleanExpected,
    nextRevision,
    ownerHandle,
    createdAt,
    updatedAt,
    deletedAt,
  };
}

function sanitizeStringArray(value: unknown, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const clean = item.trim();
    if (!clean) continue;
    deduped.add(clean);
    if (deduped.size >= maxLen) break;
  }
  return Array.from(deduped);
}

function sanitizeColorIdentity(value: unknown): ManaColor[] {
  if (!Array.isArray(value)) return [];
  const colors: ManaColor[] = [];
  for (const item of value) {
    if (typeof item === 'string' && VALID_MANA_COLORS.has(item as ManaColor)) {
      const color = item as ManaColor;
      if (!colors.includes(color)) {
        colors.push(color);
      }
    }
  }
  return colors.slice(0, 5);
}

function sanitizeNumberMap(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      out[k] = Math.floor(v);
    }
  }
  return out;
}

function sanitizeCardListEntryMap(raw: unknown): Record<string, CardListEntry> {
  const out: Record<string, CardListEntry> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const entry = v as Record<string, unknown>;
    const quantity =
      typeof entry.quantity === 'number' && Number.isFinite(entry.quantity)
        ? Math.max(0, Math.floor(entry.quantity))
        : 0;
    const clean: CardListEntry = { quantity };
    if (typeof entry.foilQuantity === 'number' && entry.foilQuantity > 0) {
      clean.foilQuantity = Math.floor(entry.foilQuantity);
    }
    if (typeof entry.forTradeQuantity === 'number' && entry.forTradeQuantity > 0) {
      clean.forTradeQuantity = Math.floor(entry.forTradeQuantity);
    }
    if (typeof entry.note === 'string' && entry.note.trim()) {
      clean.note = entry.note.trim();
    }
    out[k] = clean;
  }
  return out;
}

function mapFirebaseUser(user: User | null, displayNameFallback?: string): CloudUser | null {
  if (!user) return null;
  const providerIds = Array.isArray(user.providerData)
    ? user.providerData
        .map((info) => info?.providerId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];

  return {
    uid: user.uid,
    email: user.email ?? null,
    emailVerified: Boolean(user.emailVerified),
    displayName: user.displayName ?? displayNameFallback ?? null,
    providerIds,
  };
}

function mapDocToProfile(uid: string, data: DocumentData): UserProfile {
  const now = new Date().toISOString();
  const handle = typeof data.handle === 'string' ? data.handle : '';
  const handleLower =
    typeof data.handleLower === 'string' ? data.handleLower : normalizeHandle(handle);

  return {
    uid: typeof data.uid === 'string' ? data.uid : uid,
    handle,
    handleLower,
    displayName: typeof data.displayName === 'string' && data.displayName ? data.displayName : handle,
    avatarCommanderId:
      typeof data.avatarCommanderId === 'string' ? data.avatarCommanderId : null,
    createdAt: ensureTimestampString(data.createdAt, now),
    updatedAt: ensureTimestampString(data.updatedAt, now),
  };
}

function mapDocToCloudDeck(id: string, data: DocumentData): CloudDeckRecord {
  const now = new Date().toISOString();
  const visibility: DeckVisibility =
    typeof data.visibility === 'string' && VALID_VISIBILITIES.has(data.visibility as DeckVisibility)
      ? (data.visibility as DeckVisibility)
      : 'private';

  const record: CloudDeckRecord = {
    id: typeof data.id === 'string' ? data.id : id,
    ownerUid: typeof data.ownerUid === 'string' ? data.ownerUid : '',
    ownerHandle: typeof data.ownerHandle === 'string' ? data.ownerHandle : '',
    name: typeof data.name === 'string' && data.name ? data.name : 'Untitled Commander Deck',
    ...(typeof data.description === 'string' ? { description: data.description } : {}),
    commanderOracleIds: sanitizeStringArray(data.commanderOracleIds, 2),
    colorIdentity: sanitizeColorIdentity(data.colorIdentity),
    mainboard: sanitizeNumberMap(data.mainboard),
    sideboard: sanitizeNumberMap(data.sideboard),
    synergyThemes: sanitizeStringArray(data.synergyThemes, MAX_SYNERGY_THEMES),
    cardCount:
      typeof data.cardCount === 'number' && Number.isFinite(data.cardCount)
        ? Math.max(0, Math.floor(data.cardCount))
        : 0,
    lockSearchToCommanderIdentity:
      typeof data.lockSearchToCommanderIdentity === 'boolean'
        ? data.lockSearchToCommanderIdentity
        : true,
    visibility,
    sharedWithUids: sanitizeStringArray(data.sharedWithUids, MAX_SHARED_WITH_UIDS),
    revision:
      typeof data.revision === 'number' && Number.isFinite(data.revision) && data.revision >= 1
        ? Math.floor(data.revision)
        : 1,
    createdAt: ensureTimestampString(data.createdAt, now),
    updatedAt: ensureTimestampString(data.updatedAt, now),
    deletedAt: typeof data.deletedAt === 'string' ? data.deletedAt : null,
  };

  return record;
}

function mapDocToCloudCardList(id: string, data: DocumentData): CloudCardListRecord {
  const now = new Date().toISOString();
  const visibility: DeckVisibility =
    typeof data.visibility === 'string' && VALID_VISIBILITIES.has(data.visibility as DeckVisibility)
      ? (data.visibility as DeckVisibility)
      : 'private';
  const listType: CardListType =
    typeof data.listType === 'string' && VALID_LIST_TYPES.has(data.listType as CardListType)
      ? (data.listType as CardListType)
      : 'collection';

  return {
    id: typeof data.id === 'string' ? data.id : id,
    ownerUid: typeof data.ownerUid === 'string' ? data.ownerUid : '',
    ownerHandle: typeof data.ownerHandle === 'string' ? data.ownerHandle : '',
    name: typeof data.name === 'string' && data.name ? data.name : 'Untitled Card List',
    ...(typeof data.description === 'string' ? { description: data.description } : {}),
    listType,
    entries: sanitizeCardListEntryMap(data.entries),
    visibility,
    sharedWithUids: sanitizeStringArray(data.sharedWithUids, MAX_SHARED_WITH_UIDS),
    revision:
      typeof data.revision === 'number' && Number.isFinite(data.revision) && data.revision >= 1
        ? Math.floor(data.revision)
        : 1,
    createdAt: ensureTimestampString(data.createdAt, now),
    updatedAt: ensureTimestampString(data.updatedAt, now),
    deletedAt: typeof data.deletedAt === 'string' ? data.deletedAt : null,
  };
}

function mapDocToFriendship(id: string, data: DocumentData): FriendshipRecord {
  const now = new Date().toISOString();
  const rawUsers = Array.isArray(data.users)
    ? data.users.filter((u): u is string => typeof u === 'string')
    : [];
  const users: [string, string] = [rawUsers[0] ?? '', rawUsers[1] ?? ''];
  const status: FriendshipStatus = data.status === 'accepted' ? 'accepted' : 'pending';

  const userHandles: Record<string, string> = {};
  if (data.userHandles && typeof data.userHandles === 'object') {
    for (const [uid, handle] of Object.entries(data.userHandles as Record<string, unknown>)) {
      if (typeof handle === 'string') {
        userHandles[uid] = handle;
      }
    }
  }

  return {
    id: typeof data.id === 'string' ? data.id : id,
    users,
    requestedBy: typeof data.requestedBy === 'string' ? data.requestedBy : '',
    userHandles,
    status,
    createdAt: ensureTimestampString(data.createdAt, now),
    updatedAt: ensureTimestampString(data.updatedAt, now),
  };
}

function mapFriendDeckSummary(raw: unknown): FriendDeckSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.id !== 'string' || !item.id || typeof item.ownerUid !== 'string') {
    return null;
  }

  const visibility: DeckVisibility =
    typeof item.visibility === 'string' && VALID_VISIBILITIES.has(item.visibility as DeckVisibility)
      ? (item.visibility as DeckVisibility)
      : 'friends';

  return stripUndefinedDeep({
    id: item.id,
    ownerUid: item.ownerUid,
    ownerHandle: typeof item.ownerHandle === 'string' ? item.ownerHandle : '',
    name: typeof item.name === 'string' && item.name ? item.name : 'Untitled Commander Deck',
    ...(typeof item.description === 'string' && item.description
      ? { description: item.description }
      : {}),
    commanderOracleIds: sanitizeStringArray(item.commanderOracleIds, 2),
    colorIdentity: sanitizeColorIdentity(item.colorIdentity),
    synergyThemes: sanitizeStringArray(item.synergyThemes, MAX_SYNERGY_THEMES),
    cardCount:
      typeof item.cardCount === 'number' && Number.isFinite(item.cardCount)
        ? Math.max(0, Math.floor(item.cardCount))
        : 0,
    visibility,
    updatedAt: ensureTimestampString(item.updatedAt, new Date().toISOString()),
  });
}

function buildFriendDeckSummary(deck: CloudDeckRecord): FriendDeckSummary {
  return stripUndefinedDeep({
    id: deck.id,
    ownerUid: deck.ownerUid,
    ownerHandle: deck.ownerHandle,
    name: deck.name,
    ...(deck.description ? { description: clampTextForRules(deck.description, 280, 1000) } : {}),
    commanderOracleIds: [...deck.commanderOracleIds],
    colorIdentity: [...deck.colorIdentity],
    synergyThemes: [...deck.synergyThemes],
    cardCount: deck.cardCount,
    visibility: deck.visibility,
    updatedAt: deck.updatedAt,
  });
}

function rebuildFriendCatalogDecks(
  existingCatalogData: DocumentData | undefined,
  nextDeck: CloudDeckRecord,
): FriendDeckSummary[] {
  const existingDecksRaw = Array.isArray(existingCatalogData?.decks)
    ? existingCatalogData.decks
    : [];

  const filtered = existingDecksRaw
    .map(mapFriendDeckSummary)
    .filter((entry): entry is FriendDeckSummary => entry !== null && entry.id !== nextDeck.id);

  const isCatalogVisible =
    !nextDeck.deletedAt && (nextDeck.visibility === 'friends' || nextDeck.visibility === 'public');

  if (isCatalogVisible) {
    filtered.push(buildFriendDeckSummary(nextDeck));
  }

  return filtered
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_FRIEND_CATALOG_DECKS);
}

/**
 * Firebase Auth + Cloud Firestore implementation of `CloudProvider`, aligned strictly
 * with `firestore.rules` and `firestore.indexes.json`.
 */
export class FirebaseCloudProvider implements CloudProvider {
  private readonly deps: ResolvedProviderDeps;

  constructor(deps: FirebaseProviderDeps = {}) {
    this.deps = {
      isConfigured: deps.isConfigured ?? isFirebaseConfigured,
      getAuth: deps.getAuth ?? getFirebaseAuth,
      getDb: deps.getDb ?? getFirebaseDb,
      authOps: { ...DEFAULT_AUTH_OPS, ...deps.authOps },
      firestoreOps: { ...DEFAULT_FIRESTORE_OPS, ...deps.firestoreOps },
      storage: deps.storage,
    };
  }

  private getStorage(): StorageLike | null {
    return this.deps.storage !== undefined ? this.deps.storage : getDefaultStorage();
  }

  private requireAuth(): Auth {
    if (!this.deps.isConfigured()) {
      throw new Error('Cloud sync is not configured in this build.');
    }
    const auth = this.deps.getAuth();
    if (!auth) {
      throw new Error('Firebase Authentication is unavailable.');
    }
    return auth;
  }

  private requireDb(): Firestore {
    if (!this.deps.isConfigured()) {
      throw new Error('Cloud sync is not configured in this build.');
    }
    const db = this.deps.getDb();
    if (!db) {
      throw new Error('Cloud Firestore is unavailable.');
    }
    return db;
  }

  isConfigured(): boolean {
    return this.deps.isConfigured();
  }

  onAuthStateChanged(cb: (user: CloudUser | null) => void): () => void {
    if (!this.isConfigured()) {
      cb(null);
      return () => {};
    }
    const auth = this.deps.getAuth();
    if (!auth) {
      cb(null);
      return () => {};
    }
    return this.deps.authOps.onAuthStateChanged(auth, (fbUser) => {
      cb(mapFirebaseUser(fbUser));
    });
  }

  async signUpWithEmail(email: string, password: string, handle: string): Promise<CloudUser> {
    const auth = this.requireAuth();

    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) {
      throw new Error(emailCheck.error ?? 'Please enter a valid email address.');
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      throw new Error(passwordCheck.error ?? 'Password does not meet requirements.');
    }

    const handleCheck = validateHandle(handle);
    if (!handleCheck.valid) {
      throw new Error(handleCheck.error ?? 'Please choose a valid public handle.');
    }

    try {
      const cred = await this.deps.authOps.createUserWithEmailAndPassword(
        auth,
        emailCheck.normalized,
        password,
      );
      await this.deps.authOps.updateProfile(cred.user, {
        displayName: handleCheck.normalized,
      });
      savePendingHandleToStorage(cred.user.uid, handleCheck.normalized, this.getStorage());
      await this.deps.authOps.sendEmailVerification(cred.user);

      // Never write to Firestore before email verification because firestore.rules requires isVerified().
      return mapFirebaseUser(cred.user, handleCheck.normalized)!;
    } catch (err) {
      throw toCloudError(err);
    }
  }

  async signInWithEmail(email: string, password: string): Promise<CloudUser> {
    const auth = this.requireAuth();
    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) {
      throw new Error(emailCheck.error ?? 'Please enter a valid email address.');
    }
    if (!password) {
      throw new Error('Password is required.');
    }

    try {
      const cred = await this.deps.authOps.signInWithEmailAndPassword(
        auth,
        emailCheck.normalized,
        password,
      );
      return mapFirebaseUser(cred.user)!;
    } catch (err) {
      throw toCloudError(err);
    }
  }

  async signInWithGoogle(): Promise<CloudUser> {
    const auth = this.requireAuth();
    try {
      const provider = this.deps.authOps.createGoogleAuthProvider();
      const cred = await this.deps.authOps.signInWithPopup(auth, provider);
      return mapFirebaseUser(cred.user)!;
    } catch (err) {
      throw toCloudError(err);
    }
  }

  async resendVerificationEmail(): Promise<void> {
    const auth = this.requireAuth();
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Please sign in first to resend the verification email.');
    }
    if (currentUser.emailVerified) {
      return;
    }
    try {
      await this.deps.authOps.sendEmailVerification(currentUser);
    } catch (err) {
      throw toCloudError(err);
    }
  }

  async reloadUser(): Promise<CloudUser | null> {
    if (!this.isConfigured()) return null;
    const auth = this.deps.getAuth();
    if (!auth || !auth.currentUser) {
      return null;
    }

    try {
      await this.deps.authOps.reload(auth.currentUser);
      // Force JWT refresh so request.auth.token.email_verified propagates immediately to Firestore Rules.
      await this.deps.authOps.getIdToken(auth.currentUser, true);
      return mapFirebaseUser(auth.currentUser);
    } catch (err) {
      throw toCloudError(err);
    }
  }

  async sendPasswordReset(email: string): Promise<void> {
    const auth = this.requireAuth();
    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) {
      throw new Error(emailCheck.error ?? 'Please enter a valid email address.');
    }
    try {
      await this.deps.authOps.sendPasswordResetEmail(auth, emailCheck.normalized);
    } catch (err) {
      throw toCloudError(err);
    }
  }

  async signOut(): Promise<void> {
    if (!this.isConfigured()) return;
    const auth = this.deps.getAuth();
    if (!auth) return;
    const uid = auth.currentUser?.uid;
    try {
      await this.deps.authOps.signOut(auth);
      if (uid) {
        clearPendingHandleFromStorage(uid, this.getStorage());
      }
    } catch (err) {
      throw toCloudError(err);
    }
  }

  async getMyProfile(uid: string): Promise<UserProfile | null> {
    if (!this.isConfigured() || !uid) return null;
    const db = this.deps.getDb();
    if (!db) return null;

    try {
      const snap = await this.deps.firestoreOps.getDoc(
        this.deps.firestoreOps.doc(db, 'profiles', uid),
      );
      if (!snap.exists()) return null;
      return mapDocToProfile(uid, snap.data() ?? {});
    } catch (err) {
      throw toCloudError(err);
    }
  }

  async claimHandle(
    uid: string,
    handle: string,
    displayName?: string,
    avatarCommanderId?: string | null,
  ): Promise<UserProfile> {
    const db = this.requireDb();
    if (!uid) {
      throw new Error('User ID is required to claim a handle.');
    }

    const handleCheck = validateHandle(handle);
    if (!handleCheck.valid) {
      throw new Error(handleCheck.error ?? 'Please choose a valid public handle.');
    }
    const handleLower = handleCheck.normalized;

    try {
      const profile = await this.deps.firestoreOps.runTransaction(db, async (tx) => {
        const profileRef = this.deps.firestoreOps.doc(db, 'profiles', uid);
        const newHandleRef = this.deps.firestoreOps.doc(db, 'handles', handleLower);

        // Read all documents before performing any writes in the transaction.
        const [profileSnap, newHandleSnap] = await Promise.all([
          tx.get(profileRef),
          tx.get(newHandleRef),
        ]);

        if (newHandleSnap.exists()) {
          const existingOwner = newHandleSnap.data()?.uid;
          if (typeof existingOwner === 'string' && existingOwner !== uid) {
            throw new Error(`Handle @${handleLower} is already taken.`);
          }
        }

        const existingProfileData = profileSnap.exists() ? profileSnap.data() : undefined;
        const oldLower =
          typeof existingProfileData?.handleLower === 'string'
            ? existingProfileData.handleLower.trim().toLowerCase()
            : null;

        let oldHandleRef: DocumentReference<DocumentData> | null = null;
        let oldHandleSnap: DocumentSnapshot<DocumentData> | null = null;
        if (oldLower && !oldLower.includes('/') && oldLower !== handleLower) {
          oldHandleRef = this.deps.firestoreOps.doc(db, 'handles', oldLower);
          oldHandleSnap = await tx.get(oldHandleRef);
        }

        const nowIso = new Date().toISOString();
        const createdAt = ensureTimestampString(existingProfileData?.createdAt, nowIso);
        const rawDisplayName =
          typeof displayName === 'string' && displayName.trim()
            ? displayName.trim()
            : typeof existingProfileData?.displayName === 'string' &&
                existingProfileData.displayName.trim()
              ? existingProfileData.displayName.trim()
              : handleLower;
        const cleanDisplayName = clampTextForRules(rawDisplayName, 60, 240) || handleLower;

        const resolvedAvatarId =
          avatarCommanderId !== undefined
            ? avatarCommanderId
              ? clampTextForRules(avatarCommanderId, 80, 160)
              : null
            : typeof existingProfileData?.avatarCommanderId === 'string'
              ? clampTextForRules(existingProfileData.avatarCommanderId, 80, 160)
              : null;

        if (oldHandleRef && oldHandleSnap?.exists() && oldHandleSnap.data()?.uid === uid) {
          tx.delete(oldHandleRef);
        }

        // /handles allow update: if false in firestore.rules, so only create when doc does not yet exist.
        if (!newHandleSnap.exists()) {
          tx.set(newHandleRef, {
            uid,
            handle: handleLower,
            handleLower,
            createdAt: nowIso,
            updatedAt: nowIso,
          });
        }

        const nextProfile: UserProfile = {
          uid,
          handle: handleLower,
          handleLower,
          displayName: cleanDisplayName,
          avatarCommanderId: resolvedAvatarId,
          createdAt,
          updatedAt: nowIso,
        };

        // Strictly never store email or PII in public /profiles documents.
        tx.set(profileRef, nextProfile);
        return nextProfile;
      });

      clearPendingHandleFromStorage(uid, this.getStorage());
      return profile;
    } catch (err) {
      throw toCloudError(err);
    }
  }

  private async pullOwnedCollectionSince<T>(
    collectionName: 'decks' | 'cardlists',
    uid: string,
    sinceIso: string | null,
    mapper: (id: string, data: DocumentData) => T,
  ): Promise<T[]> {
    if (!this.isConfigured() || !uid) return [];
    const db = this.deps.getDb();
    if (!db) return [];

    try {
      const constraints: QueryConstraint[] = [this.deps.firestoreOps.where('ownerUid', '==', uid)];
      if (sinceIso) {
        constraints.push(
          this.deps.firestoreOps.where('updatedAt', '>', sinceIso),
          this.deps.firestoreOps.orderBy('updatedAt', 'desc'),
        );
      }

      const q = this.deps.firestoreOps.query(
        this.deps.firestoreOps.collection(db, collectionName),
        ...constraints,
      );
      const snap = await this.deps.firestoreOps.getDocs(q);
      return snap.docs.map((docSnap) => mapper(docSnap.id, docSnap.data() ?? {}));
    } catch (err) {
      throw toCloudError(err);
    }
  }

  async pullDecksSince(uid: string, sinceIso: string | null): Promise<CloudDeckRecord[]> {
    return this.pullOwnedCollectionSince('decks', uid, sinceIso, mapDocToCloudDeck);
  }

  async pushDeck(
    deck: CloudDeckRecord,
    expectedRevision: number,
  ): Promise<PushResult<CloudDeckRecord>> {
    const db = this.requireDb();
    const meta = preparePushMetadata(deck, expectedRevision, 'deck');
    const sanitized = sanitizeDeckPayloadForCloud(deck);

    const payloadBase: CloudDeckRecord = stripUndefinedDeep({
      id: meta.cleanId,
      ownerUid: meta.cleanOwnerUid,
      ownerHandle: meta.ownerHandle,
      name: clampTextForRules(sanitized.name, 120, 480) || 'Untitled Commander Deck',
      ...(typeof sanitized.description === 'string'
        ? { description: clampTextForRules(sanitized.description, 2000, 8000) }
        : {}),
      commanderOracleIds: sanitizeStringArray(sanitized.commanderOracleIds, 2),
      colorIdentity: sanitizeColorIdentity(deck.colorIdentity),
      mainboard: sanitized.mainboard,
      sideboard: sanitized.sideboard,
      synergyThemes: sanitizeStringArray(sanitized.synergyThemes, MAX_SYNERGY_THEMES),
      cardCount: Math.min(500, Math.max(0, Math.floor(deck.cardCount ?? 0))),
      lockSearchToCommanderIdentity: Boolean(deck.lockSearchToCommanderIdentity),
      visibility: sanitized.visibility,
      sharedWithUids: sanitizeStringArray(sanitized.sharedWithUids, MAX_SHARED_WITH_UIDS),
      revision: meta.nextRevision,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      deletedAt: meta.deletedAt,
    });

    try {
      return await this.deps.firestoreOps.runTransaction(db, async (tx) => {
        const deckRef = this.deps.firestoreOps.doc(db, 'decks', meta.cleanId);
        const catalogRef = this.deps.firestoreOps.doc(db, 'friendCatalogs', meta.cleanOwnerUid);

        // Read both deck and friendCatalog before performing any writes.
        const [deckSnap, catalogSnap] = await Promise.all([
          tx.get(deckRef),
          tx.get(catalogRef),
        ]);

        if (deckSnap.exists()) {
          const serverRecord = mapDocToCloudDeck(deckSnap.id, deckSnap.data() ?? {});
          if (meta.cleanExpected === 0 || serverRecord.revision !== meta.cleanExpected) {
            return { status: 'conflict', serverRecord } as const;
          }
        }

        const nextDeck: CloudDeckRecord = {
          ...payloadBase,
          createdAt: deckSnap.exists()
            ? ensureTimestampString(deckSnap.data()?.createdAt, meta.createdAt)
            : meta.createdAt,
        };

        const catalogDecks = rebuildFriendCatalogDecks(
          catalogSnap.exists() ? catalogSnap.data() : undefined,
          nextDeck,
        );

        tx.set(deckRef, stripUndefinedDeep(nextDeck));
        tx.set(
          catalogRef,
          stripUndefinedDeep({
            ownerUid: nextDeck.ownerUid,
            ownerHandle: nextDeck.ownerHandle,
            updatedAt: meta.nowIso,
            decks: catalogDecks,
          }),
        );

        return { status: 'synced', record: nextDeck } as const;
      });
    } catch (err) {
      throw toCloudError(err);
    }
  }

  async pullCardListsSince(
    uid: string,
    sinceIso: string | null,
  ): Promise<CloudCardListRecord[]> {
    return this.pullOwnedCollectionSince('cardlists', uid, sinceIso, mapDocToCloudCardList);
  }

  async pushCardList(
    list: CloudCardListRecord,
    expectedRevision: number,
  ): Promise<PushResult<CloudCardListRecord>> {
    const db = this.requireDb();
    const meta = preparePushMetadata(list, expectedRevision, 'card list');
    const sanitized = sanitizeCardListPayloadForCloud(list);

    const payloadBase: CloudCardListRecord = stripUndefinedDeep({
      id: meta.cleanId,
      ownerUid: meta.cleanOwnerUid,
      ownerHandle: meta.ownerHandle,
      name: clampTextForRules(sanitized.name, 120, 480) || 'Untitled Card List',
      ...(typeof sanitized.description === 'string'
        ? { description: clampTextForRules(sanitized.description, 2000, 8000) }
        : {}),
      listType: sanitized.listType,
      entries: sanitized.entries,
      visibility: sanitized.visibility,
      sharedWithUids: sanitizeStringArray(sanitized.sharedWithUids, MAX_SHARED_WITH_UIDS),
      revision: meta.nextRevision,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      deletedAt: meta.deletedAt,
    });

    try {
      return await this.deps.firestoreOps.runTransaction(db, async (tx) => {
        const listRef = this.deps.firestoreOps.doc(db, 'cardlists', meta.cleanId);
        const listSnap = await tx.get(listRef);

        if (listSnap.exists()) {
          const serverRecord = mapDocToCloudCardList(listSnap.id, listSnap.data() ?? {});
          if (meta.cleanExpected === 0 || serverRecord.revision !== meta.cleanExpected) {
            return { status: 'conflict', serverRecord } as const;
          }
        }

        const nextList: CloudCardListRecord = {
          ...payloadBase,
          createdAt: listSnap.exists()
            ? ensureTimestampString(listSnap.data()?.createdAt, meta.createdAt)
            : meta.createdAt,
        };

        tx.set(listRef, stripUndefinedDeep(nextList));
        return { status: 'synced', record: nextList } as const;
      });
    } catch (err) {
      throw toCloudError(err);
    }
  }

  async getSharedDeckById(deckId: string): Promise<CloudDeckRecord | null> {
    if (!this.isConfigured()) return null;
    const cleanId = typeof deckId === 'string' ? deckId.trim() : '';
    if (!cleanId || cleanId.includes('/')) return null;

    const db = this.deps.getDb();
    if (!db) return null;

    try {
      const snap = await this.deps.firestoreOps.getDoc(
        this.deps.firestoreOps.doc(db, 'decks', cleanId),
      );
      if (!snap.exists()) return null;
      const deck = mapDocToCloudDeck(snap.id, snap.data() ?? {});
      if (deck.deletedAt) return null;
      return deck;
    } catch (err) {
      throw toCloudError(err);
    }
  }

  async listFriendships(uid: string): Promise<FriendshipRecord[]> {
    if (!this.isConfigured() || !uid) return [];
    const db = this.deps.getDb();
    if (!db) return [];

    try {
      const q = this.deps.firestoreOps.query(
        this.deps.firestoreOps.collection(db, 'friendships'),
        this.deps.firestoreOps.where('users', 'array-contains', uid),
        this.deps.firestoreOps.orderBy('updatedAt', 'desc'),
      );
      const snap = await this.deps.firestoreOps.getDocs(q);
      return snap.docs.map((docSnap) => mapDocToFriendship(docSnap.id, docSnap.data() ?? {}));
    } catch (err) {
      throw toCloudError(err);
    }
  }

  async sendFriendRequestByHandle(
    fromUid: string,
    fromHandle: string,
    targetHandle: string,
  ): Promise<FriendshipRecord> {
    const db = this.requireDb();
    const cleanFromUid = fromUid.trim();
    if (!cleanFromUid) {
      throw new Error('You must be signed in to send a friend request.');
    }

    const handleCheck = validateHandle(targetHandle);
    if (!handleCheck.valid) {
      throw new Error(handleCheck.error ?? 'Please enter a valid player handle.');
    }
    const targetLower = handleCheck.normalized;

    try {
      const handleSnap = await this.deps.firestoreOps.getDoc(
        this.deps.firestoreOps.doc(db, 'handles', targetLower),
      );
      if (!handleSnap.exists() || typeof handleSnap.data()?.uid !== 'string') {
        throw new Error(`No player found with handle @${targetLower}.`);
      }

      const targetUid = handleSnap.data()!.uid as string;
      if (targetUid === cleanFromUid) {
        throw new Error('You cannot send a friend request to yourself.');
      }

      const resolvedTargetHandle =
        typeof handleSnap.data()?.handle === 'string' ? handleSnap.data()!.handle : targetLower;
      const cleanFromHandle = clampOwnerHandle(fromHandle);
      const pairId = makeFriendPairId(cleanFromUid, targetUid);
      const sortedUsers: [string, string] =
        cleanFromUid < targetUid ? [cleanFromUid, targetUid] : [targetUid, cleanFromUid];

      // Query existing friendships via `array-contains` (allowed even when pair doc does not exist,
      // whereas getDoc on a missing /friendships/{pairId} fails firestore.rules `resource.data.users`).
      const existingList = await this.listFriendships(cleanFromUid);
      const existing = existingList.find((item) => item.id === pairId);
      if (existing) {
        if (existing.status === 'accepted') {
          throw new Error(`You are already friends with @${resolvedTargetHandle}.`);
        }
        if (existing.requestedBy === cleanFromUid) {
          throw new Error(`Friend request to @${resolvedTargetHandle} is already pending.`);
        }
        throw new Error(
          `@${resolvedTargetHandle} has already sent you a friend request. Check your incoming requests.`,
        );
      }

      const nowIso = new Date().toISOString();
      const record: FriendshipRecord = {
        id: pairId,
        users: sortedUsers,
        requestedBy: cleanFromUid,
        userHandles: {
          [cleanFromUid]: cleanFromHandle,
          [targetUid]: resolvedTargetHandle,
        },
        status: 'pending',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await this.deps.firestoreOps.setDoc(
        this.deps.firestoreOps.doc(db, 'friendships', pairId),
        record,
      );
      return record;
    } catch (err) {
      throw toCloudError(err);
    }
  }

  async acceptFriendRequest(pairId: string, acceptorUid: string): Promise<void> {
    const db = this.requireDb();
    if (!pairId || !acceptorUid) {
      throw new Error('Friendship ID and user ID are required.');
    }

    try {
      await this.deps.firestoreOps.runTransaction(db, async (tx) => {
        const ref = this.deps.firestoreOps.doc(db, 'friendships', pairId);
        const snap = await tx.get(ref);
        if (!snap.exists()) {
          throw new Error('Friend request could not be found.');
        }

        const data = snap.data() ?? {};
        const users = Array.isArray(data.users) ? data.users : [];
        if (!users.includes(acceptorUid)) {
          throw new Error('You do not have permission to accept this friend request.');
        }
        if (data.requestedBy === acceptorUid) {
          throw new Error('You cannot accept your own outgoing friend request.');
        }
        if (data.status === 'accepted') {
          return;
        }
        if (data.status !== 'pending') {
          throw new Error('This friend request is no longer pending.');
        }

        const nowIso = new Date().toISOString();
        tx.update(ref, {
          status: 'accepted',
          updatedAt: nowIso,
        });
      });
    } catch (err) {
      throw toCloudError(err);
    }
  }

  async removeFriendship(pairId: string): Promise<void> {
    const db = this.requireDb();
    if (!pairId) {
      throw new Error('Friendship ID is required.');
    }
    try {
      await this.deps.firestoreOps.deleteDoc(this.deps.firestoreOps.doc(db, 'friendships', pairId));
    } catch (err) {
      throw toCloudError(err);
    }
  }

  async getFriendDecks(friendUid: string): Promise<FriendDeckSummary[]> {
    if (!this.isConfigured() || !friendUid) return [];
    const db = this.deps.getDb();
    if (!db) return [];

    try {
      const snap = await this.deps.firestoreOps.getDoc(
        this.deps.firestoreOps.doc(db, 'friendCatalogs', friendUid),
      );
      if (!snap.exists()) return [];
      const data = snap.data() ?? {};
      if (!Array.isArray(data.decks)) return [];
      return data.decks
        .map(mapFriendDeckSummary)
        .filter((entry): entry is FriendDeckSummary => entry !== null);
    } catch (err) {
      throw toCloudError(err);
    }
  }

  private async commitBatchDeletes(
    db: Firestore,
    refs: readonly DocumentReference<DocumentData>[],
  ): Promise<void> {
    for (let i = 0; i < refs.length; i += MAX_DELETE_BATCH_OPS) {
      const chunk = refs.slice(i, i + MAX_DELETE_BATCH_OPS);
      const batch = this.deps.firestoreOps.writeBatch(db);
      for (const ref of chunk) {
        batch.delete(ref);
      }
      await batch.commit();
    }
  }

  async deleteAccountAndData(uid: string, reauthPassword?: string): Promise<void> {
    const auth = this.requireAuth();
    const db = this.requireDb();
    const currentUser = auth.currentUser;

    if (!currentUser || currentUser.uid !== uid) {
      throw new Error('You must be signed in as this account to delete it.');
    }

    const providerIds = Array.isArray(currentUser.providerData)
      ? currentUser.providerData
          .map((info) => info?.providerId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];
    const hasPasswordProvider = providerIds.includes('password');
    const hasGoogleProvider = providerIds.includes('google.com');

    try {
      // Re-authenticate BEFORE deleting any Firestore data so `auth/requires-recent-login`
      // or a cancelled popup never wipes cloud documents while leaving the Auth account intact.
      if (typeof reauthPassword === 'string' && reauthPassword.length > 0) {
        if (!currentUser.email) {
          throw new Error('Cannot verify password because this account has no email address.');
        }
        const credential = this.deps.authOps.createEmailCredential(
          currentUser.email,
          reauthPassword,
        );
        await this.deps.authOps.reauthenticateWithCredential(currentUser, credential);
      } else if (hasGoogleProvider) {
        if (typeof this.deps.authOps.reauthenticateWithPopup !== 'function') {
          throw new CloudProviderError({
            code: 'auth/requires-recent-login',
            message: 'Please sign in again with Google before deleting your account.',
            isQuotaOrRateLimit: false,
            isOffline: false,
            requiresRecentLogin: true,
          });
        }
        const googleProvider = this.deps.authOps.createGoogleAuthProvider();
        await this.deps.authOps.reauthenticateWithPopup(currentUser, googleProvider);
      } else if (hasPasswordProvider) {
        throw new CloudProviderError({
          code: 'auth/requires-recent-login',
          message: 'Please enter your current password to confirm account deletion.',
          isQuotaOrRateLimit: false,
          isOffline: false,
          requiresRecentLogin: true,
        });
      }

      if (currentUser.emailVerified) {
        const profileRef = this.deps.firestoreOps.doc(db, 'profiles', uid);
        const profileSnap = await this.deps.firestoreOps.getDoc(profileRef);
        const handleLower =
          profileSnap.exists() && typeof profileSnap.data()?.handleLower === 'string'
            ? (profileSnap.data()!.handleLower as string)
            : null;

        const [decksSnap, cardListsSnap, friendshipsSnap] = await Promise.all([
          this.deps.firestoreOps.getDocs(
            this.deps.firestoreOps.query(
              this.deps.firestoreOps.collection(db, 'decks'),
              this.deps.firestoreOps.where('ownerUid', '==', uid),
            ),
          ),
          this.deps.firestoreOps.getDocs(
            this.deps.firestoreOps.query(
              this.deps.firestoreOps.collection(db, 'cardlists'),
              this.deps.firestoreOps.where('ownerUid', '==', uid),
            ),
          ),
          this.deps.firestoreOps.getDocs(
            this.deps.firestoreOps.query(
              this.deps.firestoreOps.collection(db, 'friendships'),
              this.deps.firestoreOps.where('users', 'array-contains', uid),
            ),
          ),
        ]);

        const refsToDelete: DocumentReference<DocumentData>[] = [];
        for (const docSnap of decksSnap.docs) refsToDelete.push(docSnap.ref);
        for (const docSnap of cardListsSnap.docs) refsToDelete.push(docSnap.ref);
        for (const docSnap of friendshipsSnap.docs) refsToDelete.push(docSnap.ref);

        if (handleLower) {
          const handleRef = this.deps.firestoreOps.doc(db, 'handles', handleLower);
          const handleSnap = await this.deps.firestoreOps.getDoc(handleRef);
          if (handleSnap.exists() && handleSnap.data()?.uid === uid) {
            refsToDelete.push(handleRef);
          }
        }

        refsToDelete.push(this.deps.firestoreOps.doc(db, 'friendCatalogs', uid));
        refsToDelete.push(profileRef);

        await this.commitBatchDeletes(db, refsToDelete);
      }

      await this.deps.authOps.deleteUser(currentUser);
      clearPendingHandleFromStorage(uid, this.getStorage());
    } catch (err) {
      throw toCloudError(err);
    }
  }
}

/**
 * Factory helper for constructing an isolated `FirebaseCloudProvider` (useful for testing).
 */
export function createFirebaseProvider(deps?: FirebaseProviderDeps): FirebaseCloudProvider {
  return new FirebaseCloudProvider(deps);
}

/**
 * Shared singleton Firebase cloud provider for application hooks and sync orchestration.
 */
export const firebaseProvider = new FirebaseCloudProvider();
