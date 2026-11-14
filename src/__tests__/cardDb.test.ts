import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearCardCatalogCache,
  MtgCardDatabase,
  SNAPSHOT_KEY,
  syncCardCatalog,
} from '../db/cardDb.js';
import {
  compactCardForDisk,
  type CompactCard,
  type DataManifest,
} from '../types/card.js';
import type { SyncStatusPayload } from '../types/search.js';

function makeManifest(version: string, cards: CompactCard[]): DataManifest {
  return {
    version,
    generatedAt: '2026-11-14T00:00:00.000Z',
    scryfallUpdatedAt: '2026-11-13T22:00:00.000Z',
    totalCards: cards.length,
    commanderCount: cards.filter((c) => c.isCommanderEligible).length,
    rawSizeBytes: JSON.stringify(cards).length,
    gzipSizeBytes: 100,
    brotliSizeBytes: 80,
    roleCounts: {
      ramp: 1,
      draw: 0,
      removal: 0,
      wipe: 0,
      tutor: 0,
      recursion: 0,
      protection: 0,
    },
    themeCounts: {},
  };
}

function makeSampleCard(id: string, name: string, isCommander = false): CompactCard {
  return {
    id,
    oracleId: `oracle-${id}`,
    name,
    manaCost: '{1}',
    cmc: 1,
    typeLine: isCommander ? 'Legendary Creature — Construct' : 'Artifact',
    oracleText: '{T}: Add {C}{C}.',
    colors: [],
    colorIdentity: [],
    keywords: [],
    edhrecRank: 1,
    priceUsd: 1.5,
    imageNormal: 'https://cards.scryfall.io/normal/front/sol.jpg',
    imageSmall: 'https://cards.scryfall.io/small/front/sol.jpg',
    layout: 'normal',
    isCommanderEligible: isCommander,
    roles: ['ramp'],
    themes: [],
  };
}

describe('cardDb IndexedDB Sync Service', () => {
  const createdDbs: MtgCardDatabase[] = [];

  function createTestDb(suffix: string): MtgCardDatabase {
    const db = new MtgCardDatabase(`mtg-test-${suffix}-${Math.random().toString(36).slice(2)}`);
    createdDbs.push(db);
    return db;
  }

  afterEach(async () => {
    while (createdDbs.length > 0) {
      const db = createdDbs.pop()!;
      db.close();
      await db.delete();
    }
  });

  it('downloads catalog on cold start and reads from IndexedDB cache in <100ms on repeat visit', async () => {
    const db = createTestDb('cold-warm');
    const sampleCards = [
      makeSampleCard('1', 'Sol Ring'),
      makeSampleCard('2', 'Korvold, Fae-Cursed King', true),
    ];
    const manifest = makeManifest('v1-hash-abc', sampleCards);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/data/manifest.json')) {
        return new Response(JSON.stringify(manifest), { status: 200 });
      }
      if (url.includes('/data/cards.min.json')) {
        return new Response(JSON.stringify(sampleCards), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    });

    const stages: SyncStatusPayload['stage'][] = [];
    const cold = await syncCardCatalog({
      db,
      fetchImpl: fetchMock as unknown as typeof fetch,
      onProgress: (s) => stages.push(s.stage),
    });

    expect(cold.fromCache).toBe(false);
    expect(cold.cards).toHaveLength(2);
    expect(cold.manifest.version).toBe('v1-hash-abc');
    expect(stages).toContain('downloading-catalog');
    expect(stages).toContain('saving-cache');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]![0])).toBe('/data/cards.min.json?v=v1-hash-abc');

    // Repeat visit: should fetch ONLY manifest.json and hit IndexedDB snapshot in <100ms
    fetchMock.mockClear();
    const warmStart = performance.now();
    const warm = await syncCardCatalog({
      db,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const warmElapsedMs = performance.now() - warmStart;

    expect(warm.fromCache).toBe(true);
    expect(warm.cards).toHaveLength(2);
    expect(warm.cards[1]!.name).toBe('Korvold, Fae-Cursed King');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/data/manifest.json');
    expect(warmElapsedMs).toBeLessThan(100);
  });

  it('invalidates cache and downloads new catalog when manifest.version changes', async () => {
    const db = createTestDb('version-bump');
    const cardsV1 = [makeSampleCard('1', 'Sol Ring')];
    const cardsV2 = [makeSampleCard('1', 'Sol Ring'), makeSampleCard('2', 'Arcane Signet')];

    let activeVersion = 'v1';
    let activeCards = cardsV1;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/data/manifest.json')) {
        return new Response(JSON.stringify(makeManifest(activeVersion, activeCards)), {
          status: 200,
        });
      }
      return new Response(JSON.stringify(activeCards), { status: 200 });
    });

    const first = await syncCardCatalog({
      db,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(first.cards).toHaveLength(1);

    // Simulate nightly Scryfall update
    activeVersion = 'v2';
    activeCards = cardsV2;

    const second = await syncCardCatalog({
      db,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(second.fromCache).toBe(false);
    expect(second.cards).toHaveLength(2);
    expect(second.manifest.version).toBe('v2');

    const stored = await db.catalogSnapshots.get(SNAPSHOT_KEY);
    expect(stored?.version).toBe('v2');
    expect(stored?.cards).toHaveLength(2);
  });

  it('supports forceRefresh and clearCardCatalogCache', async () => {
    const db = createTestDb('force-refresh');
    const cards = [makeSampleCard('1', 'Sol Ring')];
    const manifest = makeManifest('v1', cards);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/data/manifest.json')) {
        return new Response(JSON.stringify(manifest), { status: 200 });
      }
      return new Response(JSON.stringify(cards), { status: 200 });
    });

    await syncCardCatalog({ db, fetchImpl: fetchMock as unknown as typeof fetch });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const forced = await syncCardCatalog({
      db,
      fetchImpl: fetchMock as unknown as typeof fetch,
      forceRefresh: true,
    });
    expect(forced.fromCache).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await clearCardCatalogCache(db);
    expect(await db.catalogSnapshots.get(SNAPSHOT_KEY)).toBeUndefined();
  });

  it('falls back to cached IndexedDB snapshot when offline, and throws if uncached', async () => {
    const db = createTestDb('offline-fallback');
    const cards = [makeSampleCard('1', 'Sol Ring')];
    const manifest = makeManifest('v1', cards);

    const onlineFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/data/manifest.json')) {
        return new Response(JSON.stringify(manifest), { status: 200 });
      }
      return new Response(JSON.stringify(cards), { status: 200 });
    });

    await syncCardCatalog({ db, fetchImpl: onlineFetch as unknown as typeof fetch });

    const offlineFetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch: network offline');
    });

    const offlineResult = await syncCardCatalog({
      db,
      fetchImpl: offlineFetch as unknown as typeof fetch,
    });
    expect(offlineResult.fromCache).toBe(true);
    expect(offlineResult.cards).toHaveLength(1);
    expect(offlineResult.manifest.version).toBe('v1');

    const emptyDb = createTestDb('offline-empty');
    await expect(
      syncCardCatalog({
        db: emptyDb,
        fetchImpl: offlineFetch as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/network offline/i);
  });

  it('hydrates slimmed disk cards (restoring omitted imageSmall on card and DFC faces)', async () => {
    const db = createTestDb('slim-hydrate');
    const esika: CompactCard = {
      ...makeSampleCard('esika-1', 'Esika, God of the Tree // The Prismatic Bridge', true),
      imageNormal: 'https://cards.scryfall.io/normal/front/a/b/esika.jpg',
      imageSmall: 'https://cards.scryfall.io/small/front/a/b/esika.jpg',
      artCrop: 'https://cards.scryfall.io/art_crop/front/a/b/esika.jpg',
      layout: 'modal_dfc',
      faces: [
        {
          name: 'Esika, God of the Tree',
          manaCost: '{1}{G}{G}',
          typeLine: 'Legendary Creature — God',
          oracleText: 'Vigilance',
          imageNormal: 'https://cards.scryfall.io/normal/front/a/b/esika.jpg',
          imageSmall: 'https://cards.scryfall.io/small/front/a/b/esika.jpg',
        },
        {
          name: 'The Prismatic Bridge',
          manaCost: '{W}{U}{B}{R}{G}',
          typeLine: 'Legendary Enchantment',
          oracleText: 'At the beginning of your upkeep...',
          imageNormal: 'https://cards.scryfall.io/normal/back/c/d/bridge.jpg',
          imageSmall: 'https://cards.scryfall.io/small/back/c/d/bridge.jpg',
        },
      ],
    };

    const serialized = [compactCardForDisk(esika)];
    expect(serialized[0]).not.toHaveProperty('artCrop');
    expect(serialized[0]).not.toHaveProperty('imageSmall');
    expect(serialized[0]!.faces![0]).not.toHaveProperty('imageSmall');

    const manifest = makeManifest('v-slim-1', [esika]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/data/manifest.json')) {
        return new Response(JSON.stringify(manifest), { status: 200 });
      }
      return new Response(JSON.stringify(serialized), { status: 200 });
    });

    const synced = await syncCardCatalog({
      db,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(synced.cards).toHaveLength(1);
    expect(synced.cards[0]!.imageSmall).toBe('https://cards.scryfall.io/small/front/a/b/esika.jpg');
    expect(synced.cards[0]!.faces![0]!.imageSmall).toBe(
      'https://cards.scryfall.io/small/front/a/b/esika.jpg',
    );
    expect(synced.cards[0]!.faces![1]!.imageSmall).toBe(
      'https://cards.scryfall.io/small/back/c/d/bridge.jpg',
    );

    const stored = await db.catalogSnapshots.get(SNAPSHOT_KEY);
    expect(stored?.cards[0]?.imageSmall).toBe('https://cards.scryfall.io/small/front/a/b/esika.jpg');
  });
});
