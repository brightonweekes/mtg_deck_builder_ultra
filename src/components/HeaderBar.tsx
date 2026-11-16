import {
  AlertTriangle,
  ClipboardCheck,
  Cloud,
  Crown,
  FolderOpen,
  Layers,
  LayoutDashboard,
  LogIn,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { canHaveSecondCommander, getCombinedColorIdentity } from '../search/commanderRules.js';
import type { CompactCard } from '../types/card.js';
import type { CloudUser, SyncStatus, UserProfile } from '../types/cloud.js';
import type { WorkspaceTab } from '../types/deck.js';
import type { SyncStatusPayload } from '../types/search.js';
import { ColorIdentityBadges } from './ManaSymbol.js';
import { Ripple99Logo } from './Ripple99Logo.js';

interface HeaderBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  commanders: readonly CompactCard[];
  totalDeckCards: number;
  syncStatus: SyncStatusPayload;
  cloudUser?: CloudUser | null;
  cloudProfile?: UserProfile | null;
  cloudSyncStatus?: SyncStatus;
  isCloudSyncing?: boolean;
  conflictCount?: number;
  incomingFriendRequestsCount?: number;
  onOpenMobileFilters: () => void;
  onOpenDeckDrawer: () => void;
  onOpenDeckManager: () => void;
  onOpenAudit?: () => void;
  onOpenFriends?: () => void;
  onOpenCloudAuthOrAccount?: () => void;
  onMatchCommanderSynergy: () => void;
  onFindPartner: () => void;
  onClearCommanders: () => void;
}

export function HeaderBar({
  query,
  onQueryChange,
  activeTab,
  onTabChange,
  commanders,
  totalDeckCards,
  syncStatus,
  cloudUser = null,
  cloudProfile = null,
  cloudSyncStatus = 'local',
  isCloudSyncing = false,
  conflictCount = 0,
  incomingFriendRequestsCount = 0,
  onOpenMobileFilters,
  onOpenDeckDrawer,
  onOpenDeckManager,
  onOpenAudit,
  onOpenFriends,
  onOpenCloudAuthOrAccount,
  onMatchCommanderSynergy,
  onFindPartner,
  onClearCommanders,
}: HeaderBarProps) {
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const isReady = syncStatus.stage === 'ready';
  const combinedIdentity = getCombinedColorIdentity(commanders);
  const canPair = commanders.length === 1 && canHaveSecondCommander(commanders[0]!);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/92 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-2.5">
        {/* Brand + Mobile Filter Toggle + Workspace Switcher */}
        <div className="flex items-center gap-2.5">
          {activeTab === 'search' && (
            <button
              type="button"
              onClick={onOpenMobileFilters}
              aria-label="Open filters"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:border-amber-400/50 hover:text-amber-200 lg:hidden"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          )}

          <div className="flex items-center gap-2">
            <Ripple99Logo className="h-8 w-8" />
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold leading-tight tracking-tight text-slate-100">
                Ripple99
              </h1>
              <p className="hidden text-[11px] leading-tight text-slate-400 lg:block">
                Build Decks, Not Piles
              </p>
            </div>
          </div>

          <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => onTabChange('search')}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition ${
                activeTab === 'search'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Search className="h-3.5 w-3.5" />
              Catalog
            </button>
            <button
              type="button"
              onClick={() => onTabChange('deck')}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition ${
                activeTab === 'deck'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Studio
            </button>
          </div>
        </div>

        {/* Global Search Box */}
        <div className="relative min-w-[180px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
              if (activeTab !== 'search' && e.target.value.trim().length > 0) {
                onTabChange('search');
              }
            }}
            placeholder='Search name, type, or "exact rules text" (press /)'
            className="w-full rounded-xl border border-slate-700/80 bg-slate-900 py-1.5 pl-9 pr-8 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-amber-400"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Right Actions: Commander Pill, Deck Drawer */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {commanders.length > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-2.5 py-1 text-xs">
              <Crown className="h-3.5 w-3.5 shrink-0 text-amber-300" />
              <span className="max-w-[170px] truncate font-semibold text-amber-100">
                {commanders.map((c) => c.name.split(',')[0]).join(' + ')}
              </span>
              <ColorIdentityBadges colors={combinedIdentity} size="xs" />

              <button
                type="button"
                onClick={onMatchCommanderSynergy}
                title="Explore Ripple Chains — Starters, Payoffs & Hidden Gems"
                className="inline-flex items-center gap-1 rounded-md bg-cyan-500/20 px-2 py-0.5 text-[11px] font-medium text-cyan-100 ring-1 ring-cyan-400/40 transition hover:bg-cyan-500/30"
              >
                <Sparkles className="h-3 w-3 text-cyan-300" />
                <span className="hidden xl:inline">Ripple</span>
              </button>

              {canPair && (
                <button
                  type="button"
                  onClick={onFindPartner}
                  title="Find legal Partner or Background"
                  className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-200 ring-1 ring-amber-400/40 transition hover:bg-amber-500/30"
                >
                  <Users className="h-3 w-3" />
                  <span className="hidden xl:inline">Partner</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClearCommanders}
                aria-label="Clear commander"
                className="rounded p-0.5 text-amber-300/70 hover:bg-amber-500/20 hover:text-amber-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {onOpenAudit && (
            <button
              type="button"
              onClick={onOpenAudit}
              title="Instant 99 Audit — paste any Commander decklist or check your current deck"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-emerald-400/60 hover:text-emerald-200"
            >
              <ClipboardCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Audit</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenDeckManager}
            title="My Decks, Import/Export, & Share URL"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-sky-400/60 hover:text-sky-200"
          >
            <FolderOpen className="h-3.5 w-3.5 text-sky-400" />
            <span className="hidden sm:inline">Decks</span>
          </button>

          <button
            type="button"
            onClick={onOpenDeckDrawer}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-amber-400/60 hover:text-amber-200"
          >
            <Layers className="h-4 w-4 text-amber-400" />
            <span>Deck</span>
            <span
              className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] ${
                totalDeckCards === 100
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : totalDeckCards > 100
                    ? 'bg-rose-500/20 text-rose-300'
                    : 'bg-slate-800 text-slate-300'
              }`}
            >
              {totalDeckCards}/100
            </span>
          </button>

          {onOpenFriends && (
            <button
              type="button"
              onClick={onOpenFriends}
              title="Friends & Shared Decks"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-indigo-400/60 hover:text-indigo-200"
            >
              <Users className="h-3.5 w-3.5 text-indigo-400" />
              <span className="hidden md:inline">Friends</span>
              {incomingFriendRequestsCount > 0 && (
                <span
                  data-testid="friends-request-badge"
                  className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none text-slate-950"
                >
                  {incomingFriendRequestsCount}
                </span>
              )}
            </button>
          )}

          {onOpenCloudAuthOrAccount && (() => {
            if (!cloudUser) {
              return (
                <button
                  type="button"
                  onClick={onOpenCloudAuthOrAccount}
                  title="Sign in for cloud deck sync & friends"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-amber-400/60 hover:text-amber-200"
                >
                  <LogIn className="h-3.5 w-3.5 text-amber-400" />
                  <span>Sign In</span>
                </button>
              );
            }

            const needsVerification = !cloudUser.emailVerified;
            const hasConflict = conflictCount > 0 || cloudSyncStatus === 'conflict';
            const handleLabel = cloudProfile?.handle
              ? `@${cloudProfile.handle}`
              : cloudUser.displayName || 'Account';

            if (needsVerification) {
              return (
                <button
                  type="button"
                  onClick={onOpenCloudAuthOrAccount}
                  title="Verify your email to enable cloud sync"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/50 bg-amber-500/15 px-2.5 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/25"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  {cloudProfile?.handle && (
                    <span className="hidden max-w-[90px] truncate sm:inline">{handleLabel}</span>
                  )}
                  <span className="rounded bg-amber-500/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-100">
                    Verify
                  </span>
                </button>
              );
            }

            if (hasConflict) {
              return (
                <button
                  type="button"
                  onClick={onOpenCloudAuthOrAccount}
                  title="Resolve cloud sync conflict"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/60 bg-amber-500/20 px-2.5 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/30"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                  <span className="hidden max-w-[90px] truncate sm:inline">{handleLabel}</span>
                  <span className="rounded bg-amber-500/35 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-50">
                    Conflict{conflictCount > 1 ? ` (${conflictCount})` : ''}
                  </span>
                </button>
              );
            }

            const dotClass =
              cloudSyncStatus === 'error'
                ? 'bg-rose-400'
                : cloudSyncStatus === 'pending'
                  ? 'bg-amber-400'
                  : cloudSyncStatus === 'synced'
                    ? 'bg-emerald-400'
                    : 'bg-slate-400';

            const statusTitle = isCloudSyncing
              ? 'Syncing decks with cloud...'
              : cloudSyncStatus === 'synced'
                ? 'Cloud synced'
                : cloudSyncStatus === 'pending'
                  ? 'Local changes waiting to sync'
                  : cloudSyncStatus === 'error'
                    ? 'Cloud sync error — click to inspect'
                    : 'Signed in';

            return (
              <button
                type="button"
                onClick={onOpenCloudAuthOrAccount}
                title={statusTitle}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-emerald-400/50 hover:text-white"
              >
                {isCloudSyncing ? (
                  <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-sky-400" />
                ) : (
                  <Cloud className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                )}
                <span className="max-w-[84px] truncate sm:max-w-[130px]">{handleLabel}</span>
                <span
                  aria-label={statusTitle}
                  className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`}
                />
              </button>
            );
          })()}
        </div>
      </div>

      {/* Sync Progress Bar */}
      {!isReady && (
        <div className="border-t border-slate-800/80 bg-slate-900/80 px-4 py-1.5">
          <div className="mx-auto flex max-w-[1600px] items-center gap-3 text-xs">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-amber-400 transition-all duration-200"
                style={{ width: `${syncStatus.progressPercent}%` }}
              />
            </div>
            <span className="shrink-0 font-mono text-[11px] text-slate-300">
              {syncStatus.progressPercent}% · {syncStatus.message}
            </span>
          </div>
        </div>
      )}
    </header>
  );
}
