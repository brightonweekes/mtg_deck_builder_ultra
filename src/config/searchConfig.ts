import type { FunctionalRole, ManaColor, PartnerCategory } from '../types/card.js';

export interface RoleMetadata {
  id: FunctionalRole;
  label: string;
  shortDescription: string;
  badgeClass: string;
}

export interface ThemeMetadata {
  id: string;
  label: string;
  category:
    | 'Sacrifice'
    | 'Tokens'
    | 'Counters'
    | 'Graveyard'
    | 'Spells'
    | 'ETB & Blink'
    | 'Artifacts & Enchantments'
    | 'Combat'
    | 'Resources & Control';
  isSubRole?: boolean;
}

export interface ThemeSynonymEntry {
  primaryThemes: string[];
  secondaryThemes?: string[];
  roles?: FunctionalRole[];
}

export interface ManaColorMeta {
  code: ManaColor;
  name: string;
  pillClass: string;
  activeClass: string;
}

export const MANA_COLOR_CONFIG: readonly ManaColorMeta[] = [
  {
    code: 'W',
    name: 'White',
    pillClass: 'border-amber-200/30 text-amber-100 hover:bg-amber-200/10',
    activeClass: 'border-amber-300 bg-amber-200 text-slate-950 font-semibold',
  },
  {
    code: 'U',
    name: 'Blue',
    pillClass: 'border-sky-400/30 text-sky-200 hover:bg-sky-400/10',
    activeClass: 'border-sky-400 bg-sky-400 text-slate-950 font-semibold',
  },
  {
    code: 'B',
    name: 'Black',
    pillClass: 'border-purple-400/30 text-purple-200 hover:bg-purple-400/10',
    activeClass: 'border-purple-400 bg-purple-500 text-white font-semibold',
  },
  {
    code: 'R',
    name: 'Red',
    pillClass: 'border-rose-400/30 text-rose-200 hover:bg-rose-400/10',
    activeClass: 'border-rose-400 bg-rose-500 text-white font-semibold',
  },
  {
    code: 'G',
    name: 'Green',
    pillClass: 'border-emerald-400/30 text-emerald-200 hover:bg-emerald-400/10',
    activeClass: 'border-emerald-400 bg-emerald-500 text-slate-950 font-semibold',
  },
] as const;

export const CARD_TYPE_OPTIONS: readonly string[] = [
  'Creature',
  'Artifact',
  'Enchantment',
  'Instant',
  'Sorcery',
  'Land',
  'Planeswalker',
  'Battle',
] as const;

export const ROLE_METADATA: readonly RoleMetadata[] = [
  {
    id: 'ramp',
    label: 'Ramp',
    shortDescription: 'Mana acceleration, rocks, dorks, land fetch, cost reduction',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  {
    id: 'draw',
    label: 'Card Draw',
    shortDescription: 'Repeatable draw, multi-card draw, impulse draw',
    badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  },
  {
    id: 'removal',
    label: 'Removal',
    shortDescription: 'Targeted destruction, exile, counterspells, bounce, edicts',
    badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  },
  {
    id: 'wipe',
    label: 'Board Wipe',
    shortDescription: 'Mass creature/permanent clearing and sweepers',
    badgeClass: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  },
  {
    id: 'tutor',
    label: 'Tutor',
    shortDescription: 'Non-land library search effects',
    badgeClass: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  },
  {
    id: 'recursion',
    label: 'Recursion',
    shortDescription: 'Graveyard recovery, reanimation, flashback/escape',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  {
    id: 'protection',
    label: 'Protection',
    shortDescription: 'Hexproof, indestructible, phasing, counter protection',
    badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  },
] as const;

export const ROLE_BY_ID: Readonly<Record<FunctionalRole, RoleMetadata>> = Object.fromEntries(
  ROLE_METADATA.map((role) => [role.id, role]),
) as Record<FunctionalRole, RoleMetadata>;

export const THEME_METADATA: readonly ThemeMetadata[] = [
  { id: 'aristocrats', label: 'Aristocrats', category: 'Sacrifice' },
  { id: 'sacrifice', label: 'Sacrifice', category: 'Sacrifice' },
  { id: 'sac-outlet', label: 'Sacrifice Outlet', category: 'Sacrifice', isSubRole: true },
  { id: 'death-trigger', label: 'Death Trigger', category: 'Sacrifice', isSubRole: true },

  { id: 'tokens', label: 'Tokens', category: 'Tokens' },
  { id: 'token-generator', label: 'Token Generator', category: 'Tokens', isSubRole: true },
  { id: 'token-payoff', label: 'Token Payoff', category: 'Tokens', isSubRole: true },

  { id: 'counters', label: 'Counters', category: 'Counters' },
  { id: 'plus-one-counters', label: '+1/+1 Counters', category: 'Counters', isSubRole: true },
  { id: 'proliferate', label: 'Proliferate', category: 'Counters', isSubRole: true },

  { id: 'graveyard', label: 'Graveyard', category: 'Graveyard' },
  { id: 'reanimator', label: 'Reanimator', category: 'Graveyard', isSubRole: true },
  { id: 'mill', label: 'Mill', category: 'Graveyard', isSubRole: true },
  { id: 'discard', label: 'Discard', category: 'Graveyard' },

  { id: 'spellslinger', label: 'Spellslinger', category: 'Spells' },
  { id: 'magecraft', label: 'Magecraft', category: 'Spells', isSubRole: true },
  { id: 'cantrip', label: 'Cantrip', category: 'Spells', isSubRole: true },
  { id: 'spell-copy', label: 'Spell Copy / Storm', category: 'Spells', isSubRole: true },
  { id: 'exile-cast', label: 'Cast from Exile', category: 'Spells' },
  { id: 'burn', label: 'Burn / Drain', category: 'Spells' },

  { id: 'blink', label: 'Blink / Flicker', category: 'ETB & Blink' },
  { id: 'etb-trigger', label: 'ETB Trigger', category: 'ETB & Blink', isSubRole: true },
  { id: 'panharmonicon', label: 'Trigger Doubler', category: 'ETB & Blink', isSubRole: true },

  { id: 'enchantress', label: 'Enchantress', category: 'Artifacts & Enchantments' },
  { id: 'auras', label: 'Auras', category: 'Artifacts & Enchantments' },
  { id: 'artifacts', label: 'Artifacts', category: 'Artifacts & Enchantments' },
  { id: 'treasure', label: 'Treasures', category: 'Artifacts & Enchantments', isSubRole: true },
  { id: 'equipment', label: 'Equipment', category: 'Artifacts & Enchantments' },
  { id: 'vehicles', label: 'Vehicles', category: 'Artifacts & Enchantments' },
  { id: 'voltron', label: 'Voltron', category: 'Combat' },

  { id: 'attack-trigger', label: 'Attack Trigger', category: 'Combat', isSubRole: true },
  { id: 'extra-combat', label: 'Extra Combat', category: 'Combat', isSubRole: true },
  {
    id: 'combat-damage-trigger',
    label: 'Combat Damage Trigger',
    category: 'Combat',
    isSubRole: true,
  },
  { id: 'tap-untap', label: 'Tap / Untap', category: 'Combat', isSubRole: true },
  { id: 'power-matters', label: 'Power Matters', category: 'Combat' },

  { id: 'lifegain', label: 'Lifegain', category: 'Resources & Control' },
  { id: 'lifegain-payoff', label: 'Lifegain Payoff', category: 'Resources & Control', isSubRole: true },
  { id: 'landfall', label: 'Landfall', category: 'Resources & Control' },
  { id: 'lands-matter', label: 'Lands Matter', category: 'Resources & Control', isSubRole: true },
  { id: 'wheels', label: 'Wheels', category: 'Resources & Control' },
  { id: 'draw-payoff', label: 'Draw Payoff', category: 'Resources & Control', isSubRole: true },
  { id: 'topdeck', label: 'Topdeck Matters', category: 'Resources & Control' },
  { id: 'big-mana', label: 'Big Mana / X-Spells', category: 'Resources & Control' },
  { id: 'stax', label: 'Stax / Tax', category: 'Resources & Control' },
  { id: 'clone', label: 'Clones / Copies', category: 'Resources & Control' },
  { id: 'theft', label: 'Theft / Steal', category: 'Resources & Control' },
] as const;

export const THEME_BY_ID: Readonly<Record<string, ThemeMetadata>> = Object.fromEntries(
  THEME_METADATA.map((theme) => [theme.id, theme]),
);

/**
 * Extensible synonym and archetype expander for natural-language Method A theme queries.
 */
export const THEME_SYNONYMS: Readonly<Record<string, ThemeSynonymEntry>> = {
  aristocrats: {
    primaryThemes: ['aristocrats', 'death-trigger'],
    secondaryThemes: ['sacrifice', 'sac-outlet'],
  },
  sacrifice: {
    primaryThemes: ['sacrifice', 'sac-outlet'],
    secondaryThemes: ['death-trigger', 'aristocrats'],
  },
  sac: {
    primaryThemes: ['sacrifice', 'sac-outlet'],
    secondaryThemes: ['death-trigger', 'aristocrats'],
  },
  outlet: {
    primaryThemes: ['sac-outlet'],
    secondaryThemes: ['sacrifice'],
  },
  death: {
    primaryThemes: ['death-trigger'],
    secondaryThemes: ['aristocrats', 'sacrifice'],
  },
  dies: {
    primaryThemes: ['death-trigger'],
    secondaryThemes: ['aristocrats', 'sacrifice'],
  },
  tokens: {
    primaryThemes: ['tokens'],
    secondaryThemes: ['token-generator', 'token-payoff'],
  },
  token: {
    primaryThemes: ['tokens'],
    secondaryThemes: ['token-generator', 'token-payoff'],
  },
  go: {
    primaryThemes: [],
  },
  wide: {
    primaryThemes: ['tokens', 'token-payoff'],
    secondaryThemes: ['token-generator'],
  },
  counters: {
    primaryThemes: ['counters', 'plus-one-counters'],
    secondaryThemes: ['proliferate'],
  },
  counter: {
    primaryThemes: ['counters', 'plus-one-counters'],
    secondaryThemes: ['proliferate'],
  },
  proliferate: {
    primaryThemes: ['proliferate'],
    secondaryThemes: ['counters', 'plus-one-counters'],
  },
  graveyard: {
    primaryThemes: ['graveyard'],
    secondaryThemes: ['reanimator', 'mill', 'discard'],
  },
  reanimator: {
    primaryThemes: ['reanimator', 'graveyard'],
    secondaryThemes: ['mill', 'discard'],
  },
  reanimate: {
    primaryThemes: ['reanimator'],
    secondaryThemes: ['graveyard'],
  },
  mill: {
    primaryThemes: ['mill'],
    secondaryThemes: ['graveyard', 'reanimator'],
  },
  selfmill: {
    primaryThemes: ['mill', 'graveyard'],
    secondaryThemes: ['reanimator'],
  },
  discard: {
    primaryThemes: ['discard'],
    secondaryThemes: ['wheels', 'graveyard'],
  },
  spellslinger: {
    primaryThemes: ['spellslinger', 'magecraft'],
    secondaryThemes: ['cantrip', 'burn', 'spell-copy'],
  },
  storm: {
    primaryThemes: ['spellslinger', 'magecraft', 'spell-copy'],
    secondaryThemes: ['cantrip', 'treasure'],
  },
  magecraft: {
    primaryThemes: ['magecraft', 'spellslinger'],
    secondaryThemes: ['spell-copy'],
  },
  cantrip: {
    primaryThemes: ['cantrip'],
    secondaryThemes: ['spellslinger'],
  },
  cantrips: {
    primaryThemes: ['cantrip'],
    secondaryThemes: ['spellslinger'],
  },
  'spell-copy': {
    primaryThemes: ['spell-copy'],
    secondaryThemes: ['spellslinger', 'magecraft'],
  },
  fork: {
    primaryThemes: ['spell-copy'],
    secondaryThemes: ['spellslinger', 'magecraft'],
  },
  exile: {
    primaryThemes: ['exile-cast'],
  },
  'exile-cast': {
    primaryThemes: ['exile-cast'],
  },
  impulse: {
    primaryThemes: ['exile-cast'],
  },
  cascade: {
    primaryThemes: ['exile-cast'],
  },
  discover: {
    primaryThemes: ['exile-cast'],
  },
  foretell: {
    primaryThemes: ['exile-cast'],
  },
  plot: {
    primaryThemes: ['exile-cast'],
  },
  blink: {
    primaryThemes: ['blink'],
    secondaryThemes: ['etb-trigger', 'panharmonicon'],
  },
  flicker: {
    primaryThemes: ['blink'],
    secondaryThemes: ['etb-trigger', 'panharmonicon'],
  },
  etb: {
    primaryThemes: ['etb-trigger'],
    secondaryThemes: ['blink', 'panharmonicon'],
  },
  panharmonicon: {
    primaryThemes: ['panharmonicon'],
    secondaryThemes: ['etb-trigger', 'blink'],
  },
  enchantress: {
    primaryThemes: ['enchantress'],
    secondaryThemes: ['auras'],
  },
  enchantments: {
    primaryThemes: ['enchantress', 'auras'],
  },
  auras: {
    primaryThemes: ['auras', 'voltron'],
    secondaryThemes: ['enchantress'],
  },
  aura: {
    primaryThemes: ['auras', 'voltron'],
  },
  artifacts: {
    primaryThemes: ['artifacts'],
    secondaryThemes: ['treasure', 'equipment', 'vehicles'],
  },
  artifact: {
    primaryThemes: ['artifacts'],
    secondaryThemes: ['treasure', 'equipment', 'vehicles'],
  },
  treasure: {
    primaryThemes: ['treasure'],
    secondaryThemes: ['artifacts', 'token-generator'],
  },
  treasures: {
    primaryThemes: ['treasure'],
    secondaryThemes: ['artifacts', 'token-generator'],
  },
  equipment: {
    primaryThemes: ['equipment', 'voltron'],
    secondaryThemes: ['artifacts'],
  },
  voltron: {
    primaryThemes: ['voltron'],
    secondaryThemes: ['equipment', 'auras'],
  },
  vehicles: {
    primaryThemes: ['vehicles'],
    secondaryThemes: ['artifacts'],
  },
  lifegain: {
    primaryThemes: ['lifegain', 'lifegain-payoff'],
  },
  life: {
    primaryThemes: ['lifegain', 'lifegain-payoff'],
  },
  landfall: {
    primaryThemes: ['landfall', 'lands-matter'],
  },
  lands: {
    primaryThemes: ['lands-matter', 'landfall'],
  },
  tap: {
    primaryThemes: ['tap-untap'],
  },
  untap: {
    primaryThemes: ['tap-untap'],
  },
  'tap-untap': {
    primaryThemes: ['tap-untap'],
  },
  power: {
    primaryThemes: ['power-matters'],
  },
  ferocious: {
    primaryThemes: ['power-matters'],
  },
  'power-matters': {
    primaryThemes: ['power-matters'],
  },
  topdeck: {
    primaryThemes: ['topdeck'],
  },
  scry: {
    primaryThemes: ['topdeck'],
  },
  'big-mana': {
    primaryThemes: ['big-mana'],
  },
  'x-spell': {
    primaryThemes: ['big-mana'],
  },
  'x-spells': {
    primaryThemes: ['big-mana'],
  },
  'cost-reduction': {
    primaryThemes: ['big-mana'],
  },
  wheels: {
    primaryThemes: ['wheels', 'draw-payoff'],
    secondaryThemes: ['discard'],
  },
  wheel: {
    primaryThemes: ['wheels', 'draw-payoff'],
    secondaryThemes: ['discard'],
  },
  stax: {
    primaryThemes: ['stax'],
  },
  tax: {
    primaryThemes: ['stax'],
  },
  combat: {
    primaryThemes: ['extra-combat', 'attack-trigger', 'combat-damage-trigger'],
  },
  aggro: {
    primaryThemes: ['attack-trigger', 'extra-combat', 'combat-damage-trigger'],
  },
  clone: {
    primaryThemes: ['clone'],
  },
  clones: {
    primaryThemes: ['clone'],
  },
  copy: {
    primaryThemes: ['clone', 'spell-copy'],
    secondaryThemes: ['spellslinger'],
  },
  theft: {
    primaryThemes: ['theft'],
  },
  steal: {
    primaryThemes: ['theft'],
  },
  burn: {
    primaryThemes: ['burn'],
    secondaryThemes: ['spellslinger'],
  },
  ramp: {
    primaryThemes: ['treasure', 'lands-matter'],
    roles: ['ramp'],
  },
  draw: {
    primaryThemes: ['draw-payoff', 'wheels'],
    roles: ['draw'],
  },
  removal: {
    primaryThemes: [],
    roles: ['removal', 'wipe'],
  },
  wipe: {
    primaryThemes: [],
    roles: ['wipe'],
  },
  tutor: {
    primaryThemes: [],
    roles: ['tutor'],
  },
  recursion: {
    primaryThemes: ['graveyard', 'reanimator'],
    roles: ['recursion'],
  },
  protection: {
    primaryThemes: [],
    roles: ['protection'],
  },
};

export const PRESET_THEME_CHIPS: readonly {
  label: string;
  themeQuery: string;
  themes: readonly string[];
}[] = [
  {
    label: 'Aristocrats Sacrifice',
    themeQuery: 'aristocrats sacrifice tokens',
    themes: ['aristocrats', 'sacrifice', 'tokens'],
  },
  {
    label: '+1/+1 Counters',
    themeQuery: 'counters proliferate',
    themes: ['plus-one-counters', 'proliferate'],
  },
  {
    label: 'Blink & ETB',
    themeQuery: 'blink etb panharmonicon',
    themes: ['blink', 'etb-trigger', 'panharmonicon'],
  },
  {
    label: 'Spellslinger',
    themeQuery: 'spellslinger magecraft cantrips',
    themes: ['spellslinger', 'magecraft', 'cantrip'],
  },
  {
    label: 'Landfall',
    themeQuery: 'landfall lands',
    themes: ['landfall', 'lands-matter'],
  },
  {
    label: 'Reanimator',
    themeQuery: 'reanimator graveyard mill',
    themes: ['reanimator', 'graveyard', 'mill'],
  },
  {
    label: 'Lifegain',
    themeQuery: 'lifegain',
    themes: ['lifegain', 'lifegain-payoff'],
  },
  {
    label: 'Enchantress',
    themeQuery: 'enchantress auras',
    themes: ['enchantress', 'auras'],
  },
  {
    label: 'Treasures & Artifacts',
    themeQuery: 'treasures artifacts',
    themes: ['treasure', 'artifacts'],
  },
  {
    label: 'Stax & Tax',
    themeQuery: 'stax',
    themes: ['stax'],
  },
] as const;

export const POPULAR_SUBTYPES: readonly string[] = [
  'Elf',
  'Goblin',
  'Dragon',
  'Vampire',
  'Zombie',
  'Wizard',
  'Angel',
  'Demon',
  'Sliver',
  'Merfolk',
  'Human',
  'Warrior',
  'Rogue',
  'Cleric',
  'Dinosaur',
  'Phyrexian',
  'Spirit',
  'Elemental',
  'Knight',
  'Soldier',
  'Druid',
  'Shaman',
  'Artificer',
  'Pirate',
  'Faerie',
  'Eldrazi',
  'Equipment',
  'Vehicle',
  'Aura',
  'Saga',
  'Shrine',
  'Background',
  'Treasure',
  'Clue',
  'Food',
] as const;

export const CMC_QUICK_PILLS: readonly {
  label: string;
  value: number;
  forceOp?: '>=';
}[] = [
  { label: '0', value: 0 },
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5', value: 5 },
  { label: '6+', value: 6, forceOp: '>=' },
] as const;

export const BUDGET_PRESETS: readonly { label: string; value: number }[] = [
  { label: '< $1', value: 1 },
  { label: '< $2', value: 2 },
  { label: '< $5', value: 5 },
  { label: '< $10', value: 10 },
  { label: '< $25', value: 25 },
] as const;

export const THEME_CATEGORIES: ReadonlyArray<{
  category: ThemeMetadata['category'];
  themes: ThemeMetadata[];
}> = (() => {
  const grouped = new Map<ThemeMetadata['category'], ThemeMetadata[]>();
  for (const theme of THEME_METADATA) {
    const existing = grouped.get(theme.category);
    if (existing) {
      existing.push(theme);
    } else {
      grouped.set(theme.category, [theme]);
    }
  }
  return Array.from(grouped.entries()).map(([category, themes]) => ({
    category,
    themes,
  }));
})();

export const PARTNER_TYPE_LABELS: Readonly<Record<PartnerCategory, string>> = {
  partner: 'Partner',
  'partner-with': 'Partner With',
  'friends-forever': 'Friends Forever',
  'choose-background': 'Choose a Background',
  background: 'Background',
  'doctors-companion': "Doctor's Companion",
  'time-lord-doctor': 'Time Lord Doctor',
};
