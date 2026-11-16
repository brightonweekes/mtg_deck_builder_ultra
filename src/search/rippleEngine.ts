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
    label: 'All Synergies',
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
  wantTypesInclude: string[];
  wantTypesExclude: string[];
  minCmcForEnablerTypes?: number;
}

export interface RippleIndex {
  enablerMasks: Uint32Array;
  payoffMasks: Uint32Array;
  cleanLowers: string[];
  typeLowers: string[];
  freeSacFlags: Uint8Array;
  ownCastSpellPayoffFlags: Uint8Array;
  landfallTriggerFlags: Uint8Array;
  kindredGenericFlags: Uint8Array;
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
  includeTribeEnablers: boolean;
  includeTribePayoffs: boolean;
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
  'Wall', 'Defender', 'Crab', 'Turtle', 'Lizard', 'Mouse', 'Bat', 'Raccoon', 'Insect',
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
};

const SUBTYPE_REGEXES = SUBTYPES_TO_DETECT.map((sub) => {
  const alts = PLURAL_OVERRIDES[sub] ?? `${sub.toLowerCase()}s?`;
  return {
    sub,
    wordRe: new RegExp(`\\b(?:${alts})\\b`, 'i'),
    tokenOnlyRe: new RegExp(`create [^.]{0,40}\\b(?:${alts})\\b[^.]{0,25}token`, 'i'),
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

/**
 * Builds directional Ripple Chain bitmasks across a card collection (~260 KB total for 32.6k cards).
 * Can run lazily on the search worker for the full catalog or instantaneously on <=100 deck cards.
 */
export function buildRippleIndex(
  cards: readonly CompactCard[],
  preLowerTypeLines?: readonly string[],
  preLowerOracles?: readonly string[],
): RippleIndex {
  const len = cards.length;
  const enablerMasks = new Uint32Array(len);
  const payoffMasks = new Uint32Array(len);
  const cleanLowers = new Array<string>(len);
  const typeLowers = new Array<string>(len);
  const freeSacFlags = new Uint8Array(len);
  const ownCastSpellPayoffFlags = new Uint8Array(len);
  const landfallTriggerFlags = new Uint8Array(len);
  const kindredGenericFlags = new Uint8Array(len);

  for (let i = 0; i < len; i++) {
    const card = cards[i]!;
    const { rawLower, cleanLower, typeLower } = normalizePreservingNewlines(
      card,
      preLowerOracles?.[i],
      preLowerTypeLines?.[i],
    );
    cleanLowers[i] = cleanLower;
    typeLowers[i] = typeLower;
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
        const act = RE_ACT_LINE.exec(line);
        if (act) {
          condCorpus += `${act[1]!} `;
          ownCondCorpus += `${act[1]!} `;
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
  }

  return {
    enablerMasks,
    payoffMasks,
    cleanLowers,
    typeLowers,
    freeSacFlags,
    ownCastSpellPayoffFlags,
    landfallTriggerFlags,
    kindredGenericFlags,
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
          } else if (cond.includes('enchantment')) {
            pushHook(MECHANIC_BITS.ENCHANTMENTS_MATTER, 'need-enabler', 3, 'Enchantments trigger Constellation');
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
        }
        if ((cond.includes('artifact') || cond.includes('equipment')) && !cond.includes('non-equipment')) {
          if (cond.includes('equipment')) {
            pushHook(MECHANIC_BITS.EQUIPMENT_AURA, 'need-enabler', 3, 'Equipment/Auras trigger engine');
          } else {
            pushHook(MECHANIC_BITS.ARTIFACTS_MATTER, 'need-enabler', 3, 'Artifacts & Treasures feed trigger');
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
            if (wantSubtypes.size === 0) {
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
      if (/\bdraw (?:a|two|three|that many|\w+) cards?\b|\bdraws? \w+ cards?\b/.test(eff)) {
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
      if (/\badd \{/.test(eff)) {
        pushHook(MECHANIC_BITS.COST_REDUCTION_BIG_MANA, 'need-payoff', 2, 'High-MV threats & X-spell sinks');
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
  const headline =
    subtypesArr.length > 0
      ? `${subtypesArr.slice(0, 2).join(' / ')} Typal`
      : hooks[0]?.reason ?? 'Commander Synergy Engine';

  return {
    seedIds: seedCards.map((c) => c.id),
    seedNames: seedCards.map((c) => c.name),
    archetypeHeadline: headline,
    summarySentence: buildPlainSummarySentence(hooks, subtypesArr, headline),
    hooks,
    wantSubtypes: subtypesArr,
    wantTypesInclude: Array.from(wantTypesInclude),
    wantTypesExclude: Array.from(wantTypesExclude),
    minCmcForEnablerTypes,
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
  let includeTribeEnablers = profile.wantSubtypes.length > 0 && mode !== 'payoffs';
  let includeTribePayoffs = profile.wantSubtypes.length > 0 && mode !== 'enablers';

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
    } else if (selectedHook.subtype) {
      activeSubtypes = [selectedHook.subtype];
      includeTribeEnablers = selectedHook.direction === 'need-enabler';
      includeTribePayoffs = selectedHook.direction === 'need-payoff';
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
    includeTribeEnablers,
    includeTribePayoffs,
    maxGemPriceUsd,
  };
}

const EMPTY_REASONS: string[] = [];

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
  const enReasons = collectReasons ? ([] as string[]) : EMPTY_REASONS;
  const payReasons = collectReasons ? ([] as string[]) : EMPTY_REASONS;

  if (mode !== 'payoffs' || matcher.hookKey !== null) {
    let m = index.enablerMasks[idx]! & matcher.neededEnablerBits;
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

  if (matcher.subtypesLower.length > 0) {
    const oLow = index.cleanLowers[idx]!;
    if (
      matcher.includeTribeEnablers &&
      (matcher.subtypesLower.some((sub) => typeLineLower.includes(sub)) || oLow.includes('changeling'))
    ) {
      enScore += 50;
      if (collectReasons) enReasons.push(`Starter: ${profile.wantSubtypes[0]} Body`);
    }
    if (
      matcher.includeTribePayoffs &&
      ((matcher.subtypesLower.some((sub) => oLow.includes(sub)) &&
        (!typeLineLower.includes('creature') ||
          oLow.includes('other') ||
          oLow.includes('whenever') ||
          oLow.includes('cost'))) ||
        index.kindredGenericFlags[idx] === 1)
    ) {
      payScore += index.kindredGenericFlags[idx] === 1 ? 58 : 66;
      if (collectReasons) {
        payReasons.push(
          index.kindredGenericFlags[idx] === 1
            ? 'Payoff: Kindred Multiplier'
            : `Payoff: ${profile.wantSubtypes[0]} Synergy`,
        );
      }
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

  const rawChainScore =
    mode === 'enablers' ? enScore : mode === 'payoffs' ? payScore : enScore + payScore;

  if (rawChainScore < 20) return { score: 0, reasons: EMPTY_REASONS };

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

  const subtypesLower = profile.wantSubtypes.map((s) => s.toLowerCase());
  let inDeckStarters = 0;
  let inDeckPayoffs = 0;

  for (let i = 0; i < mainboardCards.length; i++) {
    const tLow = deckIndex.typeLowers[i]!;
    const oLow = deckIndex.cleanLowers[i]!;
    const hasEnablerBit = (deckIndex.enablerMasks[i]! & neededEnablerBits) !== 0;
    const hasPayoffBit = (deckIndex.payoffMasks[i]! & neededPayoffBits) !== 0;

    const hasTribeStarter =
      subtypesLower.length > 0 &&
      (subtypesLower.some((s) => tLow.includes(s)) || oLow.includes('changeling'));
    const hasTribePayoff =
      subtypesLower.length > 0 &&
      ((subtypesLower.some((s) => oLow.includes(s)) && !tLow.includes('creature')) ||
        deckIndex.kindredGenericFlags[i] === 1);

    if (hasEnablerBit || hasTribeStarter) inDeckStarters++;
    if (hasPayoffBit || hasTribePayoff) inDeckPayoffs++;
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
 * Returns Tailwind classes for directional Ripple / synergy badges shared across CardTile and CardDetailModal.
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
