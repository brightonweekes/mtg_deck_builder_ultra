import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  getManaSymbolSvgSource,
  resolveManaSymbolAsset,
} from '../assets/mana/manaSymbolRegistry.js';
import { ActiveFilterBar } from '../components/ActiveFilterBar.js';
import { DeckWorkspace } from '../components/DeckWorkspace.js';
import { FilterSidebar } from '../components/FilterSidebar.js';
import {
  ColorIdentityBadges,
  ManaCostDisplay,
  ManaSymbolBadge,
  OracleTextDisplay,
} from '../components/ManaSymbol.js';
import { computeDeckAnalytics } from '../deck/deckAnalytics.js';
import type { CompactCard, ManaColor } from '../types/card.js';
import type { DeckDraft } from '../types/deck.js';
import { DEFAULT_SEARCH_FILTER, type SearchFilter } from '../types/search.js';

const DATASET_PATH = path.resolve(process.cwd(), 'public/data/cards.min.json');

function makeCard(overrides: Partial<CompactCard> & { id: string; name: string }): CompactCard {
  return {
    oracleId: overrides.id,
    manaCost: '',
    cmc: 0,
    typeLine: 'Creature — Human Wizard',
    oracleText: '',
    colors: [],
    colorIdentity: [],
    keywords: [],
    edhrecRank: 100,
    priceUsd: 1,
    imageNormal: '',
    imageSmall: '',
    layout: 'normal',
    isCommanderEligible: false,
    roles: [],
    themes: [],
    ...overrides,
  };
}

function decodeSvgDataUri(src: string): string {
  expect(src.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
  return decodeURIComponent(src.slice('data:image/svg+xml;charset=utf-8,'.length));
}

describe('manaSymbolRegistry', () => {
  it('resolves static base, utility, special, hybrid, twobrid, and phyrexian symbols cleanly', () => {
    const vectorTokens = [
      'W',
      'U',
      'B',
      'R',
      'G',
      'C',
      'T',
      'Q',
      'E',
      'S',
      'TK',
      'P',
      'H',
      'W/U',
      'U/B',
      'B/R',
      'R/G',
      'G/W',
      'W/B',
      'U/R',
      'B/G',
      'R/W',
      'G/U',
      'W/P',
      'U/P',
      'B/P',
      'R/P',
      'G/P',
      'G/W/P',
      'G/U/P',
      'R/G/P',
      'R/W/P',
      '2/W',
      '2/U',
      '2/B',
      '2/R',
      '2/G',
      'C/W',
      'C/U',
      'C/B',
      'C/R',
      'C/G',
      'X',
      'x',
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '20',
    ];

    for (const token of vectorTokens) {
      const asset = resolveManaSymbolAsset(token);
      expect(asset.kind, `Expected SVG img asset for ${token}`).toBe('svg-img');
      if (asset.kind !== 'svg-img') continue;

      const svg = decodeSvgDataUri(asset.src);
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
      expect(svg).not.toContain('undefined');
      expect(svg).not.toContain('NaN');
      expect(svg).not.toContain('<clipPath');
    }

    // Special dark-theme legibility treatments
    const qAsset = resolveManaSymbolAsset('Q');
    expect(qAsset.kind === 'svg-img' && qAsset.darkRing).toBe(true);

    const eAsset = resolveManaSymbolAsset('E');
    expect(eAsset.kind === 'svg-img' && eAsset.shape).toBe('shield');

    for (const lightBacked of ['TK', 'P', 'H']) {
      const svg = getManaSymbolSvgSource(lightBacked);
      expect(svg).toContain('#ccc2c0');
    }

    // Subtle divider appears only on low-contrast dark halves (C/B and 2/B), not high-contrast W/U
    expect(getManaSymbolSvgSource('C/B')).toContain('<line');
    expect(getManaSymbolSvgSource('2/B')).toContain('<line');
    expect(getManaSymbolSvgSource('W/U')).not.toContain('<line');

    // Unknown/unlisted tokens still fall back cleanly to typographic generic circles
    for (const genericToken of ['17', '99', 'CHAOS']) {
      const asset = resolveManaSymbolAsset(genericToken);
      expect(asset.kind).toBe('generic');
      if (asset.kind === 'generic') {
        expect(asset.text).toBe(genericToken.toUpperCase());
      }
    }
  });

  it('memoizes symbol resolution across case and whitespace variants', () => {
    const a = resolveManaSymbolAsset('W/U');
    const b = resolveManaSymbolAsset(' w/u ');
    expect(b).toBe(a);

    const svgA = getManaSymbolSvgSource('G/W/P');
    const svgB = getManaSymbolSvgSource('g/w/p');
    expect(svgB).toBe(svgA);
  });

  it('resolves every single {...} mana/symbol token appearing across cards.min.json', () => {
    expect(fs.existsSync(DATASET_PATH)).toBe(true);
    const cards = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8')) as Array<{
      manaCost?: string;
      oracleText?: string;
      faces?: Array<{ manaCost?: string; oracleText?: string }>;
    }>;

    const tokenPattern = /\{([^}]+)\}/g;
    const uniqueTokens = new Set<string>();

    const scanText = (text?: string) => {
      if (!text) return;
      tokenPattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = tokenPattern.exec(text)) !== null) {
        if (match[1]) uniqueTokens.add(match[1]);
      }
    };

    for (const card of cards) {
      scanText(card.manaCost);
      scanText(card.oracleText);
      if (card.faces) {
        for (const face of card.faces) {
          scanText(face.manaCost);
          scanText(face.oracleText);
        }
      }
    }

    expect(uniqueTokens.size).toBeGreaterThanOrEqual(55);

    for (const token of uniqueTokens) {
      const asset = resolveManaSymbolAsset(token);
      expect(asset.kind, `Token {${token}} should resolve to a vector SVG`).toBe('svg-img');
      if (asset.kind === 'svg-img') {
        const svg = decodeSvgDataUri(asset.src);
        expect(svg).toContain('<svg');
        expect(svg).toContain('</svg>');
        expect(svg).not.toContain('undefined');
        expect(svg).not.toContain('NaN');
      }
    }
  });
});

describe('ManaSymbol UI components & integrations', () => {
  it('renders ManaSymbolBadge, ManaCostDisplay, ColorIdentityBadges, and OracleTextDisplay with SVG imgs', () => {
    const badgeHtml = renderToStaticMarkup(<ManaSymbolBadge symbol="Q" size="lg" />);
    expect(badgeHtml).toContain('<img');
    expect(badgeHtml).toContain('data:image/svg+xml;charset=utf-8,');
    expect(badgeHtml).toContain('ring-slate-500/80');
    expect(badgeHtml).toContain('data-mana-symbol="Q"');

    const shieldHtml = renderToStaticMarkup(<ManaSymbolBadge symbol="E" size="sm" />);
    expect(shieldHtml).toContain('object-contain');
    expect(shieldHtml).not.toContain('rounded-full');

    const costHtml = renderToStaticMarkup(
      <ManaCostDisplay manaCost="{2}{W/U}{2/B} // {G/W/P}{X}" size="sm" />,
    );
    expect(costHtml).toContain('//');
    expect(costHtml).toContain('data-mana-symbol="W/U"');
    expect(costHtml).toContain('data-mana-symbol="2/B"');
    expect(costHtml).toContain('data-mana-symbol="G/W/P"');
    expect(costHtml).toContain('data-mana-symbol="2"');
    expect(costHtml).toContain('data-mana-symbol="X"');

    const fallbackHtml = renderToStaticMarkup(<ManaSymbolBadge symbol="99" size="sm" />);
    expect(fallbackHtml).toContain('>99<');

    const colorlessIdentityHtml = renderToStaticMarkup(<ColorIdentityBadges colors={[]} />);
    expect(colorlessIdentityHtml).toContain('data-mana-symbol="C"');

    const esperIdentityHtml = renderToStaticMarkup(
      <ColorIdentityBadges colors={['W', 'U', 'B']} />,
    );
    expect(esperIdentityHtml).toContain('data-mana-symbol="W"');
    expect(esperIdentityHtml).toContain('data-mana-symbol="U"');
    expect(esperIdentityHtml).toContain('data-mana-symbol="B"');

    const oracleHtml = renderToStaticMarkup(
      <OracleTextDisplay text="{T}, Pay {P}, gain {E}, get {TK}: Add {C}{R/P}." />,
    );
    const oracleWithoutImgAttrs = oracleHtml.replace(/<img\b[^>]*>/g, '');
    expect(oracleWithoutImgAttrs).not.toContain('{T}');
    expect(oracleWithoutImgAttrs).not.toContain('{R/P}');
    expect(oracleHtml).toContain('data-mana-symbol="T"');
    expect(oracleHtml).toContain('data-mana-symbol="P"');
    expect(oracleHtml).toContain('data-mana-symbol="E"');
    expect(oracleHtml).toContain('data-mana-symbol="TK"');
    expect(oracleHtml).toContain('data-mana-symbol="C"');
    expect(oracleHtml).toContain('data-mana-symbol="R/P"');
  });

  it('renders FilterSidebar mana buttons and ActiveFilterBar chips with SVG mana icons instead of plain letters', () => {
    const commander = makeCard({
      id: 'cmd-1',
      name: 'Atraxa, Praetors’ Voice',
      manaCost: '{G}{W}{U}{B}',
      cmc: 4,
      typeLine: 'Legendary Creature — Phyrexian Angel Horror',
      colorIdentity: ['W', 'U', 'B', 'G'],
      colors: ['W', 'U', 'B', 'G'],
      isCommanderEligible: true,
    });

    const filter: SearchFilter = {
      ...DEFAULT_SEARCH_FILTER,
      colorIdentity: ['W', 'U'],
      colors: ['G', 'R'],
    };

    const sidebarHtml = renderToStaticMarkup(
      <FilterSidebar
        filter={filter}
        commanders={[commander]}
        mobileOpen={false}
        onCloseMobile={() => {}}
        onUpdateFilter={() => {}}
        onResetFilters={() => {}}
        onFindPartner={() => {}}
      />,
    );

    expect(sidebarHtml).not.toContain('>W<');
    expect(sidebarHtml).not.toContain('>C<');
    expect(sidebarHtml).toContain('data-mana-symbol="W"');
    expect(sidebarHtml).toContain('data-mana-symbol="C"');
    expect(sidebarHtml).toContain('aria-pressed="true"');
    expect(sidebarHtml).toContain('Sync lock to active Commander');

    const activeBarHtml = renderToStaticMarkup(
      <ActiveFilterBar
        filter={filter}
        searchResult={null}
        isSearching={false}
        viewMode="standard"
        onViewModeChange={() => {}}
        onUpdateFilter={() => {}}
        onResetFilters={() => {}}
      />,
    );

    expect(activeBarHtml).toContain('Identity:');
    expect(activeBarHtml).toContain('Colors (include):');
    expect(activeBarHtml).toContain('data-mana-symbol="W"');
    expect(activeBarHtml).toContain('data-mana-symbol="U"');
    expect(activeBarHtml).toContain('data-mana-symbol="G"');
    expect(activeBarHtml).toContain('data-mana-symbol="R"');
  });

  it('renders DeckWorkspace Basic Land Station and Pips vs Sources with mana SVGs', () => {
    const solRing = makeCard({
      id: 'sol-ring',
      name: 'Sol Ring',
      manaCost: '{1}',
      cmc: 1,
      typeLine: 'Artifact',
      oracleText: '{T}: Add {C}{C}.',
    });

    const basicLands: Record<string, CompactCard> = {};
    const landDefs: Array<[string, ManaColor | null]> = [
      ['Plains', 'W'],
      ['Island', 'U'],
      ['Swamp', 'B'],
      ['Mountain', 'R'],
      ['Forest', 'G'],
      ['Wastes', null],
    ];
    for (const [landName, color] of landDefs) {
      basicLands[landName] = makeCard({
        id: `land-${landName.toLowerCase()}`,
        name: landName,
        typeLine: color ? `Basic Land — ${landName}` : 'Basic Land',
        colorIdentity: color ? [color] : [],
      });
    }

    const wubrgSpell = makeCard({
      id: 'wubrg-spell',
      name: 'Chromatic Orrery Test',
      manaCost: '{W}{U}{B}{R}{G}',
      cmc: 5,
      typeLine: 'Sorcery',
      oracleText: 'Draw a card.',
      colors: ['W', 'U', 'B', 'R', 'G'],
      colorIdentity: ['W', 'U', 'B', 'R', 'G'],
    });

    const deck: DeckDraft = {
      id: 'deck-1',
      name: 'Test Mana Deck',
      commanders: [],
      mainboard: {
        [solRing.id]: { card: solRing, quantity: 1 },
        [wubrgSpell.id]: { card: wubrgSpell, quantity: 1 },
      },
      sideboard: {},
      lockSearchToCommanderIdentity: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const analytics = computeDeckAnalytics(deck);

    const workspaceHtml = renderToStaticMarkup(
      <DeckWorkspace
        deck={deck}
        analytics={analytics}
        totalDeckPriceUsd={1}
        combinedColorIdentity={['W', 'U', 'B', 'R', 'G']}
        basicLands={basicLands}
        onRenameDeck={() => {}}
        onRemoveCommander={() => {}}
        onToggleIdentityLock={() => {}}
        onMatchSynergy={() => {}}
        onFindPartner={() => {}}
        onAddCard={() => {}}
        onRemoveOneCard={() => {}}
        onDeleteCard={() => {}}
        onMoveToSideboard={() => {}}
        onMoveToMainboard={() => {}}
        onAddToSideboard={() => {}}
        onRemoveOneSideboard={() => {}}
        onDeleteSideboard={() => {}}
        onAutoFillBasics={() => {}}
        onMoveIllegalToSideboard={() => {}}
        onQuickFilterRole={() => {}}
        onOpenDeckManager={() => {}}
        onChooseCommander={() => {}}
        onInspectCard={() => {}}
      />,
    );

    expect(workspaceHtml).toContain('Plains');
    expect(workspaceHtml).toContain('Wastes');
    expect(workspaceHtml).toContain('White');
    expect(workspaceHtml).toContain('Colorless');
    expect(workspaceHtml).not.toMatch(/>\s*[WUBRGC]\s*<\/span>/);
    for (const sym of ['W', 'U', 'B', 'R', 'G', 'C']) {
      expect(workspaceHtml).toContain(`data-mana-symbol="${sym}"`);
    }
  });
});
