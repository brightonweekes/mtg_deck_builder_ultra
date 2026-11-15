import { getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from 'firebase/app-check';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';

interface FirebaseEnvConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId: string;
  storageBucket: string;
  appCheckSiteKey: string;
}

let cachedSignature: string | null = null;
let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;
let cachedAppCheck: AppCheck | null = null;
let appCheckAttempted = false;

function trimEnv(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readFirebaseEnvConfig(): FirebaseEnvConfig {
  const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : undefined;
  return {
    apiKey: trimEnv(env?.VITE_FIREBASE_API_KEY),
    authDomain: trimEnv(env?.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: trimEnv(env?.VITE_FIREBASE_PROJECT_ID),
    appId: trimEnv(env?.VITE_FIREBASE_APP_ID),
    messagingSenderId: trimEnv(env?.VITE_FIREBASE_MESSAGING_SENDER_ID),
    storageBucket: trimEnv(env?.VITE_FIREBASE_STORAGE_BUCKET),
    appCheckSiteKey: trimEnv(env?.VITE_FIREBASE_APP_CHECK_SITE_KEY),
  };
}

function buildConfigSignature(env: FirebaseEnvConfig): string {
  return `${env.apiKey}|${env.authDomain}|${env.projectId}|${env.appId}|${env.messagingSenderId}|${env.storageBucket}`;
}

function clearCachedInstances(): void {
  cachedSignature = null;
  cachedApp = null;
  cachedAuth = null;
  cachedDb = null;
  cachedAppCheck = null;
  appCheckAttempted = false;
}

function ensureAppCheck(app: FirebaseApp, siteKey: string): void {
  if (!siteKey || typeof window === 'undefined' || appCheckAttempted) {
    return;
  }
  appCheckAttempted = true;
  try {
    cachedAppCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    // Non-fatal: App Check cannot initialize in headless/test or duplicate-init contexts.
  }
}

/**
 * Returns `true` when all required Firebase client environment variables are configured.
 */
export function isFirebaseConfigured(): boolean {
  const env = readFirebaseEnvConfig();
  return Boolean(env.apiKey && env.authDomain && env.projectId && env.appId);
}

/**
 * Lazily initializes and returns the singleton `FirebaseApp`, or `null` when unconfigured.
 */
export function getFirebaseApp(): FirebaseApp | null {
  const env = readFirebaseEnvConfig();
  if (!env.apiKey || !env.authDomain || !env.projectId || !env.appId) {
    return null;
  }

  const signature = buildConfigSignature(env);
  if (cachedApp && cachedSignature === signature) {
    ensureAppCheck(cachedApp, env.appCheckSiteKey);
    return cachedApp;
  }

  if (cachedSignature && cachedSignature !== signature) {
    clearCachedInstances();
  }

  const options: FirebaseOptions = {
    apiKey: env.apiKey,
    authDomain: env.authDomain,
    projectId: env.projectId,
    appId: env.appId,
    ...(env.messagingSenderId ? { messagingSenderId: env.messagingSenderId } : {}),
    ...(env.storageBucket ? { storageBucket: env.storageBucket } : {}),
  };

  const existingApps = getApps();
  cachedApp = existingApps.length > 0 ? existingApps[0]! : initializeApp(options);
  cachedSignature = signature;
  ensureAppCheck(cachedApp, env.appCheckSiteKey);
  return cachedApp;
}

/**
 * Returns the lazily initialized Firebase `Auth` instance, or `null` when unconfigured.
 */
export function getFirebaseAuth(): Auth | null {
  const app = getFirebaseApp();
  if (!app) return null;

  if (!cachedAuth) {
    cachedAuth = getAuth(app);
  }
  return cachedAuth;
}

/**
 * Returns the lazily initialized `Firestore` instance configured with `ignoreUndefinedProperties: true`,
 * or `null` when Firebase is not configured.
 */
export function getFirebaseDb(): Firestore | null {
  const app = getFirebaseApp();
  if (!app) return null;

  if (!cachedDb) {
    try {
      cachedDb = initializeFirestore(app, { ignoreUndefinedProperties: true });
    } catch {
      // Fallback when Firestore was already initialized on an existing app instance (e.g., HMR).
      cachedDb = getFirestore(app);
    }
  }
  return cachedDb;
}

/**
 * Returns the initialized App Check instance if enabled in the browser, or `null`.
 */
export function getFirebaseAppCheck(): AppCheck | null {
  getFirebaseApp();
  return cachedAppCheck;
}

/**
 * Resets cached module singletons (for isolated unit testing only).
 */
export function resetFirebaseInstancesForTesting(): void {
  clearCachedInstances();
}
