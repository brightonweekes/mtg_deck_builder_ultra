import {
  ArrowRight,
  EyeOff,
  Gem,
  Layers,
  Sparkles,
  Waves,
  X,
  Zap,
} from 'lucide-react';
import {
  RIPPLE_MODE_META,
  type DeckChainBalance,
  type RippleProfile,
} from '../search/rippleEngine.js';
import type { RippleMode } from '../types/search.js';

interface RippleChainBarProps {
  profile: RippleProfile;
  mode: RippleMode;
  activeHookKey: string | null;
  hideDeckCards: boolean;
  deckCardCount: number;
  deckBalance: DeckChainBalance | null;
  onSelectMode: (mode: RippleMode) => void;
  onSelectHook: (hookKey: string | null) => void;
  onToggleHideDeckCards: (hide: boolean) => void;
  onClearRipple: () => void;
}

const MODE_ORDER: readonly RippleMode[] = ['all', 'enablers', 'payoffs', 'hidden-gems'];

function renderModeIcon(mode: RippleMode) {
  switch (mode) {
    case 'all':
      return <Layers className="h-3.5 w-3.5" />;
    case 'enablers':
      return <ArrowRight className="h-3.5 w-3.5" />;
    case 'payoffs':
      return <Zap className="h-3.5 w-3.5" />;
    case 'hidden-gems':
      return <Gem className="h-3.5 w-3.5" />;
  }
}

export function RippleChainBar({
  profile,
  mode,
  activeHookKey,
  hideDeckCards,
  deckCardCount,
  deckBalance,
  onSelectMode,
  onSelectHook,
  onToggleHideDeckCards,
  onClearRipple,
}: RippleChainBarProps) {
  const seedTitle =
    profile.seedNames.length > 0
      ? profile.seedNames.map((n) => n.split(',')[0]).join(' + ')
      : 'Ripple Chain';
  const visibleHooks = profile.hooks.slice(0, 7);
  const activeModeMeta = RIPPLE_MODE_META[mode];

  return (
    <section
      aria-label="Ripple Chain Controls"
      className="rounded-xl border border-cyan-500/30 bg-gradient-to-br from-slate-900/95 via-slate-900 to-cyan-950/25 p-3 shadow-lg"
    >
      {/* Top Row: Seed Identity + Plain-English Cause -> Effect Summary + Balance Whisper */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-cyan-200 ring-1 ring-cyan-400/35">
              <Waves className="h-3.5 w-3.5 text-cyan-300" />
              Ripple Chains
            </span>
            <h2 className="truncate text-sm font-bold text-slate-100">{seedTitle}</h2>
            <span className="hidden text-xs text-slate-500 sm:inline">•</span>
            <p className="text-xs text-slate-300">{profile.summarySentence}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {deckBalance && (deckBalance.inDeckStarters > 0 || deckBalance.inDeckPayoffs > 0) && (
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-950/75 px-2.5 py-1 text-[11px] text-slate-300">
              <span>
                In deck:{' '}
                <strong className="text-cyan-300">{deckBalance.inDeckStarters}</strong>{' '}
                Starters ·{' '}
                <strong className="text-violet-300">{deckBalance.inDeckPayoffs}</strong>{' '}
                Payoffs
              </span>
              {deckBalance.recommendedMode && deckBalance.recommendedMode !== mode && (
                <button
                  type="button"
                  onClick={() => onSelectMode(deckBalance.recommendedMode!)}
                  className="ml-1 rounded bg-amber-500/20 px-1.5 py-0.5 font-semibold text-amber-200 ring-1 ring-amber-400/40 transition hover:bg-amber-500/30"
                >
                  Need {deckBalance.recommendedMode === 'enablers' ? 'Starters →' : 'Payoffs →'}
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onClearRipple}
            aria-label="Exit Ripple Chain mode"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1 text-[11px] font-medium text-slate-300 transition hover:border-rose-400/50 hover:text-rose-200"
          >
            <X className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Exit</span>
          </button>
        </div>
      </div>

      {/* Mode Tabs + Helper Line + Hide-in-Deck Quick Toggle */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Ripple Chain mode"
          className="flex flex-wrap items-center gap-1.5"
        >
          {MODE_ORDER.map((m) => {
            const meta = RIPPLE_MODE_META[m];
            const active = mode === m;
            const activeClass =
              m === 'enablers'
                ? 'border-cyan-400 bg-cyan-500/20 text-cyan-100 shadow-sm'
                : m === 'payoffs'
                  ? 'border-violet-400 bg-violet-500/20 text-violet-100 shadow-sm'
                  : m === 'hidden-gems'
                    ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100 shadow-sm'
                    : 'border-amber-400/80 bg-amber-500/20 text-amber-100 shadow-sm';

            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={active}
                title={meta.shortDesc}
                onClick={() => onSelectMode(m)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                  active
                    ? activeClass
                    : 'border-slate-700/80 bg-slate-950/70 text-slate-300 hover:border-slate-500 hover:text-white'
                }`}
              >
                {renderModeIcon(m)}
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2.5 text-[11px]">
          <span className="hidden items-center gap-1 text-slate-400 md:inline-flex">
            <Sparkles className="h-3 w-3 text-cyan-400" />
            {activeModeMeta.shortDesc}
          </span>

          {deckCardCount > 0 && (
            <button
              type="button"
              onClick={() => onToggleHideDeckCards(!hideDeckCards)}
              aria-pressed={hideDeckCards}
              title="Hide cards already in your current deck"
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 font-medium transition ${
                hideDeckCards
                  ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
                  : 'border-slate-700 bg-slate-950/70 text-slate-300 hover:border-slate-500 hover:text-white'
              }`}
            >
              <EyeOff className="h-3 w-3" />
              Hide in deck
            </button>
          )}
        </div>
      </div>

      {/* Sub-chain Hooks (Power-user surgical focus without crowding defaults) */}
      {visibleHooks.length > 1 && (
        <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-slate-800/80 pt-2 text-[11px]">
          <span className="mr-1 font-medium text-slate-400">Focus hook:</span>
          <button
            type="button"
            onClick={() => onSelectHook(null)}
            className={`rounded-full border px-2 py-0.5 transition ${
              activeHookKey === null
                ? 'border-slate-400 bg-slate-800 font-semibold text-white'
                : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-600 hover:text-slate-200'
            }`}
          >
            All Hooks
          </button>
          {visibleHooks.map((hook) => {
            const active = activeHookKey === hook.key;
            const isEnabler = hook.direction === 'need-enabler';
            return (
              <button
                key={hook.key}
                type="button"
                onClick={() => onSelectHook(active ? null : hook.key)}
                title={hook.reason}
                className={`rounded-full border px-2 py-0.5 transition ${
                  active
                    ? isEnabler
                      ? 'border-cyan-400 bg-cyan-500/25 font-semibold text-cyan-100'
                      : 'border-violet-400 bg-violet-500/25 font-semibold text-violet-100'
                    : isEnabler
                      ? 'border-slate-800 bg-slate-950/60 text-cyan-200/80 hover:border-cyan-500/50 hover:text-cyan-100'
                      : 'border-slate-800 bg-slate-950/60 text-violet-200/80 hover:border-violet-500/50 hover:text-violet-100'
                }`}
              >
                {isEnabler ? 'Starter: ' : 'Payoff: '}
                {hook.label}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
