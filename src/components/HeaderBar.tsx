import {
  Crown,
  Database,
  FolderOpen,
  Layers,
  LayoutDashboard,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { canHaveSecondCommander, getCombinedColorIdentity } from '../search/commanderRules.js';
import type { CompactCard } from '../types/card.js';
import type { WorkspaceTab } from '../types/deck.js';
import type { SearchResponsePayload, SyncStatusPayload } from '../types/search.js';
import { ColorIdentityBadges } from './ManaSymbol.js';

interface HeaderBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  commanders: readonly CompactCard[];
  totalDeckCards: number;
  syncStatus: SyncStatusPayload;
  searchResult: SearchResponsePayload | null;
  onOpenMobileFilters: () => void;
  onOpenDeckDrawer: () => void;
  onOpenDeckManager: () => void;
  onMatchCommanderSynergy: () => void;
  onFindPartner: () => void;
  onClearCommanders: () => void;
  onForceResync: () => void;
}

export function HeaderBar({
  query,
  onQueryChange,
  activeTab,
  onTabChange,
  commanders,
  totalDeckCards,
  syncStatus,
  searchResult,
  onOpenMobileFilters,
  onOpenDeckDrawer,
  onOpenDeckManager,
  onMatchCommanderSynergy,
  onFindPartner,
  onClearCommanders,
  onForceResync,
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
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30">
              <Database className="h-4 w-4" />
            </div>
            <div className="hidden xl:block">
              <h1 className="text-sm font-bold leading-tight text-slate-100">
                Commander Builder Ultra
              </h1>
              <p className="text-[11px] text-slate-400">
                Visual Search · Deck Studio
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

        {/* Right Actions: Commander Pill, Deck Drawer, Telemetry */}
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
                title="Load Commander themes into Method A Synergy Matcher"
                className="inline-flex items-center gap-1 rounded-md bg-violet-500/25 px-2 py-0.5 text-[11px] font-medium text-violet-200 ring-1 ring-violet-400/40 transition hover:bg-violet-500/35"
              >
                <Sparkles className="h-3 w-3" />
                <span className="hidden xl:inline">Synergy</span>
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

          {/* Compact Telemetry Pill */}
          <div className="hidden items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/90 px-2.5 py-1 text-[11px] text-slate-300 xl:inline-flex">
            <Zap
              className={`h-3.5 w-3.5 ${
                syncStatus.fromCache ? 'text-emerald-400' : 'text-sky-400'
              }`}
            />
            <span className="font-mono">
              {syncStatus.loadTimeMs !== undefined ? `${syncStatus.loadTimeMs}ms` : '...'}
              {searchResult ? ` · ${searchResult.executionTimeMs.toFixed(1)}ms` : ''}
            </span>
            <button
              type="button"
              onClick={onForceResync}
              disabled={!isReady && syncStatus.stage !== 'error'}
              title="Re-sync IndexedDB card catalog"
              className="ml-0.5 rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-amber-300 disabled:opacity-40"
            >
              <RefreshCw className={`h-3 w-3 ${!isReady ? 'animate-spin' : ''}`} />
            </button>
          </div>
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
