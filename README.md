# MTG Commander Deck Builder Ultra

Fast, offline-capable, browser-native Commander deck builder powered by a pre-tagged Scryfall catalog (`32,643` Commander-legal cards), client-side `IndexedDB` persistence (`Dexie`), an instant Web Worker bitmask search & Method A theme-synergy engine, and a full interactive Commander Deck Studio.

---

## Architecture Overview

1. **Zero-Runtime-Cost Data Pipeline (`scripts/`):**
   * Streams Scryfall's `oracle-cards` and `default-cards` bulk datasets to include all tournament-legal Commander cards (backfilling paper USD prices and physical artwork for MTGO/Arena-represented Reserved List cards).
   * Applies deterministic **Method A Functional Role & Theme Tagging** (ramp, draw, removal, wipe, tutor, recursion, protection, plus 40 mechanical archetypes) and serializes a compact catalog (`< 25 MiB`) cleanly suited for Cloudflare Pages' CDN edge.
2. **Client Storage & Search Engine (`src/db/`, `src/workers/`, `src/search/`):**
   * Caches the catalog snapshot in `IndexedDB` (`Dexie`) for `< 100 ms` repeat visits, revalidating only when `manifest.version` changes (fetching `/data/cards.min.json?v=<hash>`).
   * Indexes color identities via 5-bit integers, precomputed role/theme/keyword/type bitmasks, and inverted token maps inside a dedicated module Web Worker for `< 25 ms` filtering and Method A synergy scoring.
3. **Commander Deck Studio (`src/components/`, `src/deck/`):**
   * Enforces Commander rules natively (Commander / Partner / Partner With / Friends Forever / Choose a Background / Doctor's Companion, Color Identity lock, singleton rules, basic lands, and special copy-limit cards).
   * Interactive mana curve, land-count / mana-pip advisor, category grouping, inline import/export (plain text / Moxfield / Archidekt / CSV / JSON), and compact `?d=...` binary URL sharing.

---

## Local Development

```bash
# Install dependencies (Node 22 recommended; pinned in .nvmrc)
npm ci

# Start local dev server
npm run dev

# Rebuild card catalog from Scryfall (or add -- --offline to use .cache/)
npm run build:cards

# Inspect cards, stats, roles, and themes in public/data/cards.min.json
npm run inspect:cards -- --stats

# Typecheck, run automated tests, and build production dist/
npm run typecheck
npm test
npm run build
```

---

## Free Automated Hosting (GitHub Actions + Cloudflare Pages)

* **Nightly Card Updates (`.github/workflows/update-cards.yml`):** Runs daily at `04:00 UTC` (or on demand via **Workflow Dispatch**), refreshes Scryfall data, runs `typecheck` + `test` + `build`, commits `public/data/` only when the SHA-256 catalog version changes, and triggers Cloudflare Pages via `CLOUDFLARE_DEPLOY_HOOK_URL`.
* **Cloudflare Pages Settings:**
  * **Build command:** `npm run build`
  * **Build output directory:** `dist`
  * **Node version:** Pinned automatically via `.nvmrc` (`22`)
  * **Edge headers:** Configured via `public/_headers` (fast revalidation for `manifest.json`, immutable caching for versioned `cards.min.json?v=...` and `/assets/*`, Brotli compression over the wire).
