# Future Ideas & Phase 2+ Roadmap

This document tracks features, AI/recommendation upgrades, and cloud storage architectures intentionally deferred past V1 so the initial build stays lean, fast, and \$0 to host.

---

## 1. AI & Theme Recommendation Upgrades (Building on V1's Method A)

V1 starts with **Method A (Deterministic Mechanical Synergy & Rules Parser)**—parsing Magic's formal Oracle text into structured roles, triggers, enablers, and payoffs at \$0 cost. The following methods extend Method A in later phases:

### Method B: Local Semantic Embeddings (`Transformers.js` + Vector Search)
* **How it works:** The nightly GitHub Action pre-computes compact vector embeddings for every card's Oracle text and mechanical summary. In the browser, a lightweight quantized embedding model (such as `all-MiniLM-L6-v2`, ~22 MB via WebAssembly/WebGPU) turns a user's natural-language theme prompt into a vector in ~30ms and ranks the closest Commander-legal cards by semantic similarity, combined with Method A's mechanical tags.
* **Pros:** Understands fuzzy "vibes", archetypes, and player slang (e.g., *"pillowfort"*, *"group hug"*, *"cards that reward opponents for attacking each other"*) without requiring exact card wording. Runs 100% client-side for \$0, works on mobile and desktop, and never hallucinates fake cards.
* **Cons:** Requires downloading ~15–25 MB of quantized model weights + vector data into `IndexedDB` when the user enables Semantic Theme Search. Pure embeddings can confuse opposites (e.g., *"destroy all artifacts"* vs. *"artifacts you control have indestructible"*), so it must stay paired with Method A's rules tags.

### Method C: In-Browser Conversational LLM via WebGPU (`WebLLM` + Local RAG)
* **How it works:** Runs an actual quantized 1B–3B parameter language model (e.g., `Llama-3.2-1B` or `Qwen-2.5-1.5B`) directly on the user's GPU inside supported browsers via WebGPU. To avoid hallucinating fake cards or illegal color identities, it uses **Local RAG (Retrieval-Augmented Generation)**: Method A and Method B retrieve the top 30–40 legal cards from the local database first, inject their exact Oracle text into a prompt, and let the local LLM explain synergies and answer conversational follow-ups.
* **Pros:** True ChatGPT-style back-and-forth conversation with zero server cost.
* **Cons:** Heavy first-time download (600 MB–1.2 GB of model weights cached in the browser) and requires modern desktop/laptop WebGPU hardware—unsuitable for older devices and most phones. Best offered as an optional experimental toggle for desktop power users.

### Method D: Bring-Your-Own Free API Key (BYOK — Google Gemini Free Tier)
* **How it works:** An optional settings panel allows power users to paste their own free Google AI Studio Gemini API key (`gemini-2.5-flash` free tier). The key is stored strictly in the user's browser `localStorage` and makes requests straight from their browser to Google's API, grounded by local database search results (Method A/B) to keep suggestions 100% Commander-legal.
* **Pros:** Frontier-level LLM reasoning, 0 MB model download, works on mobile phones, and costs the host \$0.
* **Cons:** Requires user setup to obtain a free API key, so it complements rather than replaces built-in recommendations.

---

## 2. Cloud Accounts & Cross-Device Deck Synchronization (Phase 2 Storage)

V1 uses **Local-First storage** (`IndexedDB` auto-save + compressed shareable deck URLs + `.txt` import/export). When adding user accounts and cloud saving later, a compressed Commander deck is only ~2–5 KB (or ~200 bytes binary-encoded), enabling two \$0-friendly architectures:

### Option 1: Traditional Cloud Auth + Database (Firebase or Supabase Free Tier)
* **How it works:** Users sign up with Email, Google, or Discord. Local `IndexedDB` decks sync automatically to a cloud table/collection so users can access and edit their decks on any device, and optionally publish public deck pages.
* **Free Tier Reference:**
  * **Firebase Auth + Cloud Firestore (Spark Plan):** 1 GB storage (~200,000+ decks), 50k reads/day, 20k writes/day, never pauses from inactivity.
  * **Supabase Auth + Postgres:** 50,000 monthly active users, 500 MB database (~100,000+ decks), relational SQL for future community deck browsing/search (requires a light scheduled ping to prevent 7-day inactivity pausing on free tier).
* **Trade-offs:** Enables public community profiles and shared deck browsing, though very high viral scale could eventually approach free database ceilings.

### Option 2: Zero-Backend "Bring Your Own Cloud" (Google Drive `appDataFolder` or GitHub Gist OAuth)
* **How it works:** Users authenticate via OAuth (Google or GitHub), and the app saves their decks inside a hidden, app-scoped folder in *their own* Google Drive (`appDataFolder`) or private GitHub Gists.
* **Free Tier Reference:** Infinite user scalability at \$0 host cost because each user's decks consume only a few kilobytes of their own cloud quota.
* **Trade-offs:** Ties login to Google/GitHub providers and keeps decks private to the user (public sharing continues to rely on compressed deck URLs).

---

## 3. High-Impact Commander Features (Phase 2 & 3 Differentiators)

### Trigger ↔ Enabler ↔ Payoff Synergy Engine
* **Concept:** Goes beyond generic popularity lists (like EDHREC) by analyzing *cause-and-effect* mechanics between your Commander and the 99.
* **How it works:** Parses your Commander's Oracle text into **Triggers** (e.g., *"Whenever you sacrifice a permanent"*), **Costs/Requirements**, and **Outputs** (e.g., *"draw a card"*, *"put a +1/+1 counter"*). It then surfaces dedicated tabs for:
  * **Enablers:** Cards that reliably trigger your Commander (e.g., Treasure makers, free sacrifice outlets, recursive bodies).
  * **Payoffs:** Cards that multiply or reward your Commander's output (e.g., +1/+1 counter doublers, draw-trigger pings).
  * **"Hidden Gems" Toggle:** Surfaces cards with high mechanical synergy score, low EDHREC usage/rank, and budget-friendly USD prices.

### 1,000-Hand Monte Carlo Opening Hand & Mulligan Simulator
* **Concept:** Replaces guesswork about land counts and ramp curves with instant statistical testing inside the browser.
* **How it works:** Runs 1,000 simulated shuffles and 7-card opening hands (+ London Mulligan simulation and early-turn draws) in ~50ms via a Web Worker. Reports actionable odds such as:
  * Probability of having 2–4 lands + early play/ramp in your opening hand.
  * Probability of casting your Commander on curve (e.g., Turn 3 or Turn 4).
  * Hypergeometric color-pip fixing odds (identifying which color causes the most color screw).

### Interactive Commander Blueprint Coach ("Guided Mode")
* **Concept:** A live structural guide for deckbuilding ratios so newer or stuck builders know what their 99 is missing.
* **How it works:** Tracks healthy Commander benchmarks (e.g., ~37 Lands, ~10 Ramp, ~10 Card Advantage, ~10 Targeted Interaction, ~3 Board Wipes, ~29 Core Synergy) while properly crediting multi-role cards (e.g., MDFC lands, modal spells, or creatures that both ramp and fit the tribe).

### Commander-Tempo Curve Audit
* **Concept:** Flags subtle mana-curve collisions around the Commander's mana value.
* **How it works:** Evaluates your ramp package against your Commander's MV (e.g., warning when a 3-mana Commander is paired with 3-mana mana rocks that compete for Turn 3, suggesting 1-mana or 2-mana ramp instead).

### Commander Bracket (1–4) Evaluator & Budget Swap Finder
* **Concept:** Helps players tune decks for their playgroup's power level and wallet.
* **How it works:** Scans the 100-card list for fast mana, tutors, known 2-card combos, and official Commander "Game Changers" to estimate its Bracket (1–4), and provides a one-click **Budget Swap Finder** that uses Method A's mechanical tags to suggest <\$1 alternatives to expensive staples.

### Physical Card Scanner (In-Browser Camera OCR & Visual Matching)
* **Concept:** Point a phone camera or webcam at physical Magic cards (stacks, binders, or precon upgrades) to scan them straight into a deck, maybeboard, or collection without manually typing card names.
* **How it works:** Runs 100% client-side for \$0 hosting cost using the browser's `getUserMedia` camera API paired with two complementary recognition modes:
  * **Title-Bar OCR + Local Fuzzy Match:** Crops the card-frame title region and runs lightweight WebAssembly OCR (`Tesseract.js`) in a Web Worker, then fuzzy-matches the detected name (plus optional mana-cost/set cues) against the ~31,000+ cards already cached in `IndexedDB`.
  * **Perceptual Artwork / Frame Hashing:** Matches card art/border hashes for rapid recognition of non-English printings, glare-heavy foils, or textless promos, with an optional BYOK Gemini Vision fallback (via Method D) for scanning multi-card tabletop spreads at once.
  * **Scan Workflows:** Supports continuous rapid-fire scanning (with audio/haptic confirmation) to digitize a 100-card paper deck, track an owned-cards binder ("Build with cards I own"), or instantly check Commander legality, USD price, and Commander synergy on the spot.

### Interactive Deck Playtester & 4-Player Commander Game Simulator
* **Concept:** Go beyond static opening-hand odds by letting builders interactively goldfish their 100-card list or simulate full 4-player Commander pods directly in the browser before buying paper cards.
* **How it works:** Runs locally at \$0 server cost using the cached card database and Method A role metadata across three progressive modes:
  * **Solo Goldfish Virtual Tabletop:** A fast, responsive playmat supporting Command Zone & automatic commander tax tracking, London mulligans, tap/untap, `+1/+1`/loyalty/custom counters, dynamic token spawning, library search/scry/mill, graveyard/exile zones, and life/commander-damage counters.
  * **4-Player Pod Simulator with Heuristic AI Opponents:** Pit your brew against up to three other saved `IndexedDB` decks or curated Commander archetype benchmarks. A Web Worker runs lightweight heuristic bots powered by Method A's `ramp`, `draw`, `removal`, `wipe`, and `protection` tags—sequencing land drops, casting mana rocks, holding interaction for high-threat commanders, and firing board wipes when behind on board.
  * **Automated Pod Stress-Testing & Telemetry:** Fast-forward 50–100 headless multi-turn games in seconds to benchmark average Commander cast turn, recovery speed after removal/wipes, mana utilization per turn, and pacing against different Bracket 1–4 pods.
  * **Zero-Server WebRTC Playtest Rooms (Optional):** Browser-to-browser WebRTC sync so playgroups can test new decklists together online with shared tabletop state and zero game-server hosting cost.

### Running Owned-Card Collection Database ("My Binder")
* **Concept:** Maintain a persistent, live inventory of every Magic card the user physically owns (quantities, optional foil/condition/binder tags, and current valuation) so deckbuilding is grounded in what is already in their collection.
* **How it works:** Stores a `collection` table inside local `IndexedDB` (with optional Phase 2 cloud/Drive sync) that integrates directly across the entire deckbuilder at \$0 server cost:
  * **Multi-Source Ingestion & Live Updates:** Add or adjust owned counts manually from search results, bulk-import CSV/text inventories (ManaBox, Moxfield, Archidekt, Dragon Shield), auto-merge precons, or stream cards directly in via the **Physical Card Scanner**.
  * **Cross-Deck Copy Allocation:** Tracks how many copies of a card you own vs. how many are currently slotted into built decks (e.g., *Owned: 2 | In Use: 2 (Korvold, Sythis) | Available: 0*), flagging conflicts or helping users move staples between decks.
  * **"Build From What I Own" Search & Synergy Mode:** Toggle search filters and Method A synergy recommendations to show *Owned Only* or *Owned + Missing Under \$X*, plus an instant **"What Commanders Can I Build Today?"** analyzer ranking eligible Commanders by how much of their core synergy package you already own.
  * **Cost-to-Complete & Buy List Export:** Computes exact missing cards and estimated USD cost to finish any brew (excluding owned copies) with one-click copy/export to TCGplayer/Card Kingdom mass-entry lists.

### Playgroup Friending & Card Trading Hub
* **Concept:** Connect with your local Commander playgroup to share brews, spot missing staples sitting in a friend's trade binder, and balance paper trades right at the table.
* **How it works:** Builds directly on top of the **My Binder** collection database and Phase 2 cloud accounts (with an offline-friendly compressed URL / QR snapshot mode via `lz-string` for zero-server local meetups):
  * **Friends List & Pod Profiles:** Add friends via invite link or friend code to browse their shared Commander decks, compare Bracket (1–4) power levels, or load their lists straight into the **4-Player Pod Simulator** and **WebRTC Playtest Rooms**.
  * **Trade Binder & Wishlist Auto-Matcher:** Flag spare cards in your collection as *"For Trade"* (automatically excluding cards allocated to your active decks) and match your deck wishlists/missing cards against friends' trade binders—instantly surfacing *"Sarah has 3 cards your Korvold deck needs; you have 2 cards her Sythis deck needs."*
  * **Live Fair-Value Trade Table:** Interactive two-column trade builder that sums live Scryfall `priceUsd` values on both sides, highlights value gaps, and logs completed trades to automatically update both players' **My Binder** inventories and loan/borrow reminders.
