import { Check, Crown, FlipHorizontal2, Minus, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { ROLE_BY_ID, THEME_BY_ID } from '../config/searchConfig.js';
import { getSynergyReasonBadgeClass } from '../search/rippleEngine.js';
import type { CompactCard } from '../types/card.js';
import type { ViewMode } from '../types/deck.js';
import type { ScoredCardMatch } from '../types/search.js';
import { ManaCostDisplay, OracleTextDisplay } from './ManaSymbol.js';

interface CardTileProps {
  match: ScoredCardMatch;
  viewMode: ViewMode;
  quantityInDeck: number;
  isCommander: boolean;
  canAddAsPartner: boolean;
  canAddMore: boolean;
  addBlockedReason?: string;
  onInspect: (match: ScoredCardMatch) => void;
  onAddCard: (card: CompactCard) => void;
  onRemoveOneCard?: (cardId: string) => void;
  onSetCommander: (card: CompactCard) => void;
  onAddPartner: (card: CompactCard) => void;
}

export function CardTile({
  match,
  viewMode,
  quantityInDeck,
  isCommander,
  canAddAsPartner,
  canAddMore,
  addBlockedReason,
  onInspect,
  onAddCard,
  onRemoveOneCard,
  onSetCommander,
  onAddPartner,
}: CardTileProps) {
  const { card, synergyScore, matchedReasons } = match;
  const [flipped, setFlipped] = useState(false);

  const hasBackFaceImage =
    Array.isArray(card.faces) && card.faces.length > 1 && Boolean(card.faces[1]?.imageNormal);
  const displayImage =
    flipped && hasBackFaceImage ? card.faces![1]!.imageNormal! : card.imageNormal;
  const displayName =
    flipped && card.faces && card.faces[1] ? card.faces[1].name : card.name;

  const renderActionButtons = (compact = false) => (
    <div
      className={`flex flex-wrap items-center ${compact ? 'gap-1' : 'gap-1.5'}`}
      onClick={(e) => e.stopPropagation()}
    >
      {isCommander ? (
        <span className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-amber-500/20 px-2 py-1 text-[11px] font-semibold text-amber-200 ring-1 ring-amber-400/40">
          <Crown className="h-3 w-3" />
          Commander
        </span>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {quantityInDeck > 0 && onRemoveOneCard && (
            <button
              type="button"
              onClick={() => onRemoveOneCard(card.id)}
              aria-label="Remove one copy from deck"
              title={quantityInDeck > 1 ? 'Remove one copy from deck' : 'Remove from deck'}
              className={`inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900/95 text-slate-200 transition hover:border-rose-500/50 hover:bg-rose-500/15 hover:text-rose-200 ${
                compact ? 'px-1.5 py-1' : 'px-2 py-1'
              }`}
            >
              <Minus className="h-3 w-3" />
            </button>
          )}

          <button
            type="button"
            onClick={() => onAddCard(card)}
            disabled={!canAddMore}
            title={
              canAddMore
                ? 'Add to deck'
                : addBlockedReason === 'Singleton limit (1 copy)'
                  ? undefined
                  : addBlockedReason
            }
            className={`inline-flex min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-lg py-1 text-[11px] font-semibold transition ${
              compact ? 'px-1.5' : 'px-2'
            } ${
              quantityInDeck > 0
                ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/40 hover:bg-emerald-500/30 disabled:opacity-75'
                : canAddMore
                  ? 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/35 hover:bg-amber-500/25'
                  : 'cursor-not-allowed bg-slate-800/80 text-slate-500 ring-1 ring-slate-700'
            }`}
          >
            {quantityInDeck > 0 ? (
              <>
                <Check className="h-3 w-3 shrink-0" />
                {canAddMore
                  ? `+1 (${quantityInDeck})`
                  : quantityInDeck === 1
                    ? 'In Deck'
                    : `In Deck (${quantityInDeck})`}
              </>
            ) : (
              <>
                <Plus className="h-3 w-3 shrink-0" />
                {compact ? 'Add' : 'Add to Deck'}
              </>
            )}
          </button>
        </div>
      )}

      {!isCommander && canAddAsPartner && (
        <button
          type="button"
          onClick={() => onAddPartner(card)}
          title="Pair as 2nd Commander"
          className="inline-flex items-center gap-1 rounded-lg bg-violet-500/20 px-2 py-1 text-[11px] font-semibold text-violet-200 ring-1 ring-violet-400/40 hover:bg-violet-500/30"
        >
          <Users className="h-3 w-3" />
          Partner
        </button>
      )}

      {!isCommander && card.isCommanderEligible && (
        <button
          type="button"
          onClick={() => onSetCommander(card)}
          title="Set as Commander"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] font-medium text-slate-200 transition hover:border-amber-400/60 hover:text-amber-200"
        >
          <Crown className="h-3 w-3 text-amber-400" />
          {!compact && <span>CMD</span>}
        </button>
      )}
    </div>
  );

  if (viewMode === 'detailed') {
    return (
      <article
        onClick={() => onInspect(match)}
        className="flex cursor-pointer flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/65 p-3 transition hover:border-amber-400/50 hover:bg-slate-900 sm:flex-row"
      >
        <div className="mtg-card-corners relative aspect-[5/7] w-36 shrink-0 self-center overflow-hidden bg-slate-950 sm:self-start">
          {displayImage ? (
            <img
              src={displayImage}
              alt={displayName}
              loading="lazy"
              className="h-full w-full scale-[1.015] object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center p-2 text-center text-xs text-slate-400">
              {displayName}
            </div>
          )}

          {hasBackFaceImage && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFlipped((f) => !f);
              }}
              className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded bg-slate-950/90 px-1.5 py-0.5 text-[10px] text-slate-200 ring-1 ring-slate-600 hover:bg-slate-800"
            >
              <FlipHorizontal2 className="h-3 w-3" />
              Flip
            </button>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-100">{card.name}</h3>
              <p className="text-xs text-slate-400">{card.typeLine}</p>
            </div>
            <div className="flex items-center gap-2">
              <ManaCostDisplay manaCost={card.manaCost} size="sm" />
              <span className="font-mono text-xs text-slate-300">
                {card.priceUsd !== null ? `$${card.priceUsd.toFixed(2)}` : '—'}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-2.5 text-xs">
            <OracleTextDisplay text={card.oracleText} />
          </div>

          {(matchedReasons.length > 0 || card.roles.length > 0 || card.themes.length > 0) && (
            <div className="flex flex-wrap gap-1">
              {synergyScore > 0 && (
                <span className="rounded bg-violet-500/25 px-1.5 py-0.5 text-[10px] font-bold text-violet-100 ring-1 ring-violet-400/40">
                  Ripple {synergyScore}
                </span>
              )}
              {matchedReasons.slice(0, 3).map((r) => (
                <span
                  key={r}
                  className={`rounded px-1.5 py-0.5 text-[10px] ${getSynergyReasonBadgeClass(r)}`}
                >
                  {r}
                </span>
              ))}
              {card.roles.map((role) => (
                <span
                  key={role}
                  className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${ROLE_BY_ID[role].badgeClass}`}
                >
                  {ROLE_BY_ID[role].label}
                </span>
              ))}
              {card.themes.slice(0, 4).map((t) => (
                <span
                  key={t}
                  className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[10px] text-slate-300"
                >
                  {THEME_BY_ID[t]?.label ?? t}
                </span>
              ))}
            </div>
          )}

          <div className="mt-auto pt-1">{renderActionButtons(false)}</div>
        </div>
      </article>
    );
  }

  if (viewMode === 'compact') {
    return (
      <article
        onClick={() => onInspect(match)}
        className="mtg-card-corners group relative cursor-pointer overflow-hidden border border-slate-800 bg-slate-950 transition hover:border-amber-400/60"
      >
        <div className="mtg-card-corners relative aspect-[5/7] w-full overflow-hidden">
          {displayImage ? (
            <img
              src={displayImage}
              alt={displayName}
              loading="lazy"
              className="h-full w-full scale-[1.015] object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center p-2 text-center text-xs text-slate-400">
              {displayName}
            </div>
          )}

          {quantityInDeck > 0 && (
            <span className="absolute left-1.5 top-1.5 rounded bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
              {quantityInDeck}x
            </span>
          )}

          {synergyScore > 0 && (
            <span className="absolute right-1.5 top-1.5 rounded bg-violet-950/90 px-1.5 py-0.5 text-[10px] font-bold text-violet-200 ring-1 ring-violet-400/50">
              {synergyScore}
            </span>
          )}

          {hasBackFaceImage && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFlipped((f) => !f);
              }}
              aria-label="Flip card face"
              className="absolute right-1.5 bottom-10 rounded bg-slate-950/90 p-1 text-slate-200 opacity-0 ring-1 ring-slate-600 transition group-hover:opacity-100"
            >
              <FlipHorizontal2 className="h-3 w-3" />
            </button>
          )}

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent p-1.5 pt-4 opacity-95 transition group-hover:opacity-100">
            {renderActionButtons(true)}
          </div>
        </div>
      </article>
    );
  }

  // Standard Grid View
  return (
    <article
      onClick={() => onInspect(match)}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/75 transition hover:border-amber-400/50 hover:bg-slate-900"
    >
      <div className="mtg-card-corners relative aspect-[5/7] w-full overflow-hidden bg-slate-950">
        {displayImage ? (
          <img
            src={displayImage}
            alt={displayName}
            loading="lazy"
            className="h-full w-full scale-[1.015] object-cover transition duration-200 group-hover:scale-[1.035]"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-xs text-slate-400">
            {displayName}
          </div>
        )}

        {card.isCommanderEligible && (
          <span
            title="Commander Eligible"
            className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-slate-950/85 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-400/40 backdrop-blur"
          >
            <Crown className="h-3 w-3" />
            CMD
          </span>
        )}

        {synergyScore > 0 && (
          <span className="absolute right-2 top-2 rounded-md bg-violet-950/90 px-1.5 py-0.5 text-[11px] font-bold text-violet-200 ring-1 ring-violet-400/40 backdrop-blur">
            Ripple {synergyScore}
          </span>
        )}

        {hasBackFaceImage && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFlipped((f) => !f);
            }}
            title="Flip card face"
            className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-slate-950/85 px-2 py-1 text-xs font-medium text-slate-200 ring-1 ring-slate-600 transition hover:bg-slate-800"
          >
            <FlipHorizontal2 className="h-3.5 w-3.5" />
            Flip
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-2.5 text-xs">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 font-semibold text-slate-100" title={card.name}>
            {card.name}
          </h3>
          <span className="shrink-0 font-mono text-[11px] text-slate-300">
            {card.priceUsd !== null ? `$${card.priceUsd.toFixed(2)}` : '—'}
          </span>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span className="truncate">{card.typeLine}</span>
          <span className="shrink-0 pl-1 font-mono">
            {card.edhrecRank !== null ? `#${card.edhrecRank.toLocaleString()}` : ''}
          </span>
        </div>

        {matchedReasons.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {matchedReasons.slice(0, 3).map((reason) => (
              <span
                key={reason}
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${getSynergyReasonBadgeClass(reason)}`}
              >
                {reason}
              </span>
            ))}
          </div>
        )}

        {card.roles.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {card.roles.map((role) => {
              const meta = ROLE_BY_ID[role];
              return (
                <span
                  key={role}
                  className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${meta.badgeClass}`}
                >
                  {meta.label}
                </span>
              );
            })}
          </div>
        )}

        <div className="mt-auto pt-1.5">{renderActionButtons(true)}</div>
      </div>
    </article>
  );
}
