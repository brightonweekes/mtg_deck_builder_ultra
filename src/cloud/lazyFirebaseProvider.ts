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
import { validateHandle } from './validation.js';

export const PENDING_HANDLE_STORAGE_PREFIX = 'ripple99_pending_handle_';

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function trimEnv(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

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

/**
 * Returns `true` when all required Firebase client environment variables are configured.
 */
export function isFirebaseConfigured(): boolean {
  const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : undefined;
  return Boolean(
    trimEnv(env?.VITE_FIREBASE_API_KEY) &&
      trimEnv(env?.VITE_FIREBASE_AUTH_DOMAIN) &&
      trimEnv(env?.VITE_FIREBASE_PROJECT_ID) &&
      trimEnv(env?.VITE_FIREBASE_APP_ID),
  );
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

let loadedProvider: CloudProvider | null = null;
let loadingPromise: Promise<CloudProvider> | null = null;

async function loadFirebaseProvider(): Promise<CloudProvider> {
  if (loadedProvider) return loadedProvider;
  if (!loadingPromise) {
    loadingPromise = import('./firebaseProvider.js')
      .then((mod) => {
        loadedProvider = mod.firebaseProvider;
        return loadedProvider;
      })
      .catch((err) => {
        loadingPromise = null;
        throw err;
      });
  }
  return loadingPromise;
}

function withProvider<T>(fn: (provider: CloudProvider) => Promise<T>): Promise<T> {
  return loadFirebaseProvider().then(fn);
}

/**
 * Lazy CloudProvider wrapper that keeps the Firebase SDK out of the initial app bundle
 * until cloud authentication, sync, or friend sharing is actually activated.
 */
export const lazyFirebaseProvider: CloudProvider = {
  isConfigured(): boolean {
    return isFirebaseConfigured();
  },

  onAuthStateChanged(cb: (user: CloudUser | null) => void): () => void {
    if (!isFirebaseConfigured()) {
      cb(null);
      return () => {};
    }
    if (loadedProvider) {
      return loadedProvider.onAuthStateChanged(cb);
    }

    let disposed = false;
    let innerUnsub: (() => void) | null = null;

    void loadFirebaseProvider()
      .then((provider) => {
        if (disposed) return;
        innerUnsub = provider.onAuthStateChanged(cb);
      })
      .catch(() => {
        if (!disposed) {
          cb(null);
        }
      });

    return () => {
      disposed = true;
      if (innerUnsub) {
        innerUnsub();
        innerUnsub = null;
      }
    };
  },

  signUpWithEmail(email: string, password: string, handle: string): Promise<CloudUser> {
    return withProvider((p) => p.signUpWithEmail(email, password, handle));
  },

  signInWithEmail(email: string, password: string): Promise<CloudUser> {
    return withProvider((p) => p.signInWithEmail(email, password));
  },

  signInWithGoogle(): Promise<CloudUser> {
    return withProvider((p) => p.signInWithGoogle());
  },

  resendVerificationEmail(): Promise<void> {
    return withProvider((p) => p.resendVerificationEmail());
  },

  reloadUser(): Promise<CloudUser | null> {
    return withProvider((p) => p.reloadUser());
  },

  sendPasswordReset(email: string): Promise<void> {
    return withProvider((p) => p.sendPasswordReset(email));
  },

  signOut(): Promise<void> {
    return withProvider((p) => p.signOut());
  },

  getMyProfile(uid: string): Promise<UserProfile | null> {
    return withProvider((p) => p.getMyProfile(uid));
  },

  claimHandle(
    uid: string,
    handle: string,
    displayName?: string,
    avatarCommanderId?: string | null,
  ): Promise<UserProfile> {
    return withProvider((p) => p.claimHandle(uid, handle, displayName, avatarCommanderId));
  },

  pullDecksSince(uid: string, sinceIso: string | null): Promise<CloudDeckRecord[]> {
    return withProvider((p) => p.pullDecksSince(uid, sinceIso));
  },

  pushDeck(
    deck: CloudDeckRecord,
    expectedRevision: number,
  ): Promise<PushResult<CloudDeckRecord>> {
    return withProvider((p) => p.pushDeck(deck, expectedRevision));
  },

  pullCardListsSince(uid: string, sinceIso: string | null): Promise<CloudCardListRecord[]> {
    return withProvider((p) => p.pullCardListsSince(uid, sinceIso));
  },

  pushCardList(
    list: CloudCardListRecord,
    expectedRevision: number,
  ): Promise<PushResult<CloudCardListRecord>> {
    return withProvider((p) => p.pushCardList(list, expectedRevision));
  },

  getSharedDeckById(deckId: string): Promise<CloudDeckRecord | null> {
    return withProvider((p) => p.getSharedDeckById(deckId));
  },

  listFriendships(uid: string): Promise<FriendshipRecord[]> {
    return withProvider((p) => p.listFriendships(uid));
  },

  sendFriendRequestByHandle(
    fromUid: string,
    fromHandle: string,
    targetHandle: string,
  ): Promise<FriendshipRecord> {
    return withProvider((p) => p.sendFriendRequestByHandle(fromUid, fromHandle, targetHandle));
  },

  acceptFriendRequest(pairId: string, acceptorUid: string): Promise<void> {
    return withProvider((p) => p.acceptFriendRequest(pairId, acceptorUid));
  },

  removeFriendship(pairId: string): Promise<void> {
    return withProvider((p) => p.removeFriendship(pairId));
  },

  getFriendDecks(friendUid: string): Promise<FriendDeckSummary[]> {
    return withProvider((p) => p.getFriendDecks(friendUid));
  },

  deleteAccountAndData(uid: string, reauthPassword?: string): Promise<void> {
    return withProvider((p) => p.deleteAccountAndData(uid, reauthPassword));
  },
};

/**
 * Resets cached dynamic Firebase provider state (for isolated unit testing only).
 */
export function resetLazyFirebaseProviderForTesting(): void {
  loadedProvider = null;
  loadingPromise = null;
}
