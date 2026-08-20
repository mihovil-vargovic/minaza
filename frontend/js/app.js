(function () {
  const CONFIG = window.STORAGE_BASE_CONFIG || {};
  const BACKEND_URL = CONFIG.backendUrl;
  const CODE_STORAGE_KEY = 'storageBaseAccessCode';

  // JSONP: a direct fetch() to an Apps Script URL from a page hosted
  // elsewhere is unreliable due to Apps Script's CORS behavior — a
  // <script> tag load isn't subject to that. See ../backend/Code.gs and
  // ../_prd/technical-spec-backend_and_scanning.md §3.4/§6.2.
  let jsonpCounter = 0;
  function api(action, params) {
    return new Promise((resolve, reject) => {
      if (!BACKEND_URL || BACKEND_URL.indexOf('PASTE_YOUR') !== -1) {
        reject(new Error('Backend URL not configured. Copy config.example.js to config.local.js and paste your Apps Script /exec URL in.'));
        return;
      }
      const cbName = 'cb_' + (jsonpCounter++) + '_' + Date.now();
      const qs = new URLSearchParams(Object.assign({}, params || {}, { action: action, callback: cbName }));
      const script = document.createElement('script');

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Request timed out — check the backend URL and that the deployment is live.'));
      }, 15000);

      function cleanup() {
        clearTimeout(timeout);
        delete window[cbName];
        script.remove();
      }

      window[cbName] = function (data) {
        cleanup();
        resolve(data);
      };
      script.onerror = function () {
        cleanup();
        reject(new Error('Could not reach the backend.'));
      };
      script.src = BACKEND_URL + '?' + qs.toString();
      document.body.appendChild(script);
    });
  }

  // Chrome's install-banner criteria require a registered SW with a fetch
  // handler; see sw.js for why it deliberately does no caching.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  function getStoredCode() {
    return localStorage.getItem(CODE_STORAGE_KEY) || '';
  }
  function setStoredCode(code) {
    localStorage.setItem(CODE_STORAGE_KEY, code);
  }
  function clearStoredCode() {
    localStorage.removeItem(CODE_STORAGE_KEY);
  }

  // ---- Access gate ----
  const gateEl = document.getElementById('gate');
  const appEl = document.getElementById('app');
  const gateForm = document.getElementById('gate-form');
  const gateInput = document.getElementById('gate-input');
  const gateButton = document.getElementById('gate-button');
  const gateError = document.getElementById('gate-error');
  const gateIosNote = document.getElementById('gate-ios-note');

  // iOS keeps installed-home-screen-app storage separate from Safari, so a
  // Safari-only login won't carry over — see planning5 §iOS PWA.
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  var isStandalone = window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  if (isIOS && !isStandalone) {
    gateIosNote.hidden = false;
  }

  function showGate() {
    gateEl.hidden = false;
    appEl.hidden = true;
  }
  // Later phases (Inventory/History/...) register here instead of
  // fetching on script load — scripts all evaluate before the gate/init
  // check below runs, so an immediate fetch would fire before the code
  // is known to be valid (or at all, on a fresh device).
  var appShownCallbacks = [];
  function onAppShown(fn) {
    appShownCallbacks.push(fn);
  }

  function showApp() {
    gateEl.hidden = true;
    appEl.hidden = false;
    appShownCallbacks.forEach(function (fn) {
      fn();
    });
    fireViewShown(currentView);
  }
  function showGateError(message) {
    gateError.textContent = message;
    gateError.hidden = false;
  }
  function clearGateError() {
    gateError.hidden = true;
    gateError.textContent = '';
  }

  function attemptUnlock(code) {
    if (gateButton.disabled) return; // guard against double-submit (e.g. rapid double-Enter)
    clearGateError();
    if (!code) {
      showGateError('Enter the access code.');
      return;
    }
    gateButton.disabled = true;
    gateButton.textContent = 'Checking…';
    api('check-code', { code })
      .then(function (res) {
        if (res.ok) {
          setStoredCode(code);
          showApp();
        } else {
          showGateError('Wrong code. Try again.');
        }
      })
      .catch(function (err) {
        showGateError(err.message || 'Could not reach the backend.');
      })
      .finally(function () {
        gateButton.disabled = false;
        gateButton.textContent = 'Unlock';
      });
  }

  // Native form submit (button is type="submit") handles both a button
  // tap and Enter-in-the-field in one path — also fixes a real mobile
  // keyboard bug: an <input> not wrapped in a <form> can make iOS
  // WebKit fall back to a reduced keyboard (missing shift/123 toggle)
  // in some non-Safari browsers.
  gateForm.addEventListener('submit', function (e) {
    e.preventDefault();
    attemptUnlock(gateInput.value.trim());
  });

  // Every backend call re-validates the access code server-side (see
  // Code.gs / BUILD-PLAN.md Decisions) — if a stored code ever comes
  // back invalid (e.g. rotated on the backend), fall back to the gate
  // instead of failing silently forever. Later phases call this from
  // their own API error handling.
  function handleAuthFailure(result) {
    if (result && result.ok === false && result.error === 'invalid_code') {
      clearStoredCode();
      showGate();
      return true;
    }
    return false;
  }

  // Every non-gate endpoint needs the stored code re-sent as a param
  // (see Code.gs — every action re-validates server-side). Callers use
  // this instead of api() directly so they don't each have to remember.
  function call(action, params) {
    return api(action, Object.assign({ code: getStoredCode() }, params || {}));
  }

  // Exposed for later phases (Inventory/Scan/History/Settings) to reuse
  // the same JSONP caller and stored code instead of re-implementing it.
  // Merged (not reassigned) so load order relative to other shared
  // modules (categories/units, toasts) doesn't matter.
  window.storageBase = Object.assign(window.storageBase || {}, {
    api: api,
    call: call,
    getCode: getStoredCode,
    handleAuthFailure: handleAuthFailure,
    onAppShown: onAppShown,
    onViewShown: onViewShown,
    onViewHidden: onViewHidden
  });

  // ---- Navigation ----
  // Views (Inventory/Scan/...) register here for "this view just became
  // visible" / "this view just left" — e.g. Inventory refreshes its list,
  // Scan starts/stops the camera. Kept separate from setView() itself so
  // init()'s initial bootstrap call (before the gate resolves) doesn't
  // fire data-loading side effects — see navigateTo() below.
  var currentView = 'inventory';
  var viewShownCallbacks = {};
  var viewHiddenCallbacks = {};
  function onViewShown(view, fn) {
    (viewShownCallbacks[view] = viewShownCallbacks[view] || []).push(fn);
  }
  function onViewHidden(view, fn) {
    (viewHiddenCallbacks[view] = viewHiddenCallbacks[view] || []).push(fn);
  }
  function fireViewShown(view) {
    (viewShownCallbacks[view] || []).forEach(function (fn) { fn(); });
  }
  function fireViewHidden(view) {
    (viewHiddenCallbacks[view] || []).forEach(function (fn) { fn(); });
  }

  function setView(view) {
    currentView = view;
    document.querySelectorAll('.view-panel').forEach(function (panel) {
      panel.hidden = panel.dataset.viewPanel !== view;
    });
    document.querySelectorAll('[data-view]').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
  }

  function navigateTo(view) {
    var prev = currentView;
    setView(view);
    fireViewHidden(prev);
    if (!appEl.hidden) fireViewShown(view);
  }

  document.querySelectorAll('[data-view]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      navigateTo(btn.dataset.view);
    });
  });

  // ---- Init ----
  // Exposed rather than run immediately: must fire after every module
  // script has loaded and registered its onAppShown callback, so this is
  // called from an inline <script> at the bottom of index.html, after
  // all the others.
  function init() {
    // DOM-only — no view-shown side effects yet (see setView/navigateTo
    // above); showApp() below is what fires the initial data load, once
    // we know the app is actually visible rather than sitting behind the
    // gate.
    setView('inventory');
    if (getStoredCode()) {
      showApp();
    } else {
      showGate();
    }
  }
  window.storageBase.init = init;
})();
