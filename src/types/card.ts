export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G';

export type FunctionalRole =
  | 'ramp'
  | 'draw'
  | 'removal'
  | 'wipe'
  | 'tutor'
  | 'recursion'
  | 'protection';

export const FUNCTIONAL_ROLES: readonly FunctionalRole[] = [
  'ramp',
  'draw',
  'removal',
  'wipe',
  'tutor',
  'recursion',
  'protection',
] as const;

export type PartnerCategory =
  | 'partner'
  | 'partner-with'
  | 'friends-forever'
  | 'choose-background'
  | 'background'
  | 'doctors-companion'
  | 'time-lord-doctor';

export interface CardFace {
  name: string;
  manaCost: string;
  typeLine: string;
  oracleText: string;
  colors?: ManaColor[];
  power?: string;
  toughness?: string;
  imageNormal?: string;
  imageSmall?: string;
}

export interface CompactCard {
  id: string;
  oracleId: string;
  name: string;
  manaCost: string;
  cmc: number;
  typeLine: string;
  oracleText: string;
  colors: ManaColor[];
  colorIdentity: ManaColor[];
  keywords: string[];
  edhrecRank: number | null;
  priceUsd: number | null;
  imageNormal: string;
  imageSmall: string;
  artCrop?: string;
  layout: string;
  faces?: CardFace[];
  isCommanderEligible: boolean;
  partnerType?: PartnerCategory;
  partnerWithName?: string;
  maxCopies?: number | null;
  roles: FunctionalRole[];
  themes: string[];
}

export interface DataManifest {
  version: string;
  generatedAt: string;
  scryfallUpdatedAt: string;
  totalCards: number;
  commanderCount: number;
  rawSizeBytes: number;
  gzipSizeBytes: number;
  brotliSizeBytes: number;
  roleCounts: Record<FunctionalRole, number>;
  themeCounts: Record<string, number>;
}

export interface ScryfallImageUris {
  small?: string;
  normal?: string;
  large?: string;
  png?: string;
  art_crop?: string;
  border_crop?: string;
}

export interface ScryfallRawCardFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  power?: string;
  toughness?: string;
  image_uris?: ScryfallImageUris;
}

export interface ScryfallRawCard {
  id: string;
  oracle_id?: string;
  name: string;
  layout: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  color_identity?: string[];
  keywords?: string[];
  produced_mana?: string[];
  power?: string;
  toughness?: string;
  legalities?: Record<string, string>;
  games?: string[];
  digital?: boolean;
  set?: string;
  set_type?: string;
  released_at?: string;
  oversized?: boolean;
  promo?: boolean;
  border_color?: string;
  image_status?: string;
  edhrec_rank?: number | null;
  prices?: {
    usd?: string | null;
    usd_foil?: string | null;
    usd_etched?: string | null;
  };
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallRawCardFace[];
}

export interface ScryfallBulkDataResponse {
  object: string;
  id: string;
  type: string;
  updated_at: string;
  uri: string;
  name: string;
  description: string;
  jsonl_download_uri?: string;
  compressed_size?: number;
  download_uri?: string;
  size?: number;
  content_type?: string;
  content_encoding?: string;
}

/**
 * Derives Scryfall's small thumbnail URL from a normal card image URL.
 */
export function deriveSmallImageUrl(imageNormal: string): string {
  if (!imageNormal) return '';
  return imageNormal.includes('/normal/')
    ? imageNormal.replace('/normal/', '/small/')
    : imageNormal;
}

/**
 * Compact on-disk representation of a card in `cards.min.json`
 * (`artCrop` omitted and `imageSmall` omitted when derivable from `imageNormal`).
 */
export type SerializedCompactCard = Omit<CompactCard, 'imageSmall' | 'artCrop'> & {
  imageSmall?: string;
};

/**
 * Dehydrates a runtime `CompactCard` for compact disk serialization under Cloudflare's 25 MiB cap.
 */
export function compactCardForDisk(card: CompactCard): SerializedCompactCard {
  const copy: SerializedCompactCard = { ...card };
  delete (copy as Partial<CompactCard>).artCrop;
  const derivedSmall = deriveSmallImageUrl(card.imageNormal);
  if (!card.imageSmall || card.imageSmall === derivedSmall) {
    delete copy.imageSmall;
  }
  if (card.faces && card.faces.length > 0) {
    copy.faces = card.faces.map((f) => {
      const fc: CardFace = { ...f };
      const derivedFaceSmall = f.imageNormal ? deriveSmallImageUrl(f.imageNormal) : undefined;
      if (!f.imageSmall || f.imageSmall === derivedFaceSmall) {
        delete fc.imageSmall;
      }
      return fc;
    });
  }
  return copy;
}

/**
 * Hydrates a parsed `cards.min.json` entry back into a full runtime `CompactCard`.
 */
export function hydrateCompactCard(raw: SerializedCompactCard): CompactCard {
  const needsFrontSmall = Boolean(raw.imageNormal && !raw.imageSmall);
  const faces = raw.faces;
  const needsFaceSmall = Boolean(
    faces && faces.some((f) => Boolean(f.imageNormal && !f.imageSmall)),
  );

  if (!needsFrontSmall && !needsFaceSmall && typeof raw.imageSmall === 'string') {
    return raw as CompactCard;
  }

  const imageSmall = raw.imageSmall || deriveSmallImageUrl(raw.imageNormal);
  const hydratedFaces = needsFaceSmall
    ? faces!.map((f) =>
        !f.imageSmall && f.imageNormal
          ? { ...f, imageSmall: deriveSmallImageUrl(f.imageNormal) }
          : f,
      )
    : faces;

  return {
    ...raw,
    imageSmall,
    ...(hydratedFaces ? { faces: hydratedFaces } : {}),
  };
}
