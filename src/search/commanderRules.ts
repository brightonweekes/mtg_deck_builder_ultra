import type { CompactCard, ManaColor } from '../types/card.js';
import type { SearchFilter } from '../types/search.js';

const WUBRG_ORDER: readonly ManaColor[] = ['W', 'U', 'B', 'R', 'G'];

/**
 * Returns true if the Commander has a mechanic allowing a second Commander in the Command Zone.
 */
export function canHaveSecondCommander(commander: CompactCard): boolean {
  return commander.isCommanderEligible && commander.partnerType !== undefined;
}

/**
 * Validates whether two cards form a legal 2-commander pair under Commander rules.
 */
export function canPairCommanders(a: CompactCard, b: CompactCard): boolean {
  if (!a.isCommanderEligible || !b.isCommanderEligible) return false;
  if (a.id === b.id || a.name.toLowerCase() === b.name.toLowerCase()) return false;
  if (!a.partnerType || !b.partnerType) return false;

  if (a.partnerType === 'partner' && b.partnerType === 'partner') {
    return true;
  }

  if (a.partnerType === 'friends-forever' && b.partnerType === 'friends-forever') {
    return true;
  }

  if (a.partnerType === 'partner-with' && b.partnerType === 'partner-with') {
    return (
      a.partnerWithName?.toLowerCase() === b.name.toLowerCase() &&
      b.partnerWithName?.toLowerCase() === a.name.toLowerCase()
    );
  }

  if (
    (a.partnerType === 'choose-background' && b.partnerType === 'background') ||
    (a.partnerType === 'background' && b.partnerType === 'choose-background')
  ) {
    return true;
  }

  if (
    (a.partnerType === 'time-lord-doctor' && b.partnerType === 'doctors-companion') ||
    (a.partnerType === 'doctors-companion' && b.partnerType === 'time-lord-doctor')
  ) {
    return true;
  }

  return false;
}

/**
 * Computes the union of color identities across 0, 1, or 2 commanders in canonical WUBRG order.
 */
export function getCombinedColorIdentity(commanders: readonly CompactCard[]): ManaColor[] {
  const present = new Set<ManaColor>();
  for (const cmd of commanders) {
    for (const color of cmd.colorIdentity) {
      present.add(color);
    }
  }
  return WUBRG_ORDER.filter((c) => present.has(c));
}

/**
 * Checks whether a card's color identity fits inside the given Commander color identity.
 */
export function isCardWithinColorIdentity(
  card: CompactCard,
  allowedIdentity: readonly ManaColor[],
): boolean {
  for (const color of card.colorIdentity) {
    if (!allowedIdentity.includes(color)) return false;
  }
  return true;
}

/**
 * Returns the maximum number of copies of a card allowed in a Commander deck.
 */
export function getMaxAllowedCopies(card: CompactCard): number {
  if (card.maxCopies === null) return Infinity;
  if (typeof card.maxCopies === 'number') return card.maxCopies;
  return 1;
}

export interface AddCardCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Validates whether another copy of `card` can be added to the 99 alongside `commanders`.
 */
export function canAddCardToDeck(
  card: CompactCard,
  currentQty: number,
  commanders: readonly CompactCard[],
  enforceColorIdentity = true,
): AddCardCheckResult {
  if (commanders.some((c) => c.id === card.id || c.name === card.name)) {
    return { allowed: false, reason: 'Already in Command Zone' };
  }

  if (enforceColorIdentity && commanders.length > 0) {
    const allowedIdentity = getCombinedColorIdentity(commanders);
    if (!isCardWithinColorIdentity(card, allowedIdentity)) {
      return { allowed: false, reason: 'Outside Commander color identity' };
    }
  }

  const maxAllowed = getMaxAllowedCopies(card);
  if (currentQty >= maxAllowed) {
    return {
      allowed: false,
      reason: maxAllowed === 1 ? 'Singleton limit (1 copy)' : `Max copies (${maxAllowed}) reached`,
    };
  }

  return { allowed: true };
}

/**
 * Builds a Method A theme matcher query string from 1 or 2 Commanders' mechanical tags.
 */
export function buildCommanderSynergyQuery(commanders: readonly CompactCard[]): string {
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const cmd of commanders) {
    for (const theme of cmd.themes) {
      if (!seen.has(theme)) {
        seen.add(theme);
        tags.push(theme);
      }
    }
  }

  for (const cmd of commanders) {
    for (const role of cmd.roles) {
      if (!seen.has(role)) {
        seen.add(role);
        tags.push(role);
      }
    }
  }

  return tags.slice(0, 6).join(' ');
}

/**
 * Returns a SearchFilter patch that filters the catalog to legal second Commanders
 * compatible with the supplied primary Commander, or `null` if none are allowed.
 */
export function getCompatiblePartnerFilter(
  commander: CompactCard,
): Partial<SearchFilter> | null {
  switch (commander.partnerType) {
    case 'partner':
      return { commanderOnly: true, partnerType: 'partner', query: '' };
    case 'friends-forever':
      return { commanderOnly: true, partnerType: 'friends-forever', query: '' };
    case 'choose-background':
      return { commanderOnly: true, partnerType: 'background', query: '' };
    case 'background':
      return { commanderOnly: true, partnerType: 'choose-background', query: '' };
    case 'time-lord-doctor':
      return { commanderOnly: true, partnerType: 'doctors-companion', query: '' };
    case 'doctors-companion':
      return { commanderOnly: true, partnerType: 'time-lord-doctor', query: '' };
    case 'partner-with':
      return {
        commanderOnly: true,
        partnerType: 'partner-with',
        query: commander.partnerWithName ? `"${commander.partnerWithName}"` : '',
      };
    default:
      return null;
  }
}
