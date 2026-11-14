import { describe, expect, it } from 'vitest';
import { exportDeckToText, parseDeckListText } from '../deck/deckSerializer.js';
import { decodeDeckFromUrlParam, encodeDeckToUrlParam } from '../deck/urlCodec.js';
import type { CompactCard } from '../types/card.js';
import type { DeckCardEntry, DeckDraft } from '../types/deck.js';

function makeCard(id: string, name: string, isCommander = false): CompactCard {
  return {
    id,
    oracleId: `oracle-${id}`,
    name,
    manaCost: '{1}',
    cmc: 1,
    typeLine: isCommander ? 'Legendary Creature — Dragon' : 'Artifact',
    oracleText: '',
    colors: [],
    colorIdentity: [],
    keywords: [],
    edhrecRank: 10,
    priceUsd: 2.0,
    imageNormal: '',
    imageSmall: '',
    layout: 'normal',
    isCommanderEligible: isCommander,
    roles: [],
    themes: [],
  };
}

describe('deckSerializer (Moxfield/MTGO text & ?d= URL codec)', () => {
  it('parses Moxfield, Archidekt, and MTGO decklists including set codes, foil flags, and sections', () => {
    const raw = `
      // Name: Jund Treasure Sacrifice
      COMMANDER:
      1 Korvold, Fae-Cursed King (ELD) 329 *F*

      MAINBOARD:
      1x Sol Ring (CMM) 419
      1 Arcane Signet [CMR] 297 #Ramp
      16 Forest (DMU) 281 *F*
      1 Bala Ged Recovery // Bala Ged Sanctuary

      Considering:
      1 Pitiless Plunderer
      SB: 1 Deadly Dispute
    `;

    const parsed = parseDeckListText(raw);
    expect(parsed.name).toBe('Jund Treasure Sacrifice');
    expect(parsed.lines).toEqual([
      { name: 'Korvold, Fae-Cursed King', quantity: 1, section: 'commander' },
      { name: 'Sol Ring', quantity: 1, section: 'mainboard' },
      { name: 'Arcane Signet', quantity: 1, section: 'mainboard' },
      { name: 'Forest', quantity: 16, section: 'mainboard' },
      { name: 'Bala Ged Recovery // Bala Ged Sanctuary', quantity: 1, section: 'mainboard' },
      { name: 'Pitiless Plunderer', quantity: 1, section: 'sideboard' },
      { name: 'Deadly Dispute', quantity: 1, section: 'sideboard' },
    ]);
  });

  it('supports inline *CMDR* markers without explicit section headers', () => {
    const raw = `
      1 Thrasios, Triton Hero *CMDR*
      1 Tymna the Weaver [Commander]
      1 Rhystic Study
    `;
    const parsed = parseDeckListText(raw);
    expect(parsed.lines).toEqual([
      { name: 'Thrasios, Triton Hero', quantity: 1, section: 'commander' },
      { name: 'Tymna the Weaver', quantity: 1, section: 'commander' },
      { name: 'Rhystic Study', quantity: 1, section: 'mainboard' },
    ]);
  });

  it('exports a DeckDraft and round-trips through parseDeckListText', () => {
    const cmd = makeCard('cmd-1', 'Atraxa, Praetors’ Voice', true);
    const sol = makeCard('sol-1', 'Sol Ring');
    const forest = makeCard('for-1', 'Forest');
    const maybe = makeCard('sb-1', 'Doubling Season');

    const draft: DeckDraft = {
      id: 'd1',
      name: 'Superfriends Value',
      commanders: [cmd],
      mainboard: {
        [sol.id]: { card: sol, quantity: 1 },
        [forest.id]: { card: forest, quantity: 10 },
      },
      sideboard: {
        [maybe.id]: { card: maybe, quantity: 1 },
      },
      lockSearchToCommanderIdentity: true,
      createdAt: '2026-11-13T00:00:00.000Z',
      updatedAt: '2026-11-13T00:00:00.000Z',
    };

    const text = exportDeckToText(draft, true);
    expect(text).toContain('// Name: Superfriends Value');
    expect(text).toContain('COMMANDER:\n1 Atraxa, Praetors’ Voice');
    expect(text).toContain('10 Forest');
    expect(text).toContain('SIDEBOARD:\n1 Doubling Season');

    const reparsed = parseDeckListText(text);
    expect(reparsed.name).toBe('Superfriends Value');
    expect(reparsed.lines.find((l) => l.name === 'Forest')?.quantity).toBe(10);
    expect(reparsed.lines.find((l) => l.name === 'Doubling Season')?.section).toBe('sideboard');
  });

  it('binary-packs a full 100-card Scryfall UUID deck into a compact ?d= URL param and decodes cleanly', () => {
    const uuid = (n: number) =>
      `${n.toString(16).padStart(8, '0')}-1111-4444-8888-aaaaaaaaaaaa`;

    const cmd = makeCard(uuid(0), 'Korvold, Fae-Cursed King', true);
    const mainboard: Record<string, DeckCardEntry> = {};
    for (let i = 1; i <= 63; i++) {
      const card = makeCard(uuid(i), `Singleton Card ${i}`);
      mainboard[card.id] = { card, quantity: 1 };
    }
    const swamp = makeCard(uuid(999), 'Swamp');
    mainboard[swamp.id] = { card: swamp, quantity: 36 };
    const sbCard = makeCard(uuid(888), 'Considering Card');

    const draft: DeckDraft = {
      id: 'd-url',
      name: 'Korvold Jund 100',
      commanders: [cmd],
      mainboard,
      sideboard: { [sbCard.id]: { card: sbCard, quantity: 1 } },
      lockSearchToCommanderIdentity: true,
      createdAt: '2026-11-13T00:00:00.000Z',
      updatedAt: '2026-11-13T00:00:00.000Z',
    };

    const param = encodeDeckToUrlParam(draft);
    // 1 cmd + 64 mainboard entries + 1 sideboard entry = ~1,530 chars (binary UUIDs)
    expect(param.length).toBeLessThan(2000);
    expect(param).not.toMatch(/[+/=]/);

    const decoded = decodeDeckFromUrlParam(param);
    expect(decoded).not.toBeNull();
    expect(decoded!.name).toBe('Korvold Jund 100');
    expect(decoded!.commanderIds).toEqual([uuid(0)]);
    expect(decoded!.mainboard.length).toBe(64);
    expect(decoded!.mainboard.find(([id]) => id === uuid(999))?.[1]).toBe(36);
    expect(decoded!.sideboard).toEqual([[uuid(888), 1]]);

    // Corrupted inputs return null gracefully
    expect(decodeDeckFromUrlParam('not-valid-base64!!!')).toBeNull();
    expect(decodeDeckFromUrlParam('')).toBeNull();
  });
});
