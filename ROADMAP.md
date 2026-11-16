# Ripple99 — Technical Guide & V1 Roadmap

**Build Decks, Not Piles.** This document outlines the recommended stack, core concepts to research before coding, and the step-by-step milestone roadmap to launch Ripple99 V1 on **Cloudflare Pages** (`https://ripple99.pages.dev/`) for **\$0/month**.

---

## 1. Tech Stack & Frameworks to Know

To keep hosting **100% free and globally scalable**, this app uses a **static thick-client architecture**: all searching, filtering, synergy scoring, and deck management run inside the user's browser, while Cloudflare Pages serves static files from a global edge CDN with unlimited free bandwidth.

| Layer | Recommended Tool / Framework | Why This Choice & What to Learn |
| :--- | :--- | :--- |
| **Language** | **TypeScript** | Catches bugs in complex MTG card schemas (split cards, MDFCs, color identities, mana costs) before runtime. Learn basic interfaces, union types, and array methods. |
| **Frontend UI** | **React 19 + Vite** | Industry-standard component model with huge ecosystem support, fast local dev server (`vite`), and simple static production builds (`dist/`) for Cloudflare Pages. Learn `useState`, `useEffect`, `useMemo`, and custom hooks. |
| **Styling** | **Tailwind CSS** | Rapid utility-first styling ideal for dense split-screen UIs (filter sidebar + card grid + deck drawer). |
| **Client Database** | **IndexedDB via `Dexie.js`** | `localStorage` caps out at ~5 MB and blocks the UI thread. `IndexedDB` stores hundreds of megabytes asynchronously, holding both the ~5 MB card catalog and the user's saved decks. `Dexie.js` gives `IndexedDB` a clean async/await API. |
| **Background Search** | **Browser Web Workers** | Filtering and scoring ~28,000 cards on every keystroke would freeze typing if done on the main UI thread. A Web Worker runs search and Method A scoring in a background thread at 60 FPS. |
| **URL Sharing** | **`lz-string`** (or `fflate`) | Compresses a 100-card decklist into a compact URL parameter (`?deck=...`) so users can share decks for \$0 without needing a backend database. |
| **Rolling Data Pipeline** | **Node.js (TSX script) + GitHub Actions** | Runs automatically on a nightly cron schedule (free on public/standard GitHub repos) to fetch fresh Scryfall data, tag cards with Method A, and publish a slim compressed index. |
| **Hosting** | **Cloudflare Pages** | Free tier includes unlimited static bandwidth and requests, automatic HTTPS, global CDN, and one-click deploys from GitHub. |

---

## 2. What to Research Before You Start

Before writing application code, spend a bit of time reading up on these five domain & technical topics so you avoid common MTG deckbuilder traps:

### A. Scryfall Bulk Data & API Guidelines
* **Bulk Data Endpoint (`https://api.scryfall.com/bulk-data`):** Do **not** scrape Scryfall page-by-page. Use the **`oracle-cards`** bulk file (~160 MB raw JSON, one entry per unique Oracle card—around ~30,000 cards). Download this inside your nightly GitHub Action, strip unused fields (foreign names, non-Commander legalities, flavor text, collector info), and compress it down to ~4–5 MB for browsers.
* **Image CDN (`cards.scryfall.io`):** Card images (`small`, `normal`, `art_crop`) can be loaded directly from Scryfall's image CDN via lazy `<img loading="lazy">` tags.
* **Rate Limits & User-Agent:** Scryfall requests a descriptive `User-Agent` and `Accept` header and asks automated scripts to limit API calls to 50–100ms between requests (Bulk Data downloads are hosted on Scryfall's bulk CDN and count as a single download).

### B. Magic: The Gathering Edge Cases in Card Data
* **Color Identity vs. Card Color:** Commander legality uses `color_identity` (includes mana symbols in rules text, e.g., *Kenrith, the Returned King* is White in `colors` but WUBRG in `color_identity`). Also watch out for **Extort** reminder text (does *not* count toward color identity—Scryfall handles this accurately in `color_identity`).
* **Multi-Face & Split Cards (`card_faces`):** Double-faced cards (MDFCs, Transform), Adventures, Split cards, and Fuse cards store separate `mana_cost`, `type_line`, and `oracle_text` inside a `card_faces` array, while top-level fields may be empty or combined. Your parser and UI must normalize `card_faces` cleanly!
* **Commander Legality & Special Commanders:**
  * Filter `legalities.commander === "legal"` (plus special-case un-cards/playtest exclusions already handled by Scryfall).
  * Commander eligibility checks: Legendary Creature, *"can be your commander"*, `Partner`, `Partner with [Name]`, `Choose a Background` + `Background` enchantment, `Friends forever`, `Doctor's companion`.
  * Singleton exceptions (e.g., Basic Lands, *Relentless Rats*, *Shadowborn Apostle*, *Dragon's Approach*, *Hare Apparent*, *Slime Against Humanity*).

### C. Method A: Deterministic Oracle Text Tagging
* Research how MTG phrases effects consistently (Scryfall's open-source tagger concepts or regex patterns):
  * **Mana Ramp:** `add \{[wubrgc]\}`, `search your library for a .* land card`, `create a Treasure token`, `spells you cast cost \{1\} less`.
  * **Card Advantage / Draw:** `draw a card`, `draw .* cards`, `exile the top .* cards of your library.*you may play`.
  * **Targeted Removal:** `destroy target`, `exile target`, `target creature gets -`, `return target .* to its owner's hand`, `counter target`.
  * **Board Wipes:** `destroy all`, `exile all`, `each creature gets -`, `deals \d+ damage to each creature`.
  * **Triggers / Enablers / Payoffs:** `whenever .* dies`, `whenever .* enters`, `whenever you sacrifice`, `whenever you cast a noncreature`, `whenever you gain life`, `create a .* token`, `+1/+1 counter`.

### D. Browser Performance Patterns
* **Virtualized or Paginated Grids:** Rendering 5,000 `<img>` tags at once will crash a mobile browser. Render 40–60 cards per page or use a virtual scroll window (`@tanstack/react-virtual`).
* **IndexedDB Versioning & Cache Busting:** Store a `dataVersion` timestamp alongside your card catalog in `IndexedDB` so returning users load instantly in <100ms and only re-download when a newer nightly bundle is available.

---

## 3. Step-by-Step V1 Roadmap

Build in strict vertical slices—each milestone produces something testable on your machine before moving to the next.

### Milestone 1: Card Data Pipeline & Method A Tagger
**Goal:** Turn Scryfall's raw 160 MB dump into a fast, pre-tagged ~5 MB Commander dataset.
1. Initialize a `scripts/` Node + TypeScript workspace (using `tsx` to run TypeScript scripts directly).
2. Write `scripts/build-card-index.ts`:
   * Fetch the `oracle-cards` download URL from `https://api.scryfall.com/bulk-data`.
   * Filter cards to Commander-legal entries (`legalities.commander === "legal"`).
   * Normalize `card_faces` (combining Oracle text, preserving back-face image URLs, and tagging `isCommanderEligible`).
   * Strip unneeded bloat to keep only essential fields (`id`, `name`, `manaCost`, `cmc`, `typeLine`, `oracleText`, `colors`, `colorIdentity`, `keywords`, `edhrecRank`, `priceUsd`, `imageUris`, `faces`, `tags`).
   * Run the **Method A Deterministic Rules Parser** to attach functional role tags (`ramp`, `draw`, `removal`, `wipe`, `tutor`, `recursion`, `protection`) and mechanical theme tags (`sacrifice`, `tokens`, `counters`, `graveyard`, `spellslinger`, `blink`, `enchantress`, `artifacts`, `lifegain`, `landfall`, etc.).
   * Output `public/data/cards.min.json` (plus a small `manifest.json` with build timestamp and card count).

### Milestone 2: Frontend Scaffold & Local `IndexedDB` Engine
**Goal:** Load all ~28,000 Commander cards into the browser in <100ms on repeat visits without freezing the UI.
1. Scaffold the web app in the repo root using `npm create vite@latest . -- --template react-ts` and install Tailwind CSS, `dexie`, and `lucide-react`.
2. Build a **Card Sync Service** (`src/db/cardDb.ts`):
   * Checks `manifest.json` against the version stored in `IndexedDB` (`Dexie`).
   * Downloads `cards.min.json` only on first visit or when a newer daily build exists, displaying a clean loading progress bar.
3. Build a **Search Web Worker** (`src/workers/searchWorker.ts`):
   * Loads cards into memory inside the background thread.
   * Accepts filter objects (query text, colors, color identity lock, CMC rules, types/subtypes, tags, max price, sort order) and returns matching card IDs + Method A theme relevance scores in <25ms.

### Milestone 3: Visual Advanced Search & Method A Theme Matcher
**Goal:** Make searching easier and smarter than Scryfall's raw text box.
1. Build the **Visual Filter Panel**:
   * **Commander Color Identity Lock** (auto-synced with the selected Commander or manually toggled W/U/B/R/G/C).
   * **Name & Oracle Text Search** (supports multi-word matching and exact quoted phrases).
   * **Mana Value (CMC) Quick Pills** (`0`, `1`, `2`, `3`, `4`, `5`, `6+` with `<=`, `=`, `>=` selector).
   * **Card Type & Subtype Selector** (Creature, Artifact, Enchantment, Instant, Sorcery, Land, Planeswalker + tribal subtype search).
   * **Functional Role Pills** (Ramp, Draw, Removal, Board Wipe, Tutor, Recursion, Protection).
   * **Method A Theme Matcher Box:** User types or clicks a theme (e.g., *"aristocrats sacrifice tokens"* or *"enchantress lifegain"*); Method A parses the keywords/mechanics, scores cards by matching mechanical tags + Commander synergy, and displays *why* each card matched (e.g., `Matches: Sacrifice Outlet • Payoff`).
   * **Price Cap & Sort** (EDHREC Rank, Synergy Score, CMC, Price Low→High, Name).
2. Build the **Paginated / Virtualized Card Grid & Detail Modal**:
   * Hover/click card previews, flip button for double-faced cards, and a one-click `+ Add to Deck` / `Set as Commander` button.

### Milestone 4: Commander Deck Workspace & Local Persistence
**Goal:** Complete the core deckbuilder experience cleanly and reliably.
1. **Commander Slot:** Supports 1 Commander or legal Partner / Background pairs; automatically enforces Color Identity across the deck and search filters.
2. **99-Card Singleton Workspace:**
   * Live card counter (`X / 100`), singleton violation guard (while allowing Basic Lands & legal multi-copy cards), and sideboard/maybeboard tray.
   * Group cards by **Card Type** or **Functional Role** (Commander, Lands, Ramp, Draw, Removal, Wipes, Theme/Other).
   * Live **Mana Curve Bar Chart** and **Color Pip vs. Land Production** summary.
3. **Local Persistence & Sharing:**
   * Multi-deck manager saved automatically in `IndexedDB` (create, duplicate, delete, rename decks).
   * **Import / Export** standard text lists (`1 Sol Ring`) compatible with Moxfield/Archidekt/MTGO.
   * **Shareable Compressed URL** using `lz-string` (`?d=...`) so anyone can share a deck link instantly with zero server database.

### Milestone 5: Free Automation & Global Deployment on Cloudflare Pages
**Goal:** Ship publicly to the world at \$0/month with rolling daily card updates.
1. Push repository to GitHub.
2. Create `.github/workflows/update-cards.yml` to run Milestone 1's `build-card-index.ts` script nightly at 04:00 UTC, committing updates to `public/data/` when Scryfall releases new cards or legality updates.
3. Connect the GitHub repository to **Cloudflare Pages** (`npm run build`, output directory `dist/`, deployed at `https://ripple99.pages.dev/`):
   * Automatic global edge deployment on every push or nightly card update.
   * Cloudflare automatically applies Brotli compression when serving `cards.min.json`, shrinking the network transfer to ~4–5 MB.
   * Zero servers, unlimited bandwidth, \$0/month.
