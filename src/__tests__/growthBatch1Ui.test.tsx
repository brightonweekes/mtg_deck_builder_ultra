import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { hasAuthReturnIntent, hasCloudUrlIntent } from '../App.js';
import { ActiveFilterBar } from '../components/ActiveFilterBar.js';
import { CardDetailModal } from '../components/CardDetailModal.js';
import { CardTile } from '../components/CardTile.js';
import {
  addUpgradeCardToAuditDraft,
  auditRoleTargets,
  buildAuditUpgradeSearchFilter,
  DeckAuditModal,
  filterAuditUpgradeMatches,
  resolveDeckDraftFromText,
} from '../components/DeckAuditModal.js';
import { DeckManagerModal } from '../components/DeckManagerModal.js';
import { DeckWorkspace } from '../components/DeckWorkspace.js';
import { HeaderBar } from '../components/HeaderBar.js';
import { LegalFooter } from '../components/LegalFooter.js';
import {
  persistQuickStartDismissed,
  QUICK_START_DISMISSED_KEY,
  QuickStartBanner,
  readQuickStartDismissed,
  SAMPLE_COMMANDERS,
} from '../components/QuickStartBanner.js';
import { Ripple99Logo } from '../components/Ripple99Logo.js';
import { SharedDeckBanner } from '../components/SharedDeckBanner.js';
import { computeDeckAnalytics, ROLE_TARGETS } from '../deck/deckAnalytics.js';
import type { SyncCatalogResult } from '../db/cardDb.js';
import { buildEmptySearchResponse } from '../hooks/useCardSearch.js';
import type { CompactCard, DataManifest, ManaColor } from '../types/card.js';
import type { DeckDraft } from '../types/deck.js';
import {
  DEFAULT_SEARCH_FILTER,
  type ScoredCardMatch,
  type SyncStatusPayload,
  type WorkerResponseMessage,
} from '../types/search.js';
import { SearchWorkerController } from '../workers/searchWorker.js';

function makeCard(
  overrides: Partial<CompactCard> & { id: string; name: string },
): CompactCard {
  return {
    oracleId: `oracle-${overrides.id}`,
    manaCost: '{2}',
    cmc: 2,
    typeLine: 'Artifact',
    oracleText: '',
    colors: [],
    colorIdentity: [],
    keywords: [],
    edhrecRank: 50,
    priceUsd: 2.5,
    imageNormal: '',
    imageSmall: '',
    layout: 'normal',
    isCommanderEligible: false,
    roles: [],
    themes: [],
    ...overrides,
  };
}

function makeDeck(overrides: Partial<DeckDraft> = {}): DeckDraft {
  return {
    id: 'deck-ui-1',
    name: 'Ripple99 Test Brew',
    commanders: [],
    mainboard: {},
    sideboard: {},
    lockSearchToCommanderIdentity: true,
    createdAt: '2026-11-15T00:00:00.000Z',
    updatedAt: '2026-11-15T00:00:00.000Z',
    ...overrides,
  };
}

const READY_SYNC: SyncStatusPayload = {
  stage: 'ready',
  progressPercent: 100,
  message: 'Ready',
  fromCache: true,
  loadTimeMs: 14,
};

const noopResolveCards = async () => ({ byId: {}, byName: {} });

describe('Ripple99 Growth Batch 1 UI & Helpers', () => {
  it('renders Ripple99Logo with concentric ripples, diamond core, and custom className', () => {
    const html = renderToStaticMarkup(<Ripple99Logo className="h-10 w-10" />);
    expect(html).toContain('data-testid="ripple99-logo"');
    expect(html).toContain('h-10 w-10');
    expect(html).toContain('<circle');
    expect(html).toContain('<path');
  });

  it('renders HeaderBar with Ripple99 brand, motto, and optional Audit button', () => {
    const baseProps = {
      query: '',
      onQueryChange: () => {},
      activeTab: 'search' as const,
      onTabChange: () => {},
      commanders: [],
      totalDeckCards: 0,
      syncStatus: READY_SYNC,
      onOpenMobileFilters: () => {},
      onOpenDeckDrawer: () => {},
      onOpenDeckManager: () => {},
      onMatchCommanderSynergy: () => {},
      onFindPartner: () => {},
      onClearCommanders: () => {},
    };

    const withAuditHtml = renderToStaticMarkup(
      <HeaderBar {...baseProps} onOpenAudit={() => {}} />,
    );
    expect(withAuditHtml).toContain('data-testid="ripple99-logo"');
    expect(withAuditHtml).toContain('Ripple99');
    expect(withAuditHtml).toContain('Build Decks, Not Piles');
    expect(withAuditHtml).not.toContain('Commander Builder Ultra');
    expect(withAuditHtml).toContain('>Audit<');
    expect(withAuditHtml).not.toContain('Re-sync IndexedDB card catalog');
    expect(withAuditHtml).not.toContain('14ms');

    const withoutAuditHtml = renderToStaticMarkup(<HeaderBar {...baseProps} />);
    expect(withoutAuditHtml).not.toContain('>Audit<');
  });

  it('renders LegalFooter with Wizards Fan Content disclaimer, Scryfall attribution, and Privacy & Terms modal', () => {
    const closedHtml = renderToStaticMarkup(<LegalFooter />);
    expect(closedHtml).toContain('Ripple99 — Build Decks, Not Piles');
    expect(closedHtml).toContain('100% Free, Local-First &amp; Ad-Free');
    expect(closedHtml).toContain('unofficial Fan Content permitted under the Fan Content Policy');
    expect(closedHtml).toContain('©Wizards of the Coast LLC.');
    expect(closedHtml).toContain('Card data &amp; images provided by Scryfall.');
    expect(closedHtml).toContain('Privacy &amp; Terms');
    expect(closedHtml).not.toContain('role="dialog"');

    const openHtml = renderToStaticMarkup(<LegalFooter defaultPolicyOpen />);
    expect(openHtml).toContain('role="dialog"');
    expect(openHtml).toContain('Local-First IndexedDB Storage');
    expect(openHtml).toContain('Optional Firebase Cloud Sync &amp; Handles');
    expect(openHtml).toContain('Cloudflare Web Analytics');
    expect(openHtml).toContain('never run ad trackers');
  });

  it('controls QuickStartBanner visibility by activeTab/dismiss state and safely handles localStorage', () => {
    expect(SAMPLE_COMMANDERS).toHaveLength(3);
    expect(SAMPLE_COMMANDERS.map((c) => c.name)).toEqual([
      "Atraxa, Praetors' Voice",
      'Meren of Clan Nel Toth',
      'Veyran, Voice of Duality',
    ]);

    const visibleHtml = renderToStaticMarkup(
      <QuickStartBanner
        activeTab="search"
        initialDismissed={false}
        resolveCards={noopResolveCards}
        onOpenAudit={() => {}}
        onSelectSampleCommander={() => {}}
      />,
    );
    expect(visibleHtml).toContain('Build Decks, Not Piles');
    expect(visibleHtml).toContain('32,643');
    expect(visibleHtml).toContain('Instant 99 Audit');
    expect(visibleHtml).toContain('Atraxa, Praetors&#x27; Voice');
    expect(visibleHtml).toContain('Meren of Clan Nel Toth');
    expect(visibleHtml).toContain('Veyran, Voice of Duality');
    expect(visibleHtml).toContain('aria-label="Dismiss quick start banner"');

    const hiddenInDeckHtml = renderToStaticMarkup(
      <QuickStartBanner
        activeTab="deck"
        initialDismissed={false}
        resolveCards={noopResolveCards}
        onOpenAudit={() => {}}
        onSelectSampleCommander={() => {}}
      />,
    );
    expect(hiddenInDeckHtml).toBe('');

    const dismissedHtml = renderToStaticMarkup(
      <QuickStartBanner
        activeTab="search"
        initialDismissed
        resolveCards={noopResolveCards}
        onOpenAudit={() => {}}
        onSelectSampleCommander={() => {}}
      />,
    );
    expect(dismissedHtml).toBe('');

    // Storage persistence & graceful error handling
    const store = new Map<string, string>();
    const memoryStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => {
        store.set(key, val);
      },
    };
    expect(readQuickStartDismissed(memoryStorage)).toBe(false);
    expect(persistQuickStartDismissed(memoryStorage)).toBe(true);
    expect(store.get(QUICK_START_DISMISSED_KEY)).toBe('1');
    expect(readQuickStartDismissed(memoryStorage)).toBe(true);

    const throwingStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(readQuickStartDismissed(null)).toBe(false);
    expect(readQuickStartDismissed(throwingStorage)).toBe(false);
    expect(persistQuickStartDismissed(null)).toBe(false);
    expect(persistQuickStartDismissed(throwingStorage)).toBe(false);
  });

  it('resolves decklists, audits role targets, and renders DeckAuditModal states', async () => {
    const meren = makeCard({
      id: 'cmd-meren',
      name: 'Meren of Clan Nel Toth',
      manaCost: '{2}{B}{G}',
      cmc: 4,
      typeLine: 'Legendary Creature — Human Shaman',
      colors: ['B', 'G'] as ManaColor[],
      colorIdentity: ['B', 'G'] as ManaColor[],
      isCommanderEligible: true,
      priceUsd: 8.5,
    });
    const solRing = makeCard({
      id: 'sol-ring',
      name: 'Sol Ring',
      manaCost: '{1}',
      cmc: 1,
      typeLine: 'Artifact',
      oracleText: '{T}: Add {C}{C}.',
      roles: ['ramp'],
      priceUsd: 1.5,
    });
    const swamp = makeCard({
      id: 'swamp',
      name: 'Swamp',
      manaCost: '',
      cmc: 0,
      typeLine: 'Basic Land — Swamp',
      maxCopies: null,
      priceUsd: 0.1,
    });

    const resolved = await resolveDeckDraftFromText(
      `
        // Name: Meren Reanimator
        COMMANDER:
        1 Meren of Clan Nel Toth
        MAINBOARD:
        1 Sol Ring
        15 Swamp
        1 Missing Mystery Card
        SIDEBOARD:
        1 Sol Ring
      `,
      async () => ({
        byId: {},
        byName: {
          'meren of clan nel toth': meren,
          'sol ring': solRing,
          swamp,
        },
      }),
    );

    expect(resolved).not.toBeNull();
    expect(resolved!.draft.name).toBe('Meren Reanimator');
    expect(resolved!.draft.commanders.map((c) => c.id)).toEqual(['cmd-meren']);
    expect(resolved!.draft.mainboard['sol-ring']?.quantity).toBe(1);
    expect(resolved!.draft.mainboard['swamp']?.quantity).toBe(15);
    expect(resolved!.draft.sideboard['sol-ring']?.quantity).toBe(1);
    expect(resolved!.missingNames).toEqual(['Missing Mystery Card']);

    const analytics = computeDeckAnalytics(resolved!.draft);
    const roleAudit = auditRoleTargets(analytics);
    expect(roleAudit).toHaveLength(ROLE_TARGETS.length);
    expect(roleAudit.find((r) => r.role === 'lands')?.status).toBe('deficit');
    expect(roleAudit.find((r) => r.role === 'ramp')?.status).toBe('deficit');

    const closedHtml = renderToStaticMarkup(
      <DeckAuditModal
        open={false}
        activeDeck={makeDeck()}
        resolveCards={noopResolveCards}
        onClose={() => {}}
        onImportDeckDraft={() => {}}
        onFindMissingRole={() => {}}
      />,
    );
    expect(closedHtml).toBe('');

    const reportHtml = renderToStaticMarkup(
      <DeckAuditModal
        open
        activeDeck={resolved!.draft}
        activeDeckPriceUsd={11.5}
        initialAuditResult={{
          draft: resolved!.draft,
          missingNames: resolved!.missingNames,
          isCurrentDeck: true,
        }}
        resolveCards={noopResolveCards}
        onClose={() => {}}
        onImportDeckDraft={() => {}}
        onFindMissingRole={() => {}}
      />,
    );

    expect(reportHtml).toContain('Instant 99 Audit');
    expect(reportHtml).toContain('Meren Reanimator');
    expect(reportHtml).toContain('17 / 100');
    expect(reportHtml).toContain('Not Yet Legal');
    expect(reportHtml).toContain('Unrecognized cards (1)');
    expect(reportHtml).toContain('Missing Mystery Card');
    expect(reportHtml).toContain('Find missing Lands');
    expect(reportHtml).toContain('Find missing Ramp');
    expect(reportHtml).toContain('Open in Ripple99 Studio');
    expect(reportHtml).toContain('Copy Moxfield Text');
    expect(reportHtml).toContain('Audit Current Deck');
  });

  it('renders Share in DeckWorkspace (omitting Export PNG and Table QR) and keeps Export PNG in DeckManagerModal Share tab', () => {
    const deck = makeDeck({ name: 'Export Button Test' });
    const analytics = computeDeckAnalytics(deck);

    const workspaceHtml = renderToStaticMarkup(
      <DeckWorkspace
        deck={{ ...deck, visibility: 'public' }}
        analytics={analytics}
        totalDeckPriceUsd={0}
        combinedColorIdentity={[]}
        basicLands={{}}
        onRenameDeck={() => {}}
        onChangeVisibility={() => {}}
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
    expect(workspaceHtml).toContain('>Share</button>');
    expect(workspaceHtml).toContain('aria-label="Deck visibility"');
    expect(workspaceHtml).toContain('Visibility:');
    expect(workspaceHtml).toContain('Public');
    expect(workspaceHtml).not.toContain('My Decks');
    expect(workspaceHtml).not.toContain('Browse Catalog');
    expect(workspaceHtml).not.toContain('Share Link');
    expect(workspaceHtml).not.toContain('Export PNG');
    expect(workspaceHtml).not.toContain('Table QR');

    const managerShareHtml = renderToStaticMarkup(
      <DeckManagerModal
        open
        initialTab="share"
        activeDeck={deck}
        savedDecks={[]}
        resolveCards={noopResolveCards}
        onClose={() => {}}
        onCreateNewDeck={async () => {}}
        onSwitchDeck={async () => {}}
        onDuplicateCurrentDeck={async () => {}}
        onDeleteDeck={async () => {}}
        onImportDeckDraft={() => {}}
      />,
    );
    expect(managerShareHtml).toContain('Export PNG');
    expect(managerShareHtml).toContain('Copy Share Link');
  });

  it('detects lazy cloud URL intents accurately without waking cloud on ?d= URLs', () => {
    expect(hasCloudUrlIntent('')).toBe(false);
    expect(hasCloudUrlIntent('?d=v1.abc123')).toBe(false);
    expect(hasCloudUrlIntent('?deck=shared-deck-1')).toBe(true);
    expect(hasCloudUrlIntent('?addFriend=mana_mage')).toBe(true);
    expect(hasCloudUrlIntent('?authReturn=1')).toBe(true);
    expect(hasCloudUrlIntent('?mode=verifyEmail&oobCode=abc123')).toBe(true);
    expect(hasCloudUrlIntent('?mode=resetPassword&oobCode=xyz789')).toBe(true);

    expect(hasAuthReturnIntent('')).toBe(false);
    expect(hasAuthReturnIntent('?deck=abc')).toBe(false);
    expect(hasAuthReturnIntent('?authReturn=1')).toBe(true);
  });

  it('builds Under-$1 Synergy Upgrade filters from commanders, mainboard fallback themes, or returns null when empty', () => {
    const emptyDeck = makeDeck();
    expect(buildAuditUpgradeSearchFilter(emptyDeck)).toBeNull();

    const noThemeDeck = makeDeck({
      mainboard: {
        van1: { card: makeCard({ id: 'van1', name: 'Vanilla Bear', themes: [] }), quantity: 1 },
      },
    });
    expect(buildAuditUpgradeSearchFilter(noThemeDeck)).toBeNull();

    const atraxa = makeCard({
      id: 'cmd-atraxa',
      name: "Atraxa, Praetors' Voice",
      colorIdentity: ['W', 'U', 'B', 'G'],
      isCommanderEligible: true,
      themes: ['proliferate', 'plus-one-counters'],
      roles: ['draw'],
    });
    const commanderFilter = buildAuditUpgradeSearchFilter(
      makeDeck({ commanders: [atraxa] }),
    );
    expect(commanderFilter).toEqual({
      ...DEFAULT_SEARCH_FILTER,
      colorIdentity: ['W', 'U', 'B', 'G'],
      themeQuery: 'proliferate plus-one-counters draw',
      maxPriceUsd: 1,
      sortBy: 'synergy',
      commanderOnly: false,
      page: 1,
      pageSize: 40,
    });

    const colorlessCmd = makeCard({
      id: 'cmd-kozilek',
      name: 'Kozilek',
      colorIdentity: [],
      isCommanderEligible: true,
      themes: ['artifacts'],
    });
    const colorlessFilter = buildAuditUpgradeSearchFilter(
      makeDeck({ commanders: [colorlessCmd] }),
    );
    expect(colorlessFilter?.colorIdentity).toEqual([]);
    expect(colorlessFilter?.themeQuery).toBe('artifacts');

    const noCommanderDeck = makeDeck({
      mainboard: {
        m1: { card: makeCard({ id: 'm1', name: 'C1', themes: ['tokens', 'aristocrats'] }), quantity: 1 },
        m2: { card: makeCard({ id: 'm2', name: 'C2', themes: ['tokens', 'sacrifice'] }), quantity: 1 },
        m3: { card: makeCard({ id: 'm3', name: 'C3', themes: ['tokens', 'aristocrats', 'mill'] }), quantity: 1 },
        m4: { card: makeCard({ id: 'm4', name: 'C4', themes: ['sacrifice'] }), quantity: 1 },
      },
    });
    const fallbackFilter = buildAuditUpgradeSearchFilter(noCommanderDeck);
    expect(fallbackFilter).not.toBeNull();
    expect(fallbackFilter?.colorIdentity).toBeNull();
    expect(fallbackFilter?.themeQuery).toBe('tokens aristocrats sacrifice');
    expect(fallbackFilter?.maxPriceUsd).toBe(1);
    expect(fallbackFilter?.sortBy).toBe('synergy');
    expect(fallbackFilter?.pageSize).toBe(40);
  });

  it('filters upgrade matches by id, oracleId across boards, excludes basic lands, and respects limit', () => {
    const cmd = makeCard({
      id: 'cmd-1',
      oracleId: 'oracle-cmd-1',
      name: 'Meren',
      isCommanderEligible: true,
    });
    const mainCard = makeCard({
      id: 'main-printing-a',
      oracleId: 'oracle-shared-main',
      name: 'Sakura-Tribe Elder',
    });
    const sbCard = makeCard({
      id: 'sb-1',
      oracleId: 'oracle-sb-1',
      name: 'Victimize',
    });
    const draft = makeDeck({
      commanders: [cmd],
      mainboard: {
        [mainCard.id]: { card: mainCard, quantity: 1 },
      },
      sideboard: {
        [sbCard.id]: { card: sbCard, quantity: 1 },
      },
    });

    const candidates: ScoredCardMatch[] = [
      {
        card: makeCard({ id: 'cmd-1', oracleId: 'oracle-other', name: 'Meren Dup ID' }),
        synergyScore: 99,
        matchedReasons: ['Theme: Graveyard'],
      },
      {
        card: makeCard({ id: 'main-printing-b', oracleId: 'oracle-shared-main', name: 'Sakura-Tribe Elder Reprint' }),
        synergyScore: 95,
        matchedReasons: ['Theme: Sacrifice'],
      },
      {
        card: makeCard({ id: 'sb-printing-b', oracleId: 'oracle-sb-1', name: 'Victimize Reprint' }),
        synergyScore: 90,
        matchedReasons: ['Theme: Reanimator'],
      },
      {
        card: makeCard({ id: 'basic-swamp', oracleId: 'oracle-swamp', name: 'Swamp', typeLine: 'Basic Land — Swamp' }),
        synergyScore: 85,
        matchedReasons: [],
      },
      {
        card: makeCard({ id: 'basic-snow', oracleId: 'oracle-snow', name: 'Snow-Covered Forest', typeLine: 'Basic Snow Land — Forest' }),
        synergyScore: 84,
        matchedReasons: [],
      },
      ...Array.from({ length: 12 }, (_, idx) => ({
        card: makeCard({
          id: `upg-${idx + 1}`,
          oracleId: `oracle-upg-${idx + 1}`,
          name: `Budget Upgrade ${idx + 1}`,
          priceUsd: 0.25,
        }),
        synergyScore: 80 - idx,
        matchedReasons: ['Theme: Graveyard'],
      })),
    ];

    const top10 = filterAuditUpgradeMatches(candidates, draft);
    expect(top10).toHaveLength(10);
    expect(top10.map((m) => m.card.id)).toEqual(
      Array.from({ length: 10 }, (_, idx) => `upg-${idx + 1}`),
    );
    expect(filterAuditUpgradeMatches(candidates, draft, 3)).toHaveLength(3);
  });

  it('renders Top Under-$1 Synergy Upgrades inside DeckAuditModal and updates pasted drafts cleanly', () => {
    const commander = makeCard({
      id: 'cmd-veyran',
      name: 'Veyran, Voice of Duality',
      colorIdentity: ['U', 'R'],
      isCommanderEligible: true,
      themes: ['spellslinger', 'magecraft'],
    });
    const draft = makeDeck({ commanders: [commander] });

    const upgradeCard = makeCard({
      id: 'upg-opt',
      oracleId: 'oracle-opt',
      name: 'Opt',
      manaCost: '{U}',
      cmc: 1,
      typeLine: 'Instant',
      priceUsd: 0.25,
      themes: ['spellslinger', 'cantrip'],
    });

    const html = renderToStaticMarkup(
      <DeckAuditModal
        open
        activeDeck={draft}
        initialAuditResult={{ draft, missingNames: [], isCurrentDeck: false }}
        initialUpgradeMatches={[
          {
            card: upgradeCard,
            synergyScore: 68,
            matchedReasons: ['Theme: Spellslinger', 'Theme: Cantrip', 'Role: Card Draw'],
          },
        ]}
        runOneOffSearch={async () => buildEmptySearchResponse(1, DEFAULT_SEARCH_FILTER)}
        resolveCards={noopResolveCards}
        onClose={() => {}}
        onImportDeckDraft={() => {}}
        onFindMissingRole={() => {}}
      />,
    );

    expect(html).toContain('Top Under-$1 Ripple Upgrades');
    expect(html).toContain('Opt');
    expect(html).toContain('$0.25');
    expect(html).toContain('Theme: Spellslinger');
    expect(html).toContain('Theme: Cantrip');
    expect(html).not.toContain('Role: Card Draw');
    expect(html).toContain('+ Add');

    const updatedDraft = addUpgradeCardToAuditDraft(draft, upgradeCard);
    expect(updatedDraft.mainboard[upgradeCard.id]?.quantity).toBe(1);
    expect(computeDeckAnalytics(updatedDraft).totalCount).toBe(2);
    expect(filterAuditUpgradeMatches([{ card: upgradeCard, synergyScore: 68, matchedReasons: [] }], updatedDraft)).toEqual([]);
  });

  it('renders Table QR buttons only for online/unlisted cloud-shareable decks in DeckManagerModal', () => {
    const deck = makeDeck({ name: 'Fixture Brew' });

    const verifiedCloudUser = {
      uid: 'uid-1',
      email: 'brewer@example.com',
      emailVerified: true,
      displayName: 'Brewer',
      providerIds: ['password'],
    };

    const managerBaseProps = {
      open: true,
      initialTab: 'share' as const,
      activeDeck: { ...deck, visibility: 'public' as const },
      savedDecks: [],
      cloudUser: verifiedCloudUser,
      isCloudConfigured: true,
      resolveCards: noopResolveCards,
      onClose: () => {},
      onCreateNewDeck: async () => {},
      onSwitchDeck: async () => {},
      onDuplicateCurrentDeck: async () => {},
      onDeleteDeck: async () => {},
      onImportDeckDraft: () => {},
    };

    const managerPublicWithQr = renderToStaticMarkup(
      <DeckManagerModal {...managerBaseProps} onOpenTableQr={() => {}} />,
    );
    expect(managerPublicWithQr).toContain('Table QR');
    expect(managerPublicWithQr).toContain('Copy Cloud Link');

    const managerUnlistedWithQr = renderToStaticMarkup(
      <DeckManagerModal
        {...managerBaseProps}
        activeDeck={{ ...deck, visibility: 'link' }}
        onOpenTableQr={() => {}}
      />,
    );
    expect(managerUnlistedWithQr).toContain('Table QR');

    const managerPrivate = renderToStaticMarkup(
      <DeckManagerModal
        {...managerBaseProps}
        activeDeck={{ ...deck, visibility: 'private' }}
        onOpenTableQr={() => {}}
      />,
    );
    expect(managerPrivate).not.toContain('Show scannable LGS Table QR code');
    expect(managerPrivate).toContain('Table QR sharing');

    const managerWithoutQr = renderToStaticMarkup(<DeckManagerModal {...managerBaseProps} />);
    expect(managerWithoutQr).not.toContain('Show scannable LGS Table QR code');
  });

  it('handles ONEOFF_SEARCH in SearchWorkerController without overwriting pendingSearch and flushes after indexing', async () => {
    const posted: WorkerResponseMessage[] = [];
    let resolveSync: ((res: SyncCatalogResult) => void) | null = null;

    const controller = new SearchWorkerController((msg) => posted.push(msg), {
      clearCache: async () => {},
      syncCatalog: () =>
        new Promise<SyncCatalogResult>((resolve) => {
          resolveSync = resolve;
        }),
    });

    controller.handleMessage({ type: 'INIT' });
    controller.handleMessage({
      type: 'SEARCH',
      requestId: 10,
      filter: { ...DEFAULT_SEARCH_FILTER, query: 'Sol' },
    });
    controller.handleMessage({
      type: 'ONEOFF_SEARCH',
      requestId: 11,
      filter: {
        ...DEFAULT_SEARCH_FILTER,
        themeQuery: 'spellslinger',
        maxPriceUsd: 1,
        sortBy: 'synergy',
      },
    });
    controller.handleMessage({
      type: 'ONEOFF_SEARCH',
      requestId: 12,
      filter: {
        ...DEFAULT_SEARCH_FILTER,
        themeQuery: 'tokens',
        maxPriceUsd: 1,
        sortBy: 'synergy',
      },
    });

    expect(posted).toEqual([]);

    const sampleCards: CompactCard[] = [
      makeCard({
        id: 'sol-ring',
        name: 'Sol Ring',
        priceUsd: 1.5,
        themes: [],
      }),
      makeCard({
        id: 'budget-spell',
        name: 'Consider',
        priceUsd: 0.45,
        themes: ['spellslinger'],
      }),
      makeCard({
        id: 'budget-token',
        name: 'Raise the Alarm',
        priceUsd: 0.2,
        themes: ['tokens'],
      }),
    ];
    const manifest: DataManifest = {
      version: 'test-v1',
      generatedAt: '2026-11-15T00:00:00.000Z',
      scryfallUpdatedAt: '2026-11-15T00:00:00.000Z',
      totalCards: sampleCards.length,
      commanderCount: 0,
      rawSizeBytes: 100,
      gzipSizeBytes: 50,
      brotliSizeBytes: 40,
      roleCounts: {
        ramp: 0,
        draw: 0,
        removal: 0,
        wipe: 0,
        tutor: 0,
        recursion: 0,
        protection: 0,
      },
      themeCounts: {},
    };

    resolveSync!({ cards: sampleCards, manifest, fromCache: true, loadTimeMs: 5 });
    await Promise.resolve();
    await Promise.resolve();

    const searchRes = posted.find((m) => m.type === 'SEARCH_RESULT');
    expect(searchRes?.type).toBe('SEARCH_RESULT');
    if (searchRes?.type === 'SEARCH_RESULT') {
      expect(searchRes.payload.requestId).toBe(10);
      expect(searchRes.payload.matches.map((m) => m.card.id)).toEqual(['sol-ring']);
    }

    const oneOffResults = posted.filter((m) => m.type === 'ONEOFF_SEARCH_RESULT');
    expect(oneOffResults).toHaveLength(2);
    if (oneOffResults[0]?.type === 'ONEOFF_SEARCH_RESULT') {
      expect(oneOffResults[0].payload.requestId).toBe(11);
      expect(oneOffResults[0].payload.matches.map((m) => m.card.id)).toEqual(['budget-spell']);
    }
    if (oneOffResults[1]?.type === 'ONEOFF_SEARCH_RESULT') {
      expect(oneOffResults[1].payload.requestId).toBe(12);
      expect(oneOffResults[1].payload.matches.map((m) => m.card.id)).toEqual(['budget-token']);
    }

    // Immediate ONEOFF_SEARCH once engine is ready
    const prevSearchCount = posted.filter((m) => m.type === 'SEARCH_RESULT').length;
    controller.handleMessage({
      type: 'ONEOFF_SEARCH',
      requestId: 13,
      filter: {
        ...DEFAULT_SEARCH_FILTER,
        themeQuery: 'tokens',
        maxPriceUsd: 1,
        sortBy: 'synergy',
      },
    });
    expect(posted.filter((m) => m.type === 'SEARCH_RESULT')).toHaveLength(prevSearchCount);
    const immediateRes = posted.at(-1);
    expect(immediateRes?.type).toBe('ONEOFF_SEARCH_RESULT');
    if (immediateRes?.type === 'ONEOFF_SEARCH_RESULT') {
      expect(immediateRes.payload.requestId).toBe(13);
      expect(immediateRes.payload.matches.map((m) => m.card.id)).toEqual(['budget-token']);
    }

    // Error recovery: queued ONEOFF_SEARCH flushes with empty result on catalog init failure,
    // and subsequent ONEOFF_SEARCH / SEARCH calls after init failure resolve immediately without hanging.
    let shouldFailSync = true;
    const failedPosts: WorkerResponseMessage[] = [];
    const failingController = new SearchWorkerController((msg) => failedPosts.push(msg), {
      clearCache: async () => {},
      syncCatalog: async () => {
        if (shouldFailSync) {
          throw new Error('Network offline');
        }
        return { cards: sampleCards, manifest, fromCache: false, loadTimeMs: 5 };
      },
    });
    failingController.handleMessage({ type: 'INIT' });
    failingController.handleMessage({
      type: 'ONEOFF_SEARCH',
      requestId: 99,
      filter: DEFAULT_SEARCH_FILTER,
    });
    await new Promise((r) => setTimeout(r, 0));
    const emptyOneOff = failedPosts.find((m) => m.type === 'ONEOFF_SEARCH_RESULT');
    expect(emptyOneOff?.type).toBe('ONEOFF_SEARCH_RESULT');
    if (emptyOneOff?.type === 'ONEOFF_SEARCH_RESULT') {
      expect(emptyOneOff.payload.requestId).toBe(99);
      expect(emptyOneOff.payload.matches).toEqual([]);
    }

    // Subsequent searches arriving while in failed init state reply immediately with empty results
    failingController.handleMessage({
      type: 'ONEOFF_SEARCH',
      requestId: 100,
      filter: DEFAULT_SEARCH_FILTER,
    });
    failingController.handleMessage({
      type: 'SEARCH',
      requestId: 101,
      filter: DEFAULT_SEARCH_FILTER,
    });
    const postErrorOneOff = failedPosts.find(
      (m) => m.type === 'ONEOFF_SEARCH_RESULT' && m.payload.requestId === 100,
    );
    const postErrorSearch = failedPosts.find(
      (m) => m.type === 'SEARCH_RESULT' && m.payload.requestId === 101,
    );
    expect(postErrorOneOff?.type).toBe('ONEOFF_SEARCH_RESULT');
    if (postErrorOneOff?.type === 'ONEOFF_SEARCH_RESULT') {
      expect(postErrorOneOff.payload.matches).toEqual([]);
    }
    expect(postErrorSearch?.type).toBe('SEARCH_RESULT');
    if (postErrorSearch?.type === 'SEARCH_RESULT') {
      expect(postErrorSearch.payload.matches).toEqual([]);
    }

    // FORCE_RESYNC resets hasInitError so queued ONEOFF_SEARCH resolves cleanly once retry succeeds
    shouldFailSync = false;
    failingController.handleMessage({ type: 'FORCE_RESYNC' });
    failingController.handleMessage({
      type: 'ONEOFF_SEARCH',
      requestId: 102,
      filter: {
        ...DEFAULT_SEARCH_FILTER,
        themeQuery: 'spellslinger',
        maxPriceUsd: 1,
        sortBy: 'synergy',
      },
    });
    await new Promise((r) => setTimeout(r, 0));
    const recoveredOneOff = failedPosts.find(
      (m) => m.type === 'ONEOFF_SEARCH_RESULT' && m.payload.requestId === 102,
    );
    expect(recoveredOneOff?.type).toBe('ONEOFF_SEARCH_RESULT');
    if (recoveredOneOff?.type === 'ONEOFF_SEARCH_RESULT') {
      expect(recoveredOneOff.payload.matches.map((m) => m.card.id)).toEqual(['budget-spell']);
    }
  });

  it('renders CardDetailModal with Rules Text and EDHREC rank while omitting Copies badge and singleton limit warning', () => {
    const commandTower = makeCard({
      id: 'command-tower',
      name: 'Command Tower',
      typeLine: 'Land',
      oracleText: "{T}: Add one mana of any color in your commander's color identity.",
      cmc: 0,
      priceUsd: 0.32,
      edhrecRank: 2,
    });

    const inDeckHtml = renderToStaticMarkup(
      <CardDetailModal
        match={{ card: commandTower, synergyScore: 0, matchedReasons: [] }}
        commanders={[]}
        enforceColorIdentity={false}
        quantityInDeck={1}
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

    expect(inDeckHtml).toContain('Rules Text');
    expect(inDeckHtml).not.toContain('Oracle Rules Text');
    expect(inDeckHtml).not.toContain('Copies:');
    expect(inDeckHtml).not.toContain('Singleton (1)');
    expect(inDeckHtml).toContain('EDHREC #2');
    expect(inDeckHtml).toContain('In Deck');
    expect(inDeckHtml).not.toContain('In Deck (1)');
    expect(inDeckHtml).not.toContain('Singleton limit (1 copy)');

    for (const viewMode of ['standard', 'compact', 'detailed'] as const) {
      const tileInDeckHtml = renderToStaticMarkup(
        <CardTile
          match={{ card: commandTower, synergyScore: 0, matchedReasons: [] }}
          viewMode={viewMode}
          quantityInDeck={1}
          isCommander={false}
          canAddAsPartner={false}
          canAddMore={false}
          addBlockedReason="Singleton limit (1 copy)"
          onInspect={() => {}}
          onAddCard={() => {}}
          onRemoveOneCard={() => {}}
          onSetCommander={() => {}}
          onAddPartner={() => {}}
        />,
      );
      expect(tileInDeckHtml).toContain('In Deck');
      expect(tileInDeckHtml).toContain('aria-label="Remove one copy from deck"');
      expect(tileInDeckHtml).not.toContain('In Deck (1)');
      expect(tileInDeckHtml).not.toContain('Singleton limit (1 copy)');
    }
  });

  it('renders ActiveFilterBar Showing X of Y cards without executionTimeMs telemetry', () => {
    const html = renderToStaticMarkup(
      <ActiveFilterBar
        filter={DEFAULT_SEARCH_FILTER}
        searchResult={{
          requestId: 1,
          matches: [],
          totalMatches: 81,
          page: 1,
          pageSize: 60,
          totalPages: 2,
          executionTimeMs: 6.5,
        }}
        isSearching={false}
        viewMode="standard"
        onViewModeChange={() => {}}
        onUpdateFilter={() => {}}
        onResetFilters={() => {}}
      />,
    );

    expect(html).toContain('Showing');
    expect(html).toContain('81');
    expect(html).toContain('cards');
    expect(html).not.toContain('6.5 ms');
    expect(html).not.toContain('ms)');
  });

  it('renders clickable deck rows without a separate Load button in DeckManagerModal Decks tab', () => {
    const activeDeck = makeDeck({ id: 'deck-active', name: 'Active Brew' });
    const inactiveDeck = makeDeck({ id: 'deck-other', name: 'Other Brew' });

    const html = renderToStaticMarkup(
      <DeckManagerModal
        open
        initialTab="decks"
        activeDeck={activeDeck}
        savedDecks={[
          {
            id: activeDeck.id,
            name: activeDeck.name,
            commanderIds: [],
            mainboard: {},
            sideboard: {},
            createdAt: activeDeck.createdAt,
            updatedAt: activeDeck.updatedAt,
          },
          {
            id: inactiveDeck.id,
            name: inactiveDeck.name,
            commanderIds: [],
            mainboard: {},
            sideboard: {},
            createdAt: inactiveDeck.createdAt,
            updatedAt: inactiveDeck.updatedAt,
          },
        ]}
        resolveCards={noopResolveCards}
        onClose={() => {}}
        onCreateNewDeck={async () => {}}
        onSwitchDeck={async () => {}}
        onDuplicateCurrentDeck={async () => {}}
        onDeleteDeck={async () => {}}
        onImportDeckDraft={() => {}}
      />,
    );

    expect(html).toContain('aria-label="Load deck Other Brew"');
    expect(html).not.toContain('aria-label="Load deck Active Brew"');
    expect(html).not.toContain('>Load</button>');
  });

  it('clips card corners proportionally across CardTile modes, CardDetailModal, DeckWorkspace, and SharedDeckBanner', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    expect(css).toContain('.mtg-card-corners');
    expect(css).toContain('border-radius: 5% / 3.6%');

    const rats = makeCard({
      id: 'relentless-rats',
      name: 'Relentless Rats',
      imageNormal: 'https://cards.scryfall.io/normal/front/a/2/a25-rats.jpg',
      imageSmall: 'https://cards.scryfall.io/small/front/a/2/a25-rats.jpg',
      maxCopies: null,
    });
    const cmd = makeCard({
      id: 'vren',
      name: 'Vren, the Relentless',
      isCommanderEligible: true,
      imageNormal: 'https://cards.scryfall.io/normal/front/b/l/blb-vren.jpg',
      imageSmall: 'https://cards.scryfall.io/small/front/b/l/blb-vren.jpg',
      faces: [
        {
          name: 'Vren Front',
          manaCost: '{2}{U}{B}',
          typeLine: 'Legendary Creature — Rat Rogue',
          oracleText: 'Ward {2}',
          imageNormal: 'https://cards.scryfall.io/normal/front/b/l/blb-vren.jpg',
          imageSmall: 'https://cards.scryfall.io/small/front/b/l/blb-vren.jpg',
        },
        {
          name: 'Vren Back',
          manaCost: '',
          typeLine: 'Legendary Creature',
          oracleText: '',
          imageNormal: 'https://cards.scryfall.io/normal/back/b/l/blb-vren.jpg',
          imageSmall: 'https://cards.scryfall.io/small/back/b/l/blb-vren.jpg',
        },
      ],
    });
    const noImage = makeCard({ id: 'no-img', name: 'Placeholder Card', imageNormal: '', imageSmall: '' });

    for (const viewMode of ['standard', 'compact', 'detailed'] as const) {
      for (const card of [rats, cmd, noImage]) {
        const tileHtml = renderToStaticMarkup(
          <CardTile
            match={{ card, synergyScore: 0, matchedReasons: [] }}
            viewMode={viewMode}
            quantityInDeck={card.id === 'relentless-rats' ? 3 : 0}
            isCommander={false}
            canAddAsPartner={false}
            canAddMore
            onInspect={() => {}}
            onAddCard={() => {}}
            onRemoveOneCard={() => {}}
            onSetCommander={() => {}}
            onAddPartner={() => {}}
          />,
        );
        expect(tileHtml).toContain('mtg-card-corners');
        if (card.imageNormal) {
          expect(tileHtml).toContain('scale-[1.015]');
        }
      }
    }

    const modalHtml = renderToStaticMarkup(
      <CardDetailModal
        match={{ card: rats, synergyScore: 0, matchedReasons: [] }}
        commanders={[]}
        enforceColorIdentity={false}
        quantityInDeck={1}
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
    expect(modalHtml).toContain('mtg-card-corners');
    expect(modalHtml).toContain('scale-[1.015]');

    const deck = makeDeck({ name: 'Rat Colony', commanders: [cmd] });
    const workspaceHtml = renderToStaticMarkup(
      <DeckWorkspace
        deck={deck}
        analytics={computeDeckAnalytics(deck)}
        totalDeckPriceUsd={0}
        combinedColorIdentity={['U', 'B']}
        basicLands={{}}
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
    expect(workspaceHtml).toContain('mtg-card-corners');
    expect(workspaceHtml).toContain('scale-[1.015]');

    const sharedHtml = renderToStaticMarkup(
      <SharedDeckBanner
        sharedDeck={{
          id: 'shared-1',
          ownerUid: 'uid-1',
          ownerHandle: 'ratking',
          name: 'Rat Deck',
          description: '',
          visibility: 'public',
          sharedWithUids: [],
          commanderOracleIds: ['vren'],
          colorIdentity: ['U', 'B'],
          mainboard: {},
          sideboard: {},
          synergyThemes: [],
          cardCount: 100,
          lockSearchToCommanderIdentity: true,
          revision: 1,
          createdAt: '2026-11-16T00:00:00.000Z',
          updatedAt: '2026-11-16T00:00:00.000Z',
          deletedAt: null,
        }}
        commanders={[cmd]}
        loading={false}
        error={null}
        onCloneIntoStudio={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(sharedHtml).toContain('mtg-card-corners');
    expect(sharedHtml).toContain('scale-[1.015]');
  });
});
