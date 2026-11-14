import {
  getCombinedColorIdentity,
  getMaxAllowedCopies,
  isCardWithinColorIdentity,
} from '../search/commanderRules.js';
import type { CompactCard, FunctionalRole, ManaColor } from '../types/card.js';
import type { DeckDraft } from '../types/deck.js';

export type ManaPoolColor = ManaColor | 'C';

export const ROLE_TARGETS: ReadonlyArray<{
  role: FunctionalRole | 'lands';
  label: string;
  targetMin: number;
  targetMax: number;
  recommended: number;
}> = [
  { role: 'lands', label: 'Lands', targetMin: 34, targetMax: 38, recommended: 36 },
  { role: 'ramp', label: 'Ramp', targetMin: 8, targetMax: 12, recommended: 10 },
  { role: 'draw', label: 'Card Draw', targetMin: 8, targetMax: 12, recommended: 10 },
  { role: 'removal', label: 'Targeted Removal', targetMin: 6, targetMax: 10, recommended: 8 },
  { role: 'wipe', label: 'Board Wipes', targetMin: 2, targetMax: 4, recommended: 3 },
  { role: 'tutor', label: 'Tutors', targetMin: 1, targetMax: 4, recommended: 2 },
  { role: 'recursion', label: 'Recursion', targetMin: 2, targetMax: 5, recommended: 3 },
  { role: 'protection', label: 'Protection', targetMin: 2, targetMax: 5, recommended: 3 },
] as const;

export interface CmcBucket {
  label: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7+';
  total: number;
  creatures: number;
  nonCreatures: number;
}

export type ColorDistribution = Record<ManaPoolColor, number>;

export interface DeckLegalityIssue {
  type: 'deck-size' | 'color-identity' | 'copy-limit' | 'missing-commander';
  severity: 'warning' | 'error';
  message: string;
  cardIds?: string[];
}

export interface DeckAnalyticsReport {
  commanderCount: number;
  mainboardCount: number;
  totalCount: number;
  sideboardCount: number;
  landCount: number;
  nonLandCount: number;
  cmcBuckets: CmcBucket[];
  averageCmc: number;
  averageCmcWithLands: number;
  pipCounts: ColorDistribution;
  sourceCounts: ColorDistribution;
  totalPips: number;
  totalSources: number;
  roleCounts: Record<FunctionalRole | 'lands', number>;
  typeCounts: Record<string, number>;
  illegalColorCardIds: string[];
  overCopyLimitCardIds: string[];
  issues: DeckLegalityIssue[];
  isCommanderLegal100: boolean;
}

const MANA_POOL_COLORS: readonly ManaPoolColor[] = ['W', 'U', 'B', 'R', 'G', 'C'];
const RE_MANA_TOKEN = /\{([^}]+)\}/g;
const RE_ADD_LINE = /\badd\b[^.\n]*/gi;

const BASIC_COLOR_TO_LAND: Readonly<Record<ManaPoolColor, string>> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
  C: 'Wastes',
};

function createEmptyColorDist(): ColorDistribution {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
}

function getFrontFaceTypeLower(typeLine: string): string {
  const splitIdx = typeLine.indexOf(' // ');
  return (splitIdx >= 0 ? typeLine.slice(0, splitIdx) : typeLine).toLowerCase();
}

export function isPrimaryLandCard(card: CompactCard): boolean {
  return getFrontFaceTypeLower(card.typeLine).includes('land');
}

function isCreatureCard(card: CompactCard): boolean {
  return getFrontFaceTypeLower(card.typeLine).includes('creature');
}

function extractManaPips(manaCost: string, target: ColorDistribution, qty: number): number {
  if (!manaCost) return 0;
  let totalAdded = 0;
  RE_MANA_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RE_MANA_TOKEN.exec(manaCost)) !== null) {
    const raw = match[1];
    if (!raw) continue;
    const parts = raw.toUpperCase().split('/');
    for (const part of parts) {
      if (part === 'W' || part === 'U' || part === 'B' || part === 'R' || part === 'G' || part === 'C') {
        target[part] += qty;
        totalAdded += qty;
      }
    }
  }
  return totalAdded;
}

function detectProducedColors(
  card: CompactCard,
  allowedIdentity: readonly ManaColor[],
): Set<ManaPoolColor> {
  const produced = new Set<ManaPoolColor>();
  const typeLower = card.typeLine.toLowerCase();
  const isLand = typeLower.includes('land');
  const isRamp = card.roles.includes('ramp');

  if (!isLand && !isRamp) {
    return produced;
  }

  // Basic land subtypes implicitly tap for their corresponding mana color
  if (typeLower.includes('plains')) produced.add('W');
  if (typeLower.includes('island')) produced.add('U');
  if (typeLower.includes('swamp')) produced.add('B');
  if (typeLower.includes('mountain')) produced.add('R');
  if (typeLower.includes('forest')) produced.add('G');

  const oracleLower = card.oracleText.toLowerCase();

  // "Any color" producers / fetchlands
  const anyColorFallback: readonly ManaColor[] =
    allowedIdentity.length > 0 ? allowedIdentity : ['W', 'U', 'B', 'R', 'G'];

  if (
    oracleLower.includes('mana of any color') ||
    oracleLower.includes('mana of any type') ||
    oracleLower.includes('in any combination of colors') ||
    oracleLower.includes("commander's color identity") ||
    oracleLower.includes('basic land card')
  ) {
    for (const c of anyColorFallback) {
      produced.add(c);
    }
  }

  // Specific named basic fetch references ("search your library for a Plains or Island card")
  if (oracleLower.includes('search your library for')) {
    if (oracleLower.includes('plains')) produced.add('W');
    if (oracleLower.includes('island')) produced.add('U');
    if (oracleLower.includes('swamp')) produced.add('B');
    if (oracleLower.includes('mountain')) produced.add('R');
    if (oracleLower.includes('forest')) produced.add('G');
  }

  // Explicit "Add {X}" clauses
  RE_ADD_LINE.lastIndex = 0;
  let addMatch: RegExpExecArray | null;
  while ((addMatch = RE_ADD_LINE.exec(card.oracleText)) !== null) {
    const clause = addMatch[0];
    RE_MANA_TOKEN.lastIndex = 0;
    let symMatch: RegExpExecArray | null;
    while ((symMatch = RE_MANA_TOKEN.exec(clause)) !== null) {
      const sym = symMatch[1]?.toUpperCase();
      if (sym === 'W' || sym === 'U' || sym === 'B' || sym === 'R' || sym === 'G' || sym === 'C') {
        produced.add(sym);
      }
    }
  }

  return produced;
}

/**
 * Computes full Commander deck analytics across the Command Zone + 99 mainboard.
 * Cards in `deck.sideboard` ("Considering") are intentionally excluded from 100-card metrics.
 */
export function computeDeckAnalytics(deck: DeckDraft): DeckAnalyticsReport {
  const commanderCount = deck.commanders.length;
  const allowedIdentity = getCombinedColorIdentity(deck.commanders);

  const cmcBuckets: CmcBucket[] = [
    { label: '0', total: 0, creatures: 0, nonCreatures: 0 },
    { label: '1', total: 0, creatures: 0, nonCreatures: 0 },
    { label: '2', total: 0, creatures: 0, nonCreatures: 0 },
    { label: '3', total: 0, creatures: 0, nonCreatures: 0 },
    { label: '4', total: 0, creatures: 0, nonCreatures: 0 },
    { label: '5', total: 0, creatures: 0, nonCreatures: 0 },
    { label: '6', total: 0, creatures: 0, nonCreatures: 0 },
    { label: '7+', total: 0, creatures: 0, nonCreatures: 0 },
  ];

  const pipCounts = createEmptyColorDist();
  const sourceCounts = createEmptyColorDist();
  const roleCounts: Record<FunctionalRole | 'lands', number> = {
    lands: 0,
    ramp: 0,
    draw: 0,
    removal: 0,
    wipe: 0,
    tutor: 0,
    recursion: 0,
    protection: 0,
  };
  const typeCounts: Record<string, number> = {
    Commander: commanderCount,
    Creature: 0,
    Instant: 0,
    Sorcery: 0,
    Artifact: 0,
    Enchantment: 0,
    Planeswalker: 0,
    Land: 0,
    Battle: 0,
  };

  const illegalColorCardIds: string[] = [];
  const overCopyLimitCardIds: string[] = [];

  let mainboardCount = 0;
  let landCount = 0;
  let nonLandCount = 0;
  let nonLandCmcSum = 0;
  let allCardCmcSum = 0;
  let totalPips = 0;

  // Include commanders in pip demand and total CMC
  for (const cmd of deck.commanders) {
    allCardCmcSum += cmd.cmc;
    if (!isPrimaryLandCard(cmd)) {
      nonLandCmcSum += cmd.cmc;
    }
    totalPips += extractManaPips(cmd.manaCost, pipCounts, 1);
  }

  for (const entry of Object.values(deck.mainboard)) {
    const { card, quantity } = entry;
    if (quantity <= 0) continue;

    mainboardCount += quantity;
    allCardCmcSum += card.cmc * quantity;

    const frontType = getFrontFaceTypeLower(card.typeLine);
    const primaryIsLand = isPrimaryLandCard(card);

    if (primaryIsLand) {
      landCount += quantity;
      roleCounts.lands += quantity;
      typeCounts.Land = (typeCounts.Land ?? 0) + quantity;
    } else {
      nonLandCount += quantity;
      nonLandCmcSum += card.cmc * quantity;

      const bucketIdx = Math.min(7, Math.max(0, Math.floor(card.cmc)));
      const bucket = cmcBuckets[bucketIdx]!;
      bucket.total += quantity;
      if (isCreatureCard(card)) {
        bucket.creatures += quantity;
      } else {
        bucket.nonCreatures += quantity;
      }

      if (frontType.includes('creature')) typeCounts.Creature = (typeCounts.Creature ?? 0) + quantity;
      else if (frontType.includes('instant')) typeCounts.Instant = (typeCounts.Instant ?? 0) + quantity;
      else if (frontType.includes('sorcery')) typeCounts.Sorcery = (typeCounts.Sorcery ?? 0) + quantity;
      else if (frontType.includes('artifact')) typeCounts.Artifact = (typeCounts.Artifact ?? 0) + quantity;
      else if (frontType.includes('enchantment')) typeCounts.Enchantment = (typeCounts.Enchantment ?? 0) + quantity;
      else if (frontType.includes('planeswalker')) typeCounts.Planeswalker = (typeCounts.Planeswalker ?? 0) + quantity;
      else if (frontType.includes('battle')) typeCounts.Battle = (typeCounts.Battle ?? 0) + quantity;
    }

    totalPips += extractManaPips(card.manaCost, pipCounts, quantity);

    const produced = detectProducedColors(card, allowedIdentity);
    for (const col of produced) {
      sourceCounts[col] += quantity;
    }

    for (const role of card.roles) {
      roleCounts[role] += quantity;
    }

    if (commanderCount > 0 && !isCardWithinColorIdentity(card, allowedIdentity)) {
      illegalColorCardIds.push(card.id);
    }

    const maxAllowed = getMaxAllowedCopies(card);
    if (quantity > maxAllowed) {
      overCopyLimitCardIds.push(card.id);
    }
  }

  let sideboardCount = 0;
  for (const entry of Object.values(deck.sideboard)) {
    if (entry.quantity > 0) {
      sideboardCount += entry.quantity;
    }
  }

  let totalSources = 0;
  for (const c of MANA_POOL_COLORS) {
    totalSources += sourceCounts[c];
  }

  const totalCount = commanderCount + mainboardCount;
  const nonLandTotalWithCmd = nonLandCount + commanderCount;
  const averageCmc =
    nonLandTotalWithCmd > 0
      ? Math.round((nonLandCmcSum / nonLandTotalWithCmd) * 100) / 100
      : 0;
  const averageCmcWithLands =
    totalCount > 0 ? Math.round((allCardCmcSum / totalCount) * 100) / 100 : 0;

  const issues: DeckLegalityIssue[] = [];
  if (commanderCount === 0) {
    issues.push({
      type: 'missing-commander',
      severity: 'warning',
      message: 'No Commander selected in Command Zone yet.',
    });
  }
  if (totalCount !== 100) {
    issues.push({
      type: 'deck-size',
      severity: totalCount > 100 ? 'error' : 'warning',
      message:
        totalCount < 100
          ? `Deck needs ${100 - totalCount} more card${100 - totalCount === 1 ? '' : 's'} to reach 100.`
          : `Deck has ${totalCount - 100} card${totalCount - 100 === 1 ? '' : 's'} over the 100-card limit.`,
    });
  }
  if (illegalColorCardIds.length > 0) {
    issues.push({
      type: 'color-identity',
      severity: 'error',
      message: `${illegalColorCardIds.length} card${illegalColorCardIds.length === 1 ? ' is' : 's are'} outside your Commander color identity.`,
      cardIds: illegalColorCardIds,
    });
  }
  if (overCopyLimitCardIds.length > 0) {
    issues.push({
      type: 'copy-limit',
      severity: 'error',
      message: `${overCopyLimitCardIds.length} card${overCopyLimitCardIds.length === 1 ? ' exceeds' : 's exceed'} Commander copy limits.`,
      cardIds: overCopyLimitCardIds,
    });
  }

  const isCommanderLegal100 =
    commanderCount >= 1 &&
    commanderCount <= 2 &&
    totalCount === 100 &&
    illegalColorCardIds.length === 0 &&
    overCopyLimitCardIds.length === 0;

  return {
    commanderCount,
    mainboardCount,
    totalCount,
    sideboardCount,
    landCount,
    nonLandCount,
    cmcBuckets,
    averageCmc,
    averageCmcWithLands,
    pipCounts,
    sourceCounts,
    totalPips,
    totalSources,
    roleCounts,
    typeCounts,
    illegalColorCardIds,
    overCopyLimitCardIds,
    issues,
    isCommanderLegal100,
  };
}

/**
 * Computes how many of each legal basic land to add so the deck reaches `targetTotal` (100),
 * distributed proportionally by the deck's colored mana pip demand using Hamilton apportionment.
 */
export function computeBasicLandAutoFill(
  deck: DeckDraft,
  basicLands: Record<string, CompactCard>,
  targetTotal = 100,
): Array<{ card: CompactCard; addQuantity: number }> {
  const analytics = computeDeckAnalytics(deck);
  const slotsNeeded = Math.max(0, targetTotal - analytics.totalCount);
  if (slotsNeeded === 0) return [];

  const identity = getCombinedColorIdentity(deck.commanders);
  let targetColors: ManaPoolColor[] = [];

  if (deck.commanders.length > 0) {
    targetColors = identity.length > 0 ? [...identity] : ['C'];
  } else {
    const activePipColors = (['W', 'U', 'B', 'R', 'G'] as ManaColor[]).filter(
      (c) => analytics.pipCounts[c] > 0,
    );
    targetColors = activePipColors.length > 0 ? activePipColors : ['W', 'U', 'B', 'R', 'G'];
  }

  const candidates: Array<{ color: ManaPoolColor; card: CompactCard; weight: number }> = [];
  for (const col of targetColors) {
    const landName = BASIC_COLOR_TO_LAND[col];
    const card = basicLands[landName];
    if (card) {
      candidates.push({ color: col, card, weight: analytics.pipCounts[col] });
    }
  }

  if (candidates.length === 0) return [];

  const totalWeight = candidates.reduce((acc, item) => acc + item.weight, 0);
  const useEqualWeights = totalWeight <= 0;
  const effectiveDenominator = useEqualWeights ? candidates.length : totalWeight;

  const allocations = candidates.map((item) => {
    const w = useEqualWeights ? 1 : item.weight;
    const exact = (slotsNeeded * w) / effectiveDenominator;
    const base = Math.floor(exact);
    return {
      card: item.card,
      addQuantity: base,
      remainder: exact - base,
      weight: w,
    };
  });

  let distributed = allocations.reduce((acc, a) => acc + a.addQuantity, 0);
  const byRemainder = [...allocations].sort(
    (a, b) => b.remainder - a.remainder || b.weight - a.weight,
  );

  let idx = 0;
  while (distributed < slotsNeeded && byRemainder.length > 0) {
    const pick = byRemainder[idx % byRemainder.length]!;
    pick.addQuantity += 1;
    distributed += 1;
    idx += 1;
  }

  return allocations
    .filter((a) => a.addQuantity > 0)
    .map(({ card, addQuantity }) => ({ card, addQuantity }));
}
