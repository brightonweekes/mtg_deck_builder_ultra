import {
  Check,
  Cloud,
  Copy,
  Download,
  FolderOpen,
  ImageDown,
  Link2,
  Plus,
  QrCode,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { buildSharedDeckUrl } from '../cloud/validation.js';
import type { SavedDeckRecord } from '../db/cardDb.js';
import { computeDeckAnalytics } from '../deck/deckAnalytics.js';
import {
  calculateDeckPriceUsd,
  downloadDeckSnapshotPng,
} from '../deck/deckCardExporter.js';
import { exportDeckToText } from '../deck/deckSerializer.js';
import { encodeDeckToUrlParam } from '../deck/urlCodec.js';
import type { CompactCard } from '../types/card.js';
import type { CloudUser, DeckVisibility, SyncStatus } from '../types/cloud.js';
import type { DeckDraft } from '../types/deck.js';
import { resolveDeckDraftFromText } from './DeckAuditModal.js';

export type DeckManagerTab = 'decks' | 'import-export' | 'share';

const VISIBILITY_BADGE_MAP: Record<DeckVisibility, { label: string; className: string }> = {
  private: {
    label: 'Private',
    className: 'border-slate-700 bg-slate-900 text-slate-300',
  },
  friends: {
    label: 'Friends',
    className: 'border-indigo-500/40 bg-indigo-500/15 text-indigo-200',
  },
  link: {
    label: 'Link',
    className: 'border-sky-500/40 bg-sky-500/15 text-sky-200',
  },
  public: {
    label: 'Public',
    className: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200',
  },
};

const SYNC_BADGE_MAP: Record<SyncStatus, { label: string; className: string }> = {
  synced: {
    label: 'Synced',
    className: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/35',
  },
  pending: {
    label: 'Pending',
    className: 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/35',
  },
  local: {
    label: 'Local',
    className: 'bg-slate-800 text-slate-300 ring-1 ring-slate-700',
  },
  conflict: {
    label: 'Conflict',
    className: 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/50',
  },
  error: {
    label: 'Error',
    className: 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-500/40',
  },
};

interface DeckManagerModalProps {
  open: boolean;
  initialTab: DeckManagerTab;
  activeDeck: DeckDraft;
  savedDecks: SavedDeckRecord[];
  cloudUser?: CloudUser | null;
  isCloudConfigured?: boolean;
  isCloudSyncing?: boolean;
  resolveCards: (req: {
    ids?: string[];
    names?: string[];
  }) => Promise<{ byId: Record<string, CompactCard>; byName: Record<string, CompactCard> }>;
  onClose: () => void;
  onCreateNewDeck: (name?: string) => Promise<void>;
  onSwitchDeck: (deckId: string) => Promise<void>;
  onDuplicateCurrentDeck: () => Promise<void>;
  onDeleteDeck: (deckId: string) => Promise<void>;
  onImportDeckDraft: (draft: DeckDraft, noticeMessage?: string) => void;
  onChangeVisibility?: (visibility: DeckVisibility) => void;
  onSyncNow?: () => Promise<void>;
  onOpenAuth?: () => void;
  onOpenTableQr?: () => void;
}

function countRecordCards(record: SavedDeckRecord): number {
  let total = record.commanderIds.length;
  for (const qty of Object.values(record.mainboard)) total += qty;
  return total;
}

export function DeckManagerModal({
  open,
  initialTab,
  activeDeck,
  savedDecks,
  cloudUser = null,
  isCloudConfigured = true,
  isCloudSyncing = false,
  resolveCards,
  onClose,
  onCreateNewDeck,
  onSwitchDeck,
  onDuplicateCurrentDeck,
  onDeleteDeck,
  onImportDeckDraft,
  onChangeVisibility,
  onSyncNow,
  onOpenAuth,
  onOpenTableQr,
}: DeckManagerModalProps) {
  const [tab, setTab] = useState<DeckManagerTab>(initialTab);
  const [newDeckName, setNewDeckName] = useState('');
  const [importText, setImportText] = useState('');
  const [importStatus, setImportStatus] = useState<{
    imported: number;
    missingNames: string[];
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [exportedPng, setExportedPng] = useState(false);
  const [copiedKey, setCopiedKey] = useState<'export' | 'share' | 'cloud-share' | null>(null);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setImportStatus(null);
      setCopiedKey(null);
      setExportedPng(false);
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const exportedText = useMemo(() => exportDeckToText(activeDeck, true), [activeDeck]);
  const shareUrl = useMemo(() => {
    if (!open || typeof window === 'undefined') return '';
    const encoded = encodeDeckToUrlParam(activeDeck);
    return `${window.location.origin}${window.location.pathname}?d=${encoded}`;
  }, [open, activeDeck]);
  const cloudShareUrl = useMemo(() => {
    if (!open || typeof window === 'undefined') return '';
    return buildSharedDeckUrl(window.location.origin, window.location.pathname, activeDeck.id);
  }, [open, activeDeck.id]);

  if (!open) return null;

  const copyToClipboard = async (value: string, key: 'export' | 'share' | 'cloud-share') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 2200);
    } catch {
      // Fallback ignored cleanly
    }
  };

  const handleDownloadTxt = () => {
    const blob = new Blob([exportedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeFilename =
      activeDeck.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'commander-deck';
    a.download = `${safeFilename}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!importText.trim()) return;

    setIsImporting(true);
    try {
      const resolved = await resolveDeckDraftFromText(importText, resolveCards);
      if (!resolved) return;

      const { draft: nextDraft, importedCount, missingNames } = resolved;
      onImportDeckDraft(
        nextDraft,
        `Imported "${nextDraft.name}" (${importedCount} cards${
          missingNames.length > 0 ? `, ${missingNames.length} unrecognized` : ''
        }).`,
      );
      setImportStatus({ imported: importedCount, missingNames });
      if (missingNames.length === 0) {
        onClose();
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleExportPng = async () => {
    if (isExportingPng) return;
    setIsExportingPng(true);
    try {
      const analytics = computeDeckAnalytics(activeDeck);
      const price = calculateDeckPriceUsd(activeDeck);
      const activeVis = activeDeck.visibility ?? 'private';
      const isCloudShareActive =
        Boolean(cloudUser?.emailVerified) && (activeVis === 'link' || activeVis === 'public');
      await downloadDeckSnapshotPng(
        activeDeck,
        analytics,
        price,
        isCloudShareActive && cloudShareUrl ? { shareUrl: cloudShareUrl } : undefined,
      );
      setExportedPng(true);
      window.setTimeout(() => setExportedPng(false), 2200);
    } catch {
      // Ignore canvas export errors cleanly in restricted environments
    } finally {
      setIsExportingPng(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Deck Manager"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl"
      >
        {/* Modal Header & Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1 text-xs">
            {(
              [
                { id: 'decks', label: 'My Decks', icon: FolderOpen },
                { id: 'import-export', label: 'Import / Export', icon: Upload },
                { id: 'share', label: 'Share URL', icon: Link2 },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition ${
                    tab === item.id
                      ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close deck manager"
            className="rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 text-xs">
          {tab === 'decks' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  placeholder="New deck name (optional)..."
                  className="min-w-[180px] flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={() => {
                    void onCreateNewDeck(newDeckName.trim() || undefined);
                    setNewDeckName('');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 font-semibold text-slate-950 hover:bg-amber-400"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Deck
                </button>
                <button
                  type="button"
                  onClick={() => void onDuplicateCurrentDeck()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-semibold text-slate-200 hover:border-amber-400/50"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Duplicate Current
                </button>
              </div>

              <div className="space-y-2">
                {savedDecks.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-slate-400">
                    Decks are saved automatically in your browser&apos;s IndexedDB.
                  </p>
                ) : (
                  savedDecks.map((item) => {
                    const isActive = item.id === activeDeck.id;
                    const count = countRecordCards(item);
                    const visibility: DeckVisibility = isActive
                      ? (activeDeck.visibility ?? item.visibility ?? 'private')
                      : (item.visibility ?? 'private');
                    const syncStatus: SyncStatus = isActive
                      ? (activeDeck.syncStatus ?? item.syncStatus ?? 'local')
                      : (item.syncStatus ?? 'local');
                    const visBadge = VISIBILITY_BADGE_MAP[visibility];
                    const syncBadge = SYNC_BADGE_MAP[syncStatus];
                    return (
                      <div
                        key={item.id}
                        className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 ${
                          isActive
                            ? 'border-amber-500/45 bg-amber-500/10'
                            : 'border-slate-800 bg-slate-950/75'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-bold text-slate-100">
                              {item.name}
                            </span>
                            {isActive && (
                              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200 ring-1 ring-amber-400/40">
                                Active
                              </span>
                            )}
                            <span
                              className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${visBadge.className}`}
                            >
                              {visBadge.label}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${syncBadge.className}`}
                            >
                              {syncBadge.label}
                            </span>
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                            {count}/100 cards · Updated{' '}
                            {new Date(item.updatedAt).toLocaleDateString()}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {!isActive && (
                            <button
                              type="button"
                              onClick={async () => {
                                await onSwitchDeck(item.id);
                                onClose();
                              }}
                              className="rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-slate-100 hover:bg-amber-500 hover:text-slate-950"
                            >
                              Load
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void onDeleteDeck(item.id)}
                            aria-label={`Delete deck ${item.name}`}
                            className="rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-400 hover:border-rose-500/50 hover:text-rose-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {tab === 'import-export' && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-100">Import Decklist</h3>
                  <span className="text-[11px] text-slate-400">Moxfield / Archidekt / MTGO</span>
                </div>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  rows={12}
                  placeholder={`COMMANDER:\n1 Korvold, Fae-Cursed King\n\nMAINBOARD:\n1 Sol Ring\n1 Arcane Signet\n1 Cultivate\n...`}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-[11px] text-slate-200 placeholder-slate-600 outline-none focus:border-sky-400"
                />
                <button
                  type="button"
                  disabled={!importText.trim() || isImporting}
                  onClick={() => void handleImport()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-500 px-3 py-2 font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-40"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {isImporting ? 'Resolving Cards...' : 'Import Into New Deck'}
                </button>

                {importStatus && (
                  <div className="rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-[11px]">
                    <p className="font-semibold text-emerald-300">
                      Imported {importStatus.imported} cards.
                    </p>
                    {importStatus.missingNames.length > 0 && (
                      <p className="mt-1 text-amber-300">
                        Unrecognized ({importStatus.missingNames.length}):{' '}
                        {importStatus.missingNames.slice(0, 8).join(', ')}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-100">Export Current Deck</h3>
                  <span className="text-[11px] text-slate-400">Plain Text</span>
                </div>
                <textarea
                  readOnly
                  value={exportedText}
                  rows={12}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] text-slate-300 outline-none"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void copyToClipboard(exportedText, 'export')}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-semibold text-slate-200 hover:border-amber-400/50"
                  >
                    {copiedKey === 'export' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        Copied Text
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy Text
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadTxt}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-semibold text-slate-200 hover:border-amber-400/50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    .txt
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'share' && (() => {
            const activeVis = activeDeck.visibility ?? 'private';
            const activeSync = activeDeck.syncStatus ?? 'local';
            const isVerified = Boolean(cloudUser?.emailVerified);
            const isCloudShareable = activeVis === 'link' || activeVis === 'public';

            return (
              <div className="space-y-4">
                <div className="space-y-3 rounded-xl border border-sky-500/35 bg-sky-950/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Cloud className="h-4 w-4 text-sky-400" />
                      <h3 className="font-bold text-sky-100">
                        Cloud Short Link (?deck=...)
                      </h3>
                    </div>
                    <span
                      className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${
                        VISIBILITY_BADGE_MAP[activeVis].className
                      }`}
                    >
                      {VISIBILITY_BADGE_MAP[activeVis].label}
                    </span>
                  </div>

                  {!cloudUser ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                      <p className="max-w-md text-xs text-slate-300">
                        {isCloudConfigured
                          ? 'Sign in to publish a short cloud share link (?deck=...), scannable Table QR code, and keep visibility across devices.'
                          : 'Cloud sync is not configured in this build. You can still share using the zero-server ?d= URL below.'}
                      </p>
                      {onOpenAuth && isCloudConfigured && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenAuth();
                          }}
                          className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400"
                        >
                          Sign In to Share
                        </button>
                      )}
                    </div>
                  ) : !isVerified ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3">
                      <p className="text-xs text-amber-200">
                        Verify your email address before sharing cloud short links.
                      </p>
                      {onOpenAuth && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenAuth();
                          }}
                          className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400"
                        >
                          Verify Account
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-slate-300">
                        Publish <strong className="text-slate-100">{activeDeck.name}</strong> with
                        Unlisted Link or Public visibility so anyone can inspect and clone it via a
                        clean short link or scannable Table QR code.
                      </p>

                      {onChangeVisibility && (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onChangeVisibility('link')}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                              activeVis === 'link'
                                ? 'bg-sky-500 text-slate-950'
                                : 'border border-slate-700 bg-slate-900 text-slate-200 hover:border-sky-400/60 hover:text-sky-200'
                            }`}
                          >
                            {activeVis === 'link' ? 'Unlisted Link Active' : 'Set Unlisted Link'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onChangeVisibility('public')}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                              activeVis === 'public'
                                ? 'bg-emerald-500 text-slate-950'
                                : 'border border-slate-700 bg-slate-900 text-slate-200 hover:border-emerald-400/60 hover:text-emerald-200'
                            }`}
                          >
                            {activeVis === 'public' ? 'Public Active' : 'Set Public'}
                          </button>
                          {isCloudShareable && (
                            <button
                              type="button"
                              onClick={() => onChangeVisibility('private')}
                              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-rose-400/50 hover:text-rose-200"
                            >
                              Make Private
                            </button>
                          )}
                        </div>
                      )}

                      {isCloudShareable ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              readOnly
                              value={cloudShareUrl}
                              aria-label="Cloud short share URL"
                              className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-[11px] text-slate-200 outline-none"
                            />
                            {onOpenTableQr && (
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onOpenTableQr();
                                }}
                                title="Show scannable LGS Table QR code"
                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:border-amber-400/50 hover:text-amber-200"
                              >
                                <QrCode className="h-3.5 w-3.5 text-amber-400" />
                                Table QR
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void copyToClipboard(cloudShareUrl, 'cloud-share')}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400"
                            >
                              {copiedKey === 'cloud-share' ? (
                                <>
                                  <Check className="h-3.5 w-3.5" />
                                  Copied Link
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3.5 w-3.5" />
                                  Copy Cloud Link
                                </>
                              )}
                            </button>
                          </div>

                          {activeSync !== 'synced' && (
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                              <span>
                                Deck has local changes waiting to push (auto-syncs after 4s idle).
                              </span>
                              {onSyncNow && (
                                <button
                                  type="button"
                                  disabled={isCloudSyncing}
                                  onClick={() => void onSyncNow()}
                                  className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1 font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                                >
                                  <RefreshCw
                                    className={`h-3 w-3 ${isCloudSyncing ? 'animate-spin' : ''}`}
                                  />
                                  {isCloudSyncing ? 'Syncing...' : 'Sync Now'}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400">
                          Choose <strong className="text-slate-200">Set Unlisted Link</strong> or{' '}
                          <strong className="text-slate-200">Set Public</strong> above to activate{' '}
                          <code className="font-mono text-sky-300">?deck={activeDeck.id}</code> and
                          Table QR sharing.
                        </p>
                      )}
                    </>
                  )}
                </div>

                <div className="rounded-xl border border-violet-500/30 bg-violet-950/20 p-4">
                  <h3 className="font-bold text-violet-100">
                    Zero-Server Shareable URL (?d=...)
                  </h3>
                  <p className="mt-1 text-slate-300">
                    Your entire deck (Commanders, Mainboard, and Considering) is binary-packed
                    directly into this URL so anyone can open and clone it with zero backend
                    database.
                  </p>
                </div>

                <textarea
                  readOnly
                  rows={4}
                  value={shareUrl}
                  className="w-full break-all rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-[11px] text-slate-300 outline-none"
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-slate-400">
                    Link length: {shareUrl.length.toLocaleString()} characters
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isExportingPng}
                      onClick={() => void handleExportPng()}
                      title="Download 1200x675 Ripple99 Deck Snapshot PNG"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 font-semibold text-slate-200 transition hover:border-emerald-400/50 hover:text-emerald-200 disabled:opacity-50"
                    >
                      {exportedPng ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          Exported PNG
                        </>
                      ) : (
                        <>
                          <ImageDown className="h-3.5 w-3.5 text-emerald-400" />
                          {isExportingPng ? 'Exporting...' : 'Export PNG'}
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => void copyToClipboard(shareUrl, 'share')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-violet-500 px-4 py-2 font-semibold text-white hover:bg-violet-400"
                    >
                      {copiedKey === 'share' ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Copied Share Link
                        </>
                      ) : (
                        <>
                          <Link2 className="h-3.5 w-3.5" />
                          Copy Share Link
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
