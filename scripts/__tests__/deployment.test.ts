import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  compactCardForDisk,
  deriveSmallImageUrl,
  hydrateCompactCard,
  type CompactCard,
  type DataManifest,
  type ScryfallRawCard,
  type SerializedCompactCard,
} from '../../src/types/card.js';
import {
  buildCardIndex,
  MAX_CLOUDFLARE_ASSET_BYTES,
  resolveManifestGeneratedAt,
} from '../build-card-index.js';
import {
  resolveCommanderOgEntry,
  SCRYFALL_IMAGE_PREFIX,
  type CommandersOgIndex,
} from '../lib/commanders-og.js';

const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, 'public', 'data');
const CARDS_PATH = path.join(DATA_DIR, 'cards.min.json');
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json');
const COMMANDERS_OG_PATH = path.join(DATA_DIR, 'commanders-og.json');

function makeCompactCard(overrides: Partial<CompactCard> = {}): CompactCard {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    oracleId: '11111111-1111-1111-1111-111111111111',
    name: 'Test Card',
    manaCost: '{2}{U}',
    cmc: 3,
    typeLine: 'Instant',
    oracleText: 'Draw two cards.',
    colors: ['U'],
    colorIdentity: ['U'],
    keywords: [],
    edhrecRank: 250,
    priceUsd: 2.5,
    imageNormal: 'https://cards.scryfall.io/normal/front/a/b/test.jpg',
    imageSmall: 'https://cards.scryfall.io/small/front/a/b/test.jpg',
    artCrop: 'https://cards.scryfall.io/art_crop/front/a/b/test.jpg',
    layout: 'normal',
    isCommanderEligible: false,
    roles: ['draw'],
    themes: [],
    ...overrides,
  };
}

describe('Milestone 5 deployment readiness & Cloudflare Pages compliance', () => {
  it('keeps public/data/cards.min.json strictly under Cloudflare Pages 25 MiB limit with >= 2 MiB headroom', () => {
    expect(existsSync(CARDS_PATH)).toBe(true);
    expect(existsSync(MANIFEST_PATH)).toBe(true);

    const fileStats = statSync(CARDS_PATH);
    expect(fileStats.size).toBeGreaterThan(10 * 1024 * 1024);
    expect(fileStats.size).toBeLessThan(MAX_CLOUDFLARE_ASSET_BYTES);

    const headroomBytes = MAX_CLOUDFLARE_ASSET_BYTES - fileStats.size;
    expect(headroomBytes).toBeGreaterThan(2 * 1024 * 1024);

    const rawBytes = readFileSync(CARDS_PATH);
    const actualSha = createHash('sha256').update(rawBytes).digest('hex').slice(0, 16);
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as DataManifest;
    const diskCards = JSON.parse(rawBytes.toString('utf8')) as SerializedCompactCard[];

    expect(manifest.rawSizeBytes).toBe(fileStats.size);
    expect(manifest.version).toBe(actualSha);
    expect(manifest.totalCards).toBe(diskCards.length);
    expect(diskCards.length).toBeGreaterThanOrEqual(32_000);

    // Ensure disk compaction removed all artCrop and derivable imageSmall duplicates
    for (const card of diskCards) {
      expect((card as Partial<CompactCard>).artCrop).toBeUndefined();
      if (card.imageNormal) {
        expect(card.imageSmall).not.toBe(deriveSmallImageUrl(card.imageNormal));
      }
    }
  });

  it('compacts and re-hydrates single-face, custom-thumbnail, empty-image, and multi-face cards losslessly', () => {
    const standard = makeCompactCard();
    const diskStandard = compactCardForDisk(standard);
    expect((diskStandard as Partial<CompactCard>).artCrop).toBeUndefined();
    expect(diskStandard.imageSmall).toBeUndefined();

    const hydratedStandard = hydrateCompactCard(diskStandard);
    expect(hydratedStandard.imageSmall).toBe(standard.imageSmall);

    // Non-derivable custom imageSmall must survive disk serialization verbatim
    const customThumb = makeCompactCard({
      imageNormal: 'https://cards.scryfall.io/normal/front/a/b/main.jpg',
      imageSmall: 'https://cdn.example.com/custom-thumb.jpg',
    });
    const diskCustom = compactCardForDisk(customThumb);
    expect(diskCustom.imageSmall).toBe('https://cdn.example.com/custom-thumb.jpg');
    expect(hydrateCompactCard(diskCustom).imageSmall).toBe(
      'https://cdn.example.com/custom-thumb.jpg',
    );

    // Double-faced card strips derivable face thumbnails and restores them cleanly
    const dfc = makeCompactCard({
      name: 'Esika, God of the Tree // The Prismatic Bridge',
      layout: 'modal_dfc',
      faces: [
        {
          name: 'Esika, God of the Tree',
          manaCost: '{1}{G}{G}',
          typeLine: 'Legendary Creature — God',
          oracleText: 'Vigilance',
          imageNormal: 'https://cards.scryfall.io/normal/front/1/2/esika.jpg',
          imageSmall: 'https://cards.scryfall.io/small/front/1/2/esika.jpg',
        },
        {
          name: 'The Prismatic Bridge',
          manaCost: '{W}{U}{B}{R}{G}',
          typeLine: 'Legendary Enchantment',
          oracleText: 'Upkeep trigger',
          imageNormal: 'https://cards.scryfall.io/normal/back/3/4/bridge.jpg',
          imageSmall: 'https://cards.scryfall.io/small/back/3/4/bridge.jpg',
        },
      ],
    });
    const diskDfc = compactCardForDisk(dfc);
    expect(diskDfc.faces![0]!.imageSmall).toBeUndefined();
    expect(diskDfc.faces![1]!.imageSmall).toBeUndefined();

    const hydratedDfc = hydrateCompactCard(diskDfc);
    expect(hydratedDfc.faces![0]!.imageSmall).toBe(
      'https://cards.scryfall.io/small/front/1/2/esika.jpg',
    );
    expect(hydratedDfc.faces![1]!.imageSmall).toBe(
      'https://cards.scryfall.io/small/back/3/4/bridge.jpg',
    );

    // Card with empty imageNormal hydrates cleanly with empty imageSmall
    const blankImg = compactCardForDisk(makeCompactCard({ imageNormal: '', imageSmall: '' }));
    expect(hydrateCompactCard(blankImg).imageSmall).toBe('');
  });

  it('resolves manifest timestamps idempotently when SHA-256 version is unchanged', () => {
    const existing: DataManifest = {
      version: 'abc123def4567890',
      generatedAt: '2026-11-10T04:00:00.000Z',
      scryfallUpdatedAt: '2026-11-10T03:55:00.000Z',
      totalCards: 32643,
      commanderCount: 3759,
      rawSizeBytes: 22_000_000,
      gzipSizeBytes: 4_800_000,
      brotliSizeBytes: 3_000_000,
      roleCounts: {
        ramp: 1,
        draw: 1,
        removal: 1,
        wipe: 1,
        tutor: 1,
        recursion: 1,
        protection: 1,
      },
      themeCounts: {},
    };

    const same = resolveManifestGeneratedAt(
      existing,
      'abc123def4567890',
      '2026-11-14T04:00:00.000Z',
    );
    expect(same.versionChanged).toBe(false);
    expect(same.generatedAt).toBe('2026-11-10T04:00:00.000Z');
    expect(same.scryfallUpdatedAt).toBe('2026-11-10T03:55:00.000Z');

    const changed = resolveManifestGeneratedAt(
      existing,
      'deadbeefcafebabe',
      '2026-11-14T04:00:00.000Z',
    );
    expect(changed.versionChanged).toBe(true);
    expect(changed.generatedAt).toBe('2026-11-14T04:00:00.000Z');
    expect(changed.scryfallUpdatedAt).toBeUndefined();

    const fresh = resolveManifestGeneratedAt(null, 'deadbeefcafebabe', '2026-11-14T04:00:00.000Z');
    expect(fresh.versionChanged).toBe(true);
    expect(fresh.generatedAt).toBe('2026-11-14T04:00:00.000Z');
  });

  it('includes valid Cloudflare Pages headers, favicon, Node version pin, and GitHub workflows', () => {
    const nvmrcPath = path.join(ROOT_DIR, '.nvmrc');
    const nodeVersionPath = path.join(ROOT_DIR, '.node-version');
    const headersPath = path.join(ROOT_DIR, 'public', '_headers');
    const faviconPath = path.join(ROOT_DIR, 'public', 'favicon.svg');
    const indexHtmlPath = path.join(ROOT_DIR, 'index.html');
    const ciWorkflowPath = path.join(ROOT_DIR, '.github', 'workflows', 'ci.yml');
    const updateWorkflowPath = path.join(ROOT_DIR, '.github', 'workflows', 'update-cards.yml');

    expect(existsSync(nvmrcPath)).toBe(true);
    expect(existsSync(nodeVersionPath)).toBe(true);
    expect(existsSync(headersPath)).toBe(true);
    expect(existsSync(faviconPath)).toBe(true);
    expect(existsSync(ciWorkflowPath)).toBe(true);
    expect(existsSync(updateWorkflowPath)).toBe(true);

    expect(readFileSync(nvmrcPath, 'utf8').trim()).toBe('22');
    expect(readFileSync(nodeVersionPath, 'utf8').trim()).toBe('22');
    expect(readFileSync(indexHtmlPath, 'utf8')).toContain('/favicon.svg');

    const headers = readFileSync(headersPath, 'utf8');
    expect(headers).toContain('/data/manifest.json');
    expect(headers).toContain('must-revalidate');
    expect(headers).toContain('/data/cards.min.json');
    expect(headers).toContain('/assets/*');
    expect(headers).toContain('Strict-Transport-Security: max-age=31536000; includeSubDomains; preload');
    expect(headers).toContain('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    expect(headers).toContain('https://identitytoolkit.googleapis.com');
    expect(headers).toContain('https://firestore.googleapis.com');
    expect(headers).not.toContain('*.firebaseio.com');
    expect(headers).not.toContain('*.googleapis.com');
    // Crucial: COEP require-corp would break Scryfall card artwork hotlinking
    expect(headers.toLowerCase()).not.toContain('require-corp');

    const ciWorkflow = readFileSync(ciWorkflowPath, 'utf8');
    expect(ciWorkflow).toContain('npm run typecheck');
    expect(ciWorkflow).toContain('npm test');
    expect(ciWorkflow).toContain('npm run build');

    const updateWorkflow = readFileSync(updateWorkflowPath, 'utf8');
    expect(updateWorkflow).toContain("cron: '0 4 * * *'");
    expect(updateWorkflow).toContain('contents: write');
    expect(updateWorkflow).toContain('CLOUDFLARE_DEPLOY_HOOK_URL');
    expect(updateWorkflow).toContain('public/data/commanders-og.json');

    const routesPath = path.join(ROOT_DIR, 'public', '_routes.json');
    expect(existsSync(routesPath)).toBe(true);
    expect(JSON.parse(readFileSync(routesPath, 'utf8'))).toEqual({
      version: 1,
      include: ['/'],
      exclude: [],
    });
  });

  it('ships compact public/data/commanders-og.json under 2 MiB resolving real Commanders by id and oracleId', () => {
    expect(existsSync(COMMANDERS_OG_PATH)).toBe(true);

    const ogStats = statSync(COMMANDERS_OG_PATH);
    expect(ogStats.size).toBeGreaterThan(100_000);
    expect(ogStats.size).toBeLessThan(2 * 1024 * 1024);

    const ogIndex = JSON.parse(readFileSync(COMMANDERS_OG_PATH, 'utf8')) as CommandersOgIndex;
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as DataManifest;
    const diskCards = JSON.parse(
      readFileSync(CARDS_PATH, 'utf8'),
    ) as SerializedCompactCard[];

    expect(Array.isArray(ogIndex.rows)).toBe(true);
    expect(ogIndex.rows.length).toBeGreaterThan(3_000);
    expect(Object.keys(ogIndex.byId).length).toBe(manifest.commanderCount);
    expect(Object.keys(ogIndex.byOracleId).length).toBeGreaterThan(3_000);

    // Strip prefix verification on raw rows
    for (const row of ogIndex.rows) {
      if (row[2]) {
        expect(row[2].startsWith(SCRYFALL_IMAGE_PREFIX)).toBe(false);
      }
    }

    const atraxa = diskCards.find(
      (c) => c.isCommanderEligible && c.name === "Atraxa, Praetors' Voice",
    );
    expect(atraxa).toBeDefined();

    const byIdEntry = resolveCommanderOgEntry(ogIndex, atraxa!.id);
    const byOracleEntry = resolveCommanderOgEntry(ogIndex, atraxa!.oracleId);

    expect(byIdEntry).not.toBeNull();
    expect(byOracleEntry).not.toBeNull();
    expect(byIdEntry).toEqual(byOracleEntry);
    expect(byIdEntry!.name).toBe("Atraxa, Praetors' Voice");
    expect(byIdEntry!.colorIdentity).toBe('WUBG');
    expect(byIdEntry!.imageUrl.startsWith(SCRYFALL_IMAGE_PREFIX)).toBe(true);
    expect(byIdEntry!.imageUrl).toBe(atraxa!.imageNormal);

    expect(resolveCommanderOgEntry(ogIndex, 'non-existent-id')).toBeNull();
  });

  it('writes commanders-og.json from buildCardIndex() and recreates it if missing when version is unchanged', async () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), 'ripple99-build-idx-'));
    const cacheDir = path.join(tempRoot, 'cache');
    const outputDir = path.join(tempRoot, 'out');
    try {
      mkdirSync(cacheDir, { recursive: true });
      mkdirSync(outputDir, { recursive: true });

      const sampleRawCards: ScryfallRawCard[] = [
        {
          id: '11111111-1111-4111-8111-111111111111',
          oracle_id: '22222222-2222-4222-8222-222222222222',
          name: 'Test Commander',
          layout: 'normal',
          mana_cost: '{1}{U}{B}',
          cmc: 3,
          type_line: 'Legendary Creature — Wizard',
          oracle_text: 'Draw a card.',
          colors: ['U', 'B'],
          color_identity: ['U', 'B'],
          keywords: [],
          legalities: { commander: 'legal' },
          games: ['paper'],
          digital: false,
          edhrec_rank: 10,
          prices: { usd: '1.00' },
          image_uris: {
            small: `${SCRYFALL_IMAGE_PREFIX}small/front/1/1/cmd.jpg`,
            normal: `${SCRYFALL_IMAGE_PREFIX}normal/front/1/1/cmd.jpg`,
          },
        },
        {
          id: '33333333-3333-4333-8333-333333333333',
          oracle_id: '44444444-4444-4444-8444-444444444444',
          name: 'Sol Ring',
          layout: 'normal',
          mana_cost: '{1}',
          cmc: 1,
          type_line: 'Artifact',
          oracle_text: '{T}: Add {C}{C}.',
          colors: [],
          color_identity: [],
          keywords: [],
          legalities: { commander: 'legal' },
          games: ['paper'],
          digital: false,
          edhrec_rank: 1,
          prices: { usd: '1.50' },
          image_uris: {
            small: `${SCRYFALL_IMAGE_PREFIX}small/front/3/3/ring.jpg`,
            normal: `${SCRYFALL_IMAGE_PREFIX}normal/front/3/3/ring.jpg`,
          },
        },
      ];

      const jsonl = `${sampleRawCards.map((c) => JSON.stringify(c)).join('\n')}\n`;
      writeFileSync(path.join(cacheDir, 'oracle-cards.jsonl.gz'), gzipSync(Buffer.from(jsonl, 'utf8')));
      writeFileSync(
        path.join(cacheDir, 'oracle-cards-meta.json'),
        JSON.stringify({ updated_at: '2026-11-15T00:00:00Z' }),
        'utf8',
      );
      writeFileSync(
        path.join(cacheDir, 'paper-overrides.json'),
        JSON.stringify({
          version: 1,
          updatedAt: '2026-11-15T00:00:00Z',
          targetCount: 0,
          overrides: {},
        }),
        'utf8',
      );

      const firstManifest = await buildCardIndex({ offline: true, cacheDir, outputDir });
      const ogOutPath = path.join(outputDir, 'commanders-og.json');
      expect(existsSync(path.join(outputDir, 'cards.min.json'))).toBe(true);
      expect(existsSync(path.join(outputDir, 'manifest.json'))).toBe(true);
      expect(existsSync(ogOutPath)).toBe(true);

      const ogParsed = JSON.parse(readFileSync(ogOutPath, 'utf8')) as CommandersOgIndex;
      expect(resolveCommanderOgEntry(ogParsed, '11111111-1111-4111-8111-111111111111')).toEqual({
        name: 'Test Commander',
        colorIdentity: 'UB',
        imageUrl: `${SCRYFALL_IMAGE_PREFIX}normal/front/1/1/cmd.jpg`,
      });
      expect(resolveCommanderOgEntry(ogParsed, '33333333-3333-4333-8333-333333333333')).toBeNull();

      // Remove commanders-og.json while keeping cards.min.json + manifest.json unchanged
      unlinkSync(ogOutPath);
      expect(existsSync(ogOutPath)).toBe(false);

      const secondManifest = await buildCardIndex({ offline: true, cacheDir, outputDir });
      expect(secondManifest.version).toBe(firstManifest.version);
      expect(secondManifest.generatedAt).toBe(firstManifest.generatedAt);
      expect(existsSync(ogOutPath)).toBe(true);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
