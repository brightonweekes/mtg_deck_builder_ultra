import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import './index.css';

const CF_BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';

function injectCloudflareAnalytics(): void {
  if (typeof document === 'undefined') {
    return;
  }

  const rawToken =
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.VITE_CF_ANALYTICS_TOKEN
      : undefined;
  const token = typeof rawToken === 'string' ? rawToken.trim() : '';
  if (!token) {
    return;
  }

  if (
    document.querySelector(
      `script[data-ripple99-cf-analytics="true"], script[src="${CF_BEACON_SRC}"]`,
    )
  ) {
    return;
  }

  const script = document.createElement('script');
  script.defer = true;
  script.src = CF_BEACON_SRC;
  script.setAttribute('data-cf-beacon', JSON.stringify({ token }));
  script.setAttribute('data-ripple99-cf-analytics', 'true');
  (document.head ?? document.body)?.appendChild(script);
}

injectCloudflareAnalytics();

if (typeof window !== 'undefined') {
  const scheduleOfflineSw = () => {
    void import('./pwa/registerSw.js').then(({ registerOfflineServiceWorker }) => {
      void registerOfflineServiceWorker();
    });
  };
  if (typeof document !== 'undefined' && document.readyState === 'complete') {
    scheduleOfflineSw();
  } else {
    window.addEventListener('load', scheduleOfflineSw, { once: true });
  }
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
