import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  clearPendingHandleFromStorage,
  lazyFirebaseProvider,
  readPendingHandleFromStorage,
  type StorageLike,
} from '../cloud/lazyFirebaseProvider.js';
import { humanizeCloudError, suggestHandleFromEmail, validateHandle } from '../cloud/validation.js';
import type { CloudProvider, CloudUser, UserProfile } from '../types/cloud.js';

export const CLOUD_SESSION_HINT_KEY = 'ripple99_cloud_session_hint_v1';

const FIREBASE_AUTH_USER_STORAGE_PREFIX = 'firebase:authUser:';
const MAX_AUTO_CLAIM_ATTEMPTS = 3;

export interface SessionHintStorage extends StorageLike {
  length?: number;
  key?: (index: number) => string | null;
}

export interface UseCloudAuthOptions {
  provider?: CloudProvider;
  autoConnect?: boolean;
}

export interface CloudAuthSnapshot {
  isConfigured: boolean;
  isCloudActivated: boolean;
  user: CloudUser | null;
  profile: UserProfile | null;
  authLoading: boolean;
  profileLoading: boolean;
  error: string | null;
}

export interface UseCloudAuthReturn extends CloudAuthSnapshot {
  activateCloud: () => void;
  clearError: () => void;
  signUpWithEmail: (email: string, password: string, handle: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshVerificationStatus: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateHandle: (
    newHandle: string,
    displayName?: string,
    avatarCommanderId?: string | null,
  ) => Promise<void>;
  deleteAccount: (reauthPassword?: string) => Promise<void>;
}

export interface CloudAuthLazyControllerOptions {
  provider?: CloudProvider;
  autoConnect?: boolean;
  storage?: SessionHintStorage | null;
}

function getDefaultSessionHintStorage(): SessionHintStorage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Ignore storage access failures in restricted browser modes.
  }
  return null;
}

function isHandleTakenError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /already taken/i.test(message);
}

function isCloudProvider(value: unknown): value is CloudProvider {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as CloudProvider).isConfigured === 'function' &&
    typeof (value as CloudProvider).onAuthStateChanged === 'function'
  );
}

/**
 * Returns `true` when storage contains either Ripple99's persisted session hint (`'1'`)
 * or any Firebase Auth persisted session key (`firebase:authUser:*`).
 */
export function hasStoredCloudSessionHint(
  storage: SessionHintStorage | null = getDefaultSessionHintStorage(),
): boolean {
  if (!storage) return false;
  try {
    if (storage.getItem(CLOUD_SESSION_HINT_KEY) === '1') {
      return true;
    }
    if (typeof storage.length === 'number' && typeof storage.key === 'function') {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (typeof key === 'string' && key.startsWith(FIREBASE_AUTH_USER_STORAGE_PREFIX)) {
          return true;
        }
      }
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Persists the lightweight cloud session hint flag so returning signed-in users
 * automatically reconnect Firebase Auth & App Check on load.
 */
export function persistCloudSessionHint(
  storage: SessionHintStorage | null = getDefaultSessionHintStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(CLOUD_SESSION_HINT_KEY, '1');
  } catch {
    // Ignore storage quota or privacy-mode errors.
  }
}

/**
 * Clears the persisted cloud session hint flag so signed-out visitors stay dormant
 * on future visits without initializing Firebase or App Check.
 */
export function clearCloudSessionHint(
  storage: SessionHintStorage | null = getDefaultSessionHintStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(CLOUD_SESSION_HINT_KEY);
  } catch {
    // Ignore storage access failures.
  }
}

/**
 * Determines whether cloud authentication should auto-subscribe on mount.
 * Anonymous cold visits (`autoConnect` false and no stored hint) stay dormant.
 */
export function resolveInitialCloudActivation(options: {
  isConfigured: boolean;
  autoConnect?: boolean;
  storage?: SessionHintStorage | null;
}): boolean {
  if (!options.isConfigured) {
    return false;
  }
  return options.autoConnect === true || hasStoredCloudSessionHint(options.storage);
}

/**
 * Stateful, React-free controller coordinating lazy Firebase Auth subscription,
 * session hint persistence, automatic handle claiming, and profile loading.
 */
export class CloudAuthLazyController {
  private readonly provider: CloudProvider;
  private readonly injectedStorage?: SessionHintStorage | null;

  private listeners = new Set<() => void>();
  private state: CloudAuthSnapshot;
  private started = false;
  private authUnsubscribe: (() => void) | null = null;
  private authActionsInFlight = 0;
  private hadObservedSignedInUser = false;
  private autoClaimAttemptedUid: string | null = null;
  private lastProfileTriggerKey: string | null = null;
  private profileRunId = 0;

  constructor(options: CloudAuthLazyControllerOptions = {}) {
    this.provider = options.provider ?? lazyFirebaseProvider;
    this.injectedStorage = options.storage;

    const isConfigured = this.provider.isConfigured();
    const initialActivated = resolveInitialCloudActivation({
      isConfigured,
      autoConnect: options.autoConnect,
      storage: this.getStorage(),
    });

    this.state = {
      isConfigured,
      isCloudActivated: initialActivated,
      user: null,
      profile: null,
      authLoading: initialActivated,
      profileLoading: false,
      error: null,
    };
  }

  private getStorage(): SessionHintStorage | null {
    return this.injectedStorage !== undefined
      ? this.injectedStorage
      : getDefaultSessionHintStorage();
  }

  getSnapshot(): CloudAuthSnapshot {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private updateState(patch: Partial<CloudAuthSnapshot>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      listener();
    }
  }

  start(): () => void {
    this.started = true;
    if (this.state.isCloudActivated && this.provider.isConfigured()) {
      this.ensureAuthSubscription();
    }
    return () => {
      this.dispose();
    };
  }

  dispose(): void {
    this.started = false;
    this.profileRunId += 1;
    this.lastProfileTriggerKey = null;
    if (this.authUnsubscribe) {
      const unsub = this.authUnsubscribe;
      this.authUnsubscribe = null;
      unsub();
    }
  }

  setAutoConnect(autoConnect: boolean): void {
    if (autoConnect && this.provider.isConfigured() && !this.state.isCloudActivated) {
      this.activateCloud();
    }
  }

  activateCloud = (): void => {
    if (!this.provider.isConfigured()) {
      return;
    }
    if (!this.state.isCloudActivated) {
      this.updateState({ isCloudActivated: true });
    }
    if (this.started) {
      this.ensureAuthSubscription();
    }
  };

  clearError = (): void => {
    if (this.state.error !== null) {
      this.updateState({ error: null });
    }
  };

  private ensureAuthSubscription(): void {
    if (!this.started || this.authUnsubscribe || !this.provider.isConfigured()) {
      return;
    }

    let settledSynchronously = false;
    let registeredUnsubscribe = false;

    const unsubscribe = this.provider.onAuthStateChanged((nextUser) => {
      settledSynchronously = true;
      if (registeredUnsubscribe && !this.authUnsubscribe) {
        return;
      }
      this.handleAuthStateChanged(nextUser);
    });

    if (this.started) {
      this.authUnsubscribe = unsubscribe;
      registeredUnsubscribe = true;
      if (!settledSynchronously && this.authActionsInFlight === 0) {
        this.updateState({ authLoading: true });
      }
    } else {
      unsubscribe();
    }
  }

  private applySignedInUser(nextUser: CloudUser, clearAuthLoading = false): void {
    this.hadObservedSignedInUser = true;
    persistCloudSessionHint(this.getStorage());
    this.updateState({
      user: nextUser,
      ...(clearAuthLoading ? { authLoading: false } : {}),
    });
    this.syncProfileForUser(nextUser);
  }

  private resetSignedOutState(clearAuthLoading = false): void {
    clearCloudSessionHint(this.getStorage());
    this.hadObservedSignedInUser = false;
    this.autoClaimAttemptedUid = null;
    this.profileRunId += 1;
    this.lastProfileTriggerKey = null;
    this.updateState({
      user: null,
      profile: null,
      profileLoading: false,
      ...(clearAuthLoading ? { authLoading: false } : {}),
    });
  }

  private handleAuthStateChanged(nextUser: CloudUser | null): void {
    if (nextUser) {
      this.applySignedInUser(nextUser, this.authActionsInFlight === 0);
      return;
    }

    // Avoid wiping the session hint or dropping loading state while an interactive sign-in/up is running.
    if (this.authActionsInFlight > 0) {
      return;
    }

    this.resetSignedOutState(true);
  }

  private syncProfileForUser(user: CloudUser | null): void {
    if (!this.provider.isConfigured() || !user || !user.emailVerified) {
      this.profileRunId += 1;
      this.lastProfileTriggerKey = null;
      this.updateState({ profile: null, profileLoading: false });
      return;
    }

    const providerIdsKey = user.providerIds.join(',');
    const triggerKey = [
      user.uid,
      '1',
      user.email ?? '',
      user.displayName ?? '',
      providerIdsKey,
    ].join('|');

    if (this.lastProfileTriggerKey === triggerKey) {
      return;
    }
    this.lastProfileTriggerKey = triggerKey;

    const runId = ++this.profileRunId;
    void this.loadOrClaimProfile(user, runId);
  }

  private async loadOrClaimProfile(user: CloudUser, runId: number): Promise<void> {
    this.updateState({ profileLoading: true });
    try {
      const existing = await this.provider.getMyProfile(user.uid);
      if (runId !== this.profileRunId) return;

      const storage = this.getStorage();
      if (existing) {
        clearPendingHandleFromStorage(user.uid, storage);
        this.updateState({ profile: existing });
        return;
      }

      if (this.autoClaimAttemptedUid === user.uid) {
        return;
      }
      this.autoClaimAttemptedUid = user.uid;

      const pendingHandle = readPendingHandleFromStorage(user.uid, storage);
      const candidates: string[] = [];
      if (pendingHandle && validateHandle(pendingHandle).valid) {
        candidates.push(pendingHandle);
      } else if (
        user.providerIds.includes('password') &&
        user.displayName &&
        validateHandle(user.displayName).valid
      ) {
        candidates.push(validateHandle(user.displayName).normalized);
      }

      const emailSeed = user.email ?? user.displayName ?? 'player';
      for (let i = 0; i < MAX_AUTO_CLAIM_ATTEMPTS; i += 1) {
        candidates.push(suggestHandleFromEmail(emailSeed));
      }

      let lastErr: unknown = null;
      for (const candidate of candidates) {
        if (runId !== this.profileRunId) return;
        try {
          const preferredDisplay = user.displayName?.trim() || candidate;
          const claimed = await this.provider.claimHandle(user.uid, candidate, preferredDisplay);
          if (runId === this.profileRunId) {
            this.updateState({ profile: claimed });
          }
          return;
        } catch (claimErr) {
          lastErr = claimErr;
          if (!isHandleTakenError(claimErr)) {
            throw claimErr;
          }
        }
      }

      if (lastErr) {
        throw lastErr;
      }
    } catch (err) {
      if (runId === this.profileRunId) {
        this.updateState({ error: humanizeCloudError(err).message });
      }
    } finally {
      if (runId === this.profileRunId) {
        this.updateState({ profileLoading: false });
      }
    }
  }

  private async runAuthAction<T>(
    fn: () => Promise<T>,
    loadingField: 'authLoading' | 'profileLoading' = 'authLoading',
  ): Promise<T> {
    this.updateState({ error: null, [loadingField]: true });
    if (loadingField === 'authLoading') {
      this.authActionsInFlight += 1;
    }
    try {
      return await fn();
    } catch (err) {
      const humanized = humanizeCloudError(err);
      this.updateState({ error: humanized.message });
      throw err;
    } finally {
      if (loadingField === 'authLoading') {
        this.authActionsInFlight = Math.max(0, this.authActionsInFlight - 1);
      }
      this.updateState({ [loadingField]: false });
    }
  }

  signUpWithEmail = async (email: string, password: string, handle: string): Promise<void> => {
    await this.runAuthAction(async () => {
      this.activateCloud();
      const created = await this.provider.signUpWithEmail(email, password, handle);
      this.applySignedInUser(created);
    });
  };

  signInWithEmail = async (email: string, password: string): Promise<void> => {
    await this.runAuthAction(async () => {
      this.activateCloud();
      const signedIn = await this.provider.signInWithEmail(email, password);
      this.applySignedInUser(signedIn);
    });
  };

  signInWithGoogle = async (): Promise<void> => {
    await this.runAuthAction(async () => {
      this.activateCloud();
      const signedIn = await this.provider.signInWithGoogle();
      this.applySignedInUser(signedIn);
    });
  };

  resendVerificationEmail = async (): Promise<void> => {
    await this.runAuthAction(() => this.provider.resendVerificationEmail());
  };

  refreshVerificationStatus = async (): Promise<void> => {
    await this.runAuthAction(async () => {
      const reloaded = await this.provider.reloadUser();
      if (reloaded) {
        this.applySignedInUser(reloaded);
      } else {
        this.updateState({ user: null });
        this.syncProfileForUser(null);
      }
    });
  };

  sendPasswordReset = async (email: string): Promise<void> => {
    await this.runAuthAction(async () => {
      this.activateCloud();
      await this.provider.sendPasswordReset(email);
    });
  };

  signOut = async (): Promise<void> => {
    await this.runAuthAction(async () => {
      await this.provider.signOut();
      this.resetSignedOutState();
    });
  };

  updateHandle = async (
    newHandle: string,
    displayName?: string,
    avatarCommanderId?: string | null,
  ): Promise<void> => {
    await this.runAuthAction(async () => {
      const activeUser = this.state.user;
      if (!activeUser || !activeUser.emailVerified) {
        throw new Error('Please sign in and verify your email before updating your handle.');
      }
      const updated = await this.provider.claimHandle(
        activeUser.uid,
        newHandle,
        displayName ?? this.state.profile?.displayName,
        avatarCommanderId,
      );
      this.updateState({ profile: updated });
    }, 'profileLoading');
  };

  deleteAccount = async (reauthPassword?: string): Promise<void> => {
    await this.runAuthAction(async () => {
      const activeUser = this.state.user;
      if (!activeUser) {
        throw new Error('No signed-in account to delete.');
      }
      await this.provider.deleteAccountAndData(activeUser.uid, reauthPassword);
      this.resetSignedOutState();
    });
  };
}

/**
 * React hook managing lazy Firebase authentication state, email verification refresh,
 * automatic profile loading, and seamless handle claiming.
 */
export function useCloudAuth(
  providerOrOptions: CloudProvider | UseCloudAuthOptions = lazyFirebaseProvider,
): UseCloudAuthReturn {
  const provider = isCloudProvider(providerOrOptions)
    ? providerOrOptions
    : (providerOrOptions.provider ?? lazyFirebaseProvider);
  const autoConnect = isCloudProvider(providerOrOptions)
    ? false
    : Boolean(providerOrOptions.autoConnect);

  const autoConnectRef = useRef(autoConnect);
  autoConnectRef.current = autoConnect;

  const controller = useMemo(
    () =>
      new CloudAuthLazyController({
        provider,
        autoConnect: autoConnectRef.current,
      }),
    [provider],
  );

  const [snapshot, setSnapshot] = useState<CloudAuthSnapshot>(() => controller.getSnapshot());

  useEffect(() => {
    setSnapshot(controller.getSnapshot());
    const unsubSnapshot = controller.subscribe(() => {
      setSnapshot(controller.getSnapshot());
    });
    const stopController = controller.start();

    return () => {
      unsubSnapshot();
      stopController();
    };
  }, [controller]);

  useEffect(() => {
    controller.setAutoConnect(autoConnect);
  }, [controller, autoConnect]);

  const activateCloud = useCallback(() => {
    controller.activateCloud();
  }, [controller]);

  const clearError = useCallback(() => {
    controller.clearError();
  }, [controller]);

  const signUpWithEmail = useCallback(
    (email: string, password: string, handle: string) =>
      controller.signUpWithEmail(email, password, handle),
    [controller],
  );

  const signInWithEmail = useCallback(
    (email: string, password: string) => controller.signInWithEmail(email, password),
    [controller],
  );

  const signInWithGoogle = useCallback(() => controller.signInWithGoogle(), [controller]);

  const resendVerificationEmail = useCallback(
    () => controller.resendVerificationEmail(),
    [controller],
  );

  const refreshVerificationStatus = useCallback(
    () => controller.refreshVerificationStatus(),
    [controller],
  );

  const sendPasswordReset = useCallback(
    (email: string) => controller.sendPasswordReset(email),
    [controller],
  );

  const signOut = useCallback(() => controller.signOut(), [controller]);

  const updateHandle = useCallback(
    (newHandle: string, displayName?: string, avatarCommanderId?: string | null) =>
      controller.updateHandle(newHandle, displayName, avatarCommanderId),
    [controller],
  );

  const deleteAccount = useCallback(
    (reauthPassword?: string) => controller.deleteAccount(reauthPassword),
    [controller],
  );

  return {
    ...snapshot,
    activateCloud,
    clearError,
    signUpWithEmail,
    signInWithEmail,
    signInWithGoogle,
    resendVerificationEmail,
    refreshVerificationStatus,
    sendPasswordReset,
    signOut,
    updateHandle,
    deleteAccount,
  };
}
