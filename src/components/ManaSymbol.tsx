import type { ManaColor } from '../types/card.js';

const SYMBOL_STYLES: Record<string, { bg: string; text: string; label?: string }> = {
  W: { bg: 'bg-amber-100 ring-amber-300/70', text: 'text-slate-900' },
  U: { bg: 'bg-sky-400 ring-sky-200/70', text: 'text-slate-950' },
  B: { bg: 'bg-purple-900 ring-purple-400/60', text: 'text-purple-100' },
  R: { bg: 'bg-rose-500 ring-rose-300/70', text: 'text-white' },
  G: { bg: 'bg-emerald-500 ring-emerald-300/70', text: 'text-slate-950' },
  C: { bg: 'bg-slate-400 ring-slate-200/60', text: 'text-slate-950' },
  T: { bg: 'bg-slate-700 ring-slate-500/70', text: 'text-slate-100', label: '↷' },
  Q: { bg: 'bg-slate-700 ring-slate-500/70', text: 'text-slate-100', label: '↶' },
  E: { bg: 'bg-amber-500/20 ring-amber-400/60', text: 'text-amber-300', label: '⚡' },
};

function getSymbolStyle(token: string): { bg: string; text: string; display: string } {
  const upper = token.toUpperCase();
  const exact = SYMBOL_STYLES[upper];
  if (exact) {
    return { bg: exact.bg, text: exact.text, display: exact.label ?? upper };
  }

  if (upper.includes('/')) {
    const parts = upper.split('/');
    const first = parts[0] ?? '';
    const second = parts[1] ?? '';
    if (second === 'P' && SYMBOL_STYLES[first]) {
      return {
        bg: SYMBOL_STYLES[first].bg,
        text: SYMBOL_STYLES[first].text,
        display: `${first}φ`,
      };
    }
    return {
      bg: 'bg-gradient-to-br from-slate-600 to-slate-800 ring-slate-400/60',
      text: 'text-slate-100',
      display: upper,
    };
  }

  return {
    bg: 'bg-slate-700 ring-slate-500/70',
    text: 'text-slate-100',
    display: upper,
  };
}

export function ManaSymbolBadge({
  symbol,
  size = 'sm',
}: {
  symbol: string;
  size?: 'xs' | 'sm' | 'md';
}) {
  const style = getSymbolStyle(symbol);
  const sizeClass =
    size === 'xs'
      ? 'h-4 min-w-4 px-0.5 text-[9px]'
      : size === 'md'
        ? 'h-6 min-w-6 px-1 text-xs'
        : 'h-5 min-w-5 px-1 text-[10px]';

  return (
    <span
      title={`{${symbol}}`}
      className={`inline-flex items-center justify-center rounded-full font-bold leading-none ring-1 ${sizeClass} ${style.bg} ${style.text}`}
    >
      {style.display}
    </span>
  );
}

const RE_MANA_TOKEN = /\{([^}]+)\}/g;

export function ManaCostDisplay({
  manaCost,
  size = 'sm',
}: {
  manaCost: string;
  size?: 'xs' | 'sm' | 'md';
}) {
  if (!manaCost) return null;

  const faces = manaCost.split(' // ');
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {faces.map((faceCost, faceIdx) => {
        const tokens: string[] = [];
        let match: RegExpExecArray | null;
        RE_MANA_TOKEN.lastIndex = 0;
        while ((match = RE_MANA_TOKEN.exec(faceCost)) !== null) {
          if (match[1]) tokens.push(match[1]);
        }

        return (
          <span key={`${faceCost}-${faceIdx}`} className="inline-flex items-center gap-0.5">
            {faceIdx > 0 && <span className="mx-0.5 text-xs text-slate-500">//</span>}
            {tokens.map((tok, i) => (
              <ManaSymbolBadge key={`${tok}-${i}`} symbol={tok} size={size} />
            ))}
          </span>
        );
      })}
    </span>
  );
}

export function ColorIdentityBadges({
  colors,
  size = 'xs',
}: {
  colors: readonly ManaColor[];
  size?: 'xs' | 'sm';
}) {
  if (colors.length === 0) {
    return <ManaSymbolBadge symbol="C" size={size} />;
  }
  return (
    <span className="inline-flex items-center gap-0.5">
      {colors.map((c) => (
        <ManaSymbolBadge key={c} symbol={c} size={size} />
      ))}
    </span>
  );
}

export function OracleTextDisplay({ text }: { text: string }) {
  if (!text) {
    return <p className="text-sm italic text-slate-500">No rules text.</p>;
  }

  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-slate-200">
      {lines.map((line, lineIdx) => {
        if (line.trim() === '//') {
          return <hr key={lineIdx} className="my-2 border-slate-700/80" />;
        }

        const segments: Array<{ kind: 'text'; val: string } | { kind: 'sym'; val: string }> = [];
        let lastIndex = 0;
        RE_MANA_TOKEN.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = RE_MANA_TOKEN.exec(line)) !== null) {
          if (match.index > lastIndex) {
            segments.push({ kind: 'text', val: line.slice(lastIndex, match.index) });
          }
          if (match[1]) {
            segments.push({ kind: 'sym', val: match[1] });
          }
          lastIndex = match.index + match[0].length;
        }
        if (lastIndex < line.length) {
          segments.push({ kind: 'text', val: line.slice(lastIndex) });
        }

        return (
          <p key={lineIdx}>
            {segments.map((seg, i) =>
              seg.kind === 'sym' ? (
                <span key={i} className="mx-0.5 inline-block align-middle">
                  <ManaSymbolBadge symbol={seg.val} size="xs" />
                </span>
              ) : (
                <span key={i}>{seg.val}</span>
              ),
            )}
          </p>
        );
      })}
    </div>
  );
}
