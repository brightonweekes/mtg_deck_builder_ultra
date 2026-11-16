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
import { useEffect, useMemo, useState } from 'react';
import { generateDeckId } from '../db/deckDb.js';
import {
  computeDeckAnalytics,
  ROLE_TARGETS,
  type DeckAnalyticsReport,
  type ManaPoolColor,
} from '../deck/deckAnalytics.js';
import { calculateDeckPriceUsd } from '../deck/deckCardExporter.js';
import { exportDeckToText, parseDeckListText } from '../deck/deckSerializer.js';
import { getCombinedColorIdentity } from '../search/commanderRules.js';
import type { CompactCard, FunctionalRole, ManaColor } from '../types/card.js';
import type { DeckCardEntry, DeckDraft } from '../types/deck.js';
import { ColorIdentityBadges, ManaSymbolBadge } from './ManaSymbol.js';

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
  resolveCards: ResolveCardsFn;
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
  resolveCards,
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
    if (!open) return;
    setAuditError(null);
    setCopiedText(false);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

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
    setDeckText(exportDeckToText(activeDeck, true));
    setAuditResult({
      draft: activeDeck,
      missingNames: [],
      isCurrentDeck: true,
    });
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
