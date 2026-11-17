import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lazyFirebaseProvider } from '../cloud/lazyFirebaseProvider.js';
import {
  CloudSyncEngine,
  isUntouchedStarterDeck,
  type ConflictResolution,
  type SyncRunResult,
} from '../cloud/syncEngine.js';
import { humanizeCloudError } from '../cloud/validation.js';
import { cardDb, type MtgCardDatabase, type SavedDeckRecord } from '../db/cardDb.js';
import { generateDeckId } from '../db/deckDb.js';
import type { CompactCard } from '../types/card.js';
import type {
  AccountExportBundle,
  CloudDeckRecord,
  CloudProvider,
  CloudUser,
  SyncConflict,
  SyncStatus,
  UserProfile,
} from '../types/cloud.js';
import type { DeckCardEntry, DeckDraft } from '../types/deck.js';
import type { ResolvedCardsMap } from './useCardSearch.js';

export const CLOUD_PUSH_DEBOUNCE_MS = 4000;

export interface ExternalDecksUpdatedMeta {
  reason: 'sync' | 'push' | 'conflict' | 'signout';
  clearedCloudCopies?: boolean;
  signedOutUid?: string;
}

export interface CloudSyncControllerOptions {
  resolveCardsByIds: (ids: string[]) => Promise<Record<string, CompactCard>>;
  provider?: CloudProvider;
  db?: MtgCardDatabase;
  debounceMs?: number;
  onExternalDecksUpdated?: (meta: ExternalDecksUpdatedMeta) => void | Promise<void>;
  onSignOut?: () => Promise<void>;
  windowTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null;
  documentTarget?:
    | (Pick<Document, 'addEventListener' | 'removeEventListener'> & {
        visibilityState?: DocumentVisibilityState;
      })
    | null;
  isOnline?: () => boolean;
}

export interface CloudSyncSnapshot {
  conflicts: SyncConflict[];
  activeConflict: SyncConflict | null;
  resolvingConflict: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  syncError: string | null;
  overallSyncStatus: SyncStatus;
  pendingCount: number;
  syncedDeckCount: number;
  cardListCount: number;
}

/**
 * Computes the top 3-6 Method A synergy themes from a deck's commanders and mainboard cards.
 */
export function computeDeckSynergyThemes(
  commanders: readonly CompactCard[],
  mainboardEntries: ReadonlyArray<{ card: CompactCard; quantity: number }>,
  maxThemes = 6,
): string[] {
  const scores = new Map<string, { score: number; cmdWeight: number }>();

  for (const cmd of commanders) {
    for (const theme of cmd.themes) {
      if (!theme) continue;
      const entry = scores.get(theme) ?? { score: 0, cmdWeight: 0 };
      entry.score += 5;
      entry.cmdWeight += 1;
      scores.set(theme, entry);
    }
  }

  for (const { card, quantity } of mainboardEntries) {
    if (quantity <= 0) continue;
    for (const theme of card.themes) {
      if (!theme) continue;
      const entry = scores.get(theme) ?? { score: 0, cmdWeight: 0 };
      entry.score += Math.min(quantity, 4);
      scores.set(theme, entry);
    }
  }

  return Array.from(scores.entries())
    .sort((a, b) => {
      if (b[1].score !== a[1].score) return b[1].score - a[1].score;
      if (b[1].cmdWeight !== a[1].cmdWeight) return b[1].cmdWeight - a[1].cmdWeight;
      return a[0].localeCompare(b[0]);
    })
    .slice(0, maxThemes)
    .map(([theme]) => theme);
}

/**
 * Resolves all Scryfall `oracleId` references in a shared `CloudDeckRecord` into a fresh
 * local `DeckDraft` ready to edit in Studio.
 */
export async function hydrateCloudDeckToClonedDraft(
  cloudDeck: CloudDeckRecord,
  resolveCards: (req: { ids?: string[]; names?: string[] }) => Promise<Pick<ResolvedCardsMap, 'byId'>>,
): Promise<DeckDraft> {
  const allOracleIds = Array.from(
    new Set([
      ...cloudDeck.commanderOracleIds,
      ...Object.keys(cloudDeck.mainboard),
      ...Object.keys(cloudDeck.sideboard),
    ]),
  );

  const { byId } = allOracleIds.length > 0 ? await resolveCards({ ids: allOracleIds }) : { byId: {} };

  const commanders: CompactCard[] = [];
  for (const oracleId of cloudDeck.commanderOracleIds) {
    const card = byId[oracleId];
    if (card && !commanders.some((c) => c.id === card.id)) {
      commanders.push(card);
    }
  }

  const mainboard: Record<string, DeckCardEntry> = {};
  for (const [oracleId, qty] of Object.entries(cloudDeck.mainboard)) {
    const card = byId[oracleId];
    if (card && qty > 0) {
      const existing = mainboard[card.id];
      mainboard[card.id] = { card, quantity: (existing?.quantity ?? 0) + qty };
    }
  }

  const sideboard: Record<string, DeckCardEntry> = {};
  for (const [oracleId, qty] of Object.entries(cloudDeck.sideboard)) {
    const card = byId[oracleId];
    if (card && qty > 0) {
      const existing = sideboard[card.id];
      sideboard[card.id] = { card, quantity: (existing?.quantity ?? 0) + qty };
    }
  }

  const now = new Date().toISOString();
  const themes =
    cloudDeck.synergyThemes.length > 0
      ? [...cloudDeck.synergyThemes]
      : computeDeckSynergyThemes(commanders, Object.values(mainboard), 6);

  return {
    id: generateDeckId(),
    name: cloudDeck.name || 'Cloned Commander Deck',
    ...(cloudDeck.description ? { description: cloudDeck.description } : {}),
    commanders,
    mainboard,
    sideboard,
    lockSearchToCommanderIdentity: cloudDeck.lockSearchToCommanderIdentity ?? true,
    visibility: 'private',
    synergyThemes: themes,
    revision: 0,
    syncStatus: 'local',
    createdAt: now,
    updatedAt: now,
  };
}

function mergeConflicts(
  existing: readonly SyncConflict[],
  incoming: readonly SyncConflict[],
): SyncConflict[] {
  const map = new Map<string, SyncConflict>();
  for (const item of existing) {
    map.set(`${item.kind}:${item.id}`, item);
  }
  for (const item of incoming) {
    map.set(`${item.kind}:${item.id}`, item);
  }
  return Array.from(map.values());
}

/**
 * Serialized, debounced cloud sync orchestrator wrapping `CloudSyncEngine`.
 */
export class CloudSyncController {
  readonly engine: CloudSyncEngine;
  private readonly provider: CloudProvider;
  private readonly db: MtgCardDatabase;
  private readonly debounceMs: number;
  private readonly windowTarget: Pick<Window, 'addEventListener' | 'removeEventListener'> | null;
  private readonly documentTarget:
    | (Pick<Document, 'addEventListener' | 'removeEventListener'> & {
        visibilityState?: DocumentVisibilityState;
      })
    | null;
  private readonly isOnlineFn: () => boolean;

  private onExternalDecksUpdated?: (meta: ExternalDecksUpdatedMeta) => void | Promise<void>;
  private onSignOut?: () => Promise<void>;

  private user: CloudUser | null = null;
  private profile: UserProfile | null = null;
  private autoSyncedUid: string | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private hasPendingDebounce = false;
  private conflictDismissed = false;
  private exportFailed = false;
  private disposed = false;
  private syncQueue: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();

  private state: CloudSyncSnapshot = {
    conflicts: [],
    activeConflict: null,
    resolvingConflict: false,
    isSyncing: false,
    lastSyncedAt: null,
    syncError: null,
    overallSyncStatus: 'local',
    pendingCount: 0,
    syncedDeckCount: 0,
    cardListCount: 0,
  };

  constructor(options: CloudSyncControllerOptions) {
    this.provider = options.provider ?? lazyFirebaseProvider;
    this.db = options.db ?? cardDb;
    this.debounceMs = options.debounceMs ?? CLOUD_PUSH_DEBOUNCE_MS;
    this.onExternalDecksUpdated = options.onExternalDecksUpdated;
    this.onSignOut = options.onSignOut;
    this.windowTarget =
      options.windowTarget !== undefined
        ? options.windowTarget
        : typeof window !== 'undefined'
          ? window
          : null;
    this.documentTarget =
      options.documentTarget !== undefined
        ? options.documentTarget
        : typeof document !== 'undefined'
          ? document
          : null;
    this.isOnlineFn =
      options.isOnline ??
      (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));

    this.engine = new CloudSyncEngine({
      provider: this.provider,
      db: this.db,
      resolveCardsByIds: options.resolveCardsByIds,
      getSynergyThemes: (record, cardMap) => {
        const commanders: CompactCard[] = [];
        for (const cmdId of record.commanderIds) {
          const card = cardMap[cmdId];
          if (card) commanders.push(card);
        }
        const mainboardEntries: Array<{ card: CompactCard; quantity: number }> = [];
        for (const [id, qty] of Object.entries(record.mainboard)) {
          const card = cardMap[id];
          if (card && qty > 0) {
            mainboardEntries.push({ card, quantity: qty });
          }
        }
        const computed = computeDeckSynergyThemes(commanders, mainboardEntries, 6);
        if (computed.length > 0) return computed;
        return record.synergyThemes ? [...record.synergyThemes].slice(0, 6) : [];
      },
    });
  }

  setCallbacks(callbacks: {
    onExternalDecksUpdated?: (meta: ExternalDecksUpdatedMeta) => void | Promise<void>;
    onSignOut?: () => Promise<void>;
  }): void {
    this.onExternalDecksUpdated = callbacks.onExternalDecksUpdated;
    this.onSignOut = callbacks.onSignOut;
  }

  getSnapshot(): CloudSyncSnapshot {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    if (this.disposed) return;
    for (const listener of this.listeners) {
      listener();
    }
  }

  private updateState(patch: Partial<CloudSyncSnapshot>): void {
    if ('syncError' in patch) {
      this.exportFailed = false;
    }
    const nextConflicts = patch.conflicts ?? this.state.conflicts;
    const nextActiveConflict = this.conflictDismissed ? null : (nextConflicts[0] ?? null);
    this.state = {
      ...this.state,
      ...patch,
      conflicts: nextConflicts,
      activeConflict: nextActiveConflict,
    };
    this.emit();
  }

  private isCloudReady(): boolean {
    return Boolean(
      this.user &&
        this.user.emailVerified &&
        this.profile &&
        this.provider.isConfigured(),
    );
  }

  private clearDebounceTimer(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.hasPendingDebounce = false;
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.syncQueue.then(task, task);
    this.syncQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async refreshCounts(): Promise<void> {
    try {
      const [allDecks, allLists] = await Promise.all([
        this.db.decks.toArray(),
        this.db.cardlists.toArray(),
      ]);

      const activeUid = this.user?.uid ?? null;
      let syncedDeckCount = 0;
      let pendingCount = 0;
      let hasDbConflict = false;
      let hasDbError = false;
      let anySyncedList = false;

      for (const deck of allDecks) {
        if (activeUid && deck.ownerUid && deck.ownerUid !== activeUid) continue;
        if (!deck.ownerUid && isUntouchedStarterDeck(deck)) continue;

        const status = deck.syncStatus ?? 'local';
        if (status === 'conflict') {
          hasDbConflict = true;
          continue;
        }
        if (status === 'error') {
          hasDbError = true;
          pendingCount += 1;
          continue;
        }
        if (status === 'pending' || (this.isCloudReady() && status === 'local')) {
          pendingCount += 1;
          continue;
        }
        if (!deck.deletedAt && status === 'synced') {
          syncedDeckCount += 1;
        }
      }

      let cardListCount = 0;
      for (const list of allLists) {
        if (!list.deletedAt) {
          cardListCount += 1;
        }
        if (activeUid && list.ownerUid && list.ownerUid !== activeUid) continue;
        const status = list.syncStatus ?? 'local';
        if (status === 'conflict') {
          hasDbConflict = true;
        } else if (status === 'error') {
          hasDbError = true;
          pendingCount += 1;
        } else if (status === 'pending' || (this.isCloudReady() && status === 'local')) {
          pendingCount += 1;
        } else if (!list.deletedAt && status === 'synced') {
          anySyncedList = true;
        }
      }

      let overallSyncStatus: SyncStatus = 'local';
      if (this.state.conflicts.length > 0 || hasDbConflict) {
        overallSyncStatus = 'conflict';
      } else if (this.state.syncError !== null || hasDbError) {
        overallSyncStatus = 'error';
      } else if (this.hasPendingDebounce || pendingCount > 0) {
        overallSyncStatus = 'pending';
      } else if (this.state.lastSyncedAt !== null || syncedDeckCount > 0 || anySyncedList) {
        overallSyncStatus = 'synced';
      }

      this.updateState({
        pendingCount,
        syncedDeckCount,
        cardListCount,
        overallSyncStatus,
      });
    } catch {
      // Ignore IndexedDB unavailability in restricted environments
    }
  }

  private applySyncResult(result: SyncRunResult, mode: 'replace-conflicts' | 'merge-conflicts'): void {
    const nonOfflineErrors = result.errors.filter((e) => !e.isOffline);
    const nextConflicts =
      mode === 'replace-conflicts'
        ? result.conflicts
        : mergeConflicts(this.state.conflicts, result.conflicts);

    if (result.conflicts.length > 0) {
      this.conflictDismissed = false;
    }

    const nextError = nonOfflineErrors.length > 0 ? nonOfflineErrors[0]!.message : null;
    const syncedNow =
      nonOfflineErrors.length === 0 &&
      result.errors.length === 0 &&
      result.conflicts.length === 0;

    this.updateState({
      conflicts: nextConflicts,
      syncError: nextError,
      lastSyncedAt: syncedNow ? new Date().toISOString() : this.state.lastSyncedAt,
    });
  }

  private readonly handleOnline = (): void => {
    if (this.isCloudReady()) {
      void this.syncNow();
    }
  };

  private readonly handleVisibilityChange = (): void => {
    if (this.documentTarget?.visibilityState === 'hidden' && this.hasPendingDebounce) {
      void this.flushPendingPush();
    }
  };

  private readonly handlePageHide = (): void => {
    if (this.hasPendingDebounce) {
      void this.flushPendingPush();
    }
  };

  attachListeners(): () => void {
    this.windowTarget?.addEventListener('online', this.handleOnline);
    this.windowTarget?.addEventListener('pagehide', this.handlePageHide);
    this.documentTarget?.addEventListener('visibilitychange', this.handleVisibilityChange);

    return () => {
      this.windowTarget?.removeEventListener('online', this.handleOnline);
      this.windowTarget?.removeEventListener('pagehide', this.handlePageHide);
      this.documentTarget?.removeEventListener('visibilitychange', this.handleVisibilityChange);
    };
  }

  setAuthContext(user: CloudUser | null, profile: UserProfile | null): void {
    const prevUid = this.user?.uid ?? null;
    this.user = user;
    this.profile = profile;

    if (!user || !user.emailVerified) {
      this.clearDebounceTimer();
      this.autoSyncedUid = null;
      this.conflictDismissed = false;
      this.updateState({
        conflicts: [],
        syncError: null,
        lastSyncedAt: prevUid !== (user?.uid ?? null) ? null : this.state.lastSyncedAt,
        isSyncing: false,
      });
      void this.refreshCounts();
      return;
    }

    if (profile && this.provider.isConfigured() && this.autoSyncedUid !== user.uid) {
      this.autoSyncedUid = user.uid;
      void this.syncNow();
    } else {
      void this.refreshCounts();
    }
  }

  scheduleCloudPush = (): void => {
    if (this.disposed) return;

    if (!this.isCloudReady()) {
      void this.refreshCounts();
      return;
    }

    if (this.documentTarget?.visibilityState === 'hidden') {
      this.clearDebounceTimer();
      void this.flushPendingPush();
      return;
    }

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.hasPendingDebounce = true;
    this.updateState({ overallSyncStatus: this.state.conflicts.length > 0 ? 'conflict' : 'pending' });

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.hasPendingDebounce = false;
      void this.flushPendingPush();
    }, this.debounceMs);
  };

  flushPendingPush = async (): Promise<SyncRunResult | null> => {
    this.clearDebounceTimer();
    if (!this.isCloudReady()) {
      await this.refreshCounts();
      return null;
    }

    return this.enqueue(async () => {
      if (!this.isCloudReady() || !this.user || !this.profile) {
        return null;
      }

      const activeUid = this.user.uid;
      const activeHandle = this.profile.handle;
      this.updateState({ isSyncing: true, syncError: null });
      try {
        const result = await this.engine.pushPending(activeUid, activeHandle);
        if (this.user?.uid !== activeUid) return null;
        this.applySyncResult(result, 'merge-conflicts');
        await this.refreshCounts();
        if (result.pushedCount > 0 || result.conflicts.length > 0) {
          await this.onExternalDecksUpdated?.({ reason: 'push' });
        }
        return result;
      } catch (err) {
        if (this.user?.uid === activeUid) {
          const humanized = humanizeCloudError(err);
          this.updateState({ syncError: humanized.isOffline ? null : humanized.message });
          await this.refreshCounts();
        }
        return null;
      } finally {
        this.updateState({ isSyncing: false });
      }
    });
  };

  syncNow = async (): Promise<SyncRunResult | null> => {
    this.clearDebounceTimer();
    this.conflictDismissed = false;
    if (!this.isCloudReady()) {
      await this.refreshCounts();
      return null;
    }

    return this.enqueue(async () => {
      if (!this.isCloudReady() || !this.user || !this.profile) {
        return null;
      }

      const activeUid = this.user.uid;
      const activeHandle = this.profile.handle;
      this.updateState({ isSyncing: true, syncError: null });
      try {
        const result = await this.engine.syncAll(activeUid, activeHandle);
        if (this.user?.uid !== activeUid) return null;
        this.applySyncResult(result, 'replace-conflicts');
        await this.refreshCounts();
        await this.onExternalDecksUpdated?.({ reason: 'sync' });
        return result;
      } catch (err) {
        if (this.user?.uid === activeUid) {
          const humanized = humanizeCloudError(err);
          this.updateState({ syncError: humanized.isOffline ? null : humanized.message });
          await this.refreshCounts();
        }
        return null;
      } finally {
        this.updateState({ isSyncing: false });
      }
    });
  };

  resolveActiveConflict = async (resolution: ConflictResolution): Promise<SyncRunResult | null> => {
    const targetConflict = this.state.activeConflict ?? this.state.conflicts[0];
    if (!targetConflict || !this.user || !this.profile) {
      return null;
    }

    return this.enqueue(async () => {
      if (!this.user || !this.profile) return null;

      const activeUid = this.user.uid;
      const activeHandle = this.profile.handle;
      this.updateState({ resolvingConflict: true, syncError: null });
      try {
        const result = await this.engine.resolveConflict(
          targetConflict,
          resolution,
          activeUid,
          activeHandle,
        );
        if (this.user?.uid !== activeUid) return null;

        const remaining = this.state.conflicts.filter(
          (c) => !(c.kind === targetConflict.kind && c.id === targetConflict.id),
        );
        const merged = mergeConflicts(remaining, result.conflicts);
        const nonOfflineErrors = result.errors.filter((e) => !e.isOffline);
        const nextError = nonOfflineErrors.length > 0 ? nonOfflineErrors[0]!.message : null;
        const syncedNow =
          nonOfflineErrors.length === 0 &&
          result.errors.length === 0 &&
          merged.length === 0;

        this.conflictDismissed = false;
        this.updateState({
          conflicts: merged,
          syncError: nextError,
          lastSyncedAt: syncedNow ? new Date().toISOString() : this.state.lastSyncedAt,
        });
        await this.refreshCounts();
        await this.onExternalDecksUpdated?.({ reason: 'conflict' });
        return result;
      } catch (err) {
        this.updateState({ syncError: humanizeCloudError(err).message });
        await this.refreshCounts();
        return null;
      } finally {
        this.updateState({ resolvingConflict: false });
      }
    });
  };

  dismissActiveConflict = (): void => {
    this.conflictDismissed = true;
    this.updateState({});
  };

  openConflictModal = (): void => {
    this.conflictDismissed = false;
    this.updateState({});
  };

  clearSyncError = (): void => {
    this.updateState({ syncError: null });
    void this.refreshCounts();
  };

  exportAllData = async (): Promise<AccountExportBundle> => {
    try {
      const bundle = await this.engine.buildAccountExportBundle(this.profile);
      if (this.exportFailed) {
        this.updateState({ syncError: null });
        await this.refreshCounts();
      }
      return bundle;
    } catch (err) {
      this.updateState({
        syncError: humanizeCloudError(err).message,
        overallSyncStatus: this.state.conflicts.length > 0 ? 'conflict' : 'error',
      });
      this.exportFailed = true;
      throw err;
    }
  };

  signOutWithCleanup = async (clearLocalCloudCopies: boolean): Promise<void> => {
    this.clearDebounceTimer();
    const currentUid = this.user?.uid;

    await this.enqueue(async () => {
      await this.onSignOut?.();
      if (currentUid) {
        await this.engine.cleanupOnSignOut(currentUid, clearLocalCloudCopies);
      }
      this.autoSyncedUid = null;
      this.conflictDismissed = false;
      this.user = null;
      this.profile = null;
      this.updateState({
        conflicts: [],
        syncError: null,
        lastSyncedAt: null,
        isSyncing: false,
      });
      await this.refreshCounts();
      await this.onExternalDecksUpdated?.({
        reason: 'signout',
        clearedCloudCopies: clearLocalCloudCopies,
        signedOutUid: currentUid,
      });
    });
  };

  cleanupAfterAccountDeletion = async (uid: string): Promise<void> => {
    this.clearDebounceTimer();
    await this.enqueue(async () => {
      if (uid) {
        await this.engine.cleanupOnSignOut(uid, true);
      }
      this.autoSyncedUid = null;
      this.conflictDismissed = false;
      this.user = null;
      this.profile = null;
      this.updateState({
        conflicts: [],
        syncError: null,
        lastSyncedAt: null,
        isSyncing: false,
      });
      await this.refreshCounts();
      await this.onExternalDecksUpdated?.({
        reason: 'signout',
        clearedCloudCopies: true,
        signedOutUid: uid,
      });
    });
  };

  dispose(): void {
    this.disposed = true;
    this.clearDebounceTimer();
    this.listeners.clear();
  }
}

export interface UseCloudSyncOptions {
  user: CloudUser | null;
  profile: UserProfile | null;
  resolveCards: (req: { ids?: string[]; names?: string[] }) => Promise<ResolvedCardsMap>;
  savedDecks?: readonly SavedDeckRecord[];
  onExternalDecksUpdated?: (meta: ExternalDecksUpdatedMeta) => void | Promise<void>;
  onSignOut?: () => Promise<void>;
  provider?: CloudProvider;
  db?: MtgCardDatabase;
  debounceMs?: number;
}

export interface UseCloudSyncReturn extends CloudSyncSnapshot {
  scheduleCloudPush: () => void;
  flushPendingPush: () => Promise<SyncRunResult | null>;
  syncNow: () => Promise<SyncRunResult | null>;
  resolveActiveConflict: (resolution: ConflictResolution) => Promise<SyncRunResult | null>;
  dismissActiveConflict: () => void;
  openConflictModal: () => void;
  clearSyncError: () => void;
  exportAllData: () => Promise<AccountExportBundle>;
  signOutWithCleanup: (clearLocalCloudCopies: boolean) => Promise<void>;
  cleanupAfterAccountDeletion: (uid: string) => Promise<void>;
}

/**
 * React hook coordinating offline-first delta cloud sync, 4-second debounced pushes,
 * online/visibility flushes, conflict resolution, JSON backup export, and sign-out cleanup.
 */
export function useCloudSync(options: UseCloudSyncOptions): UseCloudSyncReturn {
  const {
    user,
    profile,
    resolveCards,
    savedDecks,
    onExternalDecksUpdated,
    onSignOut,
    provider = lazyFirebaseProvider,
    db = cardDb,
    debounceMs = CLOUD_PUSH_DEBOUNCE_MS,
  } = options;

  const resolveCardsRef = useRef(resolveCards);
  resolveCardsRef.current = resolveCards;

  const onExternalDecksUpdatedRef = useRef(onExternalDecksUpdated);
  onExternalDecksUpdatedRef.current = onExternalDecksUpdated;

  const onSignOutRef = useRef(onSignOut);
  onSignOutRef.current = onSignOut;

  const controller = useMemo(
    () =>
      new CloudSyncController({
        provider,
        db,
        debounceMs,
        resolveCardsByIds: (ids) => resolveCardsRef.current({ ids }).then((res) => res.byId),
        onExternalDecksUpdated: (meta) => onExternalDecksUpdatedRef.current?.(meta),
        onSignOut: () => (onSignOutRef.current ? onSignOutRef.current() : Promise.resolve()),
      }),
    [provider, db, debounceMs],
  );

  const [snapshot, setSnapshot] = useState<CloudSyncSnapshot>(() => controller.getSnapshot());

  useEffect(() => {
    setSnapshot(controller.getSnapshot());
    const unsubSnapshot = controller.subscribe(() => {
      setSnapshot(controller.getSnapshot());
    });
    const unsubListeners = controller.attachListeners();
    void controller.refreshCounts();

    return () => {
      unsubSnapshot();
      unsubListeners();
      controller.dispose();
    };
  }, [controller]);

  useEffect(() => {
    controller.setAuthContext(user, profile);
  }, [controller, user, profile]);

  useEffect(() => {
    if (savedDecks !== undefined) {
      void controller.refreshCounts();
    }
  }, [controller, savedDecks]);

  const scheduleCloudPush = useCallback(() => {
    controller.scheduleCloudPush();
  }, [controller]);

  const flushPendingPush = useCallback(
    () => controller.flushPendingPush(),
    [controller],
  );

  const syncNow = useCallback(() => controller.syncNow(), [controller]);

  const resolveActiveConflict = useCallback(
    (resolution: ConflictResolution) => controller.resolveActiveConflict(resolution),
    [controller],
  );

  const dismissActiveConflict = useCallback(() => {
    controller.dismissActiveConflict();
  }, [controller]);

  const openConflictModal = useCallback(() => {
    controller.openConflictModal();
  }, [controller]);

  const clearSyncError = useCallback(() => {
    controller.clearSyncError();
  }, [controller]);

  const exportAllData = useCallback(() => controller.exportAllData(), [controller]);

  const signOutWithCleanup = useCallback(
    (clearLocalCloudCopies: boolean) => controller.signOutWithCleanup(clearLocalCloudCopies),
    [controller],
  );

  const cleanupAfterAccountDeletion = useCallback(
    (uid: string) => controller.cleanupAfterAccountDeletion(uid),
    [controller],
  );

  return {
    ...snapshot,
    scheduleCloudPush,
    flushPendingPush,
    syncNow,
    resolveActiveConflict,
    dismissActiveConflict,
    openConflictModal,
    clearSyncError,
    exportAllData,
    signOutWithCleanup,
    cleanupAfterAccountDeletion,
  };
}
