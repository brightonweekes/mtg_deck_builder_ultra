import { AlertTriangle, CheckCircle2, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildSharedDeckUrl,
  humanizeCloudError,
  parseCloudUrlIntents,
} from './cloud/validation.js';
import { AccountModal } from './components/AccountModal.js';
import { ActiveFilterBar } from './components/ActiveFilterBar.js';
import { AuthModal } from './components/AuthModal.js';
import { CardDetailModal } from './components/CardDetailModal.js';
import { CardGrid } from './components/CardGrid.js';
import { DeckAuditModal } from './components/DeckAuditModal.js';
import { DeckManagerModal, type DeckManagerTab } from './components/DeckManagerModal.js';
import { DeckWorkspace } from './components/DeckWorkspace.js';
import { FilterSidebar } from './components/FilterSidebar.js';
import { FriendsModal } from './components/FriendsModal.js';
import { HeaderBar } from './components/HeaderBar.js';
import { LegalFooter } from './components/LegalFooter.js';
import { QuickDeckDrawer } from './components/QuickDeckDrawer.js';
import { QuickStartBanner } from './components/QuickStartBanner.js';
import { SharedDeckBanner } from './components/SharedDeckBanner.js';
import { SyncConflictModal } from './components/SyncConflictModal.js';
import { TableQrModal } from './components/TableQrModal.js';
import { generateDeckId } from './db/deckDb.js';
import { computeDeckAnalytics } from './deck/deckAnalytics.js';
import { downloadDeckSnapshotPng } from './deck/deckCardExporter.js';
import { decodeDeckFromUrlParam } from './deck/urlCodec.js';
import { useCardSearch } from './hooks/useCardSearch.js';
import { useCloudAuth } from './hooks/useCloudAuth.js';
import {
  hydrateCloudDeckToClonedDraft,
  useCloudSync,
} from './hooks/useCloudSync.js';
import { useDeckDraft, type DeckActionNotice } from './hooks/useDeckDraft.js';
import { useFriends } from './hooks/useFriends.js';
import {
  buildCommanderSynergyQuery,
  getChooseCommanderFilter,
  getCompatiblePartnerFilter,
} from './search/commanderRules.js';
import type { CompactCard, FunctionalRole, ManaColor } from './types/card.js';
import type { CloudDeckRecord } from './types/cloud.js';
import type { DeckCardEntry, DeckDraft, ViewMode, WorkspaceTab } from './types/deck.js';
import type { ScoredCardMatch } from './types/search.js';

function stripUrlQueryParams(...keys: string[]): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of keys) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (changed) {
    const search = url.searchParams.toString();
    window.history.replaceState(
      null,
      '',
      `${url.pathname}${search ? `?${search}` : ''}${url.hash}`,
    );
  }
}

export function hasAuthReturnIntent(search: string): boolean {
  if (!search || typeof search !== 'string') return false;
  try {
    const params = new URLSearchParams(search);
    return params.get('authReturn') === '1';
  } catch {
    return false;
  }
}

export function hasCloudUrlIntent(search: string): boolean {
  if (!search || typeof search !== 'string') return false;
  try {
    const intents = parseCloudUrlIntents(search);
    if (intents.sharedDeckId || intents.addFriendHandle) {
      return true;
    }
    const params = new URLSearchParams(search);
    if (params.has('authReturn') && params.get('authReturn') !== '0') {
      return true;
    }
    const mode = params.get('mode');
    if (
      mode === 'verifyEmail' ||
      mode === 'resetPassword' ||
      Boolean(params.get('oobCode')?.trim())
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function App() {
  const {
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
  } = useCardSearch();

  const [hasCloudUrlIntentOnMount] = useState(() =>
    typeof window !== 'undefined' ? hasCloudUrlIntent(window.location.search) : false,
  );
  const cloudAuth = useCloudAuth({ autoConnect: hasCloudUrlIntentOnMount });
  const friends = useFriends(cloudAuth.user, cloudAuth.profile);

  const scheduleCloudPushRef = useRef<() => void>(() => {});
  const handleDeckMutated = useCallback(() => {
    scheduleCloudPushRef.current();
  }, []);

  const {
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
  } = useDeckDraft({ onDeckMutated: handleDeckMutated });

  const refreshSavedDecksRef = useRef(refreshSavedDecks);
  refreshSavedDecksRef.current = refreshSavedDecks;
  const reloadActiveDeckRef = useRef(reloadActiveDeckFromDb);
  reloadActiveDeckRef.current = reloadActiveDeckFromDb;
  const lockIdentityRef = useRef(deck.lockSearchToCommanderIdentity);
  lockIdentityRef.current = deck.lockSearchToCommanderIdentity;

  const cloudSync = useCloudSync({
    user: cloudAuth.user,
    profile: cloudAuth.profile,
    resolveCards,
    savedDecks,
    onSignOut: cloudAuth.signOut,
    onExternalDecksUpdated: async (meta) => {
      await refreshSavedDecksRef.current();
      const nextIdentity = await reloadActiveDeckRef.current((ids) =>
        resolveCards({ ids }).then((res) => res.byId),
      );
      if (nextIdentity === null || meta.reason === 'push') return;

      if (meta.clearedCloudCopies) {
        updateFilter({
          colorIdentity: nextIdentity.length > 0 ? nextIdentity : null,
        });
      } else if (lockIdentityRef.current && nextIdentity.length > 0) {
        updateFilter({ colorIdentity: nextIdentity });
      }
    },
  });
  scheduleCloudPushRef.current = cloudSync.scheduleCloudPush;

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('search');
  const [viewMode, setViewMode] = useState<ViewMode>('standard');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [deckDrawerOpen, setDeckDrawerOpen] = useState(false);
  const [deckManagerTab, setDeckManagerTab] = useState<DeckManagerTab | null>(null);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [tableQrOpen, setTableQrOpen] = useState(false);
  const [inspectedMatch, setInspectedMatch] = useState<ScoredCardMatch | null>(null);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [friendsModalOpen, setFriendsModalOpen] = useState(false);
  const [pendingFriendHandle, setPendingFriendHandle] = useState<string | null>(null);

  const [sharedDeck, setSharedDeck] = useState<CloudDeckRecord | null>(null);
  const [sharedDeckCommanders, setSharedDeckCommanders] = useState<CompactCard[]>([]);
  const [sharedDeckLoading, setSharedDeckLoading] = useState(false);
  const [sharedDeckError, setSharedDeckError] = useState<string | null>(null);

  const [commanderNamesById, setCommanderNamesById] = useState<Record<string, string>>({});
  const [cloudNotice, setCloudNotice] = useState<DeckActionNotice | null>(null);

  const handledShareUrlRef = useRef(false);
  const handledCloudUrlRef = useRef(false);
  const initialAuthReturnRef = useRef<boolean>(
    typeof window !== 'undefined' && hasAuthReturnIntent(window.location.search),
  );
  const handledAuthReturnRef = useRef(false);
  const promptedAuthForFriendRef = useRef(false);
  const openedFriendsForPendingRef = useRef(false);

  const analytics = useMemo(() => computeDeckAnalytics(deck), [deck]);

  const cloudShareActive =
    Boolean(cloudAuth.user?.emailVerified) &&
    (deck.visibility === 'link' || deck.visibility === 'public');

  const cloudShareUrl = useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      return buildSharedDeckUrl(window.location.origin, window.location.pathname, deck.id);
    } catch {
      return null;
    }
  }, [deck.id]);

  // If a saved deck already has a locked Commander on initial load, mirror its color identity into search
  useEffect(() => {
    if (deck.lockSearchToCommanderIdentity && deck.commanders.length > 0) {
      updateFilter({ colorIdentity: combinedColorIdentity });
    }
    // Intentional mount-only hydration sync
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissSharedDeckBanner = useCallback(() => {
    setSharedDeck(null);
    setSharedDeckCommanders([]);
    setSharedDeckLoading(false);
    setSharedDeckError(null);
  }, []);

  const openSharedDeckById = useCallback(
    async (deckId: string) => {
      setSharedDeck(null);
      setSharedDeckCommanders([]);
      setSharedDeckError(null);
      setSharedDeckLoading(true);
      try {
        const fetched = await friends.loadSharedDeck(deckId);
        if (!fetched) {
          setSharedDeckError(
            cloudAuth.isConfigured
              ? 'This shared deck could not be found, or its owner has made it private.'
              : 'Cloud sharing is not configured in this build.',
          );
          return;
        }
        setSharedDeck(fetched);
      } catch (err) {
        setSharedDeckError(humanizeCloudError(err).message);
      } finally {
        setSharedDeckLoading(false);
      }
    },
    [cloudAuth.isConfigured, friends],
  );

  const cloneCloudDeckRecord = useCallback(
    async (sourceDeck: CloudDeckRecord) => {
      try {
        const cloned = await hydrateCloudDeckToClonedDraft(sourceDeck, resolveCards);
        const nextIdentity = loadDeckDraft(
          cloned,
          `Cloned "${cloned.name}" into your Studio.`,
        );
        updateFilter({
          colorIdentity:
            cloned.commanders.length > 0 && cloned.lockSearchToCommanderIdentity
              ? nextIdentity
              : null,
        });
        setActiveTab('deck');
        dismissSharedDeckBanner();
      } catch (err) {
        setCloudNotice({
          message: humanizeCloudError(err).message,
          isError: true,
        });
      }
    },
    [dismissSharedDeckBanner, loadDeckDraft, resolveCards, updateFilter],
  );

  // Hydrate `?d=...` shared deck URL once the Web Worker catalog is ready
  useEffect(() => {
    if (syncStatus.stage !== 'ready' || handledShareUrlRef.current) return;
    handledShareUrlRef.current = true;
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('d');
    if (!encoded) return;

    const decoded = decodeDeckFromUrlParam(encoded);
    if (!decoded) return;

    void (async () => {
      const allIds = Array.from(
        new Set([
          ...decoded.commanderIds,
          ...decoded.mainboard.map(([id]) => id),
          ...decoded.sideboard.map(([id]) => id),
        ]),
      );
      const { byId } = await resolveCards({ ids: allIds });

      const commanders: CompactCard[] = [];
      for (const id of decoded.commanderIds) {
        const card = byId[id];
        if (card) commanders.push(card);
      }

      const mainboard: Record<string, DeckCardEntry> = {};
      for (const [id, qty] of decoded.mainboard) {
        const card = byId[id];
        if (card && qty > 0) mainboard[id] = { card, quantity: qty };
      }

      const sideboard: Record<string, DeckCardEntry> = {};
      for (const [id, qty] of decoded.sideboard) {
        const card = byId[id];
        if (card && qty > 0) sideboard[id] = { card, quantity: qty };
      }

      const now = new Date().toISOString();
      const sharedDraft: DeckDraft = {
        id: generateDeckId(),
        name: decoded.name || 'Shared Commander Deck',
        commanders,
        mainboard,
        sideboard,
        lockSearchToCommanderIdentity: true,
        visibility: 'private',
        revision: 0,
        syncStatus: 'local',
        createdAt: now,
        updatedAt: now,
      };

      const nextIdentity = loadDeckDraft(
        sharedDraft,
        `Loaded shared deck "${sharedDraft.name}".`,
      );
      updateFilter({
        colorIdentity: commanders.length > 0 ? nextIdentity : null,
      });
      setActiveTab('deck');
      stripUrlQueryParams('d');
    })();
  }, [syncStatus.stage, resolveCards, loadDeckDraft, updateFilter]);

  // Parse cloud query intents (`?deck=<id>` and `?addFriend=<handle>`) cleanly on mount
  useEffect(() => {
    if (handledCloudUrlRef.current || typeof window === 'undefined') return;
    handledCloudUrlRef.current = true;

    const { sharedDeckId, addFriendHandle } = parseCloudUrlIntents(window.location.search);
    if (sharedDeckId) {
      stripUrlQueryParams('deck');
      void openSharedDeckById(sharedDeckId);
    }
    if (addFriendHandle) {
      stripUrlQueryParams('addFriend');
      setPendingFriendHandle(addFriendHandle);
    }
  }, [openSharedDeckById]);

  // Guide `?addFriend=<handle>` through Auth (if needed) into FriendsModal prefilled
  useEffect(() => {
    if (!pendingFriendHandle || cloudAuth.authLoading) return;

    if (!cloudAuth.user || !cloudAuth.user.emailVerified) {
      if (!promptedAuthForFriendRef.current) {
        promptedAuthForFriendRef.current = true;
        cloudAuth.clearError();
        setAuthModalOpen(true);
      }
      return;
    }

    if (cloudAuth.profile && !openedFriendsForPendingRef.current) {
      openedFriendsForPendingRef.current = true;
      setAuthModalOpen(false);
      friends.clearError();
      setFriendsModalOpen(true);
    }
  }, [
    cloudAuth,
    friends,
    pendingFriendHandle,
  ]);

  // Auto-close AuthModal once signed in and email-verified (when not redirected above)
  useEffect(() => {
    if (authModalOpen && cloudAuth.user?.emailVerified && !pendingFriendHandle) {
      setAuthModalOpen(false);
    }
  }, [authModalOpen, cloudAuth.user?.emailVerified, pendingFriendHandle]);

  // Refresh verification status if returning via email continueUrl (?authReturn=1)
  useEffect(() => {
    if (handledAuthReturnRef.current || !initialAuthReturnRef.current) return;
    if (cloudAuth.authLoading) return;
    handledAuthReturnRef.current = true;
    stripUrlQueryParams('authReturn');
    if (cloudAuth.user) {
      void cloudAuth.refreshVerificationStatus().catch(() => {
        // Error surfaced via cloudAuth.error
      });
    }
  }, [cloudAuth]);

  // Resolve commander cards for SharedDeckBanner preview once catalog is ready
  useEffect(() => {
    if (!sharedDeck || syncStatus.stage !== 'ready') return;
    if (sharedDeck.commanderOracleIds.length === 0) {
      setSharedDeckCommanders([]);
      return;
    }

    let cancelled = false;
    void resolveCards({ ids: sharedDeck.commanderOracleIds })
      .then(({ byId }) => {
        if (cancelled) return;
        const resolvedCmds: CompactCard[] = [];
        for (const oid of sharedDeck.commanderOracleIds) {
          const card = byId[oid];
          if (card) resolvedCmds.push(card);
        }
        setSharedDeckCommanders(resolvedCmds);
      })
      .catch(() => {
        if (!cancelled) setSharedDeckCommanders([]);
      });

    return () => {
      cancelled = true;
    };
  }, [sharedDeck, syncStatus.stage, resolveCards]);

  // Resolve friend deck commander names for FriendsModal summaries
  const friendCommanderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const deckList of Object.values(friends.friendDecksByUid)) {
      for (const summary of deckList) {
        for (const cid of summary.commanderOracleIds) {
          if (cid) ids.add(cid);
        }
      }
    }
    return Array.from(ids);
  }, [friends.friendDecksByUid]);

  useEffect(() => {
    if (syncStatus.stage !== 'ready' || friendCommanderIds.length === 0) return;

    let cancelled = false;
    void resolveCards({ ids: friendCommanderIds })
      .then(({ byId }) => {
        if (cancelled) return;
        const nextMap: Record<string, string> = {};
        for (const id of friendCommanderIds) {
          const card = byId[id];
          if (card) nextMap[id] = card.name;
        }
        setCommanderNamesById(nextMap);
      })
      .catch(() => {
        // Non-fatal preview enrichment failure
      });

    return () => {
      cancelled = true;
    };
  }, [friendCommanderIds, syncStatus.stage, resolveCards]);

  // Auto-dismiss toast notifications
  useEffect(() => {
    if (!lastNotice) return;
    const timer = window.setTimeout(() => clearNotice(), 3400);
    return () => window.clearTimeout(timer);
  }, [lastNotice, clearNotice]);

  useEffect(() => {
    if (!cloudNotice) return;
    const timer = window.setTimeout(() => setCloudNotice(null), 3800);
    return () => window.clearTimeout(timer);
  }, [cloudNotice]);

  const syncFilterIdentity = useCallback(
    (nextIdentity: ManaColor[] | null, hasCommanders: boolean) => {
      if (!deck.lockSearchToCommanderIdentity) return;
      updateFilter({
        colorIdentity: hasCommanders ? nextIdentity : null,
      });
    },
    [deck.lockSearchToCommanderIdentity, updateFilter],
  );

  const handleSetCommander = useCallback(
    (card: CompactCard) => {
      const nextIdentity = setCommander(card);
      if (nextIdentity === null) return;

      updateFilter({
        colorIdentity: deck.lockSearchToCommanderIdentity ? nextIdentity : filter.colorIdentity,
        commanderOnly: false,
        partnerType: null,
      });
    },
    [
      deck.lockSearchToCommanderIdentity,
      filter.colorIdentity,
      setCommander,
      updateFilter,
    ],
  );

  const handleAddPartner = useCallback(
    (card: CompactCard) => {
      const nextIdentity = addPartnerCommander(card);
      if (nextIdentity === null) return;

      updateFilter({
        colorIdentity: deck.lockSearchToCommanderIdentity ? nextIdentity : filter.colorIdentity,
        commanderOnly: false,
        partnerType: null,
        query: '',
      });
    },
    [
      addPartnerCommander,
      deck.lockSearchToCommanderIdentity,
      filter.colorIdentity,
      updateFilter,
    ],
  );

  const handleRemoveCommander = useCallback(
    (cardId: string) => {
      const remainingCount = deck.commanders.filter((c) => c.id !== cardId).length;
      const nextIdentity = removeCommander(cardId);
      syncFilterIdentity(nextIdentity, remainingCount > 0);
    },
    [deck.commanders, removeCommander, syncFilterIdentity],
  );

  const handleClearCommanders = useCallback(() => {
    for (const cmd of deck.commanders) {
      removeCommander(cmd.id);
    }
    syncFilterIdentity(null, false);
  }, [deck.commanders, removeCommander, syncFilterIdentity]);

  const handleToggleIdentityLock = useCallback(
    (locked: boolean) => {
      setLockSearchToCommanderIdentity(locked);
      if (locked && deck.commanders.length > 0) {
        updateFilter({ colorIdentity: combinedColorIdentity });
      } else if (!locked) {
        updateFilter({ colorIdentity: null });
      }
    },
    [
      combinedColorIdentity,
      deck.commanders.length,
      setLockSearchToCommanderIdentity,
      updateFilter,
    ],
  );

  const handleClearDeck = useCallback(() => {
    clearDeck();
    syncFilterIdentity(null, false);
  }, [clearDeck, syncFilterIdentity]);

  const handleMatchCommanderSynergy = useCallback(() => {
    if (deck.commanders.length === 0) return;
    const synergyQuery = buildCommanderSynergyQuery(deck.commanders);
    updateFilter({
      themeQuery: synergyQuery,
      sortBy: synergyQuery ? 'synergy' : filter.sortBy,
      themes: [],
      roles: [],
      commanderOnly: false,
      partnerType: null,
      colorIdentity: deck.lockSearchToCommanderIdentity
        ? combinedColorIdentity
        : filter.colorIdentity,
    });
    setActiveTab('search');
  }, [
    combinedColorIdentity,
    deck.commanders,
    deck.lockSearchToCommanderIdentity,
    filter.colorIdentity,
    filter.sortBy,
    updateFilter,
  ]);

  const handleFindPartner = useCallback(() => {
    const primary = deck.commanders[0];
    if (!primary) return;
    const patch = getCompatiblePartnerFilter(primary);
    if (!patch) return;

    updateFilter({
      ...patch,
      colorIdentity: null,
    });
    setActiveTab('search');
  }, [deck.commanders, updateFilter]);

  const handleChooseCommander = useCallback(() => {
    updateFilter(
      getChooseCommanderFilter({ sortBy: filter.sortBy, pageSize: filter.pageSize }),
      { immediate: true },
    );
    setActiveTab('search');
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
  }, [filter.pageSize, filter.sortBy, updateFilter]);

  const handleFindSimilar = useCallback(
    (card: CompactCard) => {
      const synergyQuery = buildCommanderSynergyQuery([card]);
      updateFilter({
        themeQuery: synergyQuery,
        sortBy: synergyQuery ? 'synergy' : filter.sortBy,
        themes: [],
        roles: [],
        commanderOnly: false,
        partnerType: null,
      });
      setActiveTab('search');
    },
    [filter.sortBy, updateFilter],
  );

  const handleQuickFilterRole = useCallback(
    (role: FunctionalRole | 'lands', overrideColorIdentity?: ManaColor[] | null) => {
      updateFilter({
        roles: role === 'lands' ? [] : [role],
        cardTypes: role === 'lands' ? ['Land'] : [],
        commanderOnly: false,
        partnerType: null,
        colorIdentity:
          overrideColorIdentity !== undefined
            ? overrideColorIdentity
            : deck.lockSearchToCommanderIdentity && deck.commanders.length > 0
              ? combinedColorIdentity
              : filter.colorIdentity,
      });
      setActiveTab('search');
    },
    [
      combinedColorIdentity,
      deck.commanders.length,
      deck.lockSearchToCommanderIdentity,
      filter.colorIdentity,
      updateFilter,
    ],
  );

  const handleSelectSampleCommander = useCallback(
    (card: CompactCard) => {
      const nextIdentity = setCommander(card);
      if (nextIdentity === null) return;
      const synergyQuery = buildCommanderSynergyQuery([card]);
      updateFilter(
        {
          themeQuery: synergyQuery,
          sortBy: synergyQuery ? 'synergy' : filter.sortBy,
          themes: [],
          roles: [],
          commanderOnly: false,
          partnerType: null,
          colorIdentity: deck.lockSearchToCommanderIdentity
            ? nextIdentity
            : filter.colorIdentity,
        },
        { immediate: true },
      );
      setActiveTab('search');
    },
    [
      deck.lockSearchToCommanderIdentity,
      filter.colorIdentity,
      filter.sortBy,
      setCommander,
      updateFilter,
    ],
  );

  const handleFilterByRole = useCallback(
    (role: FunctionalRole) => {
      if (!filter.roles.includes(role)) {
        updateFilter({ roles: [...filter.roles, role] });
      }
      setActiveTab('search');
    },
    [filter.roles, updateFilter],
  );

  const handleFilterByTheme = useCallback(
    (themeId: string) => {
      if (!filter.themes.includes(themeId)) {
        updateFilter({ themes: [...filter.themes, themeId] });
      }
      setActiveTab('search');
    },
    [filter.themes, updateFilter],
  );

  const handleInspectRawCard = useCallback(
    (card: CompactCard) => {
      const liveMatch = searchResult?.matches.find((m) => m.card.id === card.id);
      setInspectedMatch(liveMatch ?? { card, synergyScore: 0, matchedReasons: [] });
    },
    [searchResult],
  );

  const handlePageChange = useCallback(
    (nextPage: number) => {
      updateFilter({ page: nextPage });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [updateFilter],
  );

  const handleResetFilters = useCallback(() => {
    resetFilters();
    if (deck.lockSearchToCommanderIdentity && deck.commanders.length > 0) {
      updateFilter({ colorIdentity: combinedColorIdentity });
    }
  }, [
    combinedColorIdentity,
    deck.commanders.length,
    deck.lockSearchToCommanderIdentity,
    resetFilters,
    updateFilter,
  ]);

  const handleSwitchDeck = useCallback(
    async (deckId: string) => {
      const nextIdentity = await switchDeck(deckId, async (ids) => {
        const res = await resolveCards({ ids });
        return res.byId;
      });
      if (nextIdentity !== null && deck.lockSearchToCommanderIdentity) {
        updateFilter({ colorIdentity: nextIdentity.length > 0 ? nextIdentity : null });
      }
    },
    [deck.lockSearchToCommanderIdentity, resolveCards, switchDeck, updateFilter],
  );

  const handleCreateNewDeck = useCallback(
    async (name?: string) => {
      await createNewDeck(name);
      syncFilterIdentity(null, false);
    },
    [createNewDeck, syncFilterIdentity],
  );

  const handleImportDeckDraft = useCallback(
    (draft: DeckDraft, noticeMessage?: string) => {
      const nextIdentity = loadDeckDraft(draft, noticeMessage);
      updateFilter({
        colorIdentity: draft.commanders.length > 0 ? nextIdentity : null,
      });
      setActiveTab('deck');
    },
    [loadDeckDraft, updateFilter],
  );

  const handleOpenCloudAuthOrAccount = useCallback(() => {
    cloudAuth.activateCloud();
    if (!cloudAuth.user || !cloudAuth.user.emailVerified) {
      cloudAuth.clearError();
      setAuthModalOpen(true);
      return;
    }
    if (cloudSync.conflicts.length > 0) {
      cloudSync.openConflictModal();
      return;
    }
    cloudAuth.clearError();
    cloudSync.clearSyncError();
    setAccountModalOpen(true);
  }, [cloudAuth, cloudSync]);

  const handleOpenFriendsModal = useCallback(() => {
    cloudAuth.activateCloud();
    friends.clearError();
    setFriendsModalOpen(true);
  }, [cloudAuth, friends]);

  const handleExportAccountData = useCallback(async () => {
    let url: string | null = null;
    try {
      const bundle = await cloudSync.exportAllData();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const handleSlug = cloudAuth.profile?.handle || 'commander-vault';
      a.download = `ripple99-backup-${handleSlug}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setCloudNotice({ message: 'Downloaded cloud & local JSON backup.' });
    } catch (err) {
      setCloudNotice({
        message: humanizeCloudError(err).message,
        isError: true,
      });
    } finally {
      if (url) {
        URL.revokeObjectURL(url);
      }
    }
  }, [cloudAuth.profile?.handle, cloudSync]);

  const handleSignOutAccount = useCallback(
    async (clearLocalCloudCopies: boolean) => {
      await cloudSync.signOutWithCleanup(clearLocalCloudCopies);
      setAccountModalOpen(false);
      setCloudNotice({
        message: clearLocalCloudCopies
          ? 'Signed out and cleared cloud decks from this device.'
          : 'Signed out. Local copies remain available offline.',
      });
    },
    [cloudSync],
  );

  const handleDeleteAccount = useCallback(
    async (reauthPassword?: string) => {
      const uid = cloudAuth.user?.uid;
      await cloudAuth.deleteAccount(reauthPassword);
      if (uid) {
        await cloudSync.cleanupAfterAccountDeletion(uid);
      }
      setAccountModalOpen(false);
      setCloudNotice({ message: 'Deleted cloud account and cleared cloud sync data.' });
    },
    [cloudAuth, cloudSync],
  );

  const handleCloneFriendDeckById = useCallback(
    async (deckId: string) => {
      try {
        const fetched = await friends.loadSharedDeck(deckId);
        if (!fetched) {
          setCloudNotice({
            message: 'Shared deck could not be loaded.',
            isError: true,
          });
          return;
        }
        setFriendsModalOpen(false);
        await cloneCloudDeckRecord(fetched);
      } catch (err) {
        setCloudNotice({
          message: humanizeCloudError(err).message,
          isError: true,
        });
      }
    },
    [cloneCloudDeckRecord, friends],
  );

  const activeNotice = cloudNotice ?? lastNotice;
  const isReady = syncStatus.stage === 'ready';

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <div className="flex-1">
        <HeaderBar
          query={filter.query}
          onQueryChange={(query) => updateFilter({ query })}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          commanders={deck.commanders}
          totalDeckCards={totalCardCount}
          syncStatus={syncStatus}
          searchResult={searchResult}
          cloudUser={cloudAuth.user}
          cloudProfile={cloudAuth.profile}
          cloudSyncStatus={cloudSync.overallSyncStatus}
          isCloudSyncing={cloudSync.isSyncing}
          conflictCount={cloudSync.conflicts.length}
          incomingFriendRequestsCount={friends.incomingRequests.length}
          onOpenMobileFilters={() => setMobileFiltersOpen(true)}
          onOpenDeckDrawer={() => setDeckDrawerOpen(true)}
          onOpenDeckManager={() => setDeckManagerTab('decks')}
          onOpenAudit={() => setAuditModalOpen(true)}
          onOpenFriends={handleOpenFriendsModal}
          onOpenCloudAuthOrAccount={handleOpenCloudAuthOrAccount}
          onMatchCommanderSynergy={handleMatchCommanderSynergy}
          onFindPartner={handleFindPartner}
          onClearCommanders={handleClearCommanders}
          onForceResync={forceResync}
        />

      {/* IndexedDB Sync Progress / Error Banner */}
      {!isReady && (
        <div className="border-b border-slate-800/80 bg-slate-900/80 px-4 py-2">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 text-xs">
            {syncStatus.stage === 'error' ? (
              <>
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                <span className="flex-1 text-rose-200">
                  Catalog sync error: {syncStatus.error ?? syncStatus.message}
                </span>
                <button
                  type="button"
                  onClick={forceResync}
                  className="inline-flex items-center gap-1 rounded-lg bg-rose-500/20 px-2.5 py-1 font-semibold text-rose-100 ring-1 ring-rose-400/40 hover:bg-rose-500/30"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry Sync
                </button>
              </>
            ) : (
              <>
                <div className="h-2 min-w-[160px] flex-1 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-amber-400 transition-all duration-200"
                    style={{ width: `${syncStatus.progressPercent}%` }}
                  />
                </div>
                <span className="shrink-0 font-mono text-slate-300">
                  {syncStatus.progressPercent}% · {syncStatus.message}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Workspace Switch: Catalog Search vs Full Deck Studio */}
      {activeTab === 'search' ? (
        <>
          <QuickStartBanner
            activeTab={activeTab}
            totalCatalogCards={syncStatus.manifest?.totalCards ?? 32643}
            resolveCards={resolveCards}
            onOpenAudit={() => setAuditModalOpen(true)}
            onSelectSampleCommander={handleSelectSampleCommander}
          />
          <div className="mx-auto flex max-w-[1600px] items-start gap-5 px-4 py-4">
            <FilterSidebar
              filter={filter}
              commanders={deck.commanders}
              mobileOpen={mobileFiltersOpen}
              onCloseMobile={() => setMobileFiltersOpen(false)}
              onUpdateFilter={updateFilter}
              onResetFilters={handleResetFilters}
              onFindPartner={handleFindPartner}
            />

            <main className="min-w-0 flex-1 space-y-3">
              <ActiveFilterBar
                filter={filter}
                searchResult={searchResult}
                isSearching={isSearching}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                onUpdateFilter={updateFilter}
                onResetFilters={handleResetFilters}
              />

              <CardGrid
                searchResult={searchResult}
                viewMode={viewMode}
                commanders={deck.commanders}
                enforceColorIdentity={deck.lockSearchToCommanderIdentity}
                getCardQuantity={getCardQuantity}
                isCommander={isCommander}
                onPageChange={handlePageChange}
                onInspectCard={setInspectedMatch}
                onAddCard={addCard}
                onSetCommander={handleSetCommander}
                onAddPartner={handleAddPartner}
              />
            </main>
          </div>
        </>
      ) : (
        <DeckWorkspace
          deck={deck}
          analytics={analytics}
          totalDeckPriceUsd={totalDeckPriceUsd}
          combinedColorIdentity={combinedColorIdentity}
          basicLands={basicLands}
          onRenameDeck={renameDeck}
          onChangeVisibility={setDeckVisibility}
          onChangeDescription={setDeckDescription}
          onRemoveCommander={handleRemoveCommander}
          onToggleIdentityLock={handleToggleIdentityLock}
          onMatchSynergy={handleMatchCommanderSynergy}
          onFindPartner={handleFindPartner}
          onAddCard={addCard}
          onRemoveOneCard={removeOneCard}
          onDeleteCard={deleteCard}
          onMoveToSideboard={moveCardToSideboard}
          onMoveToMainboard={moveCardToMainboard}
          onAddToSideboard={addCardToSideboard}
          onRemoveOneSideboard={removeOneSideboardCard}
          onDeleteSideboard={deleteSideboardCard}
          onAutoFillBasics={() => autoFillBasicLands(basicLands)}
          onMoveIllegalToSideboard={() =>
            moveIllegalCardsToSideboard(analytics.illegalColorCardIds)
          }
          onQuickFilterRole={handleQuickFilterRole}
          onOpenDeckManager={(t) => setDeckManagerTab(t)}
          onBackToSearch={() => setActiveTab('search')}
          onChooseCommander={handleChooseCommander}
          onInspectCard={handleInspectRawCard}
          onOpenTableQr={cloudShareActive ? () => setTableQrOpen(true) : undefined}
          onExportPng={
            cloudShareActive && cloudShareUrl
              ? () =>
                  downloadDeckSnapshotPng(deck, analytics, totalDeckPriceUsd, {
                    shareUrl: cloudShareUrl,
                  }).then(() => undefined)
              : undefined
          }
        />
      )}

      {/* Slide-Over Quick Deck Draft Drawer */}
      <QuickDeckDrawer
        open={deckDrawerOpen}
        deck={deck}
        totalCardCount={totalCardCount}
        sideboardCardCount={sideboardCardCount}
        totalDeckPriceUsd={totalDeckPriceUsd}
        combinedColorIdentity={combinedColorIdentity}
        onClose={() => setDeckDrawerOpen(false)}
        onRenameDeck={renameDeck}
        onRemoveCommander={handleRemoveCommander}
        onAddCard={addCard}
        onRemoveOneCard={removeOneCard}
        onDeleteCard={deleteCard}
        onMoveToSideboard={moveCardToSideboard}
        onMoveToMainboard={moveCardToMainboard}
        onDeleteSideboard={deleteSideboardCard}
        onClearDeck={handleClearDeck}
        onToggleIdentityLock={handleToggleIdentityLock}
        onMatchSynergy={handleMatchCommanderSynergy}
        onOpenFullWorkspace={() => setActiveTab('deck')}
        onOpenDeckManager={() => setDeckManagerTab('decks')}
        onInspectCard={handleInspectRawCard}
      />

      {/* Multi-Deck Manager / Import & Export / URL Share Modal */}
      <DeckManagerModal
        open={deckManagerTab !== null}
        initialTab={deckManagerTab ?? 'decks'}
        activeDeck={deck}
        savedDecks={savedDecks}
        cloudUser={cloudAuth.user}
        isCloudConfigured={cloudAuth.isConfigured}
        isCloudSyncing={cloudSync.isSyncing}
        resolveCards={resolveCards}
        onClose={() => setDeckManagerTab(null)}
        onCreateNewDeck={handleCreateNewDeck}
        onSwitchDeck={handleSwitchDeck}
        onDuplicateCurrentDeck={duplicateCurrentDeck}
        onDeleteDeck={deleteSavedDeck}
        onImportDeckDraft={handleImportDeckDraft}
        onChangeVisibility={setDeckVisibility}
        onSyncNow={async () => {
          await cloudSync.syncNow();
        }}
        onOpenAuth={() => {
          cloudAuth.activateCloud();
          cloudAuth.clearError();
          setAuthModalOpen(true);
        }}
        onOpenTableQr={cloudShareActive ? () => setTableQrOpen(true) : undefined}
      />

      {/* Instant 99 Audit Modal */}
      <DeckAuditModal
        open={auditModalOpen}
        activeDeck={deck}
        activeDeckPriceUsd={totalDeckPriceUsd}
        resolveCards={resolveCards}
        runOneOffSearch={runOneOffSearch}
        onAddUpgradeCard={addCard}
        onClose={() => setAuditModalOpen(false)}
        onImportDeckDraft={handleImportDeckDraft}
        onOpenCurrentStudio={() => setActiveTab('deck')}
        onFindMissingRole={(role, auditedIdentity) => {
          handleQuickFilterRole(role, auditedIdentity);
          setAuditModalOpen(false);
        }}
      />

      {/* Scannable LGS Table QR Modal */}
      <TableQrModal
        open={tableQrOpen}
        deck={deck}
        cloudShareUrl={cloudShareUrl}
        cloudShareActive={cloudShareActive}
        onClose={() => setTableQrOpen(false)}
        onOpenShareSettings={() => {
          setTableQrOpen(false);
          setDeckManagerTab('share');
        }}
      />

      {/* Cloud Auth Modal */}
      <AuthModal
        open={authModalOpen}
        isConfigured={cloudAuth.isConfigured}
        currentUser={cloudAuth.user}
        loading={cloudAuth.authLoading || cloudAuth.profileLoading}
        error={cloudAuth.error}
        onClose={() => {
          setAuthModalOpen(false);
          cloudAuth.clearError();
        }}
        onClearError={cloudAuth.clearError}
        onSignInWithEmail={cloudAuth.signInWithEmail}
        onSignUpWithEmail={cloudAuth.signUpWithEmail}
        onSignInWithGoogle={cloudAuth.signInWithGoogle}
        onSendPasswordReset={cloudAuth.sendPasswordReset}
        onResendVerification={cloudAuth.resendVerificationEmail}
        onRefreshVerification={cloudAuth.refreshVerificationStatus}
        onSignOut={async () => {
          await cloudSync.signOutWithCleanup(false);
          setAuthModalOpen(false);
        }}
      />

      {/* Cloud Account & Backup Modal */}
      {cloudAuth.user && (
        <AccountModal
          open={accountModalOpen}
          user={cloudAuth.user}
          profile={cloudAuth.profile}
          syncStatus={cloudSync.overallSyncStatus}
          pendingCount={cloudSync.pendingCount}
          syncedDeckCount={cloudSync.syncedDeckCount}
          cardListCount={cloudSync.cardListCount}
          lastSyncedAt={cloudSync.lastSyncedAt}
          isSyncing={cloudSync.isSyncing}
          error={cloudSync.syncError ?? cloudAuth.error}
          onClose={() => {
            setAccountModalOpen(false);
            cloudAuth.clearError();
            cloudSync.clearSyncError();
          }}
          onSyncNow={async () => {
            await cloudSync.syncNow();
          }}
          onUpdateHandle={(newHandle, displayName) =>
            cloudAuth.updateHandle(newHandle, displayName)
          }
          onExportData={handleExportAccountData}
          onSignOut={handleSignOutAccount}
          onDeleteAccount={handleDeleteAccount}
        />
      )}

      {/* Friends & Shared Decks Modal */}
      <FriendsModal
        open={friendsModalOpen}
        currentUser={cloudAuth.user}
        currentProfile={cloudAuth.profile}
        friendships={friends.friendships}
        friendDecksByUid={friends.friendDecksByUid}
        loading={friends.loading}
        busyId={friends.busyPairId}
        error={friends.error}
        prefillFriendHandle={pendingFriendHandle}
        commanderNamesById={commanderNamesById}
        onClose={() => {
          setFriendsModalOpen(false);
          setPendingFriendHandle(null);
          friends.clearError();
        }}
        onOpenAuth={() => {
          cloudAuth.activateCloud();
          setFriendsModalOpen(false);
          cloudAuth.clearError();
          setAuthModalOpen(true);
        }}
        onSendFriendRequest={friends.sendFriendRequest}
        onAcceptFriendRequest={friends.acceptFriendRequest}
        onRemoveFriendship={friends.removeFriendship}
        onLoadFriendDecks={friends.loadFriendDecks}
        onOpenSharedDeck={async (deckId) => {
          setFriendsModalOpen(false);
          await openSharedDeckById(deckId);
        }}
        onCloneSharedDeck={handleCloneFriendDeckById}
      />

      {/* Cloud Sync Conflict Resolution Modal */}
      <SyncConflictModal
        conflict={cloudSync.activeConflict}
        resolving={cloudSync.resolvingConflict}
        onResolve={async (resolution) => {
          await cloudSync.resolveActiveConflict(resolution);
        }}
        onClose={cloudSync.dismissActiveConflict}
      />

      {/* Shared Cloud Deck Preview & Clone Banner */}
      <SharedDeckBanner
        sharedDeck={sharedDeck}
        commanders={sharedDeckCommanders}
        loading={sharedDeckLoading}
        error={sharedDeckError}
        onCloneIntoStudio={() => {
          if (sharedDeck) {
            void cloneCloudDeckRecord(sharedDeck);
          }
        }}
        onDismiss={dismissSharedDeckBanner}
      />

      {/* Detailed Card Inspection Modal */}
      <CardDetailModal
        match={inspectedMatch}
        commanders={deck.commanders}
        enforceColorIdentity={deck.lockSearchToCommanderIdentity}
        quantityInDeck={inspectedMatch ? getCardQuantity(inspectedMatch.card.id) : 0}
        isCommander={inspectedMatch ? isCommander(inspectedMatch.card.id) : false}
        onClose={() => setInspectedMatch(null)}
        onAddCard={addCard}
        onRemoveOneCard={removeOneCard}
        onSetCommander={handleSetCommander}
        onAddPartner={handleAddPartner}
        onFilterByRole={handleFilterByRole}
        onFilterByTheme={handleFilterByTheme}
        onFindSimilar={handleFindSimilar}
      />

      {/* Action Feedback Toast */}
      {activeNotice && (
        <div
          role="status"
          className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-medium shadow-xl backdrop-blur ${
            activeNotice.isError
              ? 'border-rose-500/40 bg-rose-950/95 text-rose-100'
              : 'border-emerald-500/40 bg-slate-900/95 text-emerald-100'
          }`}
        >
          {activeNotice.isError ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          )}
          <span>{activeNotice.message}</span>
          <button
            type="button"
            onClick={() => {
              setCloudNotice(null);
              clearNotice();
            }}
            aria-label="Dismiss notification"
            className="ml-1 rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      </div>

      <LegalFooter />
    </div>
  );
}

export default App;
