# Cloud Sync & Friend Sharing Setup Guide (100% Free Firebase Spark Tier)

MTG Commander Deck Builder Ultra is **local-first by default**. If you do not configure any cloud environment variables, the app runs entirely in your browser using `IndexedDB` (`Dexie`) with zero network calls outside static Scryfall artwork (`cards.scryfall.io`).

When you want **multi-device deck sync**, **binders/wishlists/trade lists**, **short cloud share links (`?deck=...`)**, and **friend deck browsing**, you can connect your own **free Firebase Spark project** in ~10 minutes — **no credit card required**.

---

## Table of Contents

1. [Create a Free Firebase Spark Project](#1-create-a-free-firebase-spark-project)
2. [Register Your Web App & Copy Firebase Config](#2-register-your-web-app--copy-firebase-config)
3. [Enable Authentication (Email/Password + Google Sign-In)](#3-enable-authentication-emailpassword--google-sign-in)
4. [Add Authorized Domains (Cloudflare Pages & Custom Domains)](#4-add-authorized-domains-cloudflare-pages--custom-domains)
5. [Create Cloud Firestore Database](#5-create-cloud-firestore-database)
6. [Deploy Security Rules (`firestore.rules`) & Indexes (`firestore.indexes.json`)](#6-deploy-security-rules-firestorerules--indexes-firestoreindexesjson)
7. [Configure Environment Variables (Local & Cloudflare Pages)](#7-configure-environment-variables-local--cloudflare-pages)
8. [(Optional) Enable Firebase App Check](#8-optional-enable-firebase-app-check)
9. [Free-Tier Quotas & Security Guarantees](#9-free-tier-quotas--security-guarantees)

---

## 1. Create a Free Firebase Spark Project

1. Go to the [Firebase Console](https://console.firebase.google.com/) and sign in with a Google account.
2. Click **Create a project** (or **Add project**).
3. Enter a project name (for example, `mtg-deck-builder-cloud`) and click **Continue**.
4. You can **disable Google Analytics** (recommended to keep setup minimal and privacy-focused), then click **Create project**.
5. Confirm your project is on the **Spark plan ($0/month)** in the bottom-left billing badge — **never upgrade to Blaze unless you want paid limits; no credit card is needed for Spark**.

---

## 2. Register Your Web App & Copy Firebase Config

1. On your Firebase Project Overview page, click the **Web (`</>`)** icon to register a web app.
2. Give it a nickname (e.g., `commander-builder-web`). Leave **Firebase Hosting** unchecked (you are hosting on Cloudflare Pages).
3. Click **Register app**.
4. Firebase displays a `firebaseConfig` snippet containing these 4 fields you need:
   - `apiKey` → `VITE_FIREBASE_API_KEY`
   - `authDomain` → `VITE_FIREBASE_AUTH_DOMAIN`
   - `projectId` → `VITE_FIREBASE_PROJECT_ID`
   - `appId` → `VITE_FIREBASE_APP_ID`

> **Note:** These four `VITE_FIREBASE_*` keys are public client-side identifiers, not private secrets. Data protection is enforced server-side by [`firestore.rules`](./firestore.rules) and Firebase Auth.

---

## 3. Enable Authentication (Email/Password + Google Sign-In)

1. In the Firebase Console left sidebar, open **Build → Authentication** and click **Get started**.
2. Under the **Sign-in method** tab:
   - Click **Email/Password**, toggle **Enable** on (leave "Email link (passwordless)" off unless you want it), and click **Save**.
   - Click **Add new provider → Google**, toggle **Enable** on, choose a **Project support email**, and click **Save**.

> **Email Verification Required:** `firestore.rules` strictly requires `email_verified == true` for all account writes, profile lookups, friend connections, and private/friend deck reads. Google Sign-In verifies emails automatically; Email/Password sign-ups receive a verification email before cloud sync unlocks.

### 3.3 Enable Email Enumeration Protection & Password Policy

1. Open **Build → Authentication → Settings → User actions** in the Firebase Console and confirm **Email enumeration protection** is **Enabled** (recommended so sign-in/reset endpoints never reveal whether an email address is registered).
2. Open **Build → Authentication → Settings → Password policy**, enable policy enforcement, and configure server-side strength rules matching the app:
   - **Minimum length:** `8` characters (maximum `128`)
   - **Require character types:** uppercase, lowercase, and numeric or non-alphanumeric characters
   - Enable enforcement on **Sign-up and password updates**.

---

## 4. Add Authorized Domains (Cloudflare Pages & Custom Domains)

Firebase Auth rejects OAuth popups/redirects from domains that are not explicitly listed.

1. Go to **Build → Authentication → Settings → Authorized domains**.
2. `localhost` and `<your-project-id>.firebaseapp.com` are already included for local testing.
3. Click **Add domain** and add your exact Cloudflare Pages production domain:
   - Example: `mtg-deck-builder-ultra.pages.dev`
   - If you use a custom domain (e.g., `decks.example.com`), add that too.

> **Important Cloudflare Pages Tip:** Firebase Auth **does not support wildcard domains** like `*.pages.dev`. Always add your exact `<project>.pages.dev` hostname (and any custom domain or specific branch preview URL if you test Auth on previews).

---

## 5. Create Cloud Firestore Database

1. In the Firebase Console left sidebar, open **Build → Firestore Database** and click **Create database**.
2. Choose **Standard edition** (free Spark tier) and select the Cloud Firestore location closest to you (e.g., `nam5` / `us-central` or `eur3`).
3. When prompted for security rules, choose **Start in production mode** (we will deploy the project's strict rules next), then click **Create**.

---

## 6. Deploy Security Rules (`firestore.rules`) & Indexes (`firestore.indexes.json`)

You can deploy the rules and composite indexes directly from the repository root using the Firebase CLI (recommended — deploys both rules and all 5 composite indexes cleanly):

### Option A: Firebase CLI (Recommended)

```bash
# 1. Install Firebase CLI (once)
npm install -g firebase-tools

# 2. Sign in to Google
firebase login

# 3. Link this repo folder to your Firebase project
#    (select Firestore when asked, or create .firebaserc / pass --project)
firebase use --add <your-project-id>

# 4. Deploy Firestore rules & composite indexes
firebase deploy --only firestore:rules,firestore:indexes --project <your-project-id>
```

Verify that both [`firestore.rules`](./firestore.rules) and [`firestore.indexes.json`](./firestore.indexes.json) uploaded without errors.

### Option B: Firebase Console UI (Rules Only + Manual Indexes)

If you prefer not to install the CLI:
1. Open **Firestore Database → Rules** in the Firebase Console, paste the entire contents of [`firestore.rules`](./firestore.rules), and click **Publish**.
2. Open **Firestore Database → Indexes → Composite** and create the 5 indexes listed in [`firestore.indexes.json`](./firestore.indexes.json):
   - `decks`: `ownerUid` (Ascending), `updatedAt` (Descending)
   - `decks`: `visibility` (Ascending), `updatedAt` (Descending)
   - `decks`: `sharedWithUids` (Array-contains), `updatedAt` (Descending)
   - `cardlists`: `ownerUid` (Ascending), `updatedAt` (Descending)
   - `friendships`: `users` (Array-contains), `updatedAt` (Descending)

---

## 7. Configure Environment Variables (Local & Cloudflare Pages)

### Local Development

Create a `.env.local` file in the project root (based on [`.env.example`](./.env.example)):

```bash
cp .env.example .env.local
```

Fill in the 4 required values from Step 2:

```dotenv
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef123456
```

Restart `npm run dev` so Vite picks up the new environment variables. (Keep `.env.local` on your machine only — never commit credentials to git.)

### Cloudflare Pages Deployment

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → select your Pages project.
2. Go to **Settings → Environment variables**.
3. Add each variable (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, and optionally `VITE_FIREBASE_APP_CHECK_SITE_KEY`) under **Production** (and **Preview** if desired).
4. **Trigger a new deployment** (Vite embeds `VITE_*` variables at build time, so existing builds do not pick up newly added variables until redeployed).

> **CSP Headers Ready:** [`public/_headers`](./public/_headers) already configures a production `Content-Security-Policy` allowing Scryfall artwork (`cards.scryfall.io`), Firebase Auth/Firestore endpoints, Google OAuth popups/frames, and optional reCAPTCHA App Check while avoiding `Cross-Origin-Embedder-Policy: require-corp` so card artwork loads normally.

---

## 8. (Optional) Enable Firebase App Check

To add extra protection against automated abuse or script scraping against your Spark quota:

1. Create a free **reCAPTCHA v3** site key in the [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin) for your `*.pages.dev` / custom domain and `localhost`.
2. In Firebase Console → **Build → App Check**, register your web app with **reCAPTCHA v3** and paste the secret key.
3. Add the public reCAPTCHA site key to `VITE_FIREBASE_APP_CHECK_SITE_KEY` in `.env.local` and Cloudflare Pages environment variables.
4. Once verified in App Check metrics, you can optionally toggle **Enforce** for Cloud Firestore and Authentication.

---

## 9. Free-Tier Quotas & Security Guarantees

### Firebase Spark Plan Daily Free Limits

| Resource | Free Spark Allowance | Typical Single-User Usage |
| :--- | :--- | :--- |
| Firestore Reads | **50,000 / day** | ~5–50 / session |
| Firestore Writes | **20,000 / day** | ~1–20 / session |
| Firestore Deletes | **20,000 / day** | ~0–5 / session |
| Firestore Storage | **1 GiB** | ~2–5 KB per deck |
| Firestore Network Egress | **10 GiB / month** | A few KB per sync |
| Firebase Authentication | **Free** (Email/Pass & Google) | Unlimited personal use |

### Why This App Stays Safely Within Free Limits

1. **Zero Catalog Reads in Firestore:** The 32,643-card Scryfall index lives statically on Cloudflare Pages (`/data/cards.min.json`) and your browser's `IndexedDB`, costing **0 Firestore reads**.
2. **Compact Oracle-ID Payloads:** Cloud decks store canonical `oracleId -> quantity` maps (~2–5 KB per 100-card Commander deck) rather than full card objects.
3. **Incremental Delta Sync:** Sync queries pull only documents with `updatedAt > lastSyncTimestamp`.
4. **Single-Doc Friend Catalogs:** Browsing a friend's shared decks reads one summary document (`/friendCatalogs/{uid}`) instead of scanning every deck in Firestore.

### Built-In Security Guarantees (`firestore.rules`)

- **Verified Accounts Required:** Unverified accounts cannot read or write profiles, handles, friendships, friend catalogs, or private/friend decks (`request.auth.token.email_verified == true`).
- **Zero Email Leakage:** `/profiles/{uid}` only stores public handle/display metadata and **strictly rejects any `email` field** at the database rules level.
- **Immutable Handle Claims & Reserved Names:** Handles (`/handles/{handleLower}`) enforce lowercase uniqueness (`^[a-z0-9_-]{3,24}$`), block reserved names (`admin`, `system`, `support`, `moderator`, `wizards`, `official`), and cannot be hijacked or enumerated via `list`.
- **Mutual Friend Verification:** Friend-only decks and `/friendCatalogs/{uid}` verify an `accepted` friendship document at deterministic ID `pairId(uidA, uidB)` before allowing access, and only the *recipient* of a pending request can transition `pending -> accepted`.
- **Schema & Size Guardrails:** Every write validates field whitelists, visibility enums (`private`, `friends`, `link`, `public`), bounded array/map counts, and UTF-8 string byte caps, with a bottom catch-all `allow read, write: if false;` rule denying all unmapped paths.
- **Recommended Production Bot & Quota Protection:** For public or high-traffic deployments, configure and **Enforce** **Firebase App Check (reCAPTCHA v3)** on Cloud Firestore and Firebase Authentication (see Section 8) so automated scripts cannot drain your Spark daily read/write quotas.
