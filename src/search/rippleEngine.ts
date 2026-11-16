import {
  POPULAR_SUBTYPES,
  THEME_BY_ID,
  THEME_SYNONYMS,
} from '../config/searchConfig.js';
import type { CompactCard } from '../types/card.js';
import type { RippleMode } from '../types/search.js';

/**
 * 30 orthogonal mechanic bit indices used for directional Ripple Chain matching
 * (Starter/Enabler supply bits vs. Payoff/Multiplier demand bits).
 */
export const MECHANIC_BITS = {
  SAC_OUTLET: 0,
  SAC_PERMANENT_FODDER: 1,
  CREATURE_DIES_FODDER: 2,
  TOKENS: 3,
  TREASURE: 4,
  ETB_TRIGGER: 5,
  BLINK_FLICKER: 6,
  PLUS1_COUNTERS: 7,
  PROLIFERATE_COUNTERS: 8,
  GRAVEYARD_FILL: 9,
  REANIMATE_RECUR: 10,
  INSTANT_SORCERY: 11,
  SPELL_COPY_FORK: 12,
  ARTIFACTS_MATTER: 13,
  ENCHANTMENTS_MATTER: 14,
  EXILE_CAST: 15,
  DISCARD_MADNESS: 16,
  CARD_DRAW: 17,
  LIFEGAIN: 18,
  LANDFALL_LANDS: 19,
  ATTACK_COMBAT: 20,
  COMBAT_DAMAGE_EVASION: 21,
  EQUIPMENT_AURA: 22,
  TAP_UNTAP: 23,
  BURN_DRAIN: 24,
  CLONE_COPY: 25,
  TOPDECK_MATTERS: 26,
  BIG_CREATURE_POWER: 27,
  COST_REDUCTION_BIG_MANA: 28,
  PROTECTION_INDESTRUCTIBLE: 29,
} as const;

export type RippleBitIndex = (typeof MECHANIC_BITS)[keyof typeof MECHANIC_BITS];

export const HIDDEN_GEM_DEFAULT_MAX_USD = 5.0;
export const HIDDEN_GEM_MIN_EDHREC_RANK = 2200;
export const HIDDEN_GEM_MAX_EDHREC_RANK = 14000;

export const RIPPLE_MODE_META: Readonly<
  Record<RippleMode, { label: string; shortDesc: string }>
> = {
  all: {
    label: 'All Ripple',
    shortDesc: 'Balanced starters, payoffs & engine bridges',
  },
  enablers: {
    label: 'Starters',
    shortDesc: 'Cards that trigger, feed, or enable your strategy',
  },
  payoffs: {
    label: 'Payoffs',
    shortDesc: 'Cards that reward, scale, or multiply the effect',
  },
  'hidden-gems': {
    label: 'Hidden Gems',
    shortDesc: 'High-synergy sleepers ≤ $5 skipping top staples',
  },
};

const BIT_LABELS: Record<RippleBitIndex, { enabler: string; payoff: string; shortEnabler: string; shortPayoff: string }> = {
  [MECHANIC_BITS.SAC_OUTLET]: {
    enabler: 'Starter: Sacrifice Outlet',
    payoff: 'Payoff: Rewards Sacrificing',
    shortEnabler: 'Sacrifice Outlets',
    shortPayoff: 'Sacrifice Payoffs',
  },
  [MECHANIC_BITS.SAC_PERMANENT_FODDER]: {
    enabler: 'Starter: Fetch / Treasure / Self-Sac',
    payoff: 'Payoff: Triggers on Sacrifice',
    shortEnabler: 'Treasures & Fetches',
    shortPayoff: 'Permanent-Sac Payoffs',
  },
  [MECHANIC_BITS.CREATURE_DIES_FODDER]: {
    enabler: 'Starter: Death Fodder',
    payoff: 'Payoff: Triggers on Dies',
    shortEnabler: 'Death Fodder',
    shortPayoff: 'Death Triggers',
  },
  [MECHANIC_BITS.TOKENS]: {
    enabler: 'Starter: Token Maker',
    payoff: 'Payoff: Token Multiplier / Anthem',
    shortEnabler: 'Token Generators',
    shortPayoff: 'Token Payoffs',
  },
  [MECHANIC_BITS.TREASURE]: {
    enabler: 'Starter: Treasure Maker',
    payoff: 'Payoff: Treasure / Artifact',
    shortEnabler: 'Treasure Makers',
    shortPayoff: 'Treasure Payoffs',
  },
  [MECHANIC_BITS.ETB_TRIGGER]: {
    enabler: 'Starter: ETB Permanent',
    payoff: 'Payoff: ETB Doubler / Trigger',
    shortEnabler: 'ETB Value Bodies',
    shortPayoff: 'ETB Multipliers',
  },
  [MECHANIC_BITS.BLINK_FLICKER]: {
    enabler: 'Starter: Blink / Flicker',
    payoff: 'Payoff: Blink Synergy',
    shortEnabler: 'Blink & Flicker',
    shortPayoff: 'Blink Payoffs',
  },
  [MECHANIC_BITS.PLUS1_COUNTERS]: {
    enabler: 'Starter: +1/+1 Counters',
    payoff: 'Payoff: +1/+1 Counter Scaling',
    shortEnabler: '+1/+1 Counter Sources',
    shortPayoff: '+1/+1 Counter Payoffs',
  },
  [MECHANIC_BITS.PROLIFERATE_COUNTERS]: {
    enabler: 'Starter: Counters / Planeswalker / Poison',
    payoff: 'Payoff: Proliferate / Counter Payoff',
    shortEnabler: 'Counters & Planeswalkers',
    shortPayoff: 'Proliferate Payoffs',
  },
  [MECHANIC_BITS.GRAVEYARD_FILL]: {
    enabler: 'Starter: Self-Mill / Entomb',
    payoff: 'Payoff: Graveyard Scaling',
    shortEnabler: 'Self-Mill & Graveyard Fill',
    shortPayoff: 'Graveyard Payoffs',
  },
  [MECHANIC_BITS.REANIMATE_RECUR]: {
    enabler: 'Starter: Reanimates / Recurs',
    payoff: 'Payoff: Leaves-Graveyard',
    shortEnabler: 'Recursion & Reanimation',
    shortPayoff: 'Leaves-Graveyard Payoffs',
  },
  [MECHANIC_BITS.INSTANT_SORCERY]: {
    enabler: 'Starter: Cheap Instant / Sorcery',
    payoff: 'Payoff: Magecraft / Spellslinger',
    shortEnabler: 'Cheap Spells & Cantrips',
    shortPayoff: 'Magecraft Payoffs',
  },
  [MECHANIC_BITS.SPELL_COPY_FORK]: {
    enabler: 'Starter: Copies / Rebounds Spells',
    payoff: 'Payoff: Spell-Copy Trigger',
    shortEnabler: 'Spell Copiers & Flashback',
    shortPayoff: 'Spell-Copy Payoffs',
  },
  [MECHANIC_BITS.ARTIFACTS_MATTER]: {
    enabler: 'Starter: Artifact / Token',
    payoff: 'Payoff: Artifact-Matters',
    shortEnabler: 'Artifacts',
    shortPayoff: 'Artifact Payoffs',
  },
  [MECHANIC_BITS.ENCHANTMENTS_MATTER]: {
    enabler: 'Starter: Enchantment',
    payoff: 'Payoff: Enchantress / Constellation',
    shortEnabler: 'Enchantments',
    shortPayoff: 'Enchantress Payoffs',
  },
  [MECHANIC_BITS.EXILE_CAST]: {
    enabler: 'Starter: Impulse / Cascade / Exile Cast',
    payoff: 'Payoff: Cast-from-Exile',
    shortEnabler: 'Impulse & Cascade',
    shortPayoff: 'Cast-from-Exile Payoffs',
  },
  [MECHANIC_BITS.DISCARD_MADNESS]: {
    enabler: 'Starter: Wheel / Loot / Discard',
    payoff: 'Payoff: Discard / Madness',
    shortEnabler: 'Wheels & Discard Outlets',
    shortPayoff: 'Discard Payoffs',
  },
  [MECHANIC_BITS.CARD_DRAW]: {
    enabler: 'Starter: Card Draw / Wheel',
    payoff: 'Payoff: Rewards Drawing',
    shortEnabler: 'Card Draw Engines',
    shortPayoff: 'Draw Payoffs',
  },
  [MECHANIC_BITS.LIFEGAIN]: {
    enabler: 'Starter: Repeatable Lifegain',
    payoff: 'Payoff: Lifegain Trigger',
    shortEnabler: 'Lifegain Sources',
    shortPayoff: 'Lifegain Payoffs',
  },
  [MECHANIC_BITS.LANDFALL_LANDS]: {
    enabler: 'Starter: Fetch / Land Ramp',
    payoff: 'Payoff: Landfall / Lands',
    shortEnabler: 'Fetches & Land Ramp',
    shortPayoff: 'Landfall Payoffs',
  },
  [MECHANIC_BITS.ATTACK_COMBAT]: {
    enabler: 'Starter: Haste / Extra Combat',
    payoff: 'Payoff: Attack Trigger',
    shortEnabler: 'Haste & Extra Combats',
    shortPayoff: 'Attack Triggers',
  },
  [MECHANIC_BITS.COMBAT_DAMAGE_EVASION]: {
    enabler: 'Starter: Evasion / Double Strike',
    payoff: 'Payoff: Combat Damage',
    shortEnabler: 'Evasion & Unblockable',
    shortPayoff: 'Combat-Damage Payoffs',
  },
  [MECHANIC_BITS.EQUIPMENT_AURA]: {
    enabler: 'Starter: Equipment / Aura',
    payoff: 'Payoff: Equipment / Aura',
    shortEnabler: 'Equipment & Auras',
    shortPayoff: 'Equipment / Aura Payoffs',
  },
  [MECHANIC_BITS.TAP_UNTAP]: {
    enabler: 'Starter: Untapper / Haste',
    payoff: 'Payoff: Tap / Activated',
    shortEnabler: 'Untappers & Haste',
    shortPayoff: 'Ability Copiers',
  },
  [MECHANIC_BITS.BURN_DRAIN]: {
    enabler: 'Starter: Ping / Burn / Drain',
    payoff: 'Payoff: Damage Multiplier',
    shortEnabler: 'Pingers & Drain',
    shortPayoff: 'Damage Amplifiers',
  },
  [MECHANIC_BITS.CLONE_COPY]: {
    enabler: 'Starter: Clone / Copy',
    payoff: 'Payoff: Trigger / Ability Doubler',
    shortEnabler: 'Clones',
    shortPayoff: 'Trigger & Ability Copiers',
  },
  [MECHANIC_BITS.TOPDECK_MATTERS]: {
    enabler: 'Starter: Scry / Topdeck Control',
    payoff: 'Payoff: Plays From Top',
    shortEnabler: 'Topdeck Manipulation',
    shortPayoff: 'Topdeck Play',
  },
  [MECHANIC_BITS.BIG_CREATURE_POWER]: {
    enabler: 'Starter: High-Power / 4+ MV Body',
    payoff: 'Payoff: Power-Matters / Fling',
    shortEnabler: 'Big / 4+ MV Creatures',
    shortPayoff: 'Power-Matters Payoffs',
  },
  [MECHANIC_BITS.COST_REDUCTION_BIG_MANA]: {
    enabler: 'Starter: Ramp / Cost Reducer',
    payoff: 'Payoff: High-MV Finisher / X-Spell',
    shortEnabler: 'Big-Mana Ramp',
    shortPayoff: 'Big Spells & Finishers',
  },
  [MECHANIC_BITS.PROTECTION_INDESTRUCTIBLE]: {
    enabler: 'Starter: Protection / Phasing',
    payoff: 'Payoff: One-Sided Board Wipe',
    shortEnabler: 'Team Protection',
    shortPayoff: 'Board Wipes',
  },
};

export interface RippleHook {
  key: string;
  label: string;
  bit: RippleBitIndex | null;
  subtype?: string;
  customTerm?: string;
  direction: 'need-enabler' | 'need-payoff';
  weight: number;
  reason: string;
}

export interface RippleProfile {
  seedIds: string[];
  seedNames: string[];
  archetypeHeadline: string;
  summarySentence: string;
  hooks: RippleHook[];
  wantSubtypes: string[];
  customTerms: string[];
  defaultThemes: string[];
  themeGroups?: string[][];
  includeStax?: boolean;
  includeTheft?: boolean;
  wantTypesInclude: string[];
  wantTypesExclude: string[];
  minCmcForEnablerTypes?: number;
}

export interface RippleIndex {
  enablerMasks: Uint32Array;
  payoffMasks: Uint32Array;
  cleanLowers: string[];
  condLowers: string[];
  multLowers: string[];
  typeLowers: string[];
  subtypesLowers: string[];
  keywordLowers: string[];
  freeSacFlags: Uint8Array;
  ownCastSpellPayoffFlags: Uint8Array;
  landfallTriggerFlags: Uint8Array;
  kindredGenericFlags: Uint8Array;
  staxFlags: Uint8Array;
  theftFlags: Uint8Array;
}

export interface CompiledSubtypeMatcher {
  sub: string;
  subLower: string;
  isCreatureTribe: boolean;
  stem1: string;
  stem2: string;
  wordRe: RegExp;
  tokenMakeRe: RegExp;
  careRe: RegExp;
}

export interface CompiledCustomTermMatcher {
  raw: string;
  label: string;
  stem: string;
  wordRe: RegExp;
  careRe: RegExp;
}

export interface ThemeMatchGroup {
  enablerBits: number;
  payoffBits: number;
  subtypeIdx: number;
  customTermIdx: number;
  isStax: boolean;
  isTheft: boolean;
}

export interface RippleMatcher {
  profile: RippleProfile;
  mode: RippleMode;
  hookKey: string | null;
  seedIdSet: Set<string>;
  neededEnablerBits: number;
  neededPayoffBits: number;
  enablerWeights: number[];
  payoffWeights: number[];
  subtypesLower: string[];
  compiledSubtypes: CompiledSubtypeMatcher[];
  compiledCustomTerms: CompiledCustomTermMatcher[];
  themeGroups: ThemeMatchGroup[];
  includeTribeEnablers: boolean;
  includeTribePayoffs: boolean;
  includeStax: boolean;
  includeTheft: boolean;
  maxGemPriceUsd: number;
}

export interface DeckChainBalance {
  inDeckStarters: number;
  inDeckPayoffs: number;
  recommendedMode: RippleMode | null;
}

// Pre-hoisted regex constants to keep worker indexing fast
const RE_REMINDER = /\([^()]*\)/g;
const RE_THIS_PERM = /\bthis (?:creature|artifact|enchantment|land|planeswalker|permanent|vehicle|equipment|aura|background)\b/g;
const RE_HSPACE = /[^\S\n]+/g;
const RE_TRIG_LINE = /^(?:[a-z\s'-]+—\s*)?(?:whenever|when)\s+(.+?),\s*(.+)$/i;
const RE_ACT_LINE = /^([^:]+):\s*(.+)$/i;
const RE_STEP_LINE = /^at the beginning of [^,]+,\s*(?:if\s+(.+?),\s*)?(.+)$/i;

const RE_FREE_SAC_ACTIVATED = /(?:^|\n)sacrifice (?:a|another) creature:/;
const RE_SAC_OUTLET = /\bsacrifice (?:a|another|an untapped|x|\w+) creatures?\b|\bsacrifice (?:a|another) permanent\b|\bsacrifice any number of creatures\b/;
const RE_CREATURE_SELF_SAC = /\bsacrifice ~\b|\bevoke\b|\bblitz\b|\bafterlife\b|\bundying\b|\bpersist\b/;
const RE_CREATURE_DIES = /\bwhen ~ dies\b|\beach player sacrifices a creature\b/;
const RE_SAC_PERM = /\bsacrifice ~\b|\bsacrifice (?:a|an|two|one or more) (?:permanent|land|artifact|treasure|clue|food|token|creature)\b/;
const RE_TOKEN_MAKE = /\bcreate [^.]+token|\bpopulate\b|\bmyriad\b|\bsquad\b|\boffspring\b|\bamass\b|\binvestigate\b/;
const RE_TREASURE_MAKE = /\btreasure token|\bcreate [^.]+treasure\b/;
const RE_BLINK = /\bexile target (?:creature|permanent|artifact)[^.]*return (?:it|that card) to the battlefield|\bexile up to [^.]+return them to the battlefield/;
const RE_PLUS1_GEN = /\bput [^.]{0,45}\+1\/\+1 counter|\bdistributes?\b[^.]*\+1\/\+1 counter|\bbolster\b|\bevolve\b|\badapt\b|\bmodular\b|\bbackup\b|\bconnive\b|\bexplore\b/;
const RE_COUNTERS_ANY = /\b(?:toxic|infect|poison counter|experience counter|oil counter|charge counter|shield counter|lore counter|energy counter|stun counter|\+1\/\+1 counter)\b|\benters with [^.]{0,35}counter|\bput a [^.]{0,25}counter on\b/;
const RE_GY_FILL = /\bmill\b|\bsurveil\b|\bdredge\b|\bsearch your library for [^.]+put [^.]+into your graveyard\b|\bput [^.]+into your graveyard\b/;
const RE_REANIMATE = /\breturn [^.]+from [^.]+graveyard to the battlefield|\bput [^.]+from [^.]+graveyard onto the battlefield|\byou may (?:cast|play) [^.]+from your graveyard\b/;
const RE_SPELL_COPY = /\bcopy target (?:instant|sorcery|spell)\b|\brebound\b|\bstorm\b|\bflashback\b/;
const RE_ART_TOKENS = /\bcreate [^.]+(?:treasure|clue|food|blood|thopter|servo|construct|powerstone|map|junk) token\b/;
const RE_EXILE_EN = /\bexile the top\b[^.]*(?:you may (?:play|cast)|until (?:your next|the end of))|\b(?:cascade|discover|foretell|plot|rebound|suspend)\b|\bcast [^.]+without paying its mana cost\b/;
const RE_DISCARD_EN = /\bdraw [^.]+then discard\b|\beach player discards\b|\bdiscard a card\b|\bconnive\b|\bblood token\b/;
const RE_LIFE_REPEAT = /\bwhenever\b|\beach turn\b|\bat the beginning\b|\bequipped\b|\benchanted\b|\bcreatures you control\b/;
const RE_LIFE_VAL = /\byou gain \d+ life\b|\byou gain life equal|\bequip[^.]*lifelink\b/;
const RE_LAND_RAMP = /\badditional land\b|\bsearch your library for [^.]{0,45}(?:basic land|land card|forest|plains|island|swamp|mountain)\b|\bput [^.]{0,30}land card [^.]{0,25}onto the battlefield\b/;
const RE_ATK_EN = /\badditional combat\b|\bcreatures you control (?:gain|have) haste\b|\btapped and attacking\b|\bmyriad\b|\bmobilize\b|\bprevent all combat damage that would be dealt to attacking\b|\buntap all attacking creatures\b/;
const RE_EVADE_EN = /\bcan't be blocked\b|\bgains? double strike\b|\bhave flying\b|\bhave trample\b|\bhave menace\b|\bhave skulk\b|\bninjutsu\b/;
const RE_UNTAP_EN = /\buntap (?:target|all|another|up to)\b|\buntap all creatures\b|\bcreatures you control have haste\b/;
const RE_BURN_EN = /\bdeals? \d+ damage to (?:each|target|any)\b|\beach opponent loses \d+ life\b/;
const RE_CLONE_EN = /\bcreate a token that's a copy\b|\benter as a copy of any creature\b/;
const RE_TOPDECK_EN = /\bput [^.]+on top of (?:your|their) library\b|\bscry [2-9]|\blook at the top (?:three|four|five|\d+)\b|\byou may look at the top card of your library\b/;
const RE_COST_RED = /\bcosts? \{[^}]+\} less to cast\b|\bwhenever you tap a land for mana, add\b/;
const RE_PROT_EN = /\bgain hexproof and indestructible\b|\bphase out\b/;
const RE_STAX_RULE = /\b(?:spells (?:your opponents|opponents|players) cast cost [^\n.]*more|can't cast more than (?:one|two) spells?|don't untap during their controllers?' untap steps?|your opponents can't cast|players can't)\b/;
const RE_THEFT_RULE = /\b(?:gain control of target|exile the top card of (?:each|target) opponent's library[^\n.]*you may (?:play|cast)|cast spells from [^\n.]*opponents?' (?:graveyards?|libraries?|hands?))\b/;

const RE_PAY_SAC_MULT = /for each (?:permanent|creature|artifact) (?:you've |)sacrificed/;
const RE_PAY_DIES_COND = /\b(?:another creature|a creature|a nontoken creature|creature you control|creature an opponent controls|creature dying|creatures that died|died this turn)\b/;
const RE_PAY_TOKENS = /twice that many[^.]*tokens|create an additional|additional[^.]*tokens|other creatures you control get \+[1-9]|creatures you control get \+[1-9]|whenever (?:a|another|one or more) creatures? (?:you control )?enters/;
const RE_PAY_ARTIFACTS = /for each artifact|number of artifacts|whenever an artifact|whenever you sacrifice (?:a|an) (?:artifact|treasure)|twice that many[^.]*treasure/;
const RE_PAY_ETB_DOUB = /\b(?:creature|permanent) entering causes\b|enters causes a triggered ability/;
const RE_PAY_ETB_TRIG = /\b(?:a|another) (?:creature|permanent)(?: you control)? enters\b/;
const RE_PAY_PLUS1_MULT = /\b(?:twice that many|that many plus one|additional) \+1\/\+1 counter|creatures you control with \+1\/\+1 counters|each creature you control with a \+1\/\+1 counter|\bmove\b[^.]*\+1\/\+1 counter/;
const RE_PAY_PROLIF = /\b(?:twice that many|additional) counters?\b|with (?:ten|twenty|\d+) or more [^.]+counters|for each (?:experience|poison|charge|loyalty|oil) counter/;
const RE_PAY_GY = /for each (?:creature )?card in your graveyard|number of [^.]+cards in (?:your|all) graveyards|\bescape\b|\bdelve\b|\bthreshold\b|\bdelirium\b|\bdescend\b|leaves your graveyard/;
const RE_PAY_SPELL_COND = /\b(?:instant|sorcery|noncreature spell)\b/;
const RE_PAY_PROWESS = /\bprowess\b|\bmagecraft\b/;
const RE_PAY_ENCH = /for each enchantment|number of enchantments/;
const RE_PAY_EXILE = /\bfrom exile\b|\bnot cast from (?:your|their) hand\b|\bcast from anywhere other than\b/;
const RE_PAY_DRAW_COND = /\byou draw\b|\bplayer draws\b|\bdraws? a card\b/;
const RE_PAY_DRAW_MULT = /\bdraw twice that many|draw two cards instead|equal to the number of cards in your hand|if you would draw a card\b/;
const RE_PAY_LIFE_COND = /\byou gain life\b|\bgain life\b/;
const RE_PAY_LIFE_MULT = /\blife you gain|gain twice that much life\b/;
const RE_PAY_LAND_COND = /\bland(?: you control)? enters\b/;
const RE_PAY_LAND_MULT = /number of (?:lands|forests|islands|swamps|mountains|plains) you control|play lands from (?:your graveyard|the top)/;
const RE_PAY_ATK_COND = /\battacks\b/;
const RE_PAY_DMG_MULT = /\bdouble strike\b|\bcombat damage[^.]*double|\bdouble\b[^.]*combat damage/;
const RE_PAY_EQUIP_FREE = /\bequip \{0\}|\bwithout paying (?:its|their) equip\b/;
const RE_PAY_BURN_MULT = /if a [^.]+would deal damage|deals? that much damage plus|double that damage|triple that damage|lose twice that much life/;
const RE_PAY_TOPDECK = /\btop card of your library\b|\byou may (?:cast|play)[^.]*top of your library\b/;
const RE_PAY_POWER = /\bpower (?:3|4|5|6) or greater\b|\bgreatest power\b|\btotal power\b|\bpower among creatures\b|\bpower is greater than\b|\bequal to (?:its|the sacrificed creature's|target creature's) power\b|\bcosts? \{1\} less[^.]*power\b/;
const RE_KINDRED_PAYOFF = /choose a creature type|creatures you control of the chosen type/;

const SUBTYPES_TO_DETECT = [
  'Elf', 'Goblin', 'Zombie', 'Vampire', 'Dragon', 'Angel', 'Wizard', 'Sliver',
  'Human', 'Merfolk', 'Dinosaur', 'Warrior', 'Knight', 'Soldier', 'Cat', 'Dog',
  'Spirit', 'Faerie', 'Rogue', 'Assassin', 'Pirate', 'Cleric', 'Druid', 'Shaman',
  'Elemental', 'Beast', 'Treefolk', 'Saproling', 'Squirrel', 'Rat', 'Bird', 'Spider',
  'Snake', 'Frog', 'Otter', 'Rabbit', 'Eldrazi', 'Phyrexian', 'Demon', 'Horror',
  'Ally', 'Vehicle', 'Shrine', 'Saga', 'Samurai', 'Ninja', 'Giant', 'Sphinx',
  'Hydra', 'Wurm', 'Skeleton', 'Tyranid', 'Necron', 'Doctor', 'Dwarf', 'Minotaur',
  'Fox', 'Bear', 'Wolf', 'Werewolf', 'Fungus', 'Ooze', 'Construct', 'Thopter',
  'Myr', 'Golem', 'God', 'Mutant', 'Scout', 'Monk', 'Bard', 'Archer', 'Kithkin',
  'Wall', 'Crab', 'Turtle', 'Lizard', 'Mouse', 'Bat', 'Raccoon', 'Insect',
  'Equipment', 'Aura', 'Curse',
] as const;

const PLURAL_OVERRIDES: Record<string, string> = {
  Elf: 'elves|elf',
  Dwarf: 'dwarves|dwarf',
  Wolf: 'wolves|wolf',
  Werewolf: 'werewolves|werewolf',
  Fungus: 'fungi|fungus',
  Mouse: 'mice|mouse',
  Faerie: 'faeries|faerie',
  Ally: 'allies|ally',
  Zombie: 'zombies|zombie',
  Vampire: 'vampires|vampire',
  Goblin: 'goblins|goblin',
  Dragon: 'dragons|dragon',
  Angel: 'angels|angel',
  Wizard: 'wizards|wizard',
  Sliver: 'slivers|sliver',
  Dinosaur: 'dinosaurs|dinosaur',
  Warrior: 'warriors|warrior',
  Knight: 'knights|knight',
  Soldier: 'soldiers|soldier',
  Pirate: 'pirates|pirate',
  Rogue: 'rogues|rogue',
  Cleric: 'clerics|cleric',
  Druid: 'druids|druid',
  Shaman: 'shamans|shaman',
  Elemental: 'elementals|elemental',
  Human: 'humans|human',
  Spirit: 'spirits|spirit',
  Demon: 'demons|demon',
  Rat: 'rats|rat',
  Bird: 'birds|bird',
  Squirrel: 'squirrels|squirrel',
  Cat: 'cats|cat',
  Dog: 'dogs|dog',
  Snake: 'snakes|snake',
  Frog: 'frogs|frog',
  Equipment: 'equipment',
  Aura: 'auras|aura',
  Curse: 'curses|curse',
  Shrine: 'shrines|shrine',
  Saga: 'sagas|saga',
  Vehicle: 'vehicles|vehicle',
  Ninja: 'ninjas|ninja',
  Samurai: 'samurai',
  Assassin: 'assassins|assassin',
  Merfolk: 'merfolk',
  Eldrazi: 'eldrazi',
  Phyrexian: 'phyrexian|phyrexians',
  Thopter: 'thopters|thopter',
  Saproling: 'saprolings|saproling',
  Artificer: 'artificers|artificer',
  Background: 'backgrounds|background',
  Gate: 'gates|gate',
  Desert: 'deserts|desert',
};

const NON_CREATURE_SUBTYPES = new Set([
  'equipment',
  'aura',
  'curse',
  'shrine',
  'saga',
  'vehicle',
  'background',
  'treasure',
  'clue',
  'food',
  'blood',
  'map',
  'powerstone',
  'junk',
  'gate',
  'desert',
  'forest',
  'island',
  'mountain',
  'plains',
  'swamp',
  'locus',
  'cave',
]);

const SUBTYPE_BY_LOWER = new Map<string, string>();
for (const sub of SUBTYPES_TO_DETECT) {
  SUBTYPE_BY_LOWER.set(sub.toLowerCase(), sub);
}
for (const sub of POPULAR_SUBTYPES) {
  if (!SUBTYPE_BY_LOWER.has(sub.toLowerCase())) {
    SUBTYPE_BY_LOWER.set(sub.toLowerCase(), sub);
  }
}
for (const [sub, alts] of Object.entries(PLURAL_OVERRIDES)) {
  for (const alt of alts.split('|')) {
    if (!SUBTYPE_BY_LOWER.has(alt.toLowerCase())) {
      SUBTYPE_BY_LOWER.set(alt.toLowerCase(), sub);
    }
  }
}

const SUBTYPE_REGEXES = SUBTYPES_TO_DETECT.map((sub) => {
  const alts = PLURAL_OVERRIDES[sub] ?? `${sub.toLowerCase()}s?`;
  return {
    sub,
    wordRe: new RegExp(`\\b(?:${alts})\\b`, 'i'),
    tokenOnlyRe: new RegExp(`create [^.]{0,70}\\b(?:${alts})\\b[^.]{0,30}token`, 'i'),
    careRe: new RegExp(
      `(?:other|each|another|whenever [^.]{0,25})\\b(?:${alts})\\b|\\b(?:${alts}) (?:you control|spells?|cards?)\\b`,
      'i',
    ),
  };
});

function normalizePreservingNewlines(
  card: CompactCard,
  preLowerOracle?: string,
  preLowerTypeLine?: string,
): { rawLower: string; cleanLower: string; typeLower: string } {
  const rawLower = preLowerOracle ?? card.oracleText.toLowerCase();
  const typeLower = preLowerTypeLine ?? card.typeLine.toLowerCase();
  if (!rawLower) {
    return { rawLower: '', cleanLower: '', typeLower };
  }
  let t = rawLower.replace(RE_REMINDER, ' ').replace(RE_THIS_PERM, '~');
  for (const face of card.name.split(' // ')) {
    const fl = face.trim().toLowerCase();
    if (fl) t = t.replaceAll(fl, '~');
    const comma = fl.indexOf(',');
    if (comma > 0) {
      const short = fl.slice(0, comma).trim();
      if (short.length >= 4) t = t.replaceAll(short, '~');
    }
  }
  return { rawLower, cleanLower: t.replace(RE_HSPACE, ' ').trim(), typeLower };
}

function extractSubtypesLowerFast(typeLower: string): string {
  const splitIdx = typeLower.indexOf(' // ');
  if (splitIdx < 0) {
    const dash = typeLower.indexOf('—');
    return dash >= 0 ? typeLower.slice(dash + 1).trim() : '';
  }
  const f1 = typeLower.slice(0, splitIdx);
  const f2 = typeLower.slice(splitIdx + 4);
  const d1 = f1.indexOf('—');
  const d2 = f2.indexOf('—');
  const s1 = d1 >= 0 ? f1.slice(d1 + 1).trim() : '';
  const s2 = d2 >= 0 ? f2.slice(d2 + 1).trim() : '';
  return s1 && s2 ? `${s1} ${s2}` : s1 || s2;
}

/**
 * Builds directional Ripple Chain bitmasks across a card collection (~260 KB total for 32.6k cards).
 * Can run lazily on the search worker for the full catalog or instantaneously on <=100 deck cards.
 */
export function buildRippleIndex(
  cards: readonly CompactCard[],
  preLowerTypeLines?: readonly string[],
  preLowerOracles?: readonly string[],
  preSubtypesLowers?: readonly string[],
): RippleIndex {
  const len = cards.length;
  const enablerMasks = new Uint32Array(len);
  const payoffMasks = new Uint32Array(len);
  const cleanLowers = new Array<string>(len);
  const condLowers = new Array<string>(len);
  const multLowers = new Array<string>(len);
  const typeLowers = new Array<string>(len);
  const subtypesLowers = new Array<string>(len);
  const keywordLowers = new Array<string>(len);
  const freeSacFlags = new Uint8Array(len);
  const ownCastSpellPayoffFlags = new Uint8Array(len);
  const landfallTriggerFlags = new Uint8Array(len);
  const kindredGenericFlags = new Uint8Array(len);
  const staxFlags = new Uint8Array(len);
  const theftFlags = new Uint8Array(len);

  for (let i = 0; i < len; i++) {
    const card = cards[i]!;
    const { rawLower, cleanLower, typeLower } = normalizePreservingNewlines(
      card,
      preLowerOracles?.[i],
      preLowerTypeLines?.[i],
    );
    cleanLowers[i] = cleanLower;
    typeLowers[i] = typeLower;
    subtypesLowers[i] = preSubtypesLowers?.[i] ?? extractSubtypesLowerFast(typeLower);
    keywordLowers[i] =
      card.keywords.length > 0 ? card.keywords.join(' ').toLowerCase() : '';
    const themes = card.themes;
    const roles = card.roles;

    const isCreature = typeLower.includes('creature');
    const isArtifact = typeLower.includes('artifact');
    const isEnchantment = typeLower.includes('enchantment');
    const isInstant = typeLower.includes('instant');
    const isSorcery = typeLower.includes('sorcery');
    const isLand = typeLower.includes('land');
    const isPlaneswalker = typeLower.includes('planeswalker');
    const isSaga = typeLower.includes('saga');

    if (RE_KINDRED_PAYOFF.test(cleanLower) || typeLower.includes('kindred')) {
      kindredGenericFlags[i] = 1;
    }
    if (themes.includes('stax') || (cleanLower.includes('cost') || cleanLower.includes("can't") || cleanLower.includes("don't untap")) && RE_STAX_RULE.test(cleanLower)) {
      staxFlags[i] = 1;
    }
    if (themes.includes('theft') || ((cleanLower.includes('control') || cleanLower.includes('opponent')) && RE_THEFT_RULE.test(cleanLower))) {
      theftFlags[i] = 1;
    }

    let em = 0;
    let pm = 0;
    let ownCondCorpus = '';
    let condCorpus = '';
    let multCorpus = '';

    if (
      cleanLower.includes('when') ||
      cleanLower.includes(':') ||
      cleanLower.includes('at the beginning') ||
      cleanLower.includes('additional') ||
      cleanLower.includes('for each') ||
      cleanLower.includes('twice') ||
      cleanLower.includes('number of')
    ) {
      const lines = cleanLower.split('\n');
      for (let l = 0; l < lines.length; l++) {
        const line = lines[l]!;
        if (!line) continue;
        if (
          line.includes('additional') ||
          line.includes('twice') ||
          line.includes('double') ||
          line.includes('triple') ||
          line.includes('instead') ||
          line.includes('for each') ||
          line.includes('number of') ||
          line.includes('equal to') ||
          line.includes('less to cast')
        ) {
          multCorpus += `${line} `;
        }
        const trig = RE_TRIG_LINE.exec(line);
        if (trig) {
          const cnd = trig[1]!;
          condCorpus += `${cnd} `;
          if (!cnd.includes('opponent')) ownCondCorpus += `${cnd} `;
          continue;
        }
        if (RE_ACT_LINE.test(line)) {
          continue;
        }
        const step = RE_STEP_LINE.exec(line);
        if (step && step[1]) {
          condCorpus += `${step[1]} `;
          ownCondCorpus += `${step[1]} `;
        }
      }
    }

    // --- ENABLER BITS (What the card supplies / produces / fuels) ---
    if (cleanLower.includes('sacrific')) {
      if (RE_SAC_OUTLET.test(cleanLower)) em |= 1 << MECHANIC_BITS.SAC_OUTLET;
      if (RE_FREE_SAC_ACTIVATED.test(cleanLower)) freeSacFlags[i] = 1;
      if (RE_SAC_PERM.test(cleanLower)) em |= 1 << MECHANIC_BITS.SAC_PERMANENT_FODDER;
    }
    if (themes.includes('sac-outlet')) em |= 1 << MECHANIC_BITS.SAC_PERMANENT_FODDER;
    if (isCreature && (RE_CREATURE_SELF_SAC.test(rawLower) || RE_CREATURE_DIES.test(cleanLower))) {
      em |= 1 << MECHANIC_BITS.CREATURE_DIES_FODDER;
    }
    if (
      themes.includes('token-generator') ||
      ((cleanLower.includes('token') ||
        cleanLower.includes('populate') ||
        cleanLower.includes('myriad') ||
        cleanLower.includes('squad') ||
        cleanLower.includes('offspring') ||
        cleanLower.includes('amass') ||
        cleanLower.includes('investigate')) &&
        RE_TOKEN_MAKE.test(cleanLower))
    ) {
      em |= 1 << MECHANIC_BITS.TOKENS;
      if (cleanLower.includes('creature token') || cleanLower.includes('populate')) {
        em |= 1 << MECHANIC_BITS.CREATURE_DIES_FODDER;
      }
    }
    if (themes.includes('treasure') || (cleanLower.includes('treasure') && RE_TREASURE_MAKE.test(cleanLower))) {
      em |=
        (1 << MECHANIC_BITS.TREASURE) |
        (1 << MECHANIC_BITS.SAC_PERMANENT_FODDER) |
        (1 << MECHANIC_BITS.ARTIFACTS_MATTER);
    }
    if (!isLand && (isCreature || isArtifact || isEnchantment) && cleanLower.includes('when ~ enters')) {
      em |= 1 << MECHANIC_BITS.ETB_TRIGGER;
    }
    if (themes.includes('blink') || (cleanLower.includes('exile') && RE_BLINK.test(cleanLower))) {
      em |= 1 << MECHANIC_BITS.BLINK_FLICKER;
    }
    if (
      themes.includes('plus-one-counters') ||
      (cleanLower.includes('+1/+1') && RE_PLUS1_GEN.test(cleanLower)) ||
      /\bbolster\b|\bevolve\b|\bconnive\b|\bexplore\b/.test(cleanLower)
    ) {
      em |= (1 << MECHANIC_BITS.PLUS1_COUNTERS) | (1 << MECHANIC_BITS.PROLIFERATE_COUNTERS);
    }
    if (
      isPlaneswalker ||
      isSaga ||
      (rawLower.includes('counter') && RE_COUNTERS_ANY.test(rawLower)) ||
      rawLower.includes('toxic') ||
      rawLower.includes('infect')
    ) {
      em |= 1 << MECHANIC_BITS.PROLIFERATE_COUNTERS;
    }
    if (
      themes.includes('mill') ||
      ((rawLower.includes('mill') ||
        rawLower.includes('surveil') ||
        rawLower.includes('dredge') ||
        rawLower.includes('graveyard')) &&
        RE_GY_FILL.test(rawLower))
    ) {
      em |= 1 << MECHANIC_BITS.GRAVEYARD_FILL;
    }
    if (
      themes.includes('reanimator') ||
      roles.includes('recursion') ||
      (cleanLower.includes('graveyard') && RE_REANIMATE.test(cleanLower))
    ) {
      em |= 1 << MECHANIC_BITS.REANIMATE_RECUR;
    }
    if ((isInstant || isSorcery) && card.cmc <= 4) {
      em |= 1 << MECHANIC_BITS.INSTANT_SORCERY;
    }
    if (RE_SPELL_COPY.test(rawLower)) {
      em |= 1 << MECHANIC_BITS.SPELL_COPY_FORK;
      if (isInstant || isSorcery) em |= 1 << MECHANIC_BITS.INSTANT_SORCERY;
    }
    if (isArtifact || (cleanLower.includes('token') && RE_ART_TOKENS.test(cleanLower))) {
      em |= 1 << MECHANIC_BITS.ARTIFACTS_MATTER;
    }
    if (isEnchantment) em |= 1 << MECHANIC_BITS.ENCHANTMENTS_MATTER;
    if (RE_EXILE_EN.test(rawLower)) em |= 1 << MECHANIC_BITS.EXILE_CAST;
    if (
      themes.includes('wheels') ||
      ((rawLower.includes('discard') || rawLower.includes('connive') || rawLower.includes('blood token')) &&
        RE_DISCARD_EN.test(rawLower))
    ) {
      em |= 1 << MECHANIC_BITS.DISCARD_MADNESS;
    }
    if (roles.includes('draw') || themes.includes('wheels')) {
      em |= 1 << MECHANIC_BITS.CARD_DRAW;
    }
    if (cleanLower.includes('life') && RE_LIFE_REPEAT.test(cleanLower) && RE_LIFE_VAL.test(cleanLower)) {
      em |= 1 << MECHANIC_BITS.LIFEGAIN;
    }
    if (
      (isLand && cleanLower.includes('sacrific') && cleanLower.includes('search your library')) ||
      (cleanLower.includes('land') && RE_LAND_RAMP.test(cleanLower))
    ) {
      em |= 1 << MECHANIC_BITS.LANDFALL_LANDS;
    }
    if (themes.includes('extra-combat') || RE_ATK_EN.test(rawLower)) {
      em |= 1 << MECHANIC_BITS.ATTACK_COMBAT;
    }
    if (
      RE_EVADE_EN.test(rawLower) ||
      (isCreature &&
        card.cmc <= 3 &&
        (card.keywords.includes('Flying') ||
          card.keywords.includes('Menace') ||
          card.keywords.includes('Shadow') ||
          card.keywords.includes('Skulk')))
    ) {
      em |= 1 << MECHANIC_BITS.COMBAT_DAMAGE_EVASION;
    }
    if (typeLower.includes('equipment') || typeLower.includes('aura')) {
      em |= 1 << MECHANIC_BITS.EQUIPMENT_AURA;
    }
    if ((cleanLower.includes('untap') || cleanLower.includes('haste')) && RE_UNTAP_EN.test(cleanLower)) {
      em |= 1 << MECHANIC_BITS.TAP_UNTAP;
    }
    if (
      themes.includes('burn') ||
      ((cleanLower.includes('damage') || cleanLower.includes('loses')) &&
        RE_BURN_EN.test(cleanLower) &&
        (cleanLower.includes('whenever') || cleanLower.includes('at the beginning') || cleanLower.includes('{t}:')))
    ) {
      em |= 1 << MECHANIC_BITS.BURN_DRAIN;
    }
    if (themes.includes('clone') || (cleanLower.includes('copy') && RE_CLONE_EN.test(cleanLower))) {
      em |= 1 << MECHANIC_BITS.CLONE_COPY;
    }
    if (RE_TOPDECK_EN.test(rawLower)) em |= 1 << MECHANIC_BITS.TOPDECK_MATTERS;
    if (isCreature && card.cmc >= 4) em |= 1 << MECHANIC_BITS.BIG_CREATURE_POWER;
    if (roles.includes('ramp') || RE_COST_RED.test(cleanLower)) {
      em |= 1 << MECHANIC_BITS.COST_REDUCTION_BIG_MANA;
    }
    if (roles.includes('protection') || RE_PROT_EN.test(cleanLower)) {
      em |= 1 << MECHANIC_BITS.PROTECTION_INDESTRUCTIBLE;
    }

    // --- PAYOFF BITS (What the card triggers on, multiplies, or scales with) ---
    const condAndMult = `${ownCondCorpus} ${multCorpus}`;
    if (
      ownCondCorpus.includes('sacrifice') ||
      (multCorpus.includes('sacrificed') && RE_PAY_SAC_MULT.test(multCorpus))
    ) {
      pm |= 1 << MECHANIC_BITS.SAC_PERMANENT_FODDER;
      if (ownCondCorpus.includes('creature') || ownCondCorpus.includes('permanent')) {
        pm |= 1 << MECHANIC_BITS.SAC_OUTLET;
      }
    }
    if (
      (condCorpus.includes('dies') || multCorpus.includes('dying') || multCorpus.includes('died')) &&
      RE_PAY_DIES_COND.test(`${condCorpus} ${multCorpus}`)
    ) {
      pm |= (1 << MECHANIC_BITS.CREATURE_DIES_FODDER) | (1 << MECHANIC_BITS.SAC_OUTLET);
    }
    if ((condAndMult.includes('token') && !/^~$/.test(condCorpus.trim())) || RE_PAY_TOKENS.test(cleanLower)) {
      pm |= 1 << MECHANIC_BITS.TOKENS;
    }
    if (ownCondCorpus.includes('artifact') || ownCondCorpus.includes('treasure') || RE_PAY_ARTIFACTS.test(cleanLower)) {
      pm |= (1 << MECHANIC_BITS.TREASURE) | (1 << MECHANIC_BITS.ARTIFACTS_MATTER);
    }
    if (RE_PAY_ETB_DOUB.test(cleanLower) || RE_PAY_ETB_TRIG.test(ownCondCorpus)) {
      pm |= (1 << MECHANIC_BITS.ETB_TRIGGER) | (1 << MECHANIC_BITS.BLINK_FLICKER);
    }
    if (
      ownCondCorpus.includes('+1/+1 counter') ||
      (cleanLower.includes('+1/+1 counter') && RE_PAY_PLUS1_MULT.test(cleanLower))
    ) {
      pm |= 1 << MECHANIC_BITS.PLUS1_COUNTERS;
    }
    if (cleanLower.includes('proliferate') || (cleanLower.includes('counter') && RE_PAY_PROLIF.test(cleanLower))) {
      pm |= 1 << MECHANIC_BITS.PROLIFERATE_COUNTERS;
    }
    if (ownCondCorpus.includes('graveyard') || ownCondCorpus.includes('milled') || RE_PAY_GY.test(rawLower)) {
      pm |= (1 << MECHANIC_BITS.GRAVEYARD_FILL) | (1 << MECHANIC_BITS.REANIMATE_RECUR);
    }
    if (
      !isInstant &&
      !isSorcery &&
      (RE_PAY_SPELL_COND.test(condAndMult) || RE_PAY_PROWESS.test(rawLower))
    ) {
      pm |= 1 << MECHANIC_BITS.INSTANT_SORCERY;
      if (ownCondCorpus.includes('instant or sorcery') || rawLower.includes('magecraft')) {
        ownCastSpellPayoffFlags[i] = 1;
      }
    }
    if (
      ownCondCorpus.includes('copy') ||
      cleanLower.includes('instant or sorcery spell causes a triggered ability')
    ) {
      pm |= 1 << MECHANIC_BITS.SPELL_COPY_FORK;
    }
    if (
      condAndMult.includes('enchantment') ||
      condAndMult.includes('aura') ||
      condAndMult.includes('saga') ||
      RE_PAY_ENCH.test(cleanLower)
    ) {
      pm |= 1 << MECHANIC_BITS.ENCHANTMENTS_MATTER;
    }
    if (RE_PAY_EXILE.test(condAndMult)) pm |= 1 << MECHANIC_BITS.EXILE_CAST;
    if (ownCondCorpus.includes('discard') || rawLower.includes('madness')) {
      pm |= 1 << MECHANIC_BITS.DISCARD_MADNESS;
    }
    if (RE_PAY_DRAW_COND.test(ownCondCorpus) || RE_PAY_DRAW_MULT.test(cleanLower)) {
      pm |= 1 << MECHANIC_BITS.CARD_DRAW;
    }
    if (RE_PAY_LIFE_COND.test(ownCondCorpus) || RE_PAY_LIFE_MULT.test(cleanLower)) {
      pm |= 1 << MECHANIC_BITS.LIFEGAIN;
    }
    if (RE_PAY_LAND_COND.test(ownCondCorpus) || rawLower.includes('landfall') || RE_PAY_LAND_MULT.test(cleanLower)) {
      pm |= 1 << MECHANIC_BITS.LANDFALL_LANDS;
      if (rawLower.includes('landfall') || RE_PAY_LAND_COND.test(ownCondCorpus)) {
        landfallTriggerFlags[i] = 1;
      }
    }
    if (
      RE_PAY_ATK_COND.test(ownCondCorpus) ||
      cleanLower.includes('creature attacking causes') ||
      cleanLower.includes('additional combat phase')
    ) {
      pm |= 1 << MECHANIC_BITS.ATTACK_COMBAT;
    }
    if (ownCondCorpus.includes('deals combat damage') || RE_PAY_DMG_MULT.test(cleanLower)) {
      pm |= 1 << MECHANIC_BITS.COMBAT_DAMAGE_EVASION;
    }
    if (
      condAndMult.includes('equipment') ||
      condAndMult.includes('aura') ||
      condAndMult.includes('equipped') ||
      condAndMult.includes('enchanted') ||
      RE_PAY_EQUIP_FREE.test(cleanLower)
    ) {
      pm |= 1 << MECHANIC_BITS.EQUIPMENT_AURA;
    }
    if (
      (ownCondCorpus.includes('becomes tapped') ||
        ownCondCorpus.includes('untap') ||
        cleanLower.includes('activated abilities')) &&
      (cleanLower.includes('untap') || cleanLower.includes('copied') || cleanLower.includes('inspired'))
    ) {
      pm |= 1 << MECHANIC_BITS.TAP_UNTAP;
    }
    if (condCorpus.includes('opponent loses life') || condCorpus.includes('noncombat damage') || RE_PAY_BURN_MULT.test(cleanLower)) {
      pm |= 1 << MECHANIC_BITS.BURN_DRAIN;
    }
    if (
      cleanLower.includes('additional time') ||
      cleanLower.includes('activated abilities of creatures you control are copied') ||
      cleanLower.includes('copy target triggered ability')
    ) {
      pm |= 1 << MECHANIC_BITS.CLONE_COPY;
    }
    if (RE_PAY_TOPDECK.test(cleanLower)) pm |= 1 << MECHANIC_BITS.TOPDECK_MATTERS;
    if (cleanLower.includes('power') && RE_PAY_POWER.test(cleanLower)) {
      pm |= 1 << MECHANIC_BITS.BIG_CREATURE_POWER;
    }
    if (card.cmc >= 7 || card.manaCost.includes('{X}')) {
      pm |= 1 << MECHANIC_BITS.COST_REDUCTION_BIG_MANA;
    }
    if (roles.includes('wipe')) pm |= 1 << MECHANIC_BITS.PROTECTION_INDESTRUCTIBLE;

    enablerMasks[i] = em;
    payoffMasks[i] = pm;
    condLowers[i] = condCorpus ? condCorpus.trim() : '';
    multLowers[i] = multCorpus ? multCorpus.trim() : '';
  }

  return {
    enablerMasks,
    payoffMasks,
    cleanLowers,
    condLowers,
    multLowers,
    typeLowers,
    subtypesLowers,
    keywordLowers,
    freeSacFlags,
    ownCastSpellPayoffFlags,
    landfallTriggerFlags,
    kindredGenericFlags,
    staxFlags,
    theftFlags,
  };
}

function buildPlainSummarySentence(
  hooks: readonly RippleHook[],
  wantSubtypes: readonly string[],
  headline: string,
): string {
  const topEnablers = hooks
    .filter((h) => h.direction === 'need-enabler')
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 2)
    .map((h) => h.label);
  const topPayoffs = hooks
    .filter((h) => h.direction === 'need-payoff')
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 2)
    .map((h) => h.label);

  if (wantSubtypes.length > 0) {
    const tribeStr = wantSubtypes.slice(0, 2).join(' / ');
    if (topPayoffs.length > 0) {
      return `Pack ${tribeStr} cards → scale with ${topPayoffs.join(' & ')}`;
    }
    if (topEnablers.length > 0) {
      return `Fuel ${tribeStr} synergies with ${topEnablers.join(' & ')}`;
    }
    return `Build around ${tribeStr} creatures & tribal multipliers`;
  }

  if (topEnablers.length > 0 && topPayoffs.length > 0) {
    return `Feed with ${topEnablers.join(' + ')} → scale with ${topPayoffs.join(' + ')}`;
  }
  if (topEnablers.length > 0) {
    return `Fuel your engine with ${topEnablers.join(' & ')}`;
  }
  if (topPayoffs.length > 0) {
    return `Maximize output with ${topPayoffs.join(' & ')}`;
  }
  return headline;
}

/**
 * Extracts a merged Ripple Chain profile from 1 or 2 Commanders (Partner/Background)
 * or any non-commander engine seed card ("Find Similar").
 */
export function extractRippleProfile(seedCards: readonly CompactCard[]): RippleProfile {
  const hooks: RippleHook[] = [];
  const wantSubtypes = new Set<string>();
  const wantTypesInclude = new Set<string>();
  const wantTypesExclude = new Set<string>();
  let minCmcForEnablerTypes: number | undefined;

  const pushHook = (
    bit: RippleBitIndex,
    direction: 'need-enabler' | 'need-payoff',
    weight: number,
    reason: string,
  ) => {
    const key = `${direction === 'need-enabler' ? 'enabler' : 'payoff'}:${bit}`;
    const existing = hooks.find((h) => h.key === key);
    if (existing) {
      if (weight > existing.weight) {
        existing.weight = weight;
        existing.reason = reason;
      }
      return;
    }
    const label =
      direction === 'need-enabler'
        ? BIT_LABELS[bit].shortEnabler
        : BIT_LABELS[bit].shortPayoff;
    hooks.push({ key, label, bit, direction, weight, reason });
  };

  for (const seed of seedCards) {
    const { rawLower, cleanLower } = normalizePreservingNewlines(seed);
    const positiveOnly = cleanLower
      .replace(/\bnon-?(?:aura|equipment|creature|land|artifact|enchantment|token|legendary|human|elf)\b/g, (m) => {
        if (m.includes('aura')) wantTypesExclude.add('Aura');
        if (m.includes('equipment')) wantTypesExclude.add('Equipment');
        return ' ';
      })
      .replace(/\b(?:is|becomes?) a [^.]*creature/g, ' ');

    for (const subSpec of SUBTYPE_REGEXES) {
      if (wantTypesExclude.has(subSpec.sub)) continue;
      if (subSpec.wordRe.test(positiveOnly)) {
        const isOnlyTokenMention =
          subSpec.tokenOnlyRe.test(positiveOnly) && !subSpec.careRe.test(positiveOnly);
        if (!isOnlyTokenMention) {
          wantSubtypes.add(subSpec.sub);
        }
      }
    }

    if (/\bchoose a creature type\b|\bof the chosen type\b/.test(cleanLower)) {
      const dashParts = seed.typeLine.split('—');
      if (dashParts[1]) {
        for (const s of dashParts[1].trim().split(/\s+/)) {
          if (s) wantSubtypes.add(s);
        }
      }
    }

    const lines = cleanLower
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const line of lines) {
      if (
        /^(?:(?:flying|first strike|double strike|deathtouch|haste|hexproof|indestructible|lifelink|menace|reach|trample|vigilance|ward [^,]+|flash|defender|partner(?: with [^\n]+)?|friends forever|choose a background|doctor's companion)[,\s]*)+$/i.test(
          line,
        )
      ) {
        continue;
      }

      // 1. Trigger Doublers ("If X causes a triggered ability ... triggers an additional time")
      const doubler = /^if\s+(.+?)\s+causes a triggered ability\b.*\badditional time/i.exec(line);
      if (doubler) {
        const c = doubler[1]!;
        if (c.includes('attacking')) {
          pushHook(MECHANIC_BITS.ATTACK_COMBAT, 'need-payoff', 3, 'Attack trigger doubled');
          pushHook(MECHANIC_BITS.ATTACK_COMBAT, 'need-enabler', 2, 'Haste & extra combats');
        }
        if (c.includes('dying')) {
          pushHook(MECHANIC_BITS.CREATURE_DIES_FODDER, 'need-payoff', 3, 'Death trigger doubled');
          pushHook(MECHANIC_BITS.SAC_OUTLET, 'need-enabler', 3, 'Sac outlets feed death triggers');
          pushHook(MECHANIC_BITS.CREATURE_DIES_FODDER, 'need-enabler', 2, 'Disposable death fodder');
        }
        if (c.includes('entering')) {
          pushHook(MECHANIC_BITS.ETB_TRIGGER, 'need-enabler', 3, 'ETB permanent doubled');
          pushHook(MECHANIC_BITS.BLINK_FLICKER, 'need-enabler', 2, 'Blink re-triggers ETBs');
        }
        if (c.includes('instant or sorcery')) {
          pushHook(MECHANIC_BITS.INSTANT_SORCERY, 'need-payoff', 3, 'Magecraft & spell triggers doubled');
          pushHook(MECHANIC_BITS.INSTANT_SORCERY, 'need-enabler', 3, 'Cheap cantrips & spells fire triggers');
          pushHook(MECHANIC_BITS.SPELL_COPY_FORK, 'need-enabler', 2, 'Spell copies multiply Magecraft');
        }
        continue;
      }

      // Static replacement/token/counter doublers (e.g. Hardened Scales, Doubling Season, Anointed Procession)
      if (/^if [^.]+would/.test(line)) {
        if (line.includes('+1/+1 counter')) {
          pushHook(MECHANIC_BITS.PLUS1_COUNTERS, 'need-enabler', 3, 'Adds +1/+1 counters to amplify');
          pushHook(MECHANIC_BITS.PLUS1_COUNTERS, 'need-payoff', 2, 'Payoffs for +1/+1 counters');
        }
        if (line.includes('token')) {
          pushHook(MECHANIC_BITS.TOKENS, 'need-enabler', 3, 'Creates tokens to double');
          pushHook(MECHANIC_BITS.TOKENS, 'need-payoff', 2, 'Payoffs for multiplied tokens');
        }
        if (line.includes('damage')) {
          pushHook(MECHANIC_BITS.BURN_DRAIN, 'need-enabler', 3, 'Repeatable damage & burn to multiply');
        }
      }

      // 2. Proliferate
      if (/\bproliferate\b/.test(line)) {
        pushHook(
          MECHANIC_BITS.PROLIFERATE_COUNTERS,
          'need-enabler',
          3,
          'Planeswalkers, Poison & Counters to Proliferate',
        );
        pushHook(MECHANIC_BITS.PLUS1_COUNTERS, 'need-enabler', 2, '+1/+1 counters grow every turn');
        pushHook(MECHANIC_BITS.PROLIFERATE_COUNTERS, 'need-payoff', 3, 'Rewards counters & Proliferate');
        continue;
      }

      // 3. Static rule-benders & cost-reduction strategies
      if (/\badditional land/.test(line)) {
        pushHook(MECHANIC_BITS.LANDFALL_LANDS, 'need-payoff', 3, 'Landfall & lands-matter payoffs');
        pushHook(MECHANIC_BITS.LANDFALL_LANDS, 'need-enabler', 2, 'Fetchlands & land ramp');
      }
      if (/\bblitz\b/.test(rawLower) && line.includes('mana value 4 or greater')) {
        minCmcForEnablerTypes = 4;
        pushHook(MECHANIC_BITS.BIG_CREATURE_POWER, 'need-enabler', 3, '4+ MV creatures gain Blitz');
        pushHook(MECHANIC_BITS.ETB_TRIGGER, 'need-enabler', 2, 'ETB value before Blitz sacrifice');
        pushHook(MECHANIC_BITS.CREATURE_DIES_FODDER, 'need-payoff', 2, 'Rewards Blitz creature dying');
        pushHook(MECHANIC_BITS.REANIMATE_RECUR, 'need-enabler', 2, 'Recurs Blitzed threats');
      }
      if (/other (?:permanents|creatures) you control have indestructible/.test(line)) {
        pushHook(MECHANIC_BITS.PROTECTION_INDESTRUCTIBLE, 'need-payoff', 3, 'One-sided Board Wipe');
      }
      if (/other creatures you control get \+/.test(line)) {
        pushHook(MECHANIC_BITS.TOKENS, 'need-enabler', 3, 'Wide tokens maximize team anthem');
      }
      if (/\bnon-?equipment artifact\b.*\bnon-?aura enchantment\b.*mana value 4/.test(line)) {
        minCmcForEnablerTypes = 4;
        wantTypesInclude.add('Artifact');
        wantTypesInclude.add('Enchantment');
        pushHook(MECHANIC_BITS.ARTIFACTS_MATTER, 'need-enabler', 2, '4+ MV Artifact becomes 4/4 attacker');
        pushHook(MECHANIC_BITS.ENCHANTMENTS_MATTER, 'need-enabler', 2, '4+ MV Enchantment becomes 4/4 attacker');
        pushHook(MECHANIC_BITS.COMBAT_DAMAGE_EVASION, 'need-payoff', 2, 'Combat damage & extra combat scaling');
        pushHook(MECHANIC_BITS.COST_REDUCTION_BIG_MANA, 'need-enabler', 2, 'Ramp powers out 4+ MV beaters');
      }
      if (/costs? \{x\} less.*total power|total power/.test(line)) {
        pushHook(MECHANIC_BITS.BIG_CREATURE_POWER, 'need-enabler', 3, 'High-power bodies discount spell');
        pushHook(MECHANIC_BITS.BIG_CREATURE_POWER, 'need-payoff', 3, 'Rewards huge power (Draw/Fling)');
        pushHook(MECHANIC_BITS.COMBAT_DAMAGE_EVASION, 'need-enabler', 2, 'Haste / Evasion pushes huge power');
      }
      if (/you may (?:play|cast) [^.]+from (?:your|opponents') graveyard/.test(line)) {
        pushHook(MECHANIC_BITS.GRAVEYARD_FILL, 'need-enabler', 3, 'Self-mill stocks your graveyard');
        pushHook(MECHANIC_BITS.SAC_OUTLET, 'need-enabler', 2, 'Sac outlets loop permanents');
        pushHook(MECHANIC_BITS.SAC_PERMANENT_FODDER, 'need-enabler', 3, 'Fetches & self-sac permanents replay free');
        pushHook(MECHANIC_BITS.REANIMATE_RECUR, 'need-payoff', 3, 'Leaves-graveyard payoffs');
      }
      if (line.includes('top card of your library') && (line.includes('play') || line.includes('cast'))) {
        pushHook(MECHANIC_BITS.TOPDECK_MATTERS, 'need-enabler', 3, 'Scry / Shuffle / Topdeck control');
      }
      if (/spells you cast cost \{[^}]+\} less/.test(line)) {
        pushHook(MECHANIC_BITS.COST_REDUCTION_BIG_MANA, 'need-payoff', 2, 'High-MV threats discounted');
      }

      // 4. Triggered / Activated / Step clauses
      const trig = RE_TRIG_LINE.exec(line);
      const act = !trig ? RE_ACT_LINE.exec(line) : null;
      const step = !trig && !act ? RE_STEP_LINE.exec(line) : null;

      let cond = '';
      let eff = '';
      if (trig) {
        cond = trig[1]!;
        eff = trig[2]!;
      } else if (act) {
        cond = act[1]!;
        eff = act[2]!;
      } else if (step) {
        cond = step[1] ?? '';
        eff = step[2]!;
      } else {
        eff = line;
      }

      if (cond) {
        const isSelfOnly = /^~$|^~ (?:enters|attacks|dies|leaves|deals combat damage|becomes tapped)\b/.test(
          cond.trim(),
        );

        if (cond.includes('sacrifice')) {
          if (cond.includes('creature')) {
            pushHook(MECHANIC_BITS.SAC_OUTLET, 'need-enabler', 3, 'Sac outlets feed trigger');
            pushHook(MECHANIC_BITS.CREATURE_DIES_FODDER, 'need-enabler', 3, 'Disposable creature fodder');
            pushHook(MECHANIC_BITS.CREATURE_DIES_FODDER, 'need-payoff', 2, 'Death payoffs stack together');
          } else {
            pushHook(MECHANIC_BITS.SAC_PERMANENT_FODDER, 'need-enabler', 3, 'Treasures, fetches & self-sac permanents');
            pushHook(MECHANIC_BITS.TREASURE, 'need-enabler', 3, 'Treasures act as free sacrifices');
            pushHook(MECHANIC_BITS.SAC_OUTLET, 'need-enabler', 2, 'Free sacrifice outlets');
            pushHook(MECHANIC_BITS.SAC_PERMANENT_FODDER, 'need-payoff', 2, 'Rewards sacrificing permanents');
          }
        }
        if (cond.includes('dies') && !isSelfOnly) {
          pushHook(MECHANIC_BITS.SAC_OUTLET, 'need-enabler', 3, 'Sac outlets trigger death abilities');
          pushHook(MECHANIC_BITS.CREATURE_DIES_FODDER, 'need-enabler', 3, 'Death fodder & token creators');
          pushHook(MECHANIC_BITS.CREATURE_DIES_FODDER, 'need-payoff', 3, 'Death payoffs & Aristocrats drain');
        }
        if (cond.includes('enters')) {
          if (isSelfOnly) {
            if (!eff.includes('sacrifice another')) {
              pushHook(MECHANIC_BITS.BLINK_FLICKER, 'need-enabler', 2, 'Blink re-triggers ETB');
              pushHook(MECHANIC_BITS.ETB_TRIGGER, 'need-payoff', 2, 'Panharmonicon doubles ETB');
            }
          } else if (cond.includes('land')) {
            pushHook(MECHANIC_BITS.LANDFALL_LANDS, 'need-enabler', 3, 'Fetchlands & land ramp trigger Landfall');
          } else if (cond.includes('artifact')) {
            pushHook(MECHANIC_BITS.ARTIFACTS_MATTER, 'need-enabler', 3, 'Artifacts & Treasures feed trigger');
            pushHook(MECHANIC_BITS.ARTIFACTS_MATTER, 'need-payoff', 2, 'Artifact payoffs & affinity');
          } else if (cond.includes('enchantment')) {
            pushHook(MECHANIC_BITS.ENCHANTMENTS_MATTER, 'need-enabler', 3, 'Enchantments trigger Constellation');
            pushHook(MECHANIC_BITS.ENCHANTMENTS_MATTER, 'need-payoff', 2, 'Enchantress & Constellation payoffs');
          } else {
            pushHook(MECHANIC_BITS.TOKENS, 'need-enabler', 3, 'Tokens & creatures multiply ETBs');
            pushHook(MECHANIC_BITS.BLINK_FLICKER, 'need-enabler', 2, 'Blink re-triggers entering');
          }
        }
        if (/\b(?:instant or sorcery|noncreature spell)\b/.test(cond)) {
          pushHook(MECHANIC_BITS.INSTANT_SORCERY, 'need-enabler', 3, 'Cheap cantrips & spells feed trigger');
          pushHook(MECHANIC_BITS.SPELL_COPY_FORK, 'need-enabler', 2, 'Copied spells multiply Magecraft');
        }
        if ((cond.includes('enchantment') || cond.includes('aura')) && !cond.includes('non-aura')) {
          pushHook(MECHANIC_BITS.ENCHANTMENTS_MATTER, 'need-enabler', 3, 'Enchantments & Auras feed trigger');
          pushHook(MECHANIC_BITS.ENCHANTMENTS_MATTER, 'need-payoff', 2, 'Enchantress & Constellation payoffs');
        }
        if ((cond.includes('artifact') || cond.includes('equipment')) && !cond.includes('non-equipment')) {
          if (cond.includes('equipment')) {
            pushHook(MECHANIC_BITS.EQUIPMENT_AURA, 'need-enabler', 3, 'Equipment/Auras trigger engine');
          } else {
            pushHook(MECHANIC_BITS.ARTIFACTS_MATTER, 'need-enabler', 3, 'Artifacts & Treasures feed trigger');
            pushHook(MECHANIC_BITS.ARTIFACTS_MATTER, 'need-payoff', 2, 'Artifact payoffs & affinity');
          }
        }
        if (/\bfrom exile\b|\bnot cast from your hand\b/.test(cond)) {
          pushHook(MECHANIC_BITS.EXILE_CAST, 'need-enabler', 3, 'Impulse draw, Cascade & Plot feed exile');
        }
        if (/\bdraw a card|\byou draw\b/.test(cond)) {
          pushHook(MECHANIC_BITS.CARD_DRAW, 'need-enabler', 3, 'Cantrips & Wheels feed draw payoff');
        }
        if (cond.includes('gain life')) {
          pushHook(MECHANIC_BITS.LIFEGAIN, 'need-enabler', 3, 'Repeatable lifegain feeds trigger');
        }
        if (cond.includes('discard')) {
          pushHook(MECHANIC_BITS.DISCARD_MADNESS, 'need-enabler', 3, 'Wheels & looters feed discard');
        }
        if (cond.includes('attacks') || cond.includes('attack with')) {
          if (isSelfOnly) {
            pushHook(MECHANIC_BITS.ATTACK_COMBAT, 'need-enabler', 2, 'Haste, protection & extra combats');
          } else {
            pushHook(MECHANIC_BITS.ATTACK_COMBAT, 'need-enabler', 3, 'Haste & extra combats scale attacks');
            if (
              wantSubtypes.size === 0 &&
              (line.includes('token') ||
                line.includes('for each attacking') ||
                line.includes('one or more') ||
                line.includes('creature you control attacks'))
            ) {
              pushHook(MECHANIC_BITS.TOKENS, 'need-enabler', 2, 'Wide tokens maximize attack trigger');
            }
          }
        }
        if (cond.includes('combat damage')) {
          pushHook(MECHANIC_BITS.COMBAT_DAMAGE_EVASION, 'need-enabler', 3, 'Evasion / Unblockable / Double Strike');
        }
        if (cond.includes('+1/+1 counter')) {
          pushHook(MECHANIC_BITS.PLUS1_COUNTERS, 'need-enabler', 3, '+1/+1 counters feed trigger');
        }
        if (act && cond.includes('{t}')) {
          pushHook(MECHANIC_BITS.TAP_UNTAP, 'need-enabler', 3, 'Untappers & Haste double tap activations');
          pushHook(MECHANIC_BITS.CLONE_COPY, 'need-payoff', 2, 'Activated ability copiers (Rings/Bracers)');
        }
      }

      // EFFECTS -> NEED PAYOFFS!
      if (/\bcreate [^.]+treasure\b/.test(eff)) {
        pushHook(MECHANIC_BITS.TREASURE, 'need-payoff', 3, 'Treasure & Artifact ETB/Sac payoffs');
        pushHook(MECHANIC_BITS.SAC_PERMANENT_FODDER, 'need-payoff', 2, 'Rewards sacrificing Treasures');
      } else if (/\bcreate [^.]+token|\bpopulate\b/.test(eff)) {
        pushHook(MECHANIC_BITS.TOKENS, 'need-payoff', 3, 'Token doublers, ETB burn & Anthems');
      }
      if (eff.includes('+1/+1 counter')) {
        pushHook(MECHANIC_BITS.PLUS1_COUNTERS, 'need-payoff', 3, 'Hardened Scales, Doublers & Counter payoffs');
      }
      if (
        /\bdraw (?:two|three|four|five|six|seven|x|that many|additional|twice)\b|\bdraws? (?:two|three|four|five|seven|x|that many) cards?\b|\bdraw cards equal to\b/.test(
          eff,
        )
      ) {
        pushHook(MECHANIC_BITS.CARD_DRAW, 'need-payoff', 2, 'Draw doublers & draw-trigger payoffs');
      }
      if (/\byou gain [^.]+life\b/.test(eff)) {
        pushHook(MECHANIC_BITS.LIFEGAIN, 'need-payoff', 3, 'Lifegain drain & counter payoffs');
      }
      if (/\bdeals? [^.]+damage\b|\bloses? [^.]+life\b/.test(eff)) {
        pushHook(MECHANIC_BITS.BURN_DRAIN, 'need-payoff', 3, 'Damage amplifiers & life-loss payoffs');
      }
      if (eff.includes('experience counter')) {
        pushHook(MECHANIC_BITS.PROLIFERATE_COUNTERS, 'need-payoff', 1, 'Proliferate grows experience counters');
      }
      if (eff.includes('graveyard') && (eff.includes('return') || eff.includes('put'))) {
        pushHook(MECHANIC_BITS.GRAVEYARD_FILL, 'need-enabler', 3, 'Self-mill stocks your graveyard');
        pushHook(MECHANIC_BITS.SAC_OUTLET, 'need-enabler', 3, 'Sac outlets loop graveyard creatures');
        pushHook(MECHANIC_BITS.REANIMATE_RECUR, 'need-payoff', 3, 'Leaves-graveyard & death payoffs');
      }
      if (/\bmill\b|\binto your graveyard\b/.test(eff)) {
        pushHook(MECHANIC_BITS.REANIMATE_RECUR, 'need-enabler', 2, 'Reanimation turns milled cards into spells');
        pushHook(MECHANIC_BITS.GRAVEYARD_FILL, 'need-payoff', 2, 'Payoffs for stocked graveyard');
      }
      if (/\bexile the top\b[^.]*(?:play|cast)/.test(eff)) {
        pushHook(MECHANIC_BITS.EXILE_CAST, 'need-payoff', 3, 'Rewards casting spells from exile');
      }
      if (/\bcopy\b/.test(eff)) {
        pushHook(MECHANIC_BITS.SPELL_COPY_FORK, 'need-payoff', 2, 'Magecraft & copy rewards');
      }
      if (eff.includes('additional combat')) {
        pushHook(MECHANIC_BITS.ATTACK_COMBAT, 'need-payoff', 3, 'Attack & combat-damage payoffs');
      }
      if (/\bput a permanent card from your hand onto the battlefield\b/.test(eff)) {
        pushHook(MECHANIC_BITS.BIG_CREATURE_POWER, 'need-enabler', 2, 'Big beaters cheated into play free');
      }
      if (
        /\badd (?:\{[^}]+\}\{[^}]+\}\{[^}]+\}|\{x\})|\badd (?:that much mana|mana equal to)/i.test(
          eff,
        )
      ) {
        pushHook(MECHANIC_BITS.COST_REDUCTION_BIG_MANA, 'need-payoff', 2, 'High-MV threats & X-spell sinks');
      }
      if (RE_STAX_RULE.test(cleanLower) || seed.themes.includes('stax')) {
        // Handled cleanly below for Stax Commanders & Cards
      }
    }

    // Add Tribal filter hooks so power users can click the subtype pill directly
    for (const sub of wantSubtypes) {
      const tribeEnKey = `tribe-enabler:${sub}`;
      if (!hooks.some((h) => h.key === tribeEnKey)) {
        hooks.push({
          key: tribeEnKey,
          label: `${sub} Creatures`,
          bit: null,
          subtype: sub,
          direction: 'need-enabler',
          weight: 3,
          reason: `${sub} creature or changeling`,
        });
      }
      const tribePayKey = `tribe-payoff:${sub}`;
      if (!hooks.some((h) => h.key === tribePayKey)) {
        hooks.push({
          key: tribePayKey,
          label: `${sub} Payoffs`,
          bit: null,
          subtype: sub,
          direction: 'need-payoff',
          weight: 3,
          reason: `${sub} lord or Kindred payoff`,
        });
      }
    }

    // Stax / Theft / Specific Keyword-Cares rules on seed card
    if (seed.themes.includes('stax') || RE_STAX_RULE.test(cleanLower)) {
      if (!hooks.some((h) => h.key === 'special:stax')) {
        hooks.push({
          key: 'special:stax',
          label: 'Stax / Tax',
          bit: null,
          direction: 'need-payoff',
          weight: 3,
          reason: 'Resource tax & rule-setting',
        });
      }
    }
    if (seed.themes.includes('theft') || RE_THEFT_RULE.test(cleanLower)) {
      if (!hooks.some((h) => h.key === 'special:theft')) {
        hooks.push({
          key: 'special:theft',
          label: 'Theft / Steal',
          bit: null,
          direction: 'need-payoff',
          weight: 3,
          reason: 'Steals & plays opponents cards',
        });
      }
    }

    // Explicit keyword/mechanic cares on seed cards (e.g. Fynn Deathtouch, Arcades Defender, Kardur Goad, Marchesa Monarch)
    const explicitKeywordCares: Array<[RegExp, string]> = [
      [/\bwith deathtouch\b|\bgains? deathtouch\b/, 'deathtouch'],
      [/\bwith defender\b|\bas though it didn't have defender\b/, 'defender'],
      [/\bgoad\b|\bgoaded\b/, 'goad'],
      [/\bmonarch\b/, 'monarch'],
      [/\bventure into the dungeon\b|\btake the initiative\b/, 'dungeon'],
    ];
    for (const [kwRe, kwTerm] of explicitKeywordCares) {
      if (kwRe.test(cleanLower)) {
        const key = `custom:${kwTerm}`;
        if (!hooks.some((h) => h.key === key)) {
          hooks.push({
            key,
            label: titleCaseTerm(kwTerm),
            bit: null,
            customTerm: kwTerm,
            direction: 'need-payoff',
            weight: 3,
            reason: `${titleCaseTerm(kwTerm)} synergy`,
          });
        }
      }
    }

    // 5. Fallback for low-text / vanilla / keyword-only / giant beatstick / 0-1 mana legends
    if (hooks.length === 0) {
      if (seed.cmc <= 1) {
        pushHook(MECHANIC_BITS.SAC_OUTLET, 'need-enabler', 2, '0–1 mana body fuels sac/polymorph');
        pushHook(MECHANIC_BITS.EQUIPMENT_AURA, 'need-enabler', 2, 'Cheap early body wears Equipment/Auras');
      } else if (seed.cmc >= 6) {
        pushHook(MECHANIC_BITS.BIG_CREATURE_POWER, 'need-payoff', 3, 'Power-matters Draw & Fling effects');
        pushHook(MECHANIC_BITS.COST_REDUCTION_BIG_MANA, 'need-enabler', 3, 'Ramp casts expensive Commander');
      } else {
        pushHook(MECHANIC_BITS.EQUIPMENT_AURA, 'need-enabler', 2, 'Equipment/Auras amplify keywords');
        pushHook(MECHANIC_BITS.COMBAT_DAMAGE_EVASION, 'need-enabler', 2, 'Combat evasion & protection');
      }
    }
  }

  hooks.sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));

  const subtypesArr = Array.from(wantSubtypes);
  const customTermsArr = Array.from(
    new Set(hooks.map((h) => h.customTerm).filter((t): t is string => Boolean(t))),
  );
  const includeStax = hooks.some((h) => h.key === 'special:stax');
  const includeTheft = hooks.some((h) => h.key === 'special:theft');
  const defaultThemes = deriveDefaultThemesFromHooks(
    hooks,
    subtypesArr,
    customTermsArr,
    seedCards,
    includeStax,
    includeTheft,
  );
  const headline =
    subtypesArr.length > 0
      ? `${subtypesArr.slice(0, 2).join(' / ')} Typal`
      : hooks[0]?.reason ?? 'Commander Ripple Engine';

  return {
    seedIds: seedCards.map((c) => c.id),
    seedNames: seedCards.map((c) => c.name),
    archetypeHeadline: headline,
    summarySentence: buildPlainSummarySentence(hooks, subtypesArr, headline),
    hooks,
    wantSubtypes: subtypesArr,
    customTerms: customTermsArr,
    defaultThemes,
    includeStax,
    includeTheft,
    wantTypesInclude: Array.from(wantTypesInclude),
    wantTypesExclude: Array.from(wantTypesExclude),
    minCmcForEnablerTypes,
  };
}

interface ThemeHookSpec {
  bit?: RippleBitIndex;
  subtype?: string;
  special?: 'stax' | 'theft';
  direction: 'need-enabler' | 'need-payoff';
  weight: number;
  reason: string;
}

export const THEME_TO_HOOK_SPECS: Readonly<Record<string, readonly ThemeHookSpec[]>> = {
  aristocrats: [
    { bit: MECHANIC_BITS.CREATURE_DIES_FODDER, direction: 'need-payoff', weight: 3, reason: 'Death triggers & Aristocrats drain' },
    { bit: MECHANIC_BITS.SAC_OUTLET, direction: 'need-payoff', weight: 3, reason: 'Payoffs for sacrificing creatures' },
    { bit: MECHANIC_BITS.BURN_DRAIN, direction: 'need-payoff', weight: 2, reason: 'Life-loss & drain payoffs' },
    { bit: MECHANIC_BITS.SAC_OUTLET, direction: 'need-enabler', weight: 2, reason: 'Sacrifice outlets fuel Aristocrats' },
    { bit: MECHANIC_BITS.CREATURE_DIES_FODDER, direction: 'need-enabler', weight: 2, reason: 'Disposable creature fodder' },
  ],
  sacrifice: [
    { bit: MECHANIC_BITS.SAC_OUTLET, direction: 'need-enabler', weight: 3, reason: 'Sacrifice outlets' },
    { bit: MECHANIC_BITS.SAC_PERMANENT_FODDER, direction: 'need-enabler', weight: 2, reason: 'Self-sacrificing permanents & Treasures' },
    { bit: MECHANIC_BITS.SAC_PERMANENT_FODDER, direction: 'need-payoff', weight: 3, reason: 'Permanent sacrifice payoffs' },
    { bit: MECHANIC_BITS.CREATURE_DIES_FODDER, direction: 'need-payoff', weight: 2, reason: 'Death triggers' },
  ],
  'sac-outlet': [
    { bit: MECHANIC_BITS.SAC_OUTLET, direction: 'need-enabler', weight: 3, reason: 'Free & repeatable sacrifice outlets' },
    { bit: MECHANIC_BITS.SAC_OUTLET, direction: 'need-payoff', weight: 2, reason: 'Payoffs for sacrificing creatures' },
  ],
  'death-trigger': [
    { bit: MECHANIC_BITS.CREATURE_DIES_FODDER, direction: 'need-payoff', weight: 3, reason: 'Dies triggers & drain' },
    { bit: MECHANIC_BITS.CREATURE_DIES_FODDER, direction: 'need-enabler', weight: 3, reason: 'Death fodder & token creators' },
  ],
  tokens: [
    { bit: MECHANIC_BITS.TOKENS, direction: 'need-enabler', weight: 3, reason: 'Token generators' },
    { bit: MECHANIC_BITS.TOKENS, direction: 'need-payoff', weight: 3, reason: 'Token doublers & anthems' },
  ],
  'token-generator': [
    { bit: MECHANIC_BITS.TOKENS, direction: 'need-enabler', weight: 3, reason: 'Token creators' },
  ],
  'token-payoff': [
    { bit: MECHANIC_BITS.TOKENS, direction: 'need-payoff', weight: 3, reason: 'Token multipliers & anthems' },
  ],
  counters: [
    { bit: MECHANIC_BITS.PLUS1_COUNTERS, direction: 'need-enabler', weight: 2, reason: '+1/+1 counter sources' },
    { bit: MECHANIC_BITS.PLUS1_COUNTERS, direction: 'need-payoff', weight: 2, reason: '+1/+1 counter scaling' },
    { bit: MECHANIC_BITS.PROLIFERATE_COUNTERS, direction: 'need-enabler', weight: 3, reason: 'Counter permanents & planeswalkers' },
    { bit: MECHANIC_BITS.PROLIFERATE_COUNTERS, direction: 'need-payoff', weight: 3, reason: 'Proliferate & counter payoffs' },
  ],
  'plus-one-counters': [
    { bit: MECHANIC_BITS.PLUS1_COUNTERS, direction: 'need-enabler', weight: 3, reason: '+1/+1 counter generators' },
    { bit: MECHANIC_BITS.PLUS1_COUNTERS, direction: 'need-payoff', weight: 3, reason: 'Hardened Scales & counter payoffs' },
  ],
  proliferate: [
    { bit: MECHANIC_BITS.PROLIFERATE_COUNTERS, direction: 'need-payoff', weight: 3, reason: 'Proliferate & counter multipliers' },
    { bit: MECHANIC_BITS.PROLIFERATE_COUNTERS, direction: 'need-enabler', weight: 3, reason: 'Counters, Planeswalkers & Poison' },
    { bit: MECHANIC_BITS.PLUS1_COUNTERS, direction: 'need-enabler', weight: 2, reason: '+1/+1 counter sources' },
  ],
  graveyard: [
    { bit: MECHANIC_BITS.GRAVEYARD_FILL, direction: 'need-enabler', weight: 3, reason: 'Self-mill & entomb effects' },
    { bit: MECHANIC_BITS.GRAVEYARD_FILL, direction: 'need-payoff', weight: 2, reason: 'Graveyard threshold & scaling' },
    { bit: MECHANIC_BITS.REANIMATE_RECUR, direction: 'need-enabler', weight: 3, reason: 'Reanimation & recursion' },
    { bit: MECHANIC_BITS.REANIMATE_RECUR, direction: 'need-payoff', weight: 2, reason: 'Leaves-graveyard payoffs' },
  ],
  reanimator: [
    { bit: MECHANIC_BITS.REANIMATE_RECUR, direction: 'need-enabler', weight: 3, reason: 'Reanimation & recursion spells' },
    { bit: MECHANIC_BITS.REANIMATE_RECUR, direction: 'need-payoff', weight: 3, reason: 'Leaves-graveyard & graveyard payoffs' },
  ],
  mill: [
    { bit: MECHANIC_BITS.GRAVEYARD_FILL, direction: 'need-enabler', weight: 3, reason: 'Self-mill & graveyard fillers' },
    { bit: MECHANIC_BITS.GRAVEYARD_FILL, direction: 'need-payoff', weight: 3, reason: 'Mill & graveyard payoffs' },
  ],
  discard: [
    { bit: MECHANIC_BITS.DISCARD_MADNESS, direction: 'need-enabler', weight: 3, reason: 'Looters, wheels & discard outlets' },
    { bit: MECHANIC_BITS.DISCARD_MADNESS, direction: 'need-payoff', weight: 3, reason: 'Discard & Madness payoffs' },
  ],
  spellslinger: [
    { bit: MECHANIC_BITS.INSTANT_SORCERY, direction: 'need-enabler', weight: 2, reason: 'Cheap instants, sorceries & cantrips' },
    { bit: MECHANIC_BITS.INSTANT_SORCERY, direction: 'need-payoff', weight: 3, reason: 'Spellslinger & Magecraft payoffs' },
    { bit: MECHANIC_BITS.SPELL_COPY_FORK, direction: 'need-enabler', weight: 2, reason: 'Spell copiers & flashback' },
    { bit: MECHANIC_BITS.SPELL_COPY_FORK, direction: 'need-payoff', weight: 2, reason: 'Magecraft & copy triggers' },
  ],
  magecraft: [
    { bit: MECHANIC_BITS.INSTANT_SORCERY, direction: 'need-payoff', weight: 3, reason: 'Magecraft & own-cast triggers' },
    { bit: MECHANIC_BITS.SPELL_COPY_FORK, direction: 'need-payoff', weight: 3, reason: 'Spell-copy multipliers' },
    { bit: MECHANIC_BITS.INSTANT_SORCERY, direction: 'need-enabler', weight: 2, reason: 'Cheap spells & cantrips' },
  ],
  cantrip: [
    { bit: MECHANIC_BITS.INSTANT_SORCERY, direction: 'need-enabler', weight: 3, reason: 'Cheap instants & sorceries' },
  ],
  'spell-copy': [
    { bit: MECHANIC_BITS.SPELL_COPY_FORK, direction: 'need-enabler', weight: 3, reason: 'Forks, Flashback & Storm' },
    { bit: MECHANIC_BITS.SPELL_COPY_FORK, direction: 'need-payoff', weight: 3, reason: 'Spell-copy triggers' },
  ],
  'exile-cast': [
    { bit: MECHANIC_BITS.EXILE_CAST, direction: 'need-enabler', weight: 3, reason: 'Impulse draw, Cascade & Plot' },
    { bit: MECHANIC_BITS.EXILE_CAST, direction: 'need-payoff', weight: 3, reason: 'Cast-from-exile payoffs' },
  ],
  burn: [
    { bit: MECHANIC_BITS.BURN_DRAIN, direction: 'need-enabler', weight: 3, reason: 'Repeatable pingers & drain' },
    { bit: MECHANIC_BITS.BURN_DRAIN, direction: 'need-payoff', weight: 3, reason: 'Damage doublers & amplifiers' },
  ],
  blink: [
    { bit: MECHANIC_BITS.BLINK_FLICKER, direction: 'need-enabler', weight: 3, reason: 'Blink & flicker effects' },
    { bit: MECHANIC_BITS.ETB_TRIGGER, direction: 'need-enabler', weight: 2, reason: 'ETB value permanents' },
    { bit: MECHANIC_BITS.BLINK_FLICKER, direction: 'need-payoff', weight: 2, reason: 'ETB & blink triggers' },
  ],
  'etb-trigger': [
    { bit: MECHANIC_BITS.ETB_TRIGGER, direction: 'need-enabler', weight: 3, reason: 'ETB value permanents' },
    { bit: MECHANIC_BITS.ETB_TRIGGER, direction: 'need-payoff', weight: 3, reason: 'Panharmonicon & ETB triggers' },
  ],
  panharmonicon: [
    { bit: MECHANIC_BITS.ETB_TRIGGER, direction: 'need-payoff', weight: 3, reason: 'ETB & trigger doublers' },
    { bit: MECHANIC_BITS.CLONE_COPY, direction: 'need-payoff', weight: 2, reason: 'Triggered ability doublers' },
    { bit: MECHANIC_BITS.ETB_TRIGGER, direction: 'need-enabler', weight: 2, reason: 'ETB creatures to double' },
  ],
  enchantress: [
    { bit: MECHANIC_BITS.ENCHANTMENTS_MATTER, direction: 'need-payoff', weight: 3, reason: 'Enchantress & Constellation payoffs' },
    { bit: MECHANIC_BITS.ENCHANTMENTS_MATTER, direction: 'need-enabler', weight: 2, reason: 'Enchantments & Auras' },
  ],
  auras: [
    { bit: MECHANIC_BITS.EQUIPMENT_AURA, direction: 'need-enabler', weight: 3, reason: 'Auras & enchantment voltron pieces' },
    { bit: MECHANIC_BITS.EQUIPMENT_AURA, direction: 'need-payoff', weight: 2, reason: 'Aura-matters payoffs' },
    { bit: MECHANIC_BITS.ENCHANTMENTS_MATTER, direction: 'need-payoff', weight: 2, reason: 'Enchantress draw engines' },
  ],
  artifacts: [
    { bit: MECHANIC_BITS.ARTIFACTS_MATTER, direction: 'need-enabler', weight: 2, reason: 'Artifacts & artifact tokens' },
    { bit: MECHANIC_BITS.ARTIFACTS_MATTER, direction: 'need-payoff', weight: 3, reason: 'Artifact-matters & affinity payoffs' },
  ],
  treasure: [
    { bit: MECHANIC_BITS.TREASURE, direction: 'need-enabler', weight: 3, reason: 'Treasure generators' },
    { bit: MECHANIC_BITS.TREASURE, direction: 'need-payoff', weight: 3, reason: 'Treasure & artifact payoffs' },
    { bit: MECHANIC_BITS.SAC_PERMANENT_FODDER, direction: 'need-payoff', weight: 2, reason: 'Sacrifice payoffs for Treasures' },
  ],
  equipment: [
    { bit: MECHANIC_BITS.EQUIPMENT_AURA, direction: 'need-enabler', weight: 3, reason: 'Equipment' },
    { bit: MECHANIC_BITS.EQUIPMENT_AURA, direction: 'need-payoff', weight: 3, reason: 'Free equip & Equipment payoffs' },
  ],
  vehicles: [
    { subtype: 'Vehicle', direction: 'need-enabler', weight: 3, reason: 'Vehicles' },
    { bit: MECHANIC_BITS.TAP_UNTAP, direction: 'need-enabler', weight: 2, reason: 'Untappers & crew enablers' },
    { bit: MECHANIC_BITS.ATTACK_COMBAT, direction: 'need-enabler', weight: 2, reason: 'Combat & extra combats' },
  ],
  voltron: [
    { bit: MECHANIC_BITS.EQUIPMENT_AURA, direction: 'need-enabler', weight: 3, reason: 'Equipment & Auras' },
    { bit: MECHANIC_BITS.EQUIPMENT_AURA, direction: 'need-payoff', weight: 3, reason: 'Attached-permanent payoffs' },
    { bit: MECHANIC_BITS.COMBAT_DAMAGE_EVASION, direction: 'need-enabler', weight: 2, reason: 'Evasion & Double Strike' },
  ],
  'attack-trigger': [
    { bit: MECHANIC_BITS.ATTACK_COMBAT, direction: 'need-payoff', weight: 3, reason: 'Attack triggers & payoffs' },
    { bit: MECHANIC_BITS.ATTACK_COMBAT, direction: 'need-enabler', weight: 2, reason: 'Haste & extra combats' },
  ],
  'extra-combat': [
    { bit: MECHANIC_BITS.ATTACK_COMBAT, direction: 'need-enabler', weight: 3, reason: 'Extra combat steps & haste' },
    { bit: MECHANIC_BITS.ATTACK_COMBAT, direction: 'need-payoff', weight: 2, reason: 'Attack triggers' },
  ],
  'combat-damage-trigger': [
    { bit: MECHANIC_BITS.COMBAT_DAMAGE_EVASION, direction: 'need-payoff', weight: 3, reason: 'Combat-damage triggers' },
    { bit: MECHANIC_BITS.COMBAT_DAMAGE_EVASION, direction: 'need-enabler', weight: 3, reason: 'Unblockable, flying & Double Strike' },
  ],
  'tap-untap': [
    { bit: MECHANIC_BITS.TAP_UNTAP, direction: 'need-enabler', weight: 3, reason: 'Untappers & haste' },
    { bit: MECHANIC_BITS.TAP_UNTAP, direction: 'need-payoff', weight: 3, reason: 'Tap & inspired payoffs' },
  ],
  'power-matters': [
    { bit: MECHANIC_BITS.BIG_CREATURE_POWER, direction: 'need-enabler', weight: 3, reason: 'High-power creatures' },
    { bit: MECHANIC_BITS.BIG_CREATURE_POWER, direction: 'need-payoff', weight: 3, reason: 'Power-matters draw, Fling & discounts' },
  ],
  lifegain: [
    { bit: MECHANIC_BITS.LIFEGAIN, direction: 'need-enabler', weight: 3, reason: 'Repeatable lifegain sources' },
    { bit: MECHANIC_BITS.LIFEGAIN, direction: 'need-payoff', weight: 3, reason: 'Lifegain triggers & drain' },
  ],
  'lifegain-payoff': [
    { bit: MECHANIC_BITS.LIFEGAIN, direction: 'need-payoff', weight: 3, reason: 'Lifegain payoffs & drain' },
    { bit: MECHANIC_BITS.LIFEGAIN, direction: 'need-enabler', weight: 2, reason: 'Repeatable lifegain sources' },
  ],
  landfall: [
    { bit: MECHANIC_BITS.LANDFALL_LANDS, direction: 'need-payoff', weight: 3, reason: 'Landfall triggers & payoffs' },
    { bit: MECHANIC_BITS.LANDFALL_LANDS, direction: 'need-enabler', weight: 3, reason: 'Fetchlands & land ramp' },
  ],
  'lands-matter': [
    { bit: MECHANIC_BITS.LANDFALL_LANDS, direction: 'need-enabler', weight: 3, reason: 'Extra land drops & land ramp' },
    { bit: MECHANIC_BITS.LANDFALL_LANDS, direction: 'need-payoff', weight: 3, reason: 'Lands-in-graveyard & Landfall payoffs' },
  ],
  wheels: [
    { bit: MECHANIC_BITS.DISCARD_MADNESS, direction: 'need-enabler', weight: 3, reason: 'Wheels & discard outlets' },
    { bit: MECHANIC_BITS.CARD_DRAW, direction: 'need-enabler', weight: 3, reason: 'Wheel draw engines' },
    { bit: MECHANIC_BITS.CARD_DRAW, direction: 'need-payoff', weight: 2, reason: 'Draw-trigger payoffs' },
    { bit: MECHANIC_BITS.DISCARD_MADNESS, direction: 'need-payoff', weight: 2, reason: 'Discard payoffs' },
  ],
  'draw-payoff': [
    { bit: MECHANIC_BITS.CARD_DRAW, direction: 'need-payoff', weight: 3, reason: 'Rewards drawing cards' },
    { bit: MECHANIC_BITS.CARD_DRAW, direction: 'need-enabler', weight: 2, reason: 'Card draw engines' },
  ],
  topdeck: [
    { bit: MECHANIC_BITS.TOPDECK_MATTERS, direction: 'need-enabler', weight: 3, reason: 'Scry & topdeck manipulation' },
    { bit: MECHANIC_BITS.TOPDECK_MATTERS, direction: 'need-payoff', weight: 3, reason: 'Cast & play from top of library' },
  ],
  'big-mana': [
    { bit: MECHANIC_BITS.COST_REDUCTION_BIG_MANA, direction: 'need-enabler', weight: 3, reason: 'Cost reducers & mana multipliers' },
    { bit: MECHANIC_BITS.COST_REDUCTION_BIG_MANA, direction: 'need-payoff', weight: 3, reason: 'High-MV threats & X-spells' },
  ],
  stax: [
    { special: 'stax', direction: 'need-payoff', weight: 3, reason: 'Stax, tax & resource locks' },
  ],
  clone: [
    { bit: MECHANIC_BITS.CLONE_COPY, direction: 'need-enabler', weight: 3, reason: 'Clones & token copies' },
    { bit: MECHANIC_BITS.CLONE_COPY, direction: 'need-payoff', weight: 3, reason: 'Trigger & ability doublers' },
  ],
  theft: [
    { special: 'theft', direction: 'need-payoff', weight: 3, reason: 'Steals permanents & spells' },
  ],
};

function titleCaseTerm(term: string): string {
  return term
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function formatRippleThemeLabel(themeId: string): string {
  if (themeId.startsWith('tribe:')) {
    const sub = themeId.slice('tribe:'.length).trim();
    return `${sub} Typal`;
  }
  if (themeId.startsWith('custom:')) {
    return titleCaseTerm(themeId.slice('custom:'.length).trim());
  }
  return THEME_BY_ID[themeId]?.label ?? titleCaseTerm(themeId.replace(/-/g, ' '));
}

/**
 * Resolves free-form user input in the Ripple box into a canonical theme ID:
 * - known mechanical themes ('Aristocrats', 'Landfall', 'Cascade' -> 'exile-cast')
 * - subtypes ('Rat', 'Sliver', 'Gates' -> 'tribe:Rat', 'tribe:Sliver', 'tribe:Gate')
 * - any custom keyword or rules phrase ('Deathtouch', 'Monarch' -> 'custom:deathtouch', 'custom:monarch')
 */
export function resolveCanonicalThemeInput(rawInput: string): string | null {
  const cleaned = rawInput.trim();
  if (!cleaned) return null;
  if (cleaned.startsWith('tribe:')) {
    const subRaw = cleaned.slice('tribe:'.length).trim();
    const canonical = SUBTYPE_BY_LOWER.get(subRaw.toLowerCase()) ?? titleCaseTerm(subRaw);
    return canonical ? `tribe:${canonical}` : null;
  }
  if (cleaned.startsWith('custom:')) {
    const term = cleaned.slice('custom:'.length).trim().toLowerCase();
    return term ? `custom:${term}` : null;
  }

  const lower = cleaned.toLowerCase();
  const normalizedId = lower.replace(/\s+/g, '-');
  if (THEME_BY_ID[lower]) return lower;
  if (THEME_BY_ID[normalizedId]) return normalizedId;

  for (const [id, meta] of Object.entries(THEME_BY_ID)) {
    if (meta.label.toLowerCase() === lower) return id;
  }

  const syn = THEME_SYNONYMS[lower];
  if (syn && syn.primaryThemes.length > 0) {
    return syn.primaryThemes[0]!;
  }

  const subtypeMatch = SUBTYPE_BY_LOWER.get(lower);
  if (subtypeMatch) {
    // Prefer dedicated theme id if it's e.g. "Vehicles" -> "vehicles" or "Equipment" -> "equipment"
    if (subtypeMatch === 'Vehicle') return 'vehicles';
    if (subtypeMatch === 'Equipment') return 'equipment';
    if (subtypeMatch === 'Aura') return 'auras';
    return `tribe:${subtypeMatch}`;
  }

  return `custom:${lower}`;
}

function mapHookToThemeId(hook: RippleHook, seedOracleLower: string): string | null {
  if (hook.subtype) return `tribe:${hook.subtype}`;
  if (hook.customTerm) return `custom:${hook.customTerm}`;
  if (hook.key === 'special:stax') return 'stax';
  if (hook.key === 'special:theft') return 'theft';
  switch (hook.bit) {
    case MECHANIC_BITS.SAC_OUTLET:
      return 'sac-outlet';
    case MECHANIC_BITS.SAC_PERMANENT_FODDER:
      return 'sacrifice';
    case MECHANIC_BITS.CREATURE_DIES_FODDER:
      return 'death-trigger';
    case MECHANIC_BITS.TOKENS:
      return 'tokens';
    case MECHANIC_BITS.TREASURE:
      return 'treasure';
    case MECHANIC_BITS.ETB_TRIGGER:
      return 'etb-trigger';
    case MECHANIC_BITS.BLINK_FLICKER:
      return 'blink';
    case MECHANIC_BITS.PLUS1_COUNTERS:
      return 'plus-one-counters';
    case MECHANIC_BITS.PROLIFERATE_COUNTERS:
      return 'proliferate';
    case MECHANIC_BITS.GRAVEYARD_FILL:
      return 'mill';
    case MECHANIC_BITS.REANIMATE_RECUR:
      return 'reanimator';
    case MECHANIC_BITS.INSTANT_SORCERY:
      return 'spellslinger';
    case MECHANIC_BITS.SPELL_COPY_FORK:
      return 'spell-copy';
    case MECHANIC_BITS.ARTIFACTS_MATTER:
      return 'artifacts';
    case MECHANIC_BITS.ENCHANTMENTS_MATTER:
      return 'enchantress';
    case MECHANIC_BITS.EXILE_CAST:
      return 'exile-cast';
    case MECHANIC_BITS.DISCARD_MADNESS:
      return 'discard';
    case MECHANIC_BITS.CARD_DRAW:
      return 'draw-payoff';
    case MECHANIC_BITS.LIFEGAIN:
      return 'lifegain';
    case MECHANIC_BITS.LANDFALL_LANDS:
      return 'landfall';
    case MECHANIC_BITS.ATTACK_COMBAT:
      return 'attack-trigger';
    case MECHANIC_BITS.COMBAT_DAMAGE_EVASION:
      return 'combat-damage-trigger';
    case MECHANIC_BITS.EQUIPMENT_AURA:
      if (seedOracleLower.includes('aura') && !seedOracleLower.includes('equipment')) {
        return 'auras';
      }
      if (seedOracleLower.includes('equipment') && !seedOracleLower.includes('aura')) {
        return 'equipment';
      }
      return 'voltron';
    case MECHANIC_BITS.TAP_UNTAP:
      return 'tap-untap';
    case MECHANIC_BITS.BURN_DRAIN:
      return 'burn';
    case MECHANIC_BITS.CLONE_COPY:
      return 'clone';
    case MECHANIC_BITS.TOPDECK_MATTERS:
      return 'topdeck';
    case MECHANIC_BITS.BIG_CREATURE_POWER:
      return 'power-matters';
    case MECHANIC_BITS.COST_REDUCTION_BIG_MANA:
      return 'big-mana';
    case MECHANIC_BITS.PROTECTION_INDESTRUCTIBLE:
      return 'voltron';
    default:
      return null;
  }
}

function deriveDefaultThemesFromHooks(
  hooks: readonly RippleHook[],
  subtypes: readonly string[],
  customTerms: readonly string[],
  seedCards: readonly CompactCard[],
  includeStax: boolean,
  includeTheft: boolean,
): string[] {
  const result: string[] = [];
  const pushUnique = (id: string | null) => {
    if (id && !result.includes(id)) {
      result.push(id);
    }
  };

  for (const sub of subtypes) {
    pushUnique(`tribe:${sub}`);
  }
  for (const term of customTerms) {
    pushUnique(`custom:${term}`);
  }
  if (includeStax) pushUnique('stax');
  if (includeTheft) pushUnique('theft');

  const seedOracleLower = seedCards.map((c) => c.oracleText.toLowerCase()).join('\n');
  for (const h of hooks) {
    if (h.weight < 2 && result.length > 0) continue;
    pushUnique(mapHookToThemeId(h, seedOracleLower));
    if (result.length >= 5) break;
  }

  if (result.length === 0) {
    for (const h of hooks) {
      pushUnique(mapHookToThemeId(h, seedOracleLower));
      if (result.length >= 4) break;
    }
  }

  return result;
}

/**
 * Builds a unified RippleProfile combining optional seed cards (Commander / Find Similar)
 * with user-editable active theme IDs and/or free-text themeQuery.
 * When activeThemes & themeQuery are empty, preserves extractRippleProfile(seedCards) verbatim.
 */
export function buildMergedRippleProfile(
  seedCards: readonly CompactCard[],
  activeThemes: readonly string[],
  themeQuery = '',
): RippleProfile | null {
  const trimmedQuery = themeQuery.trim();
  if (seedCards.length === 0 && activeThemes.length === 0 && !trimmedQuery) {
    return null;
  }

  if (activeThemes.length === 0 && !trimmedQuery && seedCards.length > 0) {
    return extractRippleProfile(seedCards);
  }

  // Inherit seed identity / structural exclusions (e.g. Bello's non-Aura / non-Equipment 4+ MV constraint)
  const wantTypesInclude = new Set<string>();
  const wantTypesExclude = new Set<string>();
  let minCmcForEnablerTypes: number | undefined;
  if (seedCards.length > 0) {
    const baseSeedProfile = extractRippleProfile(seedCards);
    for (const t of baseSeedProfile.wantTypesInclude) wantTypesInclude.add(t);
    for (const t of baseSeedProfile.wantTypesExclude) wantTypesExclude.add(t);
    minCmcForEnablerTypes = baseSeedProfile.minCmcForEnablerTypes;
  }

  const hooks: RippleHook[] = [];
  const wantSubtypes = new Set<string>();
  const customTerms = new Set<string>();
  const normalizedThemeIds: string[] = [];
  let includeStax = false;
  let includeTheft = false;

  const pushHook = (
    bit: RippleBitIndex | null,
    direction: 'need-enabler' | 'need-payoff',
    weight: number,
    reason: string,
    opts?: { key?: string; label?: string; subtype?: string; customTerm?: string },
  ) => {
    const key =
      opts?.key ??
      `${direction === 'need-enabler' ? 'enabler' : 'payoff'}:${bit}`;
    const existing = hooks.find((h) => h.key === key);
    if (existing) {
      if (weight > existing.weight) {
        existing.weight = weight;
        existing.reason = reason;
      }
      return;
    }
    const label =
      opts?.label ??
      (bit !== null
        ? direction === 'need-enabler'
          ? BIT_LABELS[bit].shortEnabler
          : BIT_LABELS[bit].shortPayoff
        : reason);
    hooks.push({
      key,
      label,
      bit,
      subtype: opts?.subtype,
      customTerm: opts?.customTerm,
      direction,
      weight,
      reason,
    });
  };

  const applyCanonicalTheme = (rawThemeId: string, weightScale = 1) => {
    const themeId = rawThemeId.trim();
    if (!themeId) return;
    if (!normalizedThemeIds.includes(themeId)) {
      normalizedThemeIds.push(themeId);
    }

    if (themeId.startsWith('tribe:')) {
      const rawSub = themeId.slice('tribe:'.length).trim();
      const canonicalSub = SUBTYPE_BY_LOWER.get(rawSub.toLowerCase()) ?? titleCaseTerm(rawSub);
      if (canonicalSub) {
        wantSubtypes.add(canonicalSub);
        pushHook(null, 'need-enabler', Math.max(1, Math.round(3 * weightScale)), `${canonicalSub} creature or changeling`, {
          key: `tribe-enabler:${canonicalSub}`,
          label: `${canonicalSub} Creatures`,
          subtype: canonicalSub,
        });
        pushHook(null, 'need-payoff', Math.max(1, Math.round(3 * weightScale)), `${canonicalSub} lord or Kindred payoff`, {
          key: `tribe-payoff:${canonicalSub}`,
          label: `${canonicalSub} Payoffs`,
          subtype: canonicalSub,
        });
      }
      return;
    }

    if (themeId.startsWith('custom:')) {
      const term = themeId.slice('custom:'.length).trim().toLowerCase();
      if (term) {
        customTerms.add(term);
        pushHook(null, 'need-enabler', 3, `${titleCaseTerm(term)} cards`, {
          key: `custom-enabler:${term}`,
          label: titleCaseTerm(term),
          customTerm: term,
        });
        pushHook(null, 'need-payoff', 3, `${titleCaseTerm(term)} synergy`, {
          key: `custom-payoff:${term}`,
          label: `${titleCaseTerm(term)} Payoffs`,
          customTerm: term,
        });
      }
      return;
    }

    const specs = THEME_TO_HOOK_SPECS[themeId];
    if (specs) {
      for (const spec of specs) {
        const w = Math.max(1, Math.round(spec.weight * weightScale));
        if (spec.special === 'stax') {
          includeStax = true;
          pushHook(null, spec.direction, w, spec.reason, {
            key: 'special:stax',
            label: 'Stax / Tax',
          });
        } else if (spec.special === 'theft') {
          includeTheft = true;
          pushHook(null, spec.direction, w, spec.reason, {
            key: 'special:theft',
            label: 'Theft / Steal',
          });
        } else if (spec.subtype) {
          wantSubtypes.add(spec.subtype);
          pushHook(null, spec.direction, w, spec.reason, {
            key: `tribe-enabler:${spec.subtype}`,
            label: `${spec.subtype} Cards`,
            subtype: spec.subtype,
          });
        } else if (spec.bit !== undefined) {
          pushHook(spec.bit, spec.direction, w, spec.reason);
        }
      }
      return;
    }

    const subMatch = SUBTYPE_BY_LOWER.get(themeId.toLowerCase());
    if (subMatch) {
      applyCanonicalTheme(`tribe:${subMatch}`, weightScale);
      return;
    }

    applyCanonicalTheme(`custom:${themeId.toLowerCase()}`, weightScale);
  };

  const rawThemeGroups: string[][] = [];

  for (const themeId of activeThemes) {
    const trimmed = themeId.trim();
    if (!trimmed) continue;
    const beforeLen = normalizedThemeIds.length;
    applyCanonicalTheme(trimmed, 1);
    const added = normalizedThemeIds.slice(beforeLen);
    if (added.length > 0) {
      rawThemeGroups.push(added);
    }
  }

  if (trimmedQuery) {
    const normalizedQuery = trimmedQuery
      .toLowerCase()
      .replace(/\+1\/\+1/g, ' counters ')
      .replace(/[^a-z0-9\s:-]/g, ' ')
      .trim();

    for (const word of normalizedQuery.split(/\s+/)) {
      if (!word || word.length < 2) continue;
      if (word === 'and' || word === 'or' || word === 'with' || word === 'the' || word === 'for') {
        continue;
      }
      if (THEME_TO_HOOK_SPECS[word]) {
        applyCanonicalTheme(word, 1);
        rawThemeGroups.push([word]);
        continue;
      }
      const syn = THEME_SYNONYMS[word];
      if (syn) {
        const groupIds: string[] = [];
        for (const t of syn.primaryThemes) {
          applyCanonicalTheme(t, 1);
          groupIds.push(t);
        }
        for (const t of syn.secondaryThemes ?? []) applyCanonicalTheme(t, 0.5);
        if (groupIds.length > 0) {
          rawThemeGroups.push(groupIds);
        }
        continue;
      }
      if (THEME_BY_ID[word]) {
        applyCanonicalTheme(word, 1);
        rawThemeGroups.push([word]);
        continue;
      }
      const subMatch = SUBTYPE_BY_LOWER.get(word);
      if (subMatch) {
        const tid = `tribe:${subMatch}`;
        applyCanonicalTheme(tid, 1);
        rawThemeGroups.push([tid]);
        continue;
      }
      const cid = `custom:${word}`;
      applyCanonicalTheme(cid, 1);
      rawThemeGroups.push([cid]);
    }
  }

  if (hooks.length === 0) return null;
  hooks.sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));

  const subtypesArr = Array.from(wantSubtypes);
  const customTermsArr = Array.from(customTerms);
  const headline =
    normalizedThemeIds.length > 0
      ? normalizedThemeIds.slice(0, 3).map(formatRippleThemeLabel).join(' + ')
      : hooks[0]?.reason ?? 'Custom Ripple Engine';

  return {
    seedIds: seedCards.map((c) => c.id),
    seedNames: seedCards.map((c) => c.name),
    archetypeHeadline: headline,
    summarySentence: buildPlainSummarySentence(hooks, subtypesArr, headline),
    hooks,
    wantSubtypes: subtypesArr,
    customTerms: customTermsArr,
    defaultThemes: normalizedThemeIds,
    themeGroups: rawThemeGroups,
    includeStax,
    includeTheft,
    wantTypesInclude: Array.from(wantTypesInclude),
    wantTypesExclude: Array.from(wantTypesExclude),
    minCmcForEnablerTypes,
  };
}

function escapeRegexLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compileSubtypeMatcher(sub: string): CompiledSubtypeMatcher {
  const subLower = sub.toLowerCase();
  const override = PLURAL_OVERRIDES[sub];
  const alts = override ?? `${subLower}s?`;
  const forms = override ? override.split('|') : [subLower];
  const stem1 = forms[0] ?? subLower;
  const stem2 = forms[1] ?? stem1;
  return {
    sub,
    subLower,
    isCreatureTribe: !NON_CREATURE_SUBTYPES.has(subLower),
    stem1,
    stem2,
    wordRe: new RegExp(`\\b(?:${alts})\\b`),
    tokenMakeRe: new RegExp(`create [^.]{0,70}\\b(?:${alts})\\b[^.]{0,30}token`),
    careRe: new RegExp(
      `(?:other|each|another|all|whenever [^.]{0,35}|for each|number of|creature type|type is chosen)\\b[^.\\n]*\\b(?:${alts})\\b|\\b(?:${alts})\\b (?:you control|spells?|cards?|cost|get \\+|have|gain)`,
    ),
  };
}

function compileCustomTermMatcher(raw: string): CompiledCustomTermMatcher {
  const clean = raw.trim().toLowerCase();
  const escaped = escapeRegexLiteral(clean);
  const firstWord = clean.split(/\s+/)[0] ?? clean;
  return {
    raw: clean,
    label: titleCaseTerm(clean),
    stem: firstWord.length >= 3 ? firstWord.slice(0, Math.min(firstWord.length, 6)) : firstWord,
    wordRe: new RegExp(`\\b${escaped}s?\\b`, 'i'),
    careRe: new RegExp(
      `(?:other|each|another|whenever [^.]{0,35}|for each|number of|creatures you control with)\\b[^.\\n]*\\b${escaped}s?\\b|\\b${escaped}s?\\b (?:you control|counters?|triggers?|cost)`,
      'i',
    ),
  };
}

/**
 * Compiles a fast bitmask matcher for `CardSearchEngine.search()` given mode, optional hookKey, and price cap.
 */
export function prepareRippleMatcher(
  profile: RippleProfile,
  mode: RippleMode,
  hookKey: string | null,
  maxPriceUsd: number | null,
): RippleMatcher {
  let neededEnablerBits = 0;
  let neededPayoffBits = 0;
  const enablerWeights: number[] = new Array(32).fill(0);
  const payoffWeights: number[] = new Array(32).fill(0);

  let activeSubtypes = profile.wantSubtypes;
  let activeCustomTerms = profile.customTerms;
  let includeTribeEnablers = profile.wantSubtypes.length > 0 && mode !== 'payoffs';
  let includeTribePayoffs = profile.wantSubtypes.length > 0 && mode !== 'enablers';
  let includeStax = Boolean(profile.includeStax);
  let includeTheft = Boolean(profile.includeTheft);

  const selectedHook = hookKey ? profile.hooks.find((h) => h.key === hookKey) ?? null : null;

  if (selectedHook) {
    if (selectedHook.bit !== null) {
      if (selectedHook.direction === 'need-enabler') {
        neededEnablerBits = 1 << selectedHook.bit;
        enablerWeights[selectedHook.bit] = selectedHook.weight;
      } else {
        neededPayoffBits = 1 << selectedHook.bit;
        payoffWeights[selectedHook.bit] = selectedHook.weight;
      }
      includeTribeEnablers = false;
      includeTribePayoffs = false;
      activeCustomTerms = [];
      includeStax = false;
      includeTheft = false;
    } else if (selectedHook.subtype) {
      activeSubtypes = [selectedHook.subtype];
      includeTribeEnablers = selectedHook.direction === 'need-enabler';
      includeTribePayoffs = selectedHook.direction === 'need-payoff';
      activeCustomTerms = [];
      includeStax = false;
      includeTheft = false;
    } else if (selectedHook.customTerm) {
      activeSubtypes = [];
      includeTribeEnablers = false;
      includeTribePayoffs = false;
      activeCustomTerms = [selectedHook.customTerm];
      includeStax = false;
      includeTheft = false;
    } else if (selectedHook.key === 'special:stax') {
      activeSubtypes = [];
      includeTribeEnablers = false;
      includeTribePayoffs = false;
      activeCustomTerms = [];
      includeStax = true;
      includeTheft = false;
    } else if (selectedHook.key === 'special:theft') {
      activeSubtypes = [];
      includeTribeEnablers = false;
      includeTribePayoffs = false;
      activeCustomTerms = [];
      includeStax = false;
      includeTheft = true;
    }
  } else {
    for (const h of profile.hooks) {
      if (h.bit === null) continue;
      if (h.direction === 'need-enabler') {
        neededEnablerBits |= 1 << h.bit;
        if (h.weight > enablerWeights[h.bit]!) enablerWeights[h.bit] = h.weight;
      } else {
        neededPayoffBits |= 1 << h.bit;
        if (h.weight > payoffWeights[h.bit]!) payoffWeights[h.bit] = h.weight;
      }
    }
  }

  const compiledSubtypes = activeSubtypes.map(compileSubtypeMatcher);
  const compiledCustomTerms = activeCustomTerms.map(compileCustomTermMatcher);

  // Build logical theme groups for multi-theme overlap bonus
  const themeGroups: ThemeMatchGroup[] = [];
  const sourceGroups = profile.themeGroups ?? profile.defaultThemes.map((t) => [t]);
  if (!selectedHook && sourceGroups.length > 1) {
    for (const groupIds of sourceGroups) {
      let gEn = 0;
      let gPay = 0;
      let gSubIdx = -1;
      let gCustomIdx = -1;
      let gStax = false;
      let gTheft = false;

      for (const themeId of groupIds) {
        if (themeId.startsWith('tribe:')) {
          const subLower = themeId.slice('tribe:'.length).trim().toLowerCase();
          const stIdx = compiledSubtypes.findIndex((s) => s.subLower === subLower);
          if (stIdx >= 0 && gSubIdx === -1) gSubIdx = stIdx;
        } else if (themeId.startsWith('custom:')) {
          const raw = themeId.slice('custom:'.length).trim().toLowerCase();
          const ctIdx = compiledCustomTerms.findIndex((c) => c.raw === raw);
          if (ctIdx >= 0 && gCustomIdx === -1) gCustomIdx = ctIdx;
        } else if (themeId === 'stax' && includeStax) {
          gStax = true;
        } else if (themeId === 'theft' && includeTheft) {
          gTheft = true;
        } else {
          const specs = THEME_TO_HOOK_SPECS[themeId];
          if (specs) {
            for (const spec of specs) {
              if (spec.special === 'stax' && includeStax) {
                gStax = true;
              } else if (spec.special === 'theft' && includeTheft) {
                gTheft = true;
              } else if (spec.bit !== undefined) {
                if (spec.direction === 'need-enabler') gEn |= 1 << spec.bit;
                else gPay |= 1 << spec.bit;
              } else if (spec.subtype) {
                const stIdx = compiledSubtypes.findIndex(
                  (s) => s.subLower === spec.subtype!.toLowerCase(),
                );
                if (stIdx >= 0 && gSubIdx === -1) gSubIdx = stIdx;
              }
            }
          }
        }
      }

      if (gEn !== 0 || gPay !== 0 || gSubIdx >= 0 || gCustomIdx >= 0 || gStax || gTheft) {
        themeGroups.push({
          enablerBits: gEn,
          payoffBits: gPay,
          subtypeIdx: gSubIdx,
          customTermIdx: gCustomIdx,
          isStax: gStax,
          isTheft: gTheft,
        });
      }
    }
  }

  const maxGemPriceUsd =
    maxPriceUsd !== null
      ? Math.min(HIDDEN_GEM_DEFAULT_MAX_USD, maxPriceUsd)
      : HIDDEN_GEM_DEFAULT_MAX_USD;

  return {
    profile,
    mode,
    hookKey: selectedHook?.key ?? null,
    seedIdSet: new Set(profile.seedIds),
    neededEnablerBits,
    neededPayoffBits,
    enablerWeights,
    payoffWeights,
    subtypesLower: activeSubtypes.map((s) => s.toLowerCase()),
    compiledSubtypes,
    compiledCustomTerms,
    themeGroups,
    includeTribeEnablers,
    includeTribePayoffs,
    includeStax,
    includeTheft,
    maxGemPriceUsd,
  };
}

const EMPTY_REASONS: string[] = [];
const PURE_TYPE_ENABLER_BITS =
  (1 << MECHANIC_BITS.INSTANT_SORCERY) |
  (1 << MECHANIC_BITS.ARTIFACTS_MATTER) |
  (1 << MECHANIC_BITS.ENCHANTMENTS_MATTER);

function matchesSubtypeEnabler(
  subLower: string,
  oLow: string,
  compiled: CompiledSubtypeMatcher,
): boolean {
  if (
    subLower &&
    (subLower.includes(compiled.stem1) || (compiled.stem2 !== compiled.stem1 && subLower.includes(compiled.stem2))) &&
    compiled.wordRe.test(subLower)
  ) {
    return true;
  }
  if (compiled.isCreatureTribe && oLow.includes('changeling')) {
    return true;
  }
  if (
    oLow.includes('token') &&
    oLow.includes('create ') &&
    (oLow.includes(compiled.stem1) || (compiled.stem2 !== compiled.stem1 && oLow.includes(compiled.stem2))) &&
    compiled.tokenMakeRe.test(oLow)
  ) {
    return true;
  }
  return false;
}

function matchesSubtypePayoff(
  tLow: string,
  oLow: string,
  kindredFlag: number,
  compiled: CompiledSubtypeMatcher,
): boolean {
  if (compiled.isCreatureTribe && kindredFlag === 1) return true;
  if (
    oLow.length > 0 &&
    (oLow.includes(compiled.stem1) || (compiled.stem2 !== compiled.stem1 && oLow.includes(compiled.stem2)))
  ) {
    return tLow.includes('creature')
      ? compiled.careRe.test(oLow)
      : compiled.wordRe.test(oLow);
  }
  return false;
}

/**
 * Scores a single card at `idx` against the active RippleMatcher in pure bitwise & array speed.
 * Returns `score: 0` when the card does not satisfy the active Ripple filter/mode.
 * Pass `collectReasons = false` inside the full-catalog loop and `true` only for visible page items.
 */
export function scoreRippleCard(
  idx: number,
  card: CompactCard,
  typeLineLower: string,
  index: RippleIndex,
  matcher: RippleMatcher,
  collectReasons = true,
): { score: number; reasons: string[] } {
  if (matcher.seedIdSet.has(card.id)) {
    return { score: 0, reasons: EMPTY_REASONS };
  }

  const { profile, mode } = matcher;
  for (let ex = 0; ex < profile.wantTypesExclude.length; ex++) {
    if (typeLineLower.includes(profile.wantTypesExclude[ex]!.toLowerCase())) {
      return { score: 0, reasons: EMPTY_REASONS };
    }
  }

  if (profile.minCmcForEnablerTypes && card.cmc < profile.minCmcForEnablerTypes) {
    if (
      profile.wantTypesInclude.length > 0 &&
      profile.wantTypesInclude.some((inc) => typeLineLower.includes(inc.toLowerCase()))
    ) {
      return { score: 0, reasons: EMPTY_REASONS };
    }
  }

  let enScore = 0;
  let payScore = 0;
  let matchedEnablerMask = 0;
  let matchedPayoffMask = 0;
  const enReasons = collectReasons ? ([] as string[]) : EMPTY_REASONS;
  const payReasons = collectReasons ? ([] as string[]) : EMPTY_REASONS;

  if (mode !== 'payoffs' || matcher.hookKey !== null) {
    let m = index.enablerMasks[idx]! & matcher.neededEnablerBits;
    matchedEnablerMask = m;
    while (m !== 0) {
      const bit = (Math.clz32(m & -m) ^ 31) as RippleBitIndex;
      enScore += (matcher.enablerWeights[bit] || 1) * 22;
      if (collectReasons) enReasons.push(BIT_LABELS[bit].enabler);
      m &= m - 1;
    }
    if (
      (matcher.neededEnablerBits & (1 << MECHANIC_BITS.SAC_OUTLET)) !== 0 &&
      index.freeSacFlags[idx] === 1 &&
      card.cmc <= 3
    ) {
      enScore += 28;
    }
  }

  if (mode !== 'enablers' || matcher.hookKey !== null) {
    let m = index.payoffMasks[idx]! & matcher.neededPayoffBits;
    matchedPayoffMask = m;
    while (m !== 0) {
      const bit = (Math.clz32(m & -m) ^ 31) as RippleBitIndex;
      payScore += (matcher.payoffWeights[bit] || 1) * 24;
      if (collectReasons) payReasons.push(BIT_LABELS[bit].payoff);
      m &= m - 1;
    }
    if (
      (matcher.neededPayoffBits & (1 << MECHANIC_BITS.INSTANT_SORCERY)) !== 0 &&
      index.ownCastSpellPayoffFlags[idx] === 1
    ) {
      payScore += 16;
    }
    if (
      (matcher.neededPayoffBits & (1 << MECHANIC_BITS.LANDFALL_LANDS)) !== 0 &&
      index.landfallTriggerFlags[idx] === 1
    ) {
      payScore += 18;
    }
  }

  // Prevent generic high-CMC vanilla spells/artifacts/enchantments from crowding All Ripple
  if (
    mode === 'all' &&
    matcher.hookKey === null &&
    profile.wantTypesInclude.length === 0 &&
    matchedPayoffMask === 0 &&
    matchedEnablerMask !== 0 &&
    (matchedEnablerMask & ~PURE_TYPE_ENABLER_BITS) === 0 &&
    card.cmc > 2 &&
    card.roles.length === 0 &&
    matcher.compiledSubtypes.length === 0 &&
    matcher.compiledCustomTerms.length === 0
  ) {
    enScore = 0;
  }

  let matchedSubtypeEnablerIdx = -1;
  let matchedSubtypePayoffIdx = -1;
  if (matcher.compiledSubtypes.length > 0) {
    const oLow = index.cleanLowers[idx]!;
    const subLow = index.subtypesLowers[idx]!;
    const kindredFlag = index.kindredGenericFlags[idx]!;
    for (let s = 0; s < matcher.compiledSubtypes.length; s++) {
      const comp = matcher.compiledSubtypes[s]!;
      if (matcher.includeTribeEnablers && matchesSubtypeEnabler(subLow, oLow, comp)) {
        if (matchedSubtypeEnablerIdx === -1) {
          matchedSubtypeEnablerIdx = s;
          enScore += 50;
          if (collectReasons) enReasons.push(`Starter: ${comp.sub} Body`);
        }
      }
      if (
        matcher.includeTribePayoffs &&
        matchesSubtypePayoff(typeLineLower, oLow, kindredFlag, comp)
      ) {
        if (matchedSubtypePayoffIdx === -1) {
          matchedSubtypePayoffIdx = s;
          payScore += kindredFlag === 1 ? 58 : 66;
          if (collectReasons) {
            payReasons.push(
              kindredFlag === 1
                ? 'Payoff: Kindred Multiplier'
                : `Payoff: ${comp.sub} Synergy`,
            );
          }
        }
      }
    }
  }

  let matchedCustomIdx = -1;
  if (matcher.compiledCustomTerms.length > 0) {
    const oLow = index.cleanLowers[idx]!;
    const kwLow = index.keywordLowers[idx]!;
    const condLow = index.condLowers[idx]!;
    const multLow = index.multLowers[idx]!;
    for (let c = 0; c < matcher.compiledCustomTerms.length; c++) {
      const term = matcher.compiledCustomTerms[c]!;
      const hasStem =
        oLow.includes(term.stem) ||
        kwLow.includes(term.stem) ||
        typeLineLower.includes(term.stem);
      if (!hasStem) continue;

      const inKeywords = kwLow.length > 0 && term.wordRe.test(kwLow);
      const inType = term.wordRe.test(typeLineLower);
      const inOracle = oLow.length > 0 && term.wordRe.test(oLow);
      if (!inKeywords && !inType && !inOracle) continue;

      const isPayoff =
        (condLow.length > 0 && term.wordRe.test(condLow)) ||
        (multLow.length > 0 && term.wordRe.test(multLow)) ||
        (inOracle && term.careRe.test(oLow));
      const isEnabler = inKeywords || inType || inOracle;

      if (isPayoff && (mode !== 'enablers' || matcher.hookKey !== null)) {
        payScore += 52;
        if (matchedCustomIdx === -1) matchedCustomIdx = c;
        if (collectReasons) payReasons.push(`Payoff: ${term.label} Synergy`);
      }
      if (isEnabler && (mode !== 'payoffs' || matcher.hookKey !== null)) {
        enScore += isPayoff ? 36 : 46;
        if (matchedCustomIdx === -1) matchedCustomIdx = c;
        if (collectReasons) enReasons.push(`Starter: ${term.label}`);
      }
    }
  }

  if (matcher.includeStax && index.staxFlags[idx] === 1) {
    if (mode !== 'enablers' || matcher.hookKey !== null) {
      payScore += 54;
      if (collectReasons) payReasons.push('Payoff: Stax / Tax');
    } else {
      enScore += 46;
      if (collectReasons) enReasons.push('Starter: Resource Tax');
    }
  }

  if (matcher.includeTheft && index.theftFlags[idx] === 1) {
    if (mode !== 'enablers' || matcher.hookKey !== null) {
      payScore += 54;
      if (collectReasons) payReasons.push('Payoff: Theft / Steal');
    } else {
      enScore += 46;
      if (collectReasons) enReasons.push('Starter: Card Theft');
    }
  }

  if (
    profile.minCmcForEnablerTypes &&
    card.cmc < profile.minCmcForEnablerTypes &&
    typeLineLower.includes('creature') &&
    profile.wantTypesInclude.length === 0
  ) {
    enScore = Math.floor(enScore * 0.25);
  }

  if (mode === 'enablers' && enScore === 0) return { score: 0, reasons: EMPTY_REASONS };
  if (mode === 'payoffs' && payScore === 0) return { score: 0, reasons: EMPTY_REASONS };

  let rawChainScore =
    mode === 'enablers' ? enScore : mode === 'payoffs' ? payScore : enScore + payScore;

  if (rawChainScore < 20) return { score: 0, reasons: EMPTY_REASONS };

  // Multi-theme overlap bonus when combining multiple themes
  if (matcher.themeGroups.length > 1) {
    let groupsMatched = 0;
    for (let g = 0; g < matcher.themeGroups.length; g++) {
      const grp = matcher.themeGroups[g]!;
      const bitHit =
        (mode !== 'payoffs' && (matchedEnablerMask & grp.enablerBits) !== 0) ||
        (mode !== 'enablers' && (matchedPayoffMask & grp.payoffBits) !== 0);
      const subHit =
        grp.subtypeIdx >= 0 &&
        (matchedSubtypeEnablerIdx === grp.subtypeIdx || matchedSubtypePayoffIdx === grp.subtypeIdx);
      const customHit = grp.customTermIdx >= 0 && matchedCustomIdx === grp.customTermIdx;
      const specialHit =
        (grp.isStax && index.staxFlags[idx] === 1) ||
        (grp.isTheft && index.theftFlags[idx] === 1);
      if (bitHit || subHit || customHit || specialHit) {
        groupsMatched++;
      }
    }
    if (groupsMatched > 1) {
      rawChainScore += (groupsMatched - 1) * 26;
    }
  }

  if (mode === 'hidden-gems') {
    if (
      card.edhrecRank === null ||
      card.edhrecRank < HIDDEN_GEM_MIN_EDHREC_RANK ||
      card.edhrecRank > HIDDEN_GEM_MAX_EDHREC_RANK
    ) {
      return { score: 0, reasons: EMPTY_REASONS };
    }
    if (card.priceUsd === null || card.priceUsd > matcher.maxGemPriceUsd) {
      return { score: 0, reasons: EMPTY_REASONS };
    }
    if (rawChainScore < 44) return { score: 0, reasons: EMPTY_REASONS };

    const rankLog = Math.log10(card.edhrecRank);
    const obscuritySweetSpot = Math.max(0, 12 - Math.abs(rankLog - 3.7) * 14);
    const bridgeBonus = enScore > 0 && payScore > 0 ? 18 : 0;
    const total = Math.round((rawChainScore * 1.1 + obscuritySweetSpot + bridgeBonus) * 10) / 10;
    const reasons = !collectReasons
      ? EMPTY_REASONS
      : enScore > 0 && payScore > 0
        ? ['Bridge: Starter + Payoff', ...enReasons.slice(0, 1), ...payReasons.slice(0, 1)]
        : [...enReasons, ...payReasons].slice(0, 3);
    return { score: total, reasons };
  }

  const edhBonus =
    card.edhrecRank !== null
      ? Math.max(-14, 22 - Math.log10(card.edhrecRank + 1) * 7.5)
      : -12;
  const bridgeBonus = mode === 'all' && enScore > 0 && payScore > 0 ? 18 : 0;
  const total = Math.round((rawChainScore + bridgeBonus + edhBonus) * 10) / 10;

  let reasons: string[];
  if (!collectReasons) {
    reasons = EMPTY_REASONS;
  } else if (mode === 'enablers') {
    reasons = enReasons.slice(0, 3);
  } else if (mode === 'payoffs') {
    reasons = payReasons.slice(0, 3);
  } else if (enScore > 0 && payScore > 0) {
    reasons = ['Bridge: Starter + Payoff', ...enReasons.slice(0, 1), ...payReasons.slice(0, 1)];
  } else {
    reasons = [...enReasons, ...payReasons].slice(0, 3);
  }

  return { score: total, reasons };
}

/**
 * Measures Starter vs. Payoff counts across the current mainboard deck (< 1ms).
 */
export function computeDeckChainBalance(
  profile: RippleProfile,
  mainboardCards: readonly CompactCard[],
): DeckChainBalance {
  if (mainboardCards.length === 0 || profile.hooks.length === 0) {
    return { inDeckStarters: 0, inDeckPayoffs: 0, recommendedMode: null };
  }

  const deckIndex = buildRippleIndex(mainboardCards);
  let neededEnablerBits = 0;
  let neededPayoffBits = 0;
  for (const h of profile.hooks) {
    if (h.bit === null) continue;
    if (h.direction === 'need-enabler') neededEnablerBits |= 1 << h.bit;
    else neededPayoffBits |= 1 << h.bit;
  }

  const compiledSubtypes = profile.wantSubtypes.map(compileSubtypeMatcher);
  const compiledCustom = profile.customTerms.map(compileCustomTermMatcher);
  let inDeckStarters = 0;
  let inDeckPayoffs = 0;

  for (let i = 0; i < mainboardCards.length; i++) {
    const tLow = deckIndex.typeLowers[i]!;
    const subLow = deckIndex.subtypesLowers[i]!;
    const oLow = deckIndex.cleanLowers[i]!;
    const kwLow = deckIndex.keywordLowers[i]!;
    const hasEnablerBit = (deckIndex.enablerMasks[i]! & neededEnablerBits) !== 0;
    const hasPayoffBit = (deckIndex.payoffMasks[i]! & neededPayoffBits) !== 0;

    let hasTribeStarter = false;
    let hasTribePayoff = false;
    for (const comp of compiledSubtypes) {
      if (matchesSubtypeEnabler(subLow, oLow, comp)) hasTribeStarter = true;
      if (matchesSubtypePayoff(tLow, oLow, deckIndex.kindredGenericFlags[i]!, comp)) {
        hasTribePayoff = true;
      }
    }

    let hasCustomStarter = false;
    let hasCustomPayoff = false;
    for (const term of compiledCustom) {
      if (term.wordRe.test(kwLow) || term.wordRe.test(oLow) || term.wordRe.test(tLow)) {
        hasCustomStarter = true;
        if (term.careRe.test(oLow)) hasCustomPayoff = true;
      }
    }

    if (hasEnablerBit || hasTribeStarter || hasCustomStarter) inDeckStarters++;
    if (
      hasPayoffBit ||
      hasTribePayoff ||
      hasCustomPayoff ||
      (profile.includeStax && deckIndex.staxFlags[i] === 1) ||
      (profile.includeTheft && deckIndex.theftFlags[i] === 1)
    ) {
      inDeckPayoffs++;
    }
  }

  let recommendedMode: RippleMode | null = null;
  if (inDeckStarters >= 4 && inDeckPayoffs <= 1) {
    recommendedMode = 'payoffs';
  } else if (inDeckPayoffs >= 4 && inDeckStarters <= 1) {
    recommendedMode = 'enablers';
  } else if (inDeckStarters >= inDeckPayoffs * 2 + 3) {
    recommendedMode = 'payoffs';
  } else if (inDeckPayoffs >= inDeckStarters * 2 + 3) {
    recommendedMode = 'enablers';
  }

  return { inDeckStarters, inDeckPayoffs, recommendedMode };
}

/**
 * Returns Tailwind classes for directional Ripple badges shared across CardTile and CardDetailModal.
 */
export function getSynergyReasonBadgeClass(reason: string): string {
  if (reason.startsWith('Bridge:')) {
    return 'bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/40';
  }
  if (reason.startsWith('Starter:')) {
    return 'bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-500/35';
  }
  return 'bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/30';
}
