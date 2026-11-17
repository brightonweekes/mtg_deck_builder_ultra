import {
  AlertCircle,
  ArrowRightLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Coins,
  DollarSign,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collectDeckExcludedCardIds,
  computeDeckSwapPotentialSavings,
  isBasicLandCard,
  selectExpensiveDeckTargets,
} from '../search/budgetSwapEngine.js';
import { getCombinedColorIdentity } from '../search/commanderRules.js';
import { calculateDeckPriceUsd } from '../deck/deckCardExporter.js';
import type { CompactCard } from '../types/card.js';
import type { DeckDraft } from '../types/deck.js';
import type {
  BudgetSwapConfidence,
  BudgetSwapScanRequest,
  BudgetSwapScanResponse,
  BudgetSwapTargetResult,
} from '../types/search.js';
import type { SwapCardOptions } from '../hooks/useDeckDraft.js';
import { ColorIdentityBadges, ManaCostDisplay } from './ManaSymbol.js';

export interface BudgetSwapsModalProps {
  open: boolean;
  draft: DeckDraft;
  totalDeckPriceUsd?: number;
  initialTargetCardId?: string | null;
  suppressEscapeClose?: boolean;
  findBudgetSwaps: (req: BudgetSwapScanRequest) => Promise<BudgetSwapScanResponse>;
  onSwapCard: (
    outCardId: string,
    inCard: CompactCard,
    options?: SwapCardOptions,
  ) => boolean;
  onInspectCard: (card: CompactCard) => void;
  onClose: () => void;
}

interface AppliedSwapRecord {
  outCard: CompactCard;
  inCard: CompactCard;
  movedOutToSideboard: boolean;
  savedUsd: number;
}

const MIN_TARGET_PRICE_PRESETS = [2, 5, 10, 20] as const;
const MAX_SWAP_PRICE_PRESETS = [0.5, 1, 2, 5] as const;
const DEFAULT_VISIBLE_PER_TARGET = 3;

function formatUsd(val: number): string {
  return `$${val.toFixed(2)}`;
}

function getConfidenceBadge(confidence: BudgetSwapConfidence): {
  label: string;
  className: string;
} {
  switch (confidence) {
    case 'direct':
      return {
        label: 'Direct Fit',
        className: 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40',
      };
    case 'similar':
      return {
        label: 'Similar Role',
        className: 'bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/35',
      };
    case 'loose':
      return {
        label: 'Budget Option',
        className: 'bg-slate-800 text-slate-300 ring-1 ring-slate-700',
      };
  }
}

export function BudgetSwapsModal({
  open,
  draft,
  totalDeckPriceUsd,
  initialTargetCardId = null,
  suppressEscapeClose = false,
  findBudgetSwaps,
  onSwapCard,
  onInspectCard,
  onClose,
}: BudgetSwapsModalProps) {
  const [minTargetPriceUsd, setMinTargetPriceUsd] = useState<number>(5);
  const [maxSwapPriceUsd, setMaxSwapPriceUsd] = useState<number>(2);
  const [includeLands, setIncludeLands] = useState<boolean>(true);
  const [moveOutToSideboard, setMoveOutToSideboard] = useState<boolean>(true);
  const [focusedTargetId, setFocusedTargetId] = useState<string | null>(
    initialTargetCardId,
  );
  const [expandedTargets, setExpandedTargets] = useState<Record<string, boolean>>({});
  const [scanResults, setScanResults] = useState<BudgetSwapTargetResult[] | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [sessionSwaps, setSessionSwaps] = useState<AppliedSwapRecord[]>([]);
  const [lastSwapMessage, setLastSwapMessage] = useState<string | null>(null);

  const scanSeqRef = useRef(0);
  const prevOpenRef = useRef(false);
  const prevDraftIdRef = useRef(draft.id);

  // Sync focus target and reset transient session log only on open / deck switch
  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    const deckSwitched = draft.id !== prevDraftIdRef.current;
    prevOpenRef.current = open;
    prevDraftIdRef.current = draft.id;

    if (justOpened || deckSwitched) {
      setFocusedTargetId(initialTargetCardId ?? null);
      setExpandedTargets({});
      setSessionSwaps([]);
      setLastSwapMessage(null);
      setScanError(null);
    } else if (open && initialTargetCardId) {
      setFocusedTargetId(initialTargetCardId);
    }
  }, [open, draft.id, initialTargetCardId]);

  useEffect(() => {
    if (!open || suppressEscapeClose) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, suppressEscapeClose, onClose]);

  const effectiveColorIdentity = useMemo(() => {
    if (!draft.lockSearchToCommanderIdentity || draft.commanders.length === 0) {
      return null;
    }
    return getCombinedColorIdentity(draft.commanders);
  }, [draft.commanders, draft.lockSearchToCommanderIdentity]);

  const targetEntries = useMemo(() => {
    if (focusedTargetId) {
      const entry = draft.mainboard[focusedTargetId];
      if (entry && entry.quantity > 0 && !isBasicLandCard(entry.card)) {
        return [entry];
      }
      return [];
    }
    return selectExpensiveDeckTargets(draft, {
      minPriceUsd: minTargetPriceUsd,
      includeLands,
    });
  }, [draft, focusedTargetId, includeLands, minTargetPriceUsd]);

  const targetIdsKey = useMemo(
    () => targetEntries.map((e) => e.card.id).join(','),
    [targetEntries],
  );
  const excludedIds = useMemo(() => collectDeckExcludedCardIds(draft), [draft]);
  const excludedIdsKey = useMemo(() => excludedIds.join(','), [excludedIds]);
  const commanderIds = useMemo(
    () => draft.commanders.map((c) => c.id),
    [draft.commanders],
  );
  const commanderIdsKey = useMemo(() => commanderIds.join(','), [commanderIds]);
  const ciKey = effectiveColorIdentity ? effectiveColorIdentity.join('') : 'any';

  useEffect(() => {
    if (!open) return;
    if (targetEntries.length === 0) {
      setScanResults([]);
      setIsScanning(false);
      setScanError(null);
      return;
    }

    const reqId = ++scanSeqRef.current;
    let cancelled = false;
    setIsScanning(true);
    setScanError(null);

    void findBudgetSwaps({
      targetCardIds: targetEntries.map((e) => e.card.id),
      commanderIds,
      excludeCardIds: excludedIds,
      colorIdentity: effectiveColorIdentity,
      maxSwapPriceUsd,
      perTargetLimit: 6,
    })
      .then((res) => {
        if (cancelled || reqId !== scanSeqRef.current) return;
        setScanResults(res.results);
      })
      .catch(() => {
        if (cancelled || reqId !== scanSeqRef.current) return;
        setScanError('Could not scan budget alternatives right now.');
      })
      .finally(() => {
        if (!cancelled && reqId === scanSeqRef.current) {
          setIsScanning(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // Keyed dependencies ensure stable scans across deck edits without infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    findBudgetSwaps,
    targetIdsKey,
    excludedIdsKey,
    commanderIdsKey,
    ciKey,
    maxSwapPriceUsd,
  ]);

  const liveResults = useMemo(() => {
    if (!scanResults) return null;
    const excludedIdSet = new Set(excludedIds);
    return scanResults
      .filter((r) => Boolean(draft.mainboard[r.targetCard.id]?.quantity))
      .map((r) => ({
        ...r,
        suggestions: r.suggestions.filter((s) => !excludedIdSet.has(s.card.id)),
      }));
  }, [draft.mainboard, excludedIds, scanResults]);

  const computedDeckPrice = useMemo(
    () =>
      typeof totalDeckPriceUsd === 'number'
        ? totalDeckPriceUsd
        : calculateDeckPriceUsd(draft),
    [draft, totalDeckPriceUsd],
  );

  const potentialSummary = useMemo(
    () =>
      liveResults
        ? computeDeckSwapPotentialSavings(draft, liveResults)
        : { targetsWithSwaps: 0, totalPotentialSavingsUsd: 0 },
    [draft, liveResults],
  );

  const sessionSavedTotal = useMemo(
    () =>
      Math.round(
        sessionSwaps.reduce((sum, item) => sum + item.savedUsd, 0) * 100,
      ) / 100,
    [sessionSwaps],
  );

  if (!open) return null;

  const handleApplySwap = (outCard: CompactCard, inCard: CompactCard, savedUsd: number) => {
    const ok = onSwapCard(outCard.id, inCard, { moveOutToSideboard });
    if (!ok) return;

    setSessionSwaps((prev) => [
      ...prev,
      {
        outCard,
        inCard,
        movedOutToSideboard: moveOutToSideboard,
        savedUsd,
      },
    ]);
    setLastSwapMessage(
      `Swapped ${outCard.name} → ${inCard.name}${savedUsd > 0 ? ` (-${formatUsd(savedUsd)})` : ''}`,
    );
    if (focusedTargetId === outCard.id) {
      setFocusedTargetId(null);
    }
  };

  const handleUndoLastSwap = () => {
    const last = sessionSwaps[sessionSwaps.length - 1];
    if (!last) return;
    const restored = onSwapCard(last.inCard.id, last.outCard, {
      moveOutToSideboard: false,
      removeInFromSideboard: last.movedOutToSideboard,
    });
    if (!restored) return;
    setSessionSwaps((prev) => prev.slice(0, -1));
    setLastSwapMessage(`Restored ${last.outCard.name}.`);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Budget Swap Finder"
      onClick={onClose}
      className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl"
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-200 ring-1 ring-emerald-400/40">
                <Coins className="h-3.5 w-3.5" />
                Budget Swaps
              </span>
              <h2 className="truncate text-base font-bold text-slate-100">
                {draft.name || 'Untitled Commander Deck'}
              </h2>
              {draft.commanders.length > 0 && effectiveColorIdentity && (
                <ColorIdentityBadges colors={effectiveColorIdentity} size="xs" />
              )}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {focusedTargetId && targetEntries[0]
                ? `Showing cheaper same-job alternatives for ${targetEntries[0].card.name}.`
                : 'Find cheaper cards that do the same job in your 99 while respecting your Commander color identity.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Budget Swap Finder"
            className="shrink-0 rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-slate-400 transition hover:border-slate-500 hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Controls & Savings Summary */}
        <section className="space-y-2.5 border-b border-slate-800/90 bg-slate-950/50 px-5 py-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {focusedTargetId ? (
                <button
                  type="button"
                  onClick={() => setFocusedTargetId(null)}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 font-semibold text-amber-200 transition hover:bg-amber-500/25"
                >
                  Show all cards &gt; ${minTargetPriceUsd}
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-slate-400">Replace cards over:</span>
                  {MIN_TARGET_PRICE_PRESETS.map((val) => {
                    const active = minTargetPriceUsd === val;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setMinTargetPriceUsd(val)}
                        className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold transition ${
                          active
                            ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                            : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        &gt; ${val}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-slate-400">Swaps up to:</span>
                {MAX_SWAP_PRICE_PRESETS.map((val) => {
                  const active = maxSwapPriceUsd === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setMaxSwapPriceUsd(val)}
                      className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold transition ${
                        active
                          ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                          : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      &le; ${val < 1 ? val.toFixed(2) : val}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-300">
              {!focusedTargetId && (
                <label className="inline-flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={includeLands}
                    onChange={(e) => setIncludeLands(e.target.checked)}
                    className="h-3.5 w-3.5 accent-emerald-400"
                  />
                  <span>Include lands</span>
                </label>
              )}

              <label
                className="inline-flex cursor-pointer items-center gap-1.5"
                title="When checked, replaced expensive cards move cleanly to Maybeboard instead of disappearing from your list."
              >
                <input
                  type="checkbox"
                  checked={moveOutToSideboard}
                  onChange={(e) => setMoveOutToSideboard(e.target.checked)}
                  className="h-3.5 w-3.5 accent-violet-400"
                />
                <span>Stash cuts in Maybeboard</span>
              </label>
            </div>
          </div>

          {/* Live Metrics & Undo Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 font-mono text-[11px] text-slate-300">
                Deck Est.{' '}
                <strong className="text-slate-100">{formatUsd(computedDeckPrice)}</strong>
              </span>

              {potentialSummary.totalPotentialSavingsUsd > 0 && (
                <span className="rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-1 font-mono text-[11px] text-emerald-200">
                  Est. trimmable: -{formatUsd(potentialSummary.totalPotentialSavingsUsd)}
                </span>
              )}

              {sessionSwaps.length > 0 && (
                <span className="rounded-lg border border-cyan-500/35 bg-cyan-500/15 px-2.5 py-1 font-mono text-[11px] text-cyan-200">
                  Saved this session: -{formatUsd(sessionSavedTotal)} ({sessionSwaps.length}{' '}
                  swap{sessionSwaps.length === 1 ? '' : 's'})
                </span>
              )}

              {lastSwapMessage && (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300">
                  <Check className="h-3 w-3" />
                  {lastSwapMessage}
                </span>
              )}

              {isScanning && liveResults && liveResults.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  Refreshing swaps...
                </span>
              )}
            </div>

            {sessionSwaps.length > 0 && (
              <button
                type="button"
                onClick={handleUndoLastSwap}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-amber-400/50 hover:text-amber-200"
              >
                <RotateCcw className="h-3 w-3" />
                Undo Last Swap
              </button>
            )}
          </div>
        </section>

        {/* Results Body */}
        <div className="flex-1 space-y-3 overflow-y-auto p-5 text-xs">
          {scanError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/25 px-3.5 py-2.5 text-rose-200"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{scanError}</span>
            </div>
          )}

          {targetEntries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/60 p-8 text-center">
              <DollarSign className="mx-auto mb-2 h-7 w-7 text-emerald-400/80" />
              <p className="font-semibold text-slate-200">
                No cards over ${minTargetPriceUsd} found in your mainboard
                {!includeLands ? ' (excluding lands)' : ''}.
              </p>
              <p className="mt-1 text-slate-400">
                {minTargetPriceUsd > 2
                  ? 'Try lowering the "Replace cards over" filter to > $2 to trim mid-range staples.'
                  : 'Your mainboard is already super budget-friendly!'}
              </p>
              {minTargetPriceUsd > 2 && !focusedTargetId && (
                <button
                  type="button"
                  onClick={() => setMinTargetPriceUsd(2)}
                  className="mt-3 rounded-lg bg-amber-500/20 px-3 py-1.5 font-semibold text-amber-200 ring-1 ring-amber-400/40 hover:bg-amber-500/30"
                >
                  Check cards &gt; $2
                </button>
              )}
            </div>
          ) : (liveResults === null || (isScanning && liveResults.length === 0)) ? (
            <div className="space-y-3">
              {Array.from({ length: Math.min(4, targetEntries.length) }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-28 animate-pulse rounded-xl border border-slate-800 bg-slate-950/70"
                />
              ))}
            </div>
          ) : (
            liveResults.map(({ targetCard, suggestions }) => {
              const qty = draft.mainboard[targetCard.id]?.quantity ?? 1;
              const isExpanded = Boolean(expandedTargets[targetCard.id]);
              const visibleSuggestions = isExpanded
                ? suggestions
                : suggestions.slice(0, DEFAULT_VISIBLE_PER_TARGET);
              const hiddenCount = suggestions.length - visibleSuggestions.length;

              return (
                <article
                  key={targetCard.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/75 p-3.5"
                >
                  <div className="grid gap-3 md:grid-cols-[240px_1fr]">
                    {/* Left: Card Being Replaced */}
                    <div className="flex flex-col justify-between gap-2 rounded-xl border border-slate-800/80 bg-slate-900/75 p-3">
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => onInspectCard(targetCard)}
                            className="text-left text-sm font-bold text-amber-100 hover:text-amber-300"
                          >
                            {qty > 1 ? `${qty}x ` : ''}
                            {targetCard.name}
                          </button>
                          <span className="shrink-0 rounded-md bg-rose-500/15 px-1.5 py-0.5 font-mono text-[11px] font-bold text-rose-200 ring-1 ring-rose-400/30">
                            {targetCard.priceUsd !== null ? formatUsd(targetCard.priceUsd) : '—'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">{targetCard.typeLine}</p>
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <ManaCostDisplay manaCost={targetCard.manaCost} size="xs" />
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                            MV {targetCard.cmc}
                          </span>
                        </div>
                      </div>

                      {suggestions[0] && (
                        <div className="border-t border-slate-800/80 pt-1.5 text-[11px] text-emerald-300">
                          Top swap saves{' '}
                          <strong className="font-mono">
                            {formatUsd(suggestions[0].savingsUsd)}
                          </strong>
                        </div>
                      )}
                    </div>

                    {/* Right: Budget Replacement Candidates */}
                    <div className="flex flex-col gap-2">
                      {suggestions.length === 0 ? (
                        <div className="flex flex-1 flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-slate-800 bg-slate-900/40 px-3.5 py-3 text-slate-400">
                          <span>
                            No close functional twin found at &le; $
                            {maxSwapPriceUsd < 1 ? maxSwapPriceUsd.toFixed(2) : maxSwapPriceUsd}.
                          </span>
                          {maxSwapPriceUsd < 5 && (
                            <button
                              type="button"
                              onClick={() =>
                                setMaxSwapPriceUsd(maxSwapPriceUsd < 2 ? 2 : 5)
                              }
                              className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-500/25"
                            >
                              Try &le; ${maxSwapPriceUsd < 2 ? 2 : 5}
                            </button>
                          )}
                        </div>
                      ) : (
                        <>
                          {visibleSuggestions.map((cand) => {
                            const conf = getConfidenceBadge(cand.confidence);
                            return (
                              <div
                                key={cand.card.id}
                                className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-800 bg-slate-900/85 px-3 py-2 transition hover:border-emerald-400/40"
                              >
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => onInspectCard(cand.card)}
                                      className="truncate text-left font-semibold text-slate-100 hover:text-amber-200"
                                    >
                                      {cand.card.name}
                                    </button>
                                    <ManaCostDisplay manaCost={cand.card.manaCost} size="xs" />
                                    <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                                      {cand.card.priceUsd !== null
                                        ? formatUsd(cand.card.priceUsd)
                                        : '—'}
                                    </span>
                                    {cand.savingsUsd > 0 && (
                                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-200 ring-1 ring-emerald-500/30">
                                        Save {formatUsd(cand.savingsUsd)}
                                      </span>
                                    )}
                                    <span
                                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${conf.className}`}
                                    >
                                      {conf.label}
                                    </span>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                                      MV {cand.card.cmc}
                                    </span>
                                    {cand.reasons.map((reason) => (
                                      <span
                                        key={reason}
                                        className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] ${
                                          reason.startsWith('Fits ')
                                            ? 'bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/35'
                                            : 'bg-slate-800/90 text-slate-300'
                                        }`}
                                      >
                                        {reason.startsWith('Fits ') && (
                                          <Sparkles className="h-2.5 w-2.5" />
                                        )}
                                        {reason}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleApplySwap(targetCard, cand.card, cand.savingsUsd)
                                  }
                                  aria-label={`Swap ${targetCard.name} for ${cand.card.name}`}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-[11px] font-bold text-emerald-200 ring-1 ring-emerald-400/40 transition hover:bg-emerald-500 hover:text-slate-950"
                                >
                                  <ArrowRightLeft className="h-3 w-3" />
                                  Swap
                                </button>
                              </div>
                            );
                          })}

                          {suggestions.length > DEFAULT_VISIBLE_PER_TARGET && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedTargets((prev) => ({
                                  ...prev,
                                  [targetCard.id]: !isExpanded,
                                }))
                              }
                              className="inline-flex w-fit items-center gap-1 self-start rounded-lg px-2 py-0.5 text-[11px] font-medium text-slate-400 transition hover:bg-slate-900 hover:text-slate-200"
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronUp className="h-3.5 w-3.5" />
                                  Show fewer
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="h-3.5 w-3.5" />
                                  Show {hiddenCount} more option{hiddenCount === 1 ? '' : 's'}
                                </>
                              )}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
