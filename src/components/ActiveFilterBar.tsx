import type { ReactNode } from 'react';
import { FileText, Grid2X2, LayoutGrid, X } from 'lucide-react';
import { PARTNER_TYPE_LABELS, ROLE_BY_ID, THEME_BY_ID } from '../config/searchConfig.js';
import { RIPPLE_MODE_META } from '../search/rippleEngine.js';
import type { ViewMode } from '../types/deck.js';
import type { SearchFilter, SearchResponsePayload, SortOption } from '../types/search.js';
import { ColorIdentityBadges, ManaSymbolBadge } from './ManaSymbol.js';

interface ActiveFilterBarProps {
  filter: SearchFilter;
  searchResult: SearchResponsePayload | null;
  isSearching: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onUpdateFilter: (patch: Partial<SearchFilter>) => void;
  onResetFilters: () => void;
}

interface FilterChip {
  key: string;
  label: string;
  content?: ReactNode;
  onRemove: () => void;
}

export function ActiveFilterBar({
  filter,
  searchResult,
  isSearching,
  viewMode,
  onViewModeChange,
  onUpdateFilter,
  onResetFilters,
}: ActiveFilterBarProps) {
  const chips: FilterChip[] = [];

  if (filter.query) {
    chips.push({
      key: 'query',
      label: `Search: "${filter.query}"`,
      onRemove: () => onUpdateFilter({ query: '' }),
    });
  }

  if (filter.rippleSeedIds && filter.rippleSeedIds.length > 0) {
    const modeLabel = RIPPLE_MODE_META[filter.rippleMode ?? 'all'].label;
    chips.push({
      key: 'ripple',
      label: `Ripple: ${modeLabel}`,
      onRemove: () =>
        onUpdateFilter({
          rippleSeedIds: [],
          rippleMode: 'all',
          rippleHookKey: null,
          sortBy: 'edhrec',
        }),
    });
  }

  if (filter.excludeCardIds && filter.excludeCardIds.length > 0) {
    chips.push({
      key: 'excludeDeck',
      label: 'Hiding Deck Cards',
      onRemove: () => onUpdateFilter({ excludeCardIds: [] }),
    });
  }

  if (filter.themeQuery) {
    chips.push({
      key: 'themeQuery',
      label: `Synergy: "${filter.themeQuery}"`,
      onRemove: () => onUpdateFilter({ themeQuery: '' }),
    });
  }

  if (filter.colorIdentity !== null) {
    chips.push({
      key: 'ci',
      label: `Identity: ${filter.colorIdentity.length > 0 ? filter.colorIdentity.join('') : 'Colorless'}`,
      content: (
        <span className="inline-flex items-center gap-1">
          <span>Identity:</span>
          <ColorIdentityBadges colors={filter.colorIdentity} size="xs" />
        </span>
      ),
      onRemove: () => onUpdateFilter({ colorIdentity: null }),
    });
  }

  if (filter.colorlessOnly) {
    chips.push({
      key: 'colorlessOnly',
      label: 'Colors: Colorless Only',
      content: (
        <span className="inline-flex items-center gap-1">
          <span>Colors:</span>
          <ManaSymbolBadge symbol="C" size="xs" />
          <span>Only</span>
        </span>
      ),
      onRemove: () => onUpdateFilter({ colorlessOnly: false }),
    });
  } else if (filter.colors.length > 0) {
    chips.push({
      key: 'colors',
      label: `Colors (${filter.colorMatchMode}): ${filter.colors.join('')}`,
      content: (
        <span className="inline-flex items-center gap-1">
          <span>Colors ({filter.colorMatchMode}):</span>
          <ColorIdentityBadges colors={filter.colors} size="xs" />
        </span>
      ),
      onRemove: () => onUpdateFilter({ colors: [] }),
    });
  }

  for (const role of filter.roles) {
    chips.push({
      key: `role-${role}`,
      label: `Role: ${ROLE_BY_ID[role]?.label ?? role}`,
      onRemove: () => onUpdateFilter({ roles: filter.roles.filter((r) => r !== role) }),
    });
  }

  for (const theme of filter.themes) {
    chips.push({
      key: `theme-${theme}`,
      label: `Mechanic: ${THEME_BY_ID[theme]?.label ?? theme}`,
      onRemove: () =>
        onUpdateFilter({ themes: filter.themes.filter((t) => t !== theme) }),
    });
  }

  for (const typeName of filter.cardTypes) {
    chips.push({
      key: `type-${typeName}`,
      label: `Type: ${typeName}`,
      onRemove: () =>
        onUpdateFilter({ cardTypes: filter.cardTypes.filter((t) => t !== typeName) }),
    });
  }

  for (const sub of filter.subtypes) {
    chips.push({
      key: `sub-${sub}`,
      label: `Subtype: ${sub}`,
      onRemove: () =>
        onUpdateFilter({ subtypes: filter.subtypes.filter((s) => s !== sub) }),
    });
  }

  if (filter.cmcValue !== null) {
    chips.push({
      key: 'cmc',
      label: `MV ${filter.cmcOperator} ${filter.cmcValue}`,
      onRemove: () => onUpdateFilter({ cmcValue: null }),
    });
  }

  if (filter.maxPriceUsd !== null) {
    chips.push({
      key: 'price',
      label: `Price ≤ $${filter.maxPriceUsd}`,
      onRemove: () => onUpdateFilter({ maxPriceUsd: null }),
    });
  }

  if (filter.commanderOnly) {
    chips.push({
      key: 'cmd',
      label: 'Commanders Only',
      onRemove: () => onUpdateFilter({ commanderOnly: false, partnerType: null }),
    });
  }

  if (filter.partnerType) {
    chips.push({
      key: 'partner',
      label: `Pairing: ${PARTNER_TYPE_LABELS[filter.partnerType]}`,
      onRemove: () => onUpdateFilter({ partnerType: null }),
    });
  }

  return (
    <div className="mb-4 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-400">
          {searchResult ? (
            <>
              Showing{' '}
              <span className="font-semibold text-slate-100">
                {searchResult.matches.length}
              </span>{' '}
              of{' '}
              <span className="font-semibold text-slate-100">
                {searchResult.totalMatches.toLocaleString()}
              </span>{' '}
              cards
              {isSearching && (
                <span className="font-mono text-slate-500"> (updating...)</span>
              )}
            </>
          ) : (
            <span>Loading card database...</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Sort cards"
            value={filter.sortBy}
            onChange={(e) => onUpdateFilter({ sortBy: e.target.value as SortOption })}
            className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 outline-none focus:border-amber-400"
          >
            <option value="edhrec">Sort: EDHREC / Synergy</option>
            <option value="synergy">Sort: Synergy Score</option>
            <option value="cmc-asc">Sort: Mana Value Low → High</option>
            <option value="cmc-desc">Sort: Mana Value High → Low</option>
            <option value="price-asc">Sort: Price Low → High</option>
            <option value="price-desc">Sort: Price High → Low</option>
            <option value="name-asc">Sort: Name A → Z</option>
          </select>

          <div
            role="group"
            aria-label="View mode"
            className="inline-flex rounded-lg border border-slate-800 bg-slate-900 p-0.5 text-xs"
          >
            <button
              type="button"
              onClick={() => onViewModeChange('standard')}
              title="Standard card grid"
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 transition ${
                viewMode === 'standard'
                  ? 'bg-slate-800 text-amber-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Grid</span>
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('compact')}
              title="Compact visual grid"
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 transition ${
                viewMode === 'compact'
                  ? 'bg-slate-800 text-amber-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Grid2X2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Compact</span>
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('detailed')}
              title="Detailed card & Oracle text view"
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 transition ${
                viewMode === 'detailed'
                  ? 'bg-slate-800 text-amber-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Text</span>
            </button>
          </div>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onRemove}
              aria-label={`Remove ${chip.label} filter`}
              className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 text-[11px] text-slate-200 transition hover:border-rose-400/60 hover:text-rose-200"
            >
              {chip.content ?? <span>{chip.label}</span>}
              <X className="h-3 w-3 text-slate-400" />
            </button>
          ))}
          <button
            type="button"
            onClick={onResetFilters}
            className="ml-1 text-[11px] font-medium text-slate-400 underline hover:text-slate-200"
          >
            Clear All
          </button>
        </div>
      )}
    </div>
  );
}
