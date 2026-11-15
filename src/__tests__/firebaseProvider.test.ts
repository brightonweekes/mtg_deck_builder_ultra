import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted Mocks for Firebase SDK Modules
// ---------------------------------------------------------------------------

type StoredDoc = Record<string, unknown>;

interface MockState {
  apps: Array<{ name: string; options: Record<string, unknown> }>;
  appInitError: Error | null;
  firestoreAlreadyInitialized: boolean;
  appCheckError: Error | null;
  auth: {
    currentUser: MockFirebaseUser | null;
  };
  authListeners: Set<(user: MockFirebaseUser | null) => void>;
  docs: Map<string, StoredDoc>;
  txLog: Array<{ op: 'get' | 'set' | 'update' | 'delete'; path: string }>;
  injectedError: { op: string; error: unknown } | null;
}

interface MockFirebaseUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  providerData: Array<{ providerId: string }>;
  reload?: () => Promise<void>;
  getIdToken?: (forceRefresh?: boolean) => Promise<string>;
}

const mockState: MockState = vi.hoisted(() => ({
  apps: [],
  appInitError: null,
  firestoreAlreadyInitialized: false,
  appCheckError: null,
  auth: { currentUser: null },
  authListeners: new Set(),
  docs: new Map(),
  txLog: [],
  injectedError: null,
}));

function assertNoInjectedError(op: string): void {
  if (mockState.injectedError && mockState.injectedError.op === op) {
    throw mockState.injectedError.error;
  }
}

const firebaseMocks = vi.hoisted(() => ({
  initializeApp: vi.fn((options: Record<string, unknown>) => {
    if (mockState.appInitError) throw mockState.appInitError;
    const app = { name: '[DEFAULT]', options };
    mockState.apps.push(app);
    return app;
  }),
  getApps: vi.fn(() => [...mockState.apps]),
  initializeAppCheck: vi.fn((_app: unknown, _opts: unknown) => {
    if (mockState.appCheckError) throw mockState.appCheckError;
    return { app: _app };
  }),
  ReCaptchaV3Provider: vi.fn(function (this: { siteKey: string }, siteKey: string) {
    this.siteKey = siteKey;
  }),
  getAuth: vi.fn(() => mockState.auth),
  initializeFirestore: vi.fn((_app: unknown, _settings: unknown) => {
    if (mockState.firestoreAlreadyInitialized) {
      throw new Error('Firestore has already been started');
    }
    return { type: 'firestore', settings: _settings };
  }),
  getFirestore: vi.fn(() => ({ type: 'firestore-fallback' })),
  onAuthStateChanged: vi.fn((_auth: unknown, cb: (user: MockFirebaseUser | null) => void) => {
    mockState.authListeners.add(cb);
    cb(mockState.auth.currentUser);
    return () => {
      mockState.authListeners.delete(cb);
    };
  }),
  createUserWithEmailAndPassword: vi.fn(async (_auth: unknown, email: string) => {
    assertNoInjectedError('createUserWithEmailAndPassword');
    const user: MockFirebaseUser = {
      uid: 'uid-new-1',
      email,
      emailVerified: false,
      displayName: null,
      providerData: [{ providerId: 'password' }],
    };
    mockState.auth.currentUser = user;
    return { user };
  }),
  signInWithEmailAndPassword: vi.fn(async (_auth: unknown, email: string) => {
    assertNoInjectedError('signInWithEmailAndPassword');
    const user: MockFirebaseUser = {
      uid: 'uid-signed-in',
      email,
      emailVerified: true,
      displayName: 'urza_prime',
      providerData: [{ providerId: 'password' }],
    };
    mockState.auth.currentUser = user;
    return { user };
  }),
  signInWithPopup: vi.fn(async () => {
    assertNoInjectedError('signInWithPopup');
    const user: MockFirebaseUser = {
      uid: 'uid-google-1',
      email: 'planeswalker@gmail.com',
      emailVerified: true,
      displayName: 'Planes Walker',
      providerData: [{ providerId: 'google.com' }],
    };
    mockState.auth.currentUser = user;
    return { user };
  }),
  GoogleAuthProvider: vi.fn(function (this: { providerId: string }) {
    this.providerId = 'google.com';
  }),
  EmailAuthProvider: {
    credential: vi.fn((email: string, password: string) => ({
      providerId: 'password',
      email,
      password,
    })),
  },
  updateProfile: vi.fn(async (user: MockFirebaseUser, profile: { displayName?: string | null }) => {
    if (profile.displayName !== undefined) {
      user.displayName = profile.displayName;
    }
  }),
  sendEmailVerification: vi.fn(async () => {
    assertNoInjectedError('sendEmailVerification');
  }),
  reload: vi.fn(async () => {
    assertNoInjectedError('reload');
  }),
  getIdToken: vi.fn(async () => {
    assertNoInjectedError('getIdToken');
    return 'mock-jwt-token';
  }),
  sendPasswordResetEmail: vi.fn(async () => {
    assertNoInjectedError('sendPasswordResetEmail');
  }),
  signOut: vi.fn(async () => {
    mockState.auth.currentUser = null;
  }),
  reauthenticateWithCredential: vi.fn(async () => {
    assertNoInjectedError('reauthenticateWithCredential');
    return { user: mockState.auth.currentUser };
  }),
  reauthenticateWithPopup: vi.fn(async () => {
    assertNoInjectedError('reauthenticateWithPopup');
    return { user: mockState.auth.currentUser };
  }),
  deleteUser: vi.fn(async () => {
    assertNoInjectedError('deleteUser');
    mockState.auth.currentUser = null;
  }),
}));

vi.mock('firebase/app', () => ({
  initializeApp: firebaseMocks.initializeApp,
  getApps: firebaseMocks.getApps,
}));

vi.mock('firebase/app-check', () => ({
  initializeAppCheck: firebaseMocks.initializeAppCheck,
  ReCaptchaV3Provider: firebaseMocks.ReCaptchaV3Provider,
}));

vi.mock('firebase/auth', () => ({
  getAuth: firebaseMocks.getAuth,
  onAuthStateChanged: firebaseMocks.onAuthStateChanged,
  createUserWithEmailAndPassword: firebaseMocks.createUserWithEmailAndPassword,
  signInWithEmailAndPassword: firebaseMocks.signInWithEmailAndPassword,
  signInWithPopup: firebaseMocks.signInWithPopup,
  GoogleAuthProvider: firebaseMocks.GoogleAuthProvider,
  EmailAuthProvider: firebaseMocks.EmailAuthProvider,
  updateProfile: firebaseMocks.updateProfile,
  sendEmailVerification: firebaseMocks.sendEmailVerification,
  reload: firebaseMocks.reload,
  getIdToken: firebaseMocks.getIdToken,
  sendPasswordResetEmail: firebaseMocks.sendPasswordResetEmail,
  signOut: firebaseMocks.signOut,
  reauthenticateWithCredential: firebaseMocks.reauthenticateWithCredential,
  reauthenticateWithPopup: firebaseMocks.reauthenticateWithPopup,
  deleteUser: firebaseMocks.deleteUser,
}));

interface MockDocRef {
  kind: 'doc';
  path: string;
  id: string;
}

interface MockCollectionRef {
  kind: 'collection';
  path: string;
}

interface MockConstraint {
  kind: 'where' | 'orderBy';
  field: string;
  op?: string;
  value?: unknown;
  direction?: 'asc' | 'desc';
}

interface MockQuery {
  kind: 'query';
  path: string;
  constraints: MockConstraint[];
}

function makeDocSnap(path: string, id: string, data: StoredDoc | undefined) {
  return {
    id,
    ref: { kind: 'doc', path, id } as MockDocRef,
    exists: () => data !== undefined,
    data: () => (data ? structuredClone(data) : undefined),
  };
}

function assertNoUndefinedValues(value: unknown, trail = 'root'): void {
  if (value === undefined) {
    throw new Error(`Firestore received forbidden undefined value at ${trail}`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, idx) => assertNoUndefinedValues(item, `${trail}[${idx}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) {
        throw new Error(`Firestore received forbidden undefined property "${trail}.${k}"`);
      }
      assertNoUndefinedValues(v, `${trail}.${k}`);
    }
  }
}

function evaluateQuery(q: MockQuery | MockCollectionRef) {
  const path = q.path;
  const constraints = q.kind === 'query' ? q.constraints : [];
  const entries: Array<{ id: string; path: string; data: StoredDoc }> = [];

  for (const [docPath, data] of mockState.docs.entries()) {
    const slashIdx = docPath.indexOf('/');
    const colName = docPath.slice(0, slashIdx);
    const id = docPath.slice(slashIdx + 1);
    if (colName !== path) continue;

    let matches = true;
    for (const c of constraints) {
      if (c.kind !== 'where') continue;
      const val = data[c.field];
      if (c.op === '==') {
        if (val !== c.value) matches = false;
      } else if (c.op === '>') {
        if (typeof val !== 'string' || typeof c.value !== 'string' || !(val > c.value)) {
          matches = false;
        }
      } else if (c.op === 'array-contains') {
        if (!Array.isArray(val) || !val.includes(c.value)) matches = false;
      }
    }

    if (matches) {
      entries.push({ id, path: docPath, data });
    }
  }

  for (const c of constraints) {
    if (c.kind === 'orderBy') {
      const dir = c.direction === 'desc' ? -1 : 1;
      entries.sort((a, b) => {
        const av = String(a.data[c.field] ?? '');
        const bv = String(b.data[c.field] ?? '');
        return av.localeCompare(bv) * dir;
      });
    }
  }

  return {
    docs: entries.map((e) => makeDocSnap(e.path, e.id, e.data)),
  };
}

const firestoreMocks = vi.hoisted(() => ({
  collection: vi.fn((_db: unknown, path: string) => ({ kind: 'collection', path }) as MockCollectionRef),
  doc: vi.fn((_db: unknown, col: string, id: string) => ({
    kind: 'doc',
    path: `${col}/${id}`,
    id,
  })),
  where: vi.fn((field: string, op: string, value: unknown) => ({
    kind: 'where',
    field,
    op,
    value,
  })),
  orderBy: vi.fn((field: string, direction: 'asc' | 'desc' = 'asc') => ({
    kind: 'orderBy',
    field,
    direction,
  })),
  query: vi.fn((target: MockCollectionRef | MockQuery, ...constraints: MockConstraint[]) => ({
    kind: 'query',
    path: target.path,
    constraints:
      target.kind === 'query' ? [...target.constraints, ...constraints] : constraints,
  })),
  getDoc: vi.fn(async (ref: MockDocRef) => {
    assertNoInjectedError('getDoc');
    return makeDocSnap(ref.path, ref.id, mockState.docs.get(ref.path));
  }),
  setDoc: vi.fn(async (ref: MockDocRef, data: StoredDoc) => {
    assertNoInjectedError('setDoc');
    assertNoUndefinedValues(data, ref.path);
    mockState.docs.set(ref.path, structuredClone(data));
  }),
  deleteDoc: vi.fn(async (ref: MockDocRef) => {
    assertNoInjectedError('deleteDoc');
    mockState.docs.delete(ref.path);
  }),
  getDocs: vi.fn(async (q: MockQuery | MockCollectionRef) => {
    assertNoInjectedError('getDocs');
    return evaluateQuery(q);
  }),
  runTransaction: vi.fn(async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    assertNoInjectedError('runTransaction');
    let hasWritten = false;
    const stagedOps: Array<() => void> = [];

    const tx = {
      get: async (ref: MockDocRef) => {
        if (hasWritten) {
          throw new Error(
            `Firestore transaction violation: read (${ref.path}) executed after write.`,
          );
        }
        mockState.txLog.push({ op: 'get', path: ref.path });
        return makeDocSnap(ref.path, ref.id, mockState.docs.get(ref.path));
      },
      set: (ref: MockDocRef, data: StoredDoc) => {
        hasWritten = true;
        assertNoUndefinedValues(data, ref.path);
        mockState.txLog.push({ op: 'set', path: ref.path });
        stagedOps.push(() => {
          mockState.docs.set(ref.path, structuredClone(data));
        });
      },
      update: (ref: MockDocRef, data: StoredDoc) => {
        hasWritten = true;
        assertNoUndefinedValues(data, ref.path);
        mockState.txLog.push({ op: 'update', path: ref.path });
        stagedOps.push(() => {
          const existing = mockState.docs.get(ref.path) ?? {};
          mockState.docs.set(ref.path, { ...existing, ...structuredClone(data) });
        });
      },
      delete: (ref: MockDocRef) => {
        hasWritten = true;
        mockState.txLog.push({ op: 'delete', path: ref.path });
        stagedOps.push(() => {
          mockState.docs.delete(ref.path);
        });
      },
    };

    const result = await fn(tx);
    for (const commitOp of stagedOps) {
      commitOp();
    }
    return result;
  }),
  writeBatch: vi.fn(() => {
    const ops: Array<() => void> = [];
    return {
      delete: (ref: MockDocRef) => {
        ops.push(() => {
          mockState.docs.delete(ref.path);
        });
      },
      commit: async () => {
        assertNoInjectedError('batchCommit');
        for (const op of ops) op();
      },
    };
  }),
}));

vi.mock('firebase/firestore', () => ({
  initializeFirestore: firebaseMocks.initializeFirestore,
  getFirestore: firebaseMocks.getFirestore,
  collection: firestoreMocks.collection,
  doc: firestoreMocks.doc,
  getDoc: firestoreMocks.getDoc,
  setDoc: firestoreMocks.setDoc,
  deleteDoc: firestoreMocks.deleteDoc,
  getDocs: firestoreMocks.getDocs,
  query: firestoreMocks.query,
  where: firestoreMocks.where,
  orderBy: firestoreMocks.orderBy,
  runTransaction: firestoreMocks.runTransaction,
  writeBatch: firestoreMocks.writeBatch,
}));

// Import modules under test AFTER mocks are registered.
import {
  getFirebaseApp,
  getFirebaseAuth,
  getFirebaseDb,
  isFirebaseConfigured,
  resetFirebaseInstancesForTesting,
} from '../cloud/firebaseConfig.js';
import {
  CloudProviderError,
  firebaseProvider,
  getPendingHandleStorageKey,
} from '../cloud/firebaseProvider.js';
import type { CloudCardListRecord, CloudDeckRecord } from '../types/cloud.js';

function stubConfiguredFirebaseEnv(appCheckSiteKey = ''): void {
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-api-key');
  vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test-project.firebaseapp.com');
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');
  vi.stubEnv('VITE_FIREBASE_APP_ID', '1:12345:web:abcdef');
  vi.stubEnv('VITE_FIREBASE_APP_CHECK_SITE_KEY', appCheckSiteKey);
}

function makeMemoryLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    _store: store,
  };
}

function makeSampleCloudDeck(overrides: Partial<CloudDeckRecord> = {}): CloudDeckRecord {
  return {
    id: 'deck-1',
    ownerUid: 'uid-alice',
    ownerHandle: 'alice_mtg',
    name: 'Atraxa Superfriends',
    commanderOracleIds: ['oracle-atraxa'],
    colorIdentity: ['W', 'U', 'B', 'G'],
    mainboard: { 'oracle-sol-ring': 1 },
    sideboard: {},
    synergyThemes: ['Planeswalkers', 'Proliferate'],
    cardCount: 2,
    lockSearchToCommanderIdentity: true,
    visibility: 'private',
    sharedWithUids: [],
    revision: 0,
    createdAt: '2026-11-10T12:00:00.000Z',
    updatedAt: '2026-11-10T12:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function makeSampleCloudList(overrides: Partial<CloudCardListRecord> = {}): CloudCardListRecord {
  return {
    id: 'list-1',
    ownerUid: 'uid-alice',
    ownerHandle: 'alice_mtg',
    name: 'Commander Staples Binder',
    listType: 'collection',
    entries: {
      'oracle-sol-ring': { quantity: 2, foilQuantity: 1 },
    },
    visibility: 'private',
    sharedWithUids: [],
    revision: 0,
    createdAt: '2026-11-10T12:00:00.000Z',
    updatedAt: '2026-11-10T12:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('firebaseConfig & FirebaseCloudProvider', () => {
  let memoryStorage: ReturnType<typeof makeMemoryLocalStorage>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetFirebaseInstancesForTesting();

    mockState.apps = [];
    mockState.appInitError = null;
    mockState.firestoreAlreadyInitialized = false;
    mockState.appCheckError = null;
    mockState.auth = { currentUser: null };
    mockState.authListeners.clear();
    mockState.docs.clear();
    mockState.txLog = [];
    mockState.injectedError = null;

    memoryStorage = makeMemoryLocalStorage();
    vi.stubGlobal('window', { localStorage: memoryStorage });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetFirebaseInstancesForTesting();
  });

  describe('Unconfigured & Configured Initialization', () => {
    it('never crashes when Firebase env vars are missing and returns isConfigured() === false', async () => {
      vi.stubEnv('VITE_FIREBASE_API_KEY', '');
      vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', '');
      vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '');
      vi.stubEnv('VITE_FIREBASE_APP_ID', '');

      expect(isFirebaseConfigured()).toBe(false);
      expect(getFirebaseApp()).toBeNull();
      expect(getFirebaseAuth()).toBeNull();
      expect(getFirebaseDb()).toBeNull();
      expect(firebaseProvider.isConfigured()).toBe(false);

      const authEvents: unknown[] = [];
      const unsub = firebaseProvider.onAuthStateChanged((user) => authEvents.push(user));
      expect(authEvents).toEqual([null]);
      expect(typeof unsub).toBe('function');
      unsub();

      await expect(firebaseProvider.getMyProfile('uid-1')).resolves.toBeNull();
      await expect(firebaseProvider.pullDecksSince('uid-1', null)).resolves.toEqual([]);
      await expect(firebaseProvider.pullCardListsSince('uid-1', null)).resolves.toEqual([]);
      await expect(firebaseProvider.getSharedDeckById('deck-1')).resolves.toBeNull();
      await expect(firebaseProvider.listFriendships('uid-1')).resolves.toEqual([]);
      await expect(firebaseProvider.getFriendDecks('uid-2')).resolves.toEqual([]);
      await expect(firebaseProvider.reloadUser()).resolves.toBeNull();
      await expect(firebaseProvider.signOut()).resolves.toBeUndefined();
      await expect(
        firebaseProvider.signInWithEmail('user@example.com', 'StrongPass1!'),
      ).rejects.toThrow(/not configured/i);
    });

    it('initializes Firestore with ignoreUndefinedProperties and safely guards App Check', () => {
      stubConfiguredFirebaseEnv('recaptcha-site-key-123');

      expect(isFirebaseConfigured()).toBe(true);
      const db = getFirebaseDb();
      expect(db).not.toBeNull();
      expect(firebaseMocks.initializeFirestore).toHaveBeenCalledWith(expect.any(Object), {
        ignoreUndefinedProperties: true,
      });
      expect(firebaseMocks.initializeAppCheck).toHaveBeenCalledTimes(1);
      expect(firebaseMocks.ReCaptchaV3Provider).toHaveBeenCalledWith('recaptcha-site-key-123');

      // Also verify fallback to getFirestore if initializeFirestore throws (e.g., HMR) and safe App Check catch
      resetFirebaseInstancesForTesting();
      mockState.apps = [{ name: '[DEFAULT]', options: {} }];
      mockState.firestoreAlreadyInitialized = true;
      mockState.appCheckError = new Error('App Check unsupported');

      const fallbackDb = getFirebaseDb();
      expect(fallbackDb).toEqual({ type: 'firestore-fallback' });
      expect(firebaseMocks.getFirestore).toHaveBeenCalledTimes(1);
    });
  });

  describe('Authentication & Verification', () => {
    beforeEach(() => {
      stubConfiguredFirebaseEnv();
    });

    it('signUpWithEmail validates handle, email, and password before calling Firebase and never touches Firestore while unverified', async () => {
      await expect(
        firebaseProvider.signUpWithEmail('bad-email', 'StrongPass1!', 'valid_handle'),
      ).rejects.toThrow(/valid email/i);
      await expect(
        firebaseProvider.signUpWithEmail('alice@example.com', 'short', 'valid_handle'),
      ).rejects.toThrow(/at least 8/i);
      await expect(
        firebaseProvider.signUpWithEmail('alice@example.com', 'StrongPass1!', 'admin'),
      ).rejects.toThrow(/reserved/i);
      await expect(
        firebaseProvider.signUpWithEmail('alice@example.com', 'StrongPass1!', 'alice@example.com'),
      ).rejects.toThrow(/email/i);

      expect(firebaseMocks.createUserWithEmailAndPassword).not.toHaveBeenCalled();

      const created = await firebaseProvider.signUpWithEmail(
        '  Alice@Example.com ',
        'StrongPass1!',
        '  @Alice_MTG ',
      );

      expect(firebaseMocks.createUserWithEmailAndPassword).toHaveBeenCalledWith(
        mockState.auth,
        'alice@example.com',
        'StrongPass1!',
      );
      expect(firebaseMocks.updateProfile).toHaveBeenCalledWith(expect.any(Object), {
        displayName: 'alice_mtg',
      });
      expect(firebaseMocks.sendEmailVerification).toHaveBeenCalledTimes(1);
      expect(memoryStorage.getItem(getPendingHandleStorageKey('uid-new-1'))).toBe('alice_mtg');
      expect(created).toEqual({
        uid: 'uid-new-1',
        email: 'alice@example.com',
        emailVerified: false,
        displayName: 'alice_mtg',
        providerIds: ['password'],
      });

      // Zero Firestore reads or writes before emailVerified === true
      expect(firestoreMocks.getDoc).not.toHaveBeenCalled();
      expect(firestoreMocks.setDoc).not.toHaveBeenCalled();
      expect(firestoreMocks.runTransaction).not.toHaveBeenCalled();
      expect(mockState.docs.size).toBe(0);
    });

    it('signInWithGoogle humanizes popup errors', async () => {
      mockState.injectedError = {
        op: 'signInWithPopup',
        error: { code: 'auth/popup-blocked', message: 'Firebase: Error (auth/popup-blocked).' },
      };

      await expect(firebaseProvider.signInWithGoogle()).rejects.toThrow(
        /popup was blocked by your browser/i,
      );

      mockState.injectedError = {
        op: 'signInWithPopup',
        error: {
          code: 'auth/popup-closed-by-user',
          message: 'Firebase: Error (auth/popup-closed-by-user).',
        },
      };

      await expect(firebaseProvider.signInWithGoogle()).rejects.toThrow(
        /popup was closed before completing/i,
      );
    });

    it('reloadUser calls reload() and forces getIdToken(true) to refresh email_verified JWT claim', async () => {
      const userReloadSpy = vi.fn(async () => {
        if (mockState.auth.currentUser) {
          mockState.auth.currentUser.emailVerified = true;
        }
      });
      const getIdTokenSpy = vi.fn(async () => 'fresh-verified-token');

      mockState.auth.currentUser = {
        uid: 'uid-verify-1',
        email: 'alice@example.com',
        emailVerified: false,
        displayName: 'alice_mtg',
        providerData: [{ providerId: 'password' }],
        reload: userReloadSpy,
        getIdToken: getIdTokenSpy,
      };

      const reloaded = await firebaseProvider.reloadUser();
      expect(userReloadSpy).toHaveBeenCalledTimes(1);
      expect(getIdTokenSpy).toHaveBeenCalledWith(true);
      expect(reloaded?.emailVerified).toBe(true);
    });
  });

  describe('Handles & Profiles', () => {
    beforeEach(() => {
      stubConfiguredFirebaseEnv();
    });

    it('claimHandle reads profile and handle before writes, never writes email, rejects taken handles, and cleans up old handle on rename', async () => {
      memoryStorage.setItem(getPendingHandleStorageKey('uid-alice'), 'alice_mtg');

      const profile = await firebaseProvider.claimHandle(
        'uid-alice',
        '@Alice_MTG',
        'Alice Planeswalker',
        'oracle-atraxa',
      );

      expect(profile.handle).toBe('alice_mtg');
      expect(profile.handleLower).toBe('alice_mtg');
      expect(profile.displayName).toBe('Alice Planeswalker');
      expect(profile.avatarCommanderId).toBe('oracle-atraxa');
      expect('email' in profile).toBe(false);

      // Verify reads precede writes inside transaction
      const firstWriteIdx = mockState.txLog.findIndex((e) => e.op !== 'get');
      const lastReadIdx = mockState.txLog.map((e) => e.op).lastIndexOf('get');
      expect(lastReadIdx).toBeGreaterThanOrEqual(0);
      expect(lastReadIdx).toBeLessThan(firstWriteIdx);

      // Verify stored Firestore docs never contain email
      const storedProfile = mockState.docs.get('profiles/uid-alice');
      const storedHandle = mockState.docs.get('handles/alice_mtg');
      expect(storedProfile).toBeDefined();
      expect(storedHandle).toBeDefined();
      expect(storedProfile).not.toHaveProperty('email');
      expect(storedHandle).not.toHaveProperty('email');
      expect(memoryStorage.getItem(getPendingHandleStorageKey('uid-alice'))).toBeNull();

      // Another user cannot steal an already taken handle
      await expect(
        firebaseProvider.claimHandle('uid-bob', 'ALICE_MTG', 'Bob'),
      ).rejects.toThrow(/Handle @alice_mtg is already taken\./);

      // Renaming deletes old handle doc and creates new handle doc
      mockState.txLog = [];
      const renamed = await firebaseProvider.claimHandle('uid-alice', 'alice_v2');
      expect(renamed.handleLower).toBe('alice_v2');
      expect(mockState.docs.has('handles/alice_mtg')).toBe(false);
      expect(mockState.docs.get('handles/alice_v2')?.uid).toBe('uid-alice');

      // Re-claiming the exact same handle only updates profile (never updates /handles doc since rules forbid update)
      mockState.txLog = [];
      await firebaseProvider.claimHandle('uid-alice', 'alice_v2', 'Alice Updated');
      expect(
        mockState.txLog.some((e) => e.op === 'set' && e.path === 'handles/alice_v2'),
      ).toBe(false);
      expect(mockState.docs.get('profiles/uid-alice')?.displayName).toBe('Alice Updated');
    });

    it('claimHandle reads old handle before writes and skips tx.delete when old handle doc is missing or owned by another user', async () => {
      // Case 1: Profile references an old handle whose /handles doc does not exist
      mockState.docs.set('profiles/uid-alice', {
        uid: 'uid-alice',
        handle: 'ghost_handle',
        handleLower: 'ghost_handle',
        displayName: 'Alice',
        createdAt: '2026-11-10T00:00:00.000Z',
        updatedAt: '2026-11-10T00:00:00.000Z',
      });

      mockState.txLog = [];
      const renamedMissing = await firebaseProvider.claimHandle('uid-alice', 'alice_fresh');
      expect(renamedMissing.handleLower).toBe('alice_fresh');

      expect(
        mockState.txLog.some((e) => e.op === 'get' && e.path === 'handles/ghost_handle'),
      ).toBe(true);
      expect(
        mockState.txLog.some((e) => e.op === 'delete' && e.path === 'handles/ghost_handle'),
      ).toBe(false);
      const firstWriteIdx = mockState.txLog.findIndex((e) => e.op !== 'get');
      const lastReadIdx = mockState.txLog.map((e) => e.op).lastIndexOf('get');
      expect(lastReadIdx).toBeLessThan(firstWriteIdx);

      // Case 2: Profile references an old handle doc owned by someone else -> do NOT delete it
      mockState.docs.set('handles/shared_by_bob', {
        uid: 'uid-bob',
        handle: 'shared_by_bob',
        handleLower: 'shared_by_bob',
      });
      mockState.docs.set('profiles/uid-alice', {
        uid: 'uid-alice',
        handle: 'shared_by_bob',
        handleLower: 'shared_by_bob',
        displayName: 'Alice',
        createdAt: '2026-11-10T00:00:00.000Z',
        updatedAt: '2026-11-10T00:00:00.000Z',
      });

      mockState.txLog = [];
      await firebaseProvider.claimHandle('uid-alice', 'alice_next');
      expect(
        mockState.txLog.some((e) => e.op === 'delete' && e.path === 'handles/shared_by_bob'),
      ).toBe(false);
      expect(mockState.docs.get('handles/shared_by_bob')?.uid).toBe('uid-bob');
    });
  });

  describe('Deck & CardList Cloud Sync', () => {
    beforeEach(() => {
      stubConfiguredFirebaseEnv();
    });

    it('pushDeck enforces read-before-write, detects revision conflicts, omits undefined, and rebuilds friendCatalogs list', async () => {
      // 1. Initial push of a private deck (expectedRevision = 0 -> revision = 1)
      const privateDeck = makeSampleCloudDeck({
        id: 'deck-atraxa',
        visibility: 'private',
        description: undefined,
      });

      const firstRes = await firebaseProvider.pushDeck(privateDeck, 0);
      expect(firstRes.status).toBe('synced');
      if (firstRes.status !== 'synced') throw new Error('Expected synced');
      expect(firstRes.record.revision).toBe(1);
      expect(firstRes.record.deletedAt).toBeNull();
      expect('description' in firstRes.record).toBe(false);

      // Verify reads preceded writes
      const firstWriteIdx = mockState.txLog.findIndex((e) => e.op !== 'get');
      const lastReadIdx = mockState.txLog.map((e) => e.op).lastIndexOf('get');
      expect(lastReadIdx).toBeLessThan(firstWriteIdx);

      // Private deck must NOT appear in friendCatalogs/{uid}.decks list
      const catalogAfterPrivate = mockState.docs.get('friendCatalogs/uid-alice');
      expect(Array.isArray(catalogAfterPrivate?.decks)).toBe(true);
      expect(catalogAfterPrivate?.decks).toEqual([]);

      // 2. Conflict when expectedRevision is stale or 0 for an existing deck
      const conflictZero = await firebaseProvider.pushDeck(privateDeck, 0);
      expect(conflictZero.status).toBe('conflict');

      const conflictStale = await firebaseProvider.pushDeck(privateDeck, 99);
      expect(conflictStale).toMatchObject({
        status: 'conflict',
        serverRecord: { id: 'deck-atraxa', revision: 1 },
      });

      // 3. Updating visibility to 'friends' adds deck summary to friendCatalogs/{uid}.decks
      const friendsDeck = makeSampleCloudDeck({
        id: 'deck-atraxa',
        visibility: 'friends',
        synergyThemes: Array.from({ length: 25 }, (_, i) => `Theme-${i}`), // verify clamped <= 20 for rules
      });
      const secondRes = await firebaseProvider.pushDeck(friendsDeck, 1);
      expect(secondRes.status).toBe('synced');
      if (secondRes.status !== 'synced') throw new Error('Expected synced');
      expect(secondRes.record.revision).toBe(2);
      expect(secondRes.record.synergyThemes).toHaveLength(20);

      const catalogAfterFriends = mockState.docs.get('friendCatalogs/uid-alice');
      expect(Array.isArray(catalogAfterFriends?.decks)).toBe(true);
      expect((catalogAfterFriends?.decks as Array<{ id: string }>).map((d) => d.id)).toEqual([
        'deck-atraxa',
      ]);

      // 4. Changing visibility to 'link' or setting deletedAt removes deck from friendCatalogs/{uid}.decks
      const linkDeck = makeSampleCloudDeck({
        id: 'deck-atraxa',
        visibility: 'link',
      });
      const thirdRes = await firebaseProvider.pushDeck(linkDeck, 2);
      expect(thirdRes.status).toBe('synced');
      expect(mockState.docs.get('friendCatalogs/uid-alice')?.decks).toEqual([]);

      // Re-add as public, then soft-delete
      await firebaseProvider.pushDeck(
        makeSampleCloudDeck({ id: 'deck-atraxa', visibility: 'public' }),
        3,
      );
      expect(mockState.docs.get('friendCatalogs/uid-alice')?.decks).toHaveLength(1);

      await firebaseProvider.pushDeck(
        makeSampleCloudDeck({
          id: 'deck-atraxa',
          visibility: 'public',
          deletedAt: '2026-11-12T00:00:00.000Z',
        }),
        4,
      );
      expect(mockState.docs.get('friendCatalogs/uid-alice')?.decks).toEqual([]);
    });

    it('pullDecksSince queries by ownerUid and applies delta updatedAt filter when sinceIso is passed', async () => {
      mockState.docs.set(
        'decks/d1',
        makeSampleCloudDeck({
          id: 'd1',
          ownerUid: 'uid-alice',
          updatedAt: '2026-11-10T10:00:00.000Z',
          revision: 1,
        }) as unknown as StoredDoc,
      );
      mockState.docs.set(
        'decks/d2',
        makeSampleCloudDeck({
          id: 'd2',
          ownerUid: 'uid-alice',
          updatedAt: '2026-11-12T10:00:00.000Z',
          revision: 2,
        }) as unknown as StoredDoc,
      );
      mockState.docs.set(
        'decks/d3',
        makeSampleCloudDeck({
          id: 'd3',
          ownerUid: 'uid-bob',
          updatedAt: '2026-11-13T10:00:00.000Z',
          revision: 1,
        }) as unknown as StoredDoc,
      );

      const allAlice = await firebaseProvider.pullDecksSince('uid-alice', null);
      expect(allAlice.map((d) => d.id)).toEqual(['d1', 'd2']);

      const deltaAlice = await firebaseProvider.pullDecksSince(
        'uid-alice',
        '2026-11-11T00:00:00.000Z',
      );
      expect(deltaAlice.map((d) => d.id)).toEqual(['d2']);
      expect(firestoreMocks.orderBy).toHaveBeenCalledWith('updatedAt', 'desc');
    });

    it('pushCardList and pullCardListsSince handle revisions and delta queries cleanly', async () => {
      const list = makeSampleCloudList();
      const first = await firebaseProvider.pushCardList(list, 0);
      expect(first.status).toBe('synced');
      if (first.status !== 'synced') throw new Error('Expected synced');
      expect(first.record.revision).toBe(1);

      const conflict = await firebaseProvider.pushCardList(list, 0);
      expect(conflict.status).toBe('conflict');

      const pulled = await firebaseProvider.pullCardListsSince('uid-alice', null);
      expect(pulled).toHaveLength(1);
      expect(pulled[0]?.id).toBe('list-1');

      firestoreMocks.orderBy.mockClear();
      const deltaPulled = await firebaseProvider.pullCardListsSince(
        'uid-alice',
        '2026-11-01T00:00:00.000Z',
      );
      expect(deltaPulled).toHaveLength(1);
      expect(firestoreMocks.orderBy).toHaveBeenCalledWith('updatedAt', 'desc');
    });

    it('getSharedDeckById returns null when missing or deleted and throws humanized error on permission-denied', async () => {
      expect(await firebaseProvider.getSharedDeckById('missing-deck')).toBeNull();

      mockState.docs.set(
        'decks/deleted-deck',
        makeSampleCloudDeck({
          id: 'deleted-deck',
          visibility: 'public',
          deletedAt: '2026-11-14T00:00:00.000Z',
          revision: 2,
        }) as unknown as StoredDoc,
      );
      expect(await firebaseProvider.getSharedDeckById('deleted-deck')).toBeNull();

      mockState.docs.set(
        'decks/public-deck',
        makeSampleCloudDeck({
          id: 'public-deck',
          visibility: 'public',
          revision: 3,
        }) as unknown as StoredDoc,
      );
      const found = await firebaseProvider.getSharedDeckById('public-deck');
      expect(found?.id).toBe('public-deck');

      mockState.injectedError = {
        op: 'getDoc',
        error: { code: 'permission-denied', message: 'Missing or insufficient permissions.' },
      };
      await expect(firebaseProvider.getSharedDeckById('private-deck')).rejects.toThrow(
        /Permission denied/i,
      );
    });
  });

  describe('Friends & Account Deletion', () => {
    beforeEach(() => {
      stubConfiguredFirebaseEnv();
    });

    it('sendFriendRequestByHandle resolves handle, blocks self-friend & duplicates, and uses deterministic sorted pairId', async () => {
      mockState.docs.set('handles/alice_mtg', { uid: 'uid-alice', handle: 'alice_mtg' });
      mockState.docs.set('handles/zeta_edh', { uid: 'uid-zeta', handle: 'zeta_edh' });

      await expect(
        firebaseProvider.sendFriendRequestByHandle('uid-zeta', 'zeta_edh', 'missing_player'),
      ).rejects.toThrow(/No player found with handle @missing_player/i);

      await expect(
        firebaseProvider.sendFriendRequestByHandle('uid-zeta', 'zeta_edh', '@Zeta_EDH'),
      ).rejects.toThrow(/cannot send a friend request to yourself/i);

      const req = await firebaseProvider.sendFriendRequestByHandle(
        'uid-zeta',
        'zeta_edh',
        '@Alice_MTG',
      );

      expect(req.id).toBe('uid-alice_uid-zeta');
      expect(req.users).toEqual(['uid-alice', 'uid-zeta']);
      expect(req.requestedBy).toBe('uid-zeta');
      expect(req.status).toBe('pending');

      // Duplicate pending request is blocked cleanly
      await expect(
        firebaseProvider.sendFriendRequestByHandle('uid-zeta', 'zeta_edh', 'alice_mtg'),
      ).rejects.toThrow(/already pending/i);

      // Sender cannot accept their own outgoing request
      await expect(
        firebaseProvider.acceptFriendRequest('uid-alice_uid-zeta', 'uid-zeta'),
      ).rejects.toThrow(/cannot accept your own/i);

      // Recipient accepts
      await firebaseProvider.acceptFriendRequest('uid-alice_uid-zeta', 'uid-alice');
      const listed = await firebaseProvider.listFriendships('uid-alice');
      expect(listed).toHaveLength(1);
      expect(listed[0]?.status).toBe('accepted');

      // Remove friendship
      await firebaseProvider.removeFriendship('uid-alice_uid-zeta');
      expect(await firebaseProvider.listFriendships('uid-alice')).toEqual([]);
    });

    it('getFriendDecks returns [] when friendCatalogs document does not exist and returns deck summaries when present', async () => {
      expect(await firebaseProvider.getFriendDecks('uid-no-catalog')).toEqual([]);

      mockState.docs.set('friendCatalogs/uid-bob', {
        ownerUid: 'uid-bob',
        ownerHandle: 'bob_edh',
        updatedAt: '2026-11-14T10:00:00.000Z',
        decks: [
          {
            id: 'deck-bob-1',
            ownerUid: 'uid-bob',
            ownerHandle: 'bob_edh',
            name: 'Yuriko Ninjas',
            commanderOracleIds: ['oracle-yuriko'],
            colorIdentity: ['U', 'B'],
            synergyThemes: ['Ninjutsu'],
            cardCount: 100,
            visibility: 'friends',
            updatedAt: '2026-11-14T10:00:00.000Z',
          },
        ],
      });

      const decks = await firebaseProvider.getFriendDecks('uid-bob');
      expect(decks).toHaveLength(1);
      expect(decks[0]?.name).toBe('Yuriko Ninjas');
    });

    it('deleteAccountAndData reauthenticates, deletes all user Firestore docs, and deletes Firebase Auth user', async () => {
      mockState.auth.currentUser = {
        uid: 'uid-alice',
        email: 'alice@example.com',
        emailVerified: true,
        displayName: 'alice_mtg',
        providerData: [{ providerId: 'password' }],
      };

      mockState.docs.set('profiles/uid-alice', {
        uid: 'uid-alice',
        handle: 'alice_mtg',
        handleLower: 'alice_mtg',
        displayName: 'Alice',
        createdAt: '2026-11-10T00:00:00.000Z',
        updatedAt: '2026-11-10T00:00:00.000Z',
      });
      mockState.docs.set('handles/alice_mtg', { uid: 'uid-alice', handle: 'alice_mtg' });
      mockState.docs.set('friendCatalogs/uid-alice', {
        ownerUid: 'uid-alice',
        ownerHandle: 'alice_mtg',
        updatedAt: '2026-11-10T00:00:00.000Z',
        decks: [],
      });
      mockState.docs.set(
        'decks/d-alice',
        makeSampleCloudDeck({ id: 'd-alice', ownerUid: 'uid-alice' }) as unknown as StoredDoc,
      );
      mockState.docs.set(
        'cardlists/l-alice',
        makeSampleCloudList({ id: 'l-alice', ownerUid: 'uid-alice' }) as unknown as StoredDoc,
      );
      mockState.docs.set('friendships/uid-alice_uid-bob', {
        id: 'uid-alice_uid-bob',
        users: ['uid-alice', 'uid-bob'],
        requestedBy: 'uid-alice',
        status: 'accepted',
        createdAt: '2026-11-10T00:00:00.000Z',
        updatedAt: '2026-11-10T00:00:00.000Z',
      });
      // Unrelated user doc must remain untouched
      mockState.docs.set('profiles/uid-bob', { uid: 'uid-bob', handleLower: 'bob_edh' });

      await firebaseProvider.deleteAccountAndData('uid-alice', 'CurrentPass1!');

      expect(firebaseMocks.EmailAuthProvider.credential).toHaveBeenCalledWith(
        'alice@example.com',
        'CurrentPass1!',
      );
      expect(firebaseMocks.reauthenticateWithCredential).toHaveBeenCalledTimes(1);
      expect(firebaseMocks.deleteUser).toHaveBeenCalledTimes(1);

      expect(mockState.docs.has('profiles/uid-alice')).toBe(false);
      expect(mockState.docs.has('handles/alice_mtg')).toBe(false);
      expect(mockState.docs.has('friendCatalogs/uid-alice')).toBe(false);
      expect(mockState.docs.has('decks/d-alice')).toBe(false);
      expect(mockState.docs.has('cardlists/l-alice')).toBe(false);
      expect(mockState.docs.has('friendships/uid-alice_uid-bob')).toBe(false);
      expect(mockState.docs.has('profiles/uid-bob')).toBe(true);
    });

    it('deleteAccountAndData requires password reauth before touching Firestore for password accounts', async () => {
      mockState.auth.currentUser = {
        uid: 'uid-alice',
        email: 'alice@example.com',
        emailVerified: true,
        displayName: 'alice_mtg',
        providerData: [{ providerId: 'password' }],
      };
      mockState.docs.set('profiles/uid-alice', { uid: 'uid-alice', handleLower: 'alice_mtg' });
      mockState.docs.set('handles/alice_mtg', { uid: 'uid-alice', handle: 'alice_mtg' });
      mockState.docs.set(
        'decks/d-alice',
        makeSampleCloudDeck({ id: 'd-alice', ownerUid: 'uid-alice' }) as unknown as StoredDoc,
      );

      // Missing password throws before touching Firestore
      await expect(firebaseProvider.deleteAccountAndData('uid-alice')).rejects.toThrow(
        /enter your current password/i,
      );
      expect(firestoreMocks.writeBatch).not.toHaveBeenCalled();
      expect(firebaseMocks.deleteUser).not.toHaveBeenCalled();
      expect(mockState.docs.has('profiles/uid-alice')).toBe(true);
      expect(mockState.docs.has('decks/d-alice')).toBe(true);

      // Wrong password fails reauth and leaves Firestore + Auth intact
      mockState.injectedError = {
        op: 'reauthenticateWithCredential',
        error: { code: 'auth/wrong-password', message: 'Firebase: Error (auth/wrong-password).' },
      };
      await expect(
        firebaseProvider.deleteAccountAndData('uid-alice', 'WrongPass!'),
      ).rejects.toThrow(/Incorrect password/i);
      expect(firestoreMocks.writeBatch).not.toHaveBeenCalled();
      expect(firebaseMocks.deleteUser).not.toHaveBeenCalled();
      expect(mockState.docs.has('profiles/uid-alice')).toBe(true);
      expect(mockState.docs.has('handles/alice_mtg')).toBe(true);
      expect(mockState.docs.has('decks/d-alice')).toBe(true);
    });

    it('deleteAccountAndData reauthenticates Google users via popup BEFORE deleting Firestore docs and aborts cleanly on popup cancellation', async () => {
      mockState.auth.currentUser = {
        uid: 'uid-google',
        email: 'planeswalker@gmail.com',
        emailVerified: true,
        displayName: 'google_mage',
        providerData: [{ providerId: 'google.com' }],
      };
      memoryStorage.setItem(getPendingHandleStorageKey('uid-google'), 'google_mage');
      mockState.docs.set('profiles/uid-google', {
        uid: 'uid-google',
        handle: 'google_mage',
        handleLower: 'google_mage',
        displayName: 'Google Mage',
        createdAt: '2026-11-10T00:00:00.000Z',
        updatedAt: '2026-11-10T00:00:00.000Z',
      });
      mockState.docs.set('handles/google_mage', { uid: 'uid-google', handle: 'google_mage' });
      mockState.docs.set('friendCatalogs/uid-google', {
        ownerUid: 'uid-google',
        ownerHandle: 'google_mage',
        updatedAt: '2026-11-10T00:00:00.000Z',
        decks: [],
      });
      mockState.docs.set(
        'decks/d-google',
        makeSampleCloudDeck({ id: 'd-google', ownerUid: 'uid-google' }) as unknown as StoredDoc,
      );
      mockState.docs.set(
        'cardlists/l-google',
        makeSampleCloudList({ id: 'l-google', ownerUid: 'uid-google' }) as unknown as StoredDoc,
      );
      mockState.docs.set('friendships/uid-bob_uid-google', {
        id: 'uid-bob_uid-google',
        users: ['uid-bob', 'uid-google'],
        requestedBy: 'uid-bob',
        status: 'accepted',
        createdAt: '2026-11-10T00:00:00.000Z',
        updatedAt: '2026-11-10T00:00:00.000Z',
      });

      // Case 1: User closes the popup -> abort cleanly with ALL Firestore docs & Auth preserved
      mockState.injectedError = {
        op: 'reauthenticateWithPopup',
        error: {
          code: 'auth/popup-closed-by-user',
          message: 'Firebase: Error (auth/popup-closed-by-user).',
        },
      };

      await expect(firebaseProvider.deleteAccountAndData('uid-google')).rejects.toThrow(
        /popup was closed before completing/i,
      );
      expect(firebaseMocks.reauthenticateWithPopup).toHaveBeenCalledTimes(1);
      expect(firestoreMocks.getDoc).not.toHaveBeenCalled();
      expect(firestoreMocks.getDocs).not.toHaveBeenCalled();
      expect(firestoreMocks.writeBatch).not.toHaveBeenCalled();
      expect(firebaseMocks.deleteUser).not.toHaveBeenCalled();
      expect(mockState.auth.currentUser).not.toBeNull();
      expect(mockState.docs.has('profiles/uid-google')).toBe(true);
      expect(mockState.docs.has('handles/google_mage')).toBe(true);
      expect(mockState.docs.has('friendCatalogs/uid-google')).toBe(true);
      expect(mockState.docs.has('decks/d-google')).toBe(true);
      expect(mockState.docs.has('cardlists/l-google')).toBe(true);
      expect(mockState.docs.has('friendships/uid-bob_uid-google')).toBe(true);
      expect(memoryStorage.getItem(getPendingHandleStorageKey('uid-google'))).toBe('google_mage');

      // Case 2: Popup reauth succeeds -> deletes Firestore docs first, then Auth user
      mockState.injectedError = null;
      await firebaseProvider.deleteAccountAndData('uid-google');

      expect(firebaseMocks.reauthenticateWithPopup).toHaveBeenCalledTimes(2);
      expect(firebaseMocks.reauthenticateWithPopup.mock.invocationCallOrder[1]).toBeLessThan(
        firestoreMocks.writeBatch.mock.invocationCallOrder[0]!,
      );
      expect(firestoreMocks.writeBatch.mock.invocationCallOrder[0]).toBeLessThan(
        firebaseMocks.deleteUser.mock.invocationCallOrder[0]!,
      );
      expect(mockState.docs.has('profiles/uid-google')).toBe(false);
      expect(mockState.docs.has('handles/google_mage')).toBe(false);
      expect(mockState.docs.has('friendCatalogs/uid-google')).toBe(false);
      expect(mockState.docs.has('decks/d-google')).toBe(false);
      expect(mockState.docs.has('cardlists/l-google')).toBe(false);
      expect(mockState.docs.has('friendships/uid-bob_uid-google')).toBe(false);
      expect(mockState.auth.currentUser).toBeNull();
      expect(memoryStorage.getItem(getPendingHandleStorageKey('uid-google'))).toBeNull();
    });
  });

  describe('humanizeCloudError Integration', () => {
    beforeEach(() => {
      stubConfiguredFirebaseEnv();
    });

    it('translates quota, permission, and offline errors into CloudProviderError with flags', async () => {
      mockState.injectedError = {
        op: 'getDocs',
        error: { code: 'resource-exhausted', message: 'Quota exceeded.' },
      };

      try {
        await firebaseProvider.pullDecksSince('uid-alice', null);
        expect.fail('Expected error to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(CloudProviderError);
        const cloudErr = err as CloudProviderError;
        expect(cloudErr.code).toBe('resource-exhausted');
        expect(cloudErr.isQuotaOrRateLimit).toBe(true);
        expect(cloudErr.isOffline).toBe(false);
        expect(cloudErr.message).toMatch(/quota or rate limit reached/i);
      }

      mockState.injectedError = {
        op: 'getDoc',
        error: { code: 'unavailable', message: 'The client is offline.' },
      };

      try {
        await firebaseProvider.getFriendDecks('uid-bob');
        expect.fail('Expected error to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(CloudProviderError);
        const cloudErr = err as CloudProviderError;
        expect(cloudErr.code).toBe('unavailable');
        expect(cloudErr.isOffline).toBe(true);
        expect(cloudErr.message).toMatch(/temporarily unavailable or you are offline/i);
      }

      mockState.injectedError = {
        op: 'getDoc',
        error: { code: 'permission-denied', message: 'Permission denied.' },
      };

      await expect(firebaseProvider.getMyProfile('uid-alice')).rejects.toThrow(
        /Permission denied/i,
      );
    });

    it('validates email sign-in, password reset, resend verification, and deck/cardlist IDs cleanly', async () => {
      await expect(firebaseProvider.signInWithEmail('not-an-email', 'pass')).rejects.toThrow(
        /valid email/i,
      );
      await expect(firebaseProvider.sendPasswordReset('not-an-email')).rejects.toThrow(
        /valid email/i,
      );
      await firebaseProvider.sendPasswordReset('  Alice@Example.com ');
      expect(firebaseMocks.sendPasswordResetEmail).toHaveBeenCalledWith(
        mockState.auth,
        'alice@example.com',
      );

      await expect(firebaseProvider.resendVerificationEmail()).rejects.toThrow(/sign in first/i);
      mockState.auth.currentUser = {
        uid: 'uid-unverified',
        email: 'alice@example.com',
        emailVerified: false,
        displayName: 'alice_mtg',
        providerData: [{ providerId: 'password' }],
      };
      await firebaseProvider.resendVerificationEmail();
      expect(firebaseMocks.sendEmailVerification).toHaveBeenCalledTimes(1);

      await expect(
        firebaseProvider.pushDeck(makeSampleCloudDeck({ id: 'bad/id' }), 0),
      ).rejects.toThrow(/Invalid deck ID/i);
      await expect(
        firebaseProvider.pushCardList(makeSampleCloudList({ id: '' }), 0),
      ).rejects.toThrow(/Invalid card list ID/i);
    });
  });
});
