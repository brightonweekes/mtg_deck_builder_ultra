import {
  ArrowRight,
  Check,
  Crown,
  Dices,
  Layers,
  LayoutDashboard,
  Plus,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ROLE_TARGETS, type DeckAnalyticsReport } from '../deck/deckAnalytics.js';
import type { SavedDeckRecord } from '../db/cardDb.js';
import {
  canAddCardToDeck,
  canPairCommanders,
  getCombinedColorIdentity,
} from '../search/commanderRules.js';
import { extractRippleProfile } from '../search/rippleEngine.js';
import type { CompactCard, FunctionalRole } from '../types/card.js';
import type { DeckDraft } from '../types/deck.js';
import {
  DEFAULT_SEARCH_FILTER,
  type ScoredCardMatch,
  type SearchFilter,
  type SearchResponsePayload,
} from '../types/search.js';
import { ColorIdentityBadges, ManaCostDisplay } from './ManaSymbol.js';
import { SAMPLE_COMMANDERS } from './QuickStartBanner.js';

const RE_BASIC_LAND_TYPE = /\bbasic\b.*\bland\b/i;
const CORE_GAP_ROLES: readonly FunctionalRole[] = ['draw', 'ramp', 'removal', 'wipe'];
const LAND_TARGET_MIN = ROLE_TARGETS.find((t) => t.role === 'lands')?.targetMin ?? 34;

export type BiggestDeckGap =
  | { kind: 'commander'; label: string }
  | { kind: 'role'; role: FunctionalRole | 'lands'; deficit: number; label: string }
  | { kind: 'synergy'; remainingSlots: number; label: string }
  | { kind: 'audit'; label: string };

/**
 * Builds the worker search filter used on Home (and when expanding into Catalog)
 * to fetch top algorithmic synergies for any Commander or non-Commander card.
 */
export function buildHomeSynergyFilter(
  seedCard: CompactCard,
  activeDeck: DeckDraft,
): SearchFilter {
  const profile = extractRippleProfile([seedCard]);
  const colorIdentity = seedCard.isCommanderEligible
    ? [...seedCard.colorIdentity]
    : activeDeck.lockSearchToCommanderIdentity && activeDeck.commanders.length > 0
      ? getCombinedColorIdentity(activeDeck.commanders)
      : null;

  return {
    ...DEFAULT_SEARCH_FILTER,
    colorIdentity,
    commanderOnly: false,
    partnerType: null,
    rippleSeedIds: [seedCard.id],
    rippleMode: 'all',
    rippleHookKey: null,
    themes: profile.defaultThemes,
    themeQuery: '',
    excludeCardIds: [seedCard.id],
    sortBy: 'synergy',
    page: 1,
    pageSize: 16,
  };
}

/**
 * Filters out basic lands, the seed card itself (including alternate printings sharing
 * oracleId), and duplicate printings, returning up to `limit` top synergy matches.
 */
export function selectTopSynergyMatches(
  matches: readonly ScoredCardMatch[],
  seedCard: CompactCard,
  limit = 4,
): ScoredCardMatch[] {
  if (limit <= 0 || matches.length === 0) return [];

  const seenIds = new Set<string>([seedCard.id]);
  const seenOracleIds = new Set<string>();
  if (seedCard.oracleId) {
    seenOracleIds.add(seedCard.oracleId);
  }

  const out: ScoredCardMatch[] = [];
  for (const match of matches) {
    const { card } = match;
    if (RE_BASIC_LAND_TYPE.test(card.typeLine)) continue;
    if (seenIds.has(card.id)) continue;
    if (card.oracleId && seenOracleIds.has(card.oracleId)) continue;

    seenIds.add(card.id);
    if (card.oracleId) seenOracleIds.add(card.oracleId);
    out.push(match);
    if (out.length >= limit) break;
  }

  return out;
}

/**
 * Shows the bottom Active Deck bar only when the user has started a deck or has saved progress.
 */
export function shouldShowActiveDeckBar(
  deck: DeckDraft,
  savedDecks: readonly SavedDeckRecord[],
): boolean {
  if (deck.commanders.length > 0) return true;
  if (Object.values(deck.mainboard).some((entry) => entry.quantity > 0)) return true;
  if (Object.values(deck.sideboard).some((entry) => entry.quantity > 0)) return true;
  if (savedDecks.length > 1) return true;
  return savedDecks.some(
    (d) =>
      d.commanderIds.length > 0 ||
      Object.values(d.mainboard).some((qty) => qty > 0) ||
      Object.values(d.sideboard).some((qty) => qty > 0),
  );
}

/**
 * Identifies the single highest-priority next action for the active deck on the Home bar.
 */
export function computeBiggestDeckGap(
  deck: DeckDraft,
  analytics: DeckAnalyticsReport,
): BiggestDeckGap {
  if (deck.commanders.length === 0) {
    return { kind: 'commander', label: 'Pick a Commander in Catalog →' };
  }

  let topRole: FunctionalRole | null = null;
  let topRoleDeficit = 0;
  let topRoleLabel = '';

  for (const role of CORE_GAP_ROLES) {
    const target = ROLE_TARGETS.find((t) => t.role === role);
    if (!target) continue;
    const count = analytics.roleCounts[role] ?? 0;
    const deficit = target.targetMin - count;
    if (deficit > topRoleDeficit) {
      topRole = role;
      topRoleDeficit = deficit;
      topRoleLabel = role === 'removal' ? 'Removal' : target.label;
    }
  }

  if (topRole && topRoleDeficit > 0) {
    return {
      kind: 'role',
      role: topRole,
      deficit: topRoleDeficit,
      label: `Fix Biggest Gap: +${topRoleDeficit} ${topRoleLabel} →`,
    };
  }

  const landDeficit = LAND_TARGET_MIN - (analytics.roleCounts.lands ?? 0);
  if (landDeficit > 0) {
    return {
      kind: 'role',
      role: 'lands',
      deficit: landDeficit,
      label: `Fix Biggest Gap: +${landDeficit} Lands →`,
    };
  }

  if (analytics.totalCount < 100) {
    const remainingSlots = 100 - analytics.totalCount;
    return {
      kind: 'synergy',
      remainingSlots,
      label: `Find Synergies (${remainingSlots} slots left) →`,
    };
  }

  return { kind: 'audit', label: 'Run 99 Audit →' };
}

function formatPriceUsd(priceUsd: number | null): string {
  return typeof priceUsd === 'number' && Number.isFinite(priceUsd)
    ? `$${priceUsd.toFixed(2)}`
    : '—';
}

export interface HomeLandingViewProps {
  deck: DeckDraft;
  savedDecks: readonly SavedDeckRecord[];
  analytics: DeckAnalyticsReport;
  totalCardCount: number;
  syncReady: boolean;
  initialSelectedCard?: CompactCard | null;
  initialSynergyMatches?: readonly ScoredCardMatch[];
  resolveCards: (req: {
    ids?: string[];
    names?: string[];
  }) => Promise<{ byId: Record<string, CompactCard>; byName: Record<string, CompactCard> }>;
  runOneOffSearch: (filter: SearchFilter) => Promise<SearchResponsePayload>;
  getCardQuantity: (cardId: string) => number;
  isCommander: (cardId: string) => boolean;
  onSetCommander: (card: CompactCard) => void;
  onAddPartner: (card: CompactCard) => void;
  onAddCard: (card: CompactCard) => void;
  onInspectCard: (card: CompactCard) => void;
  onExploreSynergiesInCatalog: (card: CompactCard) => void;
  onSearchQueryInCatalog: (query: string) => void;
  onQuickFilterRole: (role: FunctionalRole | 'lands') => void;
  onChooseCommander: () => void;
  onOpenStudio: () => void;
  onOpenAudit: () => void;
  onSwitchDeck: (deckId: string) => void;
}

export function HomeLandingView({
  deck,
  savedDecks,
  analytics,
  totalCardCount,
  syncReady,
  initialSelectedCard,
  initialSynergyMatches,
  resolveCards,
  runOneOffSearch,
  getCardQuantity,
  isCommander,
  onSetCommander,
  onAddPartner,
  onAddCard,
  onInspectCard,
  onExploreSynergiesInCatalog,
  onSearchQueryInCatalog,
  onQuickFilterRole,
  onChooseCommander,
  onOpenStudio,
  onOpenAudit,
  onSwitchDeck,
}: HomeLandingViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [autocompleteMatches, setAutocompleteMatches] = useState<ScoredCardMatch[]>([]);
  const [isAutocompleting, setIsAutocompleting] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const [selectedCard, setSelectedCard] = useState<CompactCard | null>(
    () => initialSelectedCard ?? null,
  );
  const [synergyMatches, setSynergyMatches] = useState<ScoredCardMatch[]>(() =>
    initialSynergyMatches ? [...initialSynergyMatches] : [],
  );
  const [synergyLoading, setSynergyLoading] = useState(false);
  const [pickingSampleName, setPickingSampleName] = useState<string | null>(null);
  const [pickingSurprise, setPickingSurprise] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchReqIdRef = useRef(0);
  const synergyReqIdRef = useRef(0);
  const surprisePoolRef = useRef<CompactCard[] | null>(null);
  const autoInitializedRef = useRef(initialSelectedCard !== undefined);

  const loadSynergiesForCard = useCallback(
    async (card: CompactCard) => {
      const reqId = ++synergyReqIdRef.current;
      setSelectedCard(card);
      setStatusMessage(null);
      setSynergyLoading(true);
      try {
        const res = await runOneOffSearch(buildHomeSynergyFilter(card, deck));
        if (synergyReqIdRef.current !== reqId) return;
        setSynergyMatches(res.matches);
      } catch {
        if (synergyReqIdRef.current !== reqId) return;
        setSynergyMatches([]);
        setStatusMessage(`Could not load synergies for ${card.name} right now.`);
      } finally {
        if (synergyReqIdRef.current === reqId) {
          setSynergyLoading(false);
        }
      }
    },
    [deck, runOneOffSearch],
  );

  // Focus Home search input when pressing '/' outside form controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Close search autocomplete dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [dropdownOpen]);

  // Seed default card once catalog finishes syncing (Active Commander or Meren fallback)
  useEffect(() => {
    if (!syncReady || autoInitializedRef.current) return;
    autoInitializedRef.current = true;

    const activeCommander = deck.commanders[0];
    if (activeCommander) {
      void loadSynergiesForCard(activeCommander);
      return;
    }

    let cancelled = false;
    const defaultName = 'Meren of Clan Nel Toth';
    void resolveCards({ names: [defaultName] })
      .then(({ byName }) => {
        if (cancelled) return;
        const resolved = byName[defaultName.toLowerCase()];
        if (resolved) {
          void loadSynergiesForCard(resolved);
        }
      })
      .catch(() => {
        // Non-fatal: user can search or click any sample pill
      });

    return () => {
      cancelled = true;
    };
  }, [deck.commanders, loadSynergiesForCard, resolveCards, syncReady]);

  // Debounced live autocomplete search in the single spotlight bar
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!syncReady || trimmed.length < 2) {
      setAutocompleteMatches([]);
      setIsAutocompleting(false);
      setHighlightedIndex(-1);
      return;
    }

    const reqId = ++searchReqIdRef.current;
    setIsAutocompleting(true);

    const timer = window.setTimeout(() => {
      void runOneOffSearch({
        ...DEFAULT_SEARCH_FILTER,
        query: trimmed,
        page: 1,
        pageSize: 6,
      })
        .then((res) => {
          if (searchReqIdRef.current !== reqId) return;
          setAutocompleteMatches(res.matches);
          setHighlightedIndex(-1);
        })
        .catch(() => {
          if (searchReqIdRef.current !== reqId) return;
          setAutocompleteMatches([]);
        })
        .finally(() => {
          if (searchReqIdRef.current === reqId) {
            setIsAutocompleting(false);
          }
        });
    }, 60);

    return () => {
      window.clearTimeout(timer);
    };
  }, [runOneOffSearch, searchQuery, syncReady]);

  const handleSelectAutocompleteCard = useCallback(
    (card: CompactCard) => {
      setSearchQuery(card.name);
      setDropdownOpen(false);
      setHighlightedIndex(-1);
      void loadSynergiesForCard(card);
    },
    [loadSynergiesForCard],
  );

  const handlePickSample = useCallback(
    async (presetName: string) => {
      if (!syncReady || pickingSampleName !== null || pickingSurprise) return;
      setPickingSampleName(presetName);
      setStatusMessage(null);
      setDropdownOpen(false);
      try {
        const { byName } = await resolveCards({ names: [presetName] });
        const resolved = byName[presetName.toLowerCase()];
        if (!resolved) {
          setStatusMessage(`Could not find ${presetName} in the local catalog yet.`);
          return;
        }
        setSearchQuery(resolved.name);
        await loadSynergiesForCard(resolved);
      } catch {
        setStatusMessage(`Could not load ${presetName}. Please try again.`);
      } finally {
        setPickingSampleName(null);
      }
    },
    [loadSynergiesForCard, pickingSampleName, pickingSurprise, resolveCards, syncReady],
  );

  const handleSurpriseMe = useCallback(async () => {
    if (!syncReady || pickingSurprise || pickingSampleName !== null) return;
    setPickingSurprise(true);
    setStatusMessage(null);
    setDropdownOpen(false);

    try {
      let pool = surprisePoolRef.current;
      if (!pool || pool.length === 0) {
        const res = await runOneOffSearch({
          ...DEFAULT_SEARCH_FILTER,
          commanderOnly: true,
          sortBy: 'edhrec',
          page: 1,
          pageSize: 40,
        });
        pool = res.matches.map((m) => m.card);
        if (pool.length > 0) {
          surprisePoolRef.current = pool;
        }
      }

      if (!pool || pool.length === 0) {
        setStatusMessage('Catalog is still syncing — try Surprise Me again in a moment.');
        return;
      }

      const candidates =
        selectedCard && pool.length > 1
          ? pool.filter((c) => c.id !== selectedCard.id)
          : pool;
      const pick = candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0]!;
      setSearchQuery(pick.name);
      await loadSynergiesForCard(pick);
    } catch {
      setStatusMessage('Could not pick a random Commander right now.');
    } finally {
      setPickingSurprise(false);
    }
  }, [loadSynergiesForCard, pickingSampleName, pickingSurprise, runOneOffSearch, selectedCard, syncReady]);

  const topSynergyMatches = useMemo(() => {
    if (!selectedCard) return [];
    return selectTopSynergyMatches(synergyMatches, selectedCard, 4);
  }, [selectedCard, synergyMatches]);

  const showActiveDeckBar = useMemo(
    () => shouldShowActiveDeckBar(deck, savedDecks),
    [deck, savedDecks],
  );

  const biggestGap = useMemo(
    () => computeBiggestDeckGap(deck, analytics),
    [analytics, deck],
  );

  const handleGapAction = useCallback(() => {
    switch (biggestGap.kind) {
      case 'commander':
        onChooseCommander();
        break;
      case 'role':
        onQuickFilterRole(biggestGap.role);
        break;
      case 'synergy':
        if (deck.commanders[0]) {
          onExploreSynergiesInCatalog(deck.commanders[0]);
        } else {
          onOpenStudio();
        }
        break;
      case 'audit':
        onOpenAudit();
        break;
    }
  }, [
    biggestGap,
    deck.commanders,
    onChooseCommander,
    onExploreSynergiesInCatalog,
    onOpenAudit,
    onOpenStudio,
    onQuickFilterRole,
  ]);

  const selectedQuantity = selectedCard ? getCardQuantity(selectedCard.id) : 0;
  const selectedInCommandZone = selectedCard ? isCommander(selectedCard.id) : false;
  const selectedCanPair = Boolean(
    selectedCard &&
      deck.commanders.length === 1 &&
      !selectedInCommandZone &&
      canPairCommanders(deck.commanders[0]!, selectedCard),
  );
  const selectedAddCheck = selectedCard
    ? canAddCardToDeck(
        selectedCard,
        selectedQuantity,
        deck.commanders,
        deck.lockSearchToCommanderIdentity,
      )
    : null;

  const trimmedQuery = searchQuery.trim();
  const showDropdown = dropdownOpen && trimmedQuery.length >= 2;

  return (
    <main
      aria-label="Ripple99 Home"
      className="relative mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:py-12"
    >
      {/* Subtle Ambient Backdrop Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-72 max-w-3xl rounded-full bg-gradient-to-r from-violet-600/12 via-amber-500/10 to-cyan-500/12 blur-3xl"
      />

      {/* Hero Spotlight Search */}
      <section className="mx-auto flex w-full max-w-2xl flex-col items-center text-center">
        <h2 className="text-2xl font-bold tracking-tight text-slate-100 sm:text-4xl">
          Search Any Card. See Its Top Synergies.
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Pick a Commander, staple, or pet card to preview its highest-synergy matches right here.
        </p>

        {/* Single Unified Search Bar */}
        <div ref={searchContainerRef} className="relative mt-6 w-full text-left">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onFocus={() => setDropdownOpen(true)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setDropdownOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setDropdownOpen(false);
                setHighlightedIndex(-1);
                return;
              }
              if (e.key === 'ArrowDown' && autocompleteMatches.length > 0) {
                e.preventDefault();
                setDropdownOpen(true);
                setHighlightedIndex((prev) =>
                  prev + 1 >= autocompleteMatches.length ? 0 : prev + 1,
                );
                return;
              }
              if (e.key === 'ArrowUp' && autocompleteMatches.length > 0) {
                e.preventDefault();
                setDropdownOpen(true);
                setHighlightedIndex((prev) =>
                  prev <= 0 ? autocompleteMatches.length - 1 : prev - 1,
                );
                return;
              }
              if (e.key === 'Enter' && trimmedQuery.length > 0) {
                e.preventDefault();
                if (highlightedIndex >= 0 && autocompleteMatches[highlightedIndex]) {
                  handleSelectAutocompleteCard(autocompleteMatches[highlightedIndex]!.card);
                  return;
                }
                const exactMatch = autocompleteMatches.find(
                  (m) => m.card.name.toLowerCase() === trimmedQuery.toLowerCase(),
                );
                if (exactMatch) {
                  handleSelectAutocompleteCard(exactMatch.card);
                  return;
                }
                setDropdownOpen(false);
                onSearchQueryInCatalog(trimmedQuery);
              }
            }}
            placeholder="Search any Commander, card name, or oracle text... (press /)"
            aria-label="Search any card or oracle text"
            className="w-full rounded-2xl border border-slate-700/90 bg-slate-900/95 py-3.5 pl-12 pr-11 text-sm text-slate-100 placeholder-slate-500 shadow-xl shadow-slate-950/60 outline-none ring-1 ring-violet-500/20 transition focus:border-amber-400 focus:ring-amber-400/30 sm:text-base"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setAutocompleteMatches([]);
                setDropdownOpen(false);
                searchInputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {/* Live Search Autocomplete Dropdown */}
          {showDropdown && (
            <div
              role="listbox"
              aria-label="Matching cards"
              className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/98 shadow-2xl backdrop-blur"
            >
              {isAutocompleting && autocompleteMatches.length === 0 ? (
                <div className="px-4 py-3 text-xs text-slate-400">Searching cards...</div>
              ) : autocompleteMatches.length === 0 ? (
                <div className="px-4 py-3 text-xs text-slate-400">
                  No direct matches for &ldquo;{trimmedQuery}&rdquo;.
                </div>
              ) : (
                <ul className="divide-y divide-slate-800/70">
                  {autocompleteMatches.map(({ card }, index) => {
                    const isHighlighted = index === highlightedIndex;
                    return (
                      <li key={card.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectAutocompleteCard(card)}
                          className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                            isHighlighted
                              ? 'bg-slate-800 text-white'
                              : 'hover:bg-slate-800/70'
                          }`}
                        >
                          {card.imageSmall ? (
                            <img
                              src={card.imageSmall}
                              alt=""
                              className="h-10 w-7 shrink-0 rounded object-cover"
                            />
                          ) : (
                            <div className="h-10 w-7 shrink-0 rounded bg-slate-800" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold text-slate-100">
                                {card.name}
                              </span>
                              {card.isCommanderEligible && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200 ring-1 ring-amber-400/35">
                                  <Crown className="h-2.5 w-2.5" />
                                  Commander
                                </span>
                              )}
                            </div>
                            <p className="truncate text-xs text-slate-400">{card.typeLine}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2.5">
                            <ManaCostDisplay manaCost={card.manaCost} size="xs" />
                            <span className="w-12 text-right font-mono text-xs text-slate-400">
                              {formatPriceUsd(card.priceUsd)}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  onSearchQueryInCatalog(trimmedQuery);
                }}
                className="flex w-full items-center justify-center gap-1.5 border-t border-slate-800 bg-slate-950/70 px-4 py-2.5 text-xs font-semibold text-amber-300 transition hover:bg-slate-950 hover:text-amber-200"
              >
                <span>View all matches in Catalog</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Sample Commander Pills + Surprise Me */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {SAMPLE_COMMANDERS.map((preset) => {
            const isActive =
              selectedCard?.name.toLowerCase() === preset.name.toLowerCase();
            const isLoading = pickingSampleName === preset.name;
            const shortLabel = preset.name.split(',')[0];
            return (
              <button
                key={preset.name}
                type="button"
                disabled={!syncReady || pickingSampleName !== null || pickingSurprise}
                onClick={() => void handlePickSample(preset.name)}
                title={`Preview ${preset.name} (${preset.archetype})`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition disabled:opacity-50 ${
                  isActive
                    ? 'border-amber-400/70 bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/30'
                    : 'border-slate-700/80 bg-slate-900/80 text-slate-300 hover:border-violet-400/60 hover:text-white'
                }`}
              >
                <ColorIdentityBadges colors={preset.colors} size="xs" />
                <span>{isLoading ? 'Loading...' : shortLabel}</span>
              </button>
            );
          })}

          <button
            type="button"
            disabled={!syncReady || pickingSampleName !== null || pickingSurprise}
            onClick={() => void handleSurpriseMe()}
            title="Pick a random Commander and preview its top synergies"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/80 px-3 py-1 text-xs font-medium text-slate-300 transition hover:border-amber-400/60 hover:text-amber-200 disabled:opacity-50"
          >
            <Dices className="h-3.5 w-3.5 text-violet-300" />
            <span>{pickingSurprise ? 'Picking...' : 'Surprise Me'}</span>
          </button>
        </div>

        {statusMessage && (
          <p className="mt-2.5 text-xs text-amber-300" role="status">
            {statusMessage}
          </p>
        )}
      </section>

      {/* Single "Top Synergies" Panel */}
      <section
        aria-label="Top Synergies"
        className="rounded-2xl border border-slate-800/90 bg-slate-900/80 p-4 shadow-xl sm:p-6"
      >
        {!selectedCard ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-center">
            <Sparkles className="h-6 w-6 text-violet-300" />
            <p className="text-sm font-medium text-slate-200">
              {syncReady
                ? 'Search any card or click a Commander above to see its top synergies.'
                : 'Loading local card catalog...'}
            </p>
            <p className="text-xs text-slate-400">
              Works with Commanders, staples, or build-around cards in your collection.
            </p>
          </div>
        ) : (
          <>
            {/* Selected Card Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
              <div className="flex min-w-0 items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => onInspectCard(selectedCard)}
                  className="mtg-card-corners group relative h-16 w-12 shrink-0 overflow-hidden border border-slate-700 bg-slate-950"
                  title={`Inspect ${selectedCard.name}`}
                >
                  {selectedCard.imageSmall || selectedCard.imageNormal ? (
                    <img
                      src={selectedCard.imageSmall || selectedCard.imageNormal}
                      alt={selectedCard.name}
                      className="h-full w-full scale-[1.015] object-cover object-top transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center p-1 text-center text-[9px] text-slate-500">
                      {selectedCard.name}
                    </div>
                  )}
                </button>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onInspectCard(selectedCard)}
                      className="truncate text-left text-base font-bold text-slate-100 transition hover:text-amber-200 sm:text-lg"
                    >
                      {selectedCard.name}
                    </button>
                    {selectedCard.manaCost ? (
                      <ManaCostDisplay manaCost={selectedCard.manaCost} size="sm" />
                    ) : (
                      <ColorIdentityBadges colors={selectedCard.colorIdentity} size="xs" />
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Top Algorithmic Synergy Matches
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedCard.isCommanderEligible ? (
                  selectedInCommandZone ? (
                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200">
                      <Crown className="h-3.5 w-3.5 text-emerald-300" />
                      In Command Zone
                    </span>
                  ) : (
                    <>
                      {selectedCanPair && (
                        <button
                          type="button"
                          onClick={() => onAddPartner(selectedCard)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/50 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/25"
                        >
                          <Users className="h-3.5 w-3.5" />
                          Add Partner
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onSetCommander(selectedCard)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950/90 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-amber-400/60 hover:text-amber-200"
                      >
                        <Crown className="h-3.5 w-3.5 text-amber-400" />
                        Set as Commander
                      </button>
                    </>
                  )
                ) : selectedQuantity > 0 && selectedAddCheck && !selectedAddCheck.allowed ? (
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200">
                    <Check className="h-3.5 w-3.5" />
                    In Deck
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={Boolean(selectedAddCheck && !selectedAddCheck.allowed)}
                    title={selectedAddCheck?.reason ?? 'Add to active deck'}
                    onClick={() => onAddCard(selectedCard)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950/90 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-amber-400/60 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5 text-amber-400" />
                    {selectedQuantity > 0 ? `+1 (${selectedQuantity})` : 'Add to Deck'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onExploreSynergiesInCatalog(selectedCard)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950/90 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-violet-400/60 hover:text-violet-200"
                >
                  <span>View All in Catalog</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Single Horizontal Row of Top 4 Synergy Matches */}
            {synergyLoading ? (
              <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }, (_, idx) => (
                  <div
                    key={idx}
                    className="h-52 animate-pulse rounded-xl border border-slate-800 bg-slate-950/60"
                  />
                ))}
              </div>
            ) : topSynergyMatches.length === 0 ? (
              <div className="mt-4 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-800 bg-slate-950/50 px-4 py-8 text-center">
                <p className="text-sm text-slate-300">
                  No direct synergy matches found for {selectedCard.name} with your current deck constraints.
                </p>
                <button
                  type="button"
                  onClick={() => onExploreSynergiesInCatalog(selectedCard)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-violet-300 hover:text-violet-200"
                >
                  <span>Browse full Catalog</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                {topSynergyMatches.map(({ card }) => {
                  const qty = getCardQuantity(card.id);
                  const cardIsCmd = isCommander(card.id);
                  const addCheck = canAddCardToDeck(
                    card,
                    qty,
                    deck.commanders,
                    deck.lockSearchToCommanderIdentity,
                  );

                  return (
                    <article
                      key={card.id}
                      className="group flex flex-col overflow-hidden rounded-xl border border-slate-800/90 bg-slate-950/75 transition hover:border-slate-700"
                    >
                      <button
                        type="button"
                        onClick={() => onInspectCard(card)}
                        className="mtg-card-corners relative aspect-[16/10] w-full overflow-hidden bg-slate-900 text-left"
                      >
                        {card.imageNormal || card.imageSmall ? (
                          <img
                            src={card.imageNormal || card.imageSmall}
                            alt={card.name}
                            loading="lazy"
                            className="h-full w-full scale-[1.015] object-cover object-top transition duration-200 group-hover:scale-[1.04]"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col justify-between bg-gradient-to-br from-slate-900 to-slate-950 p-3">
                            <span className="text-xs font-semibold text-slate-200">
                              {card.name}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {card.typeLine}
                            </span>
                          </div>
                        )}
                      </button>

                      <div className="flex flex-1 flex-col justify-between gap-2.5 p-3">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => onInspectCard(card)}
                            className="block w-full truncate text-left text-sm font-semibold text-slate-100 transition hover:text-amber-200"
                            title={card.name}
                          >
                            {card.name}
                          </button>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <ManaCostDisplay manaCost={card.manaCost} size="xs" />
                            <span className="text-[11px] text-slate-500">
                              {card.typeLine.split('—')[0]?.trim()}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 border-t border-slate-800/70 pt-2">
                          <span className="font-mono text-xs text-slate-400">
                            {formatPriceUsd(card.priceUsd)}
                          </span>

                          {cardIsCmd ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-200 ring-1 ring-amber-400/35">
                              <Crown className="h-3 w-3" />
                              Commander
                            </span>
                          ) : qty > 0 && !addCheck.allowed ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 ring-1 ring-emerald-500/35">
                              <Check className="h-3 w-3" />
                              In Deck
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={!addCheck.allowed}
                              title={addCheck.allowed ? `Add ${card.name} to deck` : addCheck.reason}
                              onClick={() => onAddCard(card)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-100 transition hover:border-amber-400/60 hover:bg-amber-500/15 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Plus className="h-3 w-3" />
                              {qty > 0 ? `+1 (${qty})` : 'Add'}
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      {/* Slim Returning-User Active Deck Bar */}
      {showActiveDeckBar && (
        <section
          aria-label="Active Deck"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800/90 bg-slate-900/80 px-4 py-3 shadow-lg"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <Layers className="h-3.5 w-3.5 text-amber-400" />
              Active Deck
            </span>

            {savedDecks.length > 1 ? (
              <select
                aria-label="Switch active deck"
                value={deck.id}
                onChange={(e) => onSwitchDeck(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs font-semibold text-slate-100 outline-none focus:border-amber-400"
              >
                {savedDecks.map((summary) => (
                  <option key={summary.id} value={summary.id}>
                    {summary.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-semibold text-slate-100">{deck.name}</span>
            )}

            <span className="text-slate-600">·</span>

            <span
              className={`rounded-md px-2 py-0.5 font-mono text-xs font-semibold ${
                totalCardCount === 100
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : totalCardCount > 100
                    ? 'bg-rose-500/20 text-rose-300'
                    : 'bg-slate-800 text-slate-200'
              }`}
            >
              {totalCardCount}/100
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleGapAction}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-amber-400"
            >
              {biggestGap.label}
            </button>

            <button
              type="button"
              onClick={onOpenStudio}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Open Studio
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
