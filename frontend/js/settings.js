(function () {
  var storageBase = window.storageBase;

  var DEVICE_ID_KEY = 'storageBaseDeviceId';

  // Stable per-browser id, generated once and kept in localStorage —
  // this is what "a device" means here (a browser profile on a
  // physical device), same granularity as the access code itself.
  function getDeviceId() {
    var id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  }

  // Auto label, no prompt — a website can't read the device's real
  // name (e.g. "Mihovil's iPhone" from iOS Settings, deliberately not
  // exposed to the web for privacy), so this is the closest automatic
  // substitute: "<browser> on <OS>", guessed from the user-agent
  // string. Two same-model devices will look identical — that's the
  // tradeoff of automatic over asking the user to type a name.
  function getDeviceLabel() {
    var ua = navigator.userAgent;
    var os = /iPhone/.test(ua) ? 'iPhone'
      : /iPad/.test(ua) ? 'iPad'
      : /iPod/.test(ua) ? 'iPod'
      : /Android/.test(ua) ? 'Android'
      : /Mac OS X/.test(ua) ? 'Mac'
      : /Windows/.test(ua) ? 'Windows'
      : /Linux/.test(ua) ? 'Linux'
      : 'Unknown device';
    var browser = /Edg\//.test(ua) ? 'Edge'
      : /CriOS/.test(ua) ? 'Chrome'
      : /Chrome\//.test(ua) ? 'Chrome'
      : /FxiOS/.test(ua) ? 'Firefox'
      : /Firefox\//.test(ua) ? 'Firefox'
      : /Safari\//.test(ua) ? 'Safari'
      : 'Browser';
    return browser + ' on ' + os;
  }

  // Phone-shaped icon for anything that looks like a phone/tablet UA,
  // laptop-shaped otherwise — a best-guess visual only, not what the
  // list is keyed on (deviceId is; see getDeviceId above).
  var PHONE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"></rect><line x1="11" y1="18" x2="13" y2="18"></line></svg>';
  var LAPTOP_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>';
  function deviceIconHtml() {
    return /Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent) ? PHONE_ICON : LAPTOP_ICON;
  }

  function formatLastSeen(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var diffMs = Date.now() - d.getTime();
    var diffMin = Math.round(diffMs / 60000);
    if (diffMin < 2) return 'Active now';
    if (diffMin < 60) return diffMin + 'm ago';
    var diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return diffHr + 'h ago';
    var diffDay = Math.round(diffHr / 24);
    if (diffDay < 7) return diffDay + 'd ago';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // ---- Devices list (Settings' inline desktop section AND its mobile
  // pushed sub-page both render from the same data — see the shared
  // .js-devices-list class in index.html). ----
  var listEls = document.querySelectorAll('.js-devices-list');
  var emptyEls = document.querySelectorAll('.js-devices-empty');

  function buildDeviceRow(device) {
    var li = document.createElement('li');
    li.className = 'settings-device-row';
    li.innerHTML = deviceIconHtml();

    var name = document.createElement('span');
    name.textContent = device.name || 'Unknown device';
    li.appendChild(name);

    var meta = document.createElement('span');
    meta.className = 'settings-device-meta';
    meta.textContent = formatLastSeen(device.lastSeen);
    li.appendChild(meta);

    return li;
  }

  function renderDevices() {
    storageBase.call('list-devices').then(function (res) {
      if (storageBase.handleAuthFailure(res)) return;
      if (!res.ok) return;
      var devices = res.devices || [];
      listEls.forEach(function (ul) {
        ul.innerHTML = '';
        devices.forEach(function (d) {
          ul.appendChild(buildDeviceRow(d));
        });
      });
      emptyEls.forEach(function (p) {
        p.hidden = devices.length > 0;
      });
    });
  }

  storageBase.onViewShown('settings', renderDevices);
  storageBase.onViewShown('settings-devices', renderDevices);

  // Runs once per full app open (see onAppShown, app.js) — no prompt,
  // no "already registered?" check needed: touch-device upserts on the
  // backend (creates the row if it's new, just bumps lastSeen and
  // refreshes the label otherwise), so calling it unconditionally
  // every time is enough. Fire-and-forget: nothing in the UI depends
  // on this resolving.
  storageBase.onAppShown(function () {
    storageBase.call('touch-device', { deviceId: getDeviceId(), name: getDeviceLabel() }).catch(function () {});
  });
})();
