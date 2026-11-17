import n0Raw from './0.svg?raw';
import n1Raw from './1.svg?raw';
import n2Raw from './2.svg?raw';
import n3Raw from './3.svg?raw';
import n4Raw from './4.svg?raw';
import n5Raw from './5.svg?raw';
import n6Raw from './6.svg?raw';
import n7Raw from './7.svg?raw';
import n8Raw from './8.svg?raw';
import n9Raw from './9.svg?raw';
import n10Raw from './10.svg?raw';
import n11Raw from './11.svg?raw';
import n12Raw from './12.svg?raw';
import n13Raw from './13.svg?raw';
import n14Raw from './14.svg?raw';
import n15Raw from './15.svg?raw';
import n16Raw from './16.svg?raw';
import n20Raw from './20.svg?raw';
import bRaw from './B.svg?raw';
import cRaw from './C.svg?raw';
import eRaw from './E.svg?raw';
import gRaw from './G.svg?raw';
import hRaw from './H.svg?raw';
import pRaw from './P.svg?raw';
import qRaw from './Q.svg?raw';
import rRaw from './R.svg?raw';
import sRaw from './S.svg?raw';
import tRaw from './T.svg?raw';
import tkRaw from './TK.svg?raw';
import uRaw from './U.svg?raw';
import wRaw from './W.svg?raw';
import xRaw from './X.svg?raw';

export interface ManaSymbolAsset {
  kind: 'svg-img';
  src: string;
  shape: 'circle' | 'shield';
  darkRing?: boolean;
}

export interface GenericManaAsset {
  kind: 'generic';
  text: string;
}

export type ResolvedManaAsset = ManaSymbolAsset | GenericManaAsset;

interface GlyphInfo {
  bg: string;
  fg: string;
  d: string;
  transform: string;
  cx: number;
  cy: number;
}

const STATIC_RAW_SVGS: Readonly<Record<string, { raw: string; shape: 'circle' | 'shield'; darkRing?: boolean }>> = {
  W: { raw: wRaw, shape: 'circle' },
  U: { raw: uRaw, shape: 'circle' },
  B: { raw: bRaw, shape: 'circle' },
  R: { raw: rRaw, shape: 'circle' },
  G: { raw: gRaw, shape: 'circle' },
  C: { raw: cRaw, shape: 'circle' },
  T: { raw: tRaw, shape: 'circle' },
  Q: { raw: qRaw, shape: 'circle', darkRing: true },
  E: { raw: eRaw, shape: 'shield' },
  S: { raw: sRaw, shape: 'circle' },
  TK: { raw: tkRaw, shape: 'circle' },
  P: { raw: pRaw, shape: 'circle' },
  H: { raw: hRaw, shape: 'circle' },
  X: { raw: xRaw, shape: 'circle' },
  '0': { raw: n0Raw, shape: 'circle' },
  '1': { raw: n1Raw, shape: 'circle' },
  '2': { raw: n2Raw, shape: 'circle' },
  '3': { raw: n3Raw, shape: 'circle' },
  '4': { raw: n4Raw, shape: 'circle' },
  '5': { raw: n5Raw, shape: 'circle' },
  '6': { raw: n6Raw, shape: 'circle' },
  '7': { raw: n7Raw, shape: 'circle' },
  '8': { raw: n8Raw, shape: 'circle' },
  '9': { raw: n9Raw, shape: 'circle' },
  '10': { raw: n10Raw, shape: 'circle' },
  '11': { raw: n11Raw, shape: 'circle' },
  '12': { raw: n12Raw, shape: 'circle' },
  '13': { raw: n13Raw, shape: 'circle' },
  '14': { raw: n14Raw, shape: 'circle' },
  '15': { raw: n15Raw, shape: 'circle' },
  '16': { raw: n16Raw, shape: 'circle' },
  '20': { raw: n20Raw, shape: 'circle' },
};

const GLYPH_CENTERS: Readonly<Record<'W' | 'U' | 'B' | 'R' | 'G' | 'C', [number, number]>> = {
  W: [300.0, 299.5],
  U: [297.0, 304.5],
  B: [300.0, 299.5],
  R: [328.5, 297.5],
  G: [300.0, 304.5],
  C: [299.5, 299.5],
};

// Traced bold serif "2" glyph (235.01 x 327.82 in post-transform coordinates) for font-independent 2/W..2/G hybrids.
const TWO_GLYPH_PATH =
  'M2767 4415 c-564 -92 -932 -484 -904 -963 13 -224 115 -386 287 -454 44 -17 77 -22 166 -22 108 -1 112 0 187 37 84 41 131 89 169 173 20 43 23 65 23 174 0 122 -1 127 -33 192 -40 81 -109 146 -214 202 -91 49 -105 61 -113 98 -10 46 36 130 99 180 227 181 570 178 748 -6 88 -90 131 -222 131 -401 1 -245 -57 -427 -210 -660 -106 -160 -221 -297 -528 -625 -370 -397 -520 -570 -701 -813 l-114 -152 0 -114 0 -113 28 7 c43 13 1969 18 2101 6 63 -6 116 -10 117 -8 2 2 104 1205 104 1225 0 9 -31 12 -123 12 l-123 0 -41 -177 c-46 -203 -77 -288 -113 -315 -46 -34 -138 -39 -694 -36 l-539 3 104 83 c150 119 264 199 529 371 595 387 731 512 871 796 81 165 112 284 113 440 0 145 -15 213 -80 342 -126 252 -416 443 -770 508 -126 23 -367 28 -477 10z';
const TWO_GLYPH_TRANSFORM = 'translate(-176.0,442.59) scale(0.1,-0.1)';
const TWO_WIDTH = 235.01;
const TWO_HEIGHT = 327.82;

const RE_CIRCLE_FILL = /<circle\b[^>]*\bfill=['"]([^'"]+)['"]/i;
const RE_PATH_TAG = /<path\b([^>]*)>/i;
const RE_ATTR_D = /\bd=['"]([^'"]+)['"]/i;
const RE_ATTR_FILL = /\bfill=['"]([^'"]+)['"]/i;
const RE_ATTR_TRANSFORM = /\btransform=['"]([^'"]+)['"]/i;

let parsedGlyphs: Record<'W' | 'U' | 'B' | 'R' | 'G' | 'C', GlyphInfo> | null = null;
let parsedPhyrexianPath: string | null = null;

function parseBaseGlyph(rawSvg: string, center: [number, number]): GlyphInfo {
  const circleMatch = RE_CIRCLE_FILL.exec(rawSvg);
  const pathMatch = RE_PATH_TAG.exec(rawSvg);
  const attrs = pathMatch?.[1] ?? '';
  const dMatch = RE_ATTR_D.exec(attrs);
  const fillMatch = RE_ATTR_FILL.exec(attrs);
  const tfMatch = RE_ATTR_TRANSFORM.exec(attrs);

  if (!circleMatch?.[1] || !dMatch?.[1] || !fillMatch?.[1]) {
    throw new Error('Invalid base mana SVG structure');
  }

  return {
    bg: circleMatch[1],
    fg: fillMatch[1],
    d: dMatch[1],
    transform: tfMatch?.[1] ?? '',
    cx: center[0],
    cy: center[1],
  };
}

function getBaseGlyphs(): Record<'W' | 'U' | 'B' | 'R' | 'G' | 'C', GlyphInfo> {
  if (!parsedGlyphs) {
    parsedGlyphs = {
      W: parseBaseGlyph(wRaw, GLYPH_CENTERS.W),
      U: parseBaseGlyph(uRaw, GLYPH_CENTERS.U),
      B: parseBaseGlyph(bRaw, GLYPH_CENTERS.B),
      R: parseBaseGlyph(rRaw, GLYPH_CENTERS.R),
      G: parseBaseGlyph(gRaw, GLYPH_CENTERS.G),
      C: parseBaseGlyph(cRaw, GLYPH_CENTERS.C),
    };
  }
  return parsedGlyphs;
}

function getPhyrexianPath(): string {
  if (!parsedPhyrexianPath) {
    const pathMatch = RE_PATH_TAG.exec(hRaw);
    const dMatch = RE_ATTR_D.exec(pathMatch?.[1] ?? '');
    if (!dMatch?.[1]) {
      throw new Error('Invalid Phyrexian SVG structure');
    }
    parsedPhyrexianPath = dMatch[1];
  }
  return parsedPhyrexianPath;
}

function isBaseColorKey(token: string): token is 'W' | 'U' | 'B' | 'R' | 'G' | 'C' {
  return token === 'W' || token === 'U' || token === 'B' || token === 'R' || token === 'G' || token === 'C';
}

function renderSplitHalfGlyph(token: string, tx: number, ty: number): string {
  if (token === '2') {
    return `<g transform="translate(${tx},${ty}) scale(0.68) translate(${-TWO_WIDTH / 2},${-TWO_HEIGHT / 2}) ${TWO_GLYPH_TRANSFORM}"><path d="${TWO_GLYPH_PATH}" fill="#130c0e"/></g>`;
  }
  if (!isBaseColorKey(token)) {
    return '';
  }
  const info = getBaseGlyphs()[token];
  const innerTf = info.transform ? ` transform="${info.transform}"` : '';
  return `<g transform="translate(${tx},${ty}) scale(0.43) translate(${-info.cx},${-info.cy})"><path d="${info.d}" fill="${info.fg}"${innerTf}/></g>`;
}

function getBackgroundColor(token: string): string | null {
  if (token === '2') return '#ccc2c0';
  if (isBaseColorKey(token)) {
    return getBaseGlyphs()[token].bg;
  }
  return null;
}

function needsDiagonalDivider(a: string, b: string): boolean {
  return (a === 'C' && b === 'B') || (a === 'B' && b === 'C') || (a === '2' && b === 'B') || (a === 'B' && b === '2');
}

function buildMonoPhyrexianSvg(colorKey: 'W' | 'U' | 'B' | 'R' | 'G' | 'C'): string {
  const info = getBaseGlyphs()[colorKey];
  const phyPath = getPhyrexianPath();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><circle cx="300" cy="300" r="300" fill="${info.bg}"/><g transform="translate(300,300) scale(4.7) translate(-28.5,-50)"><path d="${phyPath}" fill="${info.fg}"/></g></svg>`;
}

function buildTwoWayHybridSvg(a: string, b: string): string | null {
  const bgA = getBackgroundColor(a);
  const bgB = getBackgroundColor(b);
  if (!bgA || !bgB) return null;

  const glyphA = renderSplitHalfGlyph(a, 182, 182);
  const glyphB = renderSplitHalfGlyph(b, 420, 418);
  if (!glyphA || !glyphB) return null;

  const divider = needsDiagonalDivider(a, b)
    ? '<line x1="87.87" y1="512.13" x2="512.13" y2="87.87" stroke="#130c0e" stroke-opacity="0.28" stroke-width="14"/>'
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><circle cx="300" cy="300" r="300" fill="${bgB}"/><path d="M512.13 87.87A300 300 0 0 0 87.87 512.13Z" fill="${bgA}"/>${divider}${glyphA}${glyphB}</svg>`;
}

function buildHybridPhyrexianSvg(a: string, b: string): string | null {
  const bgA = getBackgroundColor(a);
  const bgB = getBackgroundColor(b);
  if (!bgA || !bgB) return null;

  const phyPath = getPhyrexianPath();
  const divider = needsDiagonalDivider(a, b)
    ? '<line x1="87.87" y1="512.13" x2="512.13" y2="87.87" stroke="#130c0e" stroke-opacity="0.28" stroke-width="14"/>'
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><circle cx="300" cy="300" r="300" fill="${bgB}"/><path d="M512.13 87.87A300 300 0 0 0 87.87 512.13Z" fill="${bgA}"/>${divider}<g transform="translate(300,300) scale(4.7) translate(-28.5,-50)"><path d="${phyPath}" fill="#130c0e"/></g></svg>`;
}

const svgSourceCache = new Map<string, string | null>();
const assetCache = new Map<string, ResolvedManaAsset>();

function toSvgDataUri(svg: string): string {
  const compacted = svg
    .trim()
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .replace(/="([^"']*)"/g, "='$1'");
  const encoded = compacted.replace(/[\s#%<>"{}|\\^`[\]]/g, (ch) =>
    ch === ' ' ? '%20' : encodeURIComponent(ch),
  );
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

/**
 * Returns raw SVG markup for any vector mana/card symbol token (base, generic numerals/`X`,
 * utility, or composite split/Phyrexian), or `null` if an unrecognized token falls back to text.
 */
export function getManaSymbolSvgSource(rawToken: string): string | null {
  const upper = rawToken.trim().toUpperCase();
  if (!upper) return null;

  if (svgSourceCache.has(upper)) {
    return svgSourceCache.get(upper) ?? null;
  }

  let svg: string | null = null;
  const staticEntry = STATIC_RAW_SVGS[upper];
  if (staticEntry) {
    svg = staticEntry.raw;
  } else if (upper.includes('/')) {
    const parts = upper.split('/');
    if (parts.length === 2) {
      const [first, second] = parts;
      if (first && second === 'P' && isBaseColorKey(first)) {
        svg = buildMonoPhyrexianSvg(first);
      } else if (first === 'P' && second && isBaseColorKey(second)) {
        svg = buildMonoPhyrexianSvg(second);
      } else if (first && second) {
        svg = buildTwoWayHybridSvg(first, second);
      }
    } else if (parts.length === 3 && parts[2] === 'P' && parts[0] && parts[1]) {
      svg = buildHybridPhyrexianSvg(parts[0], parts[1]);
    }
  }

  svgSourceCache.set(upper, svg);
  return svg;
}

/**
 * Resolves and memoizes a renderable badge asset (SVG data URI `<img>` or generic text circle) for a mana token.
 */
export function resolveManaSymbolAsset(rawToken: string): ResolvedManaAsset {
  const upper = rawToken.trim().toUpperCase();
  const cached = assetCache.get(upper);
  if (cached) return cached;

  const svg = getManaSymbolSvgSource(upper);
  if (svg) {
    const staticEntry = STATIC_RAW_SVGS[upper];
    const resolved: ManaSymbolAsset = {
      kind: 'svg-img',
      src: toSvgDataUri(svg),
      shape: staticEntry?.shape ?? 'circle',
      darkRing: staticEntry?.darkRing,
    };
    assetCache.set(upper, resolved);
    return resolved;
  }

  const generic: GenericManaAsset = {
    kind: 'generic',
    text: upper.endsWith('/P') ? `${upper.slice(0, -2)}φ` : upper,
  };
  assetCache.set(upper, generic);
  return generic;
}
