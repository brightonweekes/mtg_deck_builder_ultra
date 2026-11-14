import { clearCardCatalogCache, syncCardCatalog } from '../db/cardDb.js';
import { CardSearchEngine } from '../search/searchEngine.js';
import {
  DEFAULT_SEARCH_FILTER,
  type SearchFilter,
  type WorkerRequestMessage,
  type WorkerResponseMessage,
} from '../types/search.js';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

let engine: CardSearchEngine | null = null;
let isInitializing = false;
let pendingSearch: { requestId: number; filter: SearchFilter } | null = null;
let pendingResolves: Array<{ requestId: number; ids?: string[]; names?: string[] }> = [];

function post(message: WorkerResponseMessage): void {
  workerScope.postMessage(message);
}

function respondToResolve(
  activeEngine: CardSearchEngine,
  requestId: number,
  ids?: string[],
  names?: string[],
): void {
  post({
    type: 'RESOLVE_CARDS_RESULT',
    requestId,
    byId: ids && ids.length > 0 ? activeEngine.getCardsByIdMap(ids) : {},
    byName: names && names.length > 0 ? activeEngine.getCardsByNames(names) : {},
    basicLands: activeEngine.getBasicLands(),
  });
}

async function initializeCatalog(baseUrl?: string, forceRefresh = false): Promise<void> {
  if (isInitializing) return;
  isInitializing = true;
  const initStart = performance.now();

  try {
    if (forceRefresh) {
      await clearCardCatalogCache();
    }

    const syncResult = await syncCardCatalog({
      baseUrl,
      forceRefresh,
      onProgress: (status) => {
        post({ type: 'SYNC_STATUS', payload: status });
      },
    });

    post({
      type: 'SYNC_STATUS',
      payload: {
        stage: 'indexing',
        progressPercent: 94,
        message: 'Building bitmask search index...',
        fromCache: syncResult.fromCache,
        manifest: syncResult.manifest,
      },
    });

    engine = new CardSearchEngine(syncResult.cards);
    const totalLoadMs = Math.max(1, Math.round(performance.now() - initStart));

    post({
      type: 'SYNC_STATUS',
      payload: {
        stage: 'ready',
        progressPercent: 100,
        message: syncResult.fromCache
          ? `Loaded ${engine.totalCount.toLocaleString()} cards from IndexedDB in ${totalLoadMs} ms`
          : `Downloaded & indexed ${engine.totalCount.toLocaleString()} cards in ${totalLoadMs} ms`,
        fromCache: syncResult.fromCache,
        loadTimeMs: totalLoadMs,
        manifest: syncResult.manifest,
      },
    });

    // Push canonical basic lands map so DeckWorkspace Quick-Station is immediately populated
    respondToResolve(engine, 0);

    // Flush any queued RESOLVE_CARDS requests sent before catalog finished loading
    const resolvesToRun = pendingResolves;
    pendingResolves = [];
    for (const req of resolvesToRun) {
      respondToResolve(engine, req.requestId, req.ids, req.names);
    }

    const initialSearch = pendingSearch ?? {
      requestId: 0,
      filter: DEFAULT_SEARCH_FILTER,
    };
    pendingSearch = null;
    post({
      type: 'SEARCH_RESULT',
      payload: engine.search(initialSearch.filter, initialSearch.requestId),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    pendingResolves = [];
    post({
      type: 'SYNC_STATUS',
      payload: {
        stage: 'error',
        progressPercent: 0,
        message: errorMsg,
        error: errorMsg,
      },
    });
  } finally {
    isInitializing = false;
  }
}

workerScope.onmessage = (event: MessageEvent<WorkerRequestMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'INIT':
      void initializeCatalog(msg.baseUrl, false);
      break;
    case 'FORCE_RESYNC':
      engine = null;
      void initializeCatalog(msg.baseUrl, true);
      break;
    case 'SEARCH':
      if (!engine) {
        pendingSearch = { requestId: msg.requestId, filter: msg.filter };
        return;
      }
      post({
        type: 'SEARCH_RESULT',
        payload: engine.search(msg.filter, msg.requestId),
      });
      break;
    case 'GET_BY_IDS':
      post({
        type: 'CARDS_BY_IDS_RESULT',
        requestId: msg.requestId,
        cards: engine ? engine.getCardsByIds(msg.ids) : [],
      });
      break;
    case 'RESOLVE_CARDS':
      if (!engine) {
        pendingResolves.push({
          requestId: msg.requestId,
          ids: msg.ids,
          names: msg.names,
        });
        return;
      }
      respondToResolve(engine, msg.requestId, msg.ids, msg.names);
      break;
  }
};
