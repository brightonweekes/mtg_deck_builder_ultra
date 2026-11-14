import {
  Check,
  Crown,
  ExternalLink,
  FlipHorizontal2,
  Minus,
  Plus,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  PARTNER_TYPE_LABELS,
  ROLE_BY_ID,
  THEME_BY_ID,
} from '../config/searchConfig.js';
import {
  canAddCardToDeck,
  canPairCommanders,
  getMaxAllowedCopies,
} from '../search/commanderRules.js';
import type { CompactCard, FunctionalRole } from '../types/card.js';
import type { ScoredCardMatch } from '../types/search.js';
import {
  ColorIdentityBadges,
  ManaCostDisplay,
  OracleTextDisplay,
} from './ManaSymbol.js';

interface CardDetailModalProps {
  match: ScoredCardMatch | null;
  commanders: readonly CompactCard[];
  enforceColorIdentity: boolean;
  quantityInDeck: number;
  isCommander: boolean;
  onClose: () => void;
  onAddCard: (card: CompactCard) => void;
  onRemoveOneCard: (cardId: string) => void;
  onSetCommander: (card: CompactCard) => void;
  onAddPartner: (card: CompactCard) => void;
  onFilterByRole: (role: FunctionalRole) => void;
  onFilterByTheme: (themeId: string) => void;
  onFindSimilar: (card: CompactCard) => void;
}

export function CardDetailModal({
  match,
  commanders,
  enforceColorIdentity,
  quantityInDeck,
  isCommander,
  onClose,
  onAddCard,
  onRemoveOneCard,
  onSetCommander,
  onAddPartner,
  onFilterByRole,
  onFilterByTheme,
  onFindSimilar,
}: CardDetailModalProps) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    setFlipped(false);
  }, [match?.card.id]);

  useEffect(() => {
    if (!match) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [match, onClose]);

  if (!match) return null;

  const { card, synergyScore, matchedReasons } = match;
  const faces = Array.isArray(card.faces) ? card.faces : [];
  const hasBackFaceImage = faces.length > 1 && Boolean(faces[1]?.imageNormal);
  const displayImage =
    flipped && hasBackFaceImage ? faces[1]!.imageNormal! : card.imageNormal;
  const displayName =
    flipped && faces.length > 1 && faces[1]?.name ? faces[1].name : card.name;

  const maxCopies = getMaxAllowedCopies(card);
  const copyLimitLabel =
    maxCopies === Infinity
      ? 'Unlimited'
      : maxCopies > 1
        ? `Up to ${maxCopies}`
        : 'Singleton (1)';

  const addCheck = canAddCardToDeck(
    card,
    quantityInDeck,
    commanders,
    enforceColorIdentity,
  );
  const canPair =
    !isCommander &&
    commanders.length === 1 &&
    canPairCommanders(commanders[0]!, card);

  const scryfallUrl = `https://scryfall.com/search?q=${encodeURIComponent(`!"${card.name}"`)}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={card.name}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-bold text-slate-100">{card.name}</h2>
              <ManaCostDisplay manaCost={card.manaCost} size="sm" />
            </div>
            <p className="mt-0.5 text-xs text-slate-400">{card.typeLine}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close card details"
            className="shrink-0 rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-slate-400 transition hover:border-slate-500 hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="grid flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[280px_1fr]">
          {/* Left Column: Art & Quick Controls */}
          <div className="flex flex-col gap-3">
            <div className="relative aspect-[5/7] w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
              {displayImage ? (
                <img
                  src={displayImage}
                  alt={displayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center p-4 text-center text-sm text-slate-400">
                  {displayName}
                </div>
              )}

              {hasBackFaceImage && (
                <button
                  type="button"
                  onClick={() => setFlipped((f) => !f)}
                  className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-lg bg-slate-950/90 px-2.5 py-1.5 text-xs font-semibold text-slate-100 ring-1 ring-slate-600 transition hover:bg-slate-800"
                >
                  <FlipHorizontal2 className="h-3.5 w-3.5" />
                  {flipped ? 'Show Front Face' : 'Flip Card'}
                </button>
              )}
            </div>

            {/* Front / Back face switcher for DFC cards */}
            {faces.length > 1 && (
              <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-slate-800 bg-slate-950/70 p-1 text-[11px]">
                {faces.slice(0, 2).map((face, idx) => {
                  const active = (idx === 1) === flipped;
                  return (
                    <button
                      key={`${face.name}-${idx}`}
                      type="button"
                      disabled={idx === 1 && !hasBackFaceImage}
                      onClick={() => setFlipped(idx === 1)}
                      className={`truncate rounded-md px-2 py-1 font-medium transition ${
                        active
                          ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40'
                          : 'text-slate-400 hover:text-slate-200 disabled:opacity-40'
                      }`}
                      title={face.name}
                    >
                      {idx === 0 ? 'Front' : 'Back'}: {face.name}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Deck Action Buttons */}
            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              {isCommander ? (
                <div className="flex items-center justify-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-2 text-xs font-semibold text-amber-200 ring-1 ring-amber-400/40">
                  <Crown className="h-4 w-4" />
                  In Command Zone
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  {quantityInDeck > 0 && (
                    <button
                      type="button"
                      onClick={() => onRemoveOneCard(card.id)}
                      aria-label="Remove one copy from deck"
                      className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs font-semibold text-slate-200 transition hover:border-rose-500/50 hover:text-rose-200"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onAddCard(card)}
                    disabled={!addCheck.allowed}
                    title={addCheck.allowed ? 'Add copy to deck' : addCheck.reason}
                    className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                      quantityInDeck > 0
                        ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/40 hover:bg-emerald-500/30 disabled:opacity-70'
                        : addCheck.allowed
                          ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40 hover:bg-amber-500/30'
                          : 'cursor-not-allowed bg-slate-800 text-slate-500 ring-1 ring-slate-700'
                    }`}
                  >
                    {quantityInDeck > 0 ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        {addCheck.allowed
                          ? `Add Another (${quantityInDeck} in deck)`
                          : `In Deck (${quantityInDeck})`}
                      </>
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5" />
                        Add to Deck
                      </>
                    )}
                  </button>
                </div>
              )}

              {!isCommander && !addCheck.allowed && addCheck.reason && (
                <p className="text-[11px] text-rose-300">{addCheck.reason}</p>
              )}

              {canPair && (
                <button
                  type="button"
                  onClick={() => onAddPartner(card)}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-500/20 px-3 py-2 text-xs font-semibold text-violet-200 ring-1 ring-violet-400/40 transition hover:bg-violet-500/30"
                >
                  <Users className="h-3.5 w-3.5" />
                  Pair as 2nd Commander
                </button>
              )}

              {!isCommander && card.isCommanderEligible && (
                <button
                  type="button"
                  onClick={() => onSetCommander(card)}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-amber-400/60 hover:text-amber-200"
                >
                  <Crown className="h-3.5 w-3.5 text-amber-400" />
                  Set as Commander
                </button>
              )}

              <div className="flex items-center gap-1.5 pt-1">
                {(card.themes.length > 0 || card.roles.length > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      onFindSimilar(card);
                      onClose();
                    }}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-violet-200 transition hover:bg-violet-500/25"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Find Similar
                  </button>
                )}

                <a
                  href={scryfallUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
                >
                  Scryfall
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>

          {/* Right Column: Rules Text, Stats, Tags */}
          <div className="flex min-w-0 flex-col gap-4">
            {/* Key Metadata Badges */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-slate-300">
                <span className="text-slate-500">Identity</span>
                <ColorIdentityBadges colors={card.colorIdentity} size="xs" />
              </div>

              <span className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 font-mono text-slate-300">
                MV {card.cmc}
              </span>

              <span className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 font-mono text-slate-300">
                {card.priceUsd !== null ? `$${card.priceUsd.toFixed(2)}` : 'Price N/A'}
              </span>

              <span className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 font-mono text-slate-300">
                {card.edhrecRank !== null
                  ? `EDHREC #${card.edhrecRank.toLocaleString()}`
                  : 'Unranked'}
              </span>

              <span className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-slate-300">
                Copies: <strong className="text-slate-100">{copyLimitLabel}</strong>
              </span>
            </div>

            {/* Commander / Partner Tags */}
            {(card.isCommanderEligible || card.partnerType) && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {card.isCommanderEligible && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 px-2.5 py-1 font-semibold text-amber-200 ring-1 ring-amber-400/35">
                    <Crown className="h-3.5 w-3.5" />
                    Commander Eligible
                  </span>
                )}
                {card.partnerType && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-violet-500/15 px-2.5 py-1 font-semibold text-violet-200 ring-1 ring-violet-400/35">
                    <Users className="h-3.5 w-3.5" />
                    {PARTNER_TYPE_LABELS[card.partnerType]}
                    {card.partnerWithName ? `: ${card.partnerWithName}` : ''}
                  </span>
                )}
              </div>
            )}

            {/* Synergy Match Reasons */}
            {(synergyScore > 0 || matchedReasons.length > 0) && (
              <div className="rounded-xl border border-violet-500/30 bg-violet-950/25 p-3">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-violet-200">
                    <Sparkles className="h-3.5 w-3.5" />
                    Method A Synergy Match
                  </span>
                  <span className="rounded bg-violet-500/30 px-2 py-0.5 font-mono text-[11px] font-bold text-violet-100">
                    Score {synergyScore}
                  </span>
                </div>
                {matchedReasons.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {matchedReasons.map((reason) => (
                      <span
                        key={reason}
                        className="rounded-md bg-violet-500/20 px-2 py-0.5 text-[11px] text-violet-100 ring-1 ring-violet-400/30"
                      >
                        {reason}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Oracle Text */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/75 p-4">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Oracle Rules Text
              </h3>
              <OracleTextDisplay text={card.oracleText} />
            </div>

            {/* Functional Roles (clickable to filter) */}
            {card.roles.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Functional Roles (click to filter)
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {card.roles.map((role) => {
                    const meta = ROLE_BY_ID[role];
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => {
                          onFilterByRole(role);
                          onClose();
                        }}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition hover:brightness-110 ${meta.badgeClass}`}
                        title={`Filter by role: ${meta.label}`}
                      >
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Mechanical Themes (clickable to filter) */}
            {card.themes.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Mechanical Themes (click to filter)
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {card.themes.map((themeId) => {
                    const theme = THEME_BY_ID[themeId];
                    return (
                      <button
                        key={themeId}
                        type="button"
                        onClick={() => {
                          onFilterByTheme(themeId);
                          onClose();
                        }}
                        className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:border-violet-400/60 hover:bg-violet-500/15 hover:text-violet-100"
                        title={`Filter by mechanic: ${theme?.label ?? themeId}`}
                      >
                        {theme?.label ?? themeId}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Keywords */}
            {card.keywords.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Keywords
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {card.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="rounded-md border border-slate-800 bg-slate-950 px-2 py-0.5 text-[11px] text-slate-300"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
