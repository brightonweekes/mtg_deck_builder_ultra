export interface RegisterServiceWorkerOptions {
  force?: boolean;
  swUrl?: string;
}

const EXCLUDED_PATH_PREFIXES = ['/data/', '/api/', '/__/', '/cdn-cgi/'];

/**
 * Checks whether a resolved same-origin URL belongs to the offline app shell
 * rather than dynamic API endpoints or the catalog JSON managed by IndexedDB.
 */
export function isAppShellUrl(rawUrl: string, origin: string): string | null {
  try {
    const resolved = new URL(rawUrl, origin);
    if (resolved.origin !== origin) return null;
    if (resolved.pathname === '/sw.js') return null;
    for (const prefix of EXCLUDED_PATH_PREFIXES) {
      if (resolved.pathname.startsWith(prefix)) return null;
    }
    return resolved.href;
  } catch {
    return null;
  }
}

/**
 * Collects loaded same-origin shell URLs (HTML root, scripts, styles, icons, worker assets)
 * so the service worker can cache them immediately after initial page load.
 */
export function collectLoadedShellUrls(
  doc: Pick<Document, 'querySelectorAll'> | undefined = typeof document !== 'undefined'
    ? document
    : undefined,
  perf: Pick<Performance, 'getEntriesByType'> | undefined = typeof performance !== 'undefined'
    ? performance
    : undefined,
  origin: string | undefined = typeof window !== 'undefined' ? window.location.origin : undefined,
): string[] {
  if (!origin) return [];

  const urls = new Set<string>();
  const rootUrl = isAppShellUrl('/', origin);
  if (rootUrl) urls.add(rootUrl);

  const addCandidate = (raw: string | null | undefined) => {
    if (!raw) return;
    const normalized = isAppShellUrl(raw, origin);
    if (normalized) urls.add(normalized);
  };

  if (doc) {
    const scripts = doc.querySelectorAll('script[src]');
    for (const el of scripts) {
      addCandidate(el.getAttribute('src'));
    }

    const links = doc.querySelectorAll(
      'link[rel="stylesheet"][href], link[rel="modulepreload"][href], link[rel="icon"][href]',
    );
    for (const el of links) {
      addCandidate(el.getAttribute('href'));
    }
  }

  if (perf && typeof perf.getEntriesByType === 'function') {
    const resources = perf.getEntriesByType('resource');
    for (const entry of resources) {
      addCandidate(entry.name);
    }
  }

  return Array.from(urls);
}

/**
 * Registers `/sw.js` in production builds for offline app-shell loading and
 * warms the cache with currently loaded build assets once ready.
 */
export async function registerOfflineServiceWorker(
  options: RegisterServiceWorkerOptions = {},
): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return null;
  }
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker) {
    return null;
  }
  const isProd = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.PROD);
  if (!isProd && !options.force) {
    return null;
  }

  const swUrl = options.swUrl ?? '/sw.js';

  try {
    const registration = await navigator.serviceWorker.register(swUrl, {
      scope: '/',
      updateViaCache: 'none',
    });

    const warmUrls = collectLoadedShellUrls();
    const postShellUrls = (worker: ServiceWorker | null | undefined) => {
      if (!worker || warmUrls.length === 0) return;
      try {
        worker.postMessage({ type: 'CACHE_SHELL_URLS', urls: warmUrls });
      } catch {
        // Ignore postMessage failures during worker teardown
      }
    };

    if (registration.active) {
      postShellUrls(registration.active);
    } else if (navigator.serviceWorker.ready) {
      void navigator.serviceWorker.ready
        .then((readyReg) => postShellUrls(readyReg.active))
        .catch(() => {});
    }

    return registration;
  } catch {
    return null;
  }
}
