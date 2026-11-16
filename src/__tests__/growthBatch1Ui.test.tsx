import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { hasAuthReturnIntent, hasCloudUrlIntent } from '../App.js';
import {
  auditRoleTargets,
  DeckAuditModal,
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
import { computeDeckAnalytics, ROLE_TARGETS } from '../deck/deckAnalytics.js';
import type { CompactCard, ManaColor } from '../types/card.js';
import type { DeckDraft } from '../types/deck.js';
import type { SyncStatusPayload } from '../types/search.js';

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
      searchResult: null,
      onOpenMobileFilters: () => {},
      onOpenDeckDrawer: () => {},
      onOpenDeckManager: () => {},
      onMatchCommanderSynergy: () => {},
      onFindPartner: () => {},
      onClearCommanders: () => {},
      onForceResync: () => {},
    };

    const withAuditHtml = renderToStaticMarkup(
      <HeaderBar {...baseProps} onOpenAudit={() => {}} />,
    );
    expect(withAuditHtml).toContain('data-testid="ripple99-logo"');
    expect(withAuditHtml).toContain('Ripple99');
    expect(withAuditHtml).toContain('Build Decks, Not Piles');
    expect(withAuditHtml).not.toContain('Commander Builder Ultra');
    expect(withAuditHtml).toContain('>Audit<');

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

  it('renders Export PNG buttons in DeckWorkspace and DeckManagerModal Share tab', () => {
    const deck = makeDeck({ name: 'Export Button Test' });
    const analytics = computeDeckAnalytics(deck);

    const workspaceHtml = renderToStaticMarkup(
      <DeckWorkspace
        deck={deck}
        analytics={analytics}
        totalDeckPriceUsd={0}
        combinedColorIdentity={[]}
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
        onBackToSearch={() => {}}
        onChooseCommander={() => {}}
        onInspectCard={() => {}}
      />,
    );
    expect(workspaceHtml).toContain('Share Link');
    expect(workspaceHtml).toContain('Export PNG');

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
});
