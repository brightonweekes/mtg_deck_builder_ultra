import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { Readable, Transform } from 'node:stream';
import { createGunzip } from 'node:zlib';
import type { ScryfallBulkDataResponse, ScryfallRawCard } from '../../src/types/card.js';
import {
  EXCLUDED_LAYOUTS,
  hasPaperRepresentative,
  isCommanderPlayable,
  parsePriceUsd,
  parseUsdValue,
  type PaperFaceImageOverride,
  type PaperOverride,
} from './card-normalizer.js';
import { SCRYFALL_HEADERS } from './scryfall-fetcher.js';

const SCRYFALL_DEFAULT_CARDS_URL = 'https://api.scryfall.com/bulk-data/default-cards';

interface PaperOverrideCacheFile {
  version: 1;
  updatedAt: string;
  targetCount: number;
  overrides: Record<string, PaperOverride>;
}

interface ArtworkCandidate {
  highRes: number;
  nonPromo: number;
  blackBorder: number;
  releasedAt: string;
  imageNormal: string;
  imageSmall?: string;
  artCrop?: string;
  faces?: PaperFaceImageOverride[];
}

interface CandidateAccumulator {
  lowestRegularUsd: number | null;
  lowestFoilUsd: number | null;
  bestArt: ArtworkCandidate | null;
}

export interface ResolvePaperOverridesOptions {
  rawCards: readonly ScryfallRawCard[];
  oracleUpdatedAt: string;
  cacheDir?: string;
  offline?: boolean;
  forceRefresh?: boolean;
}

export interface ResolvePaperOverridesResult {
  overrides: Record<string, PaperOverride>;
  targetCount: number;
  resolvedCount: number;
  pricedCount: number;
  fromCache: boolean;
}

/**
 * Returns `true` when a Commander-playable `oracle-cards` record needs a paper printing lookup
 * (either because its representative printing is non-paper/digital or because its USD price is missing).
 */
export function needsPaperBackfill(raw: ScryfallRawCard): boolean {
  if (!isCommanderPlayable(raw)) return false;
  if (!hasPaperRepresentative(raw)) return true;
  if (parsePriceUsd(raw.prices) === null) return true;
  return false;
}

/**
 * Collects unique Scryfall `oracle_id` keys for cards requiring paper price/artwork resolution.
 */
export function collectPaperBackfillIds(rawCards: readonly ScryfallRawCard[]): Set<string> {
  const ids = new Set<string>();
  for (const raw of rawCards) {
    if (needsPaperBackfill(raw)) {
      ids.add(raw.oracle_id ?? raw.id);
    }
  }
  return ids;
}

/**
 * Checks whether a Scryfall card object represents a tournament-legal physical paper printing
 * eligible to supply market prices and physical tabletop artwork.
 */
export function isEligiblePaperPrinting(raw: ScryfallRawCard): boolean {
  if (raw.digital === true) return false;
  if (!raw.games?.includes('paper')) return false;
  if (raw.set_type === 'memorabilia' || raw.set_type === 'token') return false;
  if (raw.oversized === true) return false;
  if (EXCLUDED_LAYOUTS.has(raw.layout)) return false;
  return true;
}

function minUsd(current: number | null, candidate: number | null): number | null {
  if (candidate === null) return current;
  if (current === null) return candidate;
  return candidate < current ? candidate : current;
}

function buildArtworkCandidate(raw: ScryfallRawCard): ArtworkCandidate | null {
  if (raw.image_status === 'missing' || raw.image_status === 'placeholder') {
    return null;
  }

  const rawFaces = raw.card_faces;
  const frontFace = Array.isArray(rawFaces) && rawFaces.length > 0 ? rawFaces[0] : undefined;
  const imageNormal = raw.image_uris?.normal ?? frontFace?.image_uris?.normal;
  if (!imageNormal) return null;

  const imageSmall = raw.image_uris?.small ?? frontFace?.image_uris?.small;
  const artCrop = raw.image_uris?.art_crop ?? frontFace?.image_uris?.art_crop;

  let faces: PaperFaceImageOverride[] | undefined;
  if (Array.isArray(rawFaces) && rawFaces.length > 0) {
    const faceOverrides = rawFaces.map((f) => {
      const entry: PaperFaceImageOverride = {};
      if (f.image_uris?.normal) entry.imageNormal = f.image_uris.normal;
      if (f.image_uris?.small) entry.imageSmall = f.image_uris.small;
      return entry;
    });
    if (faceOverrides.some((f) => f.imageNormal || f.imageSmall)) {
      faces = faceOverrides;
    }
  }

  return {
    highRes: raw.image_status === 'highres_scan' ? 1 : 0,
    nonPromo: raw.promo !== true ? 1 : 0,
    blackBorder: raw.border_color === 'black' || raw.border_color === 'borderless' ? 1 : 0,
    releasedAt: raw.released_at ?? '',
    imageNormal,
    imageSmall,
    artCrop,
    faces,
  };
}

function isBetterArtwork(candidate: ArtworkCandidate, incumbent: ArtworkCandidate): boolean {
  if (candidate.highRes !== incumbent.highRes) return candidate.highRes > incumbent.highRes;
  if (candidate.nonPromo !== incumbent.nonPromo) return candidate.nonPromo > incumbent.nonPromo;
  if (candidate.blackBorder !== incumbent.blackBorder) {
    return candidate.blackBorder > incumbent.blackBorder;
  }
  return candidate.releasedAt > incumbent.releasedAt;
}

/**
 * Streams a JSONL stream of Scryfall printings (`default-cards`) and extracts
 * the lowest regular paper USD price and best physical paper artwork per target `oracle_id`.
 * Memory stays bounded exclusively to matching `targetOracleIds`.
 */
export async function extractPaperOverridesFromStream(
  stream: NodeJS.ReadableStream,
  targetOracleIds: ReadonlySet<string>,
): Promise<Record<string, PaperOverride>> {
  if (targetOracleIds.size === 0) return {};

  const trackers = new Map<string, CandidateAccumulator>();
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) continue;

    const raw = JSON.parse(line) as ScryfallRawCard;
    const oracleId = raw.oracle_id ?? raw.id;
    if (!targetOracleIds.has(oracleId)) continue;
    if (!isEligiblePaperPrinting(raw)) continue;

    let acc = trackers.get(oracleId);
    if (!acc) {
      acc = { lowestRegularUsd: null, lowestFoilUsd: null, bestArt: null };
      trackers.set(oracleId, acc);
    }

    const regularUsd = parseUsdValue(raw.prices?.usd);
    const foilUsd = minUsd(
      parseUsdValue(raw.prices?.usd_foil),
      parseUsdValue(raw.prices?.usd_etched),
    );
    acc.lowestRegularUsd = minUsd(acc.lowestRegularUsd, regularUsd);
    acc.lowestFoilUsd = minUsd(acc.lowestFoilUsd, foilUsd);

    const art = buildArtworkCandidate(raw);
    if (art && (!acc.bestArt || isBetterArtwork(art, acc.bestArt))) {
      acc.bestArt = art;
    }
  }

  const overrides: Record<string, PaperOverride> = {};
  for (const [oracleId, acc] of trackers) {
    const priceUsd = acc.lowestRegularUsd ?? acc.lowestFoilUsd;
    if (priceUsd === null && !acc.bestArt) continue;

    const entry: PaperOverride = { priceUsd };
    if (acc.bestArt) {
      entry.imageNormal = acc.bestArt.imageNormal;
      if (acc.bestArt.imageSmall) entry.imageSmall = acc.bestArt.imageSmall;
      if (acc.bestArt.artCrop) entry.artCrop = acc.bestArt.artCrop;
      if (acc.bestArt.faces) entry.faces = acc.bestArt.faces;
    }
    overrides[oracleId] = entry;
  }

  return overrides;
}

async function readOverrideCache(cachePath: string): Promise<PaperOverrideCacheFile | null> {
  if (!existsSync(cachePath)) return null;
  try {
    const raw = await readFile(cachePath, 'utf8');
    const parsed = JSON.parse(raw) as PaperOverrideCacheFile;
    if (parsed?.version !== 1 || typeof parsed.overrides !== 'object' || parsed.overrides === null) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function fetchDefaultCardsOverrides(
  targetOracleIds: ReadonlySet<string>,
): Promise<Record<string, PaperOverride>> {
  const metaResponse = await fetch(SCRYFALL_DEFAULT_CARDS_URL, { headers: SCRYFALL_HEADERS });
  if (!metaResponse.ok) {
    throw new Error(
      `Failed to fetch Scryfall default-cards metadata: ${metaResponse.status} ${metaResponse.statusText}`,
    );
  }

  const remoteMeta = (await metaResponse.json()) as ScryfallBulkDataResponse;
  const downloadUri = remoteMeta.jsonl_download_uri ?? remoteMeta.download_uri;
  if (!downloadUri) {
    throw new Error('Scryfall default-cards response is missing jsonl_download_uri.');
  }
  if (!remoteMeta.jsonl_download_uri && !downloadUri.includes('.jsonl')) {
    throw new Error(`Expected JSONL bulk URI for paper backfill, received: ${downloadUri}`);
  }

  const bulkResponse = await fetch(downloadUri, { headers: SCRYFALL_HEADERS });
  if (!bulkResponse.ok || !bulkResponse.body) {
    throw new Error(
      `Failed to download default-cards stream (${bulkResponse.status} ${bulkResponse.statusText})`,
    );
  }

  const contentLengthHeader = bulkResponse.headers.get('content-length');
  const totalBytes = contentLengthHeader
    ? Number.parseInt(contentLengthHeader, 10)
    : (remoteMeta.compressed_size ?? remoteMeta.size ?? 0);

  let downloaded = 0;
  let lastLoggedPercent = -25;
  const progressTransform = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      downloaded += chunk.length;
      if (totalBytes > 0) {
        const percent = Math.floor((downloaded / totalBytes) * 100);
        if (percent >= lastLoggedPercent + 25 || percent === 100) {
          lastLoggedPercent = percent;
          const mbDone = (downloaded / (1024 * 1024)).toFixed(1);
          const mbTotal = (totalBytes / (1024 * 1024)).toFixed(1);
          process.stdout.write(
            `   Streaming default-cards for paper prices: ${mbDone} / ${mbTotal} MB (${percent}%)\n`,
          );
        }
      }
      callback(null, chunk);
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const webReadable = Readable.fromWeb(bulkResponse.body as any);
  const tracked = webReadable.pipe(progressTransform);
  webReadable.on('error', (err) => tracked.destroy(err));

  if (downloadUri.endsWith('.gz')) {
    const gunzip = createGunzip();
    tracked.on('error', (err) => gunzip.destroy(err));
    const jsonlStream = tracked.pipe(gunzip);
    return extractPaperOverridesFromStream(jsonlStream, targetOracleIds);
  }

  return extractPaperOverridesFromStream(tracked, targetOracleIds);
}

function summarizeResult(
  overrides: Record<string, PaperOverride>,
  targetCount: number,
  fromCache: boolean,
): ResolvePaperOverridesResult {
  const entries = Object.values(overrides);
  const pricedCount = entries.filter((entry) => entry.priceUsd !== null).length;
  return {
    overrides,
    targetCount,
    resolvedCount: entries.length,
    pricedCount,
    fromCache,
  };
}

/**
 * Resolves paper USD prices and paper card images for MTGO/Arena/unpriced Commander cards,
 * persisting a compact `.cache/paper-overrides.json` cache alongside `.cache/oracle-cards.jsonl.gz`.
 */
export async function resolvePaperOverrides(
  options: ResolvePaperOverridesOptions,
): Promise<ResolvePaperOverridesResult> {
  const targetOracleIds = collectPaperBackfillIds(options.rawCards);
  if (targetOracleIds.size === 0) {
    return summarizeResult({}, 0, true);
  }

  const cacheDir = options.cacheDir ?? path.resolve(process.cwd(), '.cache');
  const cachePath = path.join(cacheDir, 'paper-overrides.json');
  await mkdir(cacheDir, { recursive: true });

  const cached = await readOverrideCache(cachePath);
  const cacheMatchesOracle =
    cached !== null &&
    cached.updatedAt === options.oracleUpdatedAt &&
    cached.targetCount === targetOracleIds.size;

  if (options.offline) {
    if (!cached) {
      console.warn(
        `   Offline mode: no ${cachePath} found; skipping paper price backfill for ${targetOracleIds.size} cards.`,
      );
      return summarizeResult({}, targetOracleIds.size, true);
    }
    return summarizeResult(cached.overrides, targetOracleIds.size, true);
  }

  if (!options.forceRefresh && cacheMatchesOracle) {
    return summarizeResult(cached.overrides, targetOracleIds.size, true);
  }

  const overrides = await fetchDefaultCardsOverrides(targetOracleIds);
  const payload: PaperOverrideCacheFile = {
    version: 1,
    updatedAt: options.oracleUpdatedAt,
    targetCount: targetOracleIds.size,
    overrides,
  };

  const tmpPath = `${cachePath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(payload), 'utf8');
  await rename(tmpPath, cachePath);

  return summarizeResult(overrides, targetOracleIds.size, false);
}
