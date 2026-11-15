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

const COLOR_BIT: Record<ManaColor, number> = {
  W: 1 << 0,
  U: 1 << 1,
  B: 1 << 2,
  R: 1 << 3,
  G: 1 << 4,
};

const ROLE_BIT: Record<FunctionalRole, number> = Object.fromEntries(
  FUNCTIONAL_ROLES.map((role, index) => [role, 1 << index]),
) as Record<FunctionalRole, number>;

const CARD_TYPE_BIT: Record<string, number> = Object.fromEntries(
  CARD_TYPE_OPTIONS.map((typeName, index) => [typeName.toLowerCase(), 1 << index]),
);

// Pack all known theme IDs into two 30-bit integers (supports up to 60 themes with zero Set allocations)
const THEME_INDEX_MAP = new Map<string, number>(
  THEME_METADATA.map((theme, index) => [theme.id, index]),
);
const ALL_KNOWN_THEME_IDS = new Set(THEME_METADATA.map((t) => t.id));

export function colorArrayToMask(colors: readonly ManaColor[]): number {
  let mask = 0;
  for (let i = 0; i < colors.length; i++) {
    mask |= COLOR_BIT[colors[i]!] ?? 0;
  }
  return mask;
}

function encodeRolesMask(roles: readonly FunctionalRole[]): number {
  let mask = 0;
  for (let i = 0; i < roles.length; i++) {
    mask |= ROLE_BIT[roles[i]!] ?? 0;
  }
  return mask;
}

function encodeThemesMask(themes: readonly string[]): {
  lo: number;
  hi: number;
  extra: string[] | null;
} {
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

  return { lo, hi, extra };
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

function matchesThemeCheck(item: PreparedCard, check: ThemeTermCheck): boolean {
  if (check.loMask !== 0 && (item.themeMaskLo & check.loMask) !== 0) return true;
  if (check.hiMask !== 0 && (item.themeMaskHi & check.hiMask) !== 0) return true;
  return (
    check.extraId !== null &&
    item.extraThemes !== null &&
    item.extraThemes.includes(check.extraId)
  );
}

function addTypeWordsToMask(leftSideLower: string): number {
  let typeMask = 0;
  let start = 0;
  const len = leftSideLower.length;
  while (start < len) {
    while (start < len && leftSideLower.charCodeAt(start) <= 32) start++;
    if (start >= len) break;
    let end = start;
    while (end < len && leftSideLower.charCodeAt(end) > 32) end++;
    const word = leftSideLower.slice(start, end);
    const bit = CARD_TYPE_BIT[word];
    if (bit) typeMask |= bit;
    start = end + 1;
  }
  return typeMask;
}

function extractTypeMaskAndSubtypes(typeLineLower: string): {
  typeMask: number;
  subtypesLower: string;
} {
  const splitIdx = typeLineLower.indexOf(' // ');
  if (splitIdx < 0) {
    const dashIdx = typeLineLower.indexOf('—');
    if (dashIdx < 0) {
      return { typeMask: addTypeWordsToMask(typeLineLower), subtypesLower: '' };
    }
    return {
      typeMask: addTypeWordsToMask(typeLineLower.slice(0, dashIdx)),
      subtypesLower: typeLineLower.slice(dashIdx + 1).trim(),
    };
  }

  let typeMask = 0;
  let subtypesLower = '';
  const faces = typeLineLower.split(' // ');
  for (let i = 0; i < faces.length; i++) {
    const face = faces[i]!;
    const dashIdx = face.indexOf('—');
    if (dashIdx < 0) {
      typeMask |= addTypeWordsToMask(face);
    } else {
      typeMask |= addTypeWordsToMask(face.slice(0, dashIdx));
      const sub = face.slice(dashIdx + 1).trim();
      if (sub) subtypesLower = subtypesLower ? `${subtypesLower} ${sub}` : sub;
    }
  }
  return { typeMask, subtypesLower };
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

interface PreparedCard {
  card: CompactCard;
  colorMask: number;
  ciMask: number;
  typeMask: number;
  roleMask: number;
  themeMaskLo: number;
  themeMaskHi: number;
  extraThemes: string[] | null;
  nameLower: string;
  typeLineLower: string;
  subtypesLower: string;
  oracleLower: string;
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
  private readonly prepared: PreparedCard[];
  private readonly cardById: Map<string, CompactCard>;
  private readonly cardByOracleId: Map<string, CompactCard>;
  private readonly basicLandsByName: Record<string, CompactCard>;
  private readonly isPreSortedByEdhrec: boolean;
  private cardByName: Map<string, CompactCard> | null = null;
  private frontFaceByName: Map<string, CompactCard> | null = null;

  constructor(cards: readonly CompactCard[]) {
    const len = cards.length;
    this.prepared = new Array<PreparedCard>(len);
    this.cardById = new Map<string, CompactCard>();
    this.cardByOracleId = new Map<string, CompactCard>();
    this.basicLandsByName = {};
    let preSorted = true;

    for (let i = 0; i < len; i++) {
      const card = cards[i]!;
      if (preSorted && i > 0 && compareEdhrec(cards[i - 1]!, card) > 0) {
        preSorted = false;
      }
      const typeLineLower = card.typeLine.toLowerCase();
      const { typeMask, subtypesLower } = extractTypeMaskAndSubtypes(typeLineLower);
      const themeEncoded = encodeThemesMask(card.themes);

      this.prepared[i] = {
        card,
        colorMask: colorArrayToMask(card.colors),
        ciMask: colorArrayToMask(card.colorIdentity),
        typeMask,
        roleMask: encodeRolesMask(card.roles),
        themeMaskLo: themeEncoded.lo,
        themeMaskHi: themeEncoded.hi,
        extraThemes: themeEncoded.extra,
        nameLower: card.name.toLowerCase(),
        typeLineLower,
        subtypesLower,
        oracleLower: card.oracleText.toLowerCase(),
      };

      this.cardById.set(card.id, card);
      if (card.oracleId && !this.cardByOracleId.has(card.oracleId)) {
        this.cardByOracleId.set(card.oracleId, card);
      }
      if (
        card.maxCopies === null &&
        CANONICAL_BASIC_LAND_NAMES.has(card.name) &&
        !this.basicLandsByName[card.name]
      ) {
        this.basicLandsByName[card.name] = card;
      }
    }
    this.isPreSortedByEdhrec = preSorted;
  }

  private ensureNameIndex(): void {
    if (this.cardByName && this.frontFaceByName) return;
    const byName = new Map<string, CompactCard>();
    const frontByName = new Map<string, CompactCard>();

    for (let i = 0; i < this.prepared.length; i++) {
      const item = this.prepared[i]!;
      if (!byName.has(item.nameLower)) {
        byName.set(item.nameLower, item.card);
      }
      const splitIdx = item.nameLower.indexOf(' // ');
      if (splitIdx > 0) {
        const frontLower = item.nameLower.slice(0, splitIdx).trim();
        if (frontLower && !frontByName.has(frontLower)) {
          frontByName.set(frontLower, item.card);
        }
      }
    }

    this.cardByName = byName;
    this.frontFaceByName = frontByName;
  }

  get totalCount(): number {
    return this.prepared.length;
  }

  private resolveCardByIdOrOracleId(id: string): CompactCard | undefined {
    return this.cardById.get(id) ?? this.cardByOracleId.get(id);
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

    for (let i = 0; i < this.prepared.length; i++) {
      const item = this.prepared[i]!;
      const card = item.card;

      // 1. Fast boolean & bitwise filters
      if (filter.commanderOnly && !card.isCommanderEligible) continue;
      if (filter.partnerType !== null && card.partnerType !== filter.partnerType) continue;

      if (hasCiLock && (item.ciMask & ~allowedCiMask) !== 0) continue;

      if (filter.colorlessOnly) {
        if (item.colorMask !== 0) continue;
      } else if (hasColorFilter) {
        switch (filter.colorMatchMode) {
          case 'exact':
            if (item.colorMask !== targetColorMask) continue;
            break;
          case 'at-most':
            if ((item.colorMask & ~targetColorMask) !== 0) continue;
            break;
          case 'identity-lock':
            if ((item.ciMask & ~targetColorMask) !== 0) continue;
            break;
          case 'include':
          default:
            if ((item.colorMask & targetColorMask) !== targetColorMask) continue;
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

      if (wantedTypeMask !== 0 && (item.typeMask & wantedTypeMask) === 0) continue;

      // 2. Role & explicit Theme pill filters (AND semantics via bitmasks)
      if (wantedRoleMask !== 0 && (item.roleMask & wantedRoleMask) !== wantedRoleMask) {
        continue;
      }

      if (wantedThemesEncoded !== null) {
        if (
          (item.themeMaskLo & wantedThemesEncoded.lo) !== wantedThemesEncoded.lo ||
          (item.themeMaskHi & wantedThemesEncoded.hi) !== wantedThemesEncoded.hi
        ) {
          continue;
        }
        if (wantedThemesEncoded.extra !== null) {
          let allExtra = true;
          for (const t of wantedThemesEncoded.extra) {
            if (!item.extraThemes || !item.extraThemes.includes(t)) {
              allExtra = false;
              break;
            }
          }
          if (!allExtra) continue;
        }
      }

      // 3. Subtype filter (OR semantics across selected subtypes)
      if (wantedSubtypes.length > 0) {
        let anySubtypeMatch = false;
        for (const sub of wantedSubtypes) {
          if (item.subtypesLower.includes(sub)) {
            anySubtypeMatch = true;
            break;
          }
        }
        if (!anySubtypeMatch) continue;
      }

      // 4. Text query tokens (AND across tokens, OR across name/type/oracle)
      if (queryTokens.length > 0) {
        let allTokensMatch = true;
        for (const tok of queryTokens) {
          if (
            !item.nameLower.includes(tok) &&
            !item.typeLineLower.includes(tok) &&
            !item.oracleLower.includes(tok)
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
          (item.themeMaskLo & themeMatcher.anyThemeLo) !== 0 ||
          (item.themeMaskHi & themeMatcher.anyThemeHi) !== 0 ||
          (item.roleMask & themeMatcher.anyRoleMask) !== 0;

        if (!fastBitHit && !themeMatcher.hasAnyExtra && !themeMatcher.hasFallback) {
          if (hasThemeQuery) continue;
        } else {
          for (let t = 0; t < themeMatcher.themeChecks.length; t++) {
            const check = themeMatcher.themeChecks[t]!;
            if (matchesThemeCheck(item, check)) {
              synergyScore += check.weight;
              if (!matchedReasons) matchedReasons = [];
              matchedReasons.push(check.reason);
            }
          }
          for (let r = 0; r < themeMatcher.roleChecks.length; r++) {
            const check = themeMatcher.roleChecks[r]!;
            if ((item.roleMask & check.mask) !== 0) {
              synergyScore += 15;
              if (!matchedReasons) matchedReasons = [];
              matchedReasons.push(check.reason);
            }
          }
          for (let f = 0; f < themeMatcher.fallbackChecks.length; f++) {
            const check = themeMatcher.fallbackChecks[f]!;
            if (
              item.typeLineLower.includes(check.term) ||
              item.oracleLower.includes(check.term) ||
              item.nameLower.includes(check.term)
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
                  (item.themeMaskLo & group.loMask) !== 0 ||
                  (item.themeMaskHi & group.hiMask) !== 0 ||
                  (item.roleMask & group.roleMask) !== 0;

                if (!hit && group.extraIds !== null && item.extraThemes !== null) {
                  for (let e = 0; e < group.extraIds.length; e++) {
                    if (item.extraThemes.includes(group.extraIds[e]!)) {
                      hit = true;
                      break;
                    }
                  }
                }
                if (!hit && group.fallbackTerm) {
                  hit =
                    item.typeLineLower.includes(group.fallbackTerm) ||
                    item.oracleLower.includes(group.fallbackTerm) ||
                    item.nameLower.includes(group.fallbackTerm);
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
