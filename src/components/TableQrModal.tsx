import {
  AlertTriangle,
  Check,
  Cloud,
  Copy,
  QrCode,
  Settings2,
  WifiOff,
  X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import {
  encodeQrMatrix,
  QR_MAX_BYTES_BY_LEVEL,
  renderQrSvgDataUri,
} from '../deck/qrCode.js';
import type { DeckDraft } from '../types/deck.js';

export interface TableQrModalProps {
  open: boolean;
  deck: DeckDraft;
  cloudShareUrl: string | null;
  cloudShareActive: boolean;
  offlineShareUrl: string;
  onClose: () => void;
  onOpenShareSettings?: () => void;
}

type QrShareMode = 'cloud' | 'offline';

/**
 * High-contrast LGS Table QR modal for instant across-the-table deck sharing and cloning.
 */
export function TableQrModal({
  open,
  deck,
  cloudShareUrl,
  cloudShareActive,
  offlineShareUrl,
  onClose,
  onOpenShareSettings,
}: TableQrModalProps) {
  const titleId = useId();
  const canUseCloud = Boolean(
    cloudShareActive && cloudShareUrl && cloudShareUrl.trim().length > 0,
  );
  const [selectedMode, setSelectedMode] = useState<QrShareMode>(() =>
    canUseCloud ? 'cloud' : 'offline',
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedMode(canUseCloud ? 'cloud' : 'offline');
      setCopied(false);
    }
  }, [open, canUseCloud]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const effectiveMode: QrShareMode = canUseCloud ? selectedMode : 'offline';
  const activeUrl =
    effectiveMode === 'cloud' && cloudShareUrl
      ? cloudShareUrl.trim()
      : offlineShareUrl.trim();

  const utf8ByteCount = useMemo(
    () => (activeUrl ? new TextEncoder().encode(activeUrl).length : 0),
    [activeUrl],
  );

  const qrMatrix = useMemo(() => {
    if (!open || !activeUrl) return null;
    // Prefer Medium EC for resilience on short cloud links; fallback to Low for dense ?d= payloads
    return encodeQrMatrix(activeUrl, 'M') ?? encodeQrMatrix(activeUrl, 'L');
  }, [open, activeUrl]);

  const qrDataUri = useMemo(() => {
    if (!qrMatrix) return null;
    return renderQrSvgDataUri(qrMatrix, {
      quietZone: 4,
      fgColor: '#000000',
      bgColor: '#ffffff',
    });
  }, [qrMatrix]);

  if (!open) return null;

  const deckTitle = deck.name.trim() || 'Untitled Commander Deck';
  const commanderLine =
    deck.commanders.length > 0
      ? deck.commanders.map((c) => c.name).join(' + ')
      : 'No Commander Selected';
  const isOversized = utf8ByteCount > QR_MAX_BYTES_BY_LEVEL.L;

  const handleCopyUrl = async () => {
    if (!activeUrl || typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(activeUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Ignore clipboard permission errors cleanly
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 text-slate-100 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/35 bg-amber-500/15 text-amber-300">
              <QrCode className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-base font-bold text-slate-50">
                Table QR Share
              </h2>
              <p className="truncate text-xs text-slate-400">
                {deckTitle} · {commanderLine}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Table QR modal"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 overflow-y-auto p-5">
          {canUseCloud ? (
            <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-800 bg-slate-950 p-1 text-xs">
              <button
                type="button"
                aria-pressed={effectiveMode === 'cloud'}
                onClick={() => setSelectedMode('cloud')}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 font-semibold transition ${
                  effectiveMode === 'cloud'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-slate-100'
                }`}
              >
                <Cloud className="h-3.5 w-3.5 shrink-0" />
                <span>Cloud Link QR (?deck=...)</span>
              </button>
              <button
                type="button"
                aria-pressed={effectiveMode === 'offline'}
                onClick={() => setSelectedMode('offline')}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 font-semibold transition ${
                  effectiveMode === 'offline'
                    ? 'bg-violet-500 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-slate-100'
                }`}
              >
                <WifiOff className="h-3.5 w-3.5 shrink-0" />
                <span>Offline Full-Deck QR (?d=...)</span>
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-100">
              <div className="flex flex-wrap items-start justify-between gap-2.5">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="font-semibold text-amber-200">
                    Offline Full-Deck QR (?d=...)
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-100/85">
                    Tip: Setting Visibility to <strong>Public</strong> or{' '}
                    <strong>Unlisted Link</strong> creates a tiny low-density Cloud Link QR (
                    <code className="font-mono text-amber-200">?deck=...</code>) that scans
                    instantly across an LGS table.
                  </p>
                </div>
                {onOpenShareSettings && (
                  <button
                    type="button"
                    onClick={onOpenShareSettings}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/20 px-2.5 py-1.5 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-500/30"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    Share Settings
                  </button>
                )}
              </div>
            </div>
          )}

          {/* QR Code Canvas / Warning */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-950/85 p-5">
            {qrMatrix && qrDataUri ? (
              <>
                <div className="rounded-2xl bg-white p-3 shadow-lg ring-4 ring-slate-800/80">
                  <img
                    src={qrDataUri}
                    alt={`QR code for ${deckTitle}`}
                    className="h-60 w-60 sm:h-64 sm:w-64"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px]">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 font-mono font-semibold ${
                      effectiveMode === 'cloud'
                        ? 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                        : 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                    }`}
                  >
                    v{qrMatrix.version} · {qrMatrix.size}×{qrMatrix.size}
                  </span>
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 font-mono text-slate-300">
                    EC-{qrMatrix.ecLevel}
                  </span>
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 font-mono text-slate-400">
                    {utf8ByteCount.toLocaleString()} /{' '}
                    {QR_MAX_BYTES_BY_LEVEL.L.toLocaleString()} B
                  </span>
                </div>
              </>
            ) : isOversized ? (
              <div className="w-full space-y-3 rounded-xl border border-rose-500/40 bg-rose-950/35 p-4 text-xs text-rose-100">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  <div className="space-y-1">
                    <p className="font-semibold text-rose-200">
                      Deck URL exceeds {QR_MAX_BYTES_BY_LEVEL.L.toLocaleString()}-byte QR limit
                    </p>
                    <p className="leading-relaxed text-rose-100/85">
                      This offline URL is{' '}
                      <strong className="font-mono">
                        {utf8ByteCount.toLocaleString()} UTF-8 bytes
                      </strong>
                      , which exceeds the ISO/IEC 18004 Version 40-L limit of{' '}
                      {QR_MAX_BYTES_BY_LEVEL.L.toLocaleString()} bytes.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canUseCloud ? (
                    <button
                      type="button"
                      onClick={() => setSelectedMode('cloud')}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400"
                    >
                      <Cloud className="h-3.5 w-3.5" />
                      Switch to Cloud Link QR
                    </button>
                  ) : (
                    onOpenShareSettings && (
                      <button
                        type="button"
                        onClick={onOpenShareSettings}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400"
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        Enable Cloud Link QR
                      </button>
                    )
                  )}
                </div>
              </div>
            ) : (
              <p className="py-8 text-xs text-slate-400">
                Share URL is currently unavailable for this deck.
              </p>
            )}
          </div>

          {/* Copyable URL */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={activeUrl}
                aria-label="Table QR Share URL"
                className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-[11px] text-slate-200 outline-none"
              />
              <button
                type="button"
                disabled={!activeUrl}
                onClick={() => void handleCopyUrl()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-violet-500 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy URL
                  </>
                )}
              </button>
            </div>
            <p className="text-center text-[11px] text-slate-400">
              Scan with any phone camera to inspect and clone this deck in Ripple99.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
