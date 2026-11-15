import {
  AlertCircle,
  Copy,
  Crown,
  Link2,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useId } from 'react';
import { THEME_BY_ID } from '../config/searchConfig.js';
import type { CompactCard } from '../types/card.js';
import type { CloudDeckRecord, DeckVisibility } from '../types/cloud.js';
import { ColorIdentityBadges } from './ManaSymbol.js';

export interface SharedDeckBannerProps {
  sharedDeck: CloudDeckRecord | null;
  commanders: CompactCard[];
  loading: boolean;
  error: string | null;
  onCloneIntoStudio: () => void;
  onDismiss: () => void;
}

const SHARED_VISIBILITY_LABEL: Readonly<Record<DeckVisibility, string>> = {
  public: 'Public Deck',
  link: 'Shared Link',
  friends: 'Friends Deck',
  private: 'Private Deck',
};

/**
 * Preview modal shown when opening a `?deck=<id>` shared cloud deck link or friend deck.
 */
export function SharedDeckBanner({
  sharedDeck,
  commanders,
  loading,
  error,
  onCloneIntoStudio,
  onDismiss,
}: SharedDeckBannerProps) {
  const titleId = useId();
  const isVisible = loading || Boolean(error) || Boolean(sharedDeck);

  useEffect(() => {
    if (!isVisible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isVisible, onDismiss]);

  if (!isVisible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onDismiss}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-violet-500/40 bg-slate-900 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/30">
              <Link2 className="h-4 w-4" />
            </div>
            <div>
              <h2 id={titleId} className="text-sm font-bold text-slate-100">
                {sharedDeck ? sharedDeck.name : 'Shared Commander Deck'}
              </h2>
              {sharedDeck && (
                <p className="text-[11px] text-slate-400">
                  by <span className="font-mono text-violet-200">@{sharedDeck.ownerHandle}</span> ·{' '}
                  {SHARED_VISIBILITY_LABEL[sharedDeck.visibility]}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss shared deck preview"
            className="rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-slate-300">
              <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
              <p className="text-xs font-medium">Loading shared Commander deck...</p>
            </div>
          ) : error ? (
            <div className="space-y-4">
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-200"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                <div className="space-y-1">
                  <p className="font-semibold">Couldn&apos;t load this shared deck</p>
                  <p className="leading-relaxed text-rose-200/90">{error}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={onDismiss}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 font-semibold text-slate-200 hover:text-white"
              >
                Dismiss
              </button>
            </div>
          ) : sharedDeck ? (
            <>
              {/* Identity & Count Summary */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/75 px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-slate-400">Color Identity</span>
                  <ColorIdentityBadges colors={sharedDeck.colorIdentity} size="sm" />
                </div>

                <span
                  className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold ${
                    sharedDeck.cardCount === 100
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : sharedDeck.cardCount > 100
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-slate-800 text-slate-200'
                  }`}
                >
                  {sharedDeck.cardCount}/100 cards
                </span>
              </div>

              {/* Commanders */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-200">
                  <Crown className="h-3.5 w-3.5 text-amber-300" />
                  <span>Commanders</span>
                </div>

                {commanders.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {commanders.map((cmd) => (
                      <div
                        key={cmd.id}
                        className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5"
                      >
                        {cmd.imageSmall && (
                          <img
                            src={cmd.imageSmall}
                            alt={cmd.name}
                            className="h-12 w-9 shrink-0 rounded object-cover ring-1 ring-amber-400/40"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-bold text-amber-100">{cmd.name}</div>
                          <div className="truncate text-[11px] text-amber-200/80">
                            {cmd.typeLine}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-400">
                    {sharedDeck.commanderOracleIds.length > 0
                      ? `${sharedDeck.commanderOracleIds.length} commander${
                          sharedDeck.commanderOracleIds.length > 1 ? 's' : ''
                        } included in list`
                      : 'No commander assigned yet'}
                  </p>
                )}
              </div>

              {/* Method A Synergy Themes */}
              {sharedDeck.synergyThemes.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-200">
                    <Sparkles className="h-3.5 w-3.5 text-violet-300" />
                    <span>Synergy Themes</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {sharedDeck.synergyThemes.map((themeId) => (
                      <span
                        key={themeId}
                        className="rounded-lg border border-violet-500/35 bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-200"
                      >
                        {THEME_BY_ID[themeId]?.label ?? themeId}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Description / Notes Preview */}
              {sharedDeck.description?.trim() && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-300">Deck Notes</div>
                  <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                    <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-300">
                      {sharedDeck.description}
                    </p>
                  </div>
                </div>
              )}

              {/* CTAs */}
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={onCloneIntoStudio}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 font-semibold text-slate-950 transition hover:bg-amber-400"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Clone &amp; Tweak in My Studio
                </button>
                <button
                  type="button"
                  onClick={onDismiss}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 font-semibold text-slate-300 transition hover:text-white"
                >
                  Dismiss
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
