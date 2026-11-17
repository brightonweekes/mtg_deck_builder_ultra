import { ROLE_BY_ID, THEME_BY_ID } from '../config/searchConfig.js';
import { isPrimaryLandCard } from '../deck/deckAnalytics.js';
import type { CompactCard, ManaColor } from '../types/card.js';
import type { DeckCardEntry, DeckDraft } from '../types/deck.js';
import type {
  BudgetSwapCandidate,
  BudgetSwapConfidence,
  BudgetSwapScanRequest,
  BudgetSwapTargetResult,
} from '../types/search.js';
import { getCombinedColorIdentity } from './commanderRules.js';
import {
  buildRippleIndex,
  extractRippleProfile,
  prepareRippleMatcher,
  scoreRippleCard,
  type RippleIndex,
  type RippleMatcher,
} from './rippleEngine.js';

export const SWAP_EFFECT_BITS = {
  COUNTERSPELL: 0,
  MASS_BOUNCE: 1,
  MASS_DESTROY_EXILE: 2,
  SPOT_BOUNCE: 3,
  SPOT_DESTROY_EXILE: 4,
  ANY_TUTOR: 5,
  TYPE_TUTOR: 6,
  LAND_RAMP_SEARCH: 7,
  EXTRA_LAND_DROP: 8,
  MANA_PRODUCER: 9,
  COST_REDUCER: 10,
  OVERRUN_PUMP: 11,
  TOKEN_MULTIPLIER: 12,
  TOKEN_CLONE_POPULATE: 13,
  COUNTER_MULTIPLIER: 14,
  TEAM_PROTECTION: 15,
  TAX_REACTION_ENGINE: 16,
  DRAW_ENGINE: 17,
  SAC_FOR_MANA: 18,
  REANIMATE_EFFECT: 19,
  EXTRA_COMBAT: 20,
  TRIGGER_DOUBLER: 21,
} as const;

type SwapEffectBit = (typeof SWAP_EFFECT_BITS)[keyof typeof SWAP_EFFECT_BITS];

const EFFECT_LABELS: Readonly<Record<SwapEffectBit, string>> = {
  [SWAP_EFFECT_BITS.COUNTERSPELL]: 'Counterspell',
  [SWAP_EFFECT_BITS.MASS_BOUNCE]: 'Mass Bounce',
  [SWAP_EFFECT_BITS.MASS_DESTROY_EXILE]: 'Board Wipe',
  [SWAP_EFFECT_BITS.SPOT_BOUNCE]: 'Bounce Removal',
  [SWAP_EFFECT_BITS.SPOT_DESTROY_EXILE]: 'Targeted Removal',
  [SWAP_EFFECT_BITS.ANY_TUTOR]: 'Any-Card Tutor',
  [SWAP_EFFECT_BITS.TYPE_TUTOR]: 'Type Tutor',
  [SWAP_EFFECT_BITS.LAND_RAMP_SEARCH]: 'Land Ramp',
  [SWAP_EFFECT_BITS.EXTRA_LAND_DROP]: 'Extra Land Drops',
  [SWAP_EFFECT_BITS.MANA_PRODUCER]: 'Mana Producer',
  [SWAP_EFFECT_BITS.COST_REDUCER]: 'Cost Reduction',
  [SWAP_EFFECT_BITS.OVERRUN_PUMP]: 'Team Finisher',
  [SWAP_EFFECT_BITS.TOKEN_MULTIPLIER]: 'Token Multiplier',
  [SWAP_EFFECT_BITS.TOKEN_CLONE_POPULATE]: 'Token Copy',
  [SWAP_EFFECT_BITS.COUNTER_MULTIPLIER]: 'Counter Multiplier',
  [SWAP_EFFECT_BITS.TEAM_PROTECTION]: 'Team Protection',
  [SWAP_EFFECT_BITS.TAX_REACTION_ENGINE]: 'Opponent Trigger',
  [SWAP_EFFECT_BITS.DRAW_ENGINE]: 'Card Advantage',
  [SWAP_EFFECT_BITS.SAC_FOR_MANA]: 'Sac-for-Mana Outlet',
  [SWAP_EFFECT_BITS.REANIMATE_EFFECT]: 'Reanimation',
  [SWAP_EFFECT_BITS.EXTRA_COMBAT]: 'Extra Combat',
  [SWAP_EFFECT_BITS.TRIGGER_DOUBLER]: 'Trigger Doubler',
};

// Primary type bits
const PTYPE_CREATURE = 1 << 0;
const PTYPE_ARTIFACT = 1 << 1;
const PTYPE_ENCHANTMENT = 1 << 2;
const PTYPE_INSTANT = 1 << 3;
const PTYPE_SORCERY = 1 << 4;
const PTYPE_PLANESWALKER = 1 << 5;
const PTYPE_LAND = 1 << 6;

// Land mana bits (fits Uint8Array)
const LMANA_W = 1 << 0;
const LMANA_U = 1 << 1;
const LMANA_B = 1 << 2;
const LMANA_R = 1 << 3;
const LMANA_G = 1 << 4;
const LMANA_ANY = 1 << 5;
const LMANA_COLORLESS = 1 << 6;
const LMANA_TRIBAL_RESTRICTED = 1 << 7;
const LMANA_WUBRG_MASK = LMANA_W | LMANA_U | LMANA_B | LMANA_R | LMANA_G;

// Land structure flags (fits Uint8Array)
const LFLAG_PURE_LAND = 1 << 0;
const LFLAG_MDFC_LAND = 1 << 1;
const LFLAG_BASIC_LAND = 1 << 2;
const LFLAG_ENTERS_TAPPED_ALWAYS = 1 << 3;
const LFLAG_HAS_BASIC_SUBTYPES = 1 << 4;
const LFLAG_ARTIFACT_ONLY_BOUNCE = 1 << 5;

const COLOR_TO_LAND_BIT: Readonly<Record<ManaColor, number>> = {
  W: LMANA_W,
  U: LMANA_U,
  B: LMANA_B,
  R: LMANA_R,
  G: LMANA_G,
};

const LAND_COLOR_LIST: readonly ManaColor[] = ['W', 'U', 'B', 'R', 'G'];

const RE_BASIC_LAND = /\bbasic\b[^.\n]*\bland\b/i;
const RE_COUNTERSPELL = /\bcounter target\b[^.\n]*\bspell\b/;
const RE_MASS_BOUNCE =
  /\breturn\b[^.\n]*\b(?:all|each)\b[^.\n]*\b(?:creature|nonland|permanent|artifact|enchantment)s?\b[^.\n]*\bto (?:their|its) owners?(?:'s|')? hands?\b/;
const RE_MASS_WIPE =
  /\b(?:destroy|exile) all\b|\beach creature gets -\d+\/-\d+|\bdeals \d+ damage to each creature\b/;
const RE_SPOT_BOUNCE = /\breturn target\b[^.\n]*\bto (?:its|their) owners?(?:'s|')? hands?\b/;
const RE_SPOT_REMOVAL = /\b(?:destroy|exile) target\b/;
const RE_ANY_TUTOR = /\bsearch your library for a card\b/;
const RE_TYPE_TUTOR =
  /\bsearch your library for (?:a|an|up to [^.]{1,14}) (?:creature|artifact|enchantment|instant|sorcery|planeswalker) card\b/;
const RE_LAND_RAMP =
  /\bsearch your library for (?:a|an|up to [^.]{1,14}) (?:basic )?(?:land|plains|island|swamp|mountain|forest) card\b/;
const RE_EXTRA_LAND = /\badditional land\b/;
const RE_MANA_PRODUCER = /\{t\}[^:\n]*:\s*add\b|\badd (?:one|two|three|\{)[^.\n]*mana\b/;
const RE_COST_REDUCER =
  /\bspells? you cast cost \{?\d+\}? less|\b(?:creature|instant|sorcery|artifact|enchantment) spells[^.\n]*cost \{?\d+\}? less/;
const RE_OVERRUN_PUMP = /\bcreatures you control get \+[\dx]+\/\+[\dx]+\b/;
const RE_TOKEN_MULTIPLIER =
  /\bwould create\b[^.\n]*\btokens?\b[^.\n]*\binstead\b|\bcreate twice that many\b|\btwice as many[^.\n]*tokens?\b|\bfor each token created\b/;
const RE_TOKEN_CLONE = /\bcreate a token that's a copy\b|\bpopulate\b/;
const RE_COUNTER_MULTIPLIER =
  /\bwould (?:put|be put)\b[^.\n]*\+1\/\+1 counter[^.\n]*\binstead\b|\btwice that many \+1\/\+1 counters\b|\ban additional \+1\/\+1 counter\b|\bdouble the number of [^+.\n]*counters\b/;
const RE_TEAM_PROTECTION =
  /\b(?:permanents|creatures) you control gain (?:hexproof|indestructible|shroud|protection)|\bphase out\b|\bdamage that would be dealt to you is prevented\b/;
const RE_TAX_REACTION = /\bwhenever an opponent (?:casts|draws|plays)\b/;
const RE_DRAW_ENGINE =
  /\bdraw (?:two|three|four|\d+) cards?\b|\bwhenever [^.]{0,60} draw a card\b|\bat the beginning of your [^.]{0,30}, draw\b/;
const RE_SAC_FOR_MANA = /\bsacrifice (?:a|another) creature[^:.\n]*:\s*add\b/;
const RE_REANIMATE =
  /\breturn target creature card from [^.\n]*graveyard to the battlefield\b|\bput [^.]{0,40} from [^.\n]*graveyard onto the battlefield\b/;
const RE_EXTRA_COMBAT = /\badditional combat phase\b/;
const RE_TRIGGER_DOUBLER = /causes a triggered ability[^.\n]*trigger an additional time/;

const RE_LAND_PLAINS = /\bplains\b|\{w\}|\bwhite mana\b/;
const RE_LAND_ISLAND = /\bisland\b|\{u\}|\bblue mana\b/;
const RE_LAND_SWAMP = /\bswamp\b|\{b\}|\bblack mana\b/;
const RE_LAND_MOUNTAIN = /\bmountain\b|\{r\}|\bred mana\b/;
const RE_LAND_FOREST = /\bforest\b|\{g\}|\bgreen mana\b/;
const RE_ENTERS_TAPPED_ALWAYS =
  /\benters (?:the battlefield )?tapped\b(?! unless)|\bput (?:it|that card|those cards) onto the battlefield tapped\b/;
const RE_BASIC_SUBTYPES = /\b(?:plains|island|swamp|mountain|forest)\b/;
const RE_TRIBAL_RESTRICTED_MANA =
  /spend this mana only to cast (?:a |an )?(?:creature|chosen type|ally|sliver|dragon|angel|demon|elf|goblin|wizard|zombie|vampire|merfolk|pirate)/;
const RE_ARTIFACT_ONLY_BOUNCE = /\ball artifacts\b[^.\n]*\bto (?:their|its) owners?(?:'s|')? hands?\b/;

export interface BudgetSwapIndex {
  effectMasks: Uint32Array;
  landManaMasks: Uint8Array;
  landFlags: Uint8Array;
  primaryTypeMasks: Uint8Array;
  roleMasks: Uint8Array;
}

const ROLE_BIT_BY_NAME: Record<string, number> = {
  ramp: 1 << 0,
  draw: 1 << 1,
  removal: 1 << 2,
  wipe: 1 << 3,
  tutor: 1 << 4,
  recursion: 1 << 5,
  protection: 1 << 6,
};

function popcount32(x: number): number {
  let n = x | 0;
  let c = 0;
  while (n !== 0) {
    n &= n - 1;
    c++;
  }
  return c;
}

function encodePrimaryTypeMask(typeLower: string): number {
  let mask = 0;
  if (typeLower.includes('creature')) mask |= PTYPE_CREATURE;
  if (typeLower.includes('artifact')) mask |= PTYPE_ARTIFACT;
  if (typeLower.includes('enchantment')) mask |= PTYPE_ENCHANTMENT;
  if (typeLower.includes('instant')) mask |= PTYPE_INSTANT;
  if (typeLower.includes('sorcery')) mask |= PTYPE_SORCERY;
  if (typeLower.includes('planeswalker')) mask |= PTYPE_PLANESWALKER;
  if (typeLower.includes('land')) mask |= PTYPE_LAND;
  return mask;
}

function inferLandManaMask(cleanLower: string, typeLower: string): number {
  let mask = 0;
  const lines = cleanLower.split('\n');
  for (let l = 0; l < lines.length; l++) {
    const line = lines[l]!;
    if (!line) continue;

    if (
      line.includes('mana of any color') ||
      line.includes('mana of any type') ||
      line.includes('in any combination of colors') ||
      line.includes("commander's color identity") ||
      (line.includes('search your library') &&
        line.includes('basic land card') &&
        !line.includes('controller'))
    ) {
      mask |= LMANA_ANY | LMANA_WUBRG_MASK;
    }

    if (line.includes('add ') || (line.includes('search your library') && !line.includes('controller'))) {
      if (RE_LAND_PLAINS.test(line)) mask |= LMANA_W;
      if (RE_LAND_ISLAND.test(line)) mask |= LMANA_U;
      if (RE_LAND_SWAMP.test(line)) mask |= LMANA_B;
      if (RE_LAND_MOUNTAIN.test(line)) mask |= LMANA_R;
      if (RE_LAND_FOREST.test(line)) mask |= LMANA_G;
      if (line.includes('{c}')) mask |= LMANA_COLORLESS;
    }
  }

  if (RE_LAND_PLAINS.test(typeLower)) mask |= LMANA_W;
  if (RE_LAND_ISLAND.test(typeLower)) mask |= LMANA_U;
  if (RE_LAND_SWAMP.test(typeLower)) mask |= LMANA_B;
  if (RE_LAND_MOUNTAIN.test(typeLower)) mask |= LMANA_R;
  if (RE_LAND_FOREST.test(typeLower)) mask |= LMANA_G;

  if (RE_TRIBAL_RESTRICTED_MANA.test(cleanLower)) {
    mask |= LMANA_TRIBAL_RESTRICTED;
  }

  return mask;
}

function formatLandMaskColors(mask: number): string {
  const cols: string[] = [];
  for (const col of LAND_COLOR_LIST) {
    if ((mask & COLOR_TO_LAND_BIT[col]) !== 0) cols.push(col);
  }
  return cols.join('/');
}

/**
 * Builds lightweight per-card bitmasks (`~300 KB` for 32.6k cards) used for
 * fast same-job Budget Swap scoring.
 */
export function buildBudgetSwapIndex(
  cards: readonly CompactCard[],
  rippleIndex?: RippleIndex,
): BudgetSwapIndex {
  const len = cards.length;
  const rIdx = rippleIndex ?? buildRippleIndex(cards);
  const effectMasks = new Uint32Array(len);
  const landManaMasks = new Uint8Array(len);
  const landFlags = new Uint8Array(len);
  const primaryTypeMasks = new Uint8Array(len);
  const roleMasks = new Uint8Array(len);

  for (let i = 0; i < len; i++) {
    const card = cards[i]!;
    const cleanLower = rIdx.cleanLowers[i] ?? card.oracleText.toLowerCase();
    const typeLower = rIdx.typeLowers[i] ?? card.typeLine.toLowerCase();

    primaryTypeMasks[i] = encodePrimaryTypeMask(typeLower);

    let rMask = 0;
    for (let r = 0; r < card.roles.length; r++) {
      rMask |= ROLE_BIT_BY_NAME[card.roles[r]!] ?? 0;
    }
    roleMasks[i] = rMask;

    let eff = 0;
    if (RE_COUNTERSPELL.test(cleanLower)) eff |= 1 << SWAP_EFFECT_BITS.COUNTERSPELL;
    if (RE_MASS_BOUNCE.test(cleanLower)) eff |= 1 << SWAP_EFFECT_BITS.MASS_BOUNCE;
    if (RE_MASS_WIPE.test(cleanLower)) eff |= 1 << SWAP_EFFECT_BITS.MASS_DESTROY_EXILE;
    if (RE_SPOT_BOUNCE.test(cleanLower)) {
      if (cleanLower.includes('overload')) {
        eff |= 1 << SWAP_EFFECT_BITS.MASS_BOUNCE;
      } else {
        eff |= 1 << SWAP_EFFECT_BITS.SPOT_BOUNCE;
      }
    }
    if (RE_SPOT_REMOVAL.test(cleanLower) && (eff & (1 << SWAP_EFFECT_BITS.MASS_DESTROY_EXILE)) === 0) {
      eff |= 1 << SWAP_EFFECT_BITS.SPOT_DESTROY_EXILE;
    }
    if (RE_ANY_TUTOR.test(cleanLower)) eff |= 1 << SWAP_EFFECT_BITS.ANY_TUTOR;
    if (RE_TYPE_TUTOR.test(cleanLower)) eff |= 1 << SWAP_EFFECT_BITS.TYPE_TUTOR;
    if (!cleanLower.includes('controller may search') && RE_LAND_RAMP.test(cleanLower)) {
      eff |= 1 << SWAP_EFFECT_BITS.LAND_RAMP_SEARCH;
    }
    if (RE_EXTRA_LAND.test(cleanLower)) eff |= 1 << SWAP_EFFECT_BITS.EXTRA_LAND_DROP;
    if (RE_MANA_PRODUCER.test(cleanLower)) eff |= 1 << SWAP_EFFECT_BITS.MANA_PRODUCER;
    if (RE_COST_REDUCER.test(cleanLower)) eff |= 1 << SWAP_EFFECT_BITS.COST_REDUCER;
    if (RE_OVERRUN_PUMP.test(cleanLower)) eff |= 1 << SWAP_EFFECT_BITS.OVERRUN_PUMP;
    if (RE_TOKEN_MULTIPLIER.test(cleanLower)) eff |= 1 << SWAP_EFFECT_BITS.TOKEN_MULTIPLIER;
    if (RE_TOKEN_CLONE.test(cleanLower)) eff |= 1 << SWAP_EFFECT_BITS.TOKEN_CLONE_POPULATE;
    if (RE_COUNTER_MULTIPLIER.test(cleanLower)) eff |= 1 << SWAP_EFFECT_BITS.COUNTER_MULTIPLIER;
    if (RE_TEAM_PROTECTION.test(cleanLower)) eff |= 1 << SWAP_EFFECT_BITS.TEAM_PROTECTION;
    if (RE_TAX_REACTION.test(cleanLower)) eff |= 1 << SWAP_EFFECT_BITS.TAX_REACTION_ENGINE;
    if (RE_DRAW_ENGINE.test(cleanLower)) eff |= 1 << SWAP_EFFECT_BITS.DRAW_ENGINE;
    if (RE_SAC_FOR_MANA.test(cleanLower)) eff |= 1 << SWAP_EFFECT_BITS.SAC_FOR_MANA;
    if (RE_REANIMATE.test(cleanLower)) eff |= 1 << SWAP_EFFECT_BITS.REANIMATE_EFFECT;
    if (RE_EXTRA_COMBAT.test(cleanLower)) eff |= 1 << SWAP_EFFECT_BITS.EXTRA_COMBAT;
    if (RE_TRIGGER_DOUBLER.test(cleanLower)) eff |= 1 << SWAP_EFFECT_BITS.TRIGGER_DOUBLER;
    effectMasks[i] = eff;

    let lf = 0;
    const isFrontLand = isPrimaryLandCard(card);
    if (isFrontLand) {
      lf |= LFLAG_PURE_LAND;
      if (RE_BASIC_LAND.test(typeLower)) lf |= LFLAG_BASIC_LAND;
      if (RE_ENTERS_TAPPED_ALWAYS.test(cleanLower)) lf |= LFLAG_ENTERS_TAPPED_ALWAYS;
      if (RE_BASIC_SUBTYPES.test(typeLower)) lf |= LFLAG_HAS_BASIC_SUBTYPES;
      landManaMasks[i] = inferLandManaMask(cleanLower, typeLower);
    } else if (typeLower.includes('land')) {
      lf |= LFLAG_MDFC_LAND;
    }
    if (RE_ARTIFACT_ONLY_BOUNCE.test(cleanLower)) {
      lf |= LFLAG_ARTIFACT_ONLY_BOUNCE;
    }
    landFlags[i] = lf;
  }

  return {
    effectMasks,
    landManaMasks,
    landFlags,
    primaryTypeMasks,
    roleMasks,
  };
}

/**
 * Returns true if the card is a Basic Land (`Plains`, `Island`, `Swamp`, `Mountain`, `Forest`, `Wastes`).
 */
export function isBasicLandCard(card: CompactCard): boolean {
  return RE_BASIC_LAND.test(card.typeLine);
}

/**
 * Collects all card IDs currently occupying slots in Commanders, Mainboard, or Maybeboard.
 */
export function collectDeckExcludedCardIds(draft: DeckDraft): string[] {
  const seen = new Set<string>();
  for (const cmd of draft.commanders) {
    if (cmd.id) seen.add(cmd.id);
  }
  for (const entry of Object.values(draft.mainboard)) {
    if (entry.quantity > 0 && entry.card.id) seen.add(entry.card.id);
  }
  for (const entry of Object.values(draft.sideboard)) {
    if (entry.quantity > 0 && entry.card.id) seen.add(entry.card.id);
  }
  return Array.from(seen);
}

export interface SelectTargetsOptions {
  minPriceUsd: number;
  includeLands?: boolean;
}

/**
 * Selects priced non-basic mainboard cards above `minPriceUsd`, sorted highest cost first.
 */
export function selectExpensiveDeckTargets(
  draft: DeckDraft,
  options: SelectTargetsOptions,
): DeckCardEntry[] {
  const includeLands = options.includeLands ?? true;
  const entries = Object.values(draft.mainboard).filter((entry) => {
    if (entry.quantity <= 0) return false;
    const { card } = entry;
    if (card.priceUsd === null || card.priceUsd <= options.minPriceUsd) return false;
    if (isBasicLandCard(card)) return false;
    if (!includeLands && isPrimaryLandCard(card)) return false;
    return true;
  });

  return entries.sort(
    (a, b) =>
      (b.card.priceUsd ?? 0) - (a.card.priceUsd ?? 0) ||
      (b.card.priceUsd ?? 0) * b.quantity - (a.card.priceUsd ?? 0) * a.quantity ||
      a.card.name.localeCompare(b.card.name),
  );
}

interface TargetContext {
  target: CompactCard;
  targetIdx: number;
  targetEffMask: number;
  targetRoleMask: number;
  targetPTypeMask: number;
  targetThemeSet: Set<string>;
  targetEnMask: number;
  targetPayMask: number;
  targetKindred: number;
  targetFreeSac: number;
  targetIsPureLand: boolean;
  targetLandMana: number;
  targetLandFlags: number;
  allowedColorBitMask: number;
  hasCiConstraint: boolean;
}

const HIGH_SIGNAL_EFFECT_BITS =
  (1 << SWAP_EFFECT_BITS.COUNTERSPELL) |
  (1 << SWAP_EFFECT_BITS.MASS_BOUNCE) |
  (1 << SWAP_EFFECT_BITS.MASS_DESTROY_EXILE) |
  (1 << SWAP_EFFECT_BITS.ANY_TUTOR) |
  (1 << SWAP_EFFECT_BITS.TYPE_TUTOR) |
  (1 << SWAP_EFFECT_BITS.LAND_RAMP_SEARCH) |
  (1 << SWAP_EFFECT_BITS.EXTRA_LAND_DROP) |
  (1 << SWAP_EFFECT_BITS.COST_REDUCER) |
  (1 << SWAP_EFFECT_BITS.OVERRUN_PUMP) |
  (1 << SWAP_EFFECT_BITS.TOKEN_MULTIPLIER) |
  (1 << SWAP_EFFECT_BITS.COUNTER_MULTIPLIER) |
  (1 << SWAP_EFFECT_BITS.TEAM_PROTECTION) |
  (1 << SWAP_EFFECT_BITS.SAC_FOR_MANA) |
  (1 << SWAP_EFFECT_BITS.REANIMATE_EFFECT) |
  (1 << SWAP_EFFECT_BITS.EXTRA_COMBAT) |
  (1 << SWAP_EFFECT_BITS.TRIGGER_DOUBLER);

// Single-type Ripple bits (Instant/Sorcery, Artifacts, Enchantments) shouldn't match unrelated cards alone
const GENERIC_TYPE_RIPPLE_BITS = (1 << 11) | (1 << 13) | (1 << 14);

function buildAllowedCiMask(colorIdentity: ManaColor[] | null): number {
  if (!colorIdentity) return 0;
  let mask = 0;
  for (const c of colorIdentity) {
    mask |= COLOR_TO_LAND_BIT[c] ?? 0;
  }
  return mask;
}

function cardFitsCiMask(card: CompactCard, allowedMask: number, hasConstraint: boolean): boolean {
  if (!hasConstraint) return true;
  for (let c = 0; c < card.colorIdentity.length; c++) {
    const bit = COLOR_TO_LAND_BIT[card.colorIdentity[c]!] ?? 0;
    if ((allowedMask & bit) === 0) return false;
  }
  return true;
}

function buildTargetContext(
  target: CompactCard,
  targetIdx: number,
  swapIdx: BudgetSwapIndex,
  rippleIdx: RippleIndex,
  allowedCiMask: number,
  hasCiConstraint: boolean,
): TargetContext {
  const targetLandFlags = swapIdx.landFlags[targetIdx] ?? 0;
  return {
    target,
    targetIdx,
    targetEffMask: swapIdx.effectMasks[targetIdx] ?? 0,
    targetRoleMask: swapIdx.roleMasks[targetIdx] ?? 0,
    targetPTypeMask: swapIdx.primaryTypeMasks[targetIdx] ?? 0,
    targetThemeSet: new Set(target.themes),
    targetEnMask: rippleIdx.enablerMasks[targetIdx] ?? 0,
    targetPayMask: rippleIdx.payoffMasks[targetIdx] ?? 0,
    targetKindred: rippleIdx.kindredGenericFlags[targetIdx] ?? 0,
    targetFreeSac: rippleIdx.freeSacFlags[targetIdx] ?? 0,
    targetIsPureLand: (targetLandFlags & LFLAG_PURE_LAND) !== 0,
    targetLandMana: swapIdx.landManaMasks[targetIdx] ?? 0,
    targetLandFlags,
    allowedColorBitMask: allowedCiMask,
    hasCiConstraint,
  };
}

function collectSharedEffectReasons(overlapMask: number, out: string[]): void {
  let m = overlapMask;
  while (m !== 0) {
    const bit = (Math.clz32(m & -m) ^ 31) as SwapEffectBit;
    out.push(EFFECT_LABELS[bit]);
    m &= m - 1;
  }
}

function scoreLandSwapCandidate(
  ctx: TargetContext,
  cand: CompactCard,
  candIdx: number,
  swapIdx: BudgetSwapIndex,
  rippleIdx: RippleIndex,
): { score: number; confidence: BudgetSwapConfidence; reasons: string[] } | null {
  const candFlags = swapIdx.landFlags[candIdx] ?? 0;
  if ((candFlags & LFLAG_PURE_LAND) === 0 || (candFlags & LFLAG_BASIC_LAND) !== 0) {
    return null;
  }

  const reasons: string[] = [];
  let score = 0;

  const tManaWubrg = ctx.targetLandMana & LMANA_WUBRG_MASK;
  const cMana = swapIdx.landManaMasks[candIdx] ?? 0;
  const cManaWubrg = cMana & LMANA_WUBRG_MASK;
  const isTargetUtilityRemovalLand = (ctx.targetRoleMask & (ROLE_BIT_BY_NAME.removal! | ROLE_BIT_BY_NAME.recursion!)) !== 0;

  if (tManaWubrg !== 0) {
    const overlap = tManaWubrg & cManaWubrg;
    if (overlap !== 0) {
      const targetColorCount = popcount32(tManaWubrg);
      const overlapCount = popcount32(overlap);
      const candColorCount = popcount32(cManaWubrg);
      const isSlowFetch =
        (swapIdx.effectMasks[candIdx]! & (1 << SWAP_EFFECT_BITS.LAND_RAMP_SEARCH)) !== 0 &&
        (candFlags & LFLAG_ENTERS_TAPPED_ALWAYS) !== 0;

      if (overlapCount === targetColorCount) {
        score += targetColorCount === 2 && candColorCount === 2 ? 78 : 66;
        reasons.push(`Fixes ${formatLandMaskColors(tManaWubrg)}`);
      } else if (!isTargetUtilityRemovalLand) {
        score += overlapCount * 22;
        reasons.push(`Produces ${formatLandMaskColors(overlap)}`);
      }
      if (isSlowFetch) score -= 24;
    } else if (!isTargetUtilityRemovalLand) {
      return null;
    }
  }

  // Penalize tribal-restricted rainbow lands (Secluded Courtyard, Unclaimed Territory) unless target itself is tribal-restricted
  if ((cMana & LMANA_TRIBAL_RESTRICTED) !== 0 && (ctx.targetLandMana & LMANA_TRIBAL_RESTRICTED) === 0) {
    score -= 42;
  }

  // Reward fetchable basic subtypes when replacing Shocks / Fetches
  if ((ctx.targetLandFlags & LFLAG_HAS_BASIC_SUBTYPES) !== 0 && (candFlags & LFLAG_HAS_BASIC_SUBTYPES) !== 0) {
    score += 14;
    reasons.push('Typed land (fetchable)');
  }

  // Reward untapped or conditionally untapped lands
  if ((candFlags & LFLAG_ENTERS_TAPPED_ALWAYS) === 0) {
    score += 22;
    reasons.push('Can enter untapped');
  }

  // Role & functional overlap (Boseiju / Scavenger Grounds / Buried Ruin / Rogue's Passage / Reliquary Tower)
  const roleOverlap = ctx.targetRoleMask & (swapIdx.roleMasks[candIdx] ?? 0);
  if (roleOverlap !== 0) {
    score += popcount32(roleOverlap) * 44;
    for (const r of cand.roles) {
      if ((ctx.targetRoleMask & (ROLE_BIT_BY_NAME[r] ?? 0)) !== 0) {
        reasons.push(`Role: ${ROLE_BY_ID[r].label}`);
      }
    }
  }

  const effOverlap = ctx.targetEffMask & (swapIdx.effectMasks[candIdx] ?? 0);
  if (effOverlap !== 0) {
    score += popcount32(effOverlap) * 32;
    collectSharedEffectReasons(effOverlap, reasons);
  }

  const cRipOverlap =
    ((ctx.targetEnMask & (rippleIdx.enablerMasks[candIdx] ?? 0)) |
      (ctx.targetPayMask & (rippleIdx.payoffMasks[candIdx] ?? 0))) &
    ~GENERIC_TYPE_RIPPLE_BITS;
  if (cRipOverlap !== 0) {
    score += popcount32(cRipOverlap) * 18;
  }

  if (score < 42) return null;

  const confidence: BudgetSwapConfidence =
    score >= 82 ? 'direct' : score >= 60 ? 'similar' : 'loose';
  return { score, confidence, reasons };
}

function scoreSpellSwapCandidate(
  ctx: TargetContext,
  cand: CompactCard,
  candIdx: number,
  swapIdx: BudgetSwapIndex,
  rippleIdx: RippleIndex,
): { score: number; confidence: BudgetSwapConfidence; reasons: string[] } | null {
  const candFlags = swapIdx.landFlags[candIdx] ?? 0;
  if ((candFlags & LFLAG_PURE_LAND) !== 0) return null;

  const reasons: string[] = [];
  let score = 0;

  const cEffMask = swapIdx.effectMasks[candIdx] ?? 0;
  const effOverlap = ctx.targetEffMask & cEffMask;

  // Avoid matching artifact-only mass bounce (Rebuild) onto nonland mass bounce (Cyclonic Rift) at top priority
  const candIsArtifactOnlyBounce = (candFlags & LFLAG_ARTIFACT_ONLY_BOUNCE) !== 0;
  const targetIsArtifactOnlyBounce = (ctx.targetLandFlags & LFLAG_ARTIFACT_ONLY_BOUNCE) !== 0;

  let effOverlapCount = 0;
  if (effOverlap !== 0) {
    let m = effOverlap;
    while (m !== 0) {
      const bit = (Math.clz32(m & -m) ^ 31) as SwapEffectBit;
      effOverlapCount++;
      let pts = (HIGH_SIGNAL_EFFECT_BITS & (1 << bit)) !== 0 ? 58 : 44;
      if (bit === SWAP_EFFECT_BITS.MASS_BOUNCE && candIsArtifactOnlyBounce && !targetIsArtifactOnlyBounce) {
        pts = 20;
      }
      score += pts;
      reasons.push(EFFECT_LABELS[bit]);
      m &= m - 1;
    }
  }

  const cRoleMask = swapIdx.roleMasks[candIdx] ?? 0;
  const roleOverlap = ctx.targetRoleMask & cRoleMask;
  const roleOverlapCount = popcount32(roleOverlap);
  if (roleOverlapCount > 0) {
    score += roleOverlapCount * 28;
    for (const r of cand.roles) {
      if ((ctx.targetRoleMask & (ROLE_BIT_BY_NAME[r] ?? 0)) !== 0) {
        reasons.push(`Role: ${ROLE_BY_ID[r].label}`);
      }
    }
  }

  let themeOverlapCount = 0;
  if (ctx.targetThemeSet.size > 0 && cand.themes.length > 0) {
    for (const th of cand.themes) {
      if (ctx.targetThemeSet.has(th)) {
        themeOverlapCount++;
        score += 20;
        reasons.push(THEME_BY_ID[th]?.label ?? th);
      }
    }
  }

  const enOverlap = popcount32(
    (ctx.targetEnMask & (rippleIdx.enablerMasks[candIdx] ?? 0)) & ~GENERIC_TYPE_RIPPLE_BITS,
  );
  const payOverlap = popcount32(
    (ctx.targetPayMask & (rippleIdx.payoffMasks[candIdx] ?? 0)) & ~GENERIC_TYPE_RIPPLE_BITS,
  );
  score += enOverlap * 12 + payOverlap * 16;

  if (ctx.targetFreeSac === 1 && rippleIdx.freeSacFlags[candIdx] === 1) {
    score += 24;
    reasons.push('Free sac outlet');
  }
  if (ctx.targetKindred === 1 && rippleIdx.kindredGenericFlags[candIdx] === 1) {
    score += 32;
    reasons.push('Kindred scaling');
  }

  // Require real functional/mechanical similarity — never match solely because "both are blue instants"
  if (
    effOverlapCount === 0 &&
    roleOverlapCount === 0 &&
    themeOverlapCount === 0 &&
    payOverlap === 0 &&
    enOverlap < 2
  ) {
    return null;
  }

  // Primary card type alignment (keeps Artifact sac outlet matching Artifacts, Sorcery matching Spells)
  const cPTypeMask = swapIdx.primaryTypeMasks[candIdx] ?? 0;
  if ((ctx.targetPTypeMask & cPTypeMask) !== 0) {
    score += 12;
  }
  if ((ctx.targetPTypeMask & PTYPE_INSTANT) !== 0 && (cPTypeMask & PTYPE_INSTANT) !== 0) {
    score += 8;
    reasons.push('Instant speed');
  }

  // Mana Value proximity
  const cmcDiff = Math.abs(cand.cmc - ctx.target.cmc);
  if (cmcDiff === 0) {
    score += 10;
  } else if (cmcDiff === 1) {
    score += 5;
  } else if (cmcDiff >= 3 && cand.cmc > ctx.target.cmc) {
    score -= 12;
  }

  if (score < 38) return null;

  const hasHighSignalMatch = (effOverlap & HIGH_SIGNAL_EFFECT_BITS) !== 0;
  const confidence: BudgetSwapConfidence =
    (hasHighSignalMatch || (roleOverlapCount > 0 && themeOverlapCount > 0)) && score >= 82
      ? 'direct'
      : score >= 56
        ? 'similar'
        : 'loose';

  return { score, confidence, reasons };
}

/**
 * Finds cheaper same-job replacement candidates for one or more target cards across the full catalog.
 * Enforces Commander color identity, skips cards already in `excludeCardIds`, and applies optional
 * Commander Ripple synergy tie-breaking.
 */
export function findBudgetSwapsForTargets(
  cards: readonly CompactCard[],
  request: BudgetSwapScanRequest,
  rippleIndex?: RippleIndex,
  swapIndex?: BudgetSwapIndex,
  preLowerTypeLines?: readonly string[],
  idToIndex?: ReadonlyMap<string, number>,
  oracleToIndex?: ReadonlyMap<string, number>,
): BudgetSwapTargetResult[] {
  if (request.targetCardIds.length === 0) return [];

  const rIdx = rippleIndex ?? buildRippleIndex(cards);
  const sIdx = swapIndex ?? buildBudgetSwapIndex(cards, rIdx);
  const perTargetLimit = Math.max(1, Math.min(12, request.perTargetLimit ?? 6));

  let resolvedIdToIndex = idToIndex;
  let resolvedOracleToIndex = oracleToIndex;
  if (!resolvedIdToIndex) {
    const idMap = new Map<string, number>();
    const oMap = new Map<string, number>();
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i]!;
      idMap.set(c.id, i);
      if (c.oracleId && !oMap.has(c.oracleId)) oMap.set(c.oracleId, i);
    }
    resolvedIdToIndex = idMap;
    resolvedOracleToIndex = oMap;
  }

  const lookupIndex = (rawId: string): number | undefined =>
    resolvedIdToIndex!.get(rawId) ?? resolvedOracleToIndex?.get(rawId);

  const excludedIds = new Set<string>(request.excludeCardIds);
  const excludedOracleIds = new Set<string>();
  for (const id of request.excludeCardIds) {
    const idx = lookupIndex(id);
    if (idx !== undefined) {
      const oId = cards[idx]!.oracleId;
      if (oId) excludedOracleIds.add(oId);
    } else {
      // Allow callers to pass raw oracleIds inside excludeCardIds directly
      excludedOracleIds.add(id);
    }
  }

  const commanderCards: CompactCard[] = [];
  for (const cid of request.commanderIds) {
    const idx = lookupIndex(cid);
    if (idx !== undefined) commanderCards.push(cards[idx]!);
  }

  const effectiveColorIdentity: ManaColor[] | null =
    request.colorIdentity !== null
      ? request.colorIdentity
      : commanderCards.length > 0
        ? getCombinedColorIdentity(commanderCards)
        : null;
  const hasCiConstraint = effectiveColorIdentity !== null;
  const allowedCiMask = buildAllowedCiMask(effectiveColorIdentity);

  let commanderRippleMatcher: RippleMatcher | null = null;
  let commanderShortName = '';
  if (commanderCards.length > 0) {
    const cmdProfile = extractRippleProfile(commanderCards);
    if (cmdProfile.hooks.length > 0) {
      commanderRippleMatcher = prepareRippleMatcher(cmdProfile, 'all', null, null);
      commanderShortName = commanderCards[0]!.name.split(',')[0] ?? 'Commander';
    }
  }

  // Pre-filter eligible affordable, in-identity, non-excluded cards ONCE per batch
  const eligibleLandIndices: number[] = [];
  const eligibleSpellIndices: number[] = [];
  const cmdRippleScores = commanderRippleMatcher !== null ? new Int16Array(cards.length) : null;

  for (let i = 0; i < cards.length; i++) {
    const cand = cards[i]!;
    if (cand.priceUsd === null || cand.priceUsd > request.maxSwapPriceUsd) continue;
    if (excludedIds.has(cand.id)) continue;
    if (cand.oracleId && excludedOracleIds.has(cand.oracleId)) continue;
    if (!cardFitsCiMask(cand, allowedCiMask, hasCiConstraint)) continue;

    if (commanderRippleMatcher !== null && cmdRippleScores !== null) {
      const typeLow = preLowerTypeLines?.[i] ?? rIdx.typeLowers[i] ?? cand.typeLine.toLowerCase();
      const cmdHit = scoreRippleCard(i, cand, typeLow, rIdx, commanderRippleMatcher, false);
      if (cmdHit.score > 0) {
        cmdRippleScores[i] = Math.min(14, Math.round(cmdHit.score * 0.14));
      }
    }

    const candFlags = sIdx.landFlags[i] ?? 0;
    if ((candFlags & LFLAG_PURE_LAND) !== 0) {
      if ((candFlags & LFLAG_BASIC_LAND) === 0) {
        eligibleLandIndices.push(i);
      }
    } else {
      eligibleSpellIndices.push(i);
    }
  }

  const results: BudgetSwapTargetResult[] = [];

  for (const targetId of request.targetCardIds) {
    const targetIdx = lookupIndex(targetId);
    if (targetIdx === undefined) continue;
    const target = cards[targetIdx]!;
    if (isBasicLandCard(target)) continue;

    const ctx = buildTargetContext(
      target,
      targetIdx,
      sIdx,
      rIdx,
      allowedCiMask,
      hasCiConstraint,
    );

    const candidates: BudgetSwapCandidate[] = [];
    const seenOracleIds = new Set<string>();
    const candidatePool = ctx.targetIsPureLand ? eligibleLandIndices : eligibleSpellIndices;

    for (let p = 0; p < candidatePool.length; p++) {
      const i = candidatePool[p]!;
      const cand = cards[i]!;
      if (cand.id === target.id) continue;
      if (target.oracleId && cand.oracleId === target.oracleId) continue;
      if (target.priceUsd !== null && cand.priceUsd! >= target.priceUsd) continue;

      const hit = ctx.targetIsPureLand
        ? scoreLandSwapCandidate(ctx, cand, i, sIdx, rIdx)
        : scoreSpellSwapCandidate(ctx, cand, i, sIdx, rIdx);

      if (!hit) continue;

      let totalScore = hit.score;
      const cmdBonus = cmdRippleScores !== null ? cmdRippleScores[i]! : 0;
      const fitsCommanderRipple = cmdBonus > 0;
      if (fitsCommanderRipple) {
        totalScore += cmdBonus;
      }

      if (cand.edhrecRank !== null) {
        totalScore += Math.max(-8, 12 - Math.log10(cand.edhrecRank + 1) * 3.5);
      } else {
        totalScore -= 10;
      }

      if (totalScore < 40) continue;

      const roundedScore = Math.round(totalScore * 10) / 10;
      const savingsUsd =
        target.priceUsd !== null
          ? Math.max(0, Math.round((target.priceUsd - cand.priceUsd!) * 100) / 100)
          : 0;
      const uniqueReasons = Array.from(new Set(hit.reasons));
      const trimmedReasons =
        fitsCommanderRipple && commanderShortName
          ? [`Fits ${commanderShortName}`, ...uniqueReasons].slice(0, 4)
          : uniqueReasons.slice(0, 4);

      if (cand.oracleId && seenOracleIds.has(cand.oracleId)) continue;
      if (cand.oracleId) seenOracleIds.add(cand.oracleId);

      candidates.push({
        card: cand,
        score: roundedScore,
        savingsUsd,
        confidence: hit.confidence,
        reasons: trimmedReasons,
        fitsCommanderRipple,
      });
    }

    candidates.sort(
      (a, b) =>
        b.score - a.score ||
        (a.card.edhrecRank ?? 99999) - (b.card.edhrecRank ?? 99999) ||
        (a.card.priceUsd ?? 999) - (b.card.priceUsd ?? 999),
    );

    results.push({
      targetCard: target,
      suggestions: candidates.slice(0, perTargetLimit),
    });
  }

  return results;
}

/**
 * Computes potential savings across a batch of target swap results using each target's top pick.
 */
export function computeDeckSwapPotentialSavings(
  draft: DeckDraft,
  results: readonly BudgetSwapTargetResult[],
): { targetsWithSwaps: number; totalPotentialSavingsUsd: number } {
  let targetsWithSwaps = 0;
  let totalPotentialSavingsUsd = 0;

  for (const res of results) {
    const top = res.suggestions[0];
    if (!top) continue;
    targetsWithSwaps++;
    const qty = Math.max(1, draft.mainboard[res.targetCard.id]?.quantity ?? 1);
    totalPotentialSavingsUsd += top.savingsUsd * qty;
  }

  return {
    targetsWithSwaps,
    totalPotentialSavingsUsd: Math.round(totalPotentialSavingsUsd * 100) / 100,
  };
}
