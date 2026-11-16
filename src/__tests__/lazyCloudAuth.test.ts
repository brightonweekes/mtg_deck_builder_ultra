import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdkMocks = vi.hoisted(() => ({
  initializeApp: vi.fn((options: Record<string, unknown>) => ({ name: '[DEFAULT]', options })),
  getApps: vi.fn(() => [] as unknown[]),
  initializeAppCheck: vi.fn((app: unknown, opts: unknown) => ({ app, opts })),
  ReCaptchaEnterpriseProvider: vi.fn(function (this: { siteKey: string }, siteKey: string) {
    this.siteKey = siteKey;
  }),
  getAuth: vi.fn(() => ({ currentUser: null })),
  onAuthStateChanged: vi.fn((_auth: unknown, cb: (user: null) => void) => {
    cb(null);
    return () => {};
  }),
  initializeFirestore: vi.fn(() => ({ type: 'firestore' })),
  getFirestore: vi.fn(() => ({ type: 'firestore' })),
}));

vi.mock('firebase/app', () => ({
  initializeApp: sdkMocks.initializeApp,
  getApps: sdkMocks.getApps,
}));

vi.mock('firebase/app-check', () => ({
  initializeAppCheck: sdkMocks.initializeAppCheck,
  ReCaptchaEnterpriseProvider: sdkMocks.ReCaptchaEnterpriseProvider,
}));

vi.mock('firebase/auth', () => ({
  getAuth: sdkMocks.getAuth,
  onAuthStateChanged: sdkMocks.onAuthStateChanged,
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  EmailAuthProvider: { credential: vi.fn() },
  updateProfile: vi.fn(),
  sendEmailVerification: vi.fn(),
  reload: vi.fn(),
  getIdToken: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signOut: vi.fn(),
  reauthenticateWithCredential: vi.fn(),
  reauthenticateWithPopup: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  initializeFirestore: sdkMocks.initializeFirestore,
  getFirestore: sdkMocks.getFirestore,
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  runTransaction: vi.fn(),
  writeBatch: vi.fn(),
}));

import { resetFirebaseInstancesForTesting } from '../cloud/firebaseConfig.js';
import { firebaseProvider } from '../cloud/firebaseProvider.js';
import {
  clearCloudSessionHint,
  CLOUD_SESSION_HINT_KEY,
  CloudAuthLazyController,
  hasStoredCloudSessionHint,
  persistCloudSessionHint,
  resolveInitialCloudActivation,
  useCloudAuth,
  type SessionHintStorage,
  type UseCloudAuthReturn,
} from '../hooks/useCloudAuth.js';
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

function createMemoryHintStorage(initialEntries: Record<string, string> = {}): SessionHintStorage & {
  store: Map<string, string>;
} {
  const store = new Map<string, string>(Object.entries(initialEntries));
  return {
    store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    get length() {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  };
}

function makeFakeProvider(options: {
  configured?: boolean;
  emitOnSubscribe?: 'none' | 'null' | 'user';
  subscribedUser?: CloudUser | null;
} = {}) {
  let configured = options.configured ?? true;
  const listeners = new Set<(user: CloudUser | null) => void>();
  let unsubCalls = 0;

  const defaultVerifiedUser: CloudUser = {
    uid: 'uid-alice',
    email: 'alice@example.com',
    emailVerified: true,
    displayName: 'alice_mtg',
    providerIds: ['password'],
  };

  let currentUser: CloudUser | null =
    options.subscribedUser !== undefined
      ? options.subscribedUser
      : options.emitOnSubscribe === 'user'
        ? defaultVerifiedUser
        : null;

  let profile: UserProfile | null = {
    uid: 'uid-alice',
    handle: 'alice_mtg',
    handleLower: 'alice_mtg',
    displayName: 'Alice',
    createdAt: '2026-11-15T00:00:00.000Z',
    updatedAt: '2026-11-15T00:00:00.000Z',
  };

  const onAuthStateChangedSpy = vi.fn((cb: (user: CloudUser | null) => void) => {
    listeners.add(cb);
    if (options.emitOnSubscribe === 'null') {
      cb(null);
    } else if (options.emitOnSubscribe === 'user') {
      cb(currentUser);
    }
    return () => {
      unsubCalls += 1;
      listeners.delete(cb);
    };
  });

  const signUpWithEmailSpy = vi.fn(
    async (email: string, _password: string, handle: string): Promise<CloudUser> => {
      currentUser = {
        uid: 'uid-new',
        email,
        emailVerified: false,
        displayName: handle,
        providerIds: ['password'],
      };
      return currentUser;
    },
  );

  const signInWithEmailSpy = vi.fn(async (email: string): Promise<CloudUser> => {
    currentUser = {
      ...defaultVerifiedUser,
      email,
    };
    return currentUser;
  });

  const signInWithGoogleSpy = vi.fn(async (): Promise<CloudUser> => {
    currentUser = {
      uid: 'uid-google',
      email: 'planeswalker@gmail.com',
      emailVerified: true,
      displayName: 'Planes Walker',
      providerIds: ['google.com'],
    };
    return currentUser;
  });

  const sendPasswordResetSpy = vi.fn(async (): Promise<void> => {});

  const reloadUserSpy = vi.fn(async (): Promise<CloudUser | null> => {
    if (currentUser) {
      currentUser = { ...currentUser, emailVerified: true };
    }
    return currentUser;
  });

  const signOutSpy = vi.fn(async (): Promise<void> => {
    currentUser = null;
  });

  const deleteAccountAndDataSpy = vi.fn(async (): Promise<void> => {
    currentUser = null;
    profile = null;
  });

  const getMyProfileSpy = vi.fn(async (uid: string): Promise<UserProfile | null> => {
    return profile && profile.uid === uid ? profile : null;
  });

  const claimHandleSpy = vi.fn(
    async (uid: string, handle: string, displayName?: string): Promise<UserProfile> => {
      const normalized = handle.replace(/^@/, '').toLowerCase();
      profile = {
        uid,
        handle: normalized,
        handleLower: normalized,
        displayName: displayName ?? normalized,
        createdAt: '2026-11-15T00:00:00.000Z',
        updatedAt: '2026-11-15T00:00:00.000Z',
      };
      return profile;
    },
  );

  const provider: CloudProvider = {
    isConfigured: () => configured,
    onAuthStateChanged: onAuthStateChangedSpy,
    signUpWithEmail: signUpWithEmailSpy,
    signInWithEmail: signInWithEmailSpy,
    signInWithGoogle: signInWithGoogleSpy,
    resendVerificationEmail: async () => {},
    reloadUser: reloadUserSpy,
    sendPasswordReset: sendPasswordResetSpy,
    signOut: signOutSpy,
    getMyProfile: getMyProfileSpy,
    claimHandle: claimHandleSpy,
    pullDecksSince: async () => [],
    pushDeck: async (deck): Promise<PushResult<CloudDeckRecord>> => ({
      status: 'synced',
      record: deck,
    }),
    pullCardListsSince: async () => [],
    pushCardList: async (list): Promise<PushResult<CloudCardListRecord>> => ({
      status: 'synced',
      record: list,
    }),
    getSharedDeckById: async () => null,
    listFriendships: async (): Promise<FriendshipRecord[]> => [],
    sendFriendRequestByHandle: async () => {
      throw new Error('unused');
    },
    acceptFriendRequest: async () => {},
    removeFriendship: async () => {},
    getFriendDecks: async (): Promise<FriendDeckSummary[]> => [],
    deleteAccountAndData: deleteAccountAndDataSpy,
  };

  return {
    provider,
    setConfigured: (value: boolean) => {
      configured = value;
    },
    setProfile: (next: UserProfile | null) => {
      profile = next;
    },
    emitAuth: (nextUser: CloudUser | null) => {
      currentUser = nextUser;
      for (const listener of listeners) {
        listener(nextUser);
      }
    },
    getListenerCount: () => listeners.size,
    getUnsubscribeCount: () => unsubCalls,
    spies: {
      onAuthStateChanged: onAuthStateChangedSpy,
      signUpWithEmail: signUpWithEmailSpy,
      signInWithEmail: signInWithEmailSpy,
      signInWithGoogle: signInWithGoogleSpy,
      sendPasswordReset: sendPasswordResetSpy,
      reloadUser: reloadUserSpy,
      signOut: signOutSpy,
      deleteAccountAndData: deleteAccountAndDataSpy,
      getMyProfile: getMyProfileSpy,
      claimHandle: claimHandleSpy,
    },
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

describe('Lazy Firebase + App Check Initialization (useCloudAuth & CloudAuthLazyController)', () => {
  const activeControllers: CloudAuthLazyController[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetFirebaseInstancesForTesting();
  });

  afterEach(() => {
    while (activeControllers.length > 0) {
      activeControllers.pop()!.dispose();
    }
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetFirebaseInstancesForTesting();
  });

  it('detects, persists, clears, and guards cloud session hints safely across storage modes', () => {
    expect(CLOUD_SESSION_HINT_KEY).toBe('ripple99_cloud_session_hint_v1');

    expect(hasStoredCloudSessionHint(null)).toBe(false);

    const empty = createMemoryHintStorage();
    expect(hasStoredCloudSessionHint(empty)).toBe(false);

    persistCloudSessionHint(empty);
    expect(empty.getItem(CLOUD_SESSION_HINT_KEY)).toBe('1');
    expect(hasStoredCloudSessionHint(empty)).toBe(true);

    clearCloudSessionHint(empty);
    expect(empty.getItem(CLOUD_SESSION_HINT_KEY)).toBeNull();
    expect(hasStoredCloudSessionHint(empty)).toBe(false);

    // Non-'1' hint value does not trigger auto-connect
    expect(hasStoredCloudSessionHint(createMemoryHintStorage({ [CLOUD_SESSION_HINT_KEY]: '0' }))).toBe(
      false,
    );

    // Any existing Firebase Auth localStorage session key triggers auto-connect
    const fbSessionStorage = createMemoryHintStorage({
      'firebase:authUser:AIzaTestKey:[DEFAULT]': '{"uid":"uid-1"}',
    });
    expect(hasStoredCloudSessionHint(fbSessionStorage)).toBe(true);

    // Restricted/throwing storage falls back cleanly without crashing
    const throwingStorage: SessionHintStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(hasStoredCloudSessionHint(throwingStorage)).toBe(false);
    expect(() => persistCloudSessionHint(throwingStorage)).not.toThrow();
    expect(() => clearCloudSessionHint(throwingStorage)).not.toThrow();

    expect(
      resolveInitialCloudActivation({ isConfigured: false, autoConnect: true, storage: empty }),
    ).toBe(false);
    expect(
      resolveInitialCloudActivation({
        isConfigured: false,
        autoConnect: false,
        storage: createMemoryHintStorage({ [CLOUD_SESSION_HINT_KEY]: '1' }),
      }),
    ).toBe(false);
    expect(
      resolveInitialCloudActivation({ isConfigured: true, autoConnect: false, storage: empty }),
    ).toBe(false);
    expect(
      resolveInitialCloudActivation({ isConfigured: true, autoConnect: true, storage: empty }),
    ).toBe(true);
    expect(
      resolveInitialCloudActivation({
        isConfigured: true,
        autoConnect: false,
        storage: fbSessionStorage,
      }),
    ).toBe(true);
  });

  it('stays dormant on anonymous cold boot and never initializes Firebase App, App Check, or Auth until activated', () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-key');
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test.firebaseapp.com');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');
    vi.stubEnv('VITE_FIREBASE_APP_ID', '1:123:web:abc');
    vi.stubEnv('VITE_FIREBASE_APP_CHECK_SITE_KEY', 'recaptcha-site-key');

    const storage = createMemoryHintStorage();
    vi.stubGlobal('window', { localStorage: storage });

    const realController = new CloudAuthLazyController({
      provider: firebaseProvider,
      autoConnect: false,
      storage,
    });
    activeControllers.push(realController);
    realController.start();

    expect(realController.getSnapshot()).toEqual({
      isConfigured: true,
      isCloudActivated: false,
      user: null,
      profile: null,
      authLoading: false,
      profileLoading: false,
      error: null,
    });

    expect(sdkMocks.initializeApp).not.toHaveBeenCalled();
    expect(sdkMocks.initializeAppCheck).not.toHaveBeenCalled();
    expect(sdkMocks.getAuth).not.toHaveBeenCalled();
    expect(sdkMocks.onAuthStateChanged).not.toHaveBeenCalled();

    // Explicit activation wakes Firebase + App Check + Auth exactly once
    realController.activateCloud();
    realController.activateCloud();

    expect(realController.getSnapshot().isCloudActivated).toBe(true);
    expect(sdkMocks.initializeApp).toHaveBeenCalledTimes(1);
    expect(sdkMocks.initializeAppCheck).toHaveBeenCalledTimes(1);
    expect(sdkMocks.getAuth).toHaveBeenCalledTimes(1);
    expect(sdkMocks.onAuthStateChanged).toHaveBeenCalledTimes(1);
  });

  it('auto-subscribes on mount when a stored session hint or firebase:authUser key exists', async () => {
    const hintStorage = createMemoryHintStorage({ [CLOUD_SESSION_HINT_KEY]: '1' });
    const fake = makeFakeProvider({ configured: true, emitOnSubscribe: 'none' });
    const controller = new CloudAuthLazyController({
      provider: fake.provider,
      autoConnect: false,
      storage: hintStorage,
    });
    activeControllers.push(controller);

    // Hint must NOT be wiped before onAuthStateChanged responds
    expect(hasStoredCloudSessionHint(hintStorage)).toBe(true);
    expect(controller.getSnapshot().isCloudActivated).toBe(true);
    expect(controller.getSnapshot().authLoading).toBe(true);

    controller.start();
    expect(fake.spies.onAuthStateChanged).toHaveBeenCalledTimes(1);
    expect(hasStoredCloudSessionHint(hintStorage)).toBe(true);

    // Auth resolves signed-in user -> authLoading false, profile loads
    fake.emitAuth({
      uid: 'uid-alice',
      email: 'alice@example.com',
      emailVerified: true,
      displayName: 'alice_mtg',
      providerIds: ['password'],
    });
    await flushMicrotasks();

    expect(controller.getSnapshot().authLoading).toBe(false);
    expect(controller.getSnapshot().user?.uid).toBe('uid-alice');
    expect(controller.getSnapshot().profile?.handle).toBe('alice_mtg');
    expect(hintStorage.getItem(CLOUD_SESSION_HINT_KEY)).toBe('1');

    // Also verifies firebase:authUser:* legacy/SDK key auto-subscribes
    const fbStorage = createMemoryHintStorage({
      'firebase:authUser:key:[DEFAULT]': '{"uid":"uid-fb"}',
    });
    const fake2 = makeFakeProvider({ configured: true, emitOnSubscribe: 'none' });
    const controller2 = new CloudAuthLazyController({
      provider: fake2.provider,
      storage: fbStorage,
    });
    activeControllers.push(controller2);
    controller2.start();
    expect(controller2.getSnapshot().isCloudActivated).toBe(true);
    expect(fake2.spies.onAuthStateChanged).toHaveBeenCalledTimes(1);
  });

  it('auto-subscribes when autoConnect is true on mount or enabled later, and activateCloud subscribes once', () => {
    const emptyStorage = createMemoryHintStorage();
    const fake = makeFakeProvider({ configured: true, emitOnSubscribe: 'none' });

    const eager = new CloudAuthLazyController({
      provider: fake.provider,
      autoConnect: true,
      storage: emptyStorage,
    });
    activeControllers.push(eager);
    expect(eager.getSnapshot().isCloudActivated).toBe(true);
    expect(eager.getSnapshot().authLoading).toBe(true);
    eager.start();
    expect(fake.spies.onAuthStateChanged).toHaveBeenCalledTimes(1);
    eager.activateCloud();
    expect(fake.spies.onAuthStateChanged).toHaveBeenCalledTimes(1);

    // Late autoConnect flip (e.g. URL intent) activates once
    const fakeLate = makeFakeProvider({ configured: true, emitOnSubscribe: 'none' });
    const late = new CloudAuthLazyController({
      provider: fakeLate.provider,
      autoConnect: false,
      storage: emptyStorage,
    });
    activeControllers.push(late);
    const stop = late.start();
    expect(fakeLate.spies.onAuthStateChanged).not.toHaveBeenCalled();

    late.setAutoConnect(false);
    expect(fakeLate.spies.onAuthStateChanged).not.toHaveBeenCalled();

    late.setAutoConnect(true);
    late.setAutoConnect(true);
    expect(late.getSnapshot().isCloudActivated).toBe(true);
    expect(fakeLate.spies.onAuthStateChanged).toHaveBeenCalledTimes(1);

    // Dispose unsubscribes and a subsequent start (React StrictMode remount) cleanly re-subscribes
    stop();
    expect(fakeLate.getUnsubscribeCount()).toBe(1);
    late.start();
    expect(fakeLate.spies.onAuthStateChanged).toHaveBeenCalledTimes(2);
  });

  it('activates on sign-in/sign-up/reset, persists hint on auth, and clears hint on signOut, deleteAccount, and null auth check', async () => {
    const storage = createMemoryHintStorage();
    const fake = makeFakeProvider({ configured: true, emitOnSubscribe: 'none' });
    const controller = new CloudAuthLazyController({
      provider: fake.provider,
      autoConnect: false,
      storage,
    });
    activeControllers.push(controller);
    controller.start();

    // 1. sendPasswordReset wakes cloud auth without marking a signed-in session hint
    await controller.sendPasswordReset('alice@example.com');
    expect(controller.getSnapshot().isCloudActivated).toBe(true);
    expect(fake.spies.onAuthStateChanged).toHaveBeenCalledTimes(1);
    expect(storage.getItem(CLOUD_SESSION_HINT_KEY)).toBeNull();

    // 2. signUpWithEmail on fresh dormant controller wakes auth, persists hint, and stays unverified until reloaded
    const storageSignUp = createMemoryHintStorage();
    const fakeSignUp = makeFakeProvider({ configured: true, emitOnSubscribe: 'null' });
    fakeSignUp.setProfile(null);
    const signUpCtrl = new CloudAuthLazyController({
      provider: fakeSignUp.provider,
      storage: storageSignUp,
    });
    activeControllers.push(signUpCtrl);
    signUpCtrl.start();

    await signUpCtrl.signUpWithEmail('new@example.com', 'StrongPass1!', 'new_mage');
    await flushMicrotasks();
    expect(signUpCtrl.getSnapshot().isCloudActivated).toBe(true);
    expect(fakeSignUp.spies.onAuthStateChanged).toHaveBeenCalledTimes(1);
    expect(storageSignUp.getItem(CLOUD_SESSION_HINT_KEY)).toBe('1');
    expect(signUpCtrl.getSnapshot().user?.emailVerified).toBe(false);
    expect(signUpCtrl.getSnapshot().profile).toBeNull();

    await signUpCtrl.refreshVerificationStatus();
    await flushMicrotasks();
    expect(signUpCtrl.getSnapshot().user?.emailVerified).toBe(true);
    expect(signUpCtrl.getSnapshot().profile?.handle).toBe('new_mage');

    // 3. signOut clears hint & user/profile
    await signUpCtrl.signOut();
    expect(storageSignUp.getItem(CLOUD_SESSION_HINT_KEY)).toBeNull();
    expect(signUpCtrl.getSnapshot().user).toBeNull();
    expect(signUpCtrl.getSnapshot().profile).toBeNull();

    // 4. signInWithGoogle on dormant controller wakes auth, sets hint, and deleteAccount clears hint
    const storageGoogle = createMemoryHintStorage();
    const fakeGoogle = makeFakeProvider({ configured: true, emitOnSubscribe: 'none' });
    fakeGoogle.setProfile(null);
    const googleCtrl = new CloudAuthLazyController({
      provider: fakeGoogle.provider,
      storage: storageGoogle,
    });
    activeControllers.push(googleCtrl);
    googleCtrl.start();

    await googleCtrl.signInWithGoogle();
    await flushMicrotasks();
    expect(googleCtrl.getSnapshot().isCloudActivated).toBe(true);
    expect(storageGoogle.getItem(CLOUD_SESSION_HINT_KEY)).toBe('1');
    expect(googleCtrl.getSnapshot().user?.uid).toBe('uid-google');

    // Failed deleteAccount must preserve user and session hint
    fakeGoogle.spies.deleteAccountAndData.mockRejectedValueOnce({
      code: 'auth/requires-recent-login',
      message: 'Recent login required',
    });
    await expect(googleCtrl.deleteAccount()).rejects.toBeDefined();
    expect(storageGoogle.getItem(CLOUD_SESSION_HINT_KEY)).toBe('1');
    expect(googleCtrl.getSnapshot().user?.uid).toBe('uid-google');

    // Successful deleteAccount clears hint and user/profile
    await googleCtrl.deleteAccount();
    expect(storageGoogle.getItem(CLOUD_SESSION_HINT_KEY)).toBeNull();
    expect(googleCtrl.getSnapshot().user).toBeNull();
    expect(googleCtrl.getSnapshot().profile).toBeNull();

    // 5. signInWithEmail failure does NOT persist session hint
    const storageFail = createMemoryHintStorage();
    const fakeFail = makeFakeProvider({ configured: true, emitOnSubscribe: 'none' });
    fakeFail.spies.signInWithEmail.mockRejectedValueOnce({
      code: 'auth/wrong-password',
      message: 'Wrong password',
    });
    const failCtrl = new CloudAuthLazyController({
      provider: fakeFail.provider,
      storage: storageFail,
    });
    activeControllers.push(failCtrl);
    failCtrl.start();

    await expect(failCtrl.signInWithEmail('alice@example.com', 'WrongPass1!')).rejects.toBeDefined();
    expect(failCtrl.getSnapshot().isCloudActivated).toBe(true);
    expect(failCtrl.getSnapshot().error).toMatch(/incorrect email or password/i);
    expect(storageFail.getItem(CLOUD_SESSION_HINT_KEY)).toBeNull();

    // 6. onAuthStateChanged emitting null after signed-in state (or stale hint check) clears hint
    const staleStorage = createMemoryHintStorage({ [CLOUD_SESSION_HINT_KEY]: '1' });
    const fakeStale = makeFakeProvider({ configured: true, emitOnSubscribe: 'none' });
    const staleCtrl = new CloudAuthLazyController({
      provider: fakeStale.provider,
      storage: staleStorage,
    });
    activeControllers.push(staleCtrl);
    staleCtrl.start();
    expect(staleStorage.getItem(CLOUD_SESSION_HINT_KEY)).toBe('1');

    fakeStale.emitAuth({
      uid: 'uid-alice',
      email: 'alice@example.com',
      emailVerified: true,
      displayName: 'alice_mtg',
      providerIds: ['password'],
    });
    await flushMicrotasks();
    expect(staleStorage.getItem(CLOUD_SESSION_HINT_KEY)).toBe('1');

    fakeStale.emitAuth(null);
    expect(staleStorage.getItem(CLOUD_SESSION_HINT_KEY)).toBeNull();
    expect(staleCtrl.getSnapshot().user).toBeNull();
    expect(staleCtrl.getSnapshot().authLoading).toBe(false);
  });

  it('never subscribes when provider.isConfigured() is false, even with hint, autoConnect, or activateCloud', async () => {
    const storage = createMemoryHintStorage({
      [CLOUD_SESSION_HINT_KEY]: '1',
      'firebase:authUser:key:[DEFAULT]': '{"uid":"uid-1"}',
    });
    const fake = makeFakeProvider({ configured: false, emitOnSubscribe: 'none' });
    const controller = new CloudAuthLazyController({
      provider: fake.provider,
      autoConnect: true,
      storage,
    });
    activeControllers.push(controller);

    controller.start();
    controller.activateCloud();
    controller.setAutoConnect(true);

    expect(controller.getSnapshot().isConfigured).toBe(false);
    expect(controller.getSnapshot().isCloudActivated).toBe(false);
    expect(controller.getSnapshot().authLoading).toBe(false);
    expect(fake.spies.onAuthStateChanged).not.toHaveBeenCalled();

    // Direct signIn attempt fails cleanly and still never subscribes
    fake.spies.signInWithEmail.mockRejectedValueOnce(new Error('Cloud sync is not configured.'));
    await expect(controller.signInWithEmail('a@b.com', 'StrongPass1!')).rejects.toThrow(
      /not configured/i,
    );
    expect(controller.getSnapshot().isCloudActivated).toBe(false);
    expect(fake.spies.onAuthStateChanged).not.toHaveBeenCalled();
  });

  it('supports both legacy useCloudAuth(provider) and useCloudAuth({ provider, autoConnect }) call signatures cleanly', () => {
    const snapshots: Array<{ label: string; state: UseCloudAuthReturn }> = [];

    function Harness(props: {
      label: string;
      arg?: CloudProvider | { provider?: CloudProvider; autoConnect?: boolean };
    }) {
      const state = props.arg !== undefined ? useCloudAuth(props.arg) : useCloudAuth();
      snapshots.push({ label: props.label, state });
      return createElement(
        'div',
        { 'data-activated': String(state.isCloudActivated), 'data-loading': String(state.authLoading) },
        state.isCloudActivated ? 'active' : 'dormant',
      );
    }

    const fakePositional = makeFakeProvider({ configured: true });
    const positionalHtml = renderToStaticMarkup(
      createElement(Harness, { label: 'positional', arg: fakePositional.provider }),
    );
    expect(positionalHtml).toContain('data-activated="false"');
    expect(positionalHtml).toContain('data-loading="false"');
    expect(fakePositional.spies.onAuthStateChanged).not.toHaveBeenCalled();

    const fakeDormant = makeFakeProvider({ configured: true });
    const dormantHtml = renderToStaticMarkup(
      createElement(Harness, {
        label: 'options-dormant',
        arg: { provider: fakeDormant.provider, autoConnect: false },
      }),
    );
    expect(dormantHtml).toContain('data-activated="false"');
    expect(dormantHtml).toContain('data-loading="false"');
    expect(fakeDormant.spies.onAuthStateChanged).not.toHaveBeenCalled();

    const fakeAuto = makeFakeProvider({ configured: true });
    const autoHtml = renderToStaticMarkup(
      createElement(Harness, {
        label: 'options-auto',
        arg: { provider: fakeAuto.provider, autoConnect: true },
      }),
    );
    expect(autoHtml).toContain('data-activated="true"');
    expect(autoHtml).toContain('data-loading="true"');

    // Default no-arg call (using firebaseProvider) stays dormant and never touches Firebase SDK
    const defaultHtml = renderToStaticMarkup(createElement(Harness, { label: 'default' }));
    expect(defaultHtml).toContain('data-activated="false"');
    expect(sdkMocks.initializeApp).not.toHaveBeenCalled();
    expect(sdkMocks.initializeAppCheck).not.toHaveBeenCalled();
    expect(sdkMocks.getAuth).not.toHaveBeenCalled();

    const positionalSnap = snapshots.find((s) => s.label === 'positional')!.state;
    expect(typeof positionalSnap.activateCloud).toBe('function');
  });
});
