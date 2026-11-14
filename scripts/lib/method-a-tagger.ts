import type { FunctionalRole } from '../../src/types/card.js';

export interface TagCardInput {
  name: string;
  typeLine: string;
  oracleText: string;
  cmc: number;
  keywords: string[];
}

export interface TagCardResult {
  roles: FunctionalRole[];
  themes: string[];
}

const COMMON_SHORT_NAMES = new Set([
  'fear',
  'fire',
  'life',
  'death',
  'war',
  'peace',
  'blood',
  'bone',
  'iron',
  'gold',
  'mana',
  'land',
  'hand',
  'deck',
  'grave',
  'time',
  'turn',
  'draw',
  'cast',
  'play',
  'exile',
  'attack',
  'block',
  'tap',
  'untap',
  'sacrifice',
  'destroy',
  'create',
  'token',
  'counter',
  'will',
  'mind',
  'body',
  'soul',
  'fate',
  'order',
  'chaos',
  'truth',
  'grace',
  'hope',
  'pain',
  'rage',
  'fury',
  'doom',
  'bane',
  'void',
  'dust',
  'mist',
  'rain',
  'wind',
  'storm',
  'snow',
  'ice',
  'frost',
  'sun',
  'moon',
  'star',
  'night',
  'day',
  'light',
  'dark',
  'shadow',
]);

// --- Pre-compiled text normalization regexes ---
const RE_PAREN_GROUP = /\([^()]*\)/g;
const RE_MULTI_SPACE = /[ \t]{2,}/g;
const RE_TRAILING_SPACE_BEFORE_NEWLINE = /[ \t]+\n/g;
const RE_SPACE_BEFORE_PUNCT = / ([.,;:!?])/g;
const RE_SELF_PHRASE = /\bthis (?:creature|artifact|enchantment|land|planeswalker|permanent|vehicle|equipment|aura)\b/g;
const RE_REGEX_ESCAPE = /[.*+?^${}()|[\]\\]/g;

// --- Pre-compiled type-line regexes ---
const RE_TYPE_LAND = /\bland\b/i;
const RE_TYPE_NONLAND_CARD = /\b(?:creature|artifact|enchantment|instant|sorcery|planeswalker|battle)\b/i;
const RE_TYPE_INSTANT_OR_SORCERY = /\b(?:instant|sorcery)\b/i;
const RE_TYPE_AURA = /\baura\b/i;
const RE_TYPE_EQUIPMENT = /\bequipment\b/i;
const RE_TYPE_VEHICLE = /\bvehicle\b/i;

// --- Pre-compiled Role Regexes ---
// 1. Ramp
const RE_LAND_MULTI_MANA =
  /\badd (?:\{[wubrgc]\}\{[wubrgc]\}|(?:two|three|four|five) mana|an amount of \{[wubrgc]\}|\{[wubrgc]\} or \{[wubrgc]\} for each)/i;
const RE_LAND_FOR_EACH_MANA = /\bfor each [^.\n]*,\s*add\b/i;
const RE_ADD_MANA =
  /\badd (?:(?:one|two|three|four|five|six|seven|x|an amount of|an additional) )?(?:\{[wubrgc]\})+/i;
const RE_ADD_ANY_COLOR =
  /\badd (?:(?:one|two|three|four|five|x|an additional) mana of (?:any (?:one )?(?:color|type)|that type))\b/i;
const RE_ADD_CHOICE_MANA = /\badd \{[wubrgc]\} or \{[wubrgc]\}/i;
const RE_LAND_FETCH_TO_BATTLEFIELD =
  /\bsearch your library for [^.\n]*\bland cards?[^.\n]*\bput (?:it|them|one|up to [^ \n]+) onto the battlefield\b/i;
const RE_EXTRA_LAND_DROP = /\byou may play an additional land\b/i;
const RE_PUT_LAND_FROM_HAND = /\bput a land card from your hand onto the battlefield\b/i;
const RE_COST_REDUCTION =
  /(?<!this )\bspells?(?: you cast)? cost (?:\{\d+\}|\{[wubrgc]\})+ less to cast\b/i;
const RE_CREATE_TREASURE =
  /\bcreate (?:a|an|one|two|three|four|five|six|x|\d+|that many) (?:tapped )?treasure tokens?\b/i;

// 2. Draw
const RE_MULTI_DRAW = /\bdraws? (?:two|three|four|five|six|seven|x|\d+) cards\b/i;
const RE_DRAW_EQUAL_OR_EACH = /\bdraws? (?:a card for each|cards equal to|that many cards)\b/i;
const RE_REPEATABLE_DRAW_TRIGGER =
  /\b(?:whenever|at the beginning of) [^.\n]*\bdraw a card\b/i;
const RE_REPEATABLE_DRAW_ACTIVATED = /\{[^}]+\}[^:\n]*:[^.\n]*\bdraw a card\b/i;
const RE_SAC_SELF = /\bsacrifice ~:/i;
const RE_IMPULSE_DRAW =
  /\bexile the top (?:card|\w+ cards) of your library[^.\n]*\b(?:you may (?:play|cast)|until (?:the end of )?(?:your next turn|end of turn))\b/i;
const RE_DRAW_ONE = /\bdraw a card\b/i;

// 3. Removal
const RE_DESTROY_TARGET = /\bdestroy target\b/i;
const RE_EXILE_TARGET =
  /\bexile target\b(?![^.\n]*\bfrom (?:a|an|your|any|target player's) graveyard\b)(?![^.\n]*\byou control[^.\n]*\breturn (?:it|them) to the battlefield\b)/i;
const RE_COUNTER_SPELL =
  /\bcounter target (?:[^.\n]*\bspell|activated or triggered ability)\b/i;
const RE_TARGET_SHRINK = /\btarget creature gets -(?:\d+|x)\/-(?:\d+|x)/i;
const RE_TARGET_BOUNCE =
  /\breturn target (?:nonland permanent|creature|artifact|enchantment|planeswalker|permanent|spell)[^.\n]*to its owner's hand\b/i;
const RE_TARGET_TUCK =
  /\bput target (?:nonland permanent|creature|artifact|enchantment|planeswalker|permanent)[^.\n]*on (?:the )?(?:top|bottom) of its owner's library\b/i;
const RE_TARGET_DAMAGE =
  /\bdeals (?:\d+|x) damage to (?:any target|target creature|target planeswalker|target attacking|target blocking)\b/i;
const RE_TARGET_EDICT = /\btarget (?:player|opponent) sacrifices a\b/i;
const RE_EACH_OPP_EDICT = /\beach opponent sacrifices a (?:creature|nonland permanent|permanent)\b/i;
const RE_FIGHT_OR_BITE =
  /\b(?:fights? target|deals damage equal to its power to target creature)\b/i;
const RE_AURA_LOCKDOWN =
  /\b(?:enchanted (?:creature|permanent) loses all abilities|can't attack or block, and its activated abilities can't be activated)\b/i;

// 4. Wipe
const RE_MASS_DESTROY_EXILE =
  /\b(?:destroy|exile) (?:all|each) (?:other )?(?:creatures|permanents|nonland permanents|artifacts|enchantments|planeswalkers|multicolored|monocolored|attacking creatures)\b/i;
const RE_MASS_ONE_SIDED_DESTROY =
  /\b(?:destroy|exile) each (?:creature|artifact|enchantment|nonland permanent) you don't control\b/i;
const RE_MASS_SHRINK =
  /\b(?:all|each) creatures? gets? -(?:\d+|x)\/-(?:\d+|x)/i;
const RE_MASS_DAMAGE =
  /\bdeals (?:\d+|x) damage to each (?:non-?\w+ )?creature\b/i;
const RE_MASS_BOUNCE =
  /\breturn (?:all|each) (?:creatures|nonland permanents|permanents|artifacts|enchantments|attacking creatures)(?: you don't control)? to their owners' hands?\b/i;
const RE_MASS_SACRIFICE = /\beach player sacrifices (?:all|half|the rest|each)\b/i;
const RE_MASS_TUCK = /\bput all creatures on the bottom of their owners' libraries\b/i;
const RE_OVERLOAD = /\boverload\b/i;

// 5. Tutor
const RE_TUTOR_NONLAND =
  /\bsearch (?:your|target player's|an opponent's) library for (?:a |an |up to \w+ |\d+ |x )?(?!(?:basic )?(?:[\w-]+ )?(?:land|plains|island|swamp|mountain|forest|gate|desert|cave|locus)s?\b)[^.\n]*\b(?:card|creature|artifact|enchantment|instant|sorcery|planeswalker|equipment|aura|legendary|permanent)\b/i;
const RE_TRANSMUTE = /\btransmute\b/i;

// 6. Recursion
const RE_GRAVEYARD_RETURN =
  /\breturn (?:target |up to \w+ |all )?[^.\n]*from (?:a|an|your|any) graveyard to (?:the battlefield|your hand|its owner's hand|the top of your library)\b/i;
const RE_GRAVEYARD_PUT_BATTLEFIELD =
  /\bput (?:target |all )?[^.\n]*from (?:a|an|your|any) graveyard onto the battlefield\b/i;
const RE_CAST_FROM_GRAVEYARD =
  /\byou may (?:cast|play) [^.\n]*from your graveyard\b/i;
const RE_RECURSION_KEYWORDS =
  /\b(?:unearth|escape|flashback|embalm|eternalize|disturb|encore|jump-start|aftermath|retrace)\b/i;

// 7. Protection
const RE_GRANT_PROTECTION =
  /\b(?:creatures you control|permanents you control|artifacts you control|enchantments you control|other [^.\n]*you control|target [^.\n]*you control|equipped creature|enchanted creature)[^.\n]*\b(?:gains?|has|have) (?:[^.\n]*\b)?(?:hexproof|indestructible|shroud|protection from|ward)\b/i;
const RE_GAIN_PROTECTION_SELF_OR_PLAYER = /\byou gain protection from everything\b/i;
const RE_PHASE_OUT = /\bphases? out\b/i;
const RE_UMBRA_ARMOR = /\b(?:umbra|totem) armor\b/i;
const RE_REGENERATE = /\bregenerate (?:target|each)\b/i;
const RE_CANT_BE_COUNTERED_OTHER = /\b(?:creature )?spells you control can't be countered\b/i;

// --- Pre-compiled Theme Regexes ---
const RE_SAC_OUTLET =
  /\bsacrifice (?:a|an|another|one or more) (?:creature|permanent|artifact|enchantment|land|token)[^.\n]*:/i;
const RE_SAC_COST_OR_TRIGGER =
  /\b(?:whenever (?:you|a player) sacrifices?|sacrifice (?:a|another) (?:creature|permanent|artifact))\b/i;
const RE_DEATH_TRIGGER =
  /\bwhenever (?:(?:~ or )?(?:a|another) (?:nontoken )?creature(?: or planeswalker)?(?: you control| an opponent controls)?|~) dies\b/i;
const RE_ARISTOCRATS_DRAIN =
  /\b(?:loses? \d+ life|deals? \d+ damage to (?:each opponent|target opponent|any target))\b/i;

const RE_TOKEN_GENERATOR = /\bcreate [^\n.]*\btokens?\b/i;
const RE_TOKEN_PAYOFF =
  /\b(?:(?:creature )?tokens you control|\bpopulate\b|\bfor each token\b|create one or more tokens under your control|tokens would be created under your control|twice that many (?:of those )?tokens)\b/i;

const RE_PLUS_ONE_COUNTERS = /\+1\/\+1 counter/i;
const RE_PROLIFERATE = /\bproliferate\b/i;
const RE_COUNTERS_GENERAL =
  /\b(?:put|with|remove|move|double|additional|loyalty|charge|oil|stun|shield|experience|poison|energy|rad)[^.\n]*\bcounters?\b/i;

const RE_MILL =
  /\b(?:mill (?:a|\d+|x|two|three|four|five|half)|puts? the top [^\n.]*cards? of [^\n.]*library into [^\n.]*graveyard)\b/i;
const RE_REANIMATOR =
  /\b(?:(?:put|return) (?:target |all )?(?:creature|permanent) cards? from [^\n.]*graveyard onto the battlefield|from a graveyard onto the battlefield)\b/i;
const RE_DISCARD =
  /\bdiscards? (?:a|an|one|two|three|four|your hand|their hand|that many|cards?)\b/i;
const RE_GRAVEYARD_SYNERGY =
  /\b(?:in your graveyard|delve|dredge|threshold|delirium|undergrowth|descend)\b/i;

const RE_MAGECRAFT =
  /\bwhenever you cast (?:or copy )?(?:an instant or sorcery|a noncreature) spell\b/i;
const RE_SPELLSLINGER_OTHER =
  /\b(?:storm|prowess|buyback|replicate|cascade|instant and sorcery spells you cast|copy target instant or sorcery)\b/i;

const RE_BLINK =
  /\bexile (?:target|up to|another|any number of) [^.\n]*(?:you control|creatures?|permanents?)[^.\n]*(?:then )?return (?:it|them|that card|those cards) to the battlefield\b/i;
const RE_ETB_TRIGGER =
  /\b(?:when ~ enters|whenever (?:~|a|another) [^.\n]*enters)\b/i;
const RE_PANHARMONICON = /\btriggers? an additional time\b/i;

const RE_ENCHANTRESS =
  /\b(?:whenever you cast an enchantment|constellation|whenever an enchantment (?:you control )?enters|for each enchantment you control)\b/i;
const RE_AURA_TEXT = /\b(?:aura|enchant creature)\b/i;

const RE_ARTIFACT_SYNERGY =
  /\b(?:artifacts?|metalcraft|affinity for artifacts|improvise|modular)\b/i;
const RE_VOLTRON =
  /\b(?:equipped creature|enchanted creature|for each (?:aura|equipment) attached|attach [^\n.]*to target creature)\b/i;
const RE_EQUIP = /\bequip\b/i;

const RE_LIFEGAIN = /\b(?:lifelink|you gain [^\n.]*\blife|gains? life)\b/i;
const RE_LIFEGAIN_PAYOFF =
  /\b(?:whenever you gain life|if you gained [^\n.]*life this turn|your life total is (?:40|50|\d+) or more|pay (?:[2-9]\d|\d{3,}) life)\b/i;

const RE_LANDFALL = /\b(?:landfall|whenever a land (?:you control )?enters)\b/i;
const RE_LANDS_MATTER =
  /\b(?:play lands from your graveyard|for each land you control|return [^\n.]*land cards? from your graveyard)\b/i;

const RE_WHEELS =
  /\b(?:each player discards their hand[^\n.]*draws|discard your hand[^\n.]*draw (?:seven|that many)|each player shuffles their hand[^\n.]*draws)\b/i;
const RE_DRAW_PAYOFF = /\bwhenever (?:you|an opponent|a player) draws?\b/i;

const RE_STAX =
  /\b(?:spells (?:your opponents|opponents|players) cast cost [^\n.]*more|can't cast more than (?:one|two) spells?|don't untap during their controllers?' untap steps?|your opponents can't cast|players can't)\b/i;

const RE_ATTACK_TRIGGER =
  /\bwhenever (?:~|a creature|one or more creatures)[^\n.]*attacks?\b/i;
const RE_EXTRA_COMBAT = /\badditional combat phase\b/i;
const RE_COMBAT_DAMAGE_TRIGGER =
  /\bwhenever (?:~|a creature|one or more creatures)[^\n.]*deals? combat damage\b/i;

const RE_CLONE =
  /\b(?:enters as a copy of|create a token that's a copy of|become a copy of)\b/i;
const RE_THEFT =
  /\b(?:gain control of target|exile the top card of (?:each|target) opponent's library[^\n.]*you may (?:play|cast)|cast spells from [^\n.]*opponents?' (?:graveyards?|libraries?|hands?))\b/i;
const RE_BURN =
  /\b(?:deals? (?:\d+|x) damage to each opponent|each opponent loses (?:\d+|x) life|deals? damage equal to [^\n.]*to (?:each opponent|target opponent|any target))\b/i;

/**
 * Strips parenthesized reminder text iteratively to prevent false-positive
 * keyword or mana-symbol matches (e.g. Extort `{W/B}` reminder text).
 */
export function stripReminderText(text: string): string {
  if (!text || !text.includes('(')) return text;
  let current = text;
  let previous: string;
  do {
    previous = current;
    current = current.replace(RE_PAREN_GROUP, '');
  } while (current !== previous);
  return current
    .replace(RE_MULTI_SPACE, ' ')
    .replace(RE_TRAILING_SPACE_BEFORE_NEWLINE, '\n')
    .replace(RE_SPACE_BEFORE_PUNCT, '$1')
    .trim();
}

/**
 * Normalizes Oracle text for deterministic Method A matching:
 * strips reminder text, lowercases, and replaces self-references with `~`.
 */
export function normalizeCardText(text: string, cardName: string): string {
  if (!text) return '';
  let normalized = stripReminderText(text).toLowerCase();

  // Normalize modern Oracle self-references ("this creature", "this permanent", etc.)
  normalized = normalized.replace(RE_SELF_PHRASE, '~');

  if (cardName) {
    const faceNames = cardName.split(' // ');
    for (const rawFace of faceNames) {
      const faceLower = rawFace.trim().toLowerCase();
      if (!faceLower) continue;

      if (normalized.includes(faceLower)) {
        const escaped = faceLower.replace(RE_REGEX_ESCAPE, '\\$&');
        normalized = normalized.replace(new RegExp(`\\b${escaped}\\b`, 'g'), '~');
      }

      const commaIndex = faceLower.indexOf(',');
      if (commaIndex > 0) {
        const shortName = faceLower.slice(0, commaIndex).trim();
        if (
          shortName.length >= 4 &&
          !COMMON_SHORT_NAMES.has(shortName) &&
          normalized.includes(shortName)
        ) {
          const escapedShort = shortName.replace(RE_REGEX_ESCAPE, '\\$&');
          normalized = normalized.replace(new RegExp(`\\b${escapedShort}\\b`, 'g'), '~');
        }
      }
    }
  }

  return normalized;
}

/**
 * Deterministically assigns functional roles and mechanical synergy themes
 * using normalized Oracle text and type-line rules.
 */
export function tagCard(input: TagCardInput): TagCardResult {
  const text = normalizeCardText(input.oracleText, input.name);
  const typeLine = input.typeLine;
  const frontTypeLine = typeLine.split(' // ')[0] ?? typeLine;

  const isPureLand = RE_TYPE_LAND.test(frontTypeLine) && !RE_TYPE_NONLAND_CARD.test(frontTypeLine);
  const isInstantOrSorcery = RE_TYPE_INSTANT_OR_SORCERY.test(typeLine);

  const roles: FunctionalRole[] = [];
  const themes: string[] = [];

  // --- 1. RAMP ---
  if (isPureLand) {
    if (
      RE_LAND_MULTI_MANA.test(text) ||
      RE_LAND_FOR_EACH_MANA.test(text) ||
      RE_LAND_FETCH_TO_BATTLEFIELD.test(text) ||
      RE_CREATE_TREASURE.test(text) ||
      RE_EXTRA_LAND_DROP.test(text)
    ) {
      roles.push('ramp');
    }
  } else if (
    RE_ADD_MANA.test(text) ||
    RE_ADD_ANY_COLOR.test(text) ||
    RE_ADD_CHOICE_MANA.test(text) ||
    RE_LAND_FETCH_TO_BATTLEFIELD.test(text) ||
    RE_EXTRA_LAND_DROP.test(text) ||
    RE_PUT_LAND_FROM_HAND.test(text) ||
    RE_COST_REDUCTION.test(text) ||
    RE_CREATE_TREASURE.test(text)
  ) {
    roles.push('ramp');
  }

  // --- 2. DRAW ---
  const hasRepeatableActivatedDraw =
    RE_REPEATABLE_DRAW_ACTIVATED.test(text) && !RE_SAC_SELF.test(text);
  if (
    RE_MULTI_DRAW.test(text) ||
    RE_DRAW_EQUAL_OR_EACH.test(text) ||
    RE_REPEATABLE_DRAW_TRIGGER.test(text) ||
    hasRepeatableActivatedDraw ||
    RE_IMPULSE_DRAW.test(text)
  ) {
    roles.push('draw');
  }

  // --- 3. REMOVAL ---
  const hasTargetedRemoval =
    RE_DESTROY_TARGET.test(text) ||
    RE_EXILE_TARGET.test(text) ||
    RE_COUNTER_SPELL.test(text) ||
    RE_TARGET_SHRINK.test(text) ||
    RE_TARGET_BOUNCE.test(text) ||
    RE_TARGET_TUCK.test(text) ||
    RE_TARGET_DAMAGE.test(text) ||
    RE_TARGET_EDICT.test(text) ||
    RE_EACH_OPP_EDICT.test(text) ||
    RE_FIGHT_OR_BITE.test(text) ||
    RE_AURA_LOCKDOWN.test(text);

  if (hasTargetedRemoval) {
    roles.push('removal');
  }

  // --- 4. WIPE ---
  const hasOverloadWipe = RE_OVERLOAD.test(text) && hasTargetedRemoval;
  if (
    RE_MASS_DESTROY_EXILE.test(text) ||
    RE_MASS_ONE_SIDED_DESTROY.test(text) ||
    RE_MASS_SHRINK.test(text) ||
    RE_MASS_DAMAGE.test(text) ||
    RE_MASS_BOUNCE.test(text) ||
    RE_MASS_SACRIFICE.test(text) ||
    RE_MASS_TUCK.test(text) ||
    hasOverloadWipe
  ) {
    roles.push('wipe');
  }

  // --- 5. TUTOR ---
  if (RE_TUTOR_NONLAND.test(text) || RE_TRANSMUTE.test(text)) {
    roles.push('tutor');
  }

  // --- 6. RECURSION ---
  if (
    RE_GRAVEYARD_RETURN.test(text) ||
    RE_GRAVEYARD_PUT_BATTLEFIELD.test(text) ||
    RE_CAST_FROM_GRAVEYARD.test(text) ||
    RE_RECURSION_KEYWORDS.test(text)
  ) {
    roles.push('recursion');
  }

  // --- 7. PROTECTION ---
  if (
    RE_GRANT_PROTECTION.test(text) ||
    RE_GAIN_PROTECTION_SELF_OR_PLAYER.test(text) ||
    RE_PHASE_OUT.test(text) ||
    RE_UMBRA_ARMOR.test(text) ||
    RE_REGENERATE.test(text) ||
    RE_CANT_BE_COUNTERED_OTHER.test(text)
  ) {
    roles.push('protection');
  }

  // --- MECHANICAL THEMES & SUB-ROLES ---

  // Sacrifice / Aristocrats
  const isSacOutlet = RE_SAC_OUTLET.test(text);
  const isDeathTrigger = RE_DEATH_TRIGGER.test(text);
  if (isSacOutlet) themes.push('sac-outlet');
  if (isDeathTrigger) themes.push('death-trigger');
  if (isSacOutlet || isDeathTrigger || RE_SAC_COST_OR_TRIGGER.test(text)) {
    themes.push('sacrifice');
  }
  if (
    (isDeathTrigger && RE_ARISTOCRATS_DRAIN.test(text)) ||
    (isSacOutlet && isDeathTrigger)
  ) {
    themes.push('aristocrats');
  }

  // Tokens
  const isTokenGen = RE_TOKEN_GENERATOR.test(text);
  const isTokenPayoff = RE_TOKEN_PAYOFF.test(text);
  if (isTokenGen) themes.push('token-generator');
  if (isTokenPayoff) themes.push('token-payoff');
  if (isTokenGen || isTokenPayoff) themes.push('tokens');

  // Counters
  const hasPlusOne = RE_PLUS_ONE_COUNTERS.test(text);
  const hasProliferate = RE_PROLIFERATE.test(text);
  if (hasPlusOne) themes.push('plus-one-counters');
  if (hasProliferate) themes.push('proliferate');
  if (hasPlusOne || hasProliferate || RE_COUNTERS_GENERAL.test(text)) {
    themes.push('counters');
  }

  // Graveyard & Reanimator
  const hasMill = RE_MILL.test(text);
  const hasReanimator = RE_REANIMATOR.test(text);
  const hasDiscard = RE_DISCARD.test(text);
  if (hasMill) themes.push('mill');
  if (hasReanimator) themes.push('reanimator');
  if (hasDiscard) themes.push('discard');
  if (
    hasMill ||
    hasReanimator ||
    roles.includes('recursion') ||
    RE_GRAVEYARD_SYNERGY.test(text)
  ) {
    themes.push('graveyard');
  }

  // Spellslinger & Cantrips
  const hasMagecraft = RE_MAGECRAFT.test(text);
  if (hasMagecraft) themes.push('magecraft');
  if (hasMagecraft || RE_SPELLSLINGER_OTHER.test(text)) {
    themes.push('spellslinger');
  }
  if (isInstantOrSorcery && input.cmc <= 2 && RE_DRAW_ONE.test(text)) {
    themes.push('cantrip');
  }

  // Blink & ETB
  const hasBlink = RE_BLINK.test(text);
  const hasEtb = RE_ETB_TRIGGER.test(text);
  const hasPanharmonicon = RE_PANHARMONICON.test(text);
  if (hasBlink) themes.push('blink');
  if (hasEtb) themes.push('etb-trigger');
  if (hasPanharmonicon) themes.push('panharmonicon');

  // Enchantress & Auras
  if (RE_ENCHANTRESS.test(text)) themes.push('enchantress');
  if (RE_TYPE_AURA.test(typeLine) || RE_AURA_TEXT.test(text)) themes.push('auras');

  // Artifacts, Treasures, Equipment, Vehicles, Voltron
  if (RE_CREATE_TREASURE.test(text)) themes.push('treasure');
  if (RE_TYPE_EQUIPMENT.test(typeLine) || RE_EQUIP.test(text)) themes.push('equipment');
  if (RE_TYPE_VEHICLE.test(typeLine)) themes.push('vehicles');
  if (RE_ARTIFACT_SYNERGY.test(text)) themes.push('artifacts');
  if (RE_VOLTRON.test(text)) themes.push('voltron');

  // Lifegain
  const hasLifegain = RE_LIFEGAIN.test(text);
  const hasLifegainPayoff = RE_LIFEGAIN_PAYOFF.test(text);
  if (hasLifegain) themes.push('lifegain');
  if (hasLifegainPayoff) themes.push('lifegain-payoff');

  // Landfall & Lands Matter
  const hasLandfall = RE_LANDFALL.test(text);
  if (hasLandfall) themes.push('landfall');
  if (hasLandfall || RE_LANDS_MATTER.test(text) || RE_EXTRA_LAND_DROP.test(text)) {
    themes.push('lands-matter');
  }

  // Wheels & Draw Payoffs
  if (RE_WHEELS.test(text)) themes.push('wheels');
  if (RE_DRAW_PAYOFF.test(text)) themes.push('draw-payoff');

  // Stax
  if (RE_STAX.test(text)) themes.push('stax');

  // Combat Triggers
  if (RE_ATTACK_TRIGGER.test(text)) themes.push('attack-trigger');
  if (RE_EXTRA_COMBAT.test(text)) themes.push('extra-combat');
  if (RE_COMBAT_DAMAGE_TRIGGER.test(text)) themes.push('combat-damage-trigger');

  // Clone, Theft, Burn
  if (RE_CLONE.test(text)) themes.push('clone');
  if (RE_THEFT.test(text)) themes.push('theft');
  if (RE_BURN.test(text)) themes.push('burn');

  return { roles, themes };
}
