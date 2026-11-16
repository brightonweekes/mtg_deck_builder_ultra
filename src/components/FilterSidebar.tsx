import {
  ChevronDown,
  ChevronRight,
  Crown,
  RotateCcw,
  Sparkles,
  Tag,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  BUDGET_PRESETS,
  CARD_TYPE_OPTIONS,
  CMC_QUICK_PILLS,
  MANA_COLOR_CONFIG,
  PARTNER_TYPE_LABELS,
  POPULAR_SUBTYPES,
  PRESET_THEME_CHIPS,
  ROLE_METADATA,
  THEME_CATEGORIES,
  THEME_METADATA,
} from '../config/searchConfig.js';
import { canHaveSecondCommander, getCombinedColorIdentity } from '../search/commanderRules.js';
import {
  formatRippleThemeLabel,
  resolveCanonicalThemeInput,
} from '../search/rippleEngine.js';
import type { CompactCard, FunctionalRole, ManaColor, PartnerCategory } from '../types/card.js';
import type { CmcOperator, ColorMatchMode, SearchFilter } from '../types/search.js';
import { ColorIdentityBadges, ManaSymbolBadge } from './ManaSymbol.js';

const EXTRA_KEYWORD_SUGGESTIONS = [
  'Deathtouch',
  'Monarch',
  'Goad',
  'Defender',
  'Toxic',
  'Cascade',
  'Convoke',
  'Myriad',
  'Exalted',
  'Madness',
  'Delve',
  'Dungeon',
  'Shrine',
  'Gate',
] as const;

const RIPPLE_SUGGESTION_POOL: ReadonlyArray<{
  id: string;
  label: string;
  kind: 'Mechanic' | 'Tribe' | 'Keyword';
}> = (() => {
  const seen = new Set<string>();
  const items: Array<{ id: string; label: string; kind: 'Mechanic' | 'Tribe' | 'Keyword' }> = [];
  for (const t of THEME_METADATA) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      items.push({ id: t.id, label: t.label, kind: 'Mechanic' });
    }
  }
  for (const sub of POPULAR_SUBTYPES) {
    const id = resolveCanonicalThemeInput(sub);
    if (id && !seen.has(id)) {
      seen.add(id);
      items.push({ id, label: formatRippleThemeLabel(id), kind: 'Tribe' });
    }
  }
  for (const kw of EXTRA_KEYWORD_SUGGESTIONS) {
    const id = resolveCanonicalThemeInput(kw);
    if (id && !seen.has(id)) {
      seen.add(id);
      items.push({ id, label: formatRippleThemeLabel(id), kind: 'Keyword' });
    }
  }
  return items;
})();

function ManaFilterButton({
  symbol,
  label,
  active,
  activeRingClass,
  onClick,
}: {
  symbol: string;
  label: string;
  active: boolean;
  activeRingClass: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-full p-0 transition ${
        active
          ? `scale-105 opacity-100 ring-2 ring-offset-1 ring-offset-slate-950 ${activeRingClass}`
          : 'opacity-45 grayscale-[35%] ring-1 ring-slate-700/80 hover:opacity-85 hover:grayscale-0'
      }`}
    >
      <ManaSymbolBadge symbol={symbol} size="lg" className="!ring-0" />
    </button>
  );
}

interface FilterSidebarProps {
  filter: SearchFilter;
  commanders: readonly CompactCard[];
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onUpdateFilter: (patch: Partial<SearchFilter>) => void;
  onResetFilters: () => void;
  onFindPartner: () => void;
}

export function FilterSidebar({
  filter,
  commanders,
  mobileOpen,
  onCloseMobile,
  onUpdateFilter,
  onResetFilters,
  onFindPartner,
}: FilterSidebarProps) {
  const [colorTab, setColorTab] = useState<'identity' | 'colors'>('identity');
  const [showAllMechanics, setShowAllMechanics] = useState(false);
  const [rippleInput, setRippleInput] = useState('');
  const [rippleFocused, setRippleFocused] = useState(false);
  const [subtypeInput, setSubtypeInput] = useState('');
  const [subtypeFocused, setSubtypeFocused] = useState(false);

  const rippleSuggestions = useMemo(() => {
    const q = rippleInput.trim().toLowerCase();
    const activeSet = new Set(filter.themes);
    return RIPPLE_SUGGESTION_POOL.filter(
      (item) =>
        !activeSet.has(item.id) &&
        (!q ||
          item.label.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q)),
    ).slice(0, 8);
  }, [rippleInput, filter.themes]);

  const subtypeSuggestions = useMemo(() => {
    const q = subtypeInput.trim().toLowerCase();
    const existing = new Set(filter.subtypes.map((s) => s.toLowerCase()));
    return POPULAR_SUBTYPES.filter(
      (sub) => !existing.has(sub.toLowerCase()) && (!q || sub.toLowerCase().includes(q)),
    ).slice(0, 8);
  }, [subtypeInput, filter.subtypes]);

  const toggleColorIdentity = (color: ManaColor) => {
    if (filter.colorIdentity === null) {
      onUpdateFilter({ colorIdentity: [color] });
      return;
    }
    const exists = filter.colorIdentity.includes(color);
    const next = exists
      ? filter.colorIdentity.filter((c) => c !== color)
      : [...filter.colorIdentity, color];
    onUpdateFilter({ colorIdentity: next.length === 0 ? null : next });
  };

  const toggleCardColor = (color: ManaColor) => {
    const exists = filter.colors.includes(color);
    const next = exists ? filter.colors.filter((c) => c !== color) : [...filter.colors, color];
    onUpdateFilter({ colors: next, colorlessOnly: false });
  };

  const toggleRole = (role: FunctionalRole) => {
    const exists = filter.roles.includes(role);
    const next = exists ? filter.roles.filter((r) => r !== role) : [...filter.roles, role];
    onUpdateFilter({ roles: next });
  };

  const applyNextThemes = (nextThemes: string[]) => {
    if (nextThemes.length === 0 && !filter.themeQuery.trim()) {
      onUpdateFilter({
        themes: [],
        rippleSeedIds: [],
        rippleMode: 'all',
        rippleHookKey: null,
        excludeCardIds: [],
        sortBy: filter.sortBy === 'synergy' ? 'edhrec' : filter.sortBy,
      });
      return;
    }
    onUpdateFilter({
      themes: nextThemes,
      rippleHookKey: null,
      sortBy: filter.sortBy === 'edhrec' ? 'synergy' : filter.sortBy,
    });
  };

  const addRippleTheme = (rawOrId: string) => {
    const resolved = rawOrId.startsWith('tribe:') || rawOrId.startsWith('custom:')
      ? rawOrId
      : resolveCanonicalThemeInput(rawOrId);
    if (!resolved) return;
    if (!filter.themes.includes(resolved)) {
      applyNextThemes([...filter.themes, resolved]);
    }
    setRippleInput('');
  };

  const toggleTheme = (themeId: string) => {
    const exists = filter.themes.includes(themeId);
    const next = exists
      ? filter.themes.filter((t) => t !== themeId)
      : [...filter.themes, themeId];
    applyNextThemes(next);
  };

  const togglePresetChip = (chipThemes: readonly string[]) => {
    const allPresent = chipThemes.every((id) => filter.themes.includes(id));
    if (allPresent) {
      applyNextThemes(filter.themes.filter((id) => !chipThemes.includes(id)));
    } else {
      const merged = [...filter.themes];
      for (const id of chipThemes) {
        if (!merged.includes(id)) merged.push(id);
      }
      applyNextThemes(merged);
    }
  };

  const clearAllRippleThemes = () => {
    setRippleInput('');
    onUpdateFilter({
      themes: [],
      themeQuery: '',
      rippleSeedIds: [],
      rippleMode: 'all',
      rippleHookKey: null,
      excludeCardIds: [],
      sortBy: filter.sortBy === 'synergy' ? 'edhrec' : filter.sortBy,
    });
  };

  const toggleCardType = (typeName: string) => {
    const exists = filter.cardTypes.includes(typeName);
    const next = exists
      ? filter.cardTypes.filter((t) => t !== typeName)
      : [...filter.cardTypes, typeName];
    onUpdateFilter({ cardTypes: next });
  };

  const addSubtype = (rawSubtype: string) => {
    const clean = rawSubtype.trim();
    if (!clean) return;
    if (!filter.subtypes.some((s) => s.toLowerCase() === clean.toLowerCase())) {
      onUpdateFilter({ subtypes: [...filter.subtypes, clean] });
    }
    setSubtypeInput('');
  };

  const removeSubtype = (sub: string) => {
    onUpdateFilter({ subtypes: filter.subtypes.filter((s) => s !== sub) });
  };

  const canPair = commanders.length === 1 && canHaveSecondCommander(commanders[0]!);
  const commanderIdentity = getCombinedColorIdentity(commanders);

  const sidebarContent = (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 text-xs">
      {/* Mobile Drawer Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 lg:hidden">
        <span className="text-sm font-bold text-slate-100">Filters &amp; Ripple</span>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close filters"
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 1. Ripple Themes & Mechanics */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-violet-300">
            <Sparkles className="h-3.5 w-3.5" />
            Ripple Themes &amp; Mechanics
          </h2>
          {(filter.themes.length > 0 || filter.themeQuery) && (
            <button
              type="button"
              onClick={clearAllRippleThemes}
              className="text-[11px] text-slate-400 hover:text-slate-200"
            >
              Clear
            </button>
          )}
        </div>

        <div className="relative">
          <input
            type="text"
            value={rippleInput}
            onFocus={() => setRippleFocused(true)}
            onBlur={() => setTimeout(() => setRippleFocused(false), 150)}
            onChange={(e) => setRippleInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && rippleInput.trim()) {
                e.preventDefault();
                addRippleTheme(rippleInput);
              }
            }}
            placeholder='Add mechanic, tribe, or keyword (Enter)'
            aria-label="Add Ripple theme, tribe, or keyword"
            className="w-full rounded-lg border border-violet-500/40 bg-slate-950 px-2.5 py-1.5 pr-7 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-violet-400"
          />
          {rippleInput && (
            <button
              type="button"
              onClick={() => setRippleInput('')}
              aria-label="Clear theme input"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          {rippleFocused && (rippleSuggestions.length > 0 || rippleInput.trim().length >= 2) && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-violet-500/40 bg-slate-900 p-1 shadow-xl">
              {rippleSuggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addRippleTheme(item.id);
                  }}
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs text-slate-200 hover:bg-violet-500/20 hover:text-violet-100"
                >
                  <span>{item.label}</span>
                  <span className="text-[10px] text-slate-400">{item.kind}</span>
                </button>
              ))}
              {rippleInput.trim().length >= 2 &&
                !rippleSuggestions.some(
                  (s) => s.label.toLowerCase() === rippleInput.trim().toLowerCase(),
                ) && (
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addRippleTheme(rippleInput);
                    }}
                    className="flex w-full items-center justify-between rounded border-t border-slate-800 px-2 py-1 text-left text-xs text-violet-200 hover:bg-violet-500/20"
                  >
                    <span>Add &ldquo;{rippleInput.trim()}&rdquo;</span>
                    <span className="text-[10px] text-violet-400">Custom</span>
                  </button>
                )}
            </div>
          )}
        </div>

        {filter.themes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {filter.themes.map((themeId) => {
              const label = formatRippleThemeLabel(themeId);
              return (
                <span
                  key={themeId}
                  className="inline-flex items-center gap-1 rounded-md border border-violet-400/50 bg-violet-500/20 px-2 py-0.5 text-[11px] font-medium text-violet-100"
                >
                  {label}
                  <button
                    type="button"
                    onClick={() => toggleTheme(themeId)}
                    aria-label={`Remove ${label} theme`}
                    className="hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap gap-1">
          {PRESET_THEME_CHIPS.map((chip) => {
            const active =
              chip.themes.length > 0 &&
              chip.themes.every((id) => filter.themes.includes(id));
            return (
              <button
                key={chip.label}
                type="button"
                onClick={() => togglePresetChip(chip.themes)}
                className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
                  active
                    ? 'border-violet-400 bg-violet-500/25 text-violet-100'
                    : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:border-violet-400/50'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setShowAllMechanics((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:border-slate-700 hover:text-white"
        >
          <span className="flex items-center gap-1.5">
            <Tag className="h-3 w-3 text-violet-400" />
            Browse All Mechanics
            {filter.themes.length > 0 && (
              <span className="rounded bg-violet-500/25 px-1.5 text-[10px] text-violet-200">
                {filter.themes.length}
              </span>
            )}
          </span>
          {showAllMechanics ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        {showAllMechanics && (
          <div className="max-h-60 space-y-2.5 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/80 p-2.5">
            {THEME_CATEGORIES.map((group) => (
              <div key={group.category} className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {group.category}
                </p>
                <div className="flex flex-wrap gap-1">
                  {group.themes.map((theme) => {
                    const active = filter.themes.includes(theme.id);
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => toggleTheme(theme.id)}
                        className={`rounded border px-1.5 py-0.5 text-[10px] transition ${
                          active
                            ? 'border-violet-400 bg-violet-500/25 font-semibold text-violet-100'
                            : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        {theme.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2. Commander Color Identity & Card Colors */}
      <section className="space-y-2 border-t border-slate-800/80 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setColorTab('identity')}
              className={`rounded-md px-2 py-0.5 font-medium transition ${
                colorTab === 'identity'
                  ? 'bg-slate-800 text-amber-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Identity Lock
            </button>
            <button
              type="button"
              onClick={() => setColorTab('colors')}
              className={`rounded-md px-2 py-0.5 font-medium transition ${
                colorTab === 'colors'
                  ? 'bg-slate-800 text-sky-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Card Colors
            </button>
          </div>

          {colorTab === 'identity' && filter.colorIdentity !== null && (
            <button
              type="button"
              onClick={() => onUpdateFilter({ colorIdentity: null })}
              className="text-[11px] text-slate-400 underline hover:text-slate-200"
            >
              Unlock
            </button>
          )}
        </div>

        {colorTab === 'identity' ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {MANA_COLOR_CONFIG.map((c) => (
                <ManaFilterButton
                  key={c.code}
                  symbol={c.code}
                  label={`${c.name} (${c.code})`}
                  active={filter.colorIdentity?.includes(c.code) ?? false}
                  activeRingClass="ring-amber-400"
                  onClick={() => toggleColorIdentity(c.code)}
                />
              ))}
              <ManaFilterButton
                symbol="C"
                label="Colorless Identity Only (C)"
                active={filter.colorIdentity !== null && filter.colorIdentity.length === 0}
                activeRingClass="ring-amber-400"
                onClick={() =>
                  onUpdateFilter({
                    colorIdentity:
                      filter.colorIdentity !== null && filter.colorIdentity.length === 0
                        ? null
                        : [],
                  })
                }
              />
            </div>

            {commanders.length > 0 && (
              <button
                type="button"
                onClick={() => onUpdateFilter({ colorIdentity: commanderIdentity })}
                className="inline-flex items-center gap-1.5 text-[11px] text-amber-300/90 hover:text-amber-200"
              >
                <Crown className="h-3 w-3 shrink-0" />
                <span>Sync lock to active Commander</span>
                <ColorIdentityBadges colors={commanderIdentity} size="xs" />
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {MANA_COLOR_CONFIG.map((c) => (
                <ManaFilterButton
                  key={c.code}
                  symbol={c.code}
                  label={`${c.name} (${c.code})`}
                  active={!filter.colorlessOnly && filter.colors.includes(c.code)}
                  activeRingClass="ring-sky-400"
                  onClick={() => toggleCardColor(c.code)}
                />
              ))}
              <ManaFilterButton
                symbol="C"
                label="Colorless Only (C)"
                active={filter.colorlessOnly}
                activeRingClass="ring-sky-400"
                onClick={() =>
                  onUpdateFilter({
                    colorlessOnly: !filter.colorlessOnly,
                    colors: [],
                  })
                }
              />
            </div>

            <select
              aria-label="Color match mode"
              value={filter.colorMatchMode}
              onChange={(e) =>
                onUpdateFilter({ colorMatchMode: e.target.value as ColorMatchMode })
              }
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] text-slate-200"
            >
              <option value="include">Includes selected colors</option>
              <option value="exact">Exact colors only</option>
              <option value="at-most">At most selected colors</option>
            </select>
          </div>
        )}
      </section>

      {/* 3. Functional Roles */}
      <section className="space-y-2 border-t border-slate-800/80 pt-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Functional Roles
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {ROLE_METADATA.map((role) => {
            const active = filter.roles.includes(role.id);
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => toggleRole(role.id)}
                title={role.shortDescription}
                className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
                  active
                    ? role.badgeClass
                    : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-600'
                }`}
              >
                {role.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* 4. Mana Value (CMC) Quick Pills */}
      <section className="space-y-2 border-t border-slate-800/80 pt-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Mana Value (CMC)
          </h2>
          <div className="inline-flex rounded-md border border-slate-800 bg-slate-950 p-0.5 text-[10px]">
            {(['<=', '=', '>='] as const).map((op) => (
              <button
                key={op}
                type="button"
                onClick={() => onUpdateFilter({ cmcOperator: op as CmcOperator })}
                className={`rounded px-1.5 py-0.5 font-mono transition ${
                  filter.cmcOperator === op
                    ? 'bg-amber-500/20 font-bold text-amber-200'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {op === '<=' ? '≤' : op === '>=' ? '≥' : '='}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {CMC_QUICK_PILLS.map((pill) => {
            const isSixPlus = pill.forceOp === '>=';
            const active = isSixPlus
              ? filter.cmcValue === 6 && filter.cmcOperator === '>='
              : filter.cmcValue === pill.value && filter.cmcOperator !== '>=';
            return (
              <button
                key={pill.label}
                type="button"
                onClick={() => {
                  if (active) {
                    onUpdateFilter({ cmcValue: null });
                  } else if (pill.forceOp) {
                    onUpdateFilter({ cmcValue: pill.value, cmcOperator: pill.forceOp });
                  } else {
                    onUpdateFilter({ cmcValue: pill.value });
                  }
                }}
                className={`rounded-md border py-1 text-center font-mono text-[11px] transition ${
                  active
                    ? 'border-amber-400 bg-amber-500/25 font-bold text-amber-100'
                    : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-600'
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* 5. Card Types & Tribal Subtype Selector */}
      <section className="space-y-2 border-t border-slate-800/80 pt-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Card Types &amp; Subtypes
        </h2>
        <div className="flex flex-wrap gap-1">
          {CARD_TYPE_OPTIONS.map((typeName) => {
            const active = filter.cardTypes.includes(typeName);
            return (
              <button
                key={typeName}
                type="button"
                onClick={() => toggleCardType(typeName)}
                className={`rounded-md border px-2 py-0.5 text-[11px] transition ${
                  active
                    ? 'border-amber-400/70 bg-amber-500/20 font-medium text-amber-100'
                    : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-600'
                }`}
              >
                {typeName}
              </button>
            );
          })}
        </div>

        {/* Subtype autocomplete */}
        <div className="relative">
          <input
            type="text"
            value={subtypeInput}
            onFocus={() => setSubtypeFocused(true)}
            onBlur={() => setTimeout(() => setSubtypeFocused(false), 150)}
            onChange={(e) => setSubtypeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSubtype(subtypeInput);
              }
            }}
            placeholder="Add tribe / subtype (Elf, Dragon, Aura...)"
            className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-amber-400"
          />

          {subtypeFocused && subtypeSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl">
              {subtypeSuggestions.map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addSubtype(sub);
                  }}
                  className="block w-full rounded px-2 py-1 text-left text-xs text-slate-200 hover:bg-slate-800"
                >
                  {sub}
                </button>
              ))}
            </div>
          )}
        </div>

        {filter.subtypes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {filter.subtypes.map((sub) => (
              <span
                key={sub}
                className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-200"
              >
                {sub}
                <button
                  type="button"
                  onClick={() => removeSubtype(sub)}
                  aria-label={`Remove subtype ${sub}`}
                  className="hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* 6. Budget & Commander Eligibility */}
      <section className="space-y-2.5 border-t border-slate-800/80 pt-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Budget &amp; Commander
        </h2>

        <div className="flex flex-wrap gap-1">
          {BUDGET_PRESETS.map((preset) => {
            const active = filter.maxPriceUsd === preset.value;
            return (
              <button
                key={preset.value}
                type="button"
                onClick={() =>
                  onUpdateFilter({ maxPriceUsd: active ? null : preset.value })
                }
                className={`rounded-md border px-2 py-0.5 font-mono text-[11px] transition ${
                  active
                    ? 'border-emerald-400 bg-emerald-500/20 font-semibold text-emerald-200'
                    : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-600'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <label className="flex items-center justify-between gap-2 text-slate-300">
          <span>Custom Max USD:</span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={filter.maxPriceUsd ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              onUpdateFilter({ maxPriceUsd: v === '' ? null : Number(v) });
            }}
            placeholder="Any"
            className="w-20 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-right font-mono text-slate-100 placeholder-slate-500"
          />
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-slate-200">
          <input
            type="checkbox"
            checked={filter.commanderOnly}
            onChange={(e) => onUpdateFilter({ commanderOnly: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-950 accent-amber-400"
          />
          <span>Eligible Commanders Only</span>
        </label>

        <select
          aria-label="Partner mechanic filter"
          value={filter.partnerType ?? ''}
          onChange={(e) => {
            const val = e.target.value;
            onUpdateFilter({
              partnerType: val === '' ? null : (val as PartnerCategory),
              commanderOnly: val !== '' ? true : filter.commanderOnly,
            });
          }}
          className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
        >
          <option value="">Any Pairing Mechanic</option>
          {(Object.entries(PARTNER_TYPE_LABELS) as [PartnerCategory, string][]).map(
            ([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ),
          )}
        </select>

        {canPair && (
          <button
            type="button"
            onClick={onFindPartner}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 font-medium text-amber-200 transition hover:bg-amber-500/25"
          >
            <Users className="h-3.5 w-3.5" />
            Find Legal Partner for {commanders[0]!.name.split(',')[0]}
          </button>
        )}
      </section>

      {/* Reset All */}
      <div className="mt-auto border-t border-slate-800/80 pt-3">
        <button
          type="button"
          onClick={onResetFilters}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset All Filters
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Sidebar */}
      <aside className="hidden w-72 shrink-0 border-r border-slate-800/80 bg-slate-900/40 lg:block">
        <div className="sticky top-[57px] h-[calc(100vh-57px)]">{sidebarContent}</div>
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <aside className="relative z-10 h-full w-80 max-w-[85vw] border-r border-slate-800 bg-slate-900 shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
