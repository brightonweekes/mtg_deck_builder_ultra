import type { SavedDeckRecord } from '../db/cardDb.js';
import type { ManaColor } from './card.js';

/** Access level controlling who can read a deck or card list in the cloud. */
export type DeckVisibility = 'private' | 'friends' | 'link' | 'public';

/** Local-vs-cloud synchronization state for persisted records. */
export type SyncStatus = 'local' | 'synced' | 'pending' | 'conflict' | 'error';

/** Supported card list categories for binder, wishlist, trade, and package tracking. */
export type CardListType = 'collection' | 'wishlist' | 'trade' | 'synergy-package';

/** Authenticated cloud user identity derived from the auth provider. */
export interface CloudUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  providerIds: string[];
}

/** Public user profile stored in Firestore without private fields such as email. */
export interface UserProfile {
  uid: string;
  handle: string;
  handleLower: string;
  displayName: string;
  avatarCommanderId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Canonical cloud representation of a Commander deck keyed by Scryfall oracle IDs. */
export interface CloudDeckRecord {
  id: string;
  ownerUid: string;
  ownerHandle: string;
  name: string;
  description?: string;
  commanderOracleIds: string[];
  colorIdentity: ManaColor[];
  mainboard: Record<string, number>;
  sideboard: Record<string, number>;
  synergyThemes: string[];
  cardCount: number;
  lockSearchToCommanderIdentity: boolean;
  visibility: DeckVisibility;
  sharedWithUids: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Quantity, foil, trade, and note metadata for a single card within a card list. */
export interface CardListEntry {
  quantity: number;
  foilQuantity?: number;
  forTradeQuantity?: number;
  note?: string;
}

/** Local IndexedDB record representing a user's collection, wishlist, trade list, or synergy package. */
export interface CardListRecord {
  id: string;
  name: string;
  description?: string;
  listType: CardListType;
  entries: Record<string, CardListEntry>;
  visibility: DeckVisibility;
  sharedWithUids?: string[];
  ownerUid?: string | null;
  ownerHandle?: string;
  revision: number;
  syncStatus: SyncStatus;
  cloudUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

/** Canonical cloud representation of a card list with `entries` keyed by `oracleId`. */
export interface CloudCardListRecord {
  id: string;
  ownerUid: string;
  ownerHandle: string;
  name: string;
  description?: string;
  listType: CardListType;
  entries: Record<string, CardListEntry>;
  visibility: DeckVisibility;
  sharedWithUids: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** State of a bidirectional friendship between two users. */
export type FriendshipStatus = 'pending' | 'accepted';

/** Friendship document keyed by deterministic sorted pair ID (`uidA_uidB`). */
export interface FriendshipRecord {
  id: string;
  users: [string, string];
  requestedBy: string;
  userHandles: Record<string, string>;
  status: FriendshipStatus;
  createdAt: string;
  updatedAt: string;
}

/** Lightweight summary of a friend's visible deck from `/friendCatalogs/{ownerUid}`. */
export interface FriendDeckSummary {
  id: string;
  ownerUid: string;
  ownerHandle: string;
  name: string;
  description?: string;
  commanderOracleIds: string[];
  colorIdentity: ManaColor[];
  synergyThemes: string[];
  cardCount: number;
  visibility: DeckVisibility;
  updatedAt: string;
}

/** Optimistic-concurrency conflict recorded when local and cloud revisions diverge. */
export interface SyncConflict {
  kind: 'deck' | 'cardlist';
  id: string;
  localRecord: SavedDeckRecord | CardListRecord;
  cloudRecord: CloudDeckRecord | CloudCardListRecord;
  detectedAt: string;
}

/** Portable JSON backup bundle containing a user's profile, decks, and card lists. */
export interface AccountExportBundle {
  exportedAt: string;
  schemaVersion: 1;
  profile: UserProfile | null;
  decks: SavedDeckRecord[];
  cardlists: CardListRecord[];
}

/** Result of a revision-checked cloud write operation. */
export type PushResult<T> =
  | { status: 'synced'; record: T }
  | { status: 'conflict'; serverRecord: T };

/** Contract implemented by cloud authentication, sync, sharing, and friend providers. */
export interface CloudProvider {
  isConfigured(): boolean;
  onAuthStateChanged(cb: (user: CloudUser | null) => void): () => void;
  signUpWithEmail(email: string, password: string, handle: string): Promise<CloudUser>;
  signInWithEmail(email: string, password: string): Promise<CloudUser>;
  signInWithGoogle(): Promise<CloudUser>;
  resendVerificationEmail(): Promise<void>;
  reloadUser(): Promise<CloudUser | null>;
  sendPasswordReset(email: string): Promise<void>;
  signOut(): Promise<void>;
  getMyProfile(uid: string): Promise<UserProfile | null>;
  claimHandle(
    uid: string,
    handle: string,
    displayName?: string,
    avatarCommanderId?: string | null,
  ): Promise<UserProfile>;
  pullDecksSince(uid: string, sinceIso: string | null): Promise<CloudDeckRecord[]>;
  pushDeck(deck: CloudDeckRecord, expectedRevision: number): Promise<PushResult<CloudDeckRecord>>;
  pullCardListsSince(uid: string, sinceIso: string | null): Promise<CloudCardListRecord[]>;
  pushCardList(
    list: CloudCardListRecord,
    expectedRevision: number,
  ): Promise<PushResult<CloudCardListRecord>>;
  getSharedDeckById(deckId: string): Promise<CloudDeckRecord | null>;
  listFriendships(uid: string): Promise<FriendshipRecord[]>;
  sendFriendRequestByHandle(
    fromUid: string,
    fromHandle: string,
    targetHandle: string,
  ): Promise<FriendshipRecord>;
  acceptFriendRequest(pairId: string, acceptorUid: string): Promise<void>;
  removeFriendship(pairId: string): Promise<void>;
  getFriendDecks(friendUid: string): Promise<FriendDeckSummary[]>;
  deleteAccountAndData(uid: string, reauthPassword?: string): Promise<void>;
}
