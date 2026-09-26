// Loads Google Identity Services ONCE and initializes it ONCE per page load.
// Any page can register its own credential callback safely.
let scriptPromise = null;
let initialized = false;
let currentCallback = null;

function loadScript() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = () => resolve(window.google.accounts.id);
      s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

export async function initGoogleAuth(clientId, onCredential) {
  currentCallback = onCredential; // latest page wins, without re-initializing
  const g = await loadScript();
  if (!initialized) {
    g.initialize({
      client_id: clientId,
      auto_select: false,
      ux_mode: 'popup',
      callback: (resp) => { if (currentCallback) currentCallback(resp); },
    });
    initialized = true;
  }
  return g;
}

export function renderGoogleButton(container, opts = {}) {
  if (!container || !window.google?.accounts?.id) return;
  container.innerHTML = '';
  window.google.accounts.id.renderButton(container, {
    theme: 'outline',
    size: 'large',
    shape: 'rectangular',
    text: 'continue_with',
    width: 300,
    locale: 'en',
    ...opts,
  });
}