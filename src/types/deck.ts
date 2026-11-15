import type { CompactCard, ManaColor } from './card.js';
import type { DeckVisibility, SyncStatus } from './cloud.js';

export type ViewMode = 'standard' | 'compact' | 'detailed';
export type WorkspaceTab = 'search' | 'deck';
export type DeckGroupMode = 'role' | 'type' | 'cmc' | 'color';

export interface DeckCardEntry {
  card: CompactCard;
  quantity: number;
}

export interface DeckDraft {
  id: string;
  name: string;
  description?: string;
  commanders: CompactCard[];
  mainboard: Record<string, DeckCardEntry>;
  sideboard: Record<string, DeckCardEntry>;
  lockSearchToCommanderIdentity: boolean;
  visibility?: DeckVisibility;
  sharedWithUids?: string[];
  ownerUid?: string | null;
  ownerHandle?: string;
  revision?: number;
  syncStatus?: SyncStatus;
  cloudUpdatedAt?: string;
  deletedAt?: string | null;
  synergyThemes?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SavedDeckSummary {
  id: string;
  name: string;
  commanderIds: string[];
  commanderNames: string[];
  colorIdentity: ManaColor[];
  mainboardCount: number;
  sideboardCount: number;
  totalCards: number;
  createdAt: string;
  updatedAt: string;
}
