import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { canAddCardToDeck, canPairCommanders } from '../search/commanderRules.js';
import type { CompactCard } from '../types/card.js';
import type { ViewMode } from '../types/deck.js';
import type { ScoredCardMatch, SearchResponsePayload } from '../types/search.js';
import { CardTile } from './CardTile.js';

interface CardGridProps {
  searchResult: SearchResponsePayload | null;
  viewMode: ViewMode;
  commanders: readonly CompactCard[];
  enforceColorIdentity: boolean;
  getCardQuantity: (cardId: string) => number;
  isCommander: (cardId: string) => boolean;
  onPageChange: (page: number) => void;
  onInspectCard: (match: ScoredCardMatch) => void;
  onAddCard: (card: CompactCard) => void;
  onSetCommander: (card: CompactCard) => void;
  onAddPartner: (card: CompactCard) => void;
}

function PaginationBar({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-1.5 text-xs">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(1)}
        aria-label="First page"
        className="rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-200 transition hover:border-slate-600 disabled:opacity-35"
      >
        <ChevronsLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-slate-200 transition hover:border-slate-600 disabled:opacity-35"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Prev
      </button>
      <span className="px-3 font-mono text-slate-300">
        Page {page} / {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-slate-200 transition hover:border-slate-600 disabled:opacity-35"
      >
        Next
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(totalPages)}
        aria-label="Last page"
        className="rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-200 transition hover:border-slate-600 disabled:opacity-35"
      >
        <ChevronsRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export function CardGrid({
  searchResult,
  viewMode,
  commanders,
  enforceColorIdentity,
  getCardQuantity,
  isCommander,
  onPageChange,
  onInspectCard,
  onAddCard,
  onSetCommander,
  onAddPartner,
}: CardGridProps) {
  if (!searchResult) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[5/7] animate-pulse rounded-xl border border-slate-800 bg-slate-900/50"
          />
        ))}
      </div>
    );
  }

  if (searchResult.matches.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center">
        <p className="text-sm font-medium text-slate-300">
          No Commander-legal cards match the active filters.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Try unlocking Color Identity or removing one of the filter chips above.
        </p>
      </div>
    );
  }

  const gridClass =
    viewMode === 'detailed'
      ? 'grid grid-cols-1 gap-3 xl:grid-cols-2'
      : viewMode === 'compact'
        ? 'grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8'
        : 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6';

  const primaryCommander = commanders.length === 1 ? commanders[0] : undefined;

  return (
    <div className="space-y-5">
      <div className={gridClass}>
        {searchResult.matches.map((match) => {
          const card = match.card;
          const qty = getCardQuantity(card.id);
          const cmdFlag = isCommander(card.id);
          const addCheck = canAddCardToDeck(card, qty, commanders, enforceColorIdentity);
          const partnerPossible =
            primaryCommander !== undefined && canPairCommanders(primaryCommander, card);

          return (
            <CardTile
              key={card.id}
              match={match}
              viewMode={viewMode}
              quantityInDeck={qty}
              isCommander={cmdFlag}
              canAddAsPartner={partnerPossible}
              canAddMore={addCheck.allowed}
              addBlockedReason={addCheck.reason}
              onInspect={onInspectCard}
              onAddCard={onAddCard}
              onSetCommander={onSetCommander}
              onAddPartner={onAddPartner}
            />
          );
        })}
      </div>

      <PaginationBar
        page={searchResult.page}
        totalPages={searchResult.totalPages}
        onPageChange={onPageChange}
      />
    </div>
  );
}
