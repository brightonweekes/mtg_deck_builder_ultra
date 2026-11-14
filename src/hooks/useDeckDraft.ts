import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SavedDeckRecord } from '../db/cardDb.js';
import {
  collectRecordCardIds,
  deleteSavedDeckRecord,
  duplicateSavedDeckRecord,
  generateDeckId,
  getSavedDeckRecord,
  hydrateSavedRecordToDraft,
  listSavedDeckRecords,
  saveDeckToDb,
} from '../db/deckDb.js';
import { computeBasicLandAutoFill } from '../deck/deckAnalytics.js';
import {
  canAddCardToDeck,
  canPairCommanders,
  getCombinedColorIdentity,
} from '../search/commanderRules.js';
import type { CompactCard, ManaColor } from '../types/card.js';
import type { DeckDraft } from '../types/deck.js';

const STORAGE_KEY = 'mtg_ultra_active_deck_v1';

export interface DeckActionNotice {
  message: string;
  isError?: boolean;
}

export function createEmptyDraft(name = 'Untitled Commander Deck', id?: string): DeckDraft {
  const now = new Date().toISOString();
  return {
    id: id ?? generateDeckId(),
    name,
    commanders: [],
    mainboard: {},
    sideboard: {},
    lockSearchToCommanderIdentity: true,
    createdAt: now,
    updatedAt: now,
  };
}

function loadDraftFromStorage(): DeckDraft {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return createEmptyDraft();
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyDraft();
    const parsed = JSON.parse(raw) as Partial<DeckDraft>;
    if (!parsed || !Array.isArray(parsed.commanders) || typeof parsed.mainboard !== 'object') {
      return createEmptyDraft();
    }
    const now = new Date().toISOString();
    return {
      id: parsed.id && parsed.id !== 'active-draft' ? parsed.id : generateDeckId(),
      name: parsed.name ?? 'Untitled Commander Deck',
      description: parsed.description,
      commanders: parsed.commanders,
      mainboard: parsed.mainboard ?? {},
      sideboard: parsed.sideboard ?? {},
      lockSearchToCommanderIdentity: parsed.lockSearchToCommanderIdentity ?? true,
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
}

export function useDeckDraft(): UseDeckDraftReturn {
  const [deck, setDeck] = useState<DeckDraft>(() => loadDraftFromStorage());
  const [savedDecks, setSavedDecks] = useState<SavedDeckRecord[]>([]);
  const [lastNotice, setLastNotice] = useState<DeckActionNotice | null>(null);
  const dbSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshSavedDecks = useCallback(async () => {
    try {
      const list = await listSavedDeckRecords();
      setSavedDecks(list);
    } catch {
      // Ignore IndexedDB unavailability in restricted environments
    }
  }, []);

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
    if (dbSyncTimerRef.current) {
      clearTimeout(dbSyncTimerRef.current);
    }
    dbSyncTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          await saveDeckToDb(deck);
          await refreshSavedDecks();
        } catch {
          // Ignore IndexedDB write errors cleanly
        }
      })();
    }, 180);

    return () => {
      if (dbSyncTimerRef.current) {
        clearTimeout(dbSyncTimerRef.current);
      }
    };
  }, [deck, refreshSavedDecks]);

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

  const setCommander = useCallback((card: CompactCard): ManaColor[] | null => {
    if (!card.isCommanderEligible) {
      setLastNotice({ message: `${card.name} cannot be your Commander.`, isError: true });
      return null;
    }

    const nextCommanders = [card];
    setDeck((prev) => {
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
    });
    setLastNotice({ message: `Set ${card.name} as Commander.` });
    return getCombinedColorIdentity(nextCommanders);
  }, []);

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
      setDeck((prev) => {
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
      });
      setLastNotice({ message: `Paired ${card.name} with ${primary.name}.` });
      return getCombinedColorIdentity(nextCommanders);
    },
    [deck.commanders, setCommander],
  );

  const removeCommander = useCallback(
    (cardId: string): ManaColor[] => {
      const remaining = deck.commanders.filter((c) => c.id !== cardId);
      setDeck((prev) => ({
        ...prev,
        commanders: prev.commanders.filter((c) => c.id !== cardId),
        updatedAt: new Date().toISOString(),
      }));
      return getCombinedColorIdentity(remaining);
    },
    [deck.commanders],
  );

  const setLockSearchToCommanderIdentity = useCallback((locked: boolean) => {
    setDeck((prev) => ({
      ...prev,
      lockSearchToCommanderIdentity: locked,
      updatedAt: new Date().toISOString(),
    }));
  }, []);

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

      setDeck((prev) => {
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
      });
      setLastNotice({ message: `Added ${card.name} (${currentQty + 1}).` });
      return true;
    },
    [deck.commanders, deck.lockSearchToCommanderIdentity, deck.mainboard],
  );

  const removeOneCard = useCallback((cardId: string) => {
    setDeck((prev) => {
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
    });
  }, []);

  const deleteCard = useCallback((cardId: string) => {
    setDeck((prev) => {
      if (!prev.mainboard[cardId]) return prev;
      const nextMainboard = { ...prev.mainboard };
      delete nextMainboard[cardId];
      return {
        ...prev,
        mainboard: nextMainboard,
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const addCardToSideboard = useCallback((card: CompactCard) => {
    setDeck((prev) => {
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
  }, []);

  const removeOneSideboardCard = useCallback((cardId: string) => {
    setDeck((prev) => {
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
  }, []);

  const deleteSideboardCard = useCallback((cardId: string) => {
    setDeck((prev) => {
      if (!prev.sideboard[cardId]) return prev;
      const nextSideboard = { ...prev.sideboard };
      delete nextSideboard[cardId];
      return {
        ...prev,
        sideboard: nextSideboard,
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const moveCardToSideboard = useCallback(
    (cardId: string) => {
      const existing = deck.mainboard[cardId];
      if (!existing) return;

      setDeck((prev) => {
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
      });
      setLastNotice({ message: `Moved ${existing.card.name} to Considering.` });
    },
    [deck.mainboard],
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

      setDeck((prev) => {
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
      });
      setLastNotice({ message: `Moved ${existing.card.name} to Mainboard.` });
      return true;
    },
    [deck.commanders, deck.lockSearchToCommanderIdentity, deck.mainboard, deck.sideboard],
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
      setDeck((prev) => {
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
      });

      const summary = plan.map((p) => `+${p.addQuantity} ${p.card.name}`).join(', ');
      setLastNotice({ message: `Auto-filled ${totalAdded} basic lands (${summary}).` });
      return totalAdded;
    },
    [deck],
  );

  const moveIllegalCardsToSideboard = useCallback(
    (illegalCardIds: readonly string[]): number => {
      if (illegalCardIds.length === 0) return 0;
      const idSet = new Set(illegalCardIds);
      let moved = 0;

      setDeck((prev) => {
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

        return {
          ...prev,
          mainboard: nextMainboard,
          sideboard: nextSideboard,
          updatedAt: new Date().toISOString(),
        };
      });

      if (moved > 0) {
        setLastNotice({
          message: `Moved ${moved} off-color card${moved === 1 ? '' : 's'} to Considering.`,
        });
      }
      return moved;
    },
    [],
  );

  const renameDeck = useCallback((name: string) => {
    setDeck((prev) => ({
      ...prev,
      name,
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const clearDeck = useCallback(() => {
    setDeck((prev) => ({
      ...createEmptyDraft(prev.name, prev.id),
      createdAt: prev.createdAt,
    }));
    setLastNotice({ message: 'Cleared deck cards.' });
  }, []);

  const getCardQuantity = useCallback(
    (cardId: string) => deck.mainboard[cardId]?.quantity ?? 0,
    [deck.mainboard],
  );

  const isCommander = useCallback(
    (cardId: string) => deck.commanders.some((c) => c.id === cardId),
    [deck.commanders],
  );

  const createNewDeck = useCallback(
    async (name = 'Untitled Commander Deck') => {
      try {
        await saveDeckToDb(deck);
      } catch {
        // ignore
      }
      const next = createEmptyDraft(name);
      try {
        await saveDeckToDb(next);
        await refreshSavedDecks();
      } catch {
        // ignore
      }
      setDeck(next);
      setLastNotice({ message: `Created new deck "${next.name}".` });
    },
    [deck, refreshSavedDecks],
  );

  const switchDeck = useCallback(
    async (
      deckId: string,
      resolveByIds: (ids: string[]) => Promise<Record<string, CompactCard>>,
    ): Promise<ManaColor[] | null> => {
      try {
        await saveDeckToDb(deck);
        const record = await getSavedDeckRecord(deckId);
        if (!record) {
          setLastNotice({ message: 'Selected deck could not be found.', isError: true });
          return null;
        }
        const neededIds = collectRecordCardIds(record);
        const cardMap = neededIds.length > 0 ? await resolveByIds(neededIds) : {};
        const hydrated = hydrateSavedRecordToDraft(
          record,
          cardMap,
          deck.lockSearchToCommanderIdentity,
        );
        setDeck(hydrated);
        await refreshSavedDecks();
        setLastNotice({ message: `Loaded deck "${hydrated.name}".` });
        return getCombinedColorIdentity(hydrated.commanders);
      } catch {
        setLastNotice({ message: 'Failed to load saved deck.', isError: true });
        return null;
      }
    },
    [deck, refreshSavedDecks],
  );

  const duplicateCurrentDeck = useCallback(async () => {
    try {
      await saveDeckToDb(deck);
      const copyRecord = await duplicateSavedDeckRecord(deck.id, `${deck.name} (Copy)`);
      if (copyRecord) {
        const cardMap: Record<string, CompactCard> = {};
        for (const cmd of deck.commanders) cardMap[cmd.id] = cmd;
        for (const e of Object.values(deck.mainboard)) cardMap[e.card.id] = e.card;
        for (const e of Object.values(deck.sideboard)) cardMap[e.card.id] = e.card;
        const hydrated = hydrateSavedRecordToDraft(
          copyRecord,
          cardMap,
          deck.lockSearchToCommanderIdentity,
        );
        setDeck(hydrated);
        await refreshSavedDecks();
        setLastNotice({ message: `Duplicated as "${hydrated.name}".` });
      }
    } catch {
      setLastNotice({ message: 'Failed to duplicate deck.', isError: true });
    }
  }, [deck, refreshSavedDecks]);

  const deleteSavedDeck = useCallback(
    async (deckId: string) => {
      try {
        await deleteSavedDeckRecord(deckId);
        const remaining = await listSavedDeckRecords();
        setSavedDecks(remaining);
        if (deckId === deck.id) {
          const fresh = createEmptyDraft();
          await saveDeckToDb(fresh);
          const nextList = await listSavedDeckRecords();
          setSavedDecks(nextList);
          setDeck(fresh);
        }
        setLastNotice({ message: 'Deleted saved deck.' });
      } catch {
        setLastNotice({ message: 'Failed to delete deck.', isError: true });
      }
    },
    [deck.id],
  );

  const loadDeckDraft = useCallback((nextDraft: DeckDraft, noticeMessage?: string): ManaColor[] => {
    setDeck(nextDraft);
    if (noticeMessage) {
      setLastNotice({ message: noticeMessage });
    }
    return getCombinedColorIdentity(nextDraft.commanders);
  }, []);

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
    clearDeck,
    getCardQuantity,
    isCommander,
    createNewDeck,
    switchDeck,
    duplicateCurrentDeck,
    deleteSavedDeck,
    loadDeckDraft,
  };
}
