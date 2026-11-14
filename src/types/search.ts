import type {
  CompactCard,
  DataManifest,
  FunctionalRole,
  ManaColor,
  PartnerCategory,
} from './card.js';

export type ColorMatchMode = 'identity-lock' | 'exact' | 'include' | 'at-most';
export type CmcOperator = '=' | '<=' | '>=' | '<' | '>';
export type SortOption =
  | 'edhrec'
  | 'synergy'
  | 'cmc-asc'
  | 'cmc-desc'
  | 'price-asc'
  | 'price-desc'
  | 'name-asc';

export interface SearchFilter {
  query: string;
  colorIdentity: ManaColor[] | null;
  colors: ManaColor[];
  colorlessOnly: boolean;
  colorMatchMode: ColorMatchMode;
  cmcValue: number | null;
  cmcOperator: CmcOperator;
  cardTypes: string[];
  subtypes: string[];
  roles: FunctionalRole[];
  themes: string[];
  themeQuery: string;
  commanderOnly: boolean;
  partnerType: PartnerCategory | null;
  maxPriceUsd: number | null;
  sortBy: SortOption;
  page: number;
  pageSize: number;
}

export const DEFAULT_SEARCH_FILTER: SearchFilter = {
  query: '',
  colorIdentity: null,
  colors: [],
  colorlessOnly: false,
  colorMatchMode: 'include',
  cmcValue: null,
  cmcOperator: '<=',
  cardTypes: [],
  subtypes: [],
  roles: [],
  themes: [],
  themeQuery: '',
  commanderOnly: false,
  partnerType: null,
  maxPriceUsd: null,
  sortBy: 'edhrec',
  page: 1,
  pageSize: 48,
};

export interface ScoredCardMatch {
  card: CompactCard;
  synergyScore: number;
  matchedReasons: string[];
}

export interface SearchResponsePayload {
  requestId: number;
  matches: ScoredCardMatch[];
  totalMatches: number;
  page: number;
  pageSize: number;
  totalPages: number;
  executionTimeMs: number;
}

export type SyncStage =
  | 'idle'
  | 'checking-manifest'
  | 'loading-cache'
  | 'downloading-catalog'
  | 'saving-cache'
  | 'indexing'
  | 'ready'
  | 'error';

export interface SyncStatusPayload {
  stage: SyncStage;
  progressPercent: number;
  message: string;
  fromCache?: boolean;
  loadTimeMs?: number;
  manifest?: DataManifest;
  error?: string;
}

export type WorkerRequestMessage =
  | { type: 'INIT'; baseUrl?: string }
  | { type: 'SEARCH'; requestId: number; filter: SearchFilter }
  | { type: 'GET_BY_IDS'; requestId: number; ids: string[] }
  | { type: 'RESOLVE_CARDS'; requestId: number; ids?: string[]; names?: string[] }
  | { type: 'FORCE_RESYNC'; baseUrl?: string };

export type WorkerResponseMessage =
  | { type: 'SYNC_STATUS'; payload: SyncStatusPayload }
  | { type: 'SEARCH_RESULT'; payload: SearchResponsePayload }
  | { type: 'CARDS_BY_IDS_RESULT'; requestId: number; cards: CompactCard[] }
  | {
      type: 'RESOLVE_CARDS_RESULT';
      requestId: number;
      byId: Record<string, CompactCard>;
      byName: Record<string, CompactCard>;
      basicLands: Record<string, CompactCard>;
    };
