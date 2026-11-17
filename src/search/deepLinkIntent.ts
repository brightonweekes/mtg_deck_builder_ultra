import type { RippleMode } from '../types/search.js';

export type AppLaunchTool = 'audit' | 'budget-swaps' | 'partner' | 'ripple';

export interface AppLaunchIntent {
  commanderQuery: string | null;
  rippleMode: RippleMode | null;
  themeInput: string | null;
  maxPriceUsd: number | null;
  tool: AppLaunchTool | null;
}

const VALID_RIPPLE_MODES = new Set<RippleMode>([
  'all',
  'enablers',
  'payoffs',
  'hidden-gems',
]);

const TOOL_ALIASES: Readonly<Record<string, AppLaunchTool>> = {
  audit: 'audit',
  'deck-auditor': 'audit',
  'budget-swaps': 'budget-swaps',
  swaps: 'budget-swaps',
  partner: 'partner',
  'partner-finder': 'partner',
  ripple: 'ripple',
  'ripple-synergy': 'ripple',
};

/**
 * Parses deep-link query parameters used by Stage 4 static SEO pages (`/?commander=...`,
 * `/?theme=...&budget=2`, `/?tool=budget-swaps`) into a normalized launch intent.
 */
export function parseAppLaunchIntent(search: string): AppLaunchIntent {
  const empty: AppLaunchIntent = {
    commanderQuery: null,
    rippleMode: null,
    themeInput: null,
    maxPriceUsd: null,
    tool: null,
  };
  if (!search || typeof search !== 'string') return empty;

  try {
    const params = new URLSearchParams(search);
    const commanderQuery = params.get('commander')?.trim() || null;
    const rawMode = params.get('mode')?.trim().toLowerCase() ?? '';
    const rippleMode = VALID_RIPPLE_MODES.has(rawMode as RippleMode)
      ? (rawMode as RippleMode)
      : null;

    const themeInput = params.get('theme')?.trim() || null;

    let maxPriceUsd: number | null = null;
    const rawBudget = params.get('budget')?.trim();
    if (rawBudget) {
      const parsed = Number(rawBudget);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= 10_000) {
        maxPriceUsd = Math.round(parsed * 100) / 100;
      }
    }

    const rawTool = params.get('tool')?.trim().toLowerCase() ?? '';
    const tool = TOOL_ALIASES[rawTool] ?? null;

    return {
      commanderQuery,
      rippleMode,
      themeInput,
      maxPriceUsd,
      tool,
    };
  } catch {
    return empty;
  }
}

export function hasAppLaunchIntent(intent: AppLaunchIntent): boolean {
  return Boolean(
    intent.commanderQuery ||
      intent.themeInput ||
      intent.maxPriceUsd !== null ||
      intent.tool,
  );
}
