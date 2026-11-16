import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { ActiveFilterBar } from '../components/ActiveFilterBar.js';
import { CardDetailModal } from '../components/CardDetailModal.js';
import { CardTile } from '../components/CardTile.js';
import { FilterSidebar } from '../components/FilterSidebar.js';
import { HeaderBar } from '../components/HeaderBar.js';
import { RippleChainBar } from '../components/RippleChainBar.js';
import {
  buildMergedRippleProfile,
  buildRippleIndex,
  computeDeckChainBalance,
  extractRippleProfile,
  getSynergyReasonBadgeClass,
  HIDDEN_GEM_DEFAULT_MAX_USD,
  HIDDEN_GEM_MAX_EDHREC_RANK,
  HIDDEN_GEM_MIN_EDHREC_RANK,
  prepareRippleMatcher,
  RIPPLE_MODE_META,
  scoreRippleCard,
} from '../search/rippleEngine.js';
import { CardSearchEngine } from '../search/searchEngine.js';
import { hydrateCompactCard, type CompactCard, type SerializedCompactCard } from '../types/card.js';
import { DEFAULT_SEARCH_FILTER, type SearchFilter } from '../types/search.js';

const IS_CI = Boolean(process.env.CI);
const MAX_COLD_ENGINE_MS = IS_CI ? 200 : 100;
const MAX_RIPPLE_QUERY_MS = IS_CI ? 50 : 25;

function withFilter(patch: Partial<SearchFilter>): SearchFilter {
  return { ...DEFAULT_SEARCH_FILTER, ...patch };
}

describe('Phase 3 Ripple Chains Engine & UI', () => {
  let cards: CompactCard[] = [];
  let byName = new Map<string, CompactCard>();
  let engine: CardSearchEngine;
  let coldInitMs = 0;

  beforeAll(() => {
    const cardsPath = path.resolve(process.cwd(), 'public', 'data', 'cards.min.json');
    const raw = JSON.parse(readFileSync(cardsPath, 'utf8')) as SerializedCompactCard[];
    cards = raw.map(hydrateCompactCard);
    byName = new Map(cards.map((c) => [c.name, c]));

    const t0 = performance.now();
    engine = new CardSearchEngine(cards);
    coldInitMs = performance.now() - t0;

    // Warm lazy Ripple bitmask index + JIT
    engine.ensureRippleIndex();
    const meren = byName.get('Meren of Clan Nel Toth')!;
    engine.search(withFilter({ rippleSeedIds: [meren.id], colorIdentity: meren.colorIdentity }));
  });

  it('keeps CardSearchEngine cold boot under 100ms via lazy Ripple indexing', () => {
    expect(coldInitMs).toBeLessThan(MAX_COLD_ENGINE_MS);
  });

  it('extracts at least 1 Ripple hook for 100% of all 3,759 Commanders without throwing', () => {
    const commanders = cards.filter((c) => c.isCommanderEligible);
    expect(commanders.length).toBeGreaterThan(3000);

    let zeroHooks = 0;
    for (const cmd of commanders) {
      const profile = extractRippleProfile([cmd]);
      if (profile.hooks.length === 0) zeroHooks++;
    }
    expect(zeroHooks).toBe(0);
  });

  it('prevents keyword/negation/opponent-trigger false positives across iconic Commanders', () => {
    // 1. Meren: Polluted Delta & Evolving Wilds are land sacrifices, NOT creature-death Starters
    const meren = byName.get('Meren of Clan Nel Toth')!;
    const merenStarters = engine.search(
      withFilter({
        colorIdentity: meren.colorIdentity,
        rippleSeedIds: [meren.id],
        rippleMode: 'enablers',
        pageSize: 30,
      }),
    );
    const merenStarterNames = merenStarters.matches.map((m) => m.card.name);
    expect(merenStarterNames).not.toContain('Polluted Delta');
    expect(merenStarterNames).not.toContain('Evolving Wilds');
    expect(merenStarters.matches[0]?.matchedReasons.some((r) => r.startsWith('Starter:'))).toBe(true);

    // 2. Atraxa: keyword "lifelink" must NOT pull Heliod/Cleric Class lifegain into Proliferate
    const atraxa = byName.get("Atraxa, Praetors' Voice")!;
    const atraxaAll = engine.search(
      withFilter({
        colorIdentity: atraxa.colorIdentity,
        rippleSeedIds: [atraxa.id],
        rippleMode: 'all',
        pageSize: 20,
      }),
    );
    const atraxaNames = atraxaAll.matches.map((m) => m.card.name);
    expect(atraxaNames).not.toContain('Heliod, Sun-Crowned');
    expect(atraxaNames).not.toContain('Cleric Class');

    // 3. Bello: "non-Aura enchantment" and "non-Equipment artifact" must exclude Auras & Equipment
    const bello = byName.get('Bello, Bard of the Brambles')!;
    const belloStarters = engine.search(
      withFilter({
        colorIdentity: bello.colorIdentity,
        rippleSeedIds: [bello.id],
        rippleMode: 'enablers',
        pageSize: 30,
      }),
    );
    for (const m of belloStarters.matches) {
      const tl = m.card.typeLine.toLowerCase();
      expect(tl).not.toContain('aura');
      expect(tl).not.toContain('equipment');
    }

    // 4. Veyran: Payoffs tab surfaces Magecraft / own-cast triggers and excludes opponent-cast Mystic Remora
    const veyran = byName.get('Veyran, Voice of Duality')!;
    const veyranPayoffs = engine.search(
      withFilter({
        colorIdentity: veyran.colorIdentity,
        rippleSeedIds: [veyran.id],
        rippleMode: 'payoffs',
        pageSize: 15,
      }),
    );
    const veyranPayoffNames = veyranPayoffs.matches.map((m) => m.card.name);
    expect(veyranPayoffNames).not.toContain('Mystic Remora');
    expect(veyranPayoffNames).not.toContain('Veyran, Voice of Duality');
    expect(veyranPayoffNames).toContain('Storm-Kiln Artist');
    expect(veyranPayoffNames).toContain('Archmage Emeritus');
  });

  it('covers formerly blank Commanders (Azusa, Henzie, Ghalta) and Partner pairs within <25ms', () => {
    const azusa = byName.get('Azusa, Lost but Seeking')!;
    const azusaPayoffs = engine.search(
      withFilter({
        colorIdentity: azusa.colorIdentity,
        rippleSeedIds: [azusa.id],
        rippleMode: 'payoffs',
        pageSize: 20,
      }),
    );
    expect(azusaPayoffs.totalMatches).toBeGreaterThan(20);
    expect(azusaPayoffs.executionTimeMs).toBeLessThan(MAX_RIPPLE_QUERY_MS);

    const henzie = byName.get('Henzie "Toolbox" Torre')!;
    const henzieAll = engine.search(
      withFilter({
        colorIdentity: henzie.colorIdentity,
        rippleSeedIds: [henzie.id],
        rippleMode: 'all',
        pageSize: 20,
      }),
    );
    expect(henzieAll.totalMatches).toBeGreaterThan(30);
    expect(henzieAll.executionTimeMs).toBeLessThan(MAX_RIPPLE_QUERY_MS);

    // Partner pair fusion: Malcolm + Kediss
    const malcolm = byName.get('Malcolm, Keen-Eyed Navigator')!;
    const kediss = byName.get('Kediss, Emberclaw Familiar')!;
    const partnerRes = engine.search(
      withFilter({
        colorIdentity: ['U', 'R'],
        rippleSeedIds: [malcolm.id, kediss.id],
        rippleMode: 'all',
        pageSize: 20,
      }),
    );
    expect(partnerRes.totalMatches).toBeGreaterThan(50);
    expect(partnerRes.executionTimeMs).toBeLessThan(MAX_RIPPLE_QUERY_MS);
  });

  it('enforces the $5 default cap, EDHREC sleeper window, tighter maxPriceUsd, hook isolation & excludeCardIds', () => {
    expect(HIDDEN_GEM_DEFAULT_MAX_USD).toBe(5.0);

    const prosper = byName.get('Prosper, Tome-Bound')!;
    const gemsRes = engine.search(
      withFilter({
        colorIdentity: prosper.colorIdentity,
        rippleSeedIds: [prosper.id],
        rippleMode: 'hidden-gems',
        pageSize: 25,
      }),
    );
    expect(gemsRes.matches.length).toBeGreaterThan(5);
    for (const m of gemsRes.matches) {
      expect(m.card.priceUsd).not.toBeNull();
      expect(m.card.priceUsd!).toBeLessThanOrEqual(5.0);
      expect(m.card.edhrecRank).not.toBeNull();
      expect(m.card.edhrecRank!).toBeGreaterThanOrEqual(HIDDEN_GEM_MIN_EDHREC_RANK);
      expect(m.card.edhrecRank!).toBeLessThanOrEqual(HIDDEN_GEM_MAX_EDHREC_RANK);
    }

    // Tighter Budget filter overrides $5 default down to <= $1
    const budgetGems = engine.search(
      withFilter({
        colorIdentity: prosper.colorIdentity,
        rippleSeedIds: [prosper.id],
        rippleMode: 'hidden-gems',
        maxPriceUsd: 1,
        pageSize: 20,
      }),
    );
    for (const m of budgetGems.matches) {
      expect(m.card.priceUsd!).toBeLessThanOrEqual(1.0);
    }

    // Sub-chain Hook isolation
    const profile = extractRippleProfile([prosper]);
    const exileHook = profile.hooks.find((h) => h.key.includes('15'));
    expect(exileHook).toBeDefined();
    const hookRes = engine.search(
      withFilter({
        colorIdentity: prosper.colorIdentity,
        rippleSeedIds: [prosper.id],
        rippleMode: 'all',
        rippleHookKey: exileHook!.key,
        pageSize: 15,
      }),
    );
    expect(hookRes.matches.length).toBeGreaterThan(5);

    // Hide cards already in deck via excludeCardIds
    const firstId = hookRes.matches[0]!.card.id;
    const excludedRes = engine.search(
      withFilter({
        colorIdentity: prosper.colorIdentity,
        rippleSeedIds: [prosper.id],
        rippleMode: 'all',
        rippleHookKey: exileHook!.key,
        excludeCardIds: [firstId],
        pageSize: 15,
      }),
    );
    expect(excludedRes.matches.some((m) => m.card.id === firstId)).toBe(false);
  });

  it('supports Find Similar on non-commander cards and computes sub-ms Deck Chain Balance', () => {
    const scales = byName.get('Hardened Scales')!;
    const res = engine.search(
      withFilter({
        colorIdentity: ['G', 'W'],
        rippleSeedIds: [scales.id],
        rippleMode: 'enablers',
        pageSize: 10,
      }),
    );
    expect(res.matches.length).toBeGreaterThan(5);

    const meren = byName.get('Meren of Clan Nel Toth')!;
    const merenProfile = extractRippleProfile([meren]);
    const skewedDeck = [
      'Viscera Seer',
      "Ashnod's Altar",
      'Sakura-Tribe Elder',
      'Spore Frog',
      'Satyr Wayfinder',
      'Plaguecrafter',
      'Fleshbag Marauder',
    ].map((n) => byName.get(n)!);

    const t0 = performance.now();
    const balance = computeDeckChainBalance(merenProfile, skewedDeck);
    const ms = performance.now() - t0;

    expect(ms).toBeLessThan(15);
    expect(balance.inDeckStarters).toBeGreaterThanOrEqual(4);
    expect(balance.inDeckPayoffs).toBe(0);
    expect(balance.recommendedMode).toBe('payoffs');
  });

  it('renders descriptive RippleChainBar tabs (Starters, Payoffs, Hidden Gems) and UI controls cleanly', () => {
    expect(RIPPLE_MODE_META.enablers.label).toBe('Starters');
    expect(RIPPLE_MODE_META.payoffs.label).toBe('Payoffs');
    expect(RIPPLE_MODE_META['hidden-gems'].label).toBe('Hidden Gems');

    const meren = byName.get('Meren of Clan Nel Toth')!;
    const profile = extractRippleProfile([meren]);

    const barHtml = renderToStaticMarkup(
      <RippleChainBar
        profile={profile}
        mode="enablers"
        activeHookKey={null}
        activeThemes={['death-trigger', 'tribe:Rat']}
        hideDeckCards={false}
        deckCardCount={7}
        deckBalance={{ inDeckStarters: 6, inDeckPayoffs: 0, recommendedMode: 'payoffs' }}
        onSelectMode={() => {}}
        onSelectHook={() => {}}
        onRemoveTheme={() => {}}
        onToggleHideDeckCards={() => {}}
        onClearRipple={() => {}}
      />,
    );
    expect(barHtml).toContain('>Ripple<');
    expect(barHtml).toContain('All Ripple');
    expect(barHtml).toContain('border-violet-500/35');
    expect(barHtml).toContain('Active themes:');
    expect(barHtml).toContain('Remove Death Trigger from Ripple');
    expect(barHtml).toContain('Rat Typal');
    expect(barHtml).not.toContain('Focus hook:');
    expect(barHtml).toContain('Starters');
    expect(barHtml).toContain('Payoffs');
    expect(barHtml).toContain('Hidden Gems');
    expect(barHtml).toContain('Need Payoffs');
    expect(barHtml).toContain('Hide in deck');
    expect(barHtml).not.toContain('Starts the Ripple');
    expect(barHtml).not.toContain('Rides the Ripple');

    // Badge classes are color-coded by direction
    expect(getSynergyReasonBadgeClass('Starter: Sacrifice Outlet')).toContain('cyan');
    expect(getSynergyReasonBadgeClass('Payoff: Triggers on Dies')).toContain('violet');
    expect(getSynergyReasonBadgeClass('Bridge: Starter + Payoff')).toContain('emerald');

    // HeaderBar shows Ripple button; FilterSidebar avoids "Method A" internal jargon; ActiveFilterBar shows Ripple chip
    const headerHtml = renderToStaticMarkup(
      <HeaderBar
        query=""
        onQueryChange={() => {}}
        activeTab="search"
        onTabChange={() => {}}
        commanders={[meren]}
        totalDeckCards={1}
        syncStatus={{ stage: 'ready', progressPercent: 100, message: 'Ready' }}
        onOpenMobileFilters={() => {}}
        onOpenDeckDrawer={() => {}}
        onOpenDeckManager={() => {}}
        onMatchCommanderSynergy={() => {}}
        onFindPartner={() => {}}
        onClearCommanders={() => {}}
      />,
    );
    expect(headerHtml).toContain('>Ripple<');
    expect(headerHtml).toContain('ring-violet-400/40');

    const sidebarHtml = renderToStaticMarkup(
      <FilterSidebar
        filter={DEFAULT_SEARCH_FILTER}
        commanders={[meren]}
        mobileOpen={false}
        onCloseMobile={() => {}}
        onUpdateFilter={() => {}}
        onResetFilters={() => {}}
        onFindPartner={() => {}}
      />,
    );
    expect(sidebarHtml).toContain('Ripple Themes &amp; Mechanics');
    expect(sidebarHtml).not.toContain('Method A Theme Matcher');

    const activeBarHtml = renderToStaticMarkup(
      <ActiveFilterBar
        filter={withFilter({ rippleSeedIds: [meren.id], rippleMode: 'payoffs' })}
        searchResult={null}
        isSearching={false}
        viewMode="standard"
        onViewModeChange={() => {}}
        onUpdateFilter={() => {}}
        onResetFilters={() => {}}
      />,
    );
    expect(activeBarHtml).toContain('Ripple: Payoffs');

    // Find Similar button renders even for cards with empty pre-tagged themes/roles (like Azusa)
    const azusa = byName.get('Azusa, Lost but Seeking')!;
    const modalHtml = renderToStaticMarkup(
      <CardDetailModal
        match={{ card: azusa, synergyScore: 88, matchedReasons: ['Starter: Land Ramp'] }}
        commanders={[]}
        enforceColorIdentity={false}
        quantityInDeck={0}
        isCommander={false}
        onClose={() => {}}
        onAddCard={() => {}}
        onRemoveOneCard={() => {}}
        onSetCommander={() => {}}
        onAddPartner={() => {}}
        onFilterByRole={() => {}}
        onFilterByTheme={() => {}}
        onFindSimilar={() => {}}
      />,
    );
    expect(modalHtml).toContain('Find Similar');
    expect(modalHtml).toContain('Ripple Match');
    expect(modalHtml).toContain('Ripple 88');
    expect(modalHtml).toContain('violet');

    const tileHtml = renderToStaticMarkup(
      <CardTile
        match={{ card: azusa, synergyScore: 88, matchedReasons: ['Starter: Land Ramp'] }}
        viewMode="standard"
        quantityInDeck={0}
        isCommander={false}
        canAddAsPartner={false}
        canAddMore
        onInspect={() => {}}
        onAddCard={() => {}}
        onSetCommander={() => {}}
        onAddPartner={() => {}}
      />,
    );
    expect(tileHtml).toContain('Ripple 88');
    expect(tileHtml).toContain('bg-violet-950/90');
    expect(tileHtml).toContain('Starter: Land Ramp');
    expect(tileHtml).toContain('cyan');
  });

  it('extracts selective core commander defaultThemes and supports score-based theme mixing/subtraction', () => {
    const sythis = byName.get("Sythis, Harvest's Hand")!;
    const sythisProfile = extractRippleProfile([sythis]);
    expect(sythisProfile.defaultThemes).toContain('enchantress');
    expect(sythisProfile.defaultThemes).toContain('lifegain');
    expect(sythisProfile.defaultThemes).not.toContain('draw-payoff');

    const index = buildRippleIndex(cards);
    const cardIdx = new Map(cards.map((c, i) => [c.id, i]));
    const scoreOf = (card: CompactCard, matcher: ReturnType<typeof prepareRippleMatcher>) =>
      scoreRippleCard(cardIdx.get(card.id)!, card, card.typeLine.toLowerCase(), index, matcher, true);

    const heliod = byName.get('Heliod, Sun-Crowned')!;
    const archangel = byName.get('Archangel of Thune')!;
    const scales = byName.get('Hardened Scales')!;

    const mixedProfile = buildMergedRippleProfile([], ['lifegain', 'plus-one-counters'])!;
    const mixedMatcher = prepareRippleMatcher(mixedProfile, 'all', null, null);
    const heliodMix = scoreOf(heliod, mixedMatcher);
    const archangelMix = scoreOf(archangel, mixedMatcher);
    const scalesMix = scoreOf(scales, mixedMatcher);
    expect(heliodMix.score).toBeGreaterThan(scalesMix.score);
    expect(archangelMix.score).toBeGreaterThan(scalesMix.score);

    const lifegainOnlyProfile = buildMergedRippleProfile([], ['lifegain'])!;
    const lifegainOnlyMatcher = prepareRippleMatcher(lifegainOnlyProfile, 'all', null, null);
    expect(scoreOf(scales, lifegainOnlyMatcher).score).toBe(0);
    expect(scoreOf(heliod, lifegainOnlyMatcher).score).toBeGreaterThan(0);
  });

  it('matches whole-word tribal & custom keyword Ripple across all 4 modes without false substrings or generic rocks', () => {
    const index = buildRippleIndex(cards);
    const cardIdx = new Map(cards.map((c, i) => [c.id, i]));
    const scoreOf = (card: CompactCard, matcher: ReturnType<typeof prepareRippleMatcher>) =>
      scoreRippleCard(cardIdx.get(card.id)!, card, card.typeLine.toLowerCase(), index, matcher, true);

    const ratAll = prepareRippleMatcher(buildMergedRippleProfile([], ['tribe:Rat'])!, 'all', null, null);
    const pirate = cards.find(
      (c) =>
        c.typeLine.includes('Pirate') &&
        !/\brat\b/i.test(c.oracleText) &&
        !c.keywords.includes('Changeling'),
    )!;
    const proliferater = cards.find(
      (c) =>
        c.oracleText.toLowerCase().includes('proliferate') &&
        !/\brat\b/i.test(c.oracleText) &&
        !c.typeLine.includes('Rat') &&
        !c.keywords.includes('Changeling'),
    )!;
    expect(scoreOf(pirate, ratAll).score).toBe(0);
    expect(scoreOf(proliferater, ratAll).score).toBe(0);

    const elfAll = prepareRippleMatcher(buildMergedRippleProfile([], ['tribe:Elf'])!, 'all', null, null);
    const itselfCard = cards.find(
      (c) =>
        c.oracleText.toLowerCase().includes('itself') &&
        !/\belf\b|\belves\b/i.test(c.oracleText) &&
        !c.typeLine.includes('Elf') &&
        !c.keywords.includes('Changeling'),
    )!;
    expect(scoreOf(itselfCard, elfAll).score).toBe(0);

    const vehiclesAll = prepareRippleMatcher(buildMergedRippleProfile([], ['vehicles'])!, 'all', null, null);
    const changeling = cards.find((c) => c.keywords.includes('Changeling') && !c.typeLine.includes('Vehicle'))!;
    const copter = byName.get("Smuggler's Copter")!;
    expect(scoreOf(changeling, vehiclesAll).score).toBe(0);
    expect(scoreOf(copter, vehiclesAll).score).toBeGreaterThan(0);

    const fynn = byName.get('Fynn, the Fangbearer')!;
    const dtProfile = buildMergedRippleProfile([], ['custom:deathtouch'])!;
    for (const mode of ['all', 'enablers', 'payoffs', 'hidden-gems'] as const) {
      const m = prepareRippleMatcher(dtProfile, mode, null, null);
      expect(scoreOf(fynn, m).score).toBeGreaterThan(0);
    }

    // False-positive exclusions on theme queries
    const landfallMatch = prepareRippleMatcher(buildMergedRippleProfile([], ['landfall'])!, 'all', null, null);
    expect(scoreOf(byName.get('Sol Ring')!, landfallMatch).score).toBe(0);
    expect(scoreOf(byName.get('Arcane Signet')!, landfallMatch).score).toBe(0);

    const enchantressMatch = prepareRippleMatcher(buildMergedRippleProfile([], ['enchantress'])!, 'all', null, null);
    expect(scoreOf(byName.get('Harmonize')!, enchantressMatch).score).toBe(0);
  });
});
