import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lazyFirebaseProvider } from '../cloud/lazyFirebaseProvider.js';
import { humanizeCloudError, normalizeHandle } from '../cloud/validation.js';
import type {
  CloudDeckRecord,
  CloudProvider,
  CloudUser,
  FriendDeckSummary,
  FriendshipRecord,
  UserProfile,
} from '../types/cloud.js';

export interface UseFriendsReturn {
  friendships: FriendshipRecord[];
  incomingRequests: FriendshipRecord[];
  outgoingRequests: FriendshipRecord[];
  acceptedFriends: FriendshipRecord[];
  friendDecksByUid: Record<string, FriendDeckSummary[]>;
  loading: boolean;
  busyPairId: string | null;
  error: string | null;
  clearError: () => void;
  refreshFriends: () => Promise<void>;
  sendFriendRequest: (targetHandle: string) => Promise<void>;
  acceptFriendRequest: (pairId: string) => Promise<void>;
  removeFriendship: (pairId: string) => Promise<void>;
  loadFriendDecks: (friendUid: string) => Promise<void>;
  loadSharedDeck: (deckId: string) => Promise<CloudDeckRecord | null>;
}

/**
 * React hook managing bidirectional friend requests, accepted friends,
 * friend deck catalogs, and shared cloud deck retrieval.
 */
export function useFriends(
  user: CloudUser | null,
  profile: UserProfile | null,
  provider: CloudProvider = lazyFirebaseProvider,
): UseFriendsReturn {
  const [friendships, setFriendships] = useState<FriendshipRecord[]>([]);
  const [friendDecksByUid, setFriendDecksByUid] = useState<Record<string, FriendDeckSummary[]>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [busyPairId, setBusyPairId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const uid = user?.uid ?? null;
  const isVerifiedUser = Boolean(user && user.emailVerified && provider.isConfigured());

  const refreshFriends = useCallback(async (): Promise<void> => {
    if (!uid || !isVerifiedUser) {
      if (mountedRef.current) {
        setFriendships([]);
      }
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const list = await provider.listFriendships(uid);
      if (mountedRef.current) {
        setFriendships(list);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(humanizeCloudError(err).message);
      }
      throw err;
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [isVerifiedUser, provider, uid]);

  useEffect(() => {
    if (!uid || !isVerifiedUser) {
      setFriendships([]);
      setFriendDecksByUid({});
      setLoading(false);
      return;
    }
    void refreshFriends().catch(() => {
      // Error state is already captured inside refreshFriends.
    });
  }, [isVerifiedUser, refreshFriends, uid]);

  const { incomingRequests, outgoingRequests, acceptedFriends } = useMemo(() => {
    const incoming: FriendshipRecord[] = [];
    const outgoing: FriendshipRecord[] = [];
    const accepted: FriendshipRecord[] = [];

    for (const record of friendships) {
      if (record.status === 'accepted') {
        accepted.push(record);
      } else if (uid && record.requestedBy === uid) {
        outgoing.push(record);
      } else {
        incoming.push(record);
      }
    }

    return {
      incomingRequests: incoming,
      outgoingRequests: outgoing,
      acceptedFriends: accepted,
    };
  }, [friendships, uid]);

  const sendFriendRequest = useCallback(
    async (targetHandle: string): Promise<void> => {
      if (!uid || !isVerifiedUser) {
        const message = 'Please sign in and verify your email to add friends.';
        setError(message);
        throw new Error(message);
      }

      const fromHandle =
        profile?.handle ?? (normalizeHandle(user?.displayName ?? '') || 'player');
      setError(null);
      setBusyPairId('send-request');
      try {
        const created = await provider.sendFriendRequestByHandle(uid, fromHandle, targetHandle);
        if (mountedRef.current) {
          setFriendships((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(humanizeCloudError(err).message);
        }
        throw err;
      } finally {
        if (mountedRef.current) {
          setBusyPairId(null);
        }
      }
    },
    [isVerifiedUser, profile?.handle, provider, uid, user?.displayName],
  );

  const acceptFriendRequest = useCallback(
    async (pairId: string): Promise<void> => {
      if (!uid || !isVerifiedUser) {
        const message = 'Please sign in and verify your email to accept friend requests.';
        setError(message);
        throw new Error(message);
      }

      setError(null);
      setBusyPairId(pairId);
      try {
        await provider.acceptFriendRequest(pairId, uid);
        const nowIso = new Date().toISOString();
        if (mountedRef.current) {
          setFriendships((prev) =>
            prev.map((item) =>
              item.id === pairId
                ? { ...item, status: 'accepted', updatedAt: nowIso }
                : item,
            ),
          );
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(humanizeCloudError(err).message);
        }
        throw err;
      } finally {
        if (mountedRef.current) {
          setBusyPairId(null);
        }
      }
    },
    [isVerifiedUser, provider, uid],
  );

  const removeFriendship = useCallback(
    async (pairId: string): Promise<void> => {
      if (!uid || !isVerifiedUser) {
        const message = 'Please sign in and verify your email to manage friends.';
        setError(message);
        throw new Error(message);
      }

      const targetRecord = friendships.find((item) => item.id === pairId);
      const removedFriendUid = targetRecord?.users.find((memberUid) => memberUid !== uid);

      setError(null);
      setBusyPairId(pairId);
      try {
        await provider.removeFriendship(pairId);
        if (mountedRef.current) {
          setFriendships((prev) => prev.filter((item) => item.id !== pairId));
          if (removedFriendUid) {
            setFriendDecksByUid((prev) => {
              if (!(removedFriendUid in prev)) return prev;
              const next = { ...prev };
              delete next[removedFriendUid];
              return next;
            });
          }
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(humanizeCloudError(err).message);
        }
        throw err;
      } finally {
        if (mountedRef.current) {
          setBusyPairId(null);
        }
      }
    },
    [friendships, isVerifiedUser, provider, uid],
  );

  const loadFriendDecks = useCallback(
    async (friendUid: string): Promise<void> => {
      if (!uid || !isVerifiedUser) {
        const message = 'Please sign in and verify your email to view friend decks.';
        setError(message);
        throw new Error(message);
      }

      setError(null);
      setBusyPairId(friendUid);
      try {
        const decks = await provider.getFriendDecks(friendUid);
        if (mountedRef.current) {
          setFriendDecksByUid((prev) => ({
            ...prev,
            [friendUid]: decks,
          }));
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(humanizeCloudError(err).message);
        }
        throw err;
      } finally {
        if (mountedRef.current) {
          setBusyPairId(null);
        }
      }
    },
    [isVerifiedUser, provider, uid],
  );

  const loadSharedDeck = useCallback(
    async (deckId: string): Promise<CloudDeckRecord | null> => {
      if (!provider.isConfigured()) {
        return null;
      }
      setError(null);
      try {
        return await provider.getSharedDeckById(deckId);
      } catch (err) {
        if (mountedRef.current) {
          setError(humanizeCloudError(err).message);
        }
        throw err;
      }
    },
    [provider],
  );

  return {
    friendships,
    incomingRequests,
    outgoingRequests,
    acceptedFriends,
    friendDecksByUid,
    loading,
    busyPairId,
    error,
    clearError,
    refreshFriends,
    sendFriendRequest,
    acceptFriendRequest,
    removeFriendship,
    loadFriendDecks,
    loadSharedDeck,
  };
}
