import {
  ArrowLeftRight,
  ArrowUpRight,
  CheckCircle2,
  Crown,
  FolderOpen,
  LayoutDashboard,
  Lock,
  Minus,
  Plus,
  Sparkles,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ROLE_BY_ID } from '../config/searchConfig.js';
import { canAddCardToDeck } from '../search/commanderRules.js';
import type { CompactCard, ManaColor } from '../types/card.js';
import type { DeckCardEntry, DeckDraft } from '../types/deck.js';
import { ColorIdentityBadges, ManaCostDisplay } from './ManaSymbol.js';

interface QuickDeckDrawerProps {
  open: boolean;
  deck: DeckDraft;
  totalCardCount: number;
  sideboardCardCount: number;
  totalDeckPriceUsd: number;
  combinedColorIdentity: ManaColor[];
  onClose: () => void;
  onRenameDeck: (name: string) => void;
  onRemoveCommander: (cardId: string) => void;
  onAddCard: (card: CompactCard) => void;
  onRemoveOneCard: (cardId: string) => void;
  onDeleteCard: (cardId: string) => void;
  onMoveToSideboard: (cardId: string) => void;
  onMoveToMainboard: (cardId: string) => void;
  onDeleteSideboard: (cardId: string) => void;
  onClearDeck: () => void;
  onToggleIdentityLock: (locked: boolean) => void;
  onMatchSynergy: () => void;
  onOpenFullWorkspace: () => void;
  onOpenDeckManager: () => void;
  onInspectCard: (card: CompactCard) => void;
}

const PRIMARY_TYPE_FALLBACKS = [
  'Creature',
  'Land',
  'Artifact',
  'Enchantment',
  'Instant',
  'Sorcery',
  'Planeswalker',
  'Battle',
] as const;

function getEntryGroupLabel(card: CompactCard): string {
  const primaryRole = card.roles[0];
  if (primaryRole) {
    return ROLE_BY_ID[primaryRole].label;
  }
  const typeLower = card.typeLine.toLowerCase();
  for (const typeName of PRIMARY_TYPE_FALLBACKS) {
    if (typeLower.includes(typeName.toLowerCase())) {
      return typeName === 'Instant' || typeName === 'Sorcery' ? 'Spells' : `${typeName}s`;
    }
  }
  return 'Other Cards';
}

export function QuickDeckDrawer({
  open,
  deck,
  totalCardCount,
  sideboardCardCount,
  totalDeckPriceUsd,
  combinedColorIdentity,
  onClose,
  onRenameDeck,
  onRemoveCommander,
  onAddCard,
  onRemoveOneCard,
  onDeleteCard,
  onMoveToSideboard,
  onMoveToMainboard,
  onDeleteSideboard,
  onClearDeck,
  onToggleIdentityLock,
  onMatchSynergy,
  onOpenFullWorkspace,
  onOpenDeckManager,
  onInspectCard,
}: QuickDeckDrawerProps) {
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirmClear(false);
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const groupedMainboard = useMemo(() => {
    const entries = Object.values(deck.mainboard);
    const groups = new Map<string, { totalQty: number; entries: DeckCardEntry[] }>();

    for (const entry of entries) {
      const label = getEntryGroupLabel(entry.card);
      const bucket = groups.get(label);
      if (bucket) {
        bucket.totalQty += entry.quantity;
        bucket.entries.push(entry);
      } else {
        groups.set(label, { totalQty: entry.quantity, entries: [entry] });
      }
    }

    return Array.from(groups.entries())
      .map(([label, data]) => ({
        label,
        totalQty: data.totalQty,
        entries: [...data.entries].sort((a, b) => a.card.name.localeCompare(b.card.name)),
      }))
      .sort((a, b) => b.totalQty - a.totalQty || a.label.localeCompare(b.label));
  }, [deck.mainboard]);

  if (!open) return null;

  const progressPct = Math.min(100, Math.round((totalCardCount / 100) * 100));
  const isExact100 = totalCardCount === 100;
  const isOver100 = totalCardCount > 100;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Deck Draft Drawer"
      onClick={onClose}
      className="fixed inset-0 z-40 flex justify-end bg-slate-950/75 backdrop-blur-xs"
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col border-l border-slate-800 bg-slate-950 shadow-2xl"
      >
        {/* Drawer Header */}
        <div className="border-b border-slate-800 px-4 py-3.5">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={deck.name}
              onChange={(e) => onRenameDeck(e.target.value)}
              aria-label="Deck name"
              className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-sm font-bold text-slate-100 outline-none focus:border-amber-400/60"
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close deck drawer"
              className="rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-400 hover:border-slate-600 hover:text-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* 100-Card Progress & Stats */}
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 font-mono font-bold ${
                    isOver100
                      ? 'text-rose-300'
                      : isExact100
                        ? 'text-emerald-300'
                        : 'text-amber-200'
                  }`}
                >
                  {isExact100 && <CheckCircle2 className="h-3.5 w-3.5" />}
                  {totalCardCount} / 100 Cards
                </span>
                {deck.commanders.length > 0 && (
                  <ColorIdentityBadges colors={combinedColorIdentity} size="xs" />
                )}
              </div>
              <span className="font-mono text-slate-300">
                Est. ${totalDeckPriceUsd.toFixed(2)}
              </span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full transition-all duration-200 ${
                  isOver100
                    ? 'bg-rose-500'
                    : isExact100
                      ? 'bg-emerald-500'
                      : 'bg-amber-400'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {isOver100 && (
              <p className="text-[11px] text-rose-300">
                Deck exceeds 100 cards (remove {totalCardCount - 100} to meet Commander size).
              </p>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenFullWorkspace();
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-2.5 py-1.5 font-semibold text-slate-950 transition hover:bg-amber-400"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Open Deck Studio
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenDeckManager();
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-semibold text-slate-200 transition hover:border-sky-400/50 hover:text-sky-200"
            >
              <FolderOpen className="h-3.5 w-3.5 text-sky-400" />
              Decks / Share
            </button>
          </div>
        </div>

        {/* Scrollable Deck Contents */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {/* Command Zone */}
          <section className="rounded-xl border border-amber-500/30 bg-amber-950/15 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-300">
                <Crown className="h-3.5 w-3.5" />
                Command Zone ({deck.commanders.length})
              </h2>
              {deck.commanders.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onMatchSynergy();
                    onClose();
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-violet-500/20 px-2 py-1 text-[11px] font-semibold text-violet-200 ring-1 ring-violet-400/40 hover:bg-violet-500/30"
                >
                  <Sparkles className="h-3 w-3" />
                  Match Synergy
                </button>
              )}
            </div>

            {deck.commanders.length === 0 ? (
              <p className="text-xs text-slate-400">
                No Commander selected yet. Click <strong>CMD</strong> on any eligible card to set
                your Commander and auto-lock colors.
              </p>
            ) : (
              <div className="space-y-2">
                {deck.commanders.map((cmd) => (
                  <div
                    key={cmd.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/25 bg-slate-900/90 px-2.5 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => onInspectCard(cmd)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-xs font-semibold text-amber-100 hover:underline">
                        {cmd.name}
                      </div>
                      <div className="truncate text-[10px] text-slate-400">{cmd.typeLine}</div>
                    </button>
                    <ManaCostDisplay manaCost={cmd.manaCost} size="xs" />
                    <button
                      type="button"
                      onClick={() => onRemoveCommander(cmd.id)}
                      aria-label={`Remove ${cmd.name} from Command Zone`}
                      className="rounded p-1 text-slate-400 hover:bg-rose-500/15 hover:text-rose-300"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                <label className="mt-1 flex cursor-pointer items-center justify-between rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-300">
                  <span className="inline-flex items-center gap-1.5">
                    {deck.lockSearchToCommanderIdentity ? (
                      <Lock className="h-3.5 w-3.5 text-amber-300" />
                    ) : (
                      <Unlock className="h-3.5 w-3.5 text-slate-500" />
                    )}
                    Lock search to Commander colors
                  </span>
                  <input
                    type="checkbox"
                    checked={deck.lockSearchToCommanderIdentity}
                    onChange={(e) => onToggleIdentityLock(e.target.checked)}
                    className="h-4 w-4 accent-amber-400"
                  />
                </label>
              </div>
            )}
          </section>

          {/* Mainboard Grouped List */}
          {groupedMainboard.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">
              Mainboard is empty. Click <strong>Add to Deck</strong> on any card to start
              building the 99.
            </div>
          ) : (
            <div className="space-y-3">
              {groupedMainboard.map((group) => (
                <section
                  key={group.label}
                  className="rounded-xl border border-slate-800/80 bg-slate-900/40"
                >
                  <header className="flex items-center justify-between border-b border-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-200">
                    <span>{group.label}</span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">
                      {group.totalQty}
                    </span>
                  </header>

                  <ul className="divide-y divide-slate-800/60">
                    {group.entries.map((entry) => {
                      const canIncrement = canAddCardToDeck(
                        entry.card,
                        entry.quantity,
                        deck.commanders,
                        deck.lockSearchToCommanderIdentity,
                      ).allowed;

                      return (
                        <li
                          key={entry.card.id}
                          className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-900/80"
                        >
                          <span className="w-6 shrink-0 font-mono font-semibold text-amber-200">
                            {entry.quantity}x
                          </span>

                          <button
                            type="button"
                            onClick={() => onInspectCard(entry.card)}
                            className="min-w-0 flex-1 truncate text-left font-medium text-slate-200 hover:text-amber-200"
                            title={entry.card.name}
                          >
                            {entry.card.name}
                          </button>

                          <span className="hidden shrink-0 sm:inline-flex">
                            <ManaCostDisplay manaCost={entry.card.manaCost} size="xs" />
                          </span>

                          <div className="flex shrink-0 items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => onRemoveOneCard(entry.card.id)}
                              aria-label={`Decrease quantity of ${entry.card.name}`}
                              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onAddCard(entry.card)}
                              disabled={!canIncrement}
                              aria-label={`Increase quantity of ${entry.card.name}`}
                              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onMoveToSideboard(entry.card.id)}
                              title="Move to Considering"
                              aria-label={`Move ${entry.card.name} to Considering`}
                              className="rounded p-1 text-slate-400 hover:bg-violet-500/15 hover:text-violet-300"
                            >
                              <ArrowLeftRight className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteCard(entry.card.id)}
                              aria-label={`Remove ${entry.card.name} from deck`}
                              className="rounded p-1 text-slate-500 hover:bg-rose-500/15 hover:text-rose-300"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {/* Considering / Maybeboard List */}
          {sideboardCardCount > 0 && (
            <section className="rounded-xl border border-violet-500/30 bg-violet-950/15">
              <header className="flex items-center justify-between border-b border-violet-500/20 px-3 py-2 text-xs font-semibold text-violet-200">
                <span>Considering / Maybeboard</span>
                <span className="rounded bg-violet-500/20 px-1.5 py-0.5 font-mono text-[11px]">
                  {sideboardCardCount}
                </span>
              </header>
              <ul className="divide-y divide-slate-800/60">
                {Object.values(deck.sideboard)
                  .sort((a, b) => a.card.name.localeCompare(b.card.name))
                  .map((entry) => (
                    <li
                      key={entry.card.id}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-900/70"
                    >
                      <span className="w-6 shrink-0 font-mono font-semibold text-violet-300">
                        {entry.quantity}x
                      </span>
                      <button
                        type="button"
                        onClick={() => onInspectCard(entry.card)}
                        className="min-w-0 flex-1 truncate text-left font-medium text-slate-200 hover:text-amber-200"
                      >
                        {entry.card.name}
                      </button>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => onMoveToMainboard(entry.card.id)}
                          title="Move to Mainboard"
                          aria-label={`Move ${entry.card.name} to Mainboard`}
                          className="rounded p-1 text-emerald-300 hover:bg-emerald-500/20"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteSideboard(entry.card.id)}
                          aria-label={`Delete ${entry.card.name} from Considering`}
                          className="rounded p-1 text-slate-500 hover:bg-rose-500/15 hover:text-rose-300"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-800 px-4 py-3 text-xs">
          {confirmClear ? (
            <div className="flex flex-1 items-center justify-between gap-2 rounded-lg border border-rose-500/40 bg-rose-950/30 px-2.5 py-1.5">
              <span className="text-rose-200">Clear entire deck?</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onClearDeck();
                    setConfirmClear(false);
                  }}
                  className="rounded bg-rose-500 px-2 py-0.5 font-semibold text-white hover:bg-rose-400"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="rounded border border-slate-700 px-2 py-0.5 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                disabled={totalCardCount === 0}
                onClick={() => setConfirmClear(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 font-medium text-slate-300 transition hover:border-rose-500/50 hover:text-rose-200 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear Deck
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-slate-100 hover:bg-slate-700"
              >
                Done
              </button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
