import { AlertTriangle, CheckCircle2, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActiveFilterBar } from './components/ActiveFilterBar.js';
import { CardDetailModal } from './components/CardDetailModal.js';
import { CardGrid } from './components/CardGrid.js';
import { DeckManagerModal, type DeckManagerTab } from './components/DeckManagerModal.js';
import { DeckWorkspace } from './components/DeckWorkspace.js';
import { FilterSidebar } from './components/FilterSidebar.js';
import { HeaderBar } from './components/HeaderBar.js';
import { QuickDeckDrawer } from './components/QuickDeckDrawer.js';
import { generateDeckId } from './db/deckDb.js';
import { computeDeckAnalytics } from './deck/deckAnalytics.js';
import { decodeDeckFromUrlParam } from './deck/urlCodec.js';
import { useCardSearch } from './hooks/useCardSearch.js';
import { useDeckDraft } from './hooks/useDeckDraft.js';
import {
  buildCommanderSynergyQuery,
  getCompatiblePartnerFilter,
} from './search/commanderRules.js';
import type { CompactCard, FunctionalRole, ManaColor } from './types/card.js';
import type { DeckCardEntry, DeckDraft, ViewMode, WorkspaceTab } from './types/deck.js';
import type { ScoredCardMatch } from './types/search.js';

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
  } = useCardSearch();

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
    clearDeck,
    getCardQuantity,
    isCommander,
    createNewDeck,
    switchDeck,
    duplicateCurrentDeck,
    deleteSavedDeck,
    loadDeckDraft,
  } = useDeckDraft();

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('search');
  const [viewMode, setViewMode] = useState<ViewMode>('standard');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [deckDrawerOpen, setDeckDrawerOpen] = useState(false);
  const [deckManagerTab, setDeckManagerTab] = useState<DeckManagerTab | null>(null);
  const [inspectedMatch, setInspectedMatch] = useState<ScoredCardMatch | null>(null);

  const handledShareUrlRef = useRef(false);

  const analytics = useMemo(() => computeDeckAnalytics(deck), [deck]);

  // If a saved deck already has a locked Commander on initial load, mirror its color identity into search
  useEffect(() => {
    if (deck.lockSearchToCommanderIdentity && deck.commanders.length > 0) {
      updateFilter({ colorIdentity: combinedColorIdentity });
    }
    // Intentional mount-only hydration sync
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
    })();
  }, [syncStatus.stage, resolveCards, loadDeckDraft, updateFilter]);

  // Auto-dismiss toast notifications
  useEffect(() => {
    if (!lastNotice) return;
    const timer = window.setTimeout(() => clearNotice(), 3400);
    return () => window.clearTimeout(timer);
  }, [lastNotice, clearNotice]);

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
    (role: FunctionalRole | 'lands') => {
      updateFilter({
        roles: role === 'lands' ? [] : [role],
        cardTypes: role === 'lands' ? ['Land'] : [],
        commanderOnly: false,
        partnerType: null,
        colorIdentity:
          deck.lockSearchToCommanderIdentity && deck.commanders.length > 0
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

  const isReady = syncStatus.stage === 'ready';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <HeaderBar
        query={filter.query}
        onQueryChange={(query) => updateFilter({ query })}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        commanders={deck.commanders}
        totalDeckCards={totalCardCount}
        syncStatus={syncStatus}
        searchResult={searchResult}
        onOpenMobileFilters={() => setMobileFiltersOpen(true)}
        onOpenDeckDrawer={() => setDeckDrawerOpen(true)}
        onOpenDeckManager={() => setDeckManagerTab('decks')}
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
      ) : (
        <DeckWorkspace
          deck={deck}
          analytics={analytics}
          totalDeckPriceUsd={totalDeckPriceUsd}
          combinedColorIdentity={combinedColorIdentity}
          basicLands={basicLands}
          onRenameDeck={renameDeck}
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
          onInspectCard={handleInspectRawCard}
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
        resolveCards={resolveCards}
        onClose={() => setDeckManagerTab(null)}
        onCreateNewDeck={handleCreateNewDeck}
        onSwitchDeck={handleSwitchDeck}
        onDuplicateCurrentDeck={duplicateCurrentDeck}
        onDeleteDeck={deleteSavedDeck}
        onImportDeckDraft={handleImportDeckDraft}
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
      {lastNotice && (
        <div
          role="status"
          className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-medium shadow-xl backdrop-blur ${
            lastNotice.isError
              ? 'border-rose-500/40 bg-rose-950/95 text-rose-100'
              : 'border-emerald-500/40 bg-slate-900/95 text-emerald-100'
          }`}
        >
          {lastNotice.isError ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          )}
          <span>{lastNotice.message}</span>
          <button
            type="button"
            onClick={clearNotice}
            aria-label="Dismiss notification"
            className="ml-1 rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
