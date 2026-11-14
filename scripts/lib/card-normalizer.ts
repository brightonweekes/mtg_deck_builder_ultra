import type {
  CardFace,
  CompactCard,
  ManaColor,
  PartnerCategory,
  ScryfallRawCard,
} from '../../src/types/card.js';
import { stripReminderText, tagCard } from './method-a-tagger.js';

export const EXCLUDED_LAYOUTS = new Set([
  'token',
  'double_faced_token',
  'emblem',
  'art_series',
  'vanguard',
  'scheme',
  'planar',
  'augment',
  'host',
]);

export interface PaperFaceImageOverride {
  imageNormal?: string;
  imageSmall?: string;
}

export interface PaperOverride {
  priceUsd: number | null;
  imageNormal?: string;
  imageSmall?: string;
  artCrop?: string;
  faces?: PaperFaceImageOverride[];
}

const WUBRG_ORDER: readonly ManaColor[] = ['W', 'U', 'B', 'R', 'G'];
const WUBRG_SET = new Set<string>(WUBRG_ORDER);

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const RE_LEGENDARY = /\bLegendary\b/;
const RE_CREATURE = /\bCreature\b/;
const RE_VEHICLE_OR_SPACECRAFT = /\b(?:Vehicle|Spacecraft)\b/;
const RE_BACKGROUND = /\bBackground\b/;
const RE_ENCHANTMENT = /\bEnchantment\b/;
const RE_TIME_LORD = /\bTime Lord\b/;
const RE_DOCTOR = /\bDoctor\b/;
const RE_BASIC_LAND = /\bBasic\b.*\bLand\b/;

const RE_CAN_BE_COMMANDER = /\bcan be your commander\b/i;
const RE_GRIST_CREATURE_CLAUSE = /\bisn't on the battlefield, it's a [^\n.]*\bcreature\b/i;
const RE_CHOOSE_BACKGROUND = /\bchoose a background\b/i;
const RE_FRIENDS_FOREVER = /\bfriends forever\b/i;
const RE_DOCTORS_COMPANION = /\bdoctor's companion\b/i;
const RE_PARTNER_WITH = /\bpartner with\s+([^\n(]+)/i;
const RE_PARTNER_LINE = /(?:^|\n)\s*partner\s*(?:$|\n)/im;

const RE_ANY_NUMBER_COPIES = /\ba deck can have any number of cards named\b/i;
const RE_UP_TO_N_COPIES = /\ba deck can have up to (\w+) cards named\b/i;

function normalizeManaColors(rawColors?: string[]): ManaColor[] {
  if (!rawColors || rawColors.length === 0) return [];
  const present = new Set<string>();
  for (const c of rawColors) {
    if (WUBRG_SET.has(c)) present.add(c);
  }
  return WUBRG_ORDER.filter((c) => present.has(c));
}

/**
 * Parses a Scryfall decimal USD price string into a finite non-negative number.
 */
export function parseUsdValue(value?: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Extracts the best single-printing USD price (`usd` -> `usd_foil` -> `usd_etched`).
 */
export function parsePriceUsd(prices?: ScryfallRawCard['prices']): number | null {
  if (!prices) return null;
  return (
    parseUsdValue(prices.usd) ??
    parseUsdValue(prices.usd_foil) ??
    parseUsdValue(prices.usd_etched)
  );
}

/**
 * Checks whether Scryfall's representative entry reflects a physical paper printing.
 */
export function hasPaperRepresentative(raw: ScryfallRawCard): boolean {
  return raw.digital !== true && Boolean(raw.games?.includes('paper'));
}

/**
 * Checks whether a Scryfall card entry is a Commander-legal playable card.
 * Relies on Commander legality rather than the representative printing's `digital` flag,
 * since `oracle-cards` often chooses MTGO remasters (`vma`, `tpr`, `me1`-`me4`) for Reserved List cards.
 */
export function isCommanderPlayable(raw: ScryfallRawCard): boolean {
  if (raw.legalities?.commander !== 'legal') return false;
  if (EXCLUDED_LAYOUTS.has(raw.layout)) return false;
  if (raw.set_type === 'memorabilia' || raw.set_type === 'token') return false;
  return true;
}

export interface CommanderEligibilityResult {
  isCommanderEligible: boolean;
  partnerType?: PartnerCategory;
  partnerWithName?: string;
}

/**
 * Determines Commander zone eligibility and two-commander pairing metadata.
 */
export function checkCommanderEligibility(
  raw: ScryfallRawCard,
  frontTypeLine: string,
  frontOracleText: string,
  fullOracleText: string,
  frontPower?: string,
  frontToughness?: string,
): CommanderEligibilityResult {
  const strippedFrontOracle = stripReminderText(frontOracleText);
  const strippedFullOracle = stripReminderText(fullOracleText);

  const isLegendary = RE_LEGENDARY.test(frontTypeLine);
  const isCreature = RE_CREATURE.test(frontTypeLine);
  const isVehicleOrSpacecraft = RE_VEHICLE_OR_SPACECRAFT.test(frontTypeLine);
  const hasPowerToughness = frontPower !== undefined && frontToughness !== undefined;
  const isBackground = isLegendary && RE_ENCHANTMENT.test(frontTypeLine) && RE_BACKGROUND.test(frontTypeLine);
  const hasCommanderClause =
    RE_CAN_BE_COMMANDER.test(strippedFullOracle) ||
    (isLegendary && RE_GRIST_CREATURE_CLAUSE.test(strippedFrontOracle));

  const isCommanderEligible =
    (isLegendary && (isCreature || (isVehicleOrSpacecraft && hasPowerToughness))) ||
    isBackground ||
    hasCommanderClause;

  if (!isCommanderEligible) {
    return { isCommanderEligible: false };
  }

  if (isBackground) {
    return { isCommanderEligible: true, partnerType: 'background' };
  }

  if (RE_CHOOSE_BACKGROUND.test(strippedFullOracle)) {
    return { isCommanderEligible: true, partnerType: 'choose-background' };
  }

  if (RE_FRIENDS_FOREVER.test(strippedFullOracle)) {
    return { isCommanderEligible: true, partnerType: 'friends-forever' };
  }

  if (RE_DOCTORS_COMPANION.test(strippedFullOracle)) {
    return { isCommanderEligible: true, partnerType: 'doctors-companion' };
  }

  const partnerWithMatch = RE_PARTNER_WITH.exec(strippedFullOracle);
  if (partnerWithMatch?.[1]) {
    const partnerWithName = partnerWithMatch[1].trim().replace(/\.$/, '');
    return {
      isCommanderEligible: true,
      partnerType: 'partner-with',
      partnerWithName,
    };
  }

  if (raw.keywords?.includes('Partner') || RE_PARTNER_LINE.test(strippedFullOracle)) {
    return { isCommanderEligible: true, partnerType: 'partner' };
  }

  if (RE_TIME_LORD.test(frontTypeLine) && RE_DOCTOR.test(frontTypeLine)) {
    return { isCommanderEligible: true, partnerType: 'time-lord-doctor' };
  }

  return { isCommanderEligible: true };
}

/**
 * Determines deck-copy limits beyond the default singleton cap of 1.
 * Returns `null` for unlimited copies, a positive integer for fixed caps (e.g. 7 or 9),
 * or `undefined` for the standard 1-copy singleton rule.
 */
export function checkMaxCopies(typeLine: string, strippedOracleText: string): number | null | undefined {
  if (RE_BASIC_LAND.test(typeLine)) return null;
  if (RE_ANY_NUMBER_COPIES.test(strippedOracleText)) return null;

  const upToMatch = RE_UP_TO_N_COPIES.exec(strippedOracleText);
  if (upToMatch?.[1]) {
    const token = upToMatch[1].toLowerCase();
    const mapped = NUMBER_WORDS[token] ?? Number.parseInt(token, 10);
    if (Number.isFinite(mapped) && mapped > 1) {
      return mapped;
    }
  }

  return undefined;
}

/**
 * Normalizes a raw Scryfall card into a compact, tagged Commander record,
 * or returns `null` if the card is not Commander-playable.
 * Preserves `raw.id` strictly so existing saved decks and shared URLs stay valid.
 */
export function normalizeCard(
  raw: ScryfallRawCard,
  paperOverride?: PaperOverride,
): CompactCard | null {
  if (!isCommanderPlayable(raw)) return null;

  const isPaperRep = hasPaperRepresentative(raw);
  const shouldOverrideImages = !isPaperRep && Boolean(paperOverride?.imageNormal);

  const rawFaces = raw.card_faces;
  const hasFaces = Array.isArray(rawFaces) && rawFaces.length > 0;
  const frontFace = hasFaces ? rawFaces[0] : undefined;
  const overrideFaces =
    shouldOverrideImages &&
    paperOverride?.faces &&
    rawFaces &&
    paperOverride.faces.length === rawFaces.length
      ? paperOverride.faces
      : undefined;

  let faces: CardFace[] | undefined;
  if (hasFaces) {
    faces = rawFaces.map((f, index) => {
      const face: CardFace = {
        name: f.name,
        manaCost: f.mana_cost ?? '',
        typeLine: f.type_line ?? '',
        oracleText: f.oracle_text ?? '',
      };
      const faceColors = normalizeManaColors(f.colors);
      if (faceColors.length > 0) face.colors = faceColors;
      if (f.power !== undefined) face.power = f.power;
      if (f.toughness !== undefined) face.toughness = f.toughness;
      const overrideFace = overrideFaces?.[index];
      const faceNormal = overrideFace?.imageNormal ?? f.image_uris?.normal;
      const faceSmall = overrideFace?.imageSmall ?? f.image_uris?.small;
      if (faceNormal) face.imageNormal = faceNormal;
      if (faceSmall) face.imageSmall = faceSmall;
      return face;
    });
  }

  const manaCost =
    raw.mana_cost ||
    (faces ? faces.map((f) => f.manaCost).filter(Boolean).join(' // ') : '');

  const typeLine =
    raw.type_line ||
    (faces ? faces.map((f) => f.typeLine).filter(Boolean).join(' // ') : '');

  const oracleText =
    raw.oracle_text ||
    (faces ? faces.map((f) => f.oracleText).filter(Boolean).join('\n//\n') : '');

  let colors = normalizeManaColors(raw.colors);
  if (colors.length === 0 && faces) {
    const merged = new Set<string>();
    for (const face of faces) {
      if (face.colors) {
        for (const c of face.colors) merged.add(c);
      }
    }
    colors = WUBRG_ORDER.filter((c) => merged.has(c));
  }

  const colorIdentity = normalizeManaColors(raw.color_identity);

  const rawImageNormal =
    raw.image_uris?.normal ?? frontFace?.image_uris?.normal ?? '';
  const rawImageSmall =
    raw.image_uris?.small ?? frontFace?.image_uris?.small ?? '';
  const rawArtCrop =
    raw.image_uris?.art_crop ?? frontFace?.image_uris?.art_crop;

  const imageNormal = shouldOverrideImages
    ? (paperOverride?.imageNormal ?? rawImageNormal)
    : rawImageNormal;
  const derivedOverrideSmall = paperOverride?.imageNormal?.includes('/normal/')
    ? paperOverride.imageNormal.replace('/normal/', '/small/')
    : undefined;
  const imageSmall = shouldOverrideImages
    ? (paperOverride?.imageSmall ?? derivedOverrideSmall ?? rawImageSmall)
    : rawImageSmall;
  const artCrop = shouldOverrideImages
    ? (paperOverride?.artCrop ?? rawArtCrop)
    : rawArtCrop;

  const rawPriceUsd = parsePriceUsd(raw.prices);
  const overridePriceUsd = paperOverride?.priceUsd ?? null;
  const priceUsd =
    (!isPaperRep && overridePriceUsd !== null) || rawPriceUsd === null
      ? (overridePriceUsd ?? rawPriceUsd)
      : rawPriceUsd;

  const frontTypeLine = frontFace?.type_line ?? typeLine;
  const frontOracleText = frontFace?.oracle_text ?? oracleText;
  const frontPower = frontFace?.power ?? raw.power;
  const frontToughness = frontFace?.toughness ?? raw.toughness;

  const eligibility = checkCommanderEligibility(
    raw,
    frontTypeLine,
    frontOracleText,
    oracleText,
    frontPower,
    frontToughness,
  );

  const strippedFullOracle = stripReminderText(oracleText);
  const maxCopies = checkMaxCopies(typeLine, strippedFullOracle);

  const keywords = raw.keywords ?? [];
  const cmc = typeof raw.cmc === 'number' && Number.isFinite(raw.cmc) ? raw.cmc : 0;

  const { roles, themes } = tagCard({
    name: raw.name,
    typeLine,
    oracleText,
    cmc,
    keywords,
  });

  const compact: CompactCard = {
    id: raw.id,
    oracleId: raw.oracle_id ?? raw.id,
    name: raw.name,
    manaCost,
    cmc,
    typeLine,
    oracleText,
    colors,
    colorIdentity,
    keywords,
    edhrecRank: raw.edhrec_rank ?? null,
    priceUsd,
    imageNormal,
    imageSmall,
    layout: raw.layout,
    isCommanderEligible: eligibility.isCommanderEligible,
    roles,
    themes,
  };

  if (artCrop) compact.artCrop = artCrop;
  if (faces) compact.faces = faces;
  if (eligibility.partnerType) compact.partnerType = eligibility.partnerType;
  if (eligibility.partnerWithName) compact.partnerWithName = eligibility.partnerWithName;
  if (maxCopies !== undefined) compact.maxCopies = maxCopies;

  return compact;
}
