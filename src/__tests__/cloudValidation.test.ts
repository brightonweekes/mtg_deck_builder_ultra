import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildFriendInviteUrl,
  buildSharedDeckUrl,
  getUtf8ByteLength,
  HANDLE_MAX_LEN,
  HANDLE_MIN_LEN,
  humanizeCloudError,
  makeFriendPairId,
  MAX_AVATAR_COMMANDER_ID_LEN,
  MAX_CARDLIST_KEYS,
  MAX_CARDLIST_NOTE_LEN,
  MAX_CLOUD_PAYLOAD_BYTES,
  MAX_COLOR_IDENTITY,
  MAX_COMMANDER_IDS,
  MAX_DECK_CARD_COUNT,
  MAX_DECK_DESC_LEN,
  MAX_DECK_ID_LEN,
  MAX_DECK_NAME_LEN,
  MAX_DISPLAY_NAME_LEN,
  MAX_MAINBOARD_KEYS,
  MAX_PASSWORD_LEN,
  MAX_SHARED_WITH_UIDS,
  MAX_SIDEBOARD_KEYS,
  MAX_SYNERGY_THEMES,
  MIN_PASSWORD_LEN,
  normalizeHandle,
  parseCloudUrlIntents,
  RESERVED_HANDLES,
  sanitizeCardListEntries,
  sanitizeCardListPayloadForCloud,
  sanitizeDeckPayloadForCloud,
  suggestHandleFromEmail,
  VALID_CARD_LIST_TYPES,
  VALID_DECK_VISIBILITIES,
  validateEmail,
  validateHandle,
  validatePassword,
  type CardListEntry,
} from '../cloud/validation.js';

describe('cloud validation — handles & email suggestions', () => {
  it('normalizes handles by trimming, stripping one leading @, and lowercasing', () => {
    expect(normalizeHandle('  @Urza_Prime-99  ')).toBe('urza_prime-99');
    expect(normalizeHandle('JaceBeleren')).toBe('jacebeleren');
    expect(normalizeHandle('  @  ')).toBe('');
    expect(normalizeHandle('')).toBe('');
  });

  it('validates handles for length, allowed characters, reserved words, and email leaks', () => {
    expect(validateHandle('@PlanesWalker_01')).toEqual({
      valid: true,
      normalized: 'planeswalker_01',
    });
    expect(validateHandle('abc')).toEqual({ valid: true, normalized: 'abc' });
    expect(validateHandle('a'.repeat(HANDLE_MAX_LEN))).toEqual({
      valid: true,
      normalized: 'a'.repeat(HANDLE_MAX_LEN),
    });

    // Empty & length boundaries
    expect(validateHandle('')).toMatchObject({ valid: false, normalized: '' });
    expect(validateHandle('@')).toMatchObject({ valid: false, normalized: '' });
    const tooShort = validateHandle('@ab');
    expect(tooShort.valid).toBe(false);
    expect(tooShort.error).toContain(String(HANDLE_MIN_LEN));

    const tooLong = validateHandle('x'.repeat(HANDLE_MAX_LEN + 1));
    expect(tooLong.valid).toBe(false);
    expect(tooLong.error).toContain(String(HANDLE_MAX_LEN));

    // Invalid characters
    expect(validateHandle('alice.bob').valid).toBe(false);
    expect(validateHandle('alice bob').valid).toBe(false);
    expect(validateHandle('@@alice').valid).toBe(false);
    expect(validateHandle('alice$123').valid).toBe(false);

    // Reserved words
    for (const reserved of [
      'admin',
      '@ADMIN',
      'System',
      'support',
      'moderator',
      'wizards',
      'official',
      'ripple99',
      '@Ripple99',
      'ripple',
      '@RIPPLE',
    ]) {
      const res = validateHandle(reserved);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/reserved/i);
    }

    // Email address rejection (prevents public email leakage)
    for (const emailInput of [
      'alice@example.com',
      '  User.Name+mtg@gmail.com  ',
      '@alice@example.com',
      'admin@wizards.com',
    ]) {
      const res = validateHandle(emailInput);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/email/i);
    }
  });

  it('suggests safe handles from emails that omit @/domain and always pass validateHandle', () => {
    const samples = [
      'Jane.Doe+mtg@secret-domain.com',
      'admin@wizards.com',
      'support@example.org',
      'a@b.co',
      '...@example.com',
      'verylongusernameprefix1234567890abcdef@example.com',
      '',
    ];

    for (const email of samples) {
      const suggestion = suggestHandleFromEmail(email);
      expect(suggestion).not.toContain('@');
      expect(suggestion).not.toContain('secret-domain');
      expect(suggestion).not.toContain('example');
      expect(suggestion.length).toBeGreaterThanOrEqual(HANDLE_MIN_LEN);
      expect(suggestion.length).toBeLessThanOrEqual(HANDLE_MAX_LEN);
      expect(validateHandle(suggestion).valid).toBe(true);
    }

    expect(suggestHandleFromEmail('Jane.Doe+mtg@gmail.com')).toMatch(/^jane_doe_mtg_[a-z0-9]{4}$/);
  });
});

describe('cloud validation — makeFriendPairId', () => {
  it('produces order-invariant lexicographical pair IDs', () => {
    expect(makeFriendPairId('uid_a', 'uid_b')).toBe('uid_a_uid_b');
    expect(makeFriendPairId('uid_b', 'uid_a')).toBe('uid_a_uid_b');
    expect(makeFriendPairId('ZetaUser', 'alphaUser')).toBe('ZetaUser_alphaUser');
    expect(makeFriendPairId('alphaUser', 'ZetaUser')).toBe('ZetaUser_alphaUser');
    expect(makeFriendPairId('  uid1  ', 'uid2')).toBe('uid1_uid2');
  });

  it('throws explicit errors for identical, empty, or slash-containing UIDs', () => {
    expect(() => makeFriendPairId('uid_1', 'uid_1')).toThrow(/same user/i);
    expect(() => makeFriendPairId(' uid_1 ', 'uid_1')).toThrow(/same user/i);
    expect(() => makeFriendPairId('', 'uid_2')).toThrow(/non-empty/i);
    expect(() => makeFriendPairId('uid_1', '   ')).toThrow(/non-empty/i);
    expect(() => makeFriendPairId('uid/1', 'uid_2')).toThrow(/slash/i);
  });
});

describe('cloud validation — email & password', () => {
  it('validates and normalizes email addresses', () => {
    expect(validateEmail('  Alice.Smith+EDH@Example.COM  ')).toEqual({
      valid: true,
      normalized: 'alice.smith+edh@example.com',
    });

    for (const bad of [
      '',
      '   ',
      'notanemail',
      'user@localhost',
      'user @example.com',
      '.user@example.com',
      'user.@example.com',
      'us..er@example.com',
      'user@.example.com',
      'user@example..com',
      'user@example.c',
      `${'a'.repeat(65)}@example.com`,
    ]) {
      expect(validateEmail(bad).valid).toBe(false);
    }
  });

  it('validates passwords >= 8 chars and scores entropy without requiring symbols', () => {
    expect(validatePassword('')).toMatchObject({ valid: false, score: 0 });
    expect(validatePassword('short7')).toMatchObject({ valid: false, score: 0 });
    expect(validatePassword('a'.repeat(MIN_PASSWORD_LEN - 1))).toMatchObject({ valid: false, score: 0 });
    expect(validatePassword(`${'A1!a'.repeat(32)}x`)).toMatchObject({
      valid: false,
      score: 0,
      error: expect.stringContaining(String(MAX_PASSWORD_LEN)),
    });
    expect(validatePassword('A1!a'.repeat(32))).toMatchObject({ valid: true, score: 3 });
    expect(validatePassword('aaaaaaaa')).toMatchObject({ valid: false, score: 0 });
    expect(validatePassword('abababab')).toMatchObject({ valid: false, score: 0 });
    expect(validatePassword('password')).toMatchObject({ valid: false, score: 0 });
    expect(validatePassword('12345678')).toMatchObject({ valid: false, score: 0 });
    expect(validatePassword('planeswalker')).toMatchObject({ valid: false, score: 0 });
    expect(validatePassword('Commander')).toMatchObject({ valid: false, score: 0 });
    expect(validatePassword('blacklotus')).toMatchObject({ valid: false, score: 0 });

    const basic = validatePassword('manaflux');
    expect(basic.valid).toBe(true);
    expect(basic.score).toBe(1);

    const fair = validatePassword('dragon99');
    expect(fair.valid).toBe(true);
    expect(fair.score).toBe(2);

    const strongNoSymbols = validatePassword('CorrectHorse99');
    expect(strongNoSymbols.valid).toBe(true);
    expect(strongNoSymbols.score).toBe(3);

    const strongWithSymbols = validatePassword('Mtg#2026!');
    expect(strongWithSymbols.valid).toBe(true);
    expect(strongWithSymbols.score).toBe(3);
  });
});

describe('cloud validation — payload sanitization & byte guardrails', () => {
  it('sanitizes deck name, description, visibility, card quantities, and preserves metadata', () => {
    const sanitized = sanitizeDeckPayloadForCloud({
      id: 'deck-1',
      ownerUid: 'uid-1',
      ownerHandle: 'urza',
      name: `  ${'A'.repeat(MAX_DECK_NAME_LEN + 25)}  `,
      description: `  ${'D'.repeat(MAX_DECK_DESC_LEN + 100)}  `,
      commanderOracleIds: ['oracle-cmd-1', 'oracle-cmd-1'],
      mainboard: {
        ' card-a ': 1,
        'card-float': 2.9,
        'card-excess': 150,
        'card-zero': 0,
        'card-neg': -3,
        'card-nan': Number.NaN,
      },
      sideboard: {
        'sb-1': 3,
        'sb-zero': 0,
      },
      synergyThemes: ['  Tokens  ', 'Tokens', 'Aristocrats', ''],
      sharedWithUids: ['uid-2', 'uid-2', ' '],
      visibility: 'friends',
      revision: 2.7,
      createdAt: '2026-11-14T00:00:00.000Z',
      updatedAt: '2026-11-14T01:00:00.000Z',
      deletedAt: null,
    });

    expect(sanitized.name).toBe('A'.repeat(MAX_DECK_NAME_LEN));
    expect(sanitized.description).toBe('D'.repeat(MAX_DECK_DESC_LEN));
    expect(sanitized.visibility).toBe('friends');
    expect(sanitized.commanderOracleIds).toEqual(['oracle-cmd-1']);
    expect(sanitized.mainboard).toEqual({
      'card-a': 1,
      'card-float': 2,
      'card-excess': 99,
    });
    expect(sanitized.sideboard).toEqual({ 'sb-1': 3 });
    expect(sanitized.synergyThemes).toEqual(['Tokens', 'Aristocrats']);
    expect(sanitized.sharedWithUids).toEqual(['uid-2']);
    expect(sanitized.revision).toBe(2);
    expect(sanitized.ownerUid).toBe('uid-1');
  });

  it('defaults blank deck name and omitted visibility safely, and avoids splitting UTF-16 surrogate pairs', () => {
    const emojiName = `${'🐉'.repeat(65)}`; // length 130 in UTF-16
    const sanitized = sanitizeDeckPayloadForCloud({
      name: '   ',
      mainboard: { sol: 1 },
    });
    expect(sanitized.name).toBe('Untitled Commander Deck');
    expect(sanitized.visibility).toBe('private');
    expect(sanitized.sideboard).toEqual({});
    expect('description' in sanitized).toBe(false);

    // 59 ASCII + 1 astral emoji (surrogate pair across index 59..60 -> total length 121 if 119+'🐉')
    const boundary = `${'x'.repeat(MAX_DECK_NAME_LEN - 1)}🐉`;
    const emojiResult = sanitizeDeckPayloadForCloud({
      name: boundary,
      mainboard: { sol: 1 },
      visibility: 'public',
    });
    expect(emojiResult.name.length).toBe(MAX_DECK_NAME_LEN - 1);
    expect(emojiName.length).toBe(130);
  });

  it('rejects invalid visibility, > 2 commanders, excessive board keys, and > 40KB payloads', () => {
    expect(() =>
      sanitizeDeckPayloadForCloud({
        name: 'Bad Visibility',
        visibility: 'everyone',
        mainboard: { a: 1 },
      }),
    ).toThrow(/visibility/i);

    expect(() =>
      sanitizeDeckPayloadForCloud({
        name: 'Too Many Commanders',
        visibility: 'private',
        commanderOracleIds: ['c1', 'c2', 'c3'],
        mainboard: { a: 1 },
      }),
    ).toThrow(/commanders/i);

    // 251 positive mainboard keys fails, even though 250 + extra zeros passes
    const validPlusZeros: Record<string, number> = {};
    for (let i = 0; i < MAX_MAINBOARD_KEYS; i++) validPlusZeros[`c-${i}`] = 1;
    validPlusZeros['zero-card'] = 0;
    expect(
      Object.keys(
        sanitizeDeckPayloadForCloud({
          name: 'Max Mainboard',
          visibility: 'private',
          mainboard: validPlusZeros,
        }).mainboard,
      ).length,
    ).toBe(MAX_MAINBOARD_KEYS);

    const tooManyMainboard: Record<string, number> = { ...validPlusZeros, extra: 1 };
    expect(() =>
      sanitizeDeckPayloadForCloud({
        name: 'Over Mainboard',
        visibility: 'private',
        mainboard: tooManyMainboard,
      }),
    ).toThrow(new RegExp(String(MAX_MAINBOARD_KEYS)));

    const tooManySideboard: Record<string, number> = {};
    for (let i = 0; i <= MAX_SIDEBOARD_KEYS; i++) tooManySideboard[`sb-${i}`] = 1;
    expect(() =>
      sanitizeDeckPayloadForCloud({
        name: 'Over Sideboard',
        visibility: 'private',
        mainboard: { a: 1 },
        sideboard: tooManySideboard,
      }),
    ).toThrow(new RegExp(String(MAX_SIDEBOARD_KEYS)));

    // Oversized UTF-8 JSON payload (> 40,000 bytes) while staying <= 250 keys
    const hugeKeyMainboard: Record<string, number> = {};
    for (let i = 0; i < 200; i++) {
      hugeKeyMainboard[`${'k'.repeat(210)}-${i}`] = 1;
    }
    expect(getUtf8ByteLength(JSON.stringify(hugeKeyMainboard))).toBeGreaterThan(
      MAX_CLOUD_PAYLOAD_BYTES,
    );
    expect(() =>
      sanitizeDeckPayloadForCloud({
        name: 'Oversized Payload',
        visibility: 'private',
        mainboard: hugeKeyMainboard,
      }),
    ).toThrow(new RegExp(String(MAX_CLOUD_PAYLOAD_BYTES)));
  });

  it('sanitizes card list entries, drops empty entries, preserves foil/trade-only entries, and caps keys', () => {
    const entries: Record<string, CardListEntry> = {
      ' oracle-1 ': {
        quantity: 2.8,
        foilQuantity: -1,
        forTradeQuantity: 1,
        note: `  ${'N'.repeat(MAX_CARDLIST_NOTE_LEN + 20)}  `,
      },
      'oracle-foil-only': {
        quantity: 0,
        foilQuantity: 2,
      },
      'oracle-trade-only': {
        quantity: 0,
        forTradeQuantity: 1,
      },
      'oracle-empty': {
        quantity: 0,
        foilQuantity: 0,
        forTradeQuantity: 0,
        note: 'should be dropped',
      },
      'oracle-neg': {
        quantity: -5,
      },
    };

    const sanitized = sanitizeCardListEntries(entries);
    expect(sanitized).toEqual({
      'oracle-1': {
        quantity: 2,
        forTradeQuantity: 1,
        note: 'N'.repeat(MAX_CARDLIST_NOTE_LEN),
      },
      'oracle-foil-only': {
        quantity: 0,
        foilQuantity: 2,
      },
      'oracle-trade-only': {
        quantity: 0,
        forTradeQuantity: 1,
      },
    });

    // Caps at MAX_CARDLIST_KEYS after dropping empty entries
    const manyEntries: Record<string, CardListEntry> = {
      'empty-first': { quantity: 0 },
    };
    for (let i = 0; i < MAX_CARDLIST_KEYS + 50; i++) {
      manyEntries[`card-${i}`] = { quantity: 1 };
    }
    const capped = sanitizeCardListEntries(manyEntries);
    expect(Object.keys(capped).length).toBe(MAX_CARDLIST_KEYS);
    expect(capped['empty-first']).toBeUndefined();
    expect(capped['card-0']).toEqual({ quantity: 1 });
  });

  it('validates card list payloads and enforces cloud byte limit', () => {
    const cleanList = sanitizeCardListPayloadForCloud({
      name: '  Trade Binder  ',
      listType: 'trade',
      visibility: 'friends',
      entries: {
        'oracle-1': { quantity: 1, forTradeQuantity: 1, note: 'Near mint' },
        'oracle-0': { quantity: 0 },
      },
    });
    expect(cleanList.name).toBe('Trade Binder');
    expect(cleanList.listType).toBe('trade');
    expect(cleanList.visibility).toBe('friends');
    expect(cleanList.entries).toEqual({
      'oracle-1': { quantity: 1, forTradeQuantity: 1, note: 'Near mint' },
    });

    expect(() =>
      sanitizeCardListPayloadForCloud({
        name: 'Bad List',
        listType: 'invalid-type',
        entries: {},
      }),
    ).toThrow(/list type/i);
  });
});

describe('cloud validation — invite & share URL parsing and building', () => {
  it('parses ?deck= and ?addFriend= intents cleanly and ignores invalid/empty values', () => {
    expect(parseCloudUrlIntents('')).toEqual({ sharedDeckId: null, addFriendHandle: null });
    expect(parseCloudUrlIntents('?d=legacyEncodedDeckData')).toEqual({
      sharedDeckId: null,
      addFriendHandle: null,
    });

    expect(parseCloudUrlIntents('?deck=deck-123_abc&addFriend=%40Urza_Fan')).toEqual({
      sharedDeckId: 'deck-123_abc',
      addFriendHandle: 'urza_fan',
    });

    expect(parseCloudUrlIntents('deck=abc123&addFriend=PlanesWalker-9')).toEqual({
      sharedDeckId: 'abc123',
      addFriendHandle: 'planeswalker-9',
    });

    // Rejects invalid/unsafe values
    expect(
      parseCloudUrlIntents('?deck=../../etc/passwd&addFriend=admin'),
    ).toEqual({ sharedDeckId: null, addFriendHandle: null });
    expect(
      parseCloudUrlIntents('?deck=%20%20&addFriend=alice@example.com'),
    ).toEqual({ sharedDeckId: null, addFriendHandle: null });
    expect(
      parseCloudUrlIntents('?deck=<script>&addFriend=ab'),
    ).toEqual({ sharedDeckId: null, addFriendHandle: null });
  });

  it('builds friend invite and shared deck URLs safely and round-trips through parseCloudUrlIntents', () => {
    const inviteUrl = buildFriendInviteUrl('https://deckbuilder.pages.dev', '/app/', '@Urza_Fan');
    expect(inviteUrl).toBe('https://deckbuilder.pages.dev/app/?addFriend=urza_fan');
    expect(parseCloudUrlIntents(new URL(inviteUrl).search)).toEqual({
      sharedDeckId: null,
      addFriendHandle: 'urza_fan',
    });

    const deckUrl = buildSharedDeckUrl('http://localhost:5173', '', 'deck-550e8400');
    expect(deckUrl).toBe('http://localhost:5173/?deck=deck-550e8400');
    expect(parseCloudUrlIntents(new URL(deckUrl).search)).toEqual({
      sharedDeckId: 'deck-550e8400',
      addFriendHandle: null,
    });

    // Prevents protocol-relative open redirect in pathname
    const safeRedirectCheck = buildFriendInviteUrl(
      'https://deckbuilder.pages.dev',
      '//evil.example.com',
      'alice_1',
    );
    expect(new URL(safeRedirectCheck).origin).toBe('https://deckbuilder.pages.dev');

    // Rejects bad origins, invalid handles, and invalid deck IDs
    expect(() => buildFriendInviteUrl('javascript:alert(1)', '/', 'alice_1')).toThrow();
    expect(() => buildFriendInviteUrl('https://example.com', '/', 'alice@example.com')).toThrow(
      /email/i,
    );
    expect(() => buildFriendInviteUrl('https://example.com', '/', 'admin')).toThrow(/reserved/i);
    expect(() => buildSharedDeckUrl('https://example.com', '/', '../bad')).toThrow(/deck id/i);
    expect(() => buildSharedDeckUrl('https://example.com', '/', '')).toThrow(/deck id/i);
  });
});

describe('cloud validation — humanizeCloudError', () => {
  it('translates all common Firebase Auth and Firestore error codes with accurate flags', () => {
    const cases: Array<{
      code: string;
      isQuotaOrRateLimit: boolean;
      isOffline: boolean;
      requiresRecentLogin: boolean;
      messageRegex: RegExp;
    }> = [
      {
        code: 'auth/email-already-in-use',
        isQuotaOrRateLimit: false,
        isOffline: false,
        requiresRecentLogin: false,
        messageRegex: /already exists/i,
      },
      {
        code: 'auth/invalid-credential',
        isQuotaOrRateLimit: false,
        isOffline: false,
        requiresRecentLogin: false,
        messageRegex: /incorrect email or password/i,
      },
      {
        code: 'auth/wrong-password',
        isQuotaOrRateLimit: false,
        isOffline: false,
        requiresRecentLogin: false,
        messageRegex: /incorrect email or password/i,
      },
      {
        code: 'auth/user-not-found',
        isQuotaOrRateLimit: false,
        isOffline: false,
        requiresRecentLogin: false,
        messageRegex: /incorrect email or password/i,
      },
      {
        code: 'auth/too-many-requests',
        isQuotaOrRateLimit: true,
        isOffline: false,
        requiresRecentLogin: false,
        messageRegex: /too many requests/i,
      },
      {
        code: 'auth/popup-blocked',
        isQuotaOrRateLimit: false,
        isOffline: false,
        requiresRecentLogin: false,
        messageRegex: /popup.*blocked/i,
      },
      {
        code: 'auth/popup-closed-by-user',
        isQuotaOrRateLimit: false,
        isOffline: false,
        requiresRecentLogin: false,
        messageRegex: /popup.*closed/i,
      },
      {
        code: 'auth/account-exists-with-different-credential',
        isQuotaOrRateLimit: false,
        isOffline: false,
        requiresRecentLogin: false,
        messageRegex: /different sign-in method/i,
      },
      {
        code: 'auth/requires-recent-login',
        isQuotaOrRateLimit: false,
        isOffline: false,
        requiresRecentLogin: true,
        messageRegex: /sign in again/i,
      },
      {
        code: 'auth/network-request-failed',
        isQuotaOrRateLimit: false,
        isOffline: true,
        requiresRecentLogin: false,
        messageRegex: /network|internet/i,
      },
      {
        code: 'permission-denied',
        isQuotaOrRateLimit: false,
        isOffline: false,
        requiresRecentLogin: false,
        messageRegex: /permission denied/i,
      },
      {
        code: 'resource-exhausted',
        isQuotaOrRateLimit: true,
        isOffline: false,
        requiresRecentLogin: false,
        messageRegex: /quota/i,
      },
      {
        code: 'unavailable',
        isQuotaOrRateLimit: false,
        isOffline: true,
        requiresRecentLogin: false,
        messageRegex: /unavailable|offline/i,
      },
      {
        code: 'failed-precondition',
        isQuotaOrRateLimit: false,
        isOffline: false,
        requiresRecentLogin: false,
        messageRegex: /precondition/i,
      },
    ];

    for (const c of cases) {
      const err = Object.assign(new Error(`Firebase: (${c.code})`), { code: c.code });
      const result = humanizeCloudError(err);
      expect(result.code).toBe(c.code);
      expect(result.isQuotaOrRateLimit).toBe(c.isQuotaOrRateLimit);
      expect(result.isOffline).toBe(c.isOffline);
      expect(result.requiresRecentLogin).toBe(c.requiresRecentLogin);
      expect(result.message).toMatch(c.messageRegex);
    }
  });

  it('handles firestore/-prefixed codes, embedded codes, generic Errors, and non-Error inputs', () => {
    const prefixed = humanizeCloudError({ code: 'firestore/permission-denied', message: 'Denied' });
    expect(prefixed.message).toMatch(/permission denied/i);

    const embedded = humanizeCloudError(new Error('Firebase: Error (auth/wrong-password).'));
    expect(embedded.code).toBe('auth/wrong-password');
    expect(embedded.message).toMatch(/incorrect email or password/i);
    expect(humanizeCloudError({ code: 'auth/wrong-password' }).message).toBe(
      humanizeCloudError({ code: 'auth/user-not-found' }).message,
    );
    expect(humanizeCloudError({ code: 'auth/user-not-found' }).message).toBe(
      humanizeCloudError({ code: 'auth/invalid-credential' }).message,
    );

    const generic = humanizeCloudError(new Error('Deck payload too large'));
    expect(generic).toEqual({
      code: 'unknown',
      message: 'Deck payload too large',
      isQuotaOrRateLimit: false,
      isOffline: false,
      requiresRecentLogin: false,
    });

    const fromNull = humanizeCloudError(null);
    expect(fromNull).toEqual({
      code: 'unknown',
      message: 'An unexpected cloud error occurred.',
      isQuotaOrRateLimit: false,
      isOffline: false,
      requiresRecentLogin: false,
    });
  });
});

describe('cloud validation — firestore.rules parity & null-resource safety', () => {
  const rulesText = readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');

  function extractRulesSection(startMarker: string, endMarker: string): string {
    const startIdx = rulesText.indexOf(startMarker);
    expect(startIdx).toBeGreaterThanOrEqual(0);
    const endIdx = rulesText.indexOf(endMarker, startIdx + startMarker.length);
    expect(endIdx).toBeGreaterThan(startIdx);
    return rulesText.slice(startIdx, endIdx);
  }

  it('caps synergyThemes at 20, sharedWithUids at 50, colorIdentity at 5, and cardCount at 500', () => {
    expect(MAX_SYNERGY_THEMES).toBe(20);
    expect(MAX_SHARED_WITH_UIDS).toBe(50);
    expect(MAX_COLOR_IDENTITY).toBe(5);
    expect(MAX_DECK_CARD_COUNT).toBe(500);

    const sanitized = sanitizeDeckPayloadForCloud({
      name: 'Parity Test Deck',
      ownerHandle: 'a'.repeat(HANDLE_MAX_LEN + 10),
      commanderOracleIds: ['c1', 'c2'],
      colorIdentity: ['W', 'U', 'B', 'R', 'G', 'W'],
      mainboard: { 'ora-1': 1 },
      synergyThemes: Array.from({ length: 25 }, (_, i) => `Theme-${i}`),
      sharedWithUids: Array.from({ length: 65 }, (_, i) => `uid-${i}`),
      cardCount: 750,
    });

    expect(sanitized.ownerHandle).toBe('a'.repeat(HANDLE_MAX_LEN));
    expect(sanitized.colorIdentity).toEqual(['W', 'U', 'B', 'R', 'G']);
    expect(sanitized.synergyThemes).toHaveLength(MAX_SYNERGY_THEMES);
    expect(sanitized.sharedWithUids).toHaveLength(MAX_SHARED_WITH_UIDS);
    expect(sanitized.cardCount).toBe(MAX_DECK_CARD_COUNT);

    const sanitizedList = sanitizeCardListPayloadForCloud({
      name: 'Parity Test List',
      listType: 'wishlist',
      entries: { 'ora-1': { quantity: 1 } },
      sharedWithUids: Array.from({ length: 60 }, (_, i) => `uid-${i}`),
    });
    expect(sanitizedList.sharedWithUids).toHaveLength(MAX_SHARED_WITH_UIDS);
  });

  it('rejects every reserved handle and matches firestore.rules isReservedHandle exactly', () => {
    const reservedBlock = extractRulesSection('function isReservedHandle(handleLower)', '}');
    const match = reservedBlock.match(/\[([\s\S]*?)\]/);
    expect(match).not.toBeNull();
    const rulesReservedHandles = Array.from(match![1]!.matchAll(/'([^']+)'/g), (m) => m[1]!);

    expect(new Set(rulesReservedHandles)).toEqual(RESERVED_HANDLES);
    expect(rulesReservedHandles).toHaveLength(RESERVED_HANDLES.size);
    expect(RESERVED_HANDLES.has('ripple99')).toBe(true);
    expect(RESERVED_HANDLES.has('ripple')).toBe(true);

    for (const reserved of RESERVED_HANDLES) {
      const result = validateHandle(reserved);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/reserved/i);
    }
  });

  it('keeps all schema caps and enums in 100% parity with firestore.rules', () => {
    // Handle bounds & profile limits
    expect(rulesText).toContain(`^[a-zA-Z0-9_-]{${HANDLE_MIN_LEN},${HANDLE_MAX_LEN}}$`);
    expect(rulesText).toContain(`^[a-z0-9_-]{${HANDLE_MIN_LEN},${HANDLE_MAX_LEN}}$`);

    const profileFn = extractRulesSection(
      'function isValidProfile(uid, data)',
      'function isValidFriendshipCreate',
    );
    expect(profileFn).toContain(`data.displayName.size() <= ${MAX_DISPLAY_NAME_LEN}`);
    expect(profileFn).toContain(`data.avatarCommanderId.size() <= ${MAX_AVATAR_COMMANDER_ID_LEN}`);

    // Visibility & card list type enums
    const visibilityFn = extractRulesSection(
      'function isValidVisibility(visibility)',
      'function isValidProfile',
    );
    const rulesVisibilities = Array.from(visibilityFn.matchAll(/'([^']+)'/g), (m) => m[1]!);
    expect(rulesVisibilities).toEqual([...VALID_DECK_VISIBILITIES]);

    // Deck field caps
    const deckFn = extractRulesSection(
      'function isValidDeckDoc(deckId, data)',
      'function isValidCardListDoc',
    );
    expect(deckFn).toContain(`data.id.size() <= ${MAX_DECK_ID_LEN}`);
    expect(deckFn).toContain(`data.ownerHandle.size() <= ${HANDLE_MAX_LEN}`);
    expect(deckFn).toContain(`data.name.size() <= ${MAX_DECK_NAME_LEN}`);
    expect(deckFn).toContain(`data.description.size() <= ${MAX_DECK_DESC_LEN}`);
    expect(deckFn).toContain(`data.commanderOracleIds.size() <= ${MAX_COMMANDER_IDS}`);
    expect(deckFn).toContain(`data.colorIdentity.size() <= ${MAX_COLOR_IDENTITY}`);
    expect(deckFn).toContain(`data.mainboard.keys().size() <= ${MAX_MAINBOARD_KEYS}`);
    expect(deckFn).toContain(`data.sideboard.keys().size() <= ${MAX_SIDEBOARD_KEYS}`);
    expect(deckFn).toContain(`data.synergyThemes.size() <= ${MAX_SYNERGY_THEMES}`);
    expect(deckFn).toContain(`data.cardCount <= ${MAX_DECK_CARD_COUNT}`);
    expect(deckFn).toContain(`data.sharedWithUids.size() <= ${MAX_SHARED_WITH_UIDS}`);

    // CardList field caps
    const listFn = extractRulesSection(
      'function isValidCardListDoc(listId, data)',
      '// Collection Rules',
    );
    expect(listFn).toContain(`data.id.size() <= ${MAX_DECK_ID_LEN}`);
    expect(listFn).toContain(`data.ownerHandle.size() <= ${HANDLE_MAX_LEN}`);
    expect(listFn).toContain(`data.name.size() <= ${MAX_DECK_NAME_LEN}`);
    expect(listFn).toContain(`data.description.size() <= ${MAX_DECK_DESC_LEN}`);
    expect(listFn).toContain(`data.entries.keys().size() <= ${MAX_CARDLIST_KEYS}`);
    expect(listFn).toContain(`data.sharedWithUids.size() <= ${MAX_SHARED_WITH_UIDS}`);
    const listTypeMatch = listFn.match(/data\.listType in \[([\s\S]*?)\]/);
    expect(listTypeMatch).not.toBeNull();
    const rulesListTypes = Array.from(listTypeMatch![1]!.matchAll(/'([^']+)'/g), (m) => m[1]!);
    expect(rulesListTypes).toEqual([...VALID_CARD_LIST_TYPES]);
  });

  it('guards allow get and delete/update rules against null-resource crashes while keeping list non-enumerable', () => {
    const profilesBlock = extractRulesSection('match /profiles/{uid}', 'match /handles');
    expect(profilesBlock).toMatch(/allow get:\s*if isVerified\(\);/);
    expect(profilesBlock).toMatch(/allow list:\s*if false;/);

    const handlesBlock = extractRulesSection('match /handles/{handleLower}', 'match /friendships');
    expect(handlesBlock).toMatch(/allow get:\s*if isVerified\(\);/);
    expect(handlesBlock).toMatch(/allow list:\s*if false;/);
    expect(handlesBlock).toMatch(/existsAfter\(callerProfilePath\(\)\)/);
    expect(handlesBlock).toMatch(/getAfter\(callerProfilePath\(\)\)\.data\.handleLower == handleLower/);
    expect(handlesBlock).toMatch(/allow update:\s*if false;/);
    expect(handlesBlock).toMatch(/allow delete:\s*if isVerified\(\) && resource != null &&/);
    expect(handlesBlock).toMatch(/getAfter\(callerProfilePath\(\)\)\.data\.handleLower != handleLower/);

    const friendshipFn = extractRulesSection(
      'function isValidFriendshipCreate',
      'function isValidFriendshipAccept',
    );
    expect(friendshipFn).toContain('callerOwnsHandle(data.userHandles[request.auth.uid])');

    const catalogFn = extractRulesSection(
      'function isValidFriendCatalog',
      'function isValidDeckDoc',
    );
    expect(catalogFn).toContain('callerOwnsHandle(data.ownerHandle)');

    const deckValidationFn = extractRulesSection(
      'function isValidDeckDoc',
      'function isValidCardListDoc',
    );
    expect(deckValidationFn).toContain('callerOwnsHandle(data.ownerHandle)');

    const cardListValidationFn = extractRulesSection(
      'function isValidCardListDoc',
      '// Collection Rules',
    );
    expect(cardListValidationFn).toContain('callerOwnsHandle(data.ownerHandle)');

    const friendshipsBlock = extractRulesSection(
      'match /friendships/{pairDocId}',
      'match /friendCatalogs',
    );
    expect(friendshipsBlock).toMatch(/allow get:\s*if isVerified\(\) && resource != null &&/);
    expect(friendshipsBlock).toMatch(/allow update:\s*if isVerified\(\)\s*&& resource != null/);
    expect(friendshipsBlock).toMatch(/allow delete:\s*if isVerified\(\) && resource != null &&/);

    const decksBlock = extractRulesSection('match /decks/{deckId}', 'match /cardlists');
    expect(decksBlock).toMatch(/allow get:\s*if resource == null\s*\|\|/);
    expect(decksBlock).toMatch(/allow list:\s*if \(isVerified\(\)/);
    expect(decksBlock).not.toMatch(/allow list:[\s\S]*resource == null/);
    expect(decksBlock).toMatch(/allow update:\s*if isVerified\(\)\s*&& resource != null/);
    expect(decksBlock).toMatch(/allow delete:\s*if isVerified\(\)\s*&& resource != null/);

    const listsBlock = extractRulesSection('match /cardlists/{listId}', 'match /{document=**}');
    expect(listsBlock).toMatch(/allow get:\s*if resource == null\s*\|\|/);
    expect(listsBlock).toMatch(/allow list:\s*if \(isVerified\(\)/);
    expect(listsBlock).not.toMatch(/allow list:[\s\S]*resource == null/);
    expect(listsBlock).toMatch(/allow update:\s*if isVerified\(\)\s*&& resource != null/);
    expect(listsBlock).toMatch(/allow delete:\s*if isVerified\(\)\s*&& resource != null/);
  });
});
