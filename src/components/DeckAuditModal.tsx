import {
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Layers,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { generateDeckId } from '../db/deckDb.js';
import {
  computeDeckAnalytics,
  ROLE_TARGETS,
  type DeckAnalyticsReport,
  type ManaPoolColor,
} from '../deck/deckAnalytics.js';
import { calculateDeckPriceUsd } from '../deck/deckCardExporter.js';
import { exportDeckToText, parseDeckListText } from '../deck/deckSerializer.js';
import { buildCommanderSynergyQuery, getCombinedColorIdentity } from '../search/commanderRules.js';
import type { CompactCard, FunctionalRole, ManaColor } from '../types/card.js';
import type { DeckCardEntry, DeckDraft } from '../types/deck.js';
import {
  DEFAULT_SEARCH_FILTER,
  type ScoredCardMatch,
  type SearchFilter,
  type SearchResponsePayload,
} from '../types/search.js';
import { ColorIdentityBadges, ManaCostDisplay, ManaSymbolBadge } from './ManaSymbol.js';

export interface ResolveCardsFn {
  (req: {
    ids?: string[];
    names?: string[];
  }): Promise<{ byId: Record<string, CompactCard>; byName: Record<string, CompactCard> }>;
}

export interface ResolvedDeckTextResult {
  draft: DeckDraft;
  importedCount: number;
  missingNames: string[];
}

export interface DeckAuditResult {
  draft: DeckDraft;
  missingNames: string[];
  isCurrentDeck?: boolean;
}

export interface RoleAuditItem {
  role: FunctionalRole | 'lands';
  label: string;
  count: number;
  targetMin: number;
  targetMax: number;
  recommended: number;
  status: 'deficit' | 'healthy' | 'surplus';
  delta: number;
}

const POOL_COLORS: readonly ManaPoolColor[] = ['W', 'U', 'B', 'R', 'G', 'C'];
const MAX_FALLBACK_UPGRADE_THEMES = 3;
const RE_BASIC_LAND_TYPE = /\bbasic\b.*\bland\b/i;

function deriveMainboardFallbackThemeQuery(draft: DeckDraft): string {
  const counts = new Map<string, number>();
  for (const entry of Object.values(draft.mainboard)) {
    if (entry.quantity <= 0) continue;
    for (const rawTheme of entry.card.themes) {
      const theme = rawTheme.trim();
      if (!theme) continue;
      counts.set(theme, (counts.get(theme) ?? 0) + entry.quantity);
    }
  }
  if (counts.size === 0) return '';

  const sorted = Array.from(counts.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const repeating = sorted.filter(([, count]) => count >= 2);
  const selected = (repeating.length > 0 ? repeating : sorted)
    .slice(0, MAX_FALLBACK_UPGRADE_THEMES)
    .map(([theme]) => theme);
  return selected.join(' ');
}

/**
 * Builds a worker search filter for under-$1 synergy upgrades matching the audited deck's
 * Commander identity and themes (or top repeating mainboard themes if no Commander is set).
 */
export function buildAuditUpgradeSearchFilter(draft: DeckDraft): SearchFilter | null {
  const hasCommanders = draft.commanders.length > 0;
  const commanderThemeQuery = hasCommanders
    ? buildCommanderSynergyQuery(draft.commanders).trim()
    : '';
  const themeQuery = commanderThemeQuery || deriveMainboardFallbackThemeQuery(draft);
  if (!themeQuery) return null;

  return {
    ...DEFAULT_SEARCH_FILTER,
    colorIdentity: hasCommanders ? getCombinedColorIdentity(draft.commanders) : null,
    themeQuery,
    maxPriceUsd: 1,
    sortBy: 'synergy',
    commanderOnly: false,
    page: 1,
    pageSize: 40,
  };
}

/**
 * Filters out basic lands and cards already present in the audited deck (by id or oracleId),
 * returning up to `limit` unique under-$1 upgrade suggestions.
 */
export function filterAuditUpgradeMatches(
  matches: readonly ScoredCardMatch[],
  draft: DeckDraft,
  limit = 10,
): ScoredCardMatch[] {
  if (limit <= 0 || matches.length === 0) return [];

  const excludedIds = new Set<string>();
  const excludedOracleIds = new Set<string>();

  const registerExcluded = (card: CompactCard) => {
    if (card.id) excludedIds.add(card.id);
    if (card.oracleId) excludedOracleIds.add(card.oracleId);
  };

  for (const cmd of draft.commanders) {
    registerExcluded(cmd);
  }
  for (const entry of Object.values(draft.mainboard)) {
    if (entry.quantity > 0) registerExcluded(entry.card);
  }
  for (const entry of Object.values(draft.sideboard)) {
    if (entry.quantity > 0) registerExcluded(entry.card);
  }

  const out: ScoredCardMatch[] = [];
  const seenIds = new Set<string>();
  const seenOracleIds = new Set<string>();

  for (const match of matches) {
    const { card } = match;
    if (RE_BASIC_LAND_TYPE.test(card.typeLine)) continue;
    if (excludedIds.has(card.id)) continue;
    if (card.oracleId && excludedOracleIds.has(card.oracleId)) continue;
    if (seenIds.has(card.id)) continue;
    if (card.oracleId && seenOracleIds.has(card.oracleId)) continue;

    seenIds.add(card.id);
    if (card.oracleId) seenOracleIds.add(card.oracleId);
    out.push(match);
    if (out.length >= limit) break;
  }

  return out;
}

/**
 * Pure helper to add an upgrade card into an audited draft's mainboard.
 */
export function addUpgradeCardToAuditDraft(draft: DeckDraft, card: CompactCard): DeckDraft {
  const existing = draft.mainboard[card.id];
  return {
    ...draft,
    mainboard: {
      ...draft.mainboard,
      [card.id]: {
        card,
        quantity: (existing?.quantity ?? 0) + 1,
      },
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Parses a plain-text / Moxfield / Archidekt / MTGO decklist and resolves cards via the catalog.
 */
export async function resolveDeckDraftFromText(
  rawText: string,
  resolveCards: ResolveCardsFn,
  fallbackName = 'Imported Commander Deck',
): Promise<ResolvedDeckTextResult | null> {
  const parsed = parseDeckListText(rawText);
  if (parsed.lines.length === 0) return null;

  const uniqueNames = Array.from(new Set(parsed.lines.map((line) => line.name)));
  const { byName } = await resolveCards({ names: uniqueNames });

  const commanders: CompactCard[] = [];
  const mainboard: Record<string, DeckCardEntry> = {};
  const sideboard: Record<string, DeckCardEntry> = {};
  const missingNames: string[] = [];
  let importedCount = 0;

  for (const line of parsed.lines) {
    const card = byName[line.name.trim().toLowerCase()];
    if (!card) {
      if (!missingNames.includes(line.name)) {
        missingNames.push(line.name);
      }
      continue;
    }

    if (line.section === 'commander' && card.isCommanderEligible && commanders.length < 2) {
      if (!commanders.some((c) => c.id === card.id)) {
        commanders.push(card);
        importedCount += 1;
      }
      continue;
    }

    const targetBoard = line.section === 'sideboard' ? sideboard : mainboard;
    const existing = targetBoard[card.id];
    targetBoard[card.id] = {
      card,
      quantity: (existing?.quantity ?? 0) + line.quantity,
    };
    importedCount += line.quantity;
  }

  const now = new Date().toISOString();
  const draft: DeckDraft = {
    id: generateDeckId(),
    name: parsed.name || fallbackName,
    commanders,
    mainboard,
    sideboard,
    lockSearchToCommanderIdentity: true,
    visibility: 'private',
    revision: 0,
    syncStatus: 'local',
    createdAt: now,
    updatedAt: now,
  };

  return { draft, importedCount, missingNames };
}

/**
 * Evaluates a DeckAnalyticsReport against Commander ROLE_TARGETS for deficit/healthy/surplus badges.
 */
export function auditRoleTargets(analytics: DeckAnalyticsReport): RoleAuditItem[] {
  return ROLE_TARGETS.map((target) => {
    const count = analytics.roleCounts[target.role] ?? 0;
    if (count < target.targetMin) {
      return {
        ...target,
        count,
        status: 'deficit',
        delta: target.targetMin - count,
      };
    }
    if (count > target.targetMax) {
      return {
        ...target,
        count,
        status: 'surplus',
        delta: count - target.targetMax,
      };
    }
    return {
      ...target,
      count,
      status: 'healthy',
      delta: 0,
    };
  });
}

export interface DeckAuditModalProps {
  open: boolean;
  activeDeck: DeckDraft;
  activeDeckPriceUsd?: number;
  initialAuditResult?: DeckAuditResult | null;
  initialUpgradeMatches?: ScoredCardMatch[];
  resolveCards: ResolveCardsFn;
  runOneOffSearch?: (filter: SearchFilter) => Promise<SearchResponsePayload>;
  onAddUpgradeCard?: (card: CompactCard) => void;
  onClose: () => void;
  onImportDeckDraft: (draft: DeckDraft, noticeMessage?: string) => void;
  onOpenCurrentStudio?: () => void;
  onFindMissingRole: (role: FunctionalRole | 'lands', colorIdentity: ManaColor[] | null) => void;
}

/**
 * Instant 99 Audit modal: paste any Commander list (or audit your active deck) for immediate
 * legality, curve, color-pip/source, and role-deficit diagnostics with one-click catalog fixes.
 */
export function DeckAuditModal({
  open,
  activeDeck,
  activeDeckPriceUsd,
  initialAuditResult = null,
  initialUpgradeMatches,
  resolveCards,
  runOneOffSearch,
  onAddUpgradeCard,
  onClose,
  onImportDeckDraft,
  onOpenCurrentStudio,
  onFindMissingRole,
}: DeckAuditModalProps) {
  const [deckText, setDeckText] = useState('');
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<DeckAuditResult | null>(initialAuditResult);
  const [copiedText, setCopiedText] = useState(false);
  const [rawUpgradeMatches, setRawUpgradeMatches] = useState<ScoredCardMatch[] | null>(
    initialUpgradeMatches ?? null,
  );
  const [isLoadingUpgrades, setIsLoadingUpgrades] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [lastAddedUpgrade, setLastAddedUpgrade] = useState<string | null>(null);
  const prevActiveDeckRef = useRef(activeDeck);

  const activeDeckCardCount = useMemo(() => {
    let total = activeDeck.commanders.length;
    for (const entry of Object.values(activeDeck.mainboard)) {
      total += entry.quantity;
    }
    for (const entry of Object.values(activeDeck.sideboard)) {
      total += entry.quantity;
    }
    return total;
  }, [activeDeck.commanders.length, activeDeck.mainboard, activeDeck.sideboard]);

  useEffect(() => {
    if (prevActiveDeckRef.current === activeDeck) return;
    prevActiveDeckRef.current = activeDeck;
    setAuditResult((prev) => {
      if (!prev?.isCurrentDeck) return prev;
      return {
        ...prev,
        draft: activeDeck,
      };
    });
  }, [activeDeck]);

  useEffect(() => {
    if (!open) return;
    setAuditError(null);
    setCopiedText(false);
    setLastAddedUpgrade(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const upgradeFilter = useMemo(
    () => (auditResult ? buildAuditUpgradeSearchFilter(auditResult.draft) : null),
    [auditResult],
  );
  const upgradeFilterKey = useMemo(
    () => (upgradeFilter ? JSON.stringify(upgradeFilter) : null),
    [upgradeFilter],
  );
  const latestUpgradeFilterRef = useRef<SearchFilter | null>(null);
  latestUpgradeFilterRef.current = upgradeFilter;
  const hasActiveAudit = Boolean(auditResult);

  useEffect(() => {
    if (!open || !hasActiveAudit || !runOneOffSearch) return;
    const filterToRun = latestUpgradeFilterRef.current;
    if (!filterToRun) {
      setRawUpgradeMatches([]);
      setIsLoadingUpgrades(false);
      setUpgradeError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingUpgrades(true);
    setUpgradeError(null);

    void runOneOffSearch(filterToRun)
      .then((res) => {
        if (cancelled) return;
        setRawUpgradeMatches(res.matches);
      })
      .catch(() => {
        if (cancelled) return;
        setRawUpgradeMatches([]);
        setUpgradeError('Could not load under-$1 synergy upgrades right now.');
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingUpgrades(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, hasActiveAudit, runOneOffSearch, upgradeFilterKey]);

  const upgradeMatches = useMemo(() => {
    if (!auditResult || !rawUpgradeMatches) return [];
    return filterAuditUpgradeMatches(rawUpgradeMatches, auditResult.draft, 10);
  }, [auditResult, rawUpgradeMatches]);

  const report = useMemo(() => {
    if (!auditResult) return null;
    const analytics = computeDeckAnalytics(auditResult.draft);
    const priceUsd =
      auditResult.isCurrentDeck && typeof activeDeckPriceUsd === 'number'
        ? activeDeckPriceUsd
        : calculateDeckPriceUsd(auditResult.draft);
    const roleItems = auditRoleTargets(analytics);
    const colorIdentity = getCombinedColorIdentity(auditResult.draft.commanders);
    const filterColorIdentity =
      auditResult.draft.commanders.length > 0 ? colorIdentity : null;
    const maxBucket = Math.max(1, ...analytics.cmcBuckets.map((b) => b.total));
    const activeColors = POOL_COLORS.filter(
      (col) =>
        col === 'C' ||
        colorIdentity.includes(col as ManaColor) ||
        analytics.pipCounts[col] > 0 ||
        analytics.sourceCounts[col] > 0,
    );
    const exportedText = exportDeckToText(auditResult.draft, true);

    return {
      analytics,
      priceUsd,
      roleItems,
      colorIdentity,
      filterColorIdentity,
      maxBucket,
      activeColors,
      exportedText,
    };
  }, [activeDeckPriceUsd, auditResult]);

  if (!open) return null;

  const handleRunPasteAudit = async () => {
    if (!deckText.trim() || isAuditing) return;
    setAuditError(null);
    setLastAddedUpgrade(null);
    setIsAuditing(true);
    try {
      const resolved = await resolveDeckDraftFromText(
        deckText,
        resolveCards,
        'Audited Commander Deck',
      );
      if (!resolved) {
        setAuditError('Paste at least one card line to run an Instant 99 Audit.');
        return;
      }
      if (resolved.importedCount === 0 && resolved.missingNames.length > 0) {
        setAuditError(
          `Could not match any cards in the catalog (${resolved.missingNames.slice(0, 5).join(', ')}).`,
        );
      }
      setAuditResult({
        draft: resolved.draft,
        missingNames: resolved.missingNames,
        isCurrentDeck: false,
      });
    } catch {
      setAuditError('Could not audit decklist right now. Please try again.');
    } finally {
      setIsAuditing(false);
    }
  };

  const handleAuditCurrentDeck = () => {
    setAuditError(null);
    setCopiedText(false);
    setLastAddedUpgrade(null);
    setDeckText(exportDeckToText(activeDeck, true));
    setAuditResult({
      draft: activeDeck,
      missingNames: [],
      isCurrentDeck: true,
    });
  };

  const handleAddUpgrade = (card: CompactCard) => {
    if (!auditResult) return;
    if (auditResult.isCurrentDeck) {
      if (!onAddUpgradeCard) return;
      const result = onAddUpgradeCard(card) as unknown;
      if (result === false) return;
      setLastAddedUpgrade(card.name);
      return;
    }

    setAuditResult((prev) => {
      if (!prev || prev.isCurrentDeck) return prev;
      return {
        ...prev,
        draft: addUpgradeCardToAuditDraft(prev.draft, card),
      };
    });
    setLastAddedUpgrade(card.name);
  };

  const handleOpenInStudio = () => {
    if (!auditResult) return;
    if (auditResult.isCurrentDeck && onOpenCurrentStudio) {
      onOpenCurrentStudio();
      onClose();
      return;
    }
    onImportDeckDraft(
      auditResult.draft,
      `Opened "${auditResult.draft.name}" in Ripple99 Studio.`,
    );
    onClose();
  };

  const handleCopyMoxfield = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.exportedText);
      setCopiedText(true);
      window.setTimeout(() => setCopiedText(false), 2200);
    } catch {
      // Ignore clipboard permission errors cleanly
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Instant 99 Audit"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/35">
              <ClipboardCheck className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">Instant 99 Audit</h2>
              <p className="text-[11px] text-slate-400">
                Paste any Moxfield, Archidekt, or MTGO list — instant Commander diagnostics with
                zero lock-in
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close deck audit"
            className="rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
          {/* Input Section */}
          <section className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="instant-audit-textarea" className="font-semibold text-slate-200">
                Decklist Input
              </label>
              <span className="text-[11px] text-slate-400">
                Supports <code className="font-mono text-slate-300">COMMANDER:</code>,{' '}
                <code className="font-mono text-slate-300">*CMDR*</code>, set codes &amp; tags
              </span>
            </div>

            <textarea
              id="instant-audit-textarea"
              value={deckText}
              onChange={(e) => setDeckText(e.target.value)}
              rows={6}
              placeholder={`COMMANDER:\n1 Atraxa, Praetors' Voice\n\nMAINBOARD:\n1 Sol Ring\n1 Arcane Signet\n1 Swords to Plowshares\n...`}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-[11px] text-slate-200 placeholder-slate-600 outline-none focus:border-amber-400"
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!deckText.trim() || isAuditing}
                onClick={() => void handleRunPasteAudit()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-40"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {isAuditing ? 'Auditing...' : 'Run Instant 99 Audit'}
              </button>

              {activeDeckCardCount > 0 && (
                <button
                  type="button"
                  onClick={handleAuditCurrentDeck}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 font-semibold text-slate-200 transition hover:border-violet-400/60 hover:text-violet-200"
                >
                  <Layers className="h-3.5 w-3.5 text-violet-400" />
                  Audit Current Deck ({activeDeckCardCount}/100)
                </button>
              )}
            </div>

            {auditError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-rose-200"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{auditError}</span>
              </div>
            )}
          </section>

          {/* Report Section */}
          {auditResult && report && (
            <section
              aria-label="Instant 99 Audit Report"
              className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4"
            >
              {/* Top Stats & Legality */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-100">
                      {auditResult.draft.name}
                    </h3>
                    {auditResult.draft.commanders.length > 0 && (
                      <ColorIdentityBadges colors={report.colorIdentity} size="xs" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {auditResult.draft.commanders.length > 0
                      ? `Commander: ${auditResult.draft.commanders.map((c) => c.name).join(' + ')}`
                      : 'No Commander detected in list'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-xl border px-2.5 py-1 font-mono font-bold ${
                      report.analytics.totalCount === 100
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                        : report.analytics.totalCount > 100
                          ? 'border-rose-500/40 bg-rose-500/15 text-rose-200'
                          : 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                    }`}
                  >
                    {report.analytics.totalCount} / 100
                  </span>

                  <span
                    className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 font-semibold ${
                      report.analytics.isCommanderLegal100
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                        : 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                    }`}
                  >
                    {report.analytics.isCommanderLegal100 ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Commander Legal
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Not Yet Legal
                      </>
                    )}
                  </span>

                  <span className="rounded-xl border border-slate-800 bg-slate-900 px-2.5 py-1 text-slate-300">
                    Avg MV{' '}
                    <strong className="font-mono text-slate-100">
                      {report.analytics.averageCmc.toFixed(2)}
                    </strong>
                  </span>

                  <span className="rounded-xl border border-slate-800 bg-slate-900 px-2.5 py-1 font-mono text-slate-300">
                    Est. ${report.priceUsd.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Legality Issues */}
              {report.analytics.issues.length > 0 && (
                <div className="rounded-xl border border-amber-500/35 bg-amber-950/20 px-3 py-2">
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-amber-100">
                    {report.analytics.issues.map((issue) => (
                      <li
                        key={issue.type}
                        className={issue.severity === 'error' ? 'font-semibold text-rose-200' : ''}
                      >
                        • {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Unrecognized Card Warnings */}
              {auditResult.missingNames.length > 0 && (
                <div className="rounded-xl border border-rose-500/35 bg-rose-950/25 px-3 py-2 text-[11px] text-rose-200">
                  <div className="font-semibold">
                    Unrecognized cards ({auditResult.missingNames.length}):
                  </div>
                  <p className="mt-0.5 text-rose-200/85">
                    {auditResult.missingNames.slice(0, 12).join(', ')}
                    {auditResult.missingNames.length > 12
                      ? ` (+${auditResult.missingNames.length - 12} more)`
                      : ''}
                  </p>
                </div>
              )}

              {/* Role Balance Audit */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold uppercase tracking-wider text-slate-200">
                    Role Balance Audit
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Click any deficit fix to search within Commander identity
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {report.roleItems.map((item) => {
                    const badgeClass =
                      item.status === 'deficit'
                        ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40'
                        : item.status === 'surplus'
                          ? 'bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/40'
                          : 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40';
                    const statusLabel =
                      item.status === 'deficit'
                        ? `Deficit (-${item.delta})`
                        : item.status === 'surplus'
                          ? `Surplus (+${item.delta})`
                          : 'Healthy';

                    return (
                      <div
                        key={item.role}
                        className="flex flex-col justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/90 p-2.5"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-slate-100">{item.label}</span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${badgeClass}`}
                            >
                              {statusLabel}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between font-mono text-[11px] text-slate-400">
                            <span>
                              {item.count} cards
                            </span>
                            <span>
                              Target {item.targetMin}–{item.targetMax}
                            </span>
                          </div>
                        </div>

                        {item.status === 'deficit' && (
                          <button
                            type="button"
                            onClick={() =>
                              onFindMissingRole(item.role, report.filterColorIdentity)
                            }
                            className="inline-flex items-center justify-center gap-1 rounded-lg bg-violet-500/20 px-2 py-1 text-[11px] font-semibold text-violet-200 ring-1 ring-violet-400/40 transition hover:bg-violet-500/30"
                          >
                            <Search className="h-3 w-3" />
                            Find missing {item.label}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Mana Curve Mini-Bars + Color Pips vs Land Sources */}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-200">
                      <BarChart3 className="h-3.5 w-3.5 text-amber-400" />
                      Mana Curve ({report.analytics.nonLandCount} Spells)
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Avg MV {report.analytics.averageCmc.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex h-20 items-end justify-between gap-1.5 pt-2">
                    {report.analytics.cmcBuckets.map((bucket) => {
                      const heightPct =
                        bucket.total > 0
                          ? Math.max(12, Math.round((bucket.total / report.maxBucket) * 100))
                          : 0;
                      return (
                        <div
                          key={bucket.label}
                          className="flex flex-1 flex-col items-center gap-1"
                        >
                          <span className="font-mono text-[10px] text-slate-300">
                            {bucket.total > 0 ? bucket.total : ''}
                          </span>
                          <div className="flex h-11 w-full items-end overflow-hidden rounded-t bg-slate-950">
                            {bucket.total > 0 && (
                              <div
                                className="w-full rounded-t bg-amber-400/85"
                                style={{ height: `${heightPct}%` }}
                              />
                            )}
                          </div>
                          <span className="font-mono text-[10px] text-slate-400">
                            {bucket.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-bold uppercase tracking-wider text-slate-200">
                      Color Pips vs. Sources
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {report.analytics.totalPips} pips · {report.analytics.totalSources} src
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {report.activeColors.map((col) => (
                      <div
                        key={col}
                        className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-[11px]"
                      >
                        <ManaSymbolBadge symbol={col} size="xs" />
                        <span className="font-mono text-slate-300">
                          {report.analytics.pipCounts[col]}p / {report.analytics.sourceCounts[col]}s
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Top Under-$1 Synergy Upgrades */}
              {(runOneOffSearch || (rawUpgradeMatches && rawUpgradeMatches.length > 0)) && (
                <div className="space-y-2.5 rounded-xl border border-slate-800 bg-slate-900/75 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                      <h4 className="font-bold uppercase tracking-wider text-slate-200">
                        Top Under-$1 Synergy Upgrades
                      </h4>
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
                        &le; $1.00
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px]">
                      {lastAddedUpgrade && (
                        <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-200 ring-1 ring-emerald-500/30">
                          Added {lastAddedUpgrade}
                        </span>
                      )}
                      {upgradeMatches.length > 0 && (
                        <span className="font-mono text-slate-400">
                          Top {upgradeMatches.length} picks
                        </span>
                      )}
                    </div>
                  </div>

                  {!(rawUpgradeMatches && rawUpgradeMatches.length > 0) && !upgradeFilter ? (
                    <p className="rounded-lg border border-dashed border-slate-800 bg-slate-950/60 px-3 py-2.5 text-[11px] text-slate-400">
                      Add a Commander or theme-tagged cards to unlock under-$1 synergy upgrades.
                    </p>
                  ) : rawUpgradeMatches === null || isLoadingUpgrades ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {Array.from({ length: 4 }).map((_, idx) => (
                        <div
                          key={idx}
                          className="h-14 animate-pulse rounded-xl border border-slate-800 bg-slate-950/70"
                        />
                      ))}
                    </div>
                  ) : upgradeError ? (
                    <p className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-[11px] text-rose-200">
                      {upgradeError}
                    </p>
                  ) : upgradeMatches.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-800 bg-slate-950/60 px-3 py-2.5 text-[11px] text-slate-400">
                      No additional under-$1 synergy upgrades found outside your current list.
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {upgradeMatches.map((match) => {
                        const { card } = match;
                        const topReasons = match.matchedReasons.slice(0, 2);
                        const priceText =
                          card.priceUsd !== null ? `$${card.priceUsd.toFixed(2)}` : '—';
                        return (
                          <div
                            key={card.id}
                            className="flex items-center justify-between gap-2.5 rounded-xl border border-slate-800 bg-slate-950/85 p-2.5 transition hover:border-amber-400/40"
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className="truncate font-semibold text-slate-100"
                                  title={card.name}
                                >
                                  {card.name}
                                </span>
                                <ManaCostDisplay manaCost={card.manaCost} size="xs" />
                                <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                                  {priceText}
                                </span>
                              </div>

                              {topReasons.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {topReasons.map((reason) => (
                                    <span
                                      key={reason}
                                      className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-200 ring-1 ring-violet-500/30"
                                    >
                                      {reason}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            <button
                              type="button"
                              disabled={Boolean(auditResult.isCurrentDeck && !onAddUpgradeCard)}
                              onClick={() => handleAddUpgrade(card)}
                              aria-label={`Add ${card.name} to deck`}
                              className="inline-flex shrink-0 items-center justify-center rounded-lg bg-amber-500/20 px-2.5 py-1.5 text-[11px] font-bold text-amber-200 ring-1 ring-amber-400/40 transition hover:bg-amber-500 hover:text-slate-950 disabled:opacity-40"
                            >
                              + Add
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Studio & Export Actions */}
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => void handleCopyMoxfield()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 font-semibold text-slate-200 transition hover:border-amber-400/50 hover:text-amber-200"
                >
                  {copiedText ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      Copied Moxfield Text
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy Moxfield Text
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleOpenInStudio}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 font-bold text-slate-950 transition hover:bg-amber-400"
                >
                  <Layers className="h-3.5 w-3.5" />
                  Open in Ripple99 Studio
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
