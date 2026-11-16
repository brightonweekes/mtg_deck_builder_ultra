import Dexie, { type Table } from 'dexie';
import {
  hydrateCompactCard,
  type CompactCard,
  type DataManifest,
  type FunctionalRole,
  type SerializedCompactCard,
} from '../types/card.js';
import type { CardListRecord, DeckVisibility, SyncStatus } from '../types/cloud.js';
import type { SyncStatusPayload } from '../types/search.js';

export const DEFAULT_CARD_DB_NAME = 'ripple99';
export const SNAPSHOT_KEY = 'commander-oracle';
export const MANIFEST_KEY = 'manifest';

export interface CatalogSnapshotRecord {
  id: string;
  version: string;
  savedAt: string;
  cards: CompactCard[];
}

export interface MetaRecord {
  key: string;
  value: DataManifest;
}

export interface SavedDeckRecord {
  id: string;
  name: string;
  description?: string;
  commanderIds: string[];
  mainboard: Record<string, number>;
  sideboard: Record<string, number>;
  lockSearchToCommanderIdentity?: boolean;
  visibility?: DeckVisibility;
  sharedWithUids?: string[];
  synergyThemes?: string[];
  ownerUid?: string | null;
  ownerHandle?: string;
  revision?: number;
  syncStatus?: SyncStatus;
  cloudUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface CollectionEntryRecord {
  cardId: string;
  quantity: number;
  foilQuantity?: number;
  forTradeQuantity?: number;
  updatedAt: string;
}

export interface SyncMetaRecord {
  key: string;
  value: string;
}

export class MtgCardDatabase extends Dexie {
  catalogSnapshots!: Table<CatalogSnapshotRecord, string>;
  meta!: Table<MetaRecord, string>;
  decks!: Table<SavedDeckRecord, string>;
  collection!: Table<CollectionEntryRecord, string>;
  cardlists!: Table<CardListRecord, string>;
  syncMeta!: Table<SyncMetaRecord, string>;

  constructor(name = DEFAULT_CARD_DB_NAME) {
    super(name);
    this.version(1).stores({
      catalogSnapshots: 'id',
      meta: 'key',
      decks: 'id, name, updatedAt',
      collection: 'cardId',
    });

    this.version(2)
      .stores({
        catalogSnapshots: 'id',
        meta: 'key',
        decks: 'id, name, updatedAt, ownerUid, syncStatus, deletedAt',
        collection: 'cardId',
        cardlists: 'id, name, listType, updatedAt, ownerUid, syncStatus, deletedAt',
        syncMeta: 'key',
      })
      .upgrade(async (tx) => {
        await tx
          .table<SavedDeckRecord, string>('decks')
          .toCollection()
          .modify((deck) => {
            if (deck.visibility === undefined) deck.visibility = 'private';
            if (deck.syncStatus === undefined) deck.syncStatus = 'local';
            if (deck.revision === undefined) deck.revision = 0;
            if (deck.ownerUid === undefined) deck.ownerUid = null;
            if (deck.deletedAt === undefined) deck.deletedAt = null;
          });
      });
  }
}

export const cardDb = new MtgCardDatabase();

export interface SyncCatalogOptions {
  db?: MtgCardDatabase;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  forceRefresh?: boolean;
  onProgress?: (status: SyncStatusPayload) => void;
}

export interface SyncCatalogResult {
  cards: CompactCard[];
  manifest: DataManifest;
  fromCache: boolean;
  loadTimeMs: number;
}

function buildFallbackManifest(snapshot: CatalogSnapshotRecord): DataManifest {
  return {
    version: snapshot.version,
    generatedAt: snapshot.savedAt,
    scryfallUpdatedAt: snapshot.savedAt,
    totalCards: snapshot.cards.length,
    commanderCount: snapshot.cards.reduce((acc, c) => (c.isCommanderEligible ? acc + 1 : acc), 0),
    rawSizeBytes: 0,
    gzipSizeBytes: 0,
    brotliSizeBytes: 0,
    roleCounts: {} as Record<FunctionalRole, number>,
    themeCounts: {},
  };
}

async function readResponseTextWithProgress(
  response: Response,
  expectedBytes: number,
  onProgress?: (percent: number, loadedBytes: number) => void,
): Promise<string> {
  if (!response.body) {
    return response.text();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let jsonText = '';
  let receivedBytes = 0;
  let lastReportedPercent = -5;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      receivedBytes += value.byteLength;
      jsonText += decoder.decode(value, { stream: true });

      if (onProgress && expectedBytes > 0) {
        const pct = Math.min(100, Math.round((receivedBytes / expectedBytes) * 100));
        if (pct >= lastReportedPercent + 5 || pct === 100) {
          lastReportedPercent = pct;
          onProgress(pct, receivedBytes);
        }
      }
    }
  }

  jsonText += decoder.decode();
  return jsonText;
}

/**
 * Clears the cached catalog snapshot and manifest metadata from IndexedDB.
 */
export async function clearCardCatalogCache(db: MtgCardDatabase = cardDb): Promise<void> {
  await db.transaction('rw', db.catalogSnapshots, db.meta, async () => {
    await db.catalogSnapshots.delete(SNAPSHOT_KEY);
    await db.meta.delete(MANIFEST_KEY);
  });
}

/**
 * Syncs the Commander card catalog using IndexedDB for <100ms repeat loads.
 * Only downloads `cards.min.json` on first visit, version mismatch, or `forceRefresh`.
 */
export async function syncCardCatalog(
  options: SyncCatalogOptions = {},
): Promise<SyncCatalogResult> {
  const db = options.db ?? cardDb;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const baseUrl = (options.baseUrl ?? '').replace(/\/$/, '');
  const onProgress = options.onProgress;
  const startTime = performance.now();

  onProgress?.({
    stage: 'checking-manifest',
    progressPercent: 5,
    message: 'Checking catalog manifest...',
  });

  let remoteManifest: DataManifest | null = null;
  let manifestError: unknown = null;

  try {
    const manifestResp = await fetchImpl(`${baseUrl}/data/manifest.json`, {
      cache: 'no-cache',
    });
    if (!manifestResp.ok) {
      throw new Error(
        `Failed to fetch manifest.json (${manifestResp.status} ${manifestResp.statusText})`,
      );
    }
    remoteManifest = (await manifestResp.json()) as DataManifest;
  } catch (err: unknown) {
    manifestError = err;
  }

  // Check IndexedDB snapshot once (single structured read for fast repeat loads)
  const cachedSnapshot = options.forceRefresh
    ? undefined
    : await db.catalogSnapshots.get(SNAPSHOT_KEY);

  // Offline / network-error graceful fallback if valid cache exists
  if (!remoteManifest) {
    if (cachedSnapshot && cachedSnapshot.cards.length > 0) {
      const hydrated = cachedSnapshot.cards.map(hydrateCompactCard);
      const cachedMeta = await db.meta.get(MANIFEST_KEY);
      const manifest = cachedMeta?.value ?? buildFallbackManifest(cachedSnapshot);
      const loadTimeMs = Math.max(1, Math.round(performance.now() - startTime));
      onProgress?.({
        stage: 'loading-cache',
        progressPercent: 85,
        message: 'Offline: loaded card catalog from IndexedDB cache.',
        fromCache: true,
        loadTimeMs,
        manifest,
      });
      return {
        cards: hydrated,
        manifest,
        fromCache: true,
        loadTimeMs,
      };
    }

    throw manifestError instanceof Error
      ? manifestError
      : new Error('Unable to load card catalog manifest and no offline cache exists.');
  }

  // Cache hit when version matches
  if (
    !options.forceRefresh &&
    cachedSnapshot &&
    cachedSnapshot.version === remoteManifest.version &&
    cachedSnapshot.cards.length > 0
  ) {
    const hydrated = cachedSnapshot.cards.map(hydrateCompactCard);
    const loadTimeMs = Math.max(1, Math.round(performance.now() - startTime));
    onProgress?.({
      stage: 'loading-cache',
      progressPercent: 85,
      message: `Loaded ${hydrated.length.toLocaleString()} cards from IndexedDB cache.`,
      fromCache: true,
      loadTimeMs,
      manifest: remoteManifest,
    });
    return {
      cards: hydrated,
      manifest: remoteManifest,
      fromCache: true,
      loadTimeMs,
    };
  }

  // Download fresh catalog
  onProgress?.({
    stage: 'downloading-catalog',
    progressPercent: 10,
    message: `Downloading ${remoteManifest.totalCards.toLocaleString()} Commander cards...`,
    fromCache: false,
    manifest: remoteManifest,
  });

  const versionParam = encodeURIComponent(remoteManifest.version);
  const cardsResp = await fetchImpl(`${baseUrl}/data/cards.min.json?v=${versionParam}`);
  if (!cardsResp.ok) {
    throw new Error(
      `Failed to fetch cards.min.json (${cardsResp.status} ${cardsResp.statusText})`,
    );
  }

  const expectedBytes = remoteManifest.rawSizeBytes > 0 ? remoteManifest.rawSizeBytes : 22_500_000;
  const jsonText = await readResponseTextWithProgress(
    cardsResp,
    expectedBytes,
    (downloadPct, loadedBytes) => {
      const overallPct = 10 + Math.round((downloadPct / 100) * 65);
      const mbLoaded = (loadedBytes / (1024 * 1024)).toFixed(1);
      onProgress?.({
        stage: 'downloading-catalog',
        progressPercent: overallPct,
        message: `Downloading card database (${mbLoaded} MB)...`,
        fromCache: false,
        manifest: remoteManifest ?? undefined,
      });
    },
  );

  const rawCards = JSON.parse(jsonText) as SerializedCompactCard[];
  const cards = rawCards.map(hydrateCompactCard);

  onProgress?.({
    stage: 'saving-cache',
    progressPercent: 82,
    message: `Saving ${cards.length.toLocaleString()} cards to IndexedDB...`,
    fromCache: false,
    manifest: remoteManifest,
  });

  const snapshot: CatalogSnapshotRecord = {
    id: SNAPSHOT_KEY,
    version: remoteManifest.version,
    savedAt: new Date().toISOString(),
    cards,
  };

  await db.transaction('rw', db.catalogSnapshots, db.meta, async () => {
    await db.catalogSnapshots.put(snapshot);
    await db.meta.put({ key: MANIFEST_KEY, value: remoteManifest });
  });

  const loadTimeMs = Math.max(1, Math.round(performance.now() - startTime));
  return {
    cards,
    manifest: remoteManifest,
    fromCache: false,
    loadTimeMs,
  };
}
