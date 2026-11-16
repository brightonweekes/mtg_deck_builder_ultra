import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ACTIVE_DECK_STORAGE_KEY, isUntouchedStarterDeck } from '../cloud/syncEngine.js';
import { MAX_DECK_DESC_LEN } from '../cloud/validation.js';
import { cardDb, type MtgCardDatabase, type SavedDeckRecord } from '../db/cardDb.js';
import {
  collectRecordCardIds,
  deckDraftToSavedRecord,
  deleteSavedDeckRecord,
  duplicateSavedDeckRecord,
  generateDeckId,
  getSavedDeckRecord,
  hydrateSavedRecordToDraft,
  listSavedDeckRecords,
  saveDeckToDb,
  softDeleteSavedDeckRecord,
} from '../db/deckDb.js';
import { computeBasicLandAutoFill } from '../deck/deckAnalytics.js';
import {
  canAddCardToDeck,
  canPairCommanders,
  getCombinedColorIdentity,
} from '../search/commanderRules.js';
import type { CompactCard, ManaColor } from '../types/card.js';
import type { DeckVisibility } from '../types/cloud.js';
import type { DeckDraft } from '../types/deck.js';
import { computeDeckSynergyThemes } from './useCloudSync.js';

const STORAGE_KEY = ACTIVE_DECK_STORAGE_KEY;

export interface DeckActionNotice {
  message: string;
  isError?: boolean;
}

export interface UseDeckDraftOptions {
  onDeckMutated?: () => void;
  db?: MtgCardDatabase;
}

export interface DeleteDeckByPolicyResult {
  deleted: boolean;
  cloudBacked: boolean;
}

export function createEmptyDraft(name = 'Untitled Commander Deck', id?: string): DeckDraft {
  const now = new Date().toISOString();
  return {
    id: id ?? generateDeckId(),
    name,
    description: '',
    commanders: [],
    mainboard: {},
    sideboard: {},
    lockSearchToCommanderIdentity: true,
    visibility: 'private',
    revision: 0,
    syncStatus: 'local',
    synergyThemes: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function isUntouchedStarterDraft(draft: DeckDraft): boolean {
  return isUntouchedStarterDeck(deckDraftToSavedRecord(draft));
}

/**
 * Deletes a saved deck from IndexedDB: cloud-backed decks (`ownerUid` or `revision > 0`)
 * receive a soft-delete tombstone so deletion syncs across devices, whereas pure local
 * decks are deleted permanently.
 */
export async function deleteSavedDeckByPolicy(
  deckId: string,
  db: MtgCardDatabase = cardDb,
): Promise<DeleteDeckByPolicyResult> {
  const existing = await getSavedDeckRecord(deckId, db);
  if (!existing) {
    return { deleted: false, cloudBacked: false };
  }
  const cloudBacked = Boolean(existing.ownerUid) || (existing.revision ?? 0) > 0;
  if (cloudBacked) {
    await softDeleteSavedDeckRecord(deckId, db);
    return { deleted: true, cloudBacked: true };
  }
  await deleteSavedDeckRecord(deckId, db);
  return { deleted: true, cloudBacked: false };
}

function loadDraftFromStorage(): DeckDraft {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return createEmptyDraft();
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyDraft();
    const parsed = JSON.parse(raw) as Partial<DeckDraft>;
    if (
      !parsed ||
      !Array.isArray(parsed.commanders) ||
      typeof parsed.mainboard !== 'object' ||
      parsed.deletedAt
    ) {
      return createEmptyDraft();
    }
    const now = new Date().toISOString();
    return {
      id: parsed.id && parsed.id !== 'active-draft' ? parsed.id : generateDeckId(),
      name: parsed.name ?? 'Untitled Commander Deck',
      ...(parsed.description !== undefined ? { description: parsed.description } : {}),
      commanders: parsed.commanders,
      mainboard: parsed.mainboard ?? {},
      sideboard: parsed.sideboard ?? {},
      lockSearchToCommanderIdentity: parsed.lockSearchToCommanderIdentity ?? true,
      ...(parsed.visibility !== undefined ? { visibility: parsed.visibility } : {}),
      ...(parsed.sharedWithUids !== undefined ? { sharedWithUids: parsed.sharedWithUids } : {}),
      ...(parsed.ownerUid !== undefined ? { ownerUid: parsed.ownerUid } : {}),
      ...(parsed.ownerHandle !== undefined ? { ownerHandle: parsed.ownerHandle } : {}),
      ...(parsed.revision !== undefined ? { revision: parsed.revision } : {}),
      ...(parsed.syncStatus !== undefined ? { syncStatus: parsed.syncStatus } : {}),
      ...(parsed.cloudUpdatedAt !== undefined ? { cloudUpdatedAt: parsed.cloudUpdatedAt } : {}),
      ...(parsed.synergyThemes !== undefined ? { synergyThemes: parsed.synergyThemes } : {}),
      createdAt: parsed.createdAt ?? parsed.updatedAt ?? now,
      updatedAt: parsed.updatedAt ?? now,
    };
  } catch {
    return createEmptyDraft();
  }
}

export interface UseDeckDraftReturn {
  deck: DeckDraft;
  savedDecks: SavedDeckRecord[];
  totalCardCount: number;
  sideboardCardCount: number;
  totalDeckPriceUsd: number;
  combinedColorIdentity: ManaColor[];
  lastNotice: DeckActionNotice | null;
  clearNotice: () => void;
  setCommander: (card: CompactCard) => ManaColor[] | null;
  addPartnerCommander: (card: CompactCard) => ManaColor[] | null;
  removeCommander: (cardId: string) => ManaColor[];
  setLockSearchToCommanderIdentity: (locked: boolean) => void;
  addCard: (card: CompactCard) => boolean;
  removeOneCard: (cardId: string) => void;
  deleteCard: (cardId: string) => void;
  addCardToSideboard: (card: CompactCard) => void;
  removeOneSideboardCard: (cardId: string) => void;
  deleteSideboardCard: (cardId: string) => void;
  moveCardToSideboard: (cardId: string) => void;
  moveCardToMainboard: (cardId: string) => boolean;
  autoFillBasicLands: (basicLands: Record<string, CompactCard>) => number;
  moveIllegalCardsToSideboard: (illegalCardIds: readonly string[]) => number;
  renameDeck: (name: string) => void;
  setDeckDescription: (description: string) => void;
  setDeckVisibility: (visibility: DeckVisibility) => void;
  clearDeck: () => void;
  getCardQuantity: (cardId: string) => number;
  isCommander: (cardId: string) => boolean;
  createNewDeck: (name?: string) => Promise<void>;
  switchDeck: (
    deckId: string,
    resolveByIds: (ids: string[]) => Promise<Record<string, CompactCard>>,
  ) => Promise<ManaColor[] | null>;
  duplicateCurrentDeck: () => Promise<void>;
  deleteSavedDeck: (deckId: string) => Promise<void>;
  loadDeckDraft: (nextDraft: DeckDraft, noticeMessage?: string) => ManaColor[];
  refreshSavedDecks: () => Promise<SavedDeckRecord[]>;
  reloadActiveDeckFromDb: (
    resolveByIds: (ids: string[]) => Promise<Record<string, CompactCard>>,
  ) => Promise<ManaColor[] | null>;
}

export function useDeckDraft(options: UseDeckDraftOptions = {}): UseDeckDraftReturn {
  const { onDeckMutated, db = cardDb } = options;
  const [deck, setDeck] = useState<DeckDraft>(() => loadDraftFromStorage());
  const [savedDecks, setSavedDecks] = useState<SavedDeckRecord[]>([]);
  const [lastNotice, setLastNotice] = useState<DeckActionNotice | null>(null);

  const deckRef = useRef(deck);
  deckRef.current = deck;
  const onDeckMutatedRef = useRef(onDeckMutated);
  onDeckMutatedRef.current = onDeckMutated;

  const dbSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyUserEditRef = useRef(false);
  const skipNextDbSaveRef = useRef(false);

  const refreshSavedDecks = useCallback(async (): Promise<SavedDeckRecord[]> => {
    try {
      const list = await listSavedDeckRecords(db);
      setSavedDecks(list);
      return list;
    } catch {
      // Ignore IndexedDB unavailability in restricted environments
      return [];
    }
  }, [db]);

  const flushDeckSave = useCallback(
    async (draftToSave: DeckDraft, wasUserEdit: boolean): Promise<void> => {
      try {
        const existing = await getSavedDeckRecord(draftToSave.id, db);
        if (
          !wasUserEdit &&
          existing &&
          (Boolean(existing.deletedAt) || existing.updatedAt >= draftToSave.updatedAt)
        ) {
          await refreshSavedDecks();
          return;
        }

        const untouched = isUntouchedStarterDraft(draftToSave);
        const mergedRevision = Math.max(draftToSave.revision ?? 0, existing?.revision ?? 0);
        const ownerUid =
          draftToSave.ownerUid !== undefined ? draftToSave.ownerUid : existing?.ownerUid;
        const ownerHandle =
          draftToSave.ownerHandle !== undefined ? draftToSave.ownerHandle : existing?.ownerHandle;
        const cloudUpdatedAt =
          draftToSave.cloudUpdatedAt !== undefined
            ? draftToSave.cloudUpdatedAt
            : existing?.cloudUpdatedAt;

        const mergedDraft: DeckDraft = {
          ...draftToSave,
          ...(mergedRevision > 0 || draftToSave.revision !== undefined
            ? { revision: mergedRevision }
            : {}),
          ...(ownerUid !== undefined ? { ownerUid } : {}),
          ...(ownerHandle !== undefined ? { ownerHandle } : {}),
          ...(cloudUpdatedAt !== undefined ? { cloudUpdatedAt } : {}),
          syncStatus: wasUserEdit
            ? untouched
              ? 'local'
              : 'pending'
            : (draftToSave.syncStatus ?? existing?.syncStatus ?? 'local'),
        };

        await saveDeckToDb(mergedDraft, db);
        await refreshSavedDecks();
        if (wasUserEdit && !untouched) {
          onDeckMutatedRef.current?.();
        }
      } catch {
        // Ignore IndexedDB write errors cleanly
      }
    },
    [db, refreshSavedDecks],
  );

  const applyUserEdit = useCallback(
    (
      updater: (prev: DeckDraft) => DeckDraft,
      editOptions?: { recomputeThemes?: boolean },
    ) => {
      setDeck((prev) => {
        const updated = updater(prev);
        if (updated === prev) return prev;
        dirtyUserEditRef.current = true;
        const nextThemes = editOptions?.recomputeThemes
          ? computeDeckSynergyThemes(updated.commanders, Object.values(updated.mainboard))
          : updated.synergyThemes;
        const withThemes: DeckDraft =
          nextThemes !== undefined ? { ...updated, synergyThemes: nextThemes } : updated;
        const untouched = isUntouchedStarterDraft(withThemes);
        return {
          ...withThemes,
          syncStatus: untouched ? 'local' : 'pending',
        };
      });
    },
    [],
  );

  // Persist lightweight active draft snapshot to localStorage immediately
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deck));
      }
    } catch {
      // Ignore storage quota errors
    }
  }, [deck]);

  // Debounced auto-save active deck into IndexedDB and keep savedDecks synced
  useEffect(() => {
    if (skipNextDbSaveRef.current) {
      skipNextDbSaveRef.current = false;
      return;
    }

    if (dbSyncTimerRef.current) {
      clearTimeout(dbSyncTimerRef.current);
    }
    dbSyncTimerRef.current = setTimeout(() => {
      dbSyncTimerRef.current = null;
      const wasUserEdit = dirtyUserEditRef.current;
      dirtyUserEditRef.current = false;
      void flushDeckSave(deck, wasUserEdit);
    }, 180);

    return () => {
      if (dbSyncTimerRef.current) {
        clearTimeout(dbSyncTimerRef.current);
        dbSyncTimerRef.current = null;
      }
    };
  }, [deck, flushDeckSave]);

  // Flush pending local save immediately on pagehide / hidden tab so cloud push sees it
  useEffect(() => {
    const flushImmediatelyIfPending = () => {
      if (!dbSyncTimerRef.current && !dirtyUserEditRef.current) return;
      if (dbSyncTimerRef.current) {
        clearTimeout(dbSyncTimerRef.current);
        dbSyncTimerRef.current = null;
      }
      const wasUserEdit = dirtyUserEditRef.current;
      dirtyUserEditRef.current = false;
      void flushDeckSave(deckRef.current, wasUserEdit);
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        flushImmediatelyIfPending();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', flushImmediatelyIfPending);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', flushImmediatelyIfPending);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [flushDeckSave]);

  // Load initial savedDecks list on mount
  useEffect(() => {
    void refreshSavedDecks();
  }, [refreshSavedDecks]);

  const combinedColorIdentity = useMemo(
    () => getCombinedColorIdentity(deck.commanders),
    [deck.commanders],
  );

  const { totalCardCount, sideboardCardCount, totalDeckPriceUsd } = useMemo(() => {
    let count = deck.commanders.length;
    let sbCount = 0;
    let price = 0;

    for (const cmd of deck.commanders) {
      if (cmd.priceUsd !== null) price += cmd.priceUsd;
    }

    for (const entry of Object.values(deck.mainboard)) {
      count += entry.quantity;
      if (entry.card.priceUsd !== null) {
        price += entry.card.priceUsd * entry.quantity;
      }
    }

    for (const entry of Object.values(deck.sideboard)) {
      sbCount += entry.quantity;
    }

    return {
      totalCardCount: count,
      sideboardCardCount: sbCount,
      totalDeckPriceUsd: Math.round(price * 100) / 100,
    };
  }, [deck.commanders, deck.mainboard, deck.sideboard]);

  const clearNotice = useCallback(() => setLastNotice(null), []);

  const setCommander = useCallback(
    (card: CompactCard): ManaColor[] | null => {
      if (!card.isCommanderEligible) {
        setLastNotice({ message: `${card.name} cannot be your Commander.`, isError: true });
        return null;
      }

      const nextCommanders = [card];
      applyUserEdit(
        (prev) => {
          const nextMainboard = { ...prev.mainboard };
          const nextSideboard = { ...prev.sideboard };
          delete nextMainboard[card.id];
          delete nextSideboard[card.id];
          return {
            ...prev,
            commanders: nextCommanders,
            mainboard: nextMainboard,
            sideboard: nextSideboard,
            updatedAt: new Date().toISOString(),
          };
        },
        { recomputeThemes: true },
      );
      setLastNotice({ message: `Set ${card.name} as Commander.` });
      return getCombinedColorIdentity(nextCommanders);
    },
    [applyUserEdit],
  );

  const addPartnerCommander = useCallback(
    (card: CompactCard): ManaColor[] | null => {
      if (deck.commanders.length === 0) {
        return setCommander(card);
      }
      const primary = deck.commanders[0]!;
      if (!canPairCommanders(primary, card)) {
        setLastNotice({
          message: `${card.name} cannot pair with ${primary.name}.`,
          isError: true,
        });
        return null;
      }

      const nextCommanders = [primary, card];
      applyUserEdit(
        (prev) => {
          const nextMainboard = { ...prev.mainboard };
          const nextSideboard = { ...prev.sideboard };
          delete nextMainboard[card.id];
          delete nextSideboard[card.id];
          return {
            ...prev,
            commanders: nextCommanders,
            mainboard: nextMainboard,
            sideboard: nextSideboard,
            updatedAt: new Date().toISOString(),
          };
        },
        { recomputeThemes: true },
      );
      setLastNotice({ message: `Paired ${card.name} with ${primary.name}.` });
      return getCombinedColorIdentity(nextCommanders);
    },
    [applyUserEdit, deck.commanders, setCommander],
  );

  const removeCommander = useCallback(
    (cardId: string): ManaColor[] => {
      const remaining = deck.commanders.filter((c) => c.id !== cardId);
      applyUserEdit(
        (prev) => {
          const nextCommanders = prev.commanders.filter((c) => c.id !== cardId);
          if (nextCommanders.length === prev.commanders.length) return prev;
          return {
            ...prev,
            commanders: nextCommanders,
            updatedAt: new Date().toISOString(),
          };
        },
        { recomputeThemes: true },
      );
      return getCombinedColorIdentity(remaining);
    },
    [applyUserEdit, deck.commanders],
  );

  const setLockSearchToCommanderIdentity = useCallback(
    (locked: boolean) => {
      applyUserEdit((prev) => {
        if (prev.lockSearchToCommanderIdentity === locked) return prev;
        return {
          ...prev,
          lockSearchToCommanderIdentity: locked,
          updatedAt: new Date().toISOString(),
        };
      });
    },
    [applyUserEdit],
  );

  const addCard = useCallback(
    (card: CompactCard): boolean => {
      const currentQty = deck.mainboard[card.id]?.quantity ?? 0;
      const check = canAddCardToDeck(
        card,
        currentQty,
        deck.commanders,
        deck.lockSearchToCommanderIdentity,
      );

      if (!check.allowed) {
        setLastNotice({
          message: `${card.name}: ${check.reason ?? 'Cannot add card.'}`,
          isError: true,
        });
        return false;
      }

      applyUserEdit(
        (prev) => {
          const prevEntry = prev.mainboard[card.id];
          const nextQty = (prevEntry?.quantity ?? 0) + 1;
          return {
            ...prev,
            mainboard: {
              ...prev.mainboard,
              [card.id]: { card, quantity: nextQty },
            },
            updatedAt: new Date().toISOString(),
          };
        },
        { recomputeThemes: true },
      );
      setLastNotice({ message: `Added ${card.name} (${currentQty + 1}).` });
      return true;
    },
    [applyUserEdit, deck.commanders, deck.lockSearchToCommanderIdentity, deck.mainboard],
  );

  const removeOneCard = useCallback(
    (cardId: string) => {
      applyUserEdit(
        (prev) => {
          const existing = prev.mainboard[cardId];
          if (!existing) return prev;
          const nextMainboard = { ...prev.mainboard };
          if (existing.quantity <= 1) {
            delete nextMainboard[cardId];
          } else {
            nextMainboard[cardId] = { ...existing, quantity: existing.quantity - 1 };
          }
          return {
            ...prev,
            mainboard: nextMainboard,
            updatedAt: new Date().toISOString(),
          };
        },
        { recomputeThemes: true },
      );
    },
    [applyUserEdit],
  );

  const deleteCard = useCallback(
    (cardId: string) => {
      applyUserEdit(
        (prev) => {
          if (!prev.mainboard[cardId]) return prev;
          const nextMainboard = { ...prev.mainboard };
          delete nextMainboard[cardId];
          return {
            ...prev,
            mainboard: nextMainboard,
            updatedAt: new Date().toISOString(),
          };
        },
        { recomputeThemes: true },
      );
    },
    [applyUserEdit],
  );

  const addCardToSideboard = useCallback(
    (card: CompactCard) => {
      applyUserEdit((prev) => {
        const existing = prev.sideboard[card.id];
        const nextQty = (existing?.quantity ?? 0) + 1;
        return {
          ...prev,
          sideboard: {
            ...prev.sideboard,
            [card.id]: { card, quantity: nextQty },
          },
          updatedAt: new Date().toISOString(),
        };
      });
      setLastNotice({ message: `Added ${card.name} to Considering.` });
    },
    [applyUserEdit],
  );

  const removeOneSideboardCard = useCallback(
    (cardId: string) => {
      applyUserEdit((prev) => {
        const existing = prev.sideboard[cardId];
        if (!existing) return prev;
        const nextSideboard = { ...prev.sideboard };
        if (existing.quantity <= 1) {
          delete nextSideboard[cardId];
        } else {
          nextSideboard[cardId] = { ...existing, quantity: existing.quantity - 1 };
        }
        return {
          ...prev,
          sideboard: nextSideboard,
          updatedAt: new Date().toISOString(),
        };
      });
    },
    [applyUserEdit],
  );

  const deleteSideboardCard = useCallback(
    (cardId: string) => {
      applyUserEdit((prev) => {
        if (!prev.sideboard[cardId]) return prev;
        const nextSideboard = { ...prev.sideboard };
        delete nextSideboard[cardId];
        return {
          ...prev,
          sideboard: nextSideboard,
          updatedAt: new Date().toISOString(),
        };
      });
    },
    [applyUserEdit],
  );

  const moveCardToSideboard = useCallback(
    (cardId: string) => {
      const existing = deck.mainboard[cardId];
      if (!existing) return;

      applyUserEdit(
        (prev) => {
          const entry = prev.mainboard[cardId];
          if (!entry) return prev;
          const nextMainboard = { ...prev.mainboard };
          delete nextMainboard[cardId];
          const prevSbQty = prev.sideboard[cardId]?.quantity ?? 0;
          return {
            ...prev,
            mainboard: nextMainboard,
            sideboard: {
              ...prev.sideboard,
              [cardId]: { card: entry.card, quantity: prevSbQty + entry.quantity },
            },
            updatedAt: new Date().toISOString(),
          };
        },
        { recomputeThemes: true },
      );
      setLastNotice({ message: `Moved ${existing.card.name} to Considering.` });
    },
    [applyUserEdit, deck.mainboard],
  );

  const moveCardToMainboard = useCallback(
    (cardId: string): boolean => {
      const existing = deck.sideboard[cardId];
      if (!existing) return false;

      const currentMainQty = deck.mainboard[cardId]?.quantity ?? 0;
      const check = canAddCardToDeck(
        existing.card,
        currentMainQty,
        deck.commanders,
        deck.lockSearchToCommanderIdentity,
      );
      if (!check.allowed) {
        setLastNotice({
          message: `${existing.card.name}: ${check.reason ?? 'Cannot move to mainboard.'}`,
          isError: true,
        });
        return false;
      }

      applyUserEdit(
        (prev) => {
          const sbEntry = prev.sideboard[cardId];
          if (!sbEntry) return prev;
          const nextSideboard = { ...prev.sideboard };
          if (sbEntry.quantity <= 1) {
            delete nextSideboard[cardId];
          } else {
            nextSideboard[cardId] = { ...sbEntry, quantity: sbEntry.quantity - 1 };
          }
          const prevMainQty = prev.mainboard[cardId]?.quantity ?? 0;
          return {
            ...prev,
            mainboard: {
              ...prev.mainboard,
              [cardId]: { card: sbEntry.card, quantity: prevMainQty + 1 },
            },
            sideboard: nextSideboard,
            updatedAt: new Date().toISOString(),
          };
        },
        { recomputeThemes: true },
      );
      setLastNotice({ message: `Moved ${existing.card.name} to Mainboard.` });
      return true;
    },
    [applyUserEdit, deck.commanders, deck.lockSearchToCommanderIdentity, deck.mainboard, deck.sideboard],
  );

  const autoFillBasicLands = useCallback(
    (basicLands: Record<string, CompactCard>): number => {
      if (Object.keys(basicLands).length === 0) {
        setLastNotice({
          message: 'Basic lands will be available once the catalog finishes loading.',
          isError: true,
        });
        return 0;
      }

      const plan = computeBasicLandAutoFill(deck, basicLands, 100);
      if (plan.length === 0) {
        setLastNotice({ message: 'Deck is already at or above 100 cards.' });
        return 0;
      }

      const totalAdded = plan.reduce((acc, item) => acc + item.addQuantity, 0);
      applyUserEdit(
        (prev) => {
          const nextMainboard = { ...prev.mainboard };
          for (const { card, addQuantity } of plan) {
            const existing = nextMainboard[card.id];
            nextMainboard[card.id] = {
              card,
              quantity: (existing?.quantity ?? 0) + addQuantity,
            };
          }
          return {
            ...prev,
            mainboard: nextMainboard,
            updatedAt: new Date().toISOString(),
          };
        },
        { recomputeThemes: true },
      );

      const summary = plan.map((p) => `+${p.addQuantity} ${p.card.name}`).join(', ');
      setLastNotice({ message: `Auto-filled ${totalAdded} basic lands (${summary}).` });
      return totalAdded;
    },
    [applyUserEdit, deck],
  );

  const moveIllegalCardsToSideboard = useCallback(
    (illegalCardIds: readonly string[]): number => {
      if (illegalCardIds.length === 0) return 0;
      const idSet = new Set(illegalCardIds);
      let moved = 0;

      applyUserEdit(
        (prev) => {
          moved = 0;
          const nextMainboard = { ...prev.mainboard };
          const nextSideboard = { ...prev.sideboard };

          for (const cardId of idSet) {
            const entry = nextMainboard[cardId];
            if (!entry) continue;
            delete nextMainboard[cardId];
            const prevSb = nextSideboard[cardId];
            nextSideboard[cardId] = {
              card: entry.card,
              quantity: (prevSb?.quantity ?? 0) + entry.quantity,
            };
            moved += entry.quantity;
          }

          if (moved === 0) return prev;
          return {
            ...prev,
            mainboard: nextMainboard,
            sideboard: nextSideboard,
            updatedAt: new Date().toISOString(),
          };
        },
        { recomputeThemes: true },
      );

      if (moved > 0) {
        setLastNotice({
          message: `Moved ${moved} off-color card${moved === 1 ? '' : 's'} to Considering.`,
        });
      }
      return moved;
    },
    [applyUserEdit],
  );

  const renameDeck = useCallback(
    (name: string) => {
      applyUserEdit((prev) => {
        if (prev.name === name) return prev;
        return {
          ...prev,
          name,
          updatedAt: new Date().toISOString(),
        };
      });
    },
    [applyUserEdit],
  );

  const setDeckDescription = useCallback(
    (description: string) => {
      const clamped = description.slice(0, MAX_DECK_DESC_LEN);
      applyUserEdit((prev) => {
        if ((prev.description ?? '') === clamped) return prev;
        return {
          ...prev,
          description: clamped,
          updatedAt: new Date().toISOString(),
        };
      });
    },
    [applyUserEdit],
  );

  const setDeckVisibility = useCallback(
    (visibility: DeckVisibility) => {
      applyUserEdit((prev) => {
        if ((prev.visibility ?? 'private') === visibility) return prev;
        return {
          ...prev,
          visibility,
          updatedAt: new Date().toISOString(),
        };
      });
    },
    [applyUserEdit],
  );

  const clearDeck = useCallback(() => {
    applyUserEdit(
      (prev) => {
        const empty = createEmptyDraft(prev.name, prev.id);
        return {
          ...empty,
          description: prev.description ?? '',
          lockSearchToCommanderIdentity: prev.lockSearchToCommanderIdentity,
          ...(prev.visibility !== undefined ? { visibility: prev.visibility } : {}),
          ...(prev.sharedWithUids !== undefined ? { sharedWithUids: prev.sharedWithUids } : {}),
          ...(prev.ownerUid !== undefined ? { ownerUid: prev.ownerUid } : {}),
          ...(prev.ownerHandle !== undefined ? { ownerHandle: prev.ownerHandle } : {}),
          ...(prev.revision !== undefined ? { revision: prev.revision } : {}),
          ...(prev.cloudUpdatedAt !== undefined ? { cloudUpdatedAt: prev.cloudUpdatedAt } : {}),
          createdAt: prev.createdAt,
        };
      },
      { recomputeThemes: true },
    );
    setLastNotice({ message: 'Cleared deck cards.' });
  }, [applyUserEdit]);

  const getCardQuantity = useCallback(
    (cardId: string) => deck.mainboard[cardId]?.quantity ?? 0,
    [deck.mainboard],
  );

  const isCommander = useCallback(
    (cardId: string) => deck.commanders.some((c) => c.id === cardId),
    [deck.commanders],
  );

  const flushPendingLocalBeforeSwitch = useCallback(async () => {
    if (dbSyncTimerRef.current) {
      clearTimeout(dbSyncTimerRef.current);
      dbSyncTimerRef.current = null;
    }
    const wasUserEdit = dirtyUserEditRef.current;
    dirtyUserEditRef.current = false;
    await flushDeckSave(deckRef.current, wasUserEdit);
  }, [flushDeckSave]);

  const createNewDeck = useCallback(
    async (name = 'Untitled Commander Deck') => {
      await flushPendingLocalBeforeSwitch();
      const next = createEmptyDraft(name);
      const untouched = isUntouchedStarterDraft(next);
      try {
        await saveDeckToDb(next, db);
        await refreshSavedDecks();
      } catch {
        // ignore
      }
      skipNextDbSaveRef.current = true;
      dirtyUserEditRef.current = false;
      setDeck(next);
      setLastNotice({ message: `Created new deck "${next.name}".` });
      if (!untouched) {
        onDeckMutatedRef.current?.();
      }
    },
    [db, flushPendingLocalBeforeSwitch, refreshSavedDecks],
  );

  const switchDeck = useCallback(
    async (
      deckId: string,
      resolveByIds: (ids: string[]) => Promise<Record<string, CompactCard>>,
    ): Promise<ManaColor[] | null> => {
      try {
        await flushPendingLocalBeforeSwitch();
        const record = await getSavedDeckRecord(deckId, db);
        if (!record || record.deletedAt) {
          setLastNotice({ message: 'Selected deck could not be found.', isError: true });
          return null;
        }
        const neededIds = collectRecordCardIds(record);
        const cardMap = neededIds.length > 0 ? await resolveByIds(neededIds) : {};
        const hydrated = hydrateSavedRecordToDraft(
          record,
          cardMap,
          deckRef.current.lockSearchToCommanderIdentity,
        );
        skipNextDbSaveRef.current = true;
        dirtyUserEditRef.current = false;
        setDeck(hydrated);
        await refreshSavedDecks();
        setLastNotice({ message: `Loaded deck "${hydrated.name}".` });
        return getCombinedColorIdentity(hydrated.commanders);
      } catch {
        setLastNotice({ message: 'Failed to load saved deck.', isError: true });
        return null;
      }
    },
    [db, flushPendingLocalBeforeSwitch, refreshSavedDecks],
  );

  const duplicateCurrentDeck = useCallback(async () => {
    try {
      await flushPendingLocalBeforeSwitch();
      const copyRecord = await duplicateSavedDeckRecord(
        deckRef.current.id,
        `${deckRef.current.name} (Copy)`,
        db,
      );
      if (copyRecord) {
        const current = deckRef.current;
        const cardMap: Record<string, CompactCard> = {};
        for (const cmd of current.commanders) cardMap[cmd.id] = cmd;
        for (const e of Object.values(current.mainboard)) cardMap[e.card.id] = e.card;
        for (const e of Object.values(current.sideboard)) cardMap[e.card.id] = e.card;
        const hydrated = hydrateSavedRecordToDraft(
          copyRecord,
          cardMap,
          current.lockSearchToCommanderIdentity,
        );
        skipNextDbSaveRef.current = true;
        dirtyUserEditRef.current = false;
        setDeck(hydrated);
        await refreshSavedDecks();
        setLastNotice({ message: `Duplicated as "${hydrated.name}".` });
        if (!isUntouchedStarterDraft(hydrated)) {
          onDeckMutatedRef.current?.();
        }
      }
    } catch {
      setLastNotice({ message: 'Failed to duplicate deck.', isError: true });
    }
  }, [db, flushPendingLocalBeforeSwitch, refreshSavedDecks]);

  const deleteSavedDeck = useCallback(
    async (deckId: string) => {
      try {
        const isDeletingActive = deckId === deckRef.current.id;
        if (isDeletingActive && dbSyncTimerRef.current) {
          clearTimeout(dbSyncTimerRef.current);
          dbSyncTimerRef.current = null;
          dirtyUserEditRef.current = false;
        }

        const result = await deleteSavedDeckByPolicy(deckId, db);
        const remaining = await listSavedDeckRecords(db);
        setSavedDecks(remaining);

        if (isDeletingActive) {
          const fresh = createEmptyDraft();
          skipNextDbSaveRef.current = true;
          dirtyUserEditRef.current = false;
          await saveDeckToDb(fresh, db);
          const nextList = await listSavedDeckRecords(db);
          setSavedDecks(nextList);
          setDeck(fresh);
        }

        if (result.cloudBacked) {
          onDeckMutatedRef.current?.();
        }

        setLastNotice({ message: 'Deleted saved deck.' });
      } catch {
        setLastNotice({ message: 'Failed to delete deck.', isError: true });
      }
    },
    [db],
  );

  const loadDeckDraft = useCallback(
    (nextDraft: DeckDraft, noticeMessage?: string): ManaColor[] => {
      const themes =
        nextDraft.synergyThemes && nextDraft.synergyThemes.length > 0
          ? nextDraft.synergyThemes
          : computeDeckSynergyThemes(nextDraft.commanders, Object.values(nextDraft.mainboard));
      const enrichedDraft: DeckDraft = {
        ...nextDraft,
        synergyThemes: themes,
      };
      const untouched = isUntouchedStarterDraft(enrichedDraft);
      const normalized: DeckDraft = {
        ...enrichedDraft,
        syncStatus: untouched ? 'local' : (nextDraft.syncStatus ?? 'pending'),
      };
      dirtyUserEditRef.current = !untouched;
      skipNextDbSaveRef.current = false;
      setDeck(normalized);
      if (noticeMessage) {
        setLastNotice({ message: noticeMessage });
      }
      return getCombinedColorIdentity(normalized.commanders);
    },
    [],
  );

  const reloadActiveDeckFromDb = useCallback(
    async (
      resolveByIds: (ids: string[]) => Promise<Record<string, CompactCard>>,
    ): Promise<ManaColor[] | null> => {
      try {
        const currentDeck = deckRef.current;
        const record = await getSavedDeckRecord(currentDeck.id, db);
        await refreshSavedDecks();

        if (!record || record.deletedAt) {
          if (record?.deletedAt || currentDeck.ownerUid) {
            if (dbSyncTimerRef.current) {
              clearTimeout(dbSyncTimerRef.current);
              dbSyncTimerRef.current = null;
            }
            dirtyUserEditRef.current = false;
            skipNextDbSaveRef.current = true;
            const remaining = await listSavedDeckRecords(db);
            if (remaining.length > 0) {
              const fallback = remaining[0]!;
              const neededIds = collectRecordCardIds(fallback);
              const cardMap = neededIds.length > 0 ? await resolveByIds(neededIds) : {};
              const hydratedFallback = hydrateSavedRecordToDraft(
                fallback,
                cardMap,
                currentDeck.lockSearchToCommanderIdentity,
              );
              setDeck(hydratedFallback);
              return getCombinedColorIdentity(hydratedFallback.commanders);
            }
            const fresh = createEmptyDraft();
            setDeck(fresh);
            return [];
          }
          return null;
        }

        if (dirtyUserEditRef.current || dbSyncTimerRef.current !== null) {
          return null;
        }

        const neededIds = collectRecordCardIds(record);
        const cardMap = neededIds.length > 0 ? await resolveByIds(neededIds) : {};
        const hydrated = hydrateSavedRecordToDraft(
          record,
          cardMap,
          currentDeck.lockSearchToCommanderIdentity,
        );
        skipNextDbSaveRef.current = true;
        dirtyUserEditRef.current = false;
        setDeck(hydrated);
        return getCombinedColorIdentity(hydrated.commanders);
      } catch {
        return null;
      }
    },
    [db, refreshSavedDecks],
  );

  return {
    deck,
    savedDecks,
    totalCardCount,
    sideboardCardCount,
    totalDeckPriceUsd,
    combinedColorIdentity,
    lastNotice,
    clearNotice,
    setCommander,
    addPartnerCommander,
    removeCommander,
    setLockSearchToCommanderIdentity,
    addCard,
    removeOneCard,
    deleteCard,
    addCardToSideboard,
    removeOneSideboardCard,
    deleteSideboardCard,
    moveCardToSideboard,
    moveCardToMainboard,
    autoFillBasicLands,
    moveIllegalCardsToSideboard,
    renameDeck,
    setDeckDescription,
    setDeckVisibility,
    clearDeck,
    getCardQuantity,
    isCommander,
    createNewDeck,
    switchDeck,
    duplicateCurrentDeck,
    deleteSavedDeck,
    loadDeckDraft,
    refreshSavedDecks,
    reloadActiveDeckFromDb,
  };
}
