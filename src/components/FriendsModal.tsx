import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Crown,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { buildFriendInviteUrl, validateHandle } from '../cloud/validation.js';
import { THEME_BY_ID } from '../config/searchConfig.js';
import type {
  CloudUser,
  DeckVisibility,
  FriendDeckSummary,
  FriendshipRecord,
  UserProfile,
} from '../types/cloud.js';
import { ColorIdentityBadges } from './ManaSymbol.js';

export interface FriendsModalProps {
  open: boolean;
  currentUser: CloudUser | null;
  currentProfile: UserProfile | null;
  friendships: FriendshipRecord[];
  friendDecksByUid: Record<string, FriendDeckSummary[]>;
  loading: boolean;
  busyId: string | null;
  error: string | null;
  prefillFriendHandle?: string | null;
  commanderNamesById?: Record<string, string>;
  onClose: () => void;
  onOpenAuth: () => void;
  onSendFriendRequest: (targetHandle: string) => Promise<void>;
  onAcceptFriendRequest: (pairId: string) => Promise<void>;
  onRemoveFriendship: (pairId: string) => Promise<void>;
  onLoadFriendDecks: (friendUid: string) => Promise<void>;
  onOpenSharedDeck: (deckId: string) => Promise<void>;
  onCloneSharedDeck: (deckId: string) => Promise<void>;
}

const VISIBILITY_META: Readonly<Record<DeckVisibility, { label: string; className: string }>> = {
  friends: {
    label: 'Friends',
    className: 'border-sky-500/35 bg-sky-500/15 text-sky-200',
  },
  public: {
    label: 'Public',
    className: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-200',
  },
  link: {
    label: 'Unlisted Link',
    className: 'border-violet-500/35 bg-violet-500/15 text-violet-200',
  },
  private: {
    label: 'Private',
    className: 'border-slate-700 bg-slate-800 text-slate-300',
  },
};

function getOtherMember(
  record: FriendshipRecord,
  myUid: string,
): { uid: string; handle: string } {
  const otherUid = record.users.find((uid) => uid !== myUid) ?? record.users[0] ?? '';
  const handle = record.userHandles[otherUid] ?? 'player';
  return { uid: otherUid, handle };
}

function getCommanderBadgeText(
  commanderOracleIds: readonly string[],
  commanderNamesById?: Record<string, string>,
): string {
  if (commanderOracleIds.length === 0) return 'No Commander';
  if (commanderNamesById) {
    const resolved = commanderOracleIds
      .map((id) => commanderNamesById[id])
      .filter((name): name is string => Boolean(name));
    if (resolved.length > 0) {
      return resolved.join(' + ');
    }
  }
  return commanderOracleIds.length >= 2 ? 'Partner Commanders' : 'Commander Set';
}

function FriendDeckCard({
  deck,
  busy,
  commanderNamesById,
  onView,
  onClone,
}: {
  deck: FriendDeckSummary;
  busy: boolean;
  commanderNamesById?: Record<string, string>;
  onView: () => void;
  onClone: () => void;
}) {
  const visMeta = VISIBILITY_META[deck.visibility] ?? VISIBILITY_META.friends;
  const commanderLabel = getCommanderBadgeText(deck.commanderOracleIds, commanderNamesById);
  const visibleThemes = deck.synergyThemes.slice(0, 5);
  const extraThemes = deck.synergyThemes.length - visibleThemes.length;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-xs font-bold text-slate-100">{deck.name}</h4>
            <ColorIdentityBadges colors={deck.colorIdentity} size="xs" />
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-200">
              <Crown className="h-3 w-3 shrink-0 text-amber-300" />
              <span className="max-w-[190px] truncate">{commanderLabel}</span>
            </span>

            <span
              className={`rounded-md px-1.5 py-0.5 font-mono font-semibold ${
                deck.cardCount === 100
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : deck.cardCount > 100
                    ? 'bg-rose-500/20 text-rose-300'
                    : 'bg-slate-800 text-slate-300'
              }`}
            >
              {deck.cardCount}/100
            </span>

            <span className={`rounded-md border px-1.5 py-0.5 font-medium ${visMeta.className}`}>
              {visMeta.label}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={onView}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:border-sky-400/60 hover:text-sky-200 disabled:opacity-50"
          >
            <ExternalLink className="h-3 w-3" />
            View
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClone}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1.5 text-[11px] font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
          >
            <Copy className="h-3 w-3" />
            Clone to Studio
          </button>
        </div>
      </div>

      {deck.description && (
        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-400">
          {deck.description}
        </p>
      )}

      {visibleThemes.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Sparkles className="h-3 w-3 shrink-0 text-violet-300" aria-hidden="true" />
          {visibleThemes.map((themeId) => (
            <span
              key={themeId}
              className="rounded-md border border-violet-500/30 bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-200"
            >
              {THEME_BY_ID[themeId]?.label ?? themeId}
            </span>
          ))}
          {extraThemes > 0 && (
            <span className="text-[10px] text-slate-400">+{extraThemes} more</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Friends management, 1-click invite link, pending requests, and shared deck browser modal.
 */
export function FriendsModal({
  open,
  currentUser,
  currentProfile,
  friendships,
  friendDecksByUid,
  loading,
  busyId,
  error,
  prefillFriendHandle,
  commanderNamesById,
  onClose,
  onOpenAuth,
  onSendFriendRequest,
  onAcceptFriendRequest,
  onRemoveFriendship,
  onLoadFriendDecks,
  onOpenSharedDeck,
  onCloneSharedDeck,
}: FriendsModalProps) {
  const titleId = useId();
  const [targetHandle, setTargetHandle] = useState(prefillFriendHandle ?? '');
  const [localError, setLocalError] = useState<string | null>(null);
  const [requestSentTo, setRequestSentTo] = useState<string | null>(null);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [expandedFriendUid, setExpandedFriendUid] = useState<string | null>(null);
  const [confirmRemovePairId, setConfirmRemovePairId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLocalError(null);
    setRequestSentTo(null);
    setCopiedInvite(false);
    setConfirmRemovePairId(null);
    if (prefillFriendHandle) {
      setTargetHandle(prefillFriendHandle);
    }
  }, [open, prefillFriendHandle]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const inviteUrl = useMemo(() => {
    if (!open || !currentProfile?.handle || typeof window === 'undefined') return '';
    try {
      return buildFriendInviteUrl(
        window.location.origin,
        window.location.pathname,
        currentProfile.handle,
      );
    } catch {
      return '';
    }
  }, [open, currentProfile?.handle]);

  if (!open) return null;

  const isVerifiedUser = Boolean(currentUser && currentUser.emailVerified);
  const handleCheck = validateHandle(targetHandle);

  const incomingRequests = isVerifiedUser
    ? friendships.filter((f) => f.status === 'pending' && f.requestedBy !== currentUser!.uid)
    : [];
  const outgoingRequests = isVerifiedUser
    ? friendships.filter((f) => f.status === 'pending' && f.requestedBy === currentUser!.uid)
    : [];
  const acceptedFriends = isVerifiedUser
    ? friendships.filter((f) => f.status === 'accepted')
    : [];

  const handleCopyInvite = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedInvite(true);
      window.setTimeout(() => setCopiedInvite(false), 2200);
    } catch {
      // Clipboard write unavailable
    }
  };

  const handleSendRequest = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setRequestSentTo(null);

    if (!handleCheck.valid) {
      setLocalError(handleCheck.error ?? 'Enter a valid handle to add a friend.');
      return;
    }

    if (currentProfile && handleCheck.normalized === currentProfile.handleLower) {
      setLocalError("You can't send a friend request to yourself.");
      return;
    }

    setSendingRequest(true);
    try {
      await onSendFriendRequest(handleCheck.normalized);
      setRequestSentTo(handleCheck.normalized);
      setTargetHandle('');
    } catch {
      // Parent surfaces error via `error` prop
    } finally {
      setSendingRequest(false);
    }
  };

  const handleToggleFriend = (friendUid: string) => {
    if (expandedFriendUid === friendUid) {
      setExpandedFriendUid(null);
      return;
    }
    setExpandedFriendUid(friendUid);
    if (friendDecksByUid[friendUid] === undefined) {
      void onLoadFriendDecks(friendUid);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/30">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <h2 id={titleId} className="text-sm font-bold text-slate-100">
                Friends &amp; Shared Decks
              </h2>
              <p className="text-[11px] text-slate-400">
                Connect by public handle and browse friends&apos; Commander lists
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close friends modal"
            className="rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
          {!isVerifiedUser ? (
            <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/80 p-6 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/30">
                <Users className="h-5 w-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-slate-100">
                  {currentUser ? 'Verify Your Email to Use Friends' : 'Sign In to Connect with Friends'}
                </h3>
                <p className="mx-auto max-w-sm leading-relaxed text-slate-400">
                  {currentUser
                    ? 'Finish verifying your email address to add friends by handle and browse their Commander decks.'
                    : 'Create a free cloud account or sign in to share Commander lists with your playgroup.'}
                </p>
                {prefillFriendHandle && (
                  <p className="pt-1 font-medium text-amber-200">
                    Pending invite from <span className="font-mono">@{prefillFriendHandle}</span>
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={onOpenAuth}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 font-semibold text-slate-950 transition hover:bg-amber-400"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Sign In to Use Friends
              </button>
            </div>
          ) : (
            <>
              {(error || localError) && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-rose-200"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  <span className="flex-1 leading-relaxed">{localError || error}</span>
                </div>
              )}

              {requestSentTo && !error && !localError && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-emerald-200">
                  <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span>
                    Friend request sent to <strong className="font-mono">@{requestSentTo}</strong>!
                  </span>
                </div>
              )}

              {/* My Handle & 1-Click Invite Link */}
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-500/30 bg-violet-950/20 p-3.5">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-violet-200/80">Your Public Handle</div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-violet-100">
                      {currentProfile ? `@${currentProfile.handle}` : 'Setting up handle...'}
                    </span>
                  </div>
                </div>

                {currentProfile && (
                  <button
                    type="button"
                    disabled={!inviteUrl}
                    onClick={() => void handleCopyInvite()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-violet-500 px-3.5 py-2 font-semibold text-white transition hover:bg-violet-400 disabled:opacity-45"
                  >
                    {copiedInvite ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Copied Friend Link
                      </>
                    ) : (
                      <>
                        <Link2 className="h-3.5 w-3.5" />
                        Copy Friend Link
                      </>
                    )}
                  </button>
                )}
              </section>

              {/* Add Friend by Handle */}
              <section className="rounded-xl border border-slate-800 bg-slate-950/75 p-3.5">
                <form onSubmit={(e) => void handleSendRequest(e)} className="space-y-2">
                  <label
                    htmlFor="friend-handle-input"
                    className="block font-bold text-slate-100"
                  >
                    Add Friend by Handle
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[200px] flex-1">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-slate-400">
                        @
                      </span>
                      <input
                        id="friend-handle-input"
                        type="text"
                        value={targetHandle}
                        onChange={(e) => {
                          setTargetHandle(e.target.value);
                          if (localError) setLocalError(null);
                          if (requestSentTo) setRequestSentTo(null);
                        }}
                        placeholder="friend_handle"
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2 pl-7 pr-3 font-mono text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-amber-400"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={sendingRequest || !targetHandle.trim()}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-45"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {sendingRequest ? 'Sending...' : 'Send Request'}
                    </button>
                  </div>
                </form>
              </section>

              {/* Incoming Requests */}
              {incomingRequests.length > 0 && (
                <section className="space-y-2">
                  <h3 className="font-bold text-amber-200">
                    Incoming Requests ({incomingRequests.length})
                  </h3>
                  <div className="space-y-2">
                    {incomingRequests.map((req) => {
                      const other = getOtherMember(req, currentUser!.uid);
                      const isBusy = busyId === req.id;
                      return (
                        <div
                          key={req.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3"
                        >
                          <div>
                            <span className="font-mono text-sm font-bold text-slate-100">
                              @{other.handle}
                            </span>
                            <p className="text-[11px] text-amber-200/80">wants to connect with you</p>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void onAcceptFriendRequest(req.id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Accept
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void onRemoveFriendship(req.id)}
                              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 font-semibold text-slate-300 transition hover:border-rose-500/50 hover:text-rose-200 disabled:opacity-50"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Sent Requests */}
              {outgoingRequests.length > 0 && (
                <section className="space-y-2">
                  <h3 className="font-bold text-slate-300">
                    Sent Requests ({outgoingRequests.length})
                  </h3>
                  <div className="space-y-2">
                    {outgoingRequests.map((req) => {
                      const other = getOtherMember(req, currentUser!.uid);
                      const isBusy = busyId === req.id;
                      return (
                        <div
                          key={req.id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/75 p-3"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-200">
                              @{other.handle}
                            </span>
                            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                              Pending
                            </span>
                          </div>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void onRemoveFriendship(req.id)}
                            className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition hover:border-rose-500/50 hover:text-rose-200 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Friends List */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-100">
                    Friends ({acceptedFriends.length})
                  </h3>
                  {loading && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Refreshing...
                    </span>
                  )}
                </div>

                {acceptedFriends.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-slate-400">
                    No friends added yet. Copy your friend link above or enter a player&apos;s
                    handle to connect.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {acceptedFriends.map((friend) => {
                      const other = getOtherMember(friend, currentUser!.uid);
                      const isExpanded = expandedFriendUid === other.uid;
                      const decks = friendDecksByUid[other.uid];
                      const isLoadingDecks = busyId === other.uid || (isExpanded && decks === undefined && loading);
                      const isRemoving = busyId === friend.id;

                      return (
                        <div
                          key={friend.id}
                          className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/75"
                        >
                          <div className="flex items-center justify-between gap-2 p-3">
                            <button
                              type="button"
                              aria-expanded={isExpanded}
                              onClick={() => handleToggleFriend(other.uid)}
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 shrink-0 text-amber-300" />
                              ) : (
                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                              )}
                              <UserCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                              <span className="truncate font-mono text-sm font-bold text-slate-100">
                                @{other.handle}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {decks !== undefined
                                  ? `· ${decks.length} shared ${decks.length === 1 ? 'deck' : 'decks'}`
                                  : '· Click to view decks'}
                              </span>
                            </button>

                            <div className="flex items-center gap-1.5">
                              {confirmRemovePairId === friend.id ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={isRemoving}
                                    onClick={() => {
                                      setConfirmRemovePairId(null);
                                      void onRemoveFriendship(friend.id);
                                    }}
                                    className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                                  >
                                    Remove
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmRemovePairId(null)}
                                    className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:text-white"
                                  >
                                    Keep
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isRemoving}
                                  onClick={() => setConfirmRemovePairId(friend.id)}
                                  aria-label={`Remove friend @${other.handle}`}
                                  className="rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-400 transition hover:border-rose-500/50 hover:text-rose-300 disabled:opacity-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="space-y-2.5 border-t border-slate-800/80 bg-slate-950/50 p-3">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-slate-300">
                                  Shared Commander Decks
                                </span>
                                <button
                                  type="button"
                                  disabled={isLoadingDecks}
                                  onClick={() => void onLoadFriendDecks(other.uid)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] font-medium text-slate-300 hover:border-sky-400/50 hover:text-sky-200 disabled:opacity-50"
                                >
                                  <RefreshCw
                                    className={`h-3 w-3 ${isLoadingDecks ? 'animate-spin' : ''}`}
                                  />
                                  Refresh
                                </button>
                              </div>

                              {isLoadingDecks && decks === undefined ? (
                                <div className="flex items-center justify-center gap-2 py-5 text-slate-400">
                                  <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
                                  Loading @{other.handle}&apos;s decks...
                                </div>
                              ) : !decks || decks.length === 0 ? (
                                <p className="rounded-xl border border-dashed border-slate-800 p-4 text-center text-[11px] text-slate-400">
                                  @{other.handle} hasn&apos;t shared any Friends or Public decks yet.
                                </p>
                              ) : (
                                <div className="space-y-2">
                                  {decks.map((deck) => (
                                    <FriendDeckCard
                                      key={deck.id}
                                      deck={deck}
                                      busy={busyId === deck.id}
                                      commanderNamesById={commanderNamesById}
                                      onView={() => void onOpenSharedDeck(deck.id)}
                                      onClone={() => void onCloneSharedDeck(deck.id)}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
