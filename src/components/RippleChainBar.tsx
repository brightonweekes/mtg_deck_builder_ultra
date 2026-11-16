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
  formatRippleThemeLabel,
  RIPPLE_MODE_META,
  type DeckChainBalance,
  type RippleProfile,
} from '../search/rippleEngine.js';
import type { RippleMode } from '../types/search.js';

interface RippleChainBarProps {
  profile: RippleProfile;
  mode: RippleMode;
  activeThemes?: readonly string[];
  activeHookKey?: string | null;
  hideDeckCards: boolean;
  deckCardCount: number;
  deckBalance: DeckChainBalance | null;
  onSelectMode: (mode: RippleMode) => void;
  onSelectHook?: (hookKey: string | null) => void;
  onRemoveTheme?: (themeId: string) => void;
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
  activeThemes,
  hideDeckCards,
  deckCardCount,
  deckBalance,
  onSelectMode,
  onRemoveTheme,
  onToggleHideDeckCards,
  onClearRipple,
}: RippleChainBarProps) {
  const seedTitle =
    profile.seedNames.length > 0
      ? profile.seedNames.map((n) => n.split(',')[0]).join(' + ')
      : profile.archetypeHeadline || 'Custom Mix';
  const themesToRender =
    activeThemes && activeThemes.length > 0 ? activeThemes : profile.defaultThemes;
  const activeModeMeta = RIPPLE_MODE_META[mode];

  return (
    <section
      aria-label="Ripple Controls"
      className="rounded-xl border border-violet-500/35 bg-gradient-to-br from-slate-900/95 via-slate-900 to-violet-950/30 p-3 shadow-lg"
    >
      {/* Top Row: Seed Identity + Plain-English Cause -> Effect Summary + Balance Whisper */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-500/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-violet-200 ring-1 ring-violet-400/40">
              <Waves className="h-3.5 w-3.5 text-violet-300" />
              Ripple
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
                  className="ml-1 rounded bg-violet-500/25 px-1.5 py-0.5 font-semibold text-violet-100 ring-1 ring-violet-400/40 transition hover:bg-violet-500/35"
                >
                  Need {deckBalance.recommendedMode === 'enablers' ? 'Starters →' : 'Payoffs →'}
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onClearRipple}
            aria-label="Exit Ripple mode"
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
          aria-label="Ripple mode"
          className="flex flex-wrap items-center gap-1.5"
        >
          {MODE_ORDER.map((m) => {
            const meta = RIPPLE_MODE_META[m];
            const active = mode === m;
            const activeClass =
              m === 'enablers'
                ? 'border-cyan-400 bg-cyan-500/20 text-cyan-100 shadow-sm'
                : m === 'hidden-gems'
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100 shadow-sm'
                  : 'border-violet-400 bg-violet-500/25 text-violet-100 shadow-sm';

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
            <Sparkles className="h-3 w-3 text-violet-400" />
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
                  ? 'border-violet-400/60 bg-violet-500/25 text-violet-100'
                  : 'border-slate-700 bg-slate-950/70 text-slate-300 hover:border-slate-500 hover:text-white'
              }`}
            >
              <EyeOff className="h-3 w-3" />
              Hide in deck
            </button>
          )}
        </div>
      </div>

      {/* Editable Active Ripple Theme Pills */}
      {themesToRender.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-800/80 pt-2 text-[11px]">
          <span className="mr-0.5 font-medium text-slate-400">Active themes:</span>
          {themesToRender.map((themeId) => {
            const label = formatRippleThemeLabel(themeId);
            return (
              <button
                key={themeId}
                type="button"
                onClick={() => onRemoveTheme?.(themeId)}
                title={`Remove ${label} from Ripple`}
                aria-label={`Remove ${label} from Ripple`}
                className="inline-flex items-center gap-1 rounded-full border border-violet-400/60 bg-violet-500/20 px-2.5 py-0.5 font-medium text-violet-100 transition hover:border-rose-400/60 hover:bg-rose-500/15 hover:text-rose-200"
              >
                <span>{label}</span>
                <X className="h-3 w-3 opacity-80" />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
