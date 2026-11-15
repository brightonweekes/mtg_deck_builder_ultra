import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compactCardForDisk,
  deriveSmallImageUrl,
  hydrateCompactCard,
  type CompactCard,
  type DataManifest,
  type SerializedCompactCard,
} from '../../src/types/card.js';
import {
  MAX_CLOUDFLARE_ASSET_BYTES,
  resolveManifestGeneratedAt,
} from '../build-card-index.js';

const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, 'public', 'data');
const CARDS_PATH = path.join(DATA_DIR, 'cards.min.json');
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json');

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
  });
});
