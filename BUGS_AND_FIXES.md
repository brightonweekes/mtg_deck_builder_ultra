# Known Bugs, Quirks & Deferred Fixes

This document tracks non-blocking bugs, data-pipeline quirks, and detailed solution designs intentionally deferred so feature milestones can progress smoothly without losing technical context.

---

## Index

| ID | Summary | Severity | Status | Primary Areas |
| :--- | :--- | :--- | :--- | :--- |
| **BUG-001** | High-value Reserved List & paper Commander cards missing/unpriced due to Scryfall `oracle-cards` MTGO representative printings (*Gaea's Cradle* sorts `#1` High → Low) | Medium-High | **Resolved (Fixed)** | [card-normalizer.ts](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/scripts/lib/card-normalizer.ts), [paper-backfill.ts](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/scripts/lib/paper-backfill.ts), [build-card-index.ts](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/scripts/build-card-index.ts) |
| **BUG-002** | Flaky wall-clock search latency assertions (`< 25 ms`) failing on GitHub Actions shared CI runners (`27.78 ms` / `28.29 ms` on commit `e80f155`) | Low-Medium | **Resolved (Fixed)** | [searchEngine.test.ts](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/src/__tests__/searchEngine.test.ts), [searchEngine.ts](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/src/search/searchEngine.ts), [ci.yml](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/.github/workflows/ci.yml) |

---

## BUG-001: Scryfall `oracle-cards` Representative MTGO Printings Exclude ~1,046 Commander Cards & Nullify Paper USD Prices

### Summary / Symptom
When sorting the catalog by **Price: High → Low**, **Gaea's Cradle (\$1,653.09)** appears at `#1`, above significantly more expensive Commander-legal paper cards such as **Timetwister**, **The Tabernacle at Pendrell Vale**, **Mishra's Workshop**, **Bazaar of Baghdad**, **Chains of Mephistopheles**, **Candelabra of Tawnos**, **Mox Diamond**, **Lion's Eye Diamond**, and the original dual lands (**Underground Sea**, **Volcanic Island**, etc.).

### Root Cause Analysis

#### 1. How Scryfall's `oracle-cards` Selects a "Representative" Printing
In [scryfall-fetcher.ts](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/scripts/lib/scryfall-fetcher.ts#L10), `SCRYFALL_BULK_URL` downloads `https://api.scryfall.com/bulk-data/oracle-cards`, which contains **exactly one representative printing object per unique `oracle_id`**—typically the most recent modern-frame release.

For Reserved List (and certain older) cards that cannot be reprinted in paper, the most recent release in Scryfall's database is often a **Magic Online (MTGO)** digital remaster set (*Vintage Masters* `vma`, *Tempest Remastered* `tpr`, and *Masters Edition I–IV* `me1`–`me4`). As a result, Scryfall's `oracle-cards` bulk file stores MTGO printing metadata on those Oracle cards:
* **Timetwister** → `set: "vma"`, `digital: true`, `games: ["mtgo"]`, `prices.usd: null` (`tix: "4.72"`)
* **The Tabernacle at Pendrell Vale** → `set: "me3"`, `digital: true`, `games: ["mtgo"]`, `prices.usd: null`
* **Mishra's Workshop** → `set: "vma"`, `digital: true`, `games: ["mtgo"]`, `prices.usd: null`
* **Bazaar of Baghdad** → `set: "vma"`, `digital: true`, `games: ["mtgo"]`, `prices.usd: null`
* **Chains of Mephistopheles** → `set: "me1"`, `digital: true`, `games: ["mtgo"]`, `prices.usd: null`
* **Candelabra of Tawnos** → `set: "me4"`, `digital: true`, `games: ["mtgo"]`, `prices.usd: null`
* **Mox Diamond** → `set: "tpr"`, `digital: true`, `games: ["mtgo"]`, `prices.usd: null`
* **Lion's Eye Diamond** → `set: "vma"`, `digital: true`, `games: ["mtgo"]`, `prices.usd: null`
* **Original Dual Lands (*Underground Sea*, etc.)** → `set: "vma"` / `"me4"`, `digital: true`, `games: ["mtgo"]`, `prices.usd: null`

By contrast, cards omitted from those MTGO remaster sets—such as **Gaea's Cradle** (`set: "usg"`, *Urza's Saga*, \$1,653.09), **Serra's Sanctum** (\$521.73), and **Grim Monolith** (\$475.45)—retain their original **paper** *Urza's* printings in `oracle-cards`, so their `prices.usd` fields are populated.

#### 2. Hard Exclusion in `isCommanderPlayable`
In [card-normalizer.ts](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/scripts/lib/card-normalizer.ts#L78-L84):
```ts
export function isCommanderPlayable(raw: ScryfallRawCard): boolean {
  if (raw.legalities?.commander !== 'legal') return false;
  if (EXCLUDED_LAYOUTS.has(raw.layout)) return false;
  if (raw.set_type === 'memorabilia' || raw.set_type === 'token') return false;
  if (raw.digital === true && !raw.games?.includes('paper')) return false;
  return true;
}
```
Because `raw.digital` and `raw.games` in `oracle-cards` reflect **only that single representative printing** rather than all printings of the Oracle card, line 82 inadvertently filters out **1,046 Commander-legal cards** whose representative printing happened to be digital (`vma`, `tpr`, `me1`–`me4`). Note that true Arena/Alchemy digital-only cards already fail line 79 (`legalities.commander !== 'legal'`).

#### 3. Null Paper USD Prices & MTGO Art on Restored Cards
In [card-normalizer.ts](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/scripts/lib/card-normalizer.ts#L67-L73) and line 284 (`priceUsd: parsePriceUsd(raw.prices)`), even if line 82 is removed, `oracle-cards` only includes `prices` (`usd`, `usd_foil`, `usd_etched`) for the single representative printing. An MTGO representative printing has `prices.usd: null` (only `tix`), so restored cards would sort at the bottom (`null` last) in **Price: High → Low** and display `—` in deck cost totals unless a paper fallback price is resolved during `npm run build:cards`.

---

### Proposed Detailed Solution (For Future Implementation)

#### Step 1: Fix Commander Legality Filter in `card-normalizer.ts`
1. Update `isCommanderPlayable(raw)` in [card-normalizer.ts](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/scripts/lib/card-normalizer.ts#L78-L84):
   * Remove line 82 (`if (raw.digital === true && !raw.games?.includes('paper')) return false;`).
   * Rely on `raw.legalities?.commander === 'legal'`, `EXCLUDED_LAYOUTS`, and `raw.set_type === 'memorabilia' || raw.set_type === 'token'`.
   * *Optional extra safeguard:* Only drop `raw.digital === true` if a subsequent paper-printing check confirms zero paper printings exist (see Step 2).
2. Update the existing digital-only unit test in [pipeline.test.ts](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/scripts/__tests__/pipeline.test.ts#L97-L109):
   * Lines 103–105 currently construct `makeCard({ digital: true, games: ['arena'] })` while inheriting `legalities: { commander: 'legal' }` from `makeCard` defaults.
   * Update that test case to match real Scryfall Arena/Alchemy data (`legalities: { commander: 'not_legal' }`), and add a new regression test confirming a Commander-legal card represented by an MTGO printing (`digital: true, games: ['mtgo'], legalities: { commander: 'legal' }`) is **kept**.

#### Step 2: Backfill Paper Prices (and Optional Paper Art) During `npm run build:cards`
After filtering Commander-legal `oracle-cards` entries, identify the target subset needing paper backfill:
* Any card where `raw.digital === true || !raw.games?.includes('paper') || parsePriceUsd(raw.prices) === null`.

Two clean ways to resolve paper prices in `scripts/lib/` without bloating the browser bundle:

##### Option A (Recommended): Streaming `default-cards` Filter + Cached Override File
Scryfall's `default-cards` bulk endpoint (`https://api.scryfall.com/bulk-data/default-cards`) contains every printing of every card in a single bulk download (no API rate-limit pagination delays).
1. Collect the `Set<string>` of `oracle_id`s needing paper prices (~1,000–2,000 IDs out of ~32k).
2. During `npm run build:cards` (when `.cache/oracle-cards-meta.json` refreshes or overrides are missing/stale):
   * Stream `default-cards` (`jsonl_download_uri`) line-by-line via `createGunzip()` + `readline` without holding all printings in memory.
   * Keep only lines where:
     * `oracle_id` is in the needed `Set`
     * `games?.includes('paper')` and `digital !== true`
     * `set_type !== 'memorabilia'` and `set_type !== 'token'` (prevents *Collectors' Edition* / *30th Anniversary* proxies from distorting paper prices)
   * Choose the best paper printing per `oracle_id`:
     * **Pricing rule:** Prefer the **lowest non-null non-foil `prices.usd`** (or fallback to lowest `usd_foil` / `usd_etched`) among tournament-legal paper printings so e.g. *Underground Sea* reflects its *Revised* (`3ed`) baseline price instead of *Alpha* collector pricing, while *Timetwister* accurately reflects *Unlimited* (`2ed`).
     * **Optional artwork rule:** Optionally capture that paper printing's `image_uris` (`small`, `normal`, `art_crop`) or `card_faces` images if we prefer tabletop paper art over MTGO-only promos/masters sets.
3. Persist only the tiny extracted dictionary (e.g., `.cache/paper-overrides.json`, ~150 KB) so subsequent `--offline` or cached `npm run build:cards` runs complete in milliseconds without storing or re-streaming `default-cards`.

##### Option B: Batched `/cards/search` API Lookups (Zero Large Bulk Download)
If avoiding the larger `default-cards` CI download (~100 MB+ compressed) is preferred:
1. Respect Scryfall's 50–100 ms rate limit and query Scryfall's `/cards/search` endpoint in batches (`q=game:paper legal:commander -set_type:memorabilia ...`) using `order=usd&dir=asc` or grouped exact-name `OR` queries (`!"Card A" OR !"Card B"` up to ~15 cards per query, ~70 requests total) exclusively for the unresolved `oracle_id`s.
2. Cache results into `.cache/paper-overrides.json` keyed by bulk `updated_at` (or TTL).

#### Step 3: Preserve Card ID Stability When Merging Overrides
> **CRITICAL COMPATIBILITY INVARIANT**
>
> In Milestone 4, saved decks in `IndexedDB` ([cardDb.ts](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/src/db/cardDb.ts), [deckDb.ts](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/src/db/deckDb.ts)) and shared deck URLs ([urlCodec.ts](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/src/deck/urlCodec.ts)) reference cards by `CompactCard.id` (`raw.id` from `oracle-cards`).
>
> When applying paper overrides in [normalizeCard](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/scripts/lib/card-normalizer.ts#L186):
> * **Keep `compact.id = raw.id`** (the `oracle-cards` Scryfall UUID) unchanged for existing cards so previously saved decks and `?d=...` URLs never break!
> * Only override `compact.priceUsd` (and optionally `imageNormal` / `imageSmall` / `artCrop`) from the paper printing lookup.

#### Step 4: Frontend Cache Invalidation
No frontend code changes are required for re-sync:
* Rebuilding `public/data/cards.min.json` and `public/data/manifest.json` via `npm run build:cards` updates `manifest.version` (SHA-256 hash).
* Clients running the existing [cardDb.ts](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/src/db/cardDb.ts) sync check will automatically detect the new manifest version and refresh `IndexedDB` on their next visit.

---

### Resolution Notes (Implemented)

Fixed cleanly using Option A (streaming `default-cards` backfill + `.cache/paper-overrides.json`):
1. **`isCommanderPlayable` in [card-normalizer.ts](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/scripts/lib/card-normalizer.ts):** Removed the representative-printing `raw.digital` check, restoring all **1,046** Commander-legal paper cards whose `oracle-cards` entry came from MTGO/Arena remasters (total catalog expanded from `31,597` to **`32,643`** cards / `3,759` Commanders).
2. **`paper-backfill.ts` ([paper-backfill.ts](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/scripts/lib/paper-backfill.ts)):** Automatically identifies non-paper/unpriced Commander cards (`needsPaperBackfill`), streams Scryfall's `default-cards` `.jsonl.gz` bulk dataset line-by-line (keeping memory strictly bounded to matching `oracle_id`s), resolves the **lowest tournament-legal paper `prices.usd`** (fallback `usd_foil` / `usd_etched`) and cleanest black-border physical paper artwork (`highres_scan` → non-promo → black/borderless → newest `released_at`), and caches results to `.cache/paper-overrides.json`.
3. **Compatibility & Offline Safeguards:** Strictly preserves `compact.id === raw.id` from `oracle-cards` so saved decks and shared URLs never break, and reuses `.cache/paper-overrides.json` gracefully in `--offline` builds.
4. **Verified Results:** Resolved `1,079 / 1,091` paper prices (only 7 melded back-face results, 4 unreleased preview promos, and MTGO-specific `"Name Sticker" Goblin` remain unpriced). **Price: High → Low** now accurately leads with *Timetwister* (\$6,400.00), *Mishra's Workshop* (\$3,925.00), *The Tabernacle at Pendrell Vale* (\$3,619.50), *Candelabra of Tawnos* (\$2,749.99), *Juzám Djinn* (\$2,600.00), and *Bazaar of Baghdad* (\$2,012.63) ahead of *Gaea's Cradle* (\$1,653.09).

---

### Verification Plan (Completed)
1. Update `scripts/__tests__/pipeline.test.ts` with fixture tests verifying:
   * Arena digital-only cards (`legalities.commander: 'not_legal'`) are excluded.
   * Commander-legal cards with MTGO representative printings (`digital: true`, `games: ['mtgo']`, `legalities.commander: 'legal'`) are included and receive paper backfill `priceUsd`.
   * Memorabilia printings (`set_type: 'memorabilia'`) are ignored during paper price selection.
   * `compact.id` remains identical to the `oracle-cards` input `raw.id`.
2. Re-run `npm run build:cards` and inspect top cards via `npm run inspect:cards`:
   * Verify *Timetwister*, *The Tabernacle at Pendrell Vale*, *Mishra's Workshop*, *Bazaar of Baghdad*, *Mox Diamond*, and *Underground Sea* appear in `public/data/cards.min.json` with valid paper USD prices.
3. Run `npm run typecheck && npm test && npm run build` and verify in UI that sorting **Price: High → Low** orders them above *Gaea's Cradle* as expected.

---

## BUG-002: Flaky Wall-Clock Search Latency Assertions (`< 25 ms`) on GitHub Actions CI Runners

### Summary / Symptom
GitHub Actions [`ci.yml`](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/.github/workflows/ci.yml) (`verify` job) failed with exit code `1` on push `e80f155` (`main`, 2026-11-15) during `npm test` (`vitest run`) because two theme/synergy search latency assertions exceeded `25 ms` by ~3 ms:
* [`src/__tests__/searchEngine.test.ts#L63`](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/src/__tests__/searchEngine.test.ts#L63) — `executes complex queries across all 31,597 cards in under 25ms`: `AssertionError: expected 28.29 to be less than 25` (`themeRes.executionTimeMs`).
* [`src/__tests__/searchEngine.test.ts#L286`](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/src/__tests__/searchEngine.test.ts#L286) — `integrates getCompatiblePartnerFilter and buildCommanderSynergyQuery against the real catalog`: `AssertionError: expected 27.78 to be less than 25` (`synergyRes.executionTimeMs`).

*(Note: Unrelated to Firebase / Fraud Defense App Check, and does not block Cloudflare Pages deployments, which run `npm run build` directly. The same CI run also showed a non-blocking Node 20 deprecation warning for `actions/checkout@v4` / `actions/setup-node@v4` and an informational `ubuntu-latest` → Ubuntu 26 migration notice for October 19, 2026.)*

### Root Cause Analysis

#### 1. Strict Wall-Clock Thresholds Under Shared CI CPU Contention
In [searchEngine.ts](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/src/search/searchEngine.ts#L1035), `executionTimeMs` measures raw wall-clock duration via `performance.now()`. [searchEngine.test.ts](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/src/__tests__/searchEngine.test.ts) asserts `executionTimeMs < 25` on five single-shot queries (lines `41`, `54`, `63`, `286`, `362`) and `indexBuildTimeMs < 100` (line `35`).

While these queries comfortably pass well under `25 ms` locally, `vitest run` executes all 13 test files concurrently across worker processes on GitHub's shared `ubuntu-latest` runners. CPU scheduling jitter, concurrent test files (`cardDb.test.ts`, `pipeline.test.ts`, `deployment.test.ts`, etc.), and initial V8 JIT warmup push single-run `themeQuery` / `synergy` measurements into the `27–29 ms` range.

#### 2. Expanded Real Catalog Size Since BUG-001
After resolving **BUG-001**, `public/data/cards.min.json` grew from `31,597` to **`32,643`** cards (+1,046 cards, ~3.3% larger), slightly increasing worst-case query/sort work on the real catalog without updating the fixed `25 ms` CI threshold (or the test suite description).

### Resolution Notes (Implemented)

Fixed at both the engine hot path and CI/test levels while preserving the pinned Node `22` Cloudflare Pages runtime ([deployment.test.ts](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/scripts/__tests__/deployment.test.ts#L200-L201)):
1. **`CardSearchEngine.search()` Hot-Path Optimization ([searchEngine.ts](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/src/search/searchEngine.ts)):**
   * Replaced per-match `ScoredCardMatch` and `matchedReasons` heap allocations during the full-catalog scan with reusable pre-allocated `Int32Array` / `Float64Array` scratch buffers (`matchIndices`, `cardScores`).
   * Added in-place bounded max-heap top-K selection (`selectTopCardIndicesInPlace`, for `endIdx <= 256 && totalMatches > endIdx * 4`) with exact tie-preserving index comparison, falling back to in-place `subarray.sort` for deeper pages.
   * Deferred `ScoredCardMatch` and `matchedReasons` construction (`buildMatchedReasonsForCard`) strictly to the final visible page (`<= pageSize` items), cutting steady-state `theme` / `synergy` search latencies by ~2× and eliminating off-page GC pauses.
2. **Deterministic, CI-Safe Performance Assertions ([searchEngine.test.ts](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/src/__tests__/searchEngine.test.ts), [cardDb.test.ts](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/src/__tests__/cardDb.test.ts)):**
   * Added a `beforeAll` JIT warmup pass, switched single-shot timing checks to `measureMedianExecutionMs` (median of 3 runs), added CI-aware ceilings (`25 ms` local / `50 ms` CI for queries; `100 ms` local / `200 ms` CI for index build; `100 ms` local / `250 ms` CI for `cardDb` warm cache), updated stale `31,597` descriptions to `32,000+` / `32,643`, and added an exact parity regression test comparing bounded top-K selection vs. full sorting across all 7 `sortBy` modes.
3. **Isolated Benchmark Script & CI Workflow Modernization ([package.json](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/package.json), [ci.yml](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/.github/workflows/ci.yml), [update-cards.yml](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/.github/workflows/update-cards.yml)):**
   * Added `"test:perf": "vitest run src/__tests__/searchEngine.test.ts --no-file-parallelism"` to `package.json`.
   * Upgraded `actions/checkout` (`@v6`), `actions/setup-node` (`@v6`), and `actions/cache` (`@v5`) to Node 24-native major tags to eliminate Node 20 deprecation warnings.

### Verification Plan (Completed Locally; Pending CI Run on Push)
1. Verified exact parity between bounded top-K selection and full sorting across all 7 `sortBy` modes on the `32,643`-card catalog.
2. Ran `npm run typecheck`, `npm test`, `npm run test:perf`, `npm run build`, and simulated CI execution (`CI=true`, plus CPU-constrained `taskset -c 0,1 npx vitest run --maxWorkers=4`).
3. Push to `main` to confirm the GitHub Actions [`ci.yml`](file:///home/brightonweekes/Code/mtg_deck_builder_ultra/.github/workflows/ci.yml) `verify` job exits `0` without Node 20 deprecation warnings.
