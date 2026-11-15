import {
  CARD_TYPE_OPTIONS,
  ROLE_BY_ID,
  THEME_BY_ID,
  THEME_METADATA,
  THEME_SYNONYMS,
} from '../config/searchConfig.js';
import {
  FUNCTIONAL_ROLES,
  type CompactCard,
  type FunctionalRole,
  type ManaColor,
} from '../types/card.js';
import type {
  ScoredCardMatch,
  SearchFilter,
  SearchResponsePayload,
} from '../types/search.js';

const ROLE_BIT: Record<FunctionalRole, number> = Object.fromEntries(
  FUNCTIONAL_ROLES.map((role, index) => [role, 1 << index]),
) as Record<FunctionalRole, number>;

const CARD_TYPE_BIT: Record<string, number> = Object.fromEntries(
  CARD_TYPE_OPTIONS.map((typeName, index) => [typeName.toLowerCase(), 1 << index]),
);

interface TypeWordEntry {
  lower: string;
  firstChar: number;
  bit: number;
}

const MAX_TYPE_WORD_LEN = CARD_TYPE_OPTIONS.reduce(
  (max, typeName) => Math.max(max, typeName.length),
  0,
);
const TYPE_WORD_BUCKETS: TypeWordEntry[][] = Array.from(
  { length: MAX_TYPE_WORD_LEN + 1 },
  () => [],
);
for (let i = 0; i < CARD_TYPE_OPTIONS.length; i++) {
  const lower = CARD_TYPE_OPTIONS[i]!.toLowerCase();
  TYPE_WORD_BUCKETS[lower.length]!.push({
    lower,
    firstChar: lower.charCodeAt(0),
    bit: 1 << i,
  });
}

// Pack all known theme IDs into two 30-bit integers (supports up to 60 themes with zero Set allocations)
const THEME_INDEX_MAP = new Map<string, number>(
  THEME_METADATA.map((theme, index) => [theme.id, index]),
);
const ALL_KNOWN_THEME_IDS = new Set(THEME_METADATA.map((t) => t.id));

export function colorArrayToMask(colors: readonly ManaColor[]): number {
  const len = colors.length;
  if (len === 0) return 0;
  let mask = 0;
  for (let i = 0; i < len; i++) {
    switch (colors[i]) {
      case 'W':
        mask |= 1 << 0;
        break;
      case 'U':
        mask |= 1 << 1;
        break;
      case 'B':
        mask |= 1 << 2;
        break;
      case 'R':
        mask |= 1 << 3;
        break;
      case 'G':
        mask |= 1 << 4;
        break;
    }
  }
  return mask;
}

function encodeRolesMask(roles: readonly FunctionalRole[]): number {
  const len = roles.length;
  if (len === 0) return 0;
  let mask = 0;
  for (let i = 0; i < len; i++) {
    mask |= ROLE_BIT[roles[i]!] ?? 0;
  }
  return mask;
}

interface EncodedThemes {
  lo: number;
  hi: number;
  extra: string[] | null;
}

const THEME_SCRATCH: EncodedThemes = { lo: 0, hi: 0, extra: null };

function encodeThemesInto(themes: readonly string[], out: EncodedThemes): void {
  let lo = 0;
  let hi = 0;
  let extra: string[] | null = null;

  for (let i = 0; i < themes.length; i++) {
    const theme = themes[i]!;
    const idx = THEME_INDEX_MAP.get(theme);
    if (idx === undefined) {
      if (!extra) extra = [];
      extra.push(theme);
    } else if (idx < 30) {
      lo |= 1 << idx;
    } else if (idx < 60) {
      hi |= 1 << (idx - 30);
    } else {
      if (!extra) extra = [];
      extra.push(theme);
    }
  }

  out.lo = lo;
  out.hi = hi;
  out.extra = extra;
}

function encodeThemesMask(themes: readonly string[]): EncodedThemes {
  const out: EncodedThemes = { lo: 0, hi: 0, extra: null };
  if (themes.length > 0) {
    encodeThemesInto(themes, out);
  }
  return out;
}

interface ThemeTermCheck {
  loMask: number;
  hiMask: number;
  extraId: string | null;
  reason: string;
  weight: number;
}

interface RoleTermCheck {
  mask: number;
  reason: string;
}

interface FallbackTermCheck {
  term: string;
  reason: string;
}

interface TokenGroupCheck {
  loMask: number;
  hiMask: number;
  extraIds: string[] | null;
  roleMask: number;
  fallbackTerm?: string;
}

interface PreparedThemeMatcher {
  active: boolean;
  anyThemeLo: number;
  anyThemeHi: number;
  hasAnyExtra: boolean;
  anyRoleMask: number;
  hasFallback: boolean;
  themeChecks: ThemeTermCheck[];
  roleChecks: RoleTermCheck[];
  fallbackChecks: FallbackTermCheck[];
  groupChecks: TokenGroupCheck[];
}

function buildThemeChecks(
  themes: readonly string[],
  reasonPrefix: string,
  weight: number,
): ThemeTermCheck[] {
  return themes.map((id) => {
    const idx = THEME_INDEX_MAP.get(id);
    return {
      loMask: idx !== undefined && idx < 30 ? 1 << idx : 0,
      hiMask: idx !== undefined && idx >= 30 && idx < 60 ? 1 << (idx - 30) : 0,
      extraId: idx === undefined || idx >= 60 ? id : null,
      reason: `${reasonPrefix}: ${THEME_BY_ID[id]?.label ?? id}`,
      weight,
    };
  });
}

function prepareThemeMatcher(intent: ParsedThemeIntent | null): PreparedThemeMatcher | null {
  if (!intent || !intent.active) return null;

  const primaryEnc = encodeThemesMask(intent.primaryThemes);
  const secondaryEnc = encodeThemesMask(intent.secondaryThemes);
  const themeChecks = [
    ...buildThemeChecks(intent.primaryThemes, 'Theme', 30),
    ...buildThemeChecks(intent.secondaryThemes, 'Synergy', 20),
  ];
  const roleChecks: RoleTermCheck[] = intent.targetRoles.map((r) => ({
    mask: ROLE_BIT[r] ?? 0,
    reason: `Role: ${ROLE_BY_ID[r]?.label ?? r}`,
  }));
  const fallbackChecks: FallbackTermCheck[] = intent.fallbackTerms.map((term) => ({
    term,
    reason: `Text: "${term}"`,
  }));
  const groupChecks: TokenGroupCheck[] =
    intent.tokenGroups.length > 1
      ? intent.tokenGroups.map((g) => {
          const enc = encodeThemesMask(g.themes);
          return {
            loMask: enc.lo,
            hiMask: enc.hi,
            extraIds: enc.extra,
            roleMask: encodeRolesMask(g.roles),
            fallbackTerm: g.fallbackTerm,
          };
        })
      : [];

  return {
    active: true,
    anyThemeLo: primaryEnc.lo | secondaryEnc.lo,
    anyThemeHi: primaryEnc.hi | secondaryEnc.hi,
    hasAnyExtra: primaryEnc.extra !== null || secondaryEnc.extra !== null,
    anyRoleMask: encodeRolesMask(intent.targetRoles),
    hasFallback: fallbackChecks.length > 0,
    themeChecks,
    roleChecks,
    fallbackChecks,
    groupChecks,
  };
}

function matchesThemeCheck(
  themeMaskLo: number,
  themeMaskHi: number,
  extraThemes: string[] | null,
  check: ThemeTermCheck,
): boolean {
  if (check.loMask !== 0 && (themeMaskLo & check.loMask) !== 0) return true;
  if (check.hiMask !== 0 && (themeMaskHi & check.hiMask) !== 0) return true;
  return (
    check.extraId !== null &&
    extraThemes !== null &&
    extraThemes.includes(check.extraId)
  );
}

function addTypeWordsToMask(typeLineLower: string, startPos: number, endPos: number): number {
  let typeMask = 0;
  let i = startPos;
  while (i < endPos) {
    while (i < endPos && typeLineLower.charCodeAt(i) <= 32) i++;
    if (i >= endPos) break;
    let end = i + 1;
    while (end < endPos && typeLineLower.charCodeAt(end) > 32) end++;
    const wordLen = end - i;
    if (wordLen <= MAX_TYPE_WORD_LEN) {
      const bucket = TYPE_WORD_BUCKETS[wordLen]!;
      if (bucket.length > 0) {
        const firstChar = typeLineLower.charCodeAt(i);
        for (let b = 0; b < bucket.length; b++) {
          const entry = bucket[b]!;
          if (entry.firstChar === firstChar && typeLineLower.startsWith(entry.lower, i)) {
            typeMask |= entry.bit;
            break;
          }
        }
      }
    }
    i = end + 1;
  }
  return typeMask;
}

function trimSlice(str: string, start: number, end: number): string {
  while (start < end && str.charCodeAt(start) <= 32) start++;
  while (end > start && str.charCodeAt(end - 1) <= 32) end--;
  if (start >= end) return '';
  const slice = str.slice(start, end);
  return str.charCodeAt(start) > 127 || str.charCodeAt(end - 1) > 127
    ? slice.trim()
    : slice;
}

interface ParsedTypeLine {
  typeLineLower: string;
  typeMask: number;
  subtypesLower: string;
}

// MTG's ~32.6k cards share ~4.1k distinct type lines; memoizing avoids redundant lowercasing and parsing.
const MAX_TYPE_LINE_CACHE_SIZE = 8192;
const TYPE_LINE_CACHE = new Map<string, ParsedTypeLine>();

function parseTypeLine(typeLine: string): ParsedTypeLine {
  const cached = TYPE_LINE_CACHE.get(typeLine);
  if (cached !== undefined) return cached;

  const typeLineLower = typeLine.toLowerCase();
  const tLen = typeLineLower.length;
  let typeMask = 0;
  let subtypesLower = '';
  let faceStart = 0;
  let nextSplit = typeLineLower.indexOf(' // ');

  while (true) {
    const faceEnd = nextSplit < 0 ? tLen : nextSplit;
    const dashIdx = typeLineLower.indexOf('—', faceStart);
    if (dashIdx < 0 || dashIdx >= faceEnd) {
      typeMask |= addTypeWordsToMask(typeLineLower, faceStart, faceEnd);
    } else {
      typeMask |= addTypeWordsToMask(typeLineLower, faceStart, dashIdx);
      const sub = trimSlice(typeLineLower, dashIdx + 1, faceEnd);
      if (sub) subtypesLower = subtypesLower ? `${subtypesLower} ${sub}` : sub;
    }
    if (nextSplit < 0) break;
    faceStart = nextSplit + 4;
    nextSplit = typeLineLower.indexOf(' // ', faceStart);
  }

  const parsed: ParsedTypeLine = { typeLineLower, typeMask, subtypesLower };
  if (TYPE_LINE_CACHE.size >= MAX_TYPE_LINE_CACHE_SIZE) {
    TYPE_LINE_CACHE.clear();
  }
  TYPE_LINE_CACHE.set(typeLine, parsed);
  return parsed;
}

export function parseSearchQuery(query: string): string[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const tokens: string[] = [];
  let i = 0;
  while (i < trimmed.length) {
    while (i < trimmed.length && trimmed[i] === ' ') i++;
    if (i >= trimmed.length) break;

    if (trimmed[i] === '"') {
      const endQuote = trimmed.indexOf('"', i + 1);
      if (endQuote > i + 1) {
        const phrase = trimmed.slice(i + 1, endQuote).trim();
        if (phrase) tokens.push(phrase);
        i = endQuote + 1;
        continue;
      }
    }

    let end = i;
    while (end < trimmed.length && trimmed[end] !== ' ') end++;
    const word = trimmed.slice(i, end).replace(/^"+|"+$/g, '');
    if (word) tokens.push(word);
    i = end;
  }

  return tokens;
}

export interface ParsedThemeIntent {
  active: boolean;
  primaryThemes: string[];
  secondaryThemes: string[];
  targetRoles: FunctionalRole[];
  fallbackTerms: string[];
  tokenGroups: Array<{
    themes: string[];
    roles: FunctionalRole[];
    fallbackTerm?: string;
  }>;
}

export function parseThemeIntent(
  themeQuery: string,
  selectedThemes: readonly string[],
): ParsedThemeIntent {
  const primarySet = new Set<string>(selectedThemes);
  const secondarySet = new Set<string>();
  const roleSet = new Set<FunctionalRole>();
  const fallbackSet = new Set<string>();
  const tokenGroups: ParsedThemeIntent['tokenGroups'] = [];

  for (const theme of selectedThemes) {
    tokenGroups.push({ themes: [theme], roles: [] });
  }

  const normalizedQuery = themeQuery
    .toLowerCase()
    .replace(/\+1\/\+1/g, ' counters ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim();

  if (normalizedQuery) {
    const rawWords = normalizedQuery.split(/\s+/);
    for (const word of rawWords) {
      if (!word || word.length < 2) continue;

      const synonym = THEME_SYNONYMS[word];
      if (synonym) {
        for (const t of synonym.primaryThemes) primarySet.add(t);
        for (const t of synonym.secondaryThemes ?? []) secondarySet.add(t);
        for (const r of synonym.roles ?? []) roleSet.add(r);

        const groupThemes = [
          ...synonym.primaryThemes,
          ...(synonym.secondaryThemes ?? []),
        ];
        const groupRoles = synonym.roles ?? [];
        if (groupThemes.length > 0 || groupRoles.length > 0) {
          tokenGroups.push({ themes: groupThemes, roles: groupRoles });
        }
        continue;
      }

      if (ALL_KNOWN_THEME_IDS.has(word)) {
        primarySet.add(word);
        tokenGroups.push({ themes: [word], roles: [] });
        continue;
      }

      if (word === 'and' || word === 'or' || word === 'with' || word === 'the' || word === 'for') {
        continue;
      }

      fallbackSet.add(word);
      tokenGroups.push({ themes: [], roles: [], fallbackTerm: word });
    }
  }

  for (const p of primarySet) {
    secondarySet.delete(p);
  }

  const active =
    primarySet.size > 0 ||
    secondarySet.size > 0 ||
    roleSet.size > 0 ||
    fallbackSet.size > 0;

  return {
    active,
    primaryThemes: Array.from(primarySet),
    secondaryThemes: Array.from(secondarySet),
    targetRoles: Array.from(roleSet),
    fallbackTerms: Array.from(fallbackSet),
    tokenGroups,
  };
}

function compareEdhrec(a: CompactCard, b: CompactCard): number {
  if (a.edhrecRank !== null && b.edhrecRank !== null) {
    if (a.edhrecRank !== b.edhrecRank) return a.edhrecRank - b.edhrecRank;
  } else if (a.edhrecRank !== null) {
    return -1;
  } else if (b.edhrecRank !== null) {
    return 1;
  }
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

function compareMatches(
  a: ScoredCardMatch,
  b: ScoredCardMatch,
  sortBy: SearchFilter['sortBy'],
  useSynergySort: boolean,
): number {
  if (useSynergySort) {
    if (b.synergyScore !== a.synergyScore) return b.synergyScore - a.synergyScore;
    return compareEdhrec(a.card, b.card);
  }

  switch (sortBy) {
    case 'synergy':
      if (b.synergyScore !== a.synergyScore) return b.synergyScore - a.synergyScore;
      return compareEdhrec(a.card, b.card);
    case 'cmc-asc':
      if (a.card.cmc !== b.card.cmc) return a.card.cmc - b.card.cmc;
      return compareEdhrec(a.card, b.card);
    case 'cmc-desc':
      if (a.card.cmc !== b.card.cmc) return b.card.cmc - a.card.cmc;
      return compareEdhrec(a.card, b.card);
    case 'price-asc': {
      const pa = a.card.priceUsd;
      const pb = b.card.priceUsd;
      if (pa !== null && pb !== null) {
        if (pa !== pb) return pa - pb;
      } else if (pa !== null) {
        return -1;
      } else if (pb !== null) {
        return 1;
      }
      return compareEdhrec(a.card, b.card);
    }
    case 'price-desc': {
      const pa = a.card.priceUsd;
      const pb = b.card.priceUsd;
      if (pa !== null && pb !== null) {
        if (pa !== pb) return pb - pa;
      } else if (pa !== null) {
        return -1;
      } else if (pb !== null) {
        return 1;
      }
      return compareEdhrec(a.card, b.card);
    }
    case 'name-asc':
      return a.card.name < b.card.name ? -1 : a.card.name > b.card.name ? 1 : 0;
    case 'edhrec':
    default:
      return compareEdhrec(a.card, b.card);
  }
}

const CANONICAL_BASIC_LAND_NAMES = new Set([
  'Plains',
  'Island',
  'Swamp',
  'Mountain',
  'Forest',
  'Wastes',
]);

/**
 * High-speed in-memory search, filter, and Method A synergy scoring engine.
 */
export class CardSearchEngine {
  private readonly cards: readonly CompactCard[];
  private readonly colorMasks: Uint8Array;
  private readonly ciMasks: Uint8Array;
  private readonly typeMasks: Uint32Array;
  private readonly roleMasks: Uint32Array;
  private readonly themeMaskLos: Int32Array;
  private readonly themeMaskHis: Int32Array;
  private readonly extraThemesByIndex: Map<number, string[]> | null;
  private readonly nameLowers: string[];
  private readonly typeLineLowers: string[];
  private readonly subtypesLowers: string[];
  private readonly oracleLowers: string[];
  private readonly cardById: Map<string, CompactCard>;
  private readonly basicLandsByName: Record<string, CompactCard>;
  private readonly isPreSortedByEdhrec: boolean;
  private cardByOracleId: Map<string, CompactCard> | null = null;
  private cardByName: Map<string, CompactCard> | null = null;
  private frontFaceByName: Map<string, CompactCard> | null = null;

  constructor(cards: readonly CompactCard[]) {
    const len = cards.length;
    const indexedCards = cards.slice();
    const colorMasks = new Uint8Array(len);
    const ciMasks = new Uint8Array(len);
    const typeMasks = new Uint32Array(len);
    const roleMasks = new Uint32Array(len);
    const themeMaskLos = new Int32Array(len);
    const themeMaskHis = new Int32Array(len);
    const nameLowers = new Array<string>(len);
    const typeLineLowers = new Array<string>(len);
    const subtypesLowers = new Array<string>(len);
    const oracleLowers = new Array<string>(len);
    let extraThemesByIndex: Map<number, string[]> | null = null;
    const cardById = new Map<string, CompactCard>();
    const basicLandsByName: Record<string, CompactCard> = {};
    let preSorted = true;
    let prevRank: number | null = null;
    let prevName = '';

    for (let i = 0; i < len; i++) {
      const card = indexedCards[i]!;
      const name = card.name;

      // Equivalent to compareEdhrec(cards[i - 1], card) > 0 without re-reading cards[i - 1]
      if (preSorted) {
        const rank = card.edhrecRank;
        if (i > 0) {
          if (rank !== null) {
            if (prevRank === null || prevRank > rank || (prevRank === rank && prevName > name)) {
              preSorted = false;
            }
          } else if (prevRank === null && prevName > name) {
            preSorted = false;
          }
        }
        prevRank = rank;
        prevName = name;
      }

      const parsedType = parseTypeLine(card.typeLine);
      typeMasks[i] = parsedType.typeMask;
      typeLineLowers[i] = parsedType.typeLineLower;
      subtypesLowers[i] = parsedType.subtypesLower;

      const colors = card.colors;
      if (colors.length > 0) {
        colorMasks[i] = colorArrayToMask(colors);
      }

      const colorIdentity = card.colorIdentity;
      if (colorIdentity.length > 0) {
        ciMasks[i] = colorArrayToMask(colorIdentity);
      }

      const roles = card.roles;
      if (roles.length > 0) {
        roleMasks[i] = encodeRolesMask(roles);
      }

      const themes = card.themes;
      if (themes.length > 0) {
        encodeThemesInto(themes, THEME_SCRATCH);
        themeMaskLos[i] = THEME_SCRATCH.lo;
        themeMaskHis[i] = THEME_SCRATCH.hi;
        if (THEME_SCRATCH.extra !== null) {
          if (!extraThemesByIndex) extraThemesByIndex = new Map<number, string[]>();
          extraThemesByIndex.set(i, THEME_SCRATCH.extra);
          THEME_SCRATCH.extra = null;
        }
      }

      nameLowers[i] = name.toLowerCase();
      const oracleText = card.oracleText;
      oracleLowers[i] = oracleText.length === 0 ? '' : oracleText.toLowerCase();

      cardById.set(card.id, card);
      if (
        card.maxCopies === null &&
        CANONICAL_BASIC_LAND_NAMES.has(name) &&
        !basicLandsByName[name]
      ) {
        basicLandsByName[name] = card;
      }
    }

    this.cards = indexedCards;
    this.colorMasks = colorMasks;
    this.ciMasks = ciMasks;
    this.typeMasks = typeMasks;
    this.roleMasks = roleMasks;
    this.themeMaskLos = themeMaskLos;
    this.themeMaskHis = themeMaskHis;
    this.extraThemesByIndex = extraThemesByIndex;
    this.nameLowers = nameLowers;
    this.typeLineLowers = typeLineLowers;
    this.subtypesLowers = subtypesLowers;
    this.oracleLowers = oracleLowers;
    this.cardById = cardById;
    this.basicLandsByName = basicLandsByName;
    this.isPreSortedByEdhrec = preSorted;
  }

  private ensureOracleIdIndex(): Map<string, CompactCard> {
    if (this.cardByOracleId) return this.cardByOracleId;
    const byOracleId = new Map<string, CompactCard>();

    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i]!;
      if (card.oracleId && !byOracleId.has(card.oracleId)) {
        byOracleId.set(card.oracleId, card);
      }
    }

    this.cardByOracleId = byOracleId;
    return byOracleId;
  }

  private ensureNameIndex(): void {
    if (this.cardByName && this.frontFaceByName) return;
    const byName = new Map<string, CompactCard>();
    const frontByName = new Map<string, CompactCard>();

    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i]!;
      const nameLower = this.nameLowers[i]!;
      if (!byName.has(nameLower)) {
        byName.set(nameLower, card);
      }
      const splitIdx = nameLower.indexOf(' // ');
      if (splitIdx > 0) {
        const frontLower = nameLower.slice(0, splitIdx).trim();
        if (frontLower && !frontByName.has(frontLower)) {
          frontByName.set(frontLower, card);
        }
      }
    }

    this.cardByName = byName;
    this.frontFaceByName = frontByName;
  }

  get totalCount(): number {
    return this.cards.length;
  }

  private resolveCardByIdOrOracleId(id: string): CompactCard | undefined {
    return this.cardById.get(id) ?? this.ensureOracleIdIndex().get(id);
  }

  getCardsByIds(ids: readonly string[]): CompactCard[] {
    const out: CompactCard[] = [];
    for (const id of ids) {
      const card = this.resolveCardByIdOrOracleId(id);
      if (card) out.push(card);
    }
    return out;
  }

  getCardsByIdMap(ids: readonly string[]): Record<string, CompactCard> {
    const out: Record<string, CompactCard> = {};
    for (const id of ids) {
      const card = this.resolveCardByIdOrOracleId(id);
      if (card) out[id] = card;
    }
    return out;
  }

  getOracleIdMap(ids: readonly string[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const id of ids) {
      const card = this.resolveCardByIdOrOracleId(id);
      if (card?.oracleId) {
        out[id] = card.oracleId;
      }
    }
    return out;
  }

  getCardByName(name: string): CompactCard | undefined {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return undefined;
    this.ensureNameIndex();
    const exact = this.cardByName!.get(normalized);
    if (exact) return exact;
    const front = this.frontFaceByName!.get(normalized);
    if (front) return front;
    const splitIdx = normalized.indexOf(' // ');
    if (splitIdx > 0) {
      const frontOnly = normalized.slice(0, splitIdx).trim();
      return this.cardByName!.get(frontOnly) ?? this.frontFaceByName!.get(frontOnly);
    }
    return undefined;
  }

  getCardsByNames(names: readonly string[]): Record<string, CompactCard> {
    const out: Record<string, CompactCard> = {};
    for (const rawName of names) {
      const normalized = rawName.trim().toLowerCase();
      if (!normalized || out[normalized]) continue;
      const found = this.getCardByName(normalized);
      if (found) out[normalized] = found;
    }
    return out;
  }

  getBasicLands(): Record<string, CompactCard> {
    return { ...this.basicLandsByName };
  }

  search(filter: SearchFilter, requestId = 0): SearchResponsePayload {
    const start = performance.now();

    const hasCiLock = filter.colorIdentity !== null;
    const allowedCiMask = hasCiLock ? colorArrayToMask(filter.colorIdentity!) : 0;

    const hasColorFilter = !filter.colorlessOnly && filter.colors.length > 0;
    const targetColorMask = hasColorFilter ? colorArrayToMask(filter.colors) : 0;

    let wantedTypeMask = 0;
    for (const typeName of filter.cardTypes) {
      wantedTypeMask |= CARD_TYPE_BIT[typeName.toLowerCase()] ?? 0;
    }

    const wantedRoleMask =
      filter.roles.length > 0 ? encodeRolesMask(filter.roles) : 0;

    const wantedThemesEncoded =
      filter.themes.length > 0 ? encodeThemesMask(filter.themes) : null;

    const wantedSubtypes =
      filter.subtypes.length > 0
        ? filter.subtypes.map((s) => s.trim().toLowerCase()).filter(Boolean)
        : [];

    const queryTokens = filter.query ? parseSearchQuery(filter.query) : [];
    const hasThemeQuery = filter.themeQuery.trim().length > 0;
    const themeIntent =
      hasThemeQuery || filter.themes.length > 0
        ? parseThemeIntent(filter.themeQuery, filter.themes)
        : null;
    const themeMatcher = prepareThemeMatcher(themeIntent);
    const defaultRoleReasons =
      filter.roles.length > 0
        ? filter.roles.map((r) => `Role: ${ROLE_BY_ID[r]?.label ?? r}`)
        : [];
    const useSynergySort =
      filter.sortBy === 'synergy' || (hasThemeQuery && filter.sortBy === 'edhrec');

    const matches: ScoredCardMatch[] = [];
    const cards = this.cards;
    const colorMasks = this.colorMasks;
    const ciMasks = this.ciMasks;
    const typeMasks = this.typeMasks;
    const roleMasks = this.roleMasks;
    const themeMaskLos = this.themeMaskLos;
    const themeMaskHis = this.themeMaskHis;
    const extraThemesByIndex = this.extraThemesByIndex;
    const nameLowers = this.nameLowers;
    const typeLineLowers = this.typeLineLowers;
    const subtypesLowers = this.subtypesLowers;
    const oracleLowers = this.oracleLowers;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i]!;

      // 1. Fast boolean & bitwise filters
      if (filter.commanderOnly && !card.isCommanderEligible) continue;
      if (filter.partnerType !== null && card.partnerType !== filter.partnerType) continue;

      const ciMask = ciMasks[i]!;
      if (hasCiLock && (ciMask & ~allowedCiMask) !== 0) continue;

      const colorMask = colorMasks[i]!;
      if (filter.colorlessOnly) {
        if (colorMask !== 0) continue;
      } else if (hasColorFilter) {
        switch (filter.colorMatchMode) {
          case 'exact':
            if (colorMask !== targetColorMask) continue;
            break;
          case 'at-most':
            if ((colorMask & ~targetColorMask) !== 0) continue;
            break;
          case 'identity-lock':
            if ((ciMask & ~targetColorMask) !== 0) continue;
            break;
          case 'include':
          default:
            if ((colorMask & targetColorMask) !== targetColorMask) continue;
            break;
        }
      }

      if (filter.cmcValue !== null) {
        const cmc = card.cmc;
        const target = filter.cmcValue;
        let cmcPass = true;
        switch (filter.cmcOperator) {
          case '=':
            cmcPass = cmc === target;
            break;
          case '<=':
            cmcPass = cmc <= target;
            break;
          case '>=':
            cmcPass = cmc >= target;
            break;
          case '<':
            cmcPass = cmc < target;
            break;
          case '>':
            cmcPass = cmc > target;
            break;
        }
        if (!cmcPass) continue;
      }

      if (filter.maxPriceUsd !== null) {
        if (card.priceUsd === null || card.priceUsd > filter.maxPriceUsd) continue;
      }

      if (wantedTypeMask !== 0 && (typeMasks[i]! & wantedTypeMask) === 0) continue;

      // 2. Role & explicit Theme pill filters (AND semantics via bitmasks)
      const roleMask = roleMasks[i]!;
      if (wantedRoleMask !== 0 && (roleMask & wantedRoleMask) !== wantedRoleMask) {
        continue;
      }

      const themeMaskLo = themeMaskLos[i]!;
      const themeMaskHi = themeMaskHis[i]!;
      const cardExtraThemes = extraThemesByIndex !== null ? (extraThemesByIndex.get(i) ?? null) : null;

      if (wantedThemesEncoded !== null) {
        if (
          (themeMaskLo & wantedThemesEncoded.lo) !== wantedThemesEncoded.lo ||
          (themeMaskHi & wantedThemesEncoded.hi) !== wantedThemesEncoded.hi
        ) {
          continue;
        }
        if (wantedThemesEncoded.extra !== null) {
          let allExtra = true;
          for (const t of wantedThemesEncoded.extra) {
            if (!cardExtraThemes || !cardExtraThemes.includes(t)) {
              allExtra = false;
              break;
            }
          }
          if (!allExtra) continue;
        }
      }

      // 3. Subtype filter (OR semantics across selected subtypes)
      if (wantedSubtypes.length > 0) {
        const subtypesLower = subtypesLowers[i]!;
        let anySubtypeMatch = false;
        for (const sub of wantedSubtypes) {
          if (subtypesLower.includes(sub)) {
            anySubtypeMatch = true;
            break;
          }
        }
        if (!anySubtypeMatch) continue;
      }

      // 4. Text query tokens (AND across tokens, OR across name/type/oracle)
      if (queryTokens.length > 0) {
        const nameLower = nameLowers[i]!;
        const typeLineLower = typeLineLowers[i]!;
        const oracleLower = oracleLowers[i]!;
        let allTokensMatch = true;
        for (const tok of queryTokens) {
          if (
            !nameLower.includes(tok) &&
            !typeLineLower.includes(tok) &&
            !oracleLower.includes(tok)
          ) {
            allTokensMatch = false;
            break;
          }
        }
        if (!allTokensMatch) continue;
      }

      // 5. Method A Theme Scoring & Match Reasons
      let synergyScore = 0;
      let matchedReasons: string[] | null = null;

      if (themeMatcher !== null) {
        const fastBitHit =
          (themeMaskLo & themeMatcher.anyThemeLo) !== 0 ||
          (themeMaskHi & themeMatcher.anyThemeHi) !== 0 ||
          (roleMask & themeMatcher.anyRoleMask) !== 0;

        if (!fastBitHit && !themeMatcher.hasAnyExtra && !themeMatcher.hasFallback) {
          if (hasThemeQuery) continue;
        } else {
          for (let t = 0; t < themeMatcher.themeChecks.length; t++) {
            const check = themeMatcher.themeChecks[t]!;
            if (matchesThemeCheck(themeMaskLo, themeMaskHi, cardExtraThemes, check)) {
              synergyScore += check.weight;
              if (!matchedReasons) matchedReasons = [];
              matchedReasons.push(check.reason);
            }
          }
          for (let r = 0; r < themeMatcher.roleChecks.length; r++) {
            const check = themeMatcher.roleChecks[r]!;
            if ((roleMask & check.mask) !== 0) {
              synergyScore += 15;
              if (!matchedReasons) matchedReasons = [];
              matchedReasons.push(check.reason);
            }
          }
          for (let f = 0; f < themeMatcher.fallbackChecks.length; f++) {
            const check = themeMatcher.fallbackChecks[f]!;
            if (
              typeLineLowers[i]!.includes(check.term) ||
              oracleLowers[i]!.includes(check.term) ||
              nameLowers[i]!.includes(check.term)
            ) {
              synergyScore += 18;
              if (!matchedReasons) matchedReasons = [];
              matchedReasons.push(check.reason);
            }
          }

          if (hasThemeQuery && synergyScore === 0) continue;

          if (synergyScore > 0) {
            if (themeMatcher.groupChecks.length > 1) {
              let groupsMatched = 0;
              for (let g = 0; g < themeMatcher.groupChecks.length; g++) {
                const group = themeMatcher.groupChecks[g]!;
                let hit =
                  (themeMaskLo & group.loMask) !== 0 ||
                  (themeMaskHi & group.hiMask) !== 0 ||
                  (roleMask & group.roleMask) !== 0;

                if (!hit && group.extraIds !== null && cardExtraThemes !== null) {
                  for (let e = 0; e < group.extraIds.length; e++) {
                    if (cardExtraThemes.includes(group.extraIds[e]!)) {
                      hit = true;
                      break;
                    }
                  }
                }
                if (!hit && group.fallbackTerm) {
                  hit =
                    typeLineLowers[i]!.includes(group.fallbackTerm) ||
                    oracleLowers[i]!.includes(group.fallbackTerm) ||
                    nameLowers[i]!.includes(group.fallbackTerm);
                }
                if (hit) groupsMatched++;
              }
              if (groupsMatched > 1) {
                synergyScore += (groupsMatched - 1) * 15;
              }
            }

            if (card.edhrecRank !== null) {
              const rankBonus = Math.max(0, 5 - Math.log10(card.edhrecRank + 1));
              synergyScore = Math.round((synergyScore + rankBonus) * 10) / 10;
            }
          }
        }
      }

      matches.push({
        card,
        synergyScore,
        matchedReasons: matchedReasons ?? defaultRoleReasons,
      });
    }

    // 6. Sort (skip sorting if catalog is already pre-sorted by EDHREC rank)
    if (!this.isPreSortedByEdhrec || filter.sortBy !== 'edhrec' || useSynergySort) {
      matches.sort((a, b) => compareMatches(a, b, filter.sortBy, useSynergySort));
    }

    const totalMatches = matches.length;
    const pageSize = Math.max(1, filter.pageSize);
    const totalPages = Math.max(1, Math.ceil(totalMatches / pageSize));
    const safePage = Math.min(Math.max(1, filter.page), totalPages);
    const startIdx = (safePage - 1) * pageSize;
    const pagedMatches = matches.slice(startIdx, startIdx + pageSize);

    const executionTimeMs = Math.round((performance.now() - start) * 100) / 100;

    return {
      requestId,
      matches: pagedMatches,
      totalMatches,
      page: safePage,
      pageSize,
      totalPages,
      executionTimeMs,
    };
  }
}
