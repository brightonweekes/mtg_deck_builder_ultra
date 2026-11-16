import { Database, Lock, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Ripple99Logo } from './Ripple99Logo.js';

export interface LegalFooterProps {
  defaultPolicyOpen?: boolean;
}

/**
 * Minimal dark footer with Ripple99 brand attribution, Wizards of the Coast Fan Content Policy
 * disclaimer, Scryfall attribution, and a Privacy & Terms disclosure modal.
 */
export function LegalFooter({ defaultPolicyOpen = false }: LegalFooterProps) {
  const [policyOpen, setPolicyOpen] = useState(defaultPolicyOpen);

  useEffect(() => {
    if (!policyOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setPolicyOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [policyOpen]);

  return (
    <>
      <footer className="mt-10 border-t border-slate-800/80 bg-slate-950/90 px-4 py-6 text-xs text-slate-400">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-slate-300">
              <Ripple99Logo className="h-5 w-5" />
              <span className="font-semibold text-slate-100">
                Ripple99 — Build Decks, Not Piles
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-emerald-300/90">100% Free, Local-First &amp; Ad-Free</span>
            </div>
            <p className="max-w-4xl text-[11px] leading-relaxed text-slate-500">
              Ripple99 is unofficial Fan Content permitted under the Fan Content Policy. Not
              approved/endorsed by Wizards. Portions of the materials used are property of Wizards of
              the Coast. ©Wizards of the Coast LLC.
            </p>
            <p className="text-[11px] text-slate-500">
              Card data &amp; images provided by Scryfall.
            </p>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setPolicyOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-amber-400/50 hover:text-amber-200"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
              Privacy &amp; Terms
            </button>
          </div>
        </div>
      </footer>

      {policyOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Privacy & Terms"
          onClick={() => setPolicyOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <Ripple99Logo className="h-6 w-6" />
                <div>
                  <h2 className="text-sm font-bold text-slate-100">Privacy &amp; Terms</h2>
                  <p className="text-[11px] text-slate-400">
                    Ripple99 — Local-First Commander Deck Builder
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPolicyOpen(false)}
                aria-label="Close privacy and terms"
                className="rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto p-5 text-xs leading-relaxed text-slate-300">
              <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
                <h3 className="mb-1 inline-flex items-center gap-1.5 font-bold text-slate-100">
                  <Database className="h-3.5 w-3.5 text-amber-400" />
                  Local-First IndexedDB Storage
                </h3>
                <p className="text-slate-300">
                  Your card catalog, search index, active deck drafts, and saved decks are stored
                  locally in your browser&apos;s IndexedDB and localStorage. Ripple99 works offline
                  without creating an account, and your local decks never leave your browser unless
                  you explicitly choose to sign in or share a link.
                </p>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
                <h3 className="mb-1 inline-flex items-center gap-1.5 font-bold text-slate-100">
                  <Lock className="h-3.5 w-3.5 text-sky-400" />
                  Optional Firebase Cloud Sync &amp; Handles
                </h3>
                <p className="text-slate-300">
                  Cloud accounts are completely optional. If you sign in via Firebase Authentication,
                  Ripple99 stores your chosen public <code className="font-mono text-amber-300">@handle</code>,
                  saved decks, card lists, and friend connections in Firebase Firestore solely to
                  sync across your devices and power friend sharing. You can export all data as JSON
                  or permanently delete your cloud account and data at any time from Account
                  Settings.
                </p>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
                <h3 className="mb-1 inline-flex items-center gap-1.5 font-bold text-slate-100">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  Cookie-Less Analytics, Zero Ad Trackers &amp; Zero Data Sales
                </h3>
                <p className="text-slate-300">
                  Ripple99 is 100% free and ad-free. We never run ad trackers, never build
                  advertising profiles, and never sell your personal data. Production builds may use
                  optional, cookie-less Cloudflare Web Analytics to measure aggregate page views
                  without cookies or cross-site tracking.
                </p>
              </section>

              <section className="border-t border-slate-800 pt-3 text-[11px] text-slate-400">
                <p>
                  Ripple99 is unofficial Fan Content permitted under the Fan Content Policy. Not
                  approved/endorsed by Wizards. Portions of the materials used are property of
                  Wizards of the Coast. ©Wizards of the Coast LLC.
                </p>
                <p className="mt-1">Card data &amp; images provided by Scryfall.</p>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
