import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import {
  compactCardForDisk,
  FUNCTIONAL_ROLES,
  type CompactCard,
  type DataManifest,
  type FunctionalRole,
} from '../src/types/card.js';
import { normalizeCard } from './lib/card-normalizer.js';
import { buildCommandersOgIndex } from './lib/commanders-og.js';
import { resolvePaperOverrides } from './lib/paper-backfill.js';
import { fetchOracleCards } from './lib/scryfall-fetcher.js';

/** Cloudflare Pages hard maximum static asset limit: 25 MiB (26,214,400 bytes). */
export const MAX_CLOUDFLARE_ASSET_BYTES = 25 * 1024 * 1024;

export interface BuildIndexOptions {
  offline?: boolean;
  forceRefresh?: boolean;
  outputDir?: string;
  cacheDir?: string;
}

export interface ManifestTimestampResolution {
  generatedAt: string;
  scryfallUpdatedAt?: string;
  versionChanged: boolean;
}

/**
 * Resolves manifest timestamps idempotently: preserves `generatedAt` (and `scryfallUpdatedAt`)
 * whenever the SHA-256 content hash `newVersion` matches the existing manifest on disk.
 */
export function resolveManifestGeneratedAt(
  existingManifest: DataManifest | null,
  newVersion: string,
  nowIso?: string,
): ManifestTimestampResolution {
  if (
    existingManifest &&
    existingManifest.version === newVersion &&
    Boolean(existingManifest.generatedAt)
  ) {
    return {
      generatedAt: existingManifest.generatedAt,
      scryfallUpdatedAt: existingManifest.scryfallUpdatedAt,
      versionChanged: false,
    };
  }
  return {
    generatedAt: nowIso ?? new Date().toISOString(),
    versionChanged: true,
  };
}

async function readExistingManifest(manifestPath: string): Promise<DataManifest | null> {
  if (!existsSync(manifestPath)) return null;
  try {
    const raw = await readFile(manifestPath, 'utf8');
    return JSON.parse(raw) as DataManifest;
  } catch {
    return null;
  }
}

function compareCards(a: CompactCard, b: CompactCard): number {
  if (a.edhrecRank !== null && b.edhrecRank !== null) {
    if (a.edhrecRank !== b.edhrecRank) return a.edhrecRank - b.edhrecRank;
  } else if (a.edhrecRank !== null) {
    return -1;
  } else if (b.edhrecRank !== null) {
    return 1;
  }
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMiB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

/**
 * Runs the complete Scryfall -> Normalize -> Method A Tag -> Write JSON pipeline.
 */
export async function buildCardIndex(options: BuildIndexOptions = {}): Promise<DataManifest> {
  const outputDir = options.outputDir ?? path.resolve(process.cwd(), 'public', 'data');
  await mkdir(outputDir, { recursive: true });

  console.log('1. Fetching Scryfall oracle-cards bulk data...');
  const fetchStart = performance.now();
  const { cards: rawCards, updatedAt, fromCache } = await fetchOracleCards({
    offline: options.offline,
    forceRefresh: options.forceRefresh,
    cacheDir: options.cacheDir,
  });
  const fetchMs = performance.now() - fetchStart;
  console.log(
    `   Loaded ${rawCards.length.toLocaleString()} raw cards (${fromCache ? 'from local cache' : 'downloaded'}) in ${fetchMs.toFixed(0)} ms.`,
  );

  console.log('2. Resolving paper prices & artwork for non-paper/unpriced printings...');
  const backfillStart = performance.now();
  const backfillResult = await resolvePaperOverrides({
    rawCards,
    oracleUpdatedAt: updatedAt,
    cacheDir: options.cacheDir,
    offline: options.offline,
    forceRefresh: options.forceRefresh,
  });
  const backfillMs = performance.now() - backfillStart;
  console.log(
    `   Resolved ${backfillResult.pricedCount.toLocaleString()}/${backfillResult.targetCount.toLocaleString()} paper prices (${backfillResult.fromCache ? 'from cache' : 'streamed default-cards'}) in ${backfillMs.toFixed(0)} ms.`,
  );

  console.log('3. Filtering, normalizing, and running Method A tagger...');
  const processStart = performance.now();

  const normalized: CompactCard[] = [];
  let commanderCount = 0;

  const roleCounts = Object.fromEntries(
    FUNCTIONAL_ROLES.map((role) => [role, 0]),
  ) as Record<FunctionalRole, number>;

  const themeCountsMap = new Map<string, number>();

  for (const raw of rawCards) {
    const oracleId = raw.oracle_id ?? raw.id;
    const card = normalizeCard(raw, backfillResult.overrides[oracleId]);
    if (!card) continue;

    normalized.push(card);
    if (card.isCommanderEligible) commanderCount++;

    for (const role of card.roles) {
      roleCounts[role]++;
    }
    for (const theme of card.themes) {
      themeCountsMap.set(theme, (themeCountsMap.get(theme) ?? 0) + 1);
    }
  }

  normalized.sort(compareCards);
  const processMs = performance.now() - processStart;
  console.log(
    `   Processed ${normalized.length.toLocaleString()} Commander-legal cards (${commanderCount.toLocaleString()} Commanders) in ${processMs.toFixed(0)} ms.`,
  );

  console.log('4. Serializing and compressing output...');
  const diskCards = normalized.map(compactCardForDisk);
  const jsonString = JSON.stringify(diskCards);
  const rawBuffer = Buffer.from(jsonString, 'utf8');
  const rawSizeBytes = rawBuffer.byteLength;

  if (rawSizeBytes >= MAX_CLOUDFLARE_ASSET_BYTES) {
    throw new Error(
      `cards.min.json size (${rawSizeBytes.toLocaleString()} bytes / ${formatMiB(rawSizeBytes)}) exceeds Cloudflare Pages' 25 MiB (${MAX_CLOUDFLARE_ASSET_BYTES.toLocaleString()} bytes) single-file limit.`,
    );
  }

  const gzipSizeBytes = gzipSync(rawBuffer, { level: 6 }).byteLength;
  const brotliSizeBytes = brotliCompressSync(rawBuffer).byteLength;
  const version = createHash('sha256').update(rawBuffer).digest('hex').slice(0, 16);

  const cardsOutPath = path.join(outputDir, 'cards.min.json');
  const manifestOutPath = path.join(outputDir, 'manifest.json');
  const commandersOgOutPath = path.join(outputDir, 'commanders-og.json');

  const existingManifest = await readExistingManifest(manifestOutPath);
  const { generatedAt, scryfallUpdatedAt, versionChanged } = resolveManifestGeneratedAt(
    existingManifest,
    version,
  );

  const sortedThemeEntries = Array.from(themeCountsMap.entries()).sort((a, b) => b[1] - a[1]);
  const themeCounts = Object.fromEntries(sortedThemeEntries);

  const manifest: DataManifest = {
    version,
    generatedAt,
    scryfallUpdatedAt: scryfallUpdatedAt ?? updatedAt,
    totalCards: normalized.length,
    commanderCount,
    rawSizeBytes,
    gzipSizeBytes,
    brotliSizeBytes,
    roleCounts,
    themeCounts,
  };

  const commandersOgIndex = buildCommandersOgIndex(normalized);
  const commandersOgBuffer = Buffer.from(JSON.stringify(commandersOgIndex), 'utf8');
  if (commandersOgBuffer.byteLength >= MAX_CLOUDFLARE_ASSET_BYTES) {
    throw new Error(
      `commanders-og.json size (${commandersOgBuffer.byteLength.toLocaleString()} bytes) exceeds Cloudflare Pages' 25 MiB single-file limit.`,
    );
  }

  const shouldWriteCatalog = versionChanged || options.forceRefresh || !existsSync(cardsOutPath);
  if (shouldWriteCatalog) {
    await writeFile(cardsOutPath, rawBuffer);
    await writeFile(manifestOutPath, JSON.stringify(manifest, null, 2), 'utf8');
    await writeFile(commandersOgOutPath, commandersOgBuffer);
  } else {
    if (!existsSync(commandersOgOutPath)) {
      await writeFile(commandersOgOutPath, commandersOgBuffer);
    }
    console.log(
      `   Catalog unchanged (version ${version}); preserved existing generatedAt ${generatedAt}.`,
    );
  }

  const headroomBytes = MAX_CLOUDFLARE_ASSET_BYTES - rawSizeBytes;
  console.log('\n=== Build Summary ===');
  console.log(`Version Hash:    ${manifest.version}${versionChanged ? ' (updated)' : ' (unchanged)'}`);
  console.log(`Scryfall Date:   ${manifest.scryfallUpdatedAt}`);
  console.log(`Total Cards:     ${manifest.totalCards.toLocaleString()}`);
  console.log(`Commanders:      ${manifest.commanderCount.toLocaleString()}`);
  console.log(`Raw JSON Size:   ${formatMb(rawSizeBytes)} (CF headroom: ${formatMiB(headroomBytes)})`);
  console.log(`Commanders OG:   ${(commandersOgBuffer.byteLength / 1024).toFixed(1)} KiB (${commandersOgIndex.rows.length.toLocaleString()} rows)`);
  console.log(`Gzip Size:       ${formatMb(gzipSizeBytes)}`);
  console.log(`Brotli Size:     ${formatMb(brotliSizeBytes)}`);
  console.log(`Output Files:    ${cardsOutPath}`);
  console.log(`                 ${manifestOutPath}`);
  console.log(`                 ${commandersOgOutPath}`);

  console.log('\n--- Functional Roles ---');
  for (const role of FUNCTIONAL_ROLES) {
    console.log(`  ${role.padEnd(14)} ${roleCounts[role].toLocaleString().padStart(6)}`);
  }

  console.log('\n--- Top 15 Mechanical Themes ---');
  for (const [theme, count] of sortedThemeEntries.slice(0, 15)) {
    console.log(`  ${theme.padEnd(22)} ${count.toLocaleString().padStart(6)}`);
  }

  return manifest;
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectExecution) {
  const args = new Set(process.argv.slice(2));
  const offline = args.has('--offline');
  const forceRefresh = args.has('--force-refresh');

  buildCardIndex({ offline, forceRefresh }).catch((err: unknown) => {
    console.error('Card index build failed:', err);
    process.exitCode = 1;
  });
}
