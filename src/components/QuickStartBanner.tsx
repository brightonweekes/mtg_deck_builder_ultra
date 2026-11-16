import { ClipboardCheck, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import type { CompactCard, ManaColor } from '../types/card.js';
import type { WorkspaceTab } from '../types/deck.js';
import { ColorIdentityBadges } from './ManaSymbol.js';

export const QUICK_START_DISMISSED_KEY = 'ripple99_welcome_dismissed_v1';

export interface SampleCommanderPreset {
  name: string;
  archetype: string;
  colors: readonly ManaColor[];
}

export const SAMPLE_COMMANDERS: readonly SampleCommanderPreset[] = [
  {
    name: "Atraxa, Praetors' Voice",
    archetype: 'Proliferate',
    colors: ['W', 'U', 'B', 'G'],
  },
  {
    name: 'Meren of Clan Nel Toth',
    archetype: 'Graveyard',
    colors: ['B', 'G'],
  },
  {
    name: 'Veyran, Voice of Duality',
    archetype: 'Spellslinger',
    colors: ['U', 'R'],
  },
] as const;

function getSafeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Reads whether the cold-start Quick-Start Banner was previously dismissed.
 * Gracefully returns `false` when `localStorage` is unavailable or throws.
 */
export function readQuickStartDismissed(
  storage: Pick<Storage, 'getItem'> | null | undefined = getSafeLocalStorage(),
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(QUICK_START_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Persists Quick-Start Banner dismissal under `ripple99_welcome_dismissed_v1`.
 * Gracefully returns `false` when `localStorage` is unavailable or throws.
 */
export function persistQuickStartDismissed(
  storage: Pick<Storage, 'setItem'> | null | undefined = getSafeLocalStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(QUICK_START_DISMISSED_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

export interface QuickStartBannerProps {
  activeTab: WorkspaceTab;
  totalCatalogCards?: number;
  initialDismissed?: boolean;
  resolveCards: (req: {
    ids?: string[];
    names?: string[];
  }) => Promise<{ byId: Record<string, CompactCard>; byName: Record<string, CompactCard> }>;
  onOpenAudit: () => void;
  onSelectSampleCommander: (commander: CompactCard) => void;
}

/**
 * Sleek cold-start strip displayed only in Catalog search until dismissed.
 * Surfaces the Instant 99 Audit entry point and 3 one-click sample Commanders resolved dynamically.
 */
export function QuickStartBanner({
  activeTab,
  totalCatalogCards = 32643,
  initialDismissed,
  resolveCards,
  onOpenAudit,
  onSelectSampleCommander,
}: QuickStartBannerProps) {
  const [dismissed, setDismissed] = useState<boolean>(() =>
    initialDismissed !== undefined ? initialDismissed : readQuickStartDismissed(),
  );
  const [loadingCommanderName, setLoadingCommanderName] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  if (activeTab !== 'search' || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    persistQuickStartDismissed();
    setDismissed(true);
  };

  const handlePickSample = async (presetName: string) => {
    if (loadingCommanderName) return;
    setResolveError(null);
    setLoadingCommanderName(presetName);
    try {
      const { byName } = await resolveCards({ names: [presetName] });
      const resolved = byName[presetName.toLowerCase()];
      if (!resolved) {
        setResolveError(`Catalog is still loading — could not resolve ${presetName} yet.`);
        return;
      }
      onSelectSampleCommander(resolved);
    } catch {
      setResolveError(`Could not load ${presetName}. Try again once the catalog finishes syncing.`);
    } finally {
      setLoadingCommanderName(null);
    }
  };

  return (
    <section
      aria-label="Ripple99 Quick Start"
      className="mx-auto max-w-[1600px] px-4 pt-3"
    >
      <div className="relative flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-amber-500/25 bg-gradient-to-r from-slate-900/95 via-slate-900/90 to-violet-950/35 px-3.5 py-2.5 pr-10 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/35 bg-amber-500/15 px-2.5 py-0.5 font-bold text-amber-200">
            <Sparkles className="h-3 w-3 text-amber-300" />
            Build Decks, Not Piles
          </span>
          <span className="text-slate-300">
            Instant <code className="font-mono text-emerald-300">&lt;25ms</code> local search across{' '}
            <strong className="font-semibold text-slate-100">
              {totalCatalogCards.toLocaleString()}
            </strong>{' '}
            cards · Zero ads
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={onOpenAudit}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 font-bold text-slate-950 transition hover:bg-amber-400"
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            Instant 99 Audit
          </button>

          <span className="hidden text-[11px] font-medium text-slate-400 xl:inline">
            Try Commander:
          </span>

          <div className="flex flex-wrap items-center gap-1.5">
            {SAMPLE_COMMANDERS.map((cmd) => {
              const isLoading = loadingCommanderName === cmd.name;
              return (
                <button
                  key={cmd.name}
                  type="button"
                  disabled={loadingCommanderName !== null}
                  onClick={() => void handlePickSample(cmd.name)}
                  title={`Load ${cmd.name} (${cmd.archetype}) and match synergy`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-950/80 px-2.5 py-1 text-[11px] font-medium text-slate-200 transition hover:border-violet-400/60 hover:bg-violet-500/15 hover:text-white disabled:opacity-50"
                >
                  <ColorIdentityBadges colors={cmd.colors} size="xs" />
                  <span>{isLoading ? 'Loading...' : cmd.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss quick start banner"
          title="Dismiss"
          className="absolute right-2.5 top-2.5 rounded-lg p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {resolveError && (
          <p className="w-full text-[11px] text-amber-300" role="status">
            {resolveError}
          </p>
        )}
      </div>
    </section>
  );
}
