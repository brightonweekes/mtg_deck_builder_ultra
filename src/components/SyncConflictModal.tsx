import {
  AlertTriangle,
  Cloud,
  CopyPlus,
  Laptop,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useId } from 'react';
import type { SavedDeckRecord } from '../db/cardDb.js';
import type {
  CardListEntry,
  CardListRecord,
  CardListType,
  CloudCardListRecord,
  CloudDeckRecord,
  SyncConflict,
} from '../types/cloud.js';

export type ConflictResolution = 'keep-cloud' | 'keep-local' | 'keep-both';

export interface SyncConflictModalProps {
  conflict: SyncConflict | null;
  resolving: boolean;
  onResolve: (resolution: ConflictResolution) => Promise<void>;
  onClose: () => void;
}

interface ConflictSideSummary {
  name: string;
  countLabel: string;
  updatedAt: string;
  description?: string;
  deletedAt?: string | null;
  metaBadge?: string;
}

const LIST_TYPE_LABELS: Readonly<Record<CardListType, string>> = {
  collection: 'Collection',
  wishlist: 'Wishlist',
  trade: 'Trade Binder',
  'synergy-package': 'Synergy Package',
};

function sumValues(map: Record<string, number>): number {
  let total = 0;
  for (const qty of Object.values(map)) {
    if (Number.isFinite(qty) && qty > 0) total += qty;
  }
  return total;
}

function summarizeCardListEntries(entries: Record<string, CardListEntry>): string {
  const uniqueCount = Object.keys(entries).length;
  let totalItems = 0;
  for (const entry of Object.values(entries)) {
    if (!entry) continue;
    const qty = Number.isFinite(entry.quantity) && entry.quantity > 0 ? entry.quantity : 0;
    const foil =
      entry.foilQuantity && Number.isFinite(entry.foilQuantity) && entry.foilQuantity > 0
        ? entry.foilQuantity
        : 0;
    const trade =
      entry.forTradeQuantity &&
      Number.isFinite(entry.forTradeQuantity) &&
      entry.forTradeQuantity > 0
        ? entry.forTradeQuantity
        : 0;
    totalItems += qty > 0 ? qty : Math.max(foil, trade);
  }
  return `${totalItems} ${totalItems === 1 ? 'item' : 'items'} (${uniqueCount} unique)`;
}

function formatConflictDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return 'Unknown time';
  return parsed.toLocaleString();
}

function buildSideSummaries(conflict: SyncConflict): {
  local: ConflictSideSummary;
  cloud: ConflictSideSummary;
} {
  if (conflict.kind === 'deck') {
    const localDeck = conflict.localRecord as SavedDeckRecord;
    const cloudDeck = conflict.cloudRecord as CloudDeckRecord;

    const localMainCount = localDeck.commanderIds.length + sumValues(localDeck.mainboard);
    const localSideCount = sumValues(localDeck.sideboard);
    const cloudSideCount = sumValues(cloudDeck.sideboard);

    return {
      local: {
        name: localDeck.name,
        countLabel: `${localMainCount}/100 cards${
          localSideCount > 0 ? ` · ${localSideCount} maybeboard` : ''
        }`,
        updatedAt: localDeck.updatedAt,
        description: localDeck.description,
        deletedAt: localDeck.deletedAt,
        metaBadge: localDeck.visibility ? `Visibility: ${localDeck.visibility}` : undefined,
      },
      cloud: {
        name: cloudDeck.name,
        countLabel: `${cloudDeck.cardCount}/100 cards${
          cloudSideCount > 0 ? ` · ${cloudSideCount} maybeboard` : ''
        }`,
        updatedAt: cloudDeck.updatedAt,
        description: cloudDeck.description,
        deletedAt: cloudDeck.deletedAt,
        metaBadge: `Visibility: ${cloudDeck.visibility}`,
      },
    };
  }

  const localList = conflict.localRecord as CardListRecord;
  const cloudList = conflict.cloudRecord as CloudCardListRecord;

  return {
    local: {
      name: localList.name,
      countLabel: summarizeCardListEntries(localList.entries),
      updatedAt: localList.updatedAt,
      description: localList.description,
      deletedAt: localList.deletedAt,
      metaBadge: LIST_TYPE_LABELS[localList.listType] ?? localList.listType,
    },
    cloud: {
      name: cloudList.name,
      countLabel: summarizeCardListEntries(cloudList.entries),
      updatedAt: cloudList.updatedAt,
      description: cloudList.description,
      deletedAt: cloudList.deletedAt,
      metaBadge: LIST_TYPE_LABELS[cloudList.listType] ?? cloudList.listType,
    },
  };
}

function ConflictSideCard({
  title,
  accent,
  summary,
  icon,
}: {
  title: string;
  accent: 'amber' | 'sky';
  summary: ConflictSideSummary;
  icon: 'local' | 'cloud';
}) {
  const accentClasses =
    accent === 'amber'
      ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
      : 'border-sky-500/40 bg-sky-500/10 text-sky-200';

  return (
    <div className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950/80 p-4">
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${accentClasses}`}
          >
            {icon === 'local' ? (
              <Laptop className="h-3 w-3" />
            ) : (
              <Cloud className="h-3 w-3" />
            )}
            {title}
          </span>

          {summary.deletedAt && (
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-200">
              <Trash2 className="h-3 w-3" />
              Deleted
            </span>
          )}
        </div>

        <div>
          <h3 className="text-sm font-bold text-slate-100">{summary.name}</h3>
          <p className="mt-1 font-mono text-[11px] font-semibold text-slate-300">
            {summary.countLabel}
          </p>
        </div>

        {summary.metaBadge && (
          <div>
            <span className="inline-block rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-medium capitalize text-slate-300">
              {summary.metaBadge}
            </span>
          </div>
        )}

        <div className="rounded-lg border border-slate-800/90 bg-slate-900/75 p-2.5">
          {summary.description?.trim() ? (
            <p className="line-clamp-3 text-[11px] leading-relaxed text-slate-300">
              {summary.description}
            </p>
          ) : (
            <p className="text-[11px] italic text-slate-500">No description or notes</p>
          )}
        </div>
      </div>

      <div className="mt-3 border-t border-slate-800/80 pt-2 text-[11px] text-slate-400">
        Updated: <span className="text-slate-300">{formatConflictDate(summary.updatedAt)}</span>
      </div>
    </div>
  );
}

/**
 * Side-by-side sync conflict resolution dialog for decks and card lists.
 */
export function SyncConflictModal({
  conflict,
  resolving,
  onResolve,
  onClose,
}: SyncConflictModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!conflict) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !resolving) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [conflict, resolving, onClose]);

  if (!conflict) return null;

  const summaries = buildSideSummaries(conflict);
  const itemNoun = conflict.kind === 'deck' ? 'deck' : 'card list';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={() => {
        if (!resolving) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <h2 id={titleId} className="text-sm font-bold text-slate-100">
                Resolve Sync Conflict
              </h2>
              <p className="text-[11px] text-slate-400">
                Detected {formatConflictDate(conflict.detectedAt)}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={resolving}
            onClick={onClose}
            aria-label="Close sync conflict modal"
            className="rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-slate-400 hover:text-white disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
          <p className="leading-relaxed text-slate-300">
            This {itemNoun} was changed both on this device and in the cloud. Choose which version
            to keep, or save both so nothing is lost.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <ConflictSideCard
              title="This Device (Local)"
              accent="amber"
              icon="local"
              summary={summaries.local}
            />
            <ConflictSideCard
              title="Cloud (Other Device)"
              accent="sky"
              icon="cloud"
              summary={summaries.cloud}
            />
          </div>

          <div className="space-y-2 border-t border-slate-800 pt-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={resolving}
                onClick={() => void onResolve('keep-cloud')}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2.5 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50"
              >
                {resolving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Cloud className="h-3.5 w-3.5" />
                )}
                Keep Cloud Version
              </button>

              <button
                type="button"
                disabled={resolving}
                onClick={() => void onResolve('keep-local')}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5 font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
              >
                {resolving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Laptop className="h-3.5 w-3.5" />
                )}
                Keep This Device
              </button>
            </div>

            <button
              type="button"
              disabled={resolving}
              onClick={() => void onResolve('keep-both')}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-500/45 bg-emerald-500/15 px-4 py-2.5 font-semibold text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-50"
            >
              <CopyPlus className="h-3.5 w-3.5" />
              Keep Both (Save Local as Copy)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
