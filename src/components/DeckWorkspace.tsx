import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Crown,
  FolderOpen,
  Lock,
  Minus,
  Plus,
  Search,
  Share2,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
  Users,
  Wand2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { ROLE_BY_ID } from '../config/searchConfig.js';
import {
  isPrimaryLandCard,
  ROLE_TARGETS,
  type DeckAnalyticsReport,
  type ManaPoolColor,
} from '../deck/deckAnalytics.js';
import { canAddCardToDeck, canHaveSecondCommander } from '../search/commanderRules.js';
import type { CompactCard, FunctionalRole, ManaColor } from '../types/card.js';
import type { DeckCardEntry, DeckDraft, DeckGroupMode } from '../types/deck.js';
import { ColorIdentityBadges, ManaCostDisplay } from './ManaSymbol.js';

interface DeckWorkspaceProps {
  deck: DeckDraft;
  analytics: DeckAnalyticsReport;
  totalDeckPriceUsd: number;
  combinedColorIdentity: ManaColor[];
  basicLands: Record<string, CompactCard>;
  onRenameDeck: (name: string) => void;
  onRemoveCommander: (cardId: string) => void;
  onToggleIdentityLock: (locked: boolean) => void;
  onMatchSynergy: () => void;
  onFindPartner: () => void;
  onAddCard: (card: CompactCard) => void;
  onRemoveOneCard: (cardId: string) => void;
  onDeleteCard: (cardId: string) => void;
  onMoveToSideboard: (cardId: string) => void;
  onMoveToMainboard: (cardId: string) => void;
  onAddToSideboard: (card: CompactCard) => void;
  onRemoveOneSideboard: (cardId: string) => void;
  onDeleteSideboard: (cardId: string) => void;
  onAutoFillBasics: () => void;
  onMoveIllegalToSideboard: () => void;
  onQuickFilterRole: (role: FunctionalRole | 'lands') => void;
  onOpenDeckManager: (tab: 'decks' | 'import-export' | 'share') => void;
  onBackToSearch: () => void;
  onChooseCommander: () => void;
  onInspectCard: (card: CompactCard) => void;
}

const BASIC_LAND_ORDER: ReadonlyArray<{
  name: string;
  color: ManaPoolColor;
  dotClass: string;
}> = [
  { name: 'Plains', color: 'W', dotClass: 'bg-amber-200 text-slate-950' },
  { name: 'Island', color: 'U', dotClass: 'bg-sky-400 text-slate-950' },
  { name: 'Swamp', color: 'B', dotClass: 'bg-purple-500 text-white' },
  { name: 'Mountain', color: 'R', dotClass: 'bg-rose-500 text-white' },
  { name: 'Forest', color: 'G', dotClass: 'bg-emerald-500 text-slate-950' },
  { name: 'Wastes', color: 'C', dotClass: 'bg-slate-400 text-slate-950' },
] as const;

const COLOR_BAR_META: Readonly<
  Record<ManaPoolColor, { label: string; pipBar: string; sourceBar: string; badge: string }>
> = {
  W: {
    label: 'White',
    pipBar: 'bg-amber-200',
    sourceBar: 'bg-amber-400/75',
    badge: 'bg-amber-200 text-slate-950',
  },
  U: {
    label: 'Blue',
    pipBar: 'bg-sky-400',
    sourceBar: 'bg-sky-500/75',
    badge: 'bg-sky-400 text-slate-950',
  },
  B: {
    label: 'Black',
    pipBar: 'bg-purple-500',
    sourceBar: 'bg-purple-400/75',
    badge: 'bg-purple-600 text-white',
  },
  R: {
    label: 'Red',
    pipBar: 'bg-rose-500',
    sourceBar: 'bg-rose-400/75',
    badge: 'bg-rose-500 text-white',
  },
  G: {
    label: 'Green',
    pipBar: 'bg-emerald-500',
    sourceBar: 'bg-emerald-400/75',
    badge: 'bg-emerald-500 text-slate-950',
  },
  C: {
    label: 'Colorless',
    pipBar: 'bg-slate-400',
    sourceBar: 'bg-slate-500/75',
    badge: 'bg-slate-400 text-slate-950',
  },
};

const PRIMARY_TYPES = [
  'Creature',
  'Artifact',
  'Enchantment',
  'Instant',
  'Sorcery',
  'Planeswalker',
  'Land',
  'Battle',
] as const;

const COLOR_NAMES: Readonly<Record<ManaColor, string>> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

function getPrimaryTypeLabel(card: CompactCard): string {
  const lower = card.typeLine.toLowerCase();
  for (const t of PRIMARY_TYPES) {
    if (lower.includes(t.toLowerCase())) {
      return t === 'Sorcery' ? 'Sorceries' : `${t}s`;
    }
  }
  return 'Other';
}

function getGroupKey(card: CompactCard, mode: DeckGroupMode): string {
  if (mode === 'type') {
    return getPrimaryTypeLabel(card);
  }
  if (mode === 'cmc') {
    if (isPrimaryLandCard(card)) return 'Lands';
    const val = Math.max(0, Math.floor(card.cmc));
    return val >= 7 ? 'MV 7+' : `MV ${val}`;
  }
  if (mode === 'color') {
    if (isPrimaryLandCard(card)) return 'Lands';
    if (card.colors.length === 0) return 'Colorless';
    if (card.colors.length > 1) return 'Multicolor';
    return COLOR_NAMES[card.colors[0]!] ?? 'Other';
  }
  // mode === 'role'
  if (isPrimaryLandCard(card)) return 'Lands';
  const primaryRole = card.roles[0];
  if (primaryRole) return ROLE_BY_ID[primaryRole].label;
  return getPrimaryTypeLabel(card);
}

export function DeckWorkspace({
  deck,
  analytics,
  totalDeckPriceUsd,
  combinedColorIdentity,
  basicLands,
  onRenameDeck,
  onRemoveCommander,
  onToggleIdentityLock,
  onMatchSynergy,
  onFindPartner,
  onAddCard,
  onRemoveOneCard,
  onDeleteCard,
  onMoveToSideboard,
  onMoveToMainboard,
  onAddToSideboard,
  onRemoveOneSideboard,
  onDeleteSideboard,
  onAutoFillBasics,
  onMoveIllegalToSideboard,
  onQuickFilterRole,
  onOpenDeckManager,
  onBackToSearch,
  onChooseCommander,
  onInspectCard,
}: DeckWorkspaceProps) {
  const [groupMode, setGroupMode] = useState<DeckGroupMode>('role');
  const [showConsidering, setShowConsidering] = useState(true);

  const illegalSet = useMemo(
    () => new Set(analytics.illegalColorCardIds),
    [analytics.illegalColorCardIds],
  );
  const overLimitSet = useMemo(
    () => new Set(analytics.overCopyLimitCardIds),
    [analytics.overCopyLimitCardIds],
  );

  const groupedMainboard = useMemo(() => {
    const groups = new Map<string, { totalQty: number; entries: DeckCardEntry[] }>();
    for (const entry of Object.values(deck.mainboard)) {
      if (entry.quantity <= 0) continue;
      const key = getGroupKey(entry.card, groupMode);
      const bucket = groups.get(key);
      if (bucket) {
        bucket.totalQty += entry.quantity;
        bucket.entries.push(entry);
      } else {
        groups.set(key, { totalQty: entry.quantity, entries: [entry] });
      }
    }

    return Array.from(groups.entries())
      .map(([label, val]) => ({
        label,
        totalQty: val.totalQty,
        entries: [...val.entries].sort(
          (a, b) => a.card.cmc - b.card.cmc || a.card.name.localeCompare(b.card.name),
        ),
      }))
      .sort((a, b) => {
        if (groupMode === 'cmc') {
          if (a.label === 'Lands') return 1;
          if (b.label === 'Lands') return -1;
          return a.label.localeCompare(b.label, undefined, { numeric: true });
        }
        return b.totalQty - a.totalQty || a.label.localeCompare(b.label);
      });
  }, [deck.mainboard, groupMode]);

  const sideboardEntries = useMemo(
    () =>
      Object.values(deck.sideboard)
        .filter((e) => e.quantity > 0)
        .sort((a, b) => a.card.name.localeCompare(b.card.name)),
    [deck.sideboard],
  );

  const maxCurveBucket = Math.max(1, ...analytics.cmcBuckets.map((b) => b.total));
  const maxPipOrSource = Math.max(
    1,
    ...(['W', 'U', 'B', 'R', 'G', 'C'] as ManaPoolColor[]).map((c) =>
      Math.max(analytics.pipCounts[c], analytics.sourceCounts[c]),
    ),
  );

  const activePoolColors = (['W', 'U', 'B', 'R', 'G', 'C'] as ManaPoolColor[]).filter(
    (c) =>
      c === 'C' ||
      combinedColorIdentity.includes(c as ManaColor) ||
      analytics.pipCounts[c] > 0 ||
      analytics.sourceCounts[c] > 0,
  );

  const visibleBasicLands = BASIC_LAND_ORDER.filter((b) => {
    if (!basicLands[b.name]) return false;
    if (deck.commanders.length === 0) return true;
    if (b.color === 'C') return combinedColorIdentity.length === 0 || (deck.mainboard[basicLands[b.name]!.id]?.quantity ?? 0) > 0;
    return combinedColorIdentity.includes(b.color);
  });

  const canPair = deck.commanders.length === 1 && canHaveSecondCommander(deck.commanders[0]!);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 px-4 py-4">
      {/* Top Deck Toolbar */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex min-w-[260px] flex-1 flex-wrap items-center gap-3">
          <input
            type="text"
            value={deck.name}
            onChange={(e) => onRenameDeck(e.target.value)}
            aria-label="Deck name"
            className="min-w-[220px] max-w-sm flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-base font-bold text-slate-100 outline-none focus:border-amber-400"
          />

          <span
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-mono text-xs font-bold ${
              analytics.isCommanderLegal100
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                : analytics.totalCount > 100 || analytics.illegalColorCardIds.length > 0
                  ? 'border-rose-500/40 bg-rose-500/15 text-rose-200'
                  : 'border-amber-500/40 bg-amber-500/15 text-amber-200'
            }`}
          >
            {analytics.isCommanderLegal100 && <CheckCircle2 className="h-3.5 w-3.5" />}
            {analytics.totalCount} / 100 Cards
          </span>

          <span className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 font-mono text-xs text-slate-300">
            Est. ${totalDeckPriceUsd.toFixed(2)}
          </span>

          <span className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-300">
            Avg MV <strong className="font-mono text-slate-100">{analytics.averageCmc.toFixed(2)}</strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => onOpenDeckManager('decks')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 font-semibold text-slate-200 transition hover:border-amber-400/50 hover:text-amber-200"
          >
            <FolderOpen className="h-3.5 w-3.5 text-amber-400" />
            My Decks
          </button>

          <button
            type="button"
            onClick={() => onOpenDeckManager('import-export')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 font-semibold text-slate-200 transition hover:border-sky-400/50 hover:text-sky-200"
          >
            <Upload className="h-3.5 w-3.5 text-sky-400" />
            Import / Export
          </button>

          <button
            type="button"
            onClick={() => onOpenDeckManager('share')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 font-semibold text-slate-200 transition hover:border-violet-400/50 hover:text-violet-200"
          >
            <Share2 className="h-3.5 w-3.5 text-violet-400" />
            Share Link
          </button>

          <button
            type="button"
            onClick={onBackToSearch}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 font-semibold text-slate-950 transition hover:bg-amber-400"
          >
            <Search className="h-3.5 w-3.5" />
            Browse Catalog
          </button>
        </div>
      </section>

      {/* Legality Issues Banner */}
      {analytics.issues.length > 0 && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/35 bg-amber-950/20 px-4 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-amber-100">
              {analytics.issues.map((issue) => (
                <li
                  key={issue.type}
                  className={issue.severity === 'error' ? 'font-semibold text-rose-200' : ''}
                >
                  • {issue.message}
                </li>
              ))}
            </ul>
          </div>

          {analytics.illegalColorCardIds.length > 0 && (
            <button
              type="button"
              onClick={onMoveIllegalToSideboard}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/20 px-2.5 py-1 font-semibold text-rose-100 ring-1 ring-rose-400/40 hover:bg-rose-500/30"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Move Off-Color Cards to Considering
            </button>
          )}
        </section>
      )}

      {/* Command Zone + Basic Land Station */}
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        {/* Command Zone Panel */}
        <section className="rounded-2xl border border-amber-500/30 bg-slate-900/60 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-amber-200">
                Command Zone ({deck.commanders.length})
              </h2>
              {deck.commanders.length > 0 && (
                <ColorIdentityBadges colors={combinedColorIdentity} size="xs" />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {deck.commanders.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={onMatchSynergy}
                    className="inline-flex items-center gap-1 rounded-lg bg-violet-500/20 px-2.5 py-1 text-xs font-semibold text-violet-200 ring-1 ring-violet-400/40 hover:bg-violet-500/30"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Match Synergy
                  </button>

                  {canPair && (
                    <button
                      type="button"
                      onClick={onFindPartner}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-200 ring-1 ring-amber-400/40 hover:bg-amber-500/30"
                    >
                      <Users className="h-3.5 w-3.5" />
                      Find Partner
                    </button>
                  )}

                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] text-slate-300">
                    {deck.lockSearchToCommanderIdentity ? (
                      <Lock className="h-3 w-3 text-amber-300" />
                    ) : (
                      <Unlock className="h-3 w-3 text-slate-500" />
                    )}
                    <span>Identity Lock</span>
                    <input
                      type="checkbox"
                      checked={deck.lockSearchToCommanderIdentity}
                      onChange={(e) => onToggleIdentityLock(e.target.checked)}
                      className="h-3.5 w-3.5 accent-amber-400"
                    />
                  </label>
                </>
              )}
            </div>
          </div>

          {deck.commanders.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-950/50 p-4 text-xs text-slate-400">
              <span>
                Select a Legendary Commander in Catalog Search (or paste a list with Import) to lock
                your color identity.
              </span>
              <button
                type="button"
                onClick={onChooseCommander}
                className="rounded-lg bg-amber-500/20 px-3 py-1.5 font-semibold text-amber-200 ring-1 ring-amber-400/40 hover:bg-amber-500/30"
              >
                Choose Commander
              </button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {deck.commanders.map((cmd) => (
                <div
                  key={cmd.id}
                  onClick={() => onInspectCard(cmd)}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-amber-500/25 bg-slate-950/80 p-2.5 transition hover:border-amber-400/60"
                >
                  {cmd.imageSmall && (
                    <img
                      src={cmd.imageSmall}
                      alt={cmd.name}
                      className="h-16 w-12 shrink-0 rounded-md object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-amber-100">{cmd.name}</div>
                    <div className="truncate text-[11px] text-slate-400">{cmd.typeLine}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <ManaCostDisplay manaCost={cmd.manaCost} size="xs" />
                      {cmd.priceUsd !== null && (
                        <span className="font-mono text-[11px] text-slate-400">
                          ${cmd.priceUsd.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveCommander(cmd.id);
                    }}
                    aria-label={`Remove ${cmd.name} from Command Zone`}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/15 hover:text-rose-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Basic Land Quick-Station */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Basic Land Station
              </h2>
              <p className="text-[11px] text-slate-400">
                {analytics.landCount} total lands in deck
              </p>
            </div>

            {analytics.totalCount < 100 && (
              <button
                type="button"
                onClick={onAutoFillBasics}
                disabled={Object.keys(basicLands).length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-400/40 transition hover:bg-emerald-500/30 disabled:opacity-40"
              >
                <Wand2 className="h-3.5 w-3.5" />
                Auto-Fill Basics to 100 (+{100 - analytics.totalCount})
              </button>
            )}
          </div>

          {visibleBasicLands.length === 0 ? (
            <p className="text-xs text-slate-500">
              Basic lands become quick-adjustable once the card catalog finishes loading.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {visibleBasicLands.map((item) => {
                const landCard = basicLands[item.name]!;
                const qty = deck.mainboard[landCard.id]?.quantity ?? 0;
                return (
                  <div
                    key={item.name}
                    className="flex items-center justify-between gap-1.5 rounded-xl border border-slate-800 bg-slate-950/80 px-2.5 py-2 text-xs"
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${item.dotClass}`}
                      >
                        {item.color}
                      </span>
                      <span className="truncate font-medium text-slate-200">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onRemoveOneCard(landCard.id)}
                        disabled={qty === 0}
                        aria-label={`Remove ${item.name}`}
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-5 text-center font-mono font-bold text-slate-100">
                        {qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => onAddCard(landCard)}
                        aria-label={`Add ${item.name}`}
                        className="rounded p-0.5 text-slate-300 hover:bg-slate-800 hover:text-amber-300"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Analytics Row: Mana Curve, Color Pip vs Sources, Role Checklists */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* 1. Mana Curve */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-200">
              <BarChart3 className="h-3.5 w-3.5 text-amber-400" />
              Mana Curve ({analytics.nonLandCount} Spells)
            </h2>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-xs bg-amber-400" />
                Creatures
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-xs bg-sky-400" />
                Non-Creatures
              </span>
            </div>
          </div>

          <div className="flex h-28 items-end justify-between gap-2 pt-4">
            {analytics.cmcBuckets.map((bucket) => {
              const totalPct = Math.round((bucket.total / maxCurveBucket) * 100);
              const creaturePct =
                bucket.total > 0 ? Math.round((bucket.creatures / bucket.total) * 100) : 0;
              return (
                <div
                  key={bucket.label}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`MV ${bucket.label}: ${bucket.total} cards (${bucket.creatures} creatures, ${bucket.nonCreatures} non-creatures)`}
                >
                  <span className="font-mono text-[10px] text-slate-300">
                    {bucket.total > 0 ? bucket.total : ''}
                  </span>
                  <div className="flex h-20 w-full items-end overflow-hidden rounded-t-md bg-slate-950/80">
                    {bucket.total > 0 && (
                      <div
                        className="flex w-full flex-col justify-end overflow-hidden rounded-t-md bg-sky-400 transition-all duration-200"
                        style={{ height: `${Math.max(8, totalPct)}%` }}
                      >
                        {bucket.creatures > 0 && (
                          <div
                            className="w-full bg-amber-400"
                            style={{ height: `${creaturePct}%` }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                  <span className="font-mono text-[11px] font-semibold text-slate-400">
                    {bucket.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* 2. Color Pip Demand vs Mana Production Sources */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Pips vs. Mana Sources
            </h2>
            <span className="text-[11px] text-slate-400">
              {analytics.totalPips} pips · {analytics.totalSources} source hits
            </span>
          </div>

          <div className="space-y-2">
            {activePoolColors.map((col) => {
              const meta = COLOR_BAR_META[col];
              const pips = analytics.pipCounts[col];
              const sources = analytics.sourceCounts[col];
              const pipWidth = Math.round((pips / maxPipOrSource) * 100);
              const sourceWidth = Math.round((sources / maxPipOrSource) * 100);
              const pipShare =
                analytics.totalPips > 0 ? Math.round((pips / analytics.totalPips) * 100) : 0;

              return (
                <div key={col} className="space-y-1 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-200">
                      <span
                        className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${meta.badge}`}
                      >
                        {col}
                      </span>
                      {meta.label}
                    </span>
                    <span className="font-mono text-slate-400">
                      {pips} pips ({pipShare}%) · {sources} src
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-950">
                      <div
                        className={`h-full rounded-full ${meta.pipBar}`}
                        style={{ width: `${pipWidth}%` }}
                      />
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-950">
                      <div
                        className={`h-full rounded-full ${meta.sourceBar}`}
                        style={{ width: `${sourceWidth}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 3. Role Benchmarks (click to search catalog for missing roles) */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Commander Role Targets
            </h2>
            <span className="text-[11px] text-slate-400">Click any role to find cards</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {ROLE_TARGETS.map((target) => {
              const count = analytics.roleCounts[target.role];
              const pct = Math.min(100, Math.round((count / target.recommended) * 100));
              const healthy = count >= target.targetMin;
              return (
                <button
                  key={target.role}
                  type="button"
                  onClick={() => onQuickFilterRole(target.role)}
                  className="group rounded-xl border border-slate-800 bg-slate-950/75 p-2 text-left transition hover:border-amber-400/50"
                  title={`Click to search Catalog for ${target.label}`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-slate-200 group-hover:text-amber-200">
                      {target.label}
                    </span>
                    <span
                      className={`font-mono font-bold ${
                        healthy ? 'text-emerald-300' : 'text-amber-300'
                      }`}
                    >
                      {count}/{target.recommended}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full transition-all duration-200 ${
                        healthy ? 'bg-emerald-500' : 'bg-amber-400'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Mainboard Deck List */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-100">
              Mainboard ({analytics.mainboardCount} / {deck.commanders.length > 0 ? 100 - deck.commanders.length : 99})
            </h2>
            <p className="text-xs text-slate-400">
              Click a card to inspect full rules text & synergy tags, or stash cuts in Considering.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1 text-xs">
            <span className="px-2 text-slate-400">Group:</span>
            {(
              [
                { id: 'role', label: 'Role' },
                { id: 'type', label: 'Type' },
                { id: 'cmc', label: 'MV' },
                { id: 'color', label: 'Color' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setGroupMode(opt.id)}
                className={`rounded-lg px-2.5 py-1 font-medium transition ${
                  groupMode === opt.id
                    ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {groupedMainboard.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-400">
            Your mainboard is empty. Browse the catalog or import a decklist to start building!
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {groupedMainboard.map((group) => (
              <div
                key={group.label}
                className="flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70"
              >
                <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-200">
                  <span>{group.label}</span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">
                    {group.totalQty}
                  </span>
                </header>

                <ul className="divide-y divide-slate-800/60">
                  {group.entries.map((entry) => {
                    const isIllegal = illegalSet.has(entry.card.id);
                    const isOverLimit = overLimitSet.has(entry.card.id);
                    const canInc = canAddCardToDeck(
                      entry.card,
                      entry.quantity,
                      deck.commanders,
                      deck.lockSearchToCommanderIdentity,
                    ).allowed;

                    return (
                      <li
                        key={entry.card.id}
                        className={`flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-900/70 ${
                          isIllegal || isOverLimit ? 'bg-rose-950/20' : ''
                        }`}
                      >
                        <span className="w-6 shrink-0 font-mono font-bold text-amber-200">
                          {entry.quantity}x
                        </span>

                        <button
                          type="button"
                          onClick={() => onInspectCard(entry.card)}
                          className={`min-w-0 flex-1 truncate text-left font-medium hover:text-amber-200 ${
                            isIllegal || isOverLimit ? 'text-rose-200' : 'text-slate-200'
                          }`}
                          title={
                            isIllegal
                              ? `${entry.card.name} — Outside Commander color identity`
                              : isOverLimit
                                ? `${entry.card.name} — Exceeds copy limit`
                                : entry.card.name
                          }
                        >
                          {entry.card.name}
                        </button>

                        {(isIllegal || isOverLimit) && (
                          <span
                            title={isIllegal ? 'Off-color card' : 'Copy limit exceeded'}
                            className="shrink-0 rounded bg-rose-500/20 px-1 py-0.5 text-[9px] font-bold text-rose-200 ring-1 ring-rose-400/40"
                          >
                            {isIllegal ? 'CI' : 'MAX'}
                          </span>
                        )}

                        <span className="hidden shrink-0 sm:inline-flex">
                          <ManaCostDisplay manaCost={entry.card.manaCost} size="xs" />
                        </span>

                        <span className="w-12 shrink-0 text-right font-mono text-[11px] text-slate-400">
                          {entry.card.priceUsd !== null
                            ? `$${(entry.card.priceUsd * entry.quantity).toFixed(2)}`
                            : '—'}
                        </span>

                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => onRemoveOneCard(entry.card.id)}
                            aria-label={`Decrease quantity of ${entry.card.name}`}
                            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onAddCard(entry.card)}
                            disabled={!canInc}
                            aria-label={`Increase quantity of ${entry.card.name}`}
                            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30"
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
                            aria-label={`Remove ${entry.card.name}`}
                            className="rounded p-1 text-slate-500 hover:bg-rose-500/15 hover:text-rose-300"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Considering / Maybeboard Tray */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50">
        <button
          type="button"
          onClick={() => setShowConsidering((s) => !s)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-100">
              Considering / Maybeboard ({analytics.sideboardCount})
            </span>
            <span className="text-xs text-slate-400">
              Excluded from 100-card count & mana curve
            </span>
          </div>
          {showConsidering ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {showConsidering && (
          <div className="border-t border-slate-800 p-4">
            {sideboardEntries.length === 0 ? (
              <p className="text-xs text-slate-500">
                No cards in Considering yet. Use the swap button (⇄) on any card to bench it
                while trimming your deck down to 100.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {sideboardEntries.map((entry) => (
                  <div
                    key={entry.card.id}
                    className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs"
                  >
                    <span className="w-6 shrink-0 font-mono font-bold text-violet-300">
                      {entry.quantity}x
                    </span>
                    <button
                      type="button"
                      onClick={() => onInspectCard(entry.card)}
                      className="min-w-0 flex-1 truncate text-left font-medium text-slate-200 hover:text-amber-200"
                    >
                      {entry.card.name}
                    </button>
                    <ManaCostDisplay manaCost={entry.card.manaCost} size="xs" />
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => onMoveToMainboard(entry.card.id)}
                        title="Move 1 copy into Mainboard"
                        aria-label={`Move ${entry.card.name} to Mainboard`}
                        className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25"
                      >
                        <ArrowUpRight className="h-3 w-3" />
                        Main
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveOneSideboard(entry.card.id)}
                        aria-label={`Decrease Considering ${entry.card.name}`}
                        className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onAddToSideboard(entry.card)}
                        aria-label={`Increase Considering ${entry.card.name}`}
                        className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                      >
                        <Plus className="h-3 w-3" />
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
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
