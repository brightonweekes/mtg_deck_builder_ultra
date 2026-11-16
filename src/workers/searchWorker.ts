import { clearCardCatalogCache, syncCardCatalog } from '../db/cardDb.js';
import { CardSearchEngine } from '../search/searchEngine.js';
import {
  DEFAULT_SEARCH_FILTER,
  type SearchFilter,
  type SearchResponsePayload,
  type WorkerRequestMessage,
  type WorkerResponseMessage,
} from '../types/search.js';

export interface WorkerCatalogOps {
  clearCache: () => Promise<void>;
  syncCatalog: typeof syncCardCatalog;
}

const DEFAULT_CATALOG_OPS: WorkerCatalogOps = {
  clearCache: clearCardCatalogCache,
  syncCatalog: syncCardCatalog,
};

function createEmptySearchResult(requestId: number, filter: SearchFilter): SearchResponsePayload {
  return {
    requestId,
    matches: [],
    totalMatches: 0,
    page: Math.max(1, filter.page),
    pageSize: Math.max(1, filter.pageSize),
    totalPages: 1,
    executionTimeMs: 0,
  };
}

/**
 * Stateful request router for the catalog Web Worker.
 * Queues searches and one-off synergy queries independently until indexing completes.
 */
export class SearchWorkerController {
  private engine: CardSearchEngine | null = null;
  private isInitializing = false;
  private hasInitError = false;
  private pendingSearch: { requestId: number; filter: SearchFilter } | null = null;
  private pendingOneOffSearches: Array<{ requestId: number; filter: SearchFilter }> = [];
  private pendingResolves: Array<{ requestId: number; ids?: string[]; names?: string[] }> = [];

  constructor(
    private readonly post: (message: WorkerResponseMessage) => void,
    private readonly catalogOps: WorkerCatalogOps = DEFAULT_CATALOG_OPS,
  ) {}

  private respondToResolve(
    activeEngine: CardSearchEngine,
    requestId: number,
    ids?: string[],
    names?: string[],
  ): void {
    this.post({
      type: 'RESOLVE_CARDS_RESULT',
      requestId,
      byId: ids && ids.length > 0 ? activeEngine.getCardsByIdMap(ids) : {},
      byName: names && names.length > 0 ? activeEngine.getCardsByNames(names) : {},
      basicLands: activeEngine.getBasicLands(),
    });
  }

  async initializeCatalog(baseUrl?: string, forceRefresh = false): Promise<void> {
    if (this.isInitializing) return;
    this.isInitializing = true;
    this.hasInitError = false;
    const initStart = performance.now();

    try {
      if (forceRefresh) {
        await this.catalogOps.clearCache();
      }

      const syncResult = await this.catalogOps.syncCatalog({
        baseUrl,
        forceRefresh,
        onProgress: (status) => {
          this.post({ type: 'SYNC_STATUS', payload: status });
        },
      });

      this.post({
        type: 'SYNC_STATUS',
        payload: {
          stage: 'indexing',
          progressPercent: 94,
          message: 'Building bitmask search index...',
          fromCache: syncResult.fromCache,
          manifest: syncResult.manifest,
        },
      });

      const nextEngine = new CardSearchEngine(syncResult.cards);
      this.engine = nextEngine;
      this.hasInitError = false;
      this.isInitializing = false;
      const totalLoadMs = Math.max(1, Math.round(performance.now() - initStart));

      this.post({
        type: 'SYNC_STATUS',
        payload: {
          stage: 'ready',
          progressPercent: 100,
          message: syncResult.fromCache
            ? `Loaded ${nextEngine.totalCount.toLocaleString()} cards from IndexedDB in ${totalLoadMs} ms`
            : `Downloaded & indexed ${nextEngine.totalCount.toLocaleString()} cards in ${totalLoadMs} ms`,
          fromCache: syncResult.fromCache,
          loadTimeMs: totalLoadMs,
          manifest: syncResult.manifest,
        },
      });

      // Push canonical basic lands map so DeckWorkspace Quick-Station is immediately populated
      this.respondToResolve(nextEngine, 0);

      // Flush any queued RESOLVE_CARDS requests sent before catalog finished loading
      const resolvesToRun = this.pendingResolves;
      this.pendingResolves = [];
      for (const req of resolvesToRun) {
        this.respondToResolve(nextEngine, req.requestId, req.ids, req.names);
      }

      const initialSearch = this.pendingSearch ?? {
        requestId: 0,
        filter: DEFAULT_SEARCH_FILTER,
      };
      this.pendingSearch = null;
      this.post({
        type: 'SEARCH_RESULT',
        payload: nextEngine.search(initialSearch.filter, initialSearch.requestId),
      });

      const oneOffsToRun = this.pendingOneOffSearches;
      this.pendingOneOffSearches = [];
      for (const req of oneOffsToRun) {
        this.post({
          type: 'ONEOFF_SEARCH_RESULT',
          payload: nextEngine.search(req.filter, req.requestId),
        });
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.isInitializing = false;
      this.hasInitError = true;
      this.pendingSearch = null;
      this.pendingResolves = [];
      const failedOneOffs = this.pendingOneOffSearches;
      this.pendingOneOffSearches = [];
      for (const req of failedOneOffs) {
        this.post({
          type: 'ONEOFF_SEARCH_RESULT',
          payload: createEmptySearchResult(req.requestId, req.filter),
        });
      }
      this.post({
        type: 'SYNC_STATUS',
        payload: {
          stage: 'error',
          progressPercent: 0,
          message: errorMsg,
          error: errorMsg,
        },
      });
    } finally {
      this.isInitializing = false;
    }
  }

  handleMessage(msg: WorkerRequestMessage): void {
    switch (msg.type) {
      case 'INIT':
        this.hasInitError = false;
        void this.initializeCatalog(msg.baseUrl, false);
        break;
      case 'FORCE_RESYNC':
        this.engine = null;
        this.hasInitError = false;
        void this.initializeCatalog(msg.baseUrl, true);
        break;
      case 'SEARCH':
        if (!this.engine) {
          if (!this.isInitializing && this.hasInitError) {
            this.post({
              type: 'SEARCH_RESULT',
              payload: createEmptySearchResult(msg.requestId, msg.filter),
            });
            return;
          }
          this.pendingSearch = { requestId: msg.requestId, filter: msg.filter };
          return;
        }
        this.post({
          type: 'SEARCH_RESULT',
          payload: this.engine.search(msg.filter, msg.requestId),
        });
        break;
      case 'ONEOFF_SEARCH':
        if (!this.engine) {
          if (!this.isInitializing && this.hasInitError) {
            this.post({
              type: 'ONEOFF_SEARCH_RESULT',
              payload: createEmptySearchResult(msg.requestId, msg.filter),
            });
            return;
          }
          this.pendingOneOffSearches.push({ requestId: msg.requestId, filter: msg.filter });
          return;
        }
        this.post({
          type: 'ONEOFF_SEARCH_RESULT',
          payload: this.engine.search(msg.filter, msg.requestId),
        });
        break;
      case 'GET_BY_IDS':
        this.post({
          type: 'CARDS_BY_IDS_RESULT',
          requestId: msg.requestId,
          cards: this.engine ? this.engine.getCardsByIds(msg.ids) : [],
        });
        break;
      case 'RESOLVE_CARDS':
        if (!this.engine) {
          this.pendingResolves.push({
            requestId: msg.requestId,
            ids: msg.ids,
            names: msg.names,
          });
          return;
        }
        this.respondToResolve(this.engine, msg.requestId, msg.ids, msg.names);
        break;
    }
  }
}

const workerScope = (
  typeof self !== 'undefined' ? self : undefined
) as unknown as DedicatedWorkerGlobalScope | undefined;

if (workerScope && typeof workerScope.postMessage === 'function') {
  const controller = new SearchWorkerController((message) => {
    workerScope.postMessage(message);
  });
  workerScope.onmessage = (event: MessageEvent<WorkerRequestMessage>) => {
    controller.handleMessage(event.data);
  };
}
