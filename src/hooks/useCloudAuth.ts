import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearPendingHandleFromStorage,
  firebaseProvider,
  readPendingHandleFromStorage,
} from '../cloud/firebaseProvider.js';
import { humanizeCloudError, suggestHandleFromEmail, validateHandle } from '../cloud/validation.js';
import type { CloudProvider, CloudUser, UserProfile } from '../types/cloud.js';

export interface UseCloudAuthReturn {
  isConfigured: boolean;
  user: CloudUser | null;
  profile: UserProfile | null;
  authLoading: boolean;
  profileLoading: boolean;
  error: string | null;
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

const MAX_AUTO_CLAIM_ATTEMPTS = 3;

function isHandleTakenError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /already taken/i.test(message);
}

/**
 * React hook managing Firebase authentication state, email verification refresh,
 * automatic profile loading, and seamless handle claiming.
 */
export function useCloudAuth(provider: CloudProvider = firebaseProvider): UseCloudAuthReturn {
  const isConfigured = provider.isConfigured();
  const [user, setUser] = useState<CloudUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(isConfigured);
  const [profileLoading, setProfileLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const autoClaimAttemptedUidRef = useRef<string | null>(null);
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // Subscribe to auth state changes
  useEffect(() => {
    if (!provider.isConfigured()) {
      setUser(null);
      setProfile(null);
      setAuthLoading(false);
      setProfileLoading(false);
      return;
    }

    setAuthLoading(true);
    const unsubscribe = provider.onAuthStateChanged((nextUser) => {
      if (!mountedRef.current) return;
      setUser(nextUser);
      setAuthLoading(false);
      if (!nextUser) {
        setProfile(null);
        setProfileLoading(false);
        autoClaimAttemptedUidRef.current = null;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [provider]);

  const providerIdsKey = user?.providerIds.join(',') ?? '';

  // Automatically load /profiles/{uid} once emailVerified === true, claiming a handle if none exists yet.
  useEffect(() => {
    if (!provider.isConfigured() || !user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    if (!user.emailVerified) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    let cancelled = false;

    const loadOrClaimProfile = async () => {
      setProfileLoading(true);
      try {
        const existing = await provider.getMyProfile(user.uid);
        if (cancelled || !mountedRef.current) return;

        if (existing) {
          clearPendingHandleFromStorage(user.uid);
          setProfile(existing);
          return;
        }

        if (autoClaimAttemptedUidRef.current === user.uid) {
          return;
        }
        autoClaimAttemptedUidRef.current = user.uid;

        const pendingHandle = readPendingHandleFromStorage(user.uid);
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
        for (let i = 0; i < MAX_AUTO_CLAIM_ATTEMPTS; i++) {
          candidates.push(suggestHandleFromEmail(emailSeed));
        }

        let lastErr: unknown = null;
        for (const candidate of candidates) {
          if (cancelled || !mountedRef.current) return;
          try {
            const preferredDisplay = user.displayName?.trim() || candidate;
            const claimed = await provider.claimHandle(user.uid, candidate, preferredDisplay);
            if (!cancelled && mountedRef.current) {
              setProfile(claimed);
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
        if (!cancelled && mountedRef.current) {
          setError(humanizeCloudError(err).message);
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setProfileLoading(false);
        }
      }
    };

    void loadOrClaimProfile();

    return () => {
      cancelled = true;
    };
  }, [provider, user?.uid, user?.emailVerified, user?.email, user?.displayName, providerIdsKey]);

  const runAuthAction = useCallback(
    async <T>(fn: () => Promise<T>, setLoading: (v: boolean) => void = setAuthLoading): Promise<T> => {
      setError(null);
      setLoading(true);
      try {
        return await fn();
      } catch (err) {
        const humanized = humanizeCloudError(err);
        if (mountedRef.current) {
          setError(humanized.message);
        }
        throw err;
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [],
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string, handle: string): Promise<void> => {
      await runAuthAction(async () => {
        const created = await provider.signUpWithEmail(email, password, handle);
        if (mountedRef.current) {
          setUser(created);
        }
      });
    },
    [provider, runAuthAction],
  );

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<void> => {
      await runAuthAction(async () => {
        const signedIn = await provider.signInWithEmail(email, password);
        if (mountedRef.current) {
          setUser(signedIn);
        }
      });
    },
    [provider, runAuthAction],
  );

  const signInWithGoogle = useCallback(async (): Promise<void> => {
    await runAuthAction(async () => {
      const signedIn = await provider.signInWithGoogle();
      if (mountedRef.current) {
        setUser(signedIn);
      }
    });
  }, [provider, runAuthAction]);

  const resendVerificationEmail = useCallback(async (): Promise<void> => {
    await runAuthAction(() => provider.resendVerificationEmail());
  }, [provider, runAuthAction]);

  const refreshVerificationStatus = useCallback(async (): Promise<void> => {
    await runAuthAction(async () => {
      const reloaded = await provider.reloadUser();
      if (mountedRef.current) {
        setUser(reloaded);
      }
    });
  }, [provider, runAuthAction]);

  const sendPasswordReset = useCallback(
    async (email: string): Promise<void> => {
      await runAuthAction(() => provider.sendPasswordReset(email));
    },
    [provider, runAuthAction],
  );

  const signOut = useCallback(async (): Promise<void> => {
    await runAuthAction(async () => {
      await provider.signOut();
      if (mountedRef.current) {
        setUser(null);
        setProfile(null);
        autoClaimAttemptedUidRef.current = null;
      }
    });
  }, [provider, runAuthAction]);

  const updateHandle = useCallback(
    async (
      newHandle: string,
      displayName?: string,
      avatarCommanderId?: string | null,
    ): Promise<void> => {
      await runAuthAction(async () => {
        if (!user || !user.emailVerified) {
          throw new Error('Please sign in and verify your email before updating your handle.');
        }
        const updated = await provider.claimHandle(
          user.uid,
          newHandle,
          displayName ?? profile?.displayName,
          avatarCommanderId,
        );
        if (mountedRef.current) {
          setProfile(updated);
        }
      }, setProfileLoading);
    },
    [profile?.displayName, provider, runAuthAction, user],
  );

  const deleteAccount = useCallback(
    async (reauthPassword?: string): Promise<void> => {
      await runAuthAction(async () => {
        if (!user) {
          throw new Error('No signed-in account to delete.');
        }
        await provider.deleteAccountAndData(user.uid, reauthPassword);
        if (mountedRef.current) {
          setUser(null);
          setProfile(null);
          autoClaimAttemptedUidRef.current = null;
        }
      });
    },
    [provider, runAuthAction, user],
  );

  return {
    isConfigured,
    user,
    profile,
    authLoading,
    profileLoading,
    error,
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
