import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CompactCard, DataManifest, FunctionalRole } from '../src/types/card.js';

interface InspectArgs {
  name?: string;
  role?: string;
  theme?: string;
  ci?: string;
  commander: boolean;
  limit: number;
  stats: boolean;
}

function parseArgs(argv: string[]): InspectArgs {
  const parsed: InspectArgs = {
    commander: false,
    limit: 20,
    stats: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--stats') {
      parsed.stats = true;
    } else if (arg === '--commander') {
      parsed.commander = true;
    } else if (arg === '--name' && argv[i + 1]) {
      parsed.name = argv[++i];
    } else if (arg === '--role' && argv[i + 1]) {
      parsed.role = argv[++i];
    } else if (arg === '--theme' && argv[i + 1]) {
      parsed.theme = argv[++i];
    } else if (arg === '--ci' && argv[i + 1]) {
      parsed.ci = argv[++i];
    } else if (arg === '--limit' && argv[i + 1]) {
      const n = Number.parseInt(argv[++i] ?? '20', 10);
      if (Number.isFinite(n) && n > 0) parsed.limit = n;
    }
  }

  return parsed;
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function matchesColorIdentity(cardCi: string[], allowedCiStr: string): boolean {
  const upper = allowedCiStr.toUpperCase();
  if (upper === 'C') return cardCi.length === 0;
  const allowed = new Set(upper.split(''));
  return cardCi.every((c) => allowed.has(c));
}

async function main(): Promise<void> {
  const dataDir = path.resolve(process.cwd(), 'public', 'data');
  const cardsPath = path.join(dataDir, 'cards.min.json');
  const manifestPath = path.join(dataDir, 'manifest.json');

  if (!existsSync(cardsPath) || !existsSync(manifestPath)) {
    console.error(`Dataset not found at ${cardsPath}. Run "npm run build:cards" first.`);
    process.exitCode = 1;
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as DataManifest;

  if (args.stats) {
    console.log('=== Dataset Manifest Stats ===');
    console.log(`Version:         ${manifest.version}`);
    console.log(`Generated At:    ${manifest.generatedAt}`);
    console.log(`Scryfall Date:   ${manifest.scryfallUpdatedAt}`);
    console.log(`Total Cards:     ${manifest.totalCards.toLocaleString()}`);
    console.log(`Commanders:      ${manifest.commanderCount.toLocaleString()}`);
    console.log(`Raw Size:        ${formatMb(manifest.rawSizeBytes)}`);
    console.log(`Gzip Size:       ${formatMb(manifest.gzipSizeBytes)}`);
    console.log(`Brotli Size:     ${formatMb(manifest.brotliSizeBytes)}`);
    console.log('\nRoles:');
    for (const [role, count] of Object.entries(manifest.roleCounts)) {
      console.log(`  ${role.padEnd(14)} ${count.toLocaleString().padStart(6)}`);
    }
    console.log('\nThemes:');
    for (const [theme, count] of Object.entries(manifest.themeCounts)) {
      console.log(`  ${theme.padEnd(24)} ${count.toLocaleString().padStart(6)}`);
    }
    if (!args.name && !args.role && !args.theme && !args.ci && !args.commander) {
      return;
    }
  }

  const cards = JSON.parse(await readFile(cardsPath, 'utf8')) as CompactCard[];
  const nameQuery = args.name?.toLowerCase();
  const roleFilters = args.role ? (args.role.split(',').map((s) => s.trim().toLowerCase()) as FunctionalRole[]) : [];
  const themeFilters = args.theme ? args.theme.split(',').map((s) => s.trim().toLowerCase()) : [];

  const matches = cards.filter((card) => {
    if (args.commander && !card.isCommanderEligible) return false;
    if (nameQuery && !card.name.toLowerCase().includes(nameQuery)) return false;
    if (args.ci && !matchesColorIdentity(card.colorIdentity, args.ci)) return false;
    if (roleFilters.length > 0 && !roleFilters.every((r) => card.roles.includes(r))) return false;
    if (themeFilters.length > 0 && !themeFilters.every((t) => card.themes.includes(t))) return false;
    return true;
  });

  console.log(`\nMatched ${matches.length.toLocaleString()} cards (showing up to ${args.limit}):\n`);
  for (const card of matches.slice(0, args.limit)) {
    const ci = card.colorIdentity.length > 0 ? card.colorIdentity.join('') : 'C';
    const cmdInfo = card.isCommanderEligible
      ? `Commander${card.partnerType ? ` (${card.partnerType}${card.partnerWithName ? `: ${card.partnerWithName}` : ''})` : ''}`
      : '99';
    const price = card.priceUsd !== null ? `$${card.priceUsd.toFixed(2)}` : 'N/A';
    const rank = card.edhrecRank !== null ? `#${card.edhrecRank}` : 'Unranked';

    console.log(`${card.name} ${card.manaCost || ''} [${ci}] — ${card.typeLine}`);
    console.log(`  Rank: ${rank} | Price: ${price} | Status: ${cmdInfo} | Layout: ${card.layout}`);
    console.log(`  Roles:  [${card.roles.join(', ')}]`);
    console.log(`  Themes: [${card.themes.join(', ')}]`);
    if (card.faces) {
      console.log(`  Faces:  ${card.faces.map((f) => f.name).join(' // ')}`);
    }
    console.log('');
  }
}

main().catch((err: unknown) => {
  console.error('Inspector failed:', err);
  process.exitCode = 1;
});
