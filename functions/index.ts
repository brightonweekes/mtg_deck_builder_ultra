import {
  formatColorIdentityCode,
  resolveCommanderOgEntry,
  type CommanderOgEntry,
  type CommandersOgIndex,
} from '../scripts/lib/commanders-og.js';
import { decodeDeckFromUrlParam } from '../src/deck/urlCodec.js';

export const DEFAULT_SITE_URL = 'https://ripple99.pages.dev/';
export const DEFAULT_SITE_NAME = 'Ripple99';
export const DEFAULT_OG_TITLE = 'Ripple99 — Shared Commander Deck | Build Decks, Not Piles';
export const DEFAULT_OG_DESCRIPTION =
  'View this shared Magic: The Gathering Commander deck in Ripple99 — free, local-first MTG deck builder with instant offline search and Method A synergy matching.';
export const BOT_CACHE_CONTROL = 'public, max-age=300';
export const FIRESTORE_FETCH_TIMEOUT_MS = 1500;
export const RE_FIRESTORE_DECK_ID = /^[a-zA-Z0-9_-]{1,128}$/;

const MAX_ENCODED_DECK_PARAM_LEN = 65_536;
const MAX_META_DESCRIPTION_SNIPPET_LEN = 140;

const SOCIAL_PREVIEW_BOT_REGEX =
  /(?:discordbot|twitterbot|slackbot|redditbot|facebookexternalhit|facebot|linkedinbot|whatsapp|telegrambot|applebot|embedly|skypeuripreview|mattermost|iframely|vkshare|pinterest|googlebot|bingbot)/i;

export interface PagesAssetsBinding {
  fetch(input: Request | string | URL, init?: RequestInit): Promise<Response>;
}

export interface PagesEnv {
  ASSETS?: PagesAssetsBinding;
  FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  [key: string]: unknown;
}

export interface PagesEventContext<Env extends PagesEnv = PagesEnv> {
  request: Request;
  env: Env;
  params?: Record<string, string | string[]>;
  waitUntil?: (promise: Promise<unknown>) => void;
  passThroughOnException?: () => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
}

export type ShareQuery =
  | { kind: 'd'; encoded: string }
  | { kind: 'deck'; deckId: string; isValidId: boolean };

export interface ParsedFirestoreDeckDoc {
  id: string;
  name: string;
  description?: string;
  ownerHandle?: string;
  commanderOracleIds: string[];
  colorIdentity: string[];
  synergyThemes: string[];
  cardCount: number;
  visibility: 'public' | 'link';
  updatedAt?: string;
}

export interface DeckOgMeta {
  title: string;
  description: string;
  url: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
  siteName?: string;
}

interface FirestoreRestValue {
  stringValue?: unknown;
  integerValue?: unknown;
  doubleValue?: unknown;
  nullValue?: unknown;
  timestampValue?: unknown;
  arrayValue?: {
    values?: unknown;
  };
  mapValue?: {
    fields?: unknown;
  };
}

let cachedCommandersOgIndex: CommandersOgIndex | null = null;
let inflightCommandersOgPromise: Promise<CommandersOgIndex | null> | null = null;

/**
 * Resets the module-scoped `/data/commanders-og.json` cache (for isolated unit tests only).
 */
export function resetEdgeOgCacheForTesting(): void {
  cachedCommandersOgIndex = null;
  inflightCommandersOgPromise = null;
}

/**
 * Returns `true` when the request User-Agent identifies a known social preview or search crawler.
 */
export function isSocialPreviewBot(userAgent: string | null | undefined): boolean {
  if (typeof userAgent !== 'string' || !userAgent.trim()) {
    return false;
  }
  return SOCIAL_PREVIEW_BOT_REGEX.test(userAgent);
}

/**
 * Extracts `?d=` or `?deck=` share parameters from a request URL, returning `null` if neither is present.
 */
export function parseShareQuery(urlInput: string | URL): ShareQuery | null {
  let parsed: URL;
  try {
    parsed =
      urlInput instanceof URL
        ? urlInput
        : new URL(urlInput, DEFAULT_SITE_URL);
  } catch {
    return null;
  }

  const rawDeck = parsed.searchParams.get('deck')?.trim() ?? '';
  if (rawDeck) {
    return {
      kind: 'deck',
      deckId: rawDeck,
      isValidId: RE_FIRESTORE_DECK_ID.test(rawDeck),
    };
  }

  const rawD = parsed.searchParams.get('d')?.trim() ?? '';
  if (rawD) {
    return {
      kind: 'd',
      encoded: rawD,
    };
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readFirestoreString(raw: unknown): string | undefined {
  const obj = asRecord(raw) as FirestoreRestValue | null;
  if (!obj || typeof obj.stringValue !== 'string') return undefined;
  const trimmed = obj.stringValue.trim();
  return trimmed || undefined;
}

function readFirestoreInt(raw: unknown): number | undefined {
  const obj = asRecord(raw) as FirestoreRestValue | null;
  if (!obj) return undefined;

  if (typeof obj.integerValue === 'number' && Number.isFinite(obj.integerValue)) {
    return Math.trunc(obj.integerValue);
  }
  if (typeof obj.integerValue === 'string') {
    const parsed = Number.parseInt(obj.integerValue, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof obj.doubleValue === 'number' && Number.isFinite(obj.doubleValue)) {
    return Math.trunc(obj.doubleValue);
  }
  return undefined;
}

function readFirestoreStringArray(raw: unknown): string[] {
  const obj = asRecord(raw) as FirestoreRestValue | null;
  const values = obj?.arrayValue && asRecord(obj.arrayValue)?.values;
  if (!Array.isArray(values)) return [];

  const result: string[] = [];
  for (const item of values) {
    const str = readFirestoreString(item);
    if (str) result.push(str);
  }
  return result;
}

function isFirestoreDeleted(raw: unknown): boolean {
  const obj = asRecord(raw) as FirestoreRestValue | null;
  if (!obj) return false;
  if ('nullValue' in obj && obj.nullValue === null) return false;
  if (typeof obj.stringValue === 'string' && obj.stringValue.trim().length > 0) return true;
  if (typeof obj.timestampValue === 'string' && obj.timestampValue.trim().length > 0) return true;
  return false;
}

function sumFirestoreMainboardCount(raw: unknown): number {
  const obj = asRecord(raw) as FirestoreRestValue | null;
  const fields = obj?.mapValue && asRecord(obj.mapValue)?.fields;
  if (!fields) return 0;

  let total = 0;
  for (const val of Object.values(fields)) {
    const qty = readFirestoreInt(val);
    if (qty !== undefined && qty > 0) {
      total += qty;
    }
  }
  return total;
}

/**
 * Parses and validates a Firestore v1 REST `/decks/{deckId}` document payload.
 * Rejects soft-deleted documents and any visibility other than `'public'` or `'link'`.
 */
export function parseFirestoreDeckRestDoc(doc: unknown): ParsedFirestoreDeckDoc | null {
  const root = asRecord(doc);
  if (!root || 'error' in root) return null;

  const fields = asRecord(root.fields);
  if (!fields) return null;

  const visibility = readFirestoreString(fields.visibility);
  if (visibility !== 'public' && visibility !== 'link') {
    return null;
  }

  if (isFirestoreDeleted(fields.deletedAt)) {
    return null;
  }

  const docName = typeof root.name === 'string' ? root.name : '';
  const pathLastSegment = docName.split('/').filter(Boolean).pop() ?? '';
  const id = readFirestoreString(fields.id) ?? pathLastSegment;
  const name = readFirestoreString(fields.name) ?? 'Shared Commander Deck';
  const description = readFirestoreString(fields.description);
  const ownerHandle = readFirestoreString(fields.ownerHandle);
  const commanderOracleIds = readFirestoreStringArray(fields.commanderOracleIds).slice(0, 2);

  const rawColors = readFirestoreStringArray(fields.colorIdentity);
  const colorIdentity: string[] = [];
  for (const c of rawColors) {
    const upper = c.toUpperCase();
    if (
      (upper === 'W' || upper === 'U' || upper === 'B' || upper === 'R' || upper === 'G') &&
      !colorIdentity.includes(upper)
    ) {
      colorIdentity.push(upper);
    }
  }

  const synergyThemes = readFirestoreStringArray(fields.synergyThemes);
  const explicitCount = readFirestoreInt(fields.cardCount);
  const cardCount =
    explicitCount !== undefined && explicitCount >= 0
      ? explicitCount
      : commanderOracleIds.length + sumFirestoreMainboardCount(fields.mainboard);
  const updatedAt = readFirestoreString(fields.updatedAt);

  return {
    id,
    name,
    ...(description ? { description } : {}),
    ...(ownerHandle ? { ownerHandle } : {}),
    commanderOracleIds,
    colorIdentity,
    synergyThemes,
    cardCount,
    visibility,
    ...(updatedAt ? { updatedAt } : {}),
  };
}

/**
 * Escapes HTML special characters (`&`, `<`, `>`, `"`, `'`) to prevent meta/attribute XSS.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeInlineText(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function sanitizeHttpUrl(rawUrl: string | null | undefined, allowFallback: string): string {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return allowFallback;
  }
  try {
    const parsed = allowFallback
      ? new URL(rawUrl.trim(), allowFallback)
      : new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return allowFallback;
    }
    return parsed.toString();
  } catch {
    return allowFallback;
  }
}

/**
 * Renders minimal, strictly escaped Open Graph + Twitter Card HTML for social link unfurlers.
 */
export function buildDeckOgHtml(meta: DeckOgMeta): string {
  const safeTitle = escapeHtml(normalizeInlineText(meta.title) || DEFAULT_OG_TITLE);
  const safeDescription = escapeHtml(
    normalizeInlineText(meta.description) || DEFAULT_OG_DESCRIPTION,
  );
  const safeSiteName = escapeHtml(
    normalizeInlineText(meta.siteName ?? DEFAULT_SITE_NAME) || DEFAULT_SITE_NAME,
  );
  const safeUrl = escapeHtml(sanitizeHttpUrl(meta.url, DEFAULT_SITE_URL));
  const cleanImageUrl = sanitizeHttpUrl(meta.imageUrl, '');
  const safeImageUrl = cleanImageUrl ? escapeHtml(cleanImageUrl) : '';
  const safeImageAlt = escapeHtml(
    normalizeInlineText(meta.imageAlt ?? meta.title) || DEFAULT_SITE_NAME,
  );
  const twitterCard = safeImageUrl ? 'summary_large_image' : 'summary';

  const imageMetaTags = safeImageUrl
    ? [
        `    <meta property="og:image" content="${safeImageUrl}" />`,
        `    <meta property="og:image:alt" content="${safeImageAlt}" />`,
      ]
    : [];

  const twitterImageTags = safeImageUrl
    ? [
        `    <meta name="twitter:image" content="${safeImageUrl}" />`,
        `    <meta name="twitter:image:alt" content="${safeImageAlt}" />`,
      ]
    : [];

  return [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="UTF-8" />',
    `    <title>${safeTitle}</title>`,
    `    <meta name="description" content="${safeDescription}" />`,
    '    <meta name="theme-color" content="#020617" />',
    `    <link rel="canonical" href="${safeUrl}" />`,
    '    <meta property="og:type" content="website" />',
    `    <meta property="og:site_name" content="${safeSiteName}" />`,
    `    <meta property="og:title" content="${safeTitle}" />`,
    `    <meta property="og:description" content="${safeDescription}" />`,
    `    <meta property="og:url" content="${safeUrl}" />`,
    ...imageMetaTags,
    `    <meta name="twitter:card" content="${twitterCard}" />`,
    `    <meta name="twitter:title" content="${safeTitle}" />`,
    `    <meta name="twitter:description" content="${safeDescription}" />`,
    ...twitterImageTags,
    '  </head>',
    '  <body>',
    `    <h1>${safeTitle}</h1>`,
    `    <p>${safeDescription}</p>`,
    `    <p><a href="${safeUrl}">Open in Ripple99</a></p>`,
    '  </body>',
    '</html>',
    '',
  ].join('\n');
}

function isValidCommandersOgIndex(raw: unknown): raw is CommandersOgIndex {
  const obj = asRecord(raw);
  if (!obj) return false;
  return (
    Array.isArray(obj.rows) &&
    asRecord(obj.byId) !== null &&
    asRecord(obj.byOracleId) !== null
  );
}

async function loadCommandersOgIndex(context: PagesEventContext): Promise<CommandersOgIndex | null> {
  if (cachedCommandersOgIndex) {
    return cachedCommandersOgIndex;
  }

  const assets = context.env?.ASSETS;
  if (!assets || typeof assets.fetch !== 'function') {
    return null;
  }

  if (inflightCommandersOgPromise) {
    return inflightCommandersOgPromise;
  }

  const loadPromise = (async (): Promise<CommandersOgIndex | null> => {
    try {
      const assetUrl = new URL('/data/commanders-og.json', sanitizeHttpUrl(context.request.url, DEFAULT_SITE_URL));
      const res = await assets.fetch(assetUrl.toString());
      if (!res.ok) return null;
      const parsed: unknown = await res.json();
      if (!isValidCommandersOgIndex(parsed)) return null;
      cachedCommandersOgIndex = parsed;
      return parsed;
    } catch {
      return null;
    } finally {
      inflightCommandersOgPromise = null;
    }
  })();

  inflightCommandersOgPromise = loadPromise;
  return loadPromise;
}

function getFirebaseProjectId(env: PagesEnv | undefined): string {
  if (!env) return '';
  const primary = typeof env.FIREBASE_PROJECT_ID === 'string' ? env.FIREBASE_PROJECT_ID.trim() : '';
  if (primary) return primary;
  const viteFallback =
    typeof env.VITE_FIREBASE_PROJECT_ID === 'string' ? env.VITE_FIREBASE_PROJECT_ID.trim() : '';
  return viteFallback;
}

function buildGenericDeckOgMeta(requestUrl: string): DeckOgMeta {
  return {
    title: DEFAULT_OG_TITLE,
    description: DEFAULT_OG_DESCRIPTION,
    url: requestUrl,
    siteName: DEFAULT_SITE_NAME,
  };
}

function formatDeckOgMeta(params: {
  deckName: string;
  requestUrl: string;
  resolvedCommanders: CommanderOgEntry[];
  colorIdentityOverride?: string | null;
  cardCount: number;
  ownerHandle?: string;
  descriptionSnippet?: string;
}): DeckOgMeta {
  const cleanDeckName = normalizeInlineText(params.deckName) || 'Shared Commander Deck';
  const commanderNames = params.resolvedCommanders.map((c) => c.name);
  const colorIdentity =
    params.colorIdentityOverride ??
    (params.resolvedCommanders.length > 0
      ? formatColorIdentityCode(params.resolvedCommanders.map((c) => c.colorIdentity).join(''))
      : null);

  const parts: string[] = [];
  if (commanderNames.length > 0) {
    const label = commanderNames.length === 1 ? 'Commander' : 'Commanders';
    const identityBadge = colorIdentity ? ` [${colorIdentity}]` : '';
    parts.push(`${label}: ${commanderNames.join(' & ')}${identityBadge}`);
  } else if (colorIdentity) {
    parts.push(`Color Identity: ${colorIdentity}`);
  }

  if (params.cardCount > 0) {
    parts.push(`${params.cardCount} ${params.cardCount === 1 ? 'card' : 'cards'}`);
  }

  if (params.ownerHandle) {
    parts.push(`by @${normalizeInlineText(params.ownerHandle)}`);
  }

  if (params.descriptionSnippet) {
    const cleanSnippet = normalizeInlineText(params.descriptionSnippet);
    if (cleanSnippet) {
      const clipped =
        cleanSnippet.length > MAX_META_DESCRIPTION_SNIPPET_LEN
          ? `${cleanSnippet.slice(0, MAX_META_DESCRIPTION_SNIPPET_LEN - 1)}…`
          : cleanSnippet;
      parts.push(clipped);
    }
  }

  parts.push('Build Decks, Not Piles on Ripple99.');

  const primaryImage = params.resolvedCommanders.find((c) => Boolean(c.imageUrl))?.imageUrl ?? '';
  const imageAlt =
    commanderNames.length > 0 ? `${commanderNames.join(' & ')} — ${cleanDeckName}` : cleanDeckName;

  return {
    title: `${cleanDeckName} — Ripple99 Commander Deck`,
    description: parts.join(' · '),
    url: params.requestUrl,
    imageUrl: primaryImage || undefined,
    imageAlt,
    siteName: DEFAULT_SITE_NAME,
  };
}

async function resolveUrlDeckMeta(
  encodedParam: string,
  requestUrl: string,
  context: PagesEventContext,
): Promise<DeckOgMeta> {
  if (encodedParam.length > MAX_ENCODED_DECK_PARAM_LEN) {
    return buildGenericDeckOgMeta(requestUrl);
  }

  const decoded = decodeDeckFromUrlParam(encodedParam);
  if (!decoded) {
    return buildGenericDeckOgMeta(requestUrl);
  }

  const commandersIndex = await loadCommandersOgIndex(context);
  const resolvedCommanders: CommanderOgEntry[] = [];
  for (const id of decoded.commanderIds.slice(0, 2)) {
    const entry = resolveCommanderOgEntry(commandersIndex, id);
    if (entry) {
      resolvedCommanders.push(entry);
    }
  }

  let mainboardCount = 0;
  for (const entry of decoded.mainboard) {
    const qty = Array.isArray(entry) ? entry[1] : 0;
    if (typeof qty === 'number' && Number.isFinite(qty) && qty > 0) {
      mainboardCount += Math.floor(qty);
    }
  }

  const cardCount = decoded.commanderIds.length + mainboardCount;
  return formatDeckOgMeta({
    deckName: decoded.name || 'Shared Commander Deck',
    requestUrl,
    resolvedCommanders,
    cardCount,
  });
}

async function resolveCloudDeckMeta(
  deckId: string,
  isValidId: boolean,
  requestUrl: string,
  context: PagesEventContext,
): Promise<DeckOgMeta> {
  if (!isValidId) {
    return buildGenericDeckOgMeta(requestUrl);
  }

  const projectId = getFirebaseProjectId(context.env);
  if (!projectId) {
    return buildGenericDeckOgMeta(requestUrl);
  }

  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/decks/${encodeURIComponent(deckId)}`;

  let parsedDeck: ParsedFirestoreDeckDoc | null = null;
  try {
    const res = await fetch(firestoreUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FIRESTORE_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      return buildGenericDeckOgMeta(requestUrl);
    }
    const rawDoc: unknown = await res.json();
    parsedDeck = parseFirestoreDeckRestDoc(rawDoc);
  } catch {
    return buildGenericDeckOgMeta(requestUrl);
  }

  if (!parsedDeck) {
    return buildGenericDeckOgMeta(requestUrl);
  }

  const commandersIndex = await loadCommandersOgIndex(context);
  const resolvedCommanders: CommanderOgEntry[] = [];
  for (const oracleId of parsedDeck.commanderOracleIds) {
    const entry = resolveCommanderOgEntry(commandersIndex, oracleId);
    if (entry) {
      resolvedCommanders.push(entry);
    }
  }

  let colorIdentityOverride: string | null = null;
  if (parsedDeck.colorIdentity.length > 0) {
    colorIdentityOverride = formatColorIdentityCode(parsedDeck.colorIdentity);
  } else if (resolvedCommanders.length === 0 && parsedDeck.commanderOracleIds.length > 0) {
    colorIdentityOverride = 'C';
  }

  return formatDeckOgMeta({
    deckName: parsedDeck.name,
    requestUrl,
    resolvedCommanders,
    colorIdentityOverride,
    cardCount: parsedDeck.cardCount,
    ownerHandle: parsedDeck.ownerHandle,
    descriptionSnippet: parsedDeck.description,
  });
}

async function handleUnfurlRequest(
  context: PagesEventContext,
  isHead: boolean,
): Promise<Response> {
  const shareQuery = parseShareQuery(context.request.url);
  const userAgent = context.request.headers.get('user-agent');

  if (!shareQuery || !isSocialPreviewBot(userAgent)) {
    return context.next();
  }

  const meta =
    shareQuery.kind === 'd'
      ? await resolveUrlDeckMeta(shareQuery.encoded, context.request.url, context)
      : await resolveCloudDeckMeta(
          shareQuery.deckId,
          shareQuery.isValidId,
          context.request.url,
          context,
        );

  const html = buildDeckOgHtml(meta);
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': BOT_CACHE_CONTROL,
    Vary: 'User-Agent',
  });

  if (isHead) {
    const byteLength = new TextEncoder().encode(html).byteLength;
    headers.set('Content-Length', String(byteLength));
    return new Response(null, { status: 200, headers });
  }

  return new Response(html, { status: 200, headers });
}

/**
 * Cloudflare Pages Function GET handler serving dynamic Open Graph HTML to social preview bots.
 */
export async function onRequestGet(context: PagesEventContext): Promise<Response> {
  return handleUnfurlRequest(context, false);
}

/**
 * Cloudflare Pages Function HEAD handler returning OG preview headers without response body.
 */
export async function onRequestHead(context: PagesEventContext): Promise<Response> {
  return handleUnfurlRequest(context, true);
}
