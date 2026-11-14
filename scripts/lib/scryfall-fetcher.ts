import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import type { ScryfallBulkDataResponse, ScryfallRawCard } from '../../src/types/card.js';

const SCRYFALL_BULK_URL = 'https://api.scryfall.com/bulk-data/oracle-cards';
export const SCRYFALL_HEADERS = {
  'User-Agent': 'MTGDeckBuilderUltra/1.0 (Local Pipeline)',
  Accept: 'application/json',
};

export interface FetchOracleOptions {
  offline?: boolean;
  forceRefresh?: boolean;
  cacheDir?: string;
}

export interface FetchOracleResult {
  cards: ScryfallRawCard[];
  updatedAt: string;
  fromCache: boolean;
}

async function readCachedMeta(metaPath: string): Promise<ScryfallBulkDataResponse | null> {
  if (!existsSync(metaPath)) return null;
  try {
    const raw = await readFile(metaPath, 'utf8');
    return JSON.parse(raw) as ScryfallBulkDataResponse;
  } catch {
    return null;
  }
}

/**
 * Parses a newline-delimited JSON (JSONL) stream into ScryfallRawCard entries.
 * Blank lines are safely ignored.
 */
export async function parseJsonlStream(
  stream: NodeJS.ReadableStream,
): Promise<ScryfallRawCard[]> {
  const cards: ScryfallRawCard[] = [];
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) continue;
    cards.push(JSON.parse(line) as ScryfallRawCard);
  }

  return cards;
}

/**
 * Streams and gunzips a `.jsonl.gz` Scryfall bulk file into ScryfallRawCard records.
 */
export async function readCardsFromJsonlGz(filePath: string): Promise<ScryfallRawCard[]> {
  const fileStream = createReadStream(filePath);
  const gunzip = createGunzip();
  fileStream.on('error', (err) => gunzip.destroy(err));
  fileStream.pipe(gunzip);
  return parseJsonlStream(gunzip);
}

async function downloadBulkFile(
  downloadUri: string,
  destPath: string,
  expectedBytes?: number,
): Promise<void> {
  const response = await fetch(downloadUri, { headers: SCRYFALL_HEADERS });
  if (!response.ok || !response.body) {
    throw new Error(
      `Failed to download Scryfall bulk file (${response.status} ${response.statusText}) from ${downloadUri}`,
    );
  }

  const contentLengthHeader = response.headers.get('content-length');
  const totalBytes = contentLengthHeader
    ? Number.parseInt(contentLengthHeader, 10)
    : (expectedBytes ?? 0);
  const tmpPath = `${destPath}.tmp`;

  let downloaded = 0;
  let lastLoggedPercent = -20;

  const progressTransform = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      downloaded += chunk.length;
      if (totalBytes > 0) {
        const percent = Math.floor((downloaded / totalBytes) * 100);
        if (percent >= lastLoggedPercent + 20 || percent === 100) {
          lastLoggedPercent = percent;
          const mbDone = (downloaded / (1024 * 1024)).toFixed(1);
          const mbTotal = (totalBytes / (1024 * 1024)).toFixed(1);
          process.stdout.write(
            `  Downloading oracle-cards.jsonl.gz: ${mbDone} / ${mbTotal} MB (${percent}%)\n`,
          );
        }
      }
      callback(null, chunk);
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readable = Readable.fromWeb(response.body as any);
  const fileStream = createWriteStream(tmpPath);

  await pipeline(readable, progressTransform, fileStream);
  await rename(tmpPath, destPath);
}

/**
 * Fetches Scryfall's oracle-cards bulk dataset (`.jsonl.gz`) with local `.cache/` persistence.
 */
export async function fetchOracleCards(
  options: FetchOracleOptions = {},
): Promise<FetchOracleResult> {
  const cacheDir = options.cacheDir ?? path.resolve(process.cwd(), '.cache');
  const dataPath = path.join(cacheDir, 'oracle-cards.jsonl.gz');
  const metaPath = path.join(cacheDir, 'oracle-cards-meta.json');

  await mkdir(cacheDir, { recursive: true });

  if (options.offline) {
    if (!existsSync(dataPath)) {
      throw new Error(
        `Offline mode requested, but cached file does not exist at ${dataPath}. Run without --offline first.`,
      );
    }
    const cachedMeta = await readCachedMeta(metaPath);
    const updatedAt = cachedMeta?.updated_at ?? (await stat(dataPath)).mtime.toISOString();
    const cards = await readCardsFromJsonlGz(dataPath);
    return { cards, updatedAt, fromCache: true };
  }

  const metaResponse = await fetch(SCRYFALL_BULK_URL, { headers: SCRYFALL_HEADERS });
  if (!metaResponse.ok) {
    throw new Error(
      `Failed to fetch Scryfall bulk-data metadata: ${metaResponse.status} ${metaResponse.statusText}`,
    );
  }
  const remoteMeta = (await metaResponse.json()) as ScryfallBulkDataResponse;

  const cachedMeta = await readCachedMeta(metaPath);
  const cacheValid =
    !options.forceRefresh &&
    existsSync(dataPath) &&
    cachedMeta !== null &&
    cachedMeta.updated_at === remoteMeta.updated_at;

  if (cacheValid) {
    const cards = await readCardsFromJsonlGz(dataPath);
    return { cards, updatedAt: remoteMeta.updated_at, fromCache: true };
  }

  const downloadUri = remoteMeta.jsonl_download_uri ?? remoteMeta.download_uri;
  if (!downloadUri) {
    throw new Error(
      `Scryfall bulk-data response is missing both jsonl_download_uri and download_uri: ${JSON.stringify(remoteMeta)}`,
    );
  }
  const expectedBytes = remoteMeta.compressed_size ?? remoteMeta.size;

  await downloadBulkFile(downloadUri, dataPath, expectedBytes);
  await writeFile(metaPath, JSON.stringify(remoteMeta, null, 2), 'utf8');

  const cards = await readCardsFromJsonlGz(dataPath);
  return { cards, updatedAt: remoteMeta.updated_at, fromCache: false };
}
