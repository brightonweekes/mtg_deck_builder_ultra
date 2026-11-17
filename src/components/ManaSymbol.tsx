import { memo } from 'react';
import { resolveManaSymbolAsset } from '../assets/mana/manaSymbolRegistry.js';
import type { ManaColor } from '../types/card.js';

export type ManaBadgeSize = 'xs' | 'sm' | 'md' | 'lg';

const BADGE_DIMENSIONS: Readonly<
  Record<ManaBadgeSize, { px: number; imgClass: string; genericClass: string }>
> = {
  xs: { px: 16, imgClass: 'h-4 w-4', genericClass: 'h-4 min-w-4 px-0.5 text-[9px]' },
  sm: { px: 20, imgClass: 'h-5 w-5', genericClass: 'h-5 min-w-5 px-1 text-[10px]' },
  md: { px: 24, imgClass: 'h-6 w-6', genericClass: 'h-6 min-w-6 px-1 text-xs' },
  lg: { px: 28, imgClass: 'h-7 w-7', genericClass: 'h-7 min-w-7 px-1 text-xs' },
};

export const ManaSymbolBadge = memo(function ManaSymbolBadge({
  symbol,
  size = 'sm',
  className = '',
}: {
  symbol: string;
  size?: ManaBadgeSize;
  className?: string;
}) {
  const asset = resolveManaSymbolAsset(symbol);
  const dim = BADGE_DIMENSIONS[size];
  const label = `{${symbol}}`;

  if (asset.kind === 'svg-img') {
    const shapeClass =
      asset.shape === 'circle'
        ? asset.darkRing
          ? 'rounded-full ring-1 ring-slate-500/80'
          : 'rounded-full ring-1 ring-black/25'
        : 'object-contain';

    return (
      <img
        src={asset.src}
        alt={label}
        title={label}
        width={dim.px}
        height={dim.px}
        decoding="async"
        draggable={false}
        data-mana-symbol={symbol.trim().toUpperCase()}
        className={`inline-block shrink-0 select-none ${dim.imgClass} ${shapeClass} ${className}`.trim()}
      />
    );
  }

  return (
    <span
      title={label}
      data-mana-symbol={symbol.trim().toUpperCase()}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full bg-[#ccc2c0] font-bold leading-none text-[#130c0e] ring-1 ring-black/25 ${dim.genericClass} ${className}`.trim()}
    >
      {asset.text}
    </span>
  );
});

const RE_MANA_TOKEN = /\{([^}]+)\}/g;

export const ManaCostDisplay = memo(function ManaCostDisplay({
  manaCost,
  size = 'sm',
}: {
  manaCost: string;
  size?: ManaBadgeSize;
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
});

export const ColorIdentityBadges = memo(function ColorIdentityBadges({
  colors,
  size = 'xs',
}: {
  colors: readonly ManaColor[];
  size?: 'xs' | 'sm' | 'md';
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
});

export const OracleTextDisplay = memo(function OracleTextDisplay({ text }: { text: string }) {
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
                <span key={i} className="mx-0.5 -mt-0.5 inline-flex align-middle">
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
});
