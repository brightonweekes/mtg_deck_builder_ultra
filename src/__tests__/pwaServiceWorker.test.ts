import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  collectLoadedShellUrls,
  isAppShellUrl,
  registerOfflineServiceWorker,
} from '../pwa/registerSw.js';

describe('Offline App-Shell Service Worker helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('includes a valid public/sw.js with /data/ bypass and CACHE_SHELL_URLS handler', () => {
    const swPath = path.resolve(process.cwd(), 'public', 'sw.js');
    expect(existsSync(swPath)).toBe(true);
    const swSource = readFileSync(swPath, 'utf8');
    expect(swSource).toContain("const SHELL_CACHE_NAME = 'ripple99-shell-v1'");
    expect(swSource).toContain("path.startsWith('/data/')");
    expect(swSource).toContain("data.type !== 'CACHE_SHELL_URLS'");
    expect(swSource).toContain("request.mode === 'navigate'");
  });

  it('filters app-shell URLs strictly to same-origin static shell routes', () => {
    const origin = 'https://ripple99.pages.dev';
    expect(isAppShellUrl('/', origin)).toBe('https://ripple99.pages.dev/');
    expect(isAppShellUrl('/assets/index-123.js', origin)).toBe(
      'https://ripple99.pages.dev/assets/index-123.js',
    );
    expect(isAppShellUrl('/favicon.svg', origin)).toBe('https://ripple99.pages.dev/favicon.svg');

    expect(isAppShellUrl('/data/cards.min.json', origin)).toBeNull();
    expect(isAppShellUrl('/data/manifest.json', origin)).toBeNull();
    expect(isAppShellUrl('/api/decks', origin)).toBeNull();
    expect(isAppShellUrl('/__/auth/handler', origin)).toBeNull();
    expect(isAppShellUrl('/cdn-cgi/trace', origin)).toBeNull();
    expect(isAppShellUrl('/sw.js', origin)).toBeNull();
    expect(isAppShellUrl('https://cards.scryfall.io/normal/front/sol.jpg', origin)).toBeNull();
    expect(isAppShellUrl('https://firestore.googleapis.com/v1/projects', origin)).toBeNull();
  });

  it('collects deduplicated shell URLs from DOM tags and resource performance entries', () => {
    const makeEl = (attr: 'src' | 'href', value: string) => ({
      getAttribute: (name: string) => (name === attr ? value : null),
    });

    const mockDoc = {
      querySelectorAll: (selector: string) => {
        if (selector === 'script[src]') {
          return [
            makeEl('src', '/assets/index-abc.js'),
            makeEl('src', 'https://static.cloudflareinsights.com/beacon.min.js'),
          ] as unknown as NodeListOf<Element>;
        }
        return [
          makeEl('href', '/assets/index-abc.css'),
          makeEl('href', '/favicon.svg'),
        ] as unknown as NodeListOf<Element>;
      },
    };

    const mockPerf = {
      getEntriesByType: () =>
        [
          { name: 'https://example.test/assets/searchWorker-xyz.js' },
          { name: 'https://example.test/data/manifest.json' },
          { name: 'https://example.test/assets/index-abc.js' },
          { name: 'https://cards.scryfall.io/small/front/a.jpg' },
        ] as unknown as PerformanceEntryList,
    };

    const collected = collectLoadedShellUrls(mockDoc, mockPerf, 'https://example.test');
    expect(collected).toEqual([
      'https://example.test/',
      'https://example.test/assets/index-abc.js',
      'https://example.test/assets/index-abc.css',
      'https://example.test/favicon.svg',
      'https://example.test/assets/searchWorker-xyz.js',
    ]);
  });

  it('registers /sw.js safely, posts shell URLs when forced, and ignores errors', async () => {
    // Skipped cleanly in SSR / worker / non-prod environments unless window + force: true
    expect(await registerOfflineServiceWorker()).toBeNull();
    expect(await registerOfflineServiceWorker({ force: true })).toBeNull();

    const postMessageMock = vi.fn();
    const fakeReg = {
      active: { postMessage: postMessageMock } as unknown as ServiceWorker,
    } as unknown as ServiceWorkerRegistration;
    const registerMock = vi.fn(async () => fakeReg);

    vi.stubGlobal('window', {
      location: { origin: 'https://ripple99.pages.dev' },
    });
    const originalSw = Object.getOwnPropertyDescriptor(globalThis.navigator, 'serviceWorker');
    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: registerMock,
        ready: Promise.resolve(fakeReg),
      },
    });

    try {
      expect(await registerOfflineServiceWorker()).toBeNull();

      const reg = await registerOfflineServiceWorker({ force: true });
      expect(reg).toBe(fakeReg);
      expect(registerMock).toHaveBeenCalledWith('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });
      expect(postMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CACHE_SHELL_URLS',
          urls: expect.arrayContaining(['https://ripple99.pages.dev/']),
        }),
      );

      registerMock.mockRejectedValueOnce(new Error('SW blocked'));
      expect(await registerOfflineServiceWorker({ force: true })).toBeNull();
    } finally {
      vi.unstubAllGlobals();
      if (originalSw) {
        Object.defineProperty(globalThis.navigator, 'serviceWorker', originalSw);
      } else {
        delete (globalThis.navigator as unknown as Record<string, unknown>).serviceWorker;
      }
    }
  });
});
