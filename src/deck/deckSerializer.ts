import type { DeckCardEntry, DeckDraft } from '../types/deck.js';

export type DeckSection = 'commander' | 'mainboard' | 'sideboard';

export interface ParsedDeckLine {
  name: string;
  quantity: number;
  section: DeckSection;
}

export interface ParsedDeckList {
  name?: string;
  lines: ParsedDeckLine[];
}

const RE_SECTION_HEADER =
  /^(?:\/\/\s*)?(commander|commanders|command zone|mainboard|main deck|main|deck|sideboard|maybeboard|considering)\s*:?\s*$/i;
const RE_NAME_COMMENT = /^\/\/\s*Name\s*:\s*(.+)$/i;
const RE_LEADING_QTY = /^(?:(SB):\s*)?(\d+)x?\s+(.+)$/i;
const RE_CMDR_TAG = /\*CMDR\*|\[(?:commander|cmdr)\]/gi;
const RE_TRAIL_CATEGORY = /\s+(?:#|\^)[^*\n]*$/;
const RE_TRAIL_FOIL_OR_SET =
  /\s*(?:\*[FEACfeac]+\*|\([A-Za-z0-9]{2,6}\)(?:\s+[A-Za-z0-9★-]+)?|\[[A-Za-z0-9]{2,6}\](?:\s+[A-Za-z0-9★-]+)?)\s*$/;

function normalizeSectionHeader(headerWord: string): DeckSection {
  const lower = headerWord.toLowerCase();
  if (lower.startsWith('commander') || lower === 'command zone') return 'commander';
  if (lower === 'sideboard' || lower === 'maybeboard' || lower === 'considering') {
    return 'sideboard';
  }
  return 'mainboard';
}

function stripExportAnnotations(rawName: string): string {
  let clean = rawName.trim();
  clean = clean.replace(RE_TRAIL_CATEGORY, '').trim();
  for (let i = 0; i < 4; i++) {
    const next = clean.replace(RE_TRAIL_FOIL_OR_SET, '').trim();
    if (next === clean) break;
    clean = next;
  }
  return clean;
}

/**
 * Parses standard Commander decklist formats (Moxfield, Archidekt, MTGO) into structured lines.
 */
export function parseDeckListText(rawText: string): ParsedDeckList {
  const result: ParsedDeckList = { lines: [] };
  let activeSection: DeckSection = 'mainboard';

  const rawLines = rawText.split(/\r?\n/);
  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const nameMatch = RE_NAME_COMMENT.exec(trimmed);
    if (nameMatch?.[1]) {
      result.name = nameMatch[1].trim();
      continue;
    }

    const sectionMatch = RE_SECTION_HEADER.exec(trimmed);
    if (sectionMatch?.[1]) {
      activeSection = normalizeSectionHeader(sectionMatch[1]);
      continue;
    }

    if (trimmed.startsWith('//') || trimmed.startsWith('#')) continue;

    let section: DeckSection = activeSection;
    let quantity = 1;
    let body = trimmed;

    const qtyMatch = RE_LEADING_QTY.exec(trimmed);
    if (qtyMatch) {
      if (qtyMatch[1]?.toUpperCase() === 'SB') {
        section = 'sideboard';
      }
      quantity = Math.max(1, Number.parseInt(qtyMatch[2]!, 10));
      body = qtyMatch[3]!;
    } else if (/^SB:\s*/i.test(body)) {
      section = 'sideboard';
      body = body.replace(/^SB:\s*/i, '');
    }

    RE_CMDR_TAG.lastIndex = 0;
    if (RE_CMDR_TAG.test(body)) {
      section = 'commander';
      body = body.replace(RE_CMDR_TAG, ' ');
    }

    const cardName = stripExportAnnotations(body);
    if (!cardName) continue;

    result.lines.push({
      name: cardName,
      quantity,
      section,
    });
  }

  return result;
}

function formatSortedEntries(entries: DeckCardEntry[]): string[] {
  return [...entries]
    .filter((e) => e.quantity > 0)
    .sort((a, b) => a.card.name.localeCompare(b.card.name))
    .map((e) => `${e.quantity} ${e.card.name}`);
}

/**
 * Serializes a DeckDraft into standard Moxfield/MTGO-compatible plain text.
 */
export function exportDeckToText(deck: DeckDraft, includeSideboard = true): string {
  const sections: string[] = [];
  sections.push(`// Name: ${deck.name}`);

  if (deck.commanders.length > 0) {
    sections.push('');
    sections.push('COMMANDER:');
    for (const cmd of deck.commanders) {
      sections.push(`1 ${cmd.name}`);
    }
  }

  const mainLines = formatSortedEntries(Object.values(deck.mainboard));
  if (mainLines.length > 0) {
    sections.push('');
    sections.push('MAINBOARD:');
    sections.push(...mainLines);
  }

  if (includeSideboard) {
    const sbLines = formatSortedEntries(Object.values(deck.sideboard));
    if (sbLines.length > 0) {
      sections.push('');
      sections.push('SIDEBOARD:');
      sections.push(...sbLines);
    }
  }

  return sections.join('\n');
}
