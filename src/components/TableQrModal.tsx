import {
  Check,
  Cloud,
  Copy,
  Globe,
  Link2,
  QrCode,
  Settings2,
  X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import {
  encodeQrMatrix,
  renderQrSvgDataUri,
} from '../deck/qrCode.js';
import type { DeckDraft } from '../types/deck.js';

export interface TableQrModalProps {
  open: boolean;
  deck: DeckDraft;
  cloudShareUrl: string | null;
  cloudShareActive: boolean;
  onClose: () => void;
  onOpenShareSettings?: () => void;
}

/**
 * High-contrast LGS Table QR modal for online (Public & Unlisted Link) `?deck=...` sharing.
 */
export function TableQrModal({
  open,
  deck,
  cloudShareUrl,
  cloudShareActive,
  onClose,
  onOpenShareSettings,
}: TableQrModalProps) {
  const titleId = useId();
  const [copied, setCopied] = useState(false);

  const canUseCloudQr = Boolean(
    cloudShareActive && cloudShareUrl && cloudShareUrl.trim().length > 0,
  );
  const activeUrl = canUseCloudQr && cloudShareUrl ? cloudShareUrl.trim() : '';

  useEffect(() => {
    if (open) {
      setCopied(false);
    }
  }, [open, activeUrl]);

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

  const qrMatrix = useMemo(() => {
    if (!open || !activeUrl) return null;
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
  const isPublic = deck.visibility === 'public';

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
        className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 text-slate-100 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/35 bg-amber-500/15 text-amber-300">
              <QrCode className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id={titleId} className="truncate text-base font-bold text-slate-50">
                  Table QR Share
                </h2>
                {canUseCloudQr && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      isPublic
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                        : 'border-sky-500/40 bg-sky-500/15 text-sky-200'
                    }`}
                  >
                    {isPublic ? <Globe className="h-2.5 w-2.5" /> : <Link2 className="h-2.5 w-2.5" />}
                    {isPublic ? 'Public' : 'Unlisted Link'}
                  </span>
                )}
              </div>
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
          {qrMatrix && qrDataUri ? (
            <>
              <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-950/85 p-5">
                <div className="rounded-2xl bg-white p-3 shadow-lg ring-4 ring-slate-800/80">
                  <img
                    src={qrDataUri}
                    alt={`QR code for ${deckTitle}`}
                    className="h-60 w-60 sm:h-64 sm:w-64"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 font-mono font-semibold text-amber-200">
                    <Cloud className="h-3 w-3" />
                    v{qrMatrix.version} · {qrMatrix.size}×{qrMatrix.size}
                  </span>
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 font-mono text-slate-300">
                    EC-{qrMatrix.ecLevel}
                  </span>
                </div>
              </div>

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
                    onClick={() => void handleCopyUrl()}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-violet-500 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-violet-400"
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
            </>
          ) : (
            <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/85 p-5 text-center text-xs">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-sky-500/35 bg-sky-500/15 text-sky-300">
                <Cloud className="h-5 w-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-slate-100">
                  Enable Public or Unlisted Link Visibility
                </h3>
                <p className="leading-relaxed text-slate-300">
                  Table QR sharing uses short cloud links (<code className="font-mono text-sky-300">?deck=...</code>) so the QR code stays low-density and scans reliably from any phone camera.
                </p>
              </div>
              {onOpenShareSettings && (
                <button
                  type="button"
                  onClick={onOpenShareSettings}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-400"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Open Share Settings
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
