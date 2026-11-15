import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cloud,
  CloudOff,
  Download,
  Layers,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { validateHandle } from '../cloud/validation.js';
import type { CloudUser, SyncStatus, UserProfile } from '../types/cloud.js';

export interface AccountModalProps {
  open: boolean;
  user: CloudUser;
  profile: UserProfile | null;
  syncStatus: SyncStatus;
  pendingCount: number;
  syncedDeckCount: number;
  cardListCount: number;
  lastSyncedAt: string | null;
  isSyncing: boolean;
  error: string | null;
  onClose: () => void;
  onSyncNow: () => Promise<void>;
  onUpdateHandle: (newHandle: string, displayName?: string) => Promise<void>;
  onExportData: () => Promise<void>;
  onSignOut: (clearLocalCloudCopies: boolean) => Promise<void>;
  onDeleteAccount: (reauthPassword?: string) => Promise<void>;
}

function formatProviderLabel(providerId: string): string {
  if (providerId === 'password') return 'Email & Password';
  if (providerId === 'google.com') return 'Google';
  return providerId;
}

function formatSyncTimestamp(iso: string | null): string {
  if (!iso) return 'Not synced yet';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return 'Not synced yet';
  return parsed.toLocaleString();
}

function getSyncBadgeMeta(
  syncStatus: SyncStatus,
  pendingCount: number,
  isSyncing: boolean,
  isOnline: boolean,
): { label: string; className: string; icon: 'syncing' | 'offline' | 'conflict' | 'synced' | 'pending' } {
  if (isSyncing) {
    return {
      label: 'Syncing...',
      className: 'border-sky-400/40 bg-sky-500/15 text-sky-200',
      icon: 'syncing',
    };
  }
  if (!isOnline) {
    return {
      label: 'Offline',
      className: 'border-slate-600 bg-slate-800/80 text-slate-300',
      icon: 'offline',
    };
  }
  if (syncStatus === 'conflict') {
    return {
      label: 'Conflict',
      className: 'border-rose-500/45 bg-rose-500/15 text-rose-200',
      icon: 'conflict',
    };
  }
  if (syncStatus === 'error') {
    return {
      label: 'Sync Issue',
      className: 'border-rose-500/45 bg-rose-500/15 text-rose-200',
      icon: 'conflict',
    };
  }
  if (syncStatus === 'pending' || pendingCount > 0) {
    return {
      label: pendingCount > 0 ? `Pending (${pendingCount})` : 'Pending',
      className: 'border-amber-400/45 bg-amber-500/15 text-amber-200',
      icon: 'pending',
    };
  }
  if (syncStatus === 'synced') {
    return {
      label: 'Synced',
      className: 'border-emerald-400/45 bg-emerald-500/15 text-emerald-200',
      icon: 'synced',
    };
  }
  return {
    label: 'Local Ready',
    className: 'border-slate-700 bg-slate-800/70 text-slate-300',
    icon: 'pending',
  };
}

/**
 * Account overview, handle settings, cloud sync status, backup export, sign-out,
 * and account deletion dialog.
 */
export function AccountModal({
  open,
  user,
  profile,
  syncStatus,
  pendingCount,
  syncedDeckCount,
  cardListCount,
  lastSyncedAt,
  isSyncing,
  error,
  onClose,
  onSyncNow,
  onUpdateHandle,
  onExportData,
  onSignOut,
  onDeleteAccount,
}: AccountModalProps) {
  const titleId = useId();
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [handleInput, setHandleInput] = useState(profile?.handle ?? '');
  const [displayNameInput, setDisplayNameInput] = useState(
    profile?.displayName ?? user.displayName ?? '',
  );
  const [savingHandle, setSavingHandle] = useState(false);
  const [handleSaved, setHandleSaved] = useState(false);
  const [handleLocalError, setHandleLocalError] = useState<string | null>(null);
  const [exportingData, setExportingData] = useState(false);
  const [clearLocalCopies, setClearLocalCopies] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [dangerExpanded, setDangerExpanded] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [reauthPassword, setReauthPassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setHandleInput(profile?.handle ?? '');
    setDisplayNameInput(profile?.displayName ?? user.displayName ?? '');
    setHandleSaved(false);
    setHandleLocalError(null);
    setDangerExpanded(false);
    setDeleteConfirmText('');
    setReauthPassword('');
  }, [open, profile?.handle, profile?.displayName, user.displayName]);

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

  if (!open) return null;

  const handleCheck = validateHandle(handleInput);
  const hasPasswordProvider = user.providerIds.includes('password');
  const trimmedDisplayName = displayNameInput.trim();
  const handleUnchanged =
    Boolean(profile) &&
    handleCheck.normalized === profile?.handleLower &&
    trimmedDisplayName === (profile?.displayName ?? '');

  const syncMeta = getSyncBadgeMeta(syncStatus, pendingCount, isSyncing, isOnline);
  const canDelete =
    deleteConfirmText === 'DELETE' &&
    (!hasPasswordProvider || reauthPassword.length > 0) &&
    !deletingAccount;

  const handleSaveHandle = async (e: FormEvent) => {
    e.preventDefault();
    setHandleSaved(false);
    setHandleLocalError(null);

    if (!handleCheck.valid) {
      setHandleLocalError(handleCheck.error ?? 'Please enter a valid handle.');
      return;
    }

    setSavingHandle(true);
    try {
      await onUpdateHandle(handleCheck.normalized, trimmedDisplayName || undefined);
      setHandleSaved(true);
    } catch {
      // Parent surfaces error via `error` prop
    } finally {
      setSavingHandle(false);
    }
  };

  const handleSyncNowClick = async () => {
    try {
      await onSyncNow();
    } catch {
      // Parent surfaces error via `error` prop
    }
  };

  const handleExportClick = async () => {
    setExportingData(true);
    try {
      await onExportData();
    } catch {
      // Parent surfaces error via `error` prop
    } finally {
      setExportingData(false);
    }
  };

  const handleSignOutClick = async () => {
    setSigningOut(true);
    try {
      await onSignOut(clearLocalCopies);
    } catch {
      // Parent surfaces error via `error` prop
    } finally {
      setSigningOut(false);
    }
  };

  const handleDeleteClick = async (e: FormEvent) => {
    e.preventDefault();
    if (!canDelete) return;
    setDeletingAccount(true);
    try {
      await onDeleteAccount(hasPasswordProvider ? reauthPassword : undefined);
    } catch {
      // Parent surfaces error via `error` prop
    } finally {
      setDeletingAccount(false);
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
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/30">
              <User className="h-4 w-4" />
            </div>
            <div>
              <h2 id={titleId} className="text-sm font-bold text-slate-100">
                Cloud Account &amp; Sync
              </h2>
              <p className="text-[11px] text-slate-400">
                {profile ? `@${profile.handle}` : user.email ?? 'Signed-in account'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close account modal"
            className="rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-rose-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <span className="flex-1 leading-relaxed">{error}</span>
            </div>
          )}

          {/* Account Overview & Handle Editor */}
          <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/75 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-bold text-slate-100">Account Overview</h3>
                <p className="mt-0.5 truncate text-[11px] text-slate-400">
                  {user.email ?? 'No email on record'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {user.emailVerified ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-200">
                    <ShieldCheck className="h-3 w-3" />
                    Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-200">
                    <AlertTriangle className="h-3 w-3" />
                    Email Unverified
                  </span>
                )}

                {user.providerIds.map((pid) => (
                  <span
                    key={pid}
                    className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 text-[11px] font-medium text-slate-300"
                  >
                    {formatProviderLabel(pid)}
                  </span>
                ))}
              </div>
            </div>

            <form onSubmit={(e) => void handleSaveHandle(e)} className="space-y-2.5 border-t border-slate-800/90 pt-3">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="account-handle"
                    className="mb-1 block text-[11px] font-semibold text-slate-300"
                  >
                    Public Handle
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-slate-400">
                      @
                    </span>
                    <input
                      id="account-handle"
                      type="text"
                      value={handleInput}
                      onChange={(e) => {
                        setHandleInput(e.target.value);
                        setHandleSaved(false);
                        setHandleLocalError(null);
                      }}
                      placeholder="your_handle"
                      aria-invalid={handleInput.length > 0 && !handleCheck.valid}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2 pl-7 pr-3 font-mono text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="account-display-name"
                    className="mb-1 block text-[11px] font-semibold text-slate-300"
                  >
                    Display Name (optional)
                  </label>
                  <input
                    id="account-display-name"
                    type="text"
                    maxLength={40}
                    value={displayNameInput}
                    onChange={(e) => {
                      setDisplayNameInput(e.target.value);
                      setHandleSaved(false);
                    }}
                    placeholder="Commander Player"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              {handleLocalError ? (
                <p className="text-[11px] text-rose-300">{handleLocalError}</p>
              ) : handleInput.length > 0 && !handleCheck.valid ? (
                <p className="text-[11px] text-rose-300">{handleCheck.error}</p>
              ) : (
                <p className="text-[11px] text-slate-400">
                  Shown to friends and on shared deck links. Your email stays private.
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                {handleSaved && !error ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Handle saved
                  </span>
                ) : (
                  <span />
                )}

                <button
                  type="submit"
                  disabled={!handleCheck.valid || handleUnchanged || savingHandle}
                  className="rounded-xl bg-amber-500 px-3.5 py-1.5 font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-40"
                >
                  {savingHandle ? 'Saving...' : profile ? 'Save Handle' : 'Claim Handle'}
                </button>
              </div>
            </form>
          </section>

          {/* Cloud Sync Dashboard */}
          <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/75 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-100">Cloud Sync</h3>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${syncMeta.className}`}
                >
                  {syncMeta.icon === 'syncing' ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : syncMeta.icon === 'offline' ? (
                    <CloudOff className="h-3 w-3" />
                  ) : syncMeta.icon === 'conflict' ? (
                    <AlertTriangle className="h-3 w-3" />
                  ) : syncMeta.icon === 'synced' ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <Cloud className="h-3 w-3" />
                  )}
                  {syncMeta.label}
                </span>
              </div>

              <button
                type="button"
                disabled={isSyncing || !user.emailVerified}
                onClick={() => void handleSyncNowClick()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-3.5 py-1.5 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-45"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
                <div className="text-[11px] text-slate-400">Synced Decks</div>
                <div className="mt-0.5 font-mono text-sm font-bold text-slate-100">
                  {syncedDeckCount}
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
                <div className="text-[11px] text-slate-400">Pending Changes</div>
                <div className="mt-0.5 font-mono text-sm font-bold text-slate-100">
                  {pendingCount}
                </div>
              </div>
              <div className="col-span-2 rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 sm:col-span-1">
                <div className="text-[11px] text-slate-400">Last Synced</div>
                <div className="mt-0.5 truncate text-[11px] font-medium text-slate-200" title={formatSyncTimestamp(lastSyncedAt)}>
                  {formatSyncTimestamp(lastSyncedAt)}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-violet-500/25 bg-violet-950/20 p-2.5 text-[11px] text-violet-200">
              <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300" />
              <div>
                <span className="font-semibold">Cardlists &amp; Binders Ready:</span>{' '}
                <span className="text-slate-300">
                  {cardListCount} saved {cardListCount === 1 ? 'list' : 'lists'} tracked locally
                  with cloud sync &amp; backup ready for upcoming binder and wishlist tools.
                </span>
              </div>
            </div>
          </section>

          {/* Portable Backup */}
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/75 p-4">
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-slate-100">Portable Backup</h3>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Download a complete JSON backup of your profile, decks, and card lists.
              </p>
            </div>

            <button
              type="button"
              disabled={exportingData}
              onClick={() => void handleExportClick()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 font-semibold text-slate-100 transition hover:border-amber-400/60 hover:text-amber-200 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5 text-amber-400" />
              {exportingData ? 'Preparing Backup...' : 'Download All Decks & Cardlists (.json)'}
            </button>
          </section>

          {/* Sign Out */}
          <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/75 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-slate-100">Sign Out</h3>
              <button
                type="button"
                disabled={signingOut}
                onClick={() => void handleSignOutClick()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-1.5 font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:opacity-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                {signingOut ? 'Signing Out...' : 'Sign Out'}
              </button>
            </div>

            <label className="flex cursor-pointer items-start gap-2 text-[11px] text-slate-300">
              <input
                type="checkbox"
                checked={clearLocalCopies}
                onChange={(e) => setClearLocalCopies(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 accent-amber-500"
              />
              <span>
                Clear synced cloud decks from this device (recommended on shared computers)
              </span>
            </label>
          </section>

          {/* Danger Zone */}
          <section className="rounded-xl border border-rose-500/35 bg-rose-950/15 p-4">
            <button
              type="button"
              onClick={() => setDangerExpanded((prev) => !prev)}
              aria-expanded={dangerExpanded}
              className="flex w-full items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-400" />
                <span className="font-bold text-rose-200">
                  Danger Zone: Delete Account &amp; Cloud Data
                </span>
              </div>
              {dangerExpanded ? (
                <ChevronUp className="h-4 w-4 text-rose-300" />
              ) : (
                <ChevronDown className="h-4 w-4 text-rose-300" />
              )}
            </button>

            {dangerExpanded && (
              <form onSubmit={(e) => void handleDeleteClick(e)} className="mt-3 space-y-3 border-t border-rose-500/25 pt-3">
                <p className="text-[11px] leading-relaxed text-rose-200/90">
                  This permanently deletes your cloud account, public handle, friendships, and all
                  synced decks and card lists. Export a JSON backup first if you want to keep a
                  copy.
                </p>

                <div>
                  <label
                    htmlFor="delete-confirm-text"
                    className="mb-1 block text-[11px] font-semibold text-rose-200"
                  >
                    Type <span className="font-mono font-bold">DELETE</span> to confirm
                  </label>
                  <input
                    id="delete-confirm-text"
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="w-full rounded-xl border border-rose-500/40 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-rose-400"
                  />
                </div>

                {hasPasswordProvider && (
                  <div>
                    <label
                      htmlFor="delete-reauth-password"
                      className="mb-1 block text-[11px] font-semibold text-rose-200"
                    >
                      Current Password (required for security)
                    </label>
                    <input
                      id="delete-reauth-password"
                      type="password"
                      autoComplete="current-password"
                      value={reauthPassword}
                      onChange={(e) => setReauthPassword(e.target.value)}
                      placeholder="Enter your current password"
                      className="w-full rounded-xl border border-rose-500/40 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-rose-400"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!canDelete}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 font-semibold text-white transition hover:bg-rose-500 disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deletingAccount
                    ? 'Deleting Account & Data...'
                    : 'Permanently Delete Account & Data'}
                </button>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
