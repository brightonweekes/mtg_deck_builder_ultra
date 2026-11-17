import { useCallback, useEffect, useRef, useState } from 'react';
import type { CompactCard } from '../types/card.js';
import {
  DEFAULT_SEARCH_FILTER,
  type BudgetSwapScanRequest,
  type BudgetSwapScanResponse,
  type SearchFilter,
  type SearchResponsePayload,
  type SyncStatusPayload,
  type WorkerRequestMessage,
  type WorkerResponseMessage,
} from '../types/search.js';

export interface ResolvedCardsMap {
  byId: Record<string, CompactCard>;
  byName: Record<string, CompactCard>;
}

export interface UseCardSearchReturn {
  syncStatus: SyncStatusPayload;
  filter: SearchFilter;
  searchResult: SearchResponsePayload | null;
  basicLands: Record<string, CompactCard>;
  isSearching: boolean;
  updateFilter: (patch: Partial<SearchFilter>, options?: { immediate?: boolean }) => void;
  resetFilters: () => void;
  forceResync: () => void;
  resolveCards: (req: { ids?: string[]; names?: string[] }) => Promise<ResolvedCardsMap>;
  runOneOffSearch: (filter: SearchFilter) => Promise<SearchResponsePayload>;
  findBudgetSwaps: (request: BudgetSwapScanRequest) => Promise<BudgetSwapScanResponse>;
}

/**
 * Builds an empty SearchResponsePayload fallback when the search worker errors or unmounts.
 */
export function buildEmptySearchResponse(
  requestId: number,
  filter: SearchFilter,
): SearchResponsePayload {
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

export function buildEmptyBudgetSwapResponse(requestId: number): BudgetSwapScanResponse {
  return {
    requestId,
    results: [],
    executionTimeMs: 0,
  };
}

const INITIAL_SYNC_STATUS: SyncStatusPayload = {
  stage: 'idle',
  progressPercent: 0,
  message: 'Initializing card engine...',
};

export function useCardSearch(): UseCardSearchReturn {
  const [syncStatus, setSyncStatus] = useState<SyncStatusPayload>(INITIAL_SYNC_STATUS);
  const [filter, setFilter] = useState<SearchFilter>(DEFAULT_SEARCH_FILTER);
  const [searchResult, setSearchResult] = useState<SearchResponsePayload | null>(null);
  const [basicLands, setBasicLands] = useState<Record<string, CompactCard>>({});
  const [isSearching, setIsSearching] = useState<boolean>(false);

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef<number>(0);
  const latestAppliedIdRef = useRef<number>(-1);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingResolvesRef = useRef<Map<number, (res: ResolvedCardsMap) => void>>(new Map());
  const pendingOneOffResolvesRef = useRef<
    Map<number, { filter: SearchFilter; resolve: (res: SearchResponsePayload) => void }>
  >(new Map());
  const pendingBudgetSwapResolvesRef = useRef<
    Map<number, (res: BudgetSwapScanResponse) => void>
  >(new Map());

  const dispatchSearch = useCallback((nextFilter: SearchFilter) => {
    const worker = workerRef.current;
    if (!worker) return;

    const reqId = ++requestIdRef.current;
    setIsSearching(true);
    const message: WorkerRequestMessage = {
      type: 'SEARCH',
      requestId: reqId,
      filter: nextFilter,
    };
    worker.postMessage(message);
  }, []);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/searchWorker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    const flushPendingWithEmpty = () => {
      for (const resolver of pendingResolvesRef.current.values()) {
        resolver({ byId: {}, byName: {} });
      }
      pendingResolvesRef.current.clear();

      for (const [reqId, pending] of pendingOneOffResolvesRef.current.entries()) {
        pending.resolve(buildEmptySearchResponse(reqId, pending.filter));
      }
      pendingOneOffResolvesRef.current.clear();

      for (const [reqId, resolver] of pendingBudgetSwapResolvesRef.current.entries()) {
        resolver(buildEmptyBudgetSwapResponse(reqId));
      }
      pendingBudgetSwapResolvesRef.current.clear();
    };

    worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
      const msg = event.data;
      if (msg.type === 'SYNC_STATUS') {
        setSyncStatus(msg.payload);
      } else if (msg.type === 'SEARCH_RESULT') {
        if (msg.payload.requestId >= latestAppliedIdRef.current) {
          latestAppliedIdRef.current = msg.payload.requestId;
          setSearchResult(msg.payload);
          setIsSearching(false);
        }
      } else if (msg.type === 'ONEOFF_SEARCH_RESULT') {
        const pending = pendingOneOffResolvesRef.current.get(msg.payload.requestId);
        if (pending) {
          pendingOneOffResolvesRef.current.delete(msg.payload.requestId);
          pending.resolve(msg.payload);
        }
      } else if (msg.type === 'BUDGET_SWAPS_RESULT') {
        const resolver = pendingBudgetSwapResolvesRef.current.get(msg.payload.requestId);
        if (resolver) {
          pendingBudgetSwapResolvesRef.current.delete(msg.payload.requestId);
          resolver(msg.payload);
        }
      } else if (msg.type === 'RESOLVE_CARDS_RESULT') {
        if (Object.keys(msg.basicLands).length > 0) {
          setBasicLands(msg.basicLands);
        }
        const resolver = pendingResolvesRef.current.get(msg.requestId);
        if (resolver) {
          pendingResolvesRef.current.delete(msg.requestId);
          resolver({ byId: msg.byId, byName: msg.byName });
        }
      }
    };

    worker.onerror = (err) => {
      setSyncStatus({
        stage: 'error',
        progressPercent: 0,
        message: err.message || 'Search worker crashed unexpectedly.',
        error: err.message,
      });
      setIsSearching(false);
      flushPendingWithEmpty();
    };

    const initMsg: WorkerRequestMessage = { type: 'INIT' };
    worker.postMessage(initMsg);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      flushPendingWithEmpty();
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const updateFilter = useCallback(
    (patch: Partial<SearchFilter>, options?: { immediate?: boolean }) => {
      setFilter((prev) => {
        const next: SearchFilter = {
          ...prev,
          ...patch,
          page: patch.page !== undefined ? patch.page : 1,
        };

        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }

        const isTextEdit =
          !options?.immediate &&
          (patch.query !== undefined ||
            patch.themeQuery !== undefined ||
            patch.maxPriceUsd !== undefined);

        if (isTextEdit) {
          debounceTimerRef.current = setTimeout(() => {
            dispatchSearch(next);
          }, 45);
        } else {
          dispatchSearch(next);
        }

        return next;
      });
    },
    [dispatchSearch],
  );

  const resetFilters = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setFilter(DEFAULT_SEARCH_FILTER);
    dispatchSearch(DEFAULT_SEARCH_FILTER);
  }, [dispatchSearch]);

  const forceResync = useCallback(() => {
    const worker = workerRef.current;
    if (!worker) return;
    setSyncStatus({
      stage: 'checking-manifest',
      progressPercent: 5,
      message: 'Clearing IndexedDB cache & re-downloading catalog...',
    });
    worker.postMessage({ type: 'FORCE_RESYNC' } satisfies WorkerRequestMessage);
  }, []);

  const resolveCards = useCallback(
    (req: { ids?: string[]; names?: string[] }): Promise<ResolvedCardsMap> => {
      const worker = workerRef.current;
      if (!worker) {
        return Promise.resolve({ byId: {}, byName: {} });
      }
      const reqId = ++requestIdRef.current;
      return new Promise<ResolvedCardsMap>((resolve) => {
        pendingResolvesRef.current.set(reqId, resolve);
        worker.postMessage({
          type: 'RESOLVE_CARDS',
          requestId: reqId,
          ids: req.ids,
          names: req.names,
        } satisfies WorkerRequestMessage);
      });
    },
    [],
  );

  const runOneOffSearch = useCallback(
    (oneOffFilter: SearchFilter): Promise<SearchResponsePayload> => {
      const worker = workerRef.current;
      const reqId = ++requestIdRef.current;
      if (!worker) {
        return Promise.resolve(buildEmptySearchResponse(reqId, oneOffFilter));
      }
      return new Promise<SearchResponsePayload>((resolve) => {
        pendingOneOffResolvesRef.current.set(reqId, {
          filter: oneOffFilter,
          resolve,
        });
        worker.postMessage({
          type: 'ONEOFF_SEARCH',
          requestId: reqId,
          filter: oneOffFilter,
        } satisfies WorkerRequestMessage);
      });
    },
    [],
  );

  const findBudgetSwaps = useCallback(
    (swapRequest: BudgetSwapScanRequest): Promise<BudgetSwapScanResponse> => {
      const worker = workerRef.current;
      const reqId = ++requestIdRef.current;
      if (!worker || swapRequest.targetCardIds.length === 0) {
        return Promise.resolve(buildEmptyBudgetSwapResponse(reqId));
      }
      return new Promise<BudgetSwapScanResponse>((resolve) => {
        pendingBudgetSwapResolvesRef.current.set(reqId, resolve);
        worker.postMessage({
          type: 'FIND_BUDGET_SWAPS',
          requestId: reqId,
          request: swapRequest,
        } satisfies WorkerRequestMessage);
      });
    },
    [],
  );

  return {
    syncStatus,
    filter,
    searchResult,
    basicLands,
    isSearching,
    updateFilter,
    resetFilters,
    forceResync,
    resolveCards,
    runOneOffSearch,
    findBudgetSwaps,
  };
}
