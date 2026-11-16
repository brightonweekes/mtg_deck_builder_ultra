import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildDeckOgHtml,
  escapeHtml,
  isSocialPreviewBot,
  onRequestGet,
  onRequestHead,
  parseFirestoreDeckRestDoc,
  parseShareQuery,
  resetEdgeOgCacheForTesting,
  type PagesAssetsBinding,
  type PagesEventContext,
} from '../../functions/index.js';
import {
  buildCommandersOgIndex,
  resolveCommanderOgEntry,
  SCRYFALL_IMAGE_PREFIX,
  type CommandersOgIndex,
} from '../../scripts/lib/commanders-og.js';
import { encodeDeckToUrlParam } from '../deck/urlCodec.js';
import type { CompactCard } from '../types/card.js';
import type { DeckDraft } from '../types/deck.js';

function makeCard(overrides: Partial<CompactCard> = {}): CompactCard {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    oracleId: '22222222-2222-4222-8222-222222222222',
    name: "Atraxa, Praetors' Voice",
    manaCost: '{G}{W}{U}{B}',
    cmc: 4,
    typeLine: 'Legendary Creature — Phyrexian Angel Horror',
    oracleText: 'Flying, vigilance, deathtouch, lifelink',
    colors: ['W', 'U', 'B', 'G'],
    colorIdentity: ['W', 'U', 'B', 'G'],
    keywords: ['Flying', 'Vigilance', 'Deathtouch', 'Lifelink'],
    edhrecRank: 1,
    priceUsd: 18.5,
    imageNormal: `${SCRYFALL_IMAGE_PREFIX}normal/front/1/1/atraxa.jpg`,
    imageSmall: `${SCRYFALL_IMAGE_PREFIX}small/front/1/1/atraxa.jpg`,
    layout: 'normal',
    isCommanderEligible: true,
    roles: [],
    themes: ['counters'],
    ...overrides,
  };
}

function makeDeckDraft(overrides: Partial<DeckDraft> = {}): DeckDraft {
  const now = '2026-11-15T12:00:00.000Z';
  return {
    id: 'deck_1',
    name: 'Atraxa Superfriends',
    commanders: [makeCard()],
    mainboard: {
      '99999999-9999-4999-8999-999999999999': {
        card: makeCard({
          id: '99999999-9999-4999-8999-999999999999',
          oracleId: '88888888-8888-4888-8888-888888888888',
          name: 'Sol Ring',
          isCommanderEligible: false,
          colorIdentity: [],
        }),
        quantity: 99,
      },
    },
    sideboard: {},
    lockSearchToCommanderIdentity: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeSampleOgIndex(): CommandersOgIndex {
  const atraxa = makeCard();
  const thrasios = makeCard({
    id: '33333333-3333-4333-8333-333333333333',
    oracleId: '44444444-4444-4444-8444-444444444444',
    name: 'Thrasios, Triton Hero',
    colorIdentity: ['G', 'U'],
    imageNormal: `${SCRYFALL_IMAGE_PREFIX}normal/front/3/3/thrasios.jpg`,
    partnerType: 'partner',
  });
  const tymna = makeCard({
    id: '55555555-5555-4555-8555-555555555555',
    oracleId: '66666666-6666-4666-8666-666666666666',
    name: 'Tymna the Weaver',
    colorIdentity: ['B', 'W'],
    imageNormal: `${SCRYFALL_IMAGE_PREFIX}normal/front/5/5/tymna.jpg`,
    partnerType: 'partner',
  });
  const kozilek = makeCard({
    id: '77777777-7777-4777-8777-777777777777',
    oracleId: '77777777-7777-4777-8777-777777777778',
    name: 'Kozilek, Butcher of Truth',
    colorIdentity: [],
    imageNormal: `${SCRYFALL_IMAGE_PREFIX}normal/front/7/7/kozilek.jpg`,
  });
  const nonCommander = makeCard({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    oracleId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    name: 'Sol Ring',
    isCommanderEligible: false,
  });

  return buildCommandersOgIndex([atraxa, thrasios, tymna, kozilek, nonCommander]);
}

function createContext(
  url: string,
  options: {
    method?: string;
    userAgent?: string | null;
    ogIndex?: CommandersOgIndex;
    assetsStatus?: number;
    env?: Record<string, unknown>;
  } = {},
) {
  const headers = new Headers();
  if (options.userAgent !== null && options.userAgent !== undefined) {
    headers.set('user-agent', options.userAgent);
  }
  const request = new Request(url, {
    method: options.method ?? 'GET',
    headers,
  });

  const ogIndex = options.ogIndex ?? makeSampleOgIndex();
  const assetsFetch = vi.fn(async () => {
    const status = options.assetsStatus ?? 200;
    if (status >= 400) {
      return new Response('Not Found', { status });
    }
    return new Response(JSON.stringify(ogIndex), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const next = vi.fn(async () => new Response('SPA_PASSTHROUGH', { status: 200 }));
  const assets: PagesAssetsBinding = { fetch: assetsFetch };

  const context: PagesEventContext = {
    request,
    env: {
      ASSETS: assets,
      ...options.env,
    },
    next,
  };

  return { context, assetsFetch, next };
}

beforeEach(() => {
  resetEdgeOgCacheForTesting();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Commanders OG index builder & resolver', () => {
  it('deduplicates rows, strips Scryfall prefix, excludes non-commanders, and restores URLs on lookup', () => {
    const customCmdA = makeCard({
      id: 'id-a',
      oracleId: 'oracle-shared',
      name: 'Shared Commander',
      colorIdentity: ['G', 'U'],
      imageNormal: `${SCRYFALL_IMAGE_PREFIX}normal/front/s/h/shared.jpg`,
    });
    const customCmdB = makeCard({
      id: 'id-b',
      oracleId: 'oracle-shared',
      name: 'Shared Commander',
      colorIdentity: ['U', 'G'],
      imageNormal: `${SCRYFALL_IMAGE_PREFIX}normal/front/s/h/shared.jpg`,
    });
    const dfcNoTopImage = makeCard({
      id: 'id-dfc',
      oracleId: 'oracle-dfc',
      name: 'DFC Commander // Back',
      colorIdentity: [],
      imageNormal: '',
      faces: [
        {
          name: 'DFC Commander',
          manaCost: '{2}',
          typeLine: 'Legendary Creature',
          oracleText: '',
          imageNormal: 'https://cdn.example.com/custom-dfc.jpg',
        },
      ],
    });
    const regular99 = makeCard({
      id: 'id-99',
      oracleId: 'oracle-99',
      name: 'Arcane Signet',
      isCommanderEligible: false,
    });

    const index = buildCommandersOgIndex([customCmdA, customCmdB, dfcNoTopImage, regular99]);

    expect(index.rows).toHaveLength(2);
    expect(index.rows[0]).toEqual(['Shared Commander', 'UG', 'normal/front/s/h/shared.jpg']);
    expect(index.rows[1]).toEqual(['DFC Commander // Back', 'C', 'https://cdn.example.com/custom-dfc.jpg']);

    expect(resolveCommanderOgEntry(index, 'id-a')).toEqual({
      name: 'Shared Commander',
      colorIdentity: 'UG',
      imageUrl: `${SCRYFALL_IMAGE_PREFIX}normal/front/s/h/shared.jpg`,
    });
    expect(resolveCommanderOgEntry(index, 'oracle-shared')).toEqual({
      name: 'Shared Commander',
      colorIdentity: 'UG',
      imageUrl: `${SCRYFALL_IMAGE_PREFIX}normal/front/s/h/shared.jpg`,
    });
    expect(resolveCommanderOgEntry(index, 'id-dfc')).toEqual({
      name: 'DFC Commander // Back',
      colorIdentity: 'C',
      imageUrl: 'https://cdn.example.com/custom-dfc.jpg',
    });

    expect(resolveCommanderOgEntry(index, 'id-99')).toBeNull();
    expect(resolveCommanderOgEntry(index, '__proto__')).toBeNull();
    expect(resolveCommanderOgEntry(index, 'constructor')).toBeNull();
  });
});

describe('isSocialPreviewBot & parseShareQuery', () => {
  it('matches all supported social preview and search crawler User-Agents', () => {
    const botAgents = [
      'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
      'Twitterbot/1.0',
      'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
      'Mozilla/5.0 (compatible; redditbot/1.0; +http://www.reddit.com/feedback)',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'Facebot',
      'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
      'WhatsApp/2.23.20.0 A',
      'TelegramBot (like TwitterBot)',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)',
      'Embedly/0.2 (+http://support.embed.ly/)',
      'SkypeUriPreview Preview/0.5',
      'Mattermost-Bot/1.0',
      'Iframely/1.3.1 (+https://iframely.com/)',
      'vkShare (+http://vk.com/dev/Share)',
      'Pinterest/0.2 (+https://www.pinterest.com/bot.html)',
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    ];

    for (const ua of botAgents) {
      expect(isSocialPreviewBot(ua)).toBe(true);
    }
  });

  it('rejects normal desktop/mobile browser User-Agents and empty headers', () => {
    const humanAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
      'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
      '',
      '   ',
      null,
      undefined,
    ];

    for (const ua of humanAgents) {
      expect(isSocialPreviewBot(ua)).toBe(false);
    }
  });

  it('parses ?d= and ?deck= share query parameters and flags invalid deck IDs', () => {
    expect(parseShareQuery('https://ripple99.pages.dev/')).toBeNull();
    expect(parseShareQuery('https://ripple99.pages.dev/?addFriend=alice')).toBeNull();
    expect(parseShareQuery('https://ripple99.pages.dev/?d=   ')).toBeNull();
    expect(parseShareQuery('https://ripple99.pages.dev/?deck=')).toBeNull();

    expect(parseShareQuery('https://ripple99.pages.dev/?d=AQAA123_abc-def')).toEqual({
      kind: 'd',
      encoded: 'AQAA123_abc-def',
    });

    expect(parseShareQuery('https://ripple99.pages.dev/?deck=valid-Deck_01')).toEqual({
      kind: 'deck',
      deckId: 'valid-Deck_01',
      isValidId: true,
    });

    expect(parseShareQuery('https://ripple99.pages.dev/?deck=../evil/path')).toEqual({
      kind: 'deck',
      deckId: '../evil/path',
      isValidId: false,
    });
    expect(parseShareQuery(`https://ripple99.pages.dev/?deck=${'a'.repeat(129)}`)).toEqual({
      kind: 'deck',
      deckId: 'a'.repeat(129),
      isValidId: false,
    });
  });
});

describe('Pass-through & HEAD handling', () => {
  it('calls context.next() immediately for normal browsers even with ?d= or ?deck=', async () => {
    const browserUa =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
    const dParam = encodeDeckToUrlParam(makeDeckDraft());

    const caseD = createContext(`https://ripple99.pages.dev/?d=${dParam}`, { userAgent: browserUa });
    const resD = await onRequestGet(caseD.context);
    expect(await resD.text()).toBe('SPA_PASSTHROUGH');
    expect(caseD.next).toHaveBeenCalledTimes(1);
    expect(caseD.assetsFetch).not.toHaveBeenCalled();

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const caseDeck = createContext('https://ripple99.pages.dev/?deck=deck_abc', {
      userAgent: browserUa,
      env: { FIREBASE_PROJECT_ID: 'ripple99-prod' },
    });
    const resDeck = await onRequestGet(caseDeck.context);
    expect(await resDeck.text()).toBe('SPA_PASSTHROUGH');
    expect(caseDeck.next).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('calls context.next() for bots when neither ?d= nor ?deck= is present', async () => {
    const caseRoot = createContext('https://ripple99.pages.dev/?addFriend=alice', {
      userAgent: 'Discordbot/2.0',
    });
    const res = await onRequestGet(caseRoot.context);
    expect(await res.text()).toBe('SPA_PASSTHROUGH');
    expect(caseRoot.next).toHaveBeenCalledTimes(1);
    expect(caseRoot.assetsFetch).not.toHaveBeenCalled();
  });

  it('handles HEAD cleanly: passes through for browsers and returns headers without body for bots', async () => {
    const dParam = encodeDeckToUrlParam(makeDeckDraft());

    const browserHead = createContext(`https://ripple99.pages.dev/?d=${dParam}`, {
      method: 'HEAD',
      userAgent: 'Mozilla/5.0 Chrome/131.0',
    });
    const browserRes = await onRequestHead(browserHead.context);
    expect(browserHead.next).toHaveBeenCalledTimes(1);
    expect(await browserRes.text()).toBe('SPA_PASSTHROUGH');

    const botHead = createContext(`https://ripple99.pages.dev/?d=${dParam}`, {
      method: 'HEAD',
      userAgent: 'Slackbot-LinkExpanding 1.0',
    });
    const botRes = await onRequestHead(botHead.context);
    expect(botHead.next).not.toHaveBeenCalled();
    expect(botRes.status).toBe(200);
    expect(botRes.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(botRes.headers.get('cache-control')).toBe('public, max-age=300');
    expect(Number(botRes.headers.get('content-length'))).toBeGreaterThan(100);
    expect(await botRes.text()).toBe('');
  });
});

describe('?d= URL deck unfurling', () => {
  it('renders rich OG tags for binary-encoded single-commander deck and caches commanders-og.json', async () => {
    const dParam = encodeDeckToUrlParam(makeDeckDraft());
    const first = createContext(`https://ripple99.pages.dev/?d=${dParam}`, {
      userAgent: 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    });

    const res1 = await onRequestGet(first.context);
    const html1 = await res1.text();

    expect(res1.status).toBe(200);
    expect(res1.headers.get('cache-control')).toBe('public, max-age=300');
    expect(first.assetsFetch).toHaveBeenCalledTimes(1);
    expect(html1).toContain('Atraxa Superfriends — Ripple99 Commander Deck');
    expect(html1).toContain("Commander: Atraxa, Praetors&#39; Voice [WUBG]");
    expect(html1).toContain('100 cards');
    expect(html1).toContain(
      `<meta property="og:image" content="${SCRYFALL_IMAGE_PREFIX}normal/front/1/1/atraxa.jpg" />`,
    );
    expect(html1).toContain('<meta name="twitter:card" content="summary_large_image" />');

    // Second invocation reuses module-level cached commanders-og.json without calling ASSETS.fetch again
    const second = createContext(`https://ripple99.pages.dev/?d=${dParam}`, {
      userAgent: 'Twitterbot/1.0',
    });
    const res2 = await onRequestGet(second.context);
    expect(res2.status).toBe(200);
    expect(second.assetsFetch).not.toHaveBeenCalled();
  });

  it('combines partner commanders and supports JSON j_ fallback encoding', async () => {
    const thrasios = makeCard({
      id: 'non-uuid-thrasios',
      oracleId: '44444444-4444-4444-8444-444444444444',
      name: 'Thrasios, Triton Hero',
      colorIdentity: ['G', 'U'],
      imageNormal: `${SCRYFALL_IMAGE_PREFIX}normal/front/3/3/thrasios.jpg`,
    });
    const tymna = makeCard({
      id: 'non-uuid-tymna',
      oracleId: '66666666-6666-4666-8666-666666666666',
      name: 'Tymna the Weaver',
      colorIdentity: ['B', 'W'],
      imageNormal: `${SCRYFALL_IMAGE_PREFIX}normal/front/5/5/tymna.jpg`,
    });
    const customIndex = buildCommandersOgIndex([thrasios, tymna]);
    const partnerDraft = makeDeckDraft({
      name: 'TnT Farm',
      commanders: [thrasios, tymna],
      mainboard: {
        'sol-ring': {
          card: makeCard({ id: 'sol-ring', isCommanderEligible: false }),
          quantity: 1,
        },
        forest: {
          card: makeCard({ id: 'forest', isCommanderEligible: false }),
          quantity: 97,
        },
      },
    });

    const jParam = encodeDeckToUrlParam(partnerDraft);
    expect(jParam.startsWith('j_')).toBe(true);

    const { context } = createContext(`https://ripple99.pages.dev/?d=${jParam}`, {
      userAgent: 'TelegramBot (like TwitterBot)',
      ogIndex: customIndex,
    });
    const html = await (await onRequestGet(context)).text();

    expect(html).toContain('TnT Farm — Ripple99 Commander Deck');
    expect(html).toContain('Commanders: Thrasios, Triton Hero &amp; Tymna the Weaver [WUBG]');
    expect(html).toContain('100 cards');
    expect(html).toContain(`${SCRYFALL_IMAGE_PREFIX}normal/front/3/3/thrasios.jpg`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });

  it('uses summary twitter:card without og:image for decks with no commander', async () => {
    const noCmdDraft = makeDeckDraft({
      name: 'Mystery Pile',
      commanders: [],
      mainboard: {
        '99999999-9999-4999-8999-999999999999': {
          card: makeCard({
            id: '99999999-9999-4999-8999-999999999999',
            isCommanderEligible: false,
          }),
          quantity: 42,
        },
      },
    });
    const dParam = encodeDeckToUrlParam(noCmdDraft);
    const { context } = createContext(`https://ripple99.pages.dev/?d=${dParam}`, {
      userAgent: 'redditbot/1.0',
    });
    const html = await (await onRequestGet(context)).text();

    expect(html).toContain('Mystery Pile — Ripple99 Commander Deck');
    expect(html).toContain('42 cards');
    expect(html).not.toContain('og:image');
    expect(html).toContain('<meta name="twitter:card" content="summary" />');
  });
});

describe('?deck= Firestore REST parsing & unfurling', () => {
  it('parses public and link decks and rejects private, friends, and soft-deleted docs', () => {
    const publicDoc = {
      name: 'projects/ripple99/databases/(default)/documents/decks/deck_public',
      fields: {
        id: { stringValue: 'deck_public' },
        name: { stringValue: 'Kozilek Ramp' },
        ownerHandle: { stringValue: 'eldrazi_fan' },
        description: { stringValue: 'Big colorless mana rocks' },
        commanderOracleIds: {
          arrayValue: { values: [{ stringValue: '77777777-7777-4777-8777-777777777778' }] },
        },
        colorIdentity: { arrayValue: {} },
        cardCount: { integerValue: '100' },
        visibility: { stringValue: 'public' },
        deletedAt: { nullValue: null },
      },
    };

    expect(parseFirestoreDeckRestDoc(publicDoc)).toEqual({
      id: 'deck_public',
      name: 'Kozilek Ramp',
      ownerHandle: 'eldrazi_fan',
      description: 'Big colorless mana rocks',
      commanderOracleIds: ['77777777-7777-4777-8777-777777777778'],
      colorIdentity: [],
      synergyThemes: [],
      cardCount: 100,
      visibility: 'public',
    });

    const linkDocWithoutCardCount = {
      name: 'projects/ripple99/databases/(default)/documents/decks/deck_link',
      fields: {
        name: { stringValue: 'Unlisted Brew' },
        commanderOracleIds: {
          arrayValue: { values: [{ stringValue: '22222222-2222-4222-8222-222222222222' }] },
        },
        colorIdentity: {
          arrayValue: {
            values: [
              { stringValue: 'W' },
              { stringValue: 'U' },
              { stringValue: 'B' },
              { stringValue: 'G' },
            ],
          },
        },
        mainboard: {
          mapValue: {
            fields: {
              'oracle-sol-ring': { integerValue: '1' },
              'oracle-forest': { integerValue: '98' },
            },
          },
        },
        visibility: { stringValue: 'link' },
      },
    };

    expect(parseFirestoreDeckRestDoc(linkDocWithoutCardCount)).toEqual({
      id: 'deck_link',
      name: 'Unlisted Brew',
      commanderOracleIds: ['22222222-2222-4222-8222-222222222222'],
      colorIdentity: ['W', 'U', 'B', 'G'],
      synergyThemes: [],
      cardCount: 100,
      visibility: 'link',
    });

    expect(
      parseFirestoreDeckRestDoc({
        fields: { ...publicDoc.fields, visibility: { stringValue: 'private' } },
      }),
    ).toBeNull();

    expect(
      parseFirestoreDeckRestDoc({
        fields: { ...publicDoc.fields, visibility: { stringValue: 'friends' } },
      }),
    ).toBeNull();

    expect(
      parseFirestoreDeckRestDoc({
        fields: {
          ...publicDoc.fields,
          deletedAt: { stringValue: '2026-11-15T12:00:00.000Z' },
        },
      }),
    ).toBeNull();
  });

  it('fetches Firestore REST with 1500ms timeout and renders OG tags for public/link decks', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          fields: {
            id: { stringValue: 'cloud_123' },
            name: { stringValue: 'Cloud Atraxa' },
            ownerHandle: { stringValue: 'planeswalker' },
            commanderOracleIds: {
              arrayValue: {
                values: [{ stringValue: '22222222-2222-4222-8222-222222222222' }],
              },
            },
            colorIdentity: {
              arrayValue: {
                values: [
                  { stringValue: 'W' },
                  { stringValue: 'U' },
                  { stringValue: 'B' },
                  { stringValue: 'G' },
                ],
              },
            },
            cardCount: { integerValue: '100' },
            visibility: { stringValue: 'link' },
            deletedAt: { nullValue: null },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { context } = createContext('https://ripple99.pages.dev/?deck=cloud_123', {
      userAgent: 'facebookexternalhit/1.1',
      env: { VITE_FIREBASE_PROJECT_ID: 'ripple99-test' },
    });

    const res = await onRequestGet(context);
    const html = await res.text();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0]!;
    expect(calledUrl).toBe(
      'https://firestore.googleapis.com/v1/projects/ripple99-test/databases/(default)/documents/decks/cloud_123',
    );
    expect(calledInit?.signal).toBeInstanceOf(AbortSignal);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect(html).toContain('Cloud Atraxa — Ripple99 Commander Deck');
    expect(html).toContain("Commander: Atraxa, Praetors&#39; Voice [WUBG]");
    expect(html).toContain('by @planeswalker');
    expect(html).toContain(`${SCRYFALL_IMAGE_PREFIX}normal/front/1/1/atraxa.jpg`);
    expect(html).toContain('summary_large_image');
  });

  it('masks private decks, 403 responses, timeouts, and invalid deck IDs cleanly', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            fields: {
              name: { stringValue: 'Top Secret Combo' },
              visibility: { stringValue: 'private' },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('Forbidden', { status: 403 }))
      .mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'));

    for (const deckId of ['secret_1', 'forbidden_2', 'timeout_3']) {
      const { context } = createContext(`https://ripple99.pages.dev/?deck=${deckId}`, {
        userAgent: 'Discordbot/2.0',
        env: { FIREBASE_PROJECT_ID: 'ripple99-test' },
      });
      const res = await onRequestGet(context);
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('public, max-age=300');
      expect(html).toContain('Ripple99 — Shared Commander Deck');
      expect(html).not.toContain('Top Secret Combo');
      expect(html).toContain('<meta name="twitter:card" content="summary" />');
    }
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    // Invalid ID skips Firestore fetch completely
    const badId = createContext('https://ripple99.pages.dev/?deck=../secret', {
      userAgent: 'Discordbot/2.0',
      env: { FIREBASE_PROJECT_ID: 'ripple99-test' },
    });
    const badHtml = await (await onRequestGet(badId.context)).text();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(badHtml).toContain('Ripple99 — Shared Commander Deck');
  });
});

describe('HTML & attribute XSS escaping', () => {
  it('escapes &, <, >, ", and \' across all dynamic meta tags and blocks unsafe image URLs', () => {
    expect(escapeHtml(`a & b < c > d " e ' f`)).toBe(
      'a &amp; b &lt; c &gt; d &quot; e &#39; f',
    );

    const maliciousHtml = buildDeckOgHtml({
      title: `Deck " onmouseover="alert(1)<script>alert('xss')</script> & more`,
      description: `<img src=x onerror="steal()"> & 'quoted'`,
      url: 'https://ripple99.pages.dev/?d=abc&foo="bar"',
      imageUrl: 'javascript:alert(1)',
      siteName: `Ripple99'"><script>`,
    });

    expect(maliciousHtml).not.toContain('<script>');
    expect(maliciousHtml).not.toContain('<img ');
    expect(maliciousHtml).not.toContain('javascript:');
    expect(maliciousHtml).not.toContain('" onmouseover="');
    expect(maliciousHtml).not.toContain('og:image');
    expect(maliciousHtml).toContain('<meta name="twitter:card" content="summary" />');
    expect(maliciousHtml).toContain('&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;');
    expect(maliciousHtml).toContain('&quot; onmouseover=&quot;');
    expect(maliciousHtml).toContain('Ripple99&#39;&quot;&gt;&lt;script&gt;');
  });

  it('escapes malicious deck names in ?d= responses end-to-end', async () => {
    const xssDeck = makeDeckDraft({
      name: `"><script>alert('pwn')</script> & 'Bob'`,
    });
    const dParam = encodeDeckToUrlParam(xssDeck);
    const { context } = createContext(`https://ripple99.pages.dev/?d=${dParam}`, {
      userAgent: 'Twitterbot/1.0',
    });

    const html = await (await onRequestGet(context)).text();
    expect(html).not.toContain('<script>');
    expect(html).toContain('&quot;&gt;&lt;script&gt;alert(&#39;pwn&#39;)&lt;/script&gt; &amp; &#39;Bob&#39;');
  });
});
