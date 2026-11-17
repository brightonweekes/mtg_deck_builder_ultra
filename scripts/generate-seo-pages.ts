import path from 'node:path';
import {
  CLOUDFLARE_PAGES_FILE_LIMIT,
  generateSeoPages,
  loadCatalogForSeo,
} from './lib/seo-builder.js';

function main(): void {
  const rootDir = process.cwd();
  const outDir = path.join(rootDir, 'dist');
  const { cards, manifest } = loadCatalogForSeo(rootDir);
  const stats = generateSeoPages({ cards, manifest, outDir });

  if (stats.totalGeneratedFiles >= CLOUDFLARE_PAGES_FILE_LIMIT - 1000) {
    throw new Error(
      `Generated file count (${stats.totalGeneratedFiles}) approaches Cloudflare Pages limit (${CLOUDFLARE_PAGES_FILE_LIMIT}).`,
    );
  }

  console.log(
    [
      '=== Stage 4 SEO Generation Summary ===',
      `Commanders:  ${stats.commanderPages.toLocaleString()}`,
      `Themes:      ${stats.themePages}`,
      `Budget <=$2: ${stats.budgetPages}`,
      `Tools/Hubs:  ${stats.toolPages} tools + ${stats.hubPages} hub indexes`,
      `Sitemaps:    ${stats.sitemapFiles} XML files`,
      `Total Files: ${stats.totalGeneratedFiles.toLocaleString()} (CF limit: ${CLOUDFLARE_PAGES_FILE_LIMIT.toLocaleString()})`,
      `Elapsed:     ${stats.elapsedMs} ms`,
    ].join('\n'),
  );
}

main();
