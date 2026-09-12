(function () {
  // One shared category/unit source for desktop's New Item quick-pick,
  // desktop's Inventory filter, and (later) mobile's chip row — per
  // ../_prd/planning5, these must not be maintained in three places.
  var BASE_CATEGORIES = ['Jams', 'Vegetables', 'Oil & Acid', 'Cans', 'Toilet', 'Fruit'];
  var UNITS = ['kg', 'L', 'pcs', 'jar', 'pack', 'other'];

  // Suggested categories first, then any others already in use on real
  // items, in first-seen order — so a category is always filterable
  // even before anything using it exists (per planning5).
  function categoryList(items) {
    var used = (items || [])
      .map(function (item) { return (item.category || '').trim(); })
      .filter(function (c) { return c && BASE_CATEGORIES.indexOf(c) === -1; });
    var seen = {};
    var extra = [];
    used.forEach(function (c) {
      if (!seen[c]) {
        seen[c] = true;
        extra.push(c);
      }
    });
    return BASE_CATEGORIES.concat(extra);
  }

  // Phosphor Icons' duotone set (loaded via CDN — see the <link> in
  // index.html), one glyph name per base category, plus a generic
  // fallback for any category appended from real usage that isn't in
  // this fixed set. Rendered as a font glyph (<i class="ph-duotone
  // ph-...">), not inline SVG — see .category-icon in app.css for
  // sizing/color.
  var CATEGORY_ICONS = {
    'Jams': 'jar',
    'Vegetables': 'carrot',
    'Oil & Acid': 'drop',
    'Cans': 'cylinder',
    'Toilet': 'toilet',
    'Fruit': 'basket'
  };
  var FALLBACK_ICON = 'package';
  // Distinct from FALLBACK_ICON: no category at all (empty/never set)
  // reads differently from "a real category string that just isn't in
  // the fixed set above" — per direct request.
  var NO_CATEGORY_ICON = 'flying-saucer';

  function categoryIconHtml(name) {
    var icon = !name ? NO_CATEGORY_ICON : (CATEGORY_ICONS[name] || FALLBACK_ICON);
    return '<i class="ph-duotone ph-' + icon + ' category-icon"></i>';
  }

  // One badge builder for every place a category is shown read-only
  // (Inventory table, History table, the mobile item-view modal, the
  // mobile Scan confirm/detail sheet) — same markup/class as the
  // interactive New Item picker and Search filter chips (.chip-category),
  // just a <span> instead of a <button> so it doesn't imply it's
  // clickable. One visual definition instead of five near-duplicates.
  // opts.small = the 24px table-row variant (Inventory/History table
  // cells specifically) — everywhere else stays the default 32px.
  function buildCategoryBadge(name, opts) {
    var el = document.createElement('span');
    el.className = (opts && opts.small) ? 'chip-category chip-category-sm' : 'chip-category';
    el.innerHTML = categoryIconHtml(name);
    var label = document.createElement('span');
    label.className = 'chip-category-label';
    label.textContent = name;
    el.appendChild(label);
    return el;
  }

  // Cursor-tracked (desktop) or gyroscope-tracked (touch) tilt/parallax
  // for the QR "cards" (detail panel, New Item label stage, item-view
  // modal) — call once per element; the listener stays attached across
  // re-renders since QRCode.js only replaces the element's children,
  // never the element itself.
  var TILT_MAX_DEG = 10;

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  // px/py are both -0.5..0.5 — same convention for both input sources
  // (cursor position within the element, or gyroscope tilt relative to
  // its baseline) so this one function drives the actual visual effect
  // for both.
  function applyTilt(el, px, py) {
    var rotateY = px * TILT_MAX_DEG * 2;
    var rotateX = -py * TILT_MAX_DEG * 2;
    el.style.transform = 'perspective(600px) rotateX(' + rotateX.toFixed(2) + 'deg) rotateY(' + rotateY.toFixed(2) + 'deg) scale(1.04)';
    // Shadow shifts opposite the tilt, like a light source overhead —
    // reinforces the 3D effect instead of just rotating flatly.
    el.style.boxShadow = (-px * 22).toFixed(1) + 'px ' + (-py * 22 + 6).toFixed(1) + 'px 24px rgba(0, 0, 0, 0.18)';
    // Drives the .qr-box::after holo sheen (see app.css) — same
    // coordinates as the tilt above, remapped from the -0.5..0.5 offset
    // to a 0-100% background-position so the gradient slides as the
    // card tilts. .tilt-active makes the (otherwise :hover-only) sheen
    // visible on touch, where there's no hover state at all.
    el.style.setProperty('--holo-x', ((px + 0.5) * 100).toFixed(1) + '%');
    el.style.setProperty('--holo-y', ((py + 0.5) * 100).toFixed(1) + '%');
    el.classList.add('tilt-active');
  }

  function clearTilt(el) {
    el.style.transform = '';
    el.style.boxShadow = '';
    el.style.removeProperty('--holo-x');
    el.style.removeProperty('--holo-y');
    el.classList.remove('tilt-active');
  }

  // ---- Gyroscope tilt (touch devices) ----
  // A phone has no cursor to track, but it does have a real tilt to
  // read — same visual effect, driven by DeviceOrientationEvent instead
  // of mousemove. One shared listener drives every registered element
  // (rather than one listener per element) since there's only ever one
  // physical device to read from.
  var gyroEls = [];
  var gyroBaseline = null; // { beta, gamma } — recaptured each time a tilt sheet opens, see recalibrateTilt()
  var gyroListenerAttached = false;
  var gyroPermissionRequested = false;
  var GYRO_RANGE_DEG = 24; // physical tilt (either axis) that reaches the full mouse-equivalent swing
  var GYRO_SMOOTHING = 0.25; // low-pass filter weight for each new reading — raw gyro data is a bit jittery
  var gyroSmoothedPx = 0;
  var gyroSmoothedPy = 0;

  function onDeviceOrientation(e) {
    if (e.beta === null || e.gamma === null) return;
    if (!gyroBaseline) gyroBaseline = { beta: e.beta, gamma: e.gamma };

    var rawPx = clamp((e.gamma - gyroBaseline.gamma) / GYRO_RANGE_DEG, -0.5, 0.5);
    var rawPy = clamp((e.beta - gyroBaseline.beta) / GYRO_RANGE_DEG, -0.5, 0.5);
    gyroSmoothedPx += (rawPx - gyroSmoothedPx) * GYRO_SMOOTHING;
    gyroSmoothedPy += (rawPy - gyroSmoothedPy) * GYRO_SMOOTHING;

    gyroEls.forEach(function (el) {
      // Only elements actually visible right now — an element inside a
      // closed sheet has no layout box, but there's no reason to churn
      // its style every frame regardless.
      if (el.offsetParent !== null) applyTilt(el, gyroSmoothedPx, gyroSmoothedPy);
    });
  }

  function enableGyroTilt() {
    if (gyroListenerAttached) return;
    gyroListenerAttached = true;
    window.addEventListener('deviceorientation', onDeviceOrientation);
  }

  // iOS 13+ gates DeviceOrientationEvent behind an explicit permission
  // prompt that must be requested synchronously from inside a user-
  // gesture handler — see recalibrateTilt() below, called from
  // openSheet() (inventory.js) right as a QR-bearing sheet opens, which
  // is exactly such a gesture. Every other browser (Android, and desktop
  // browsers that happen to support the event) has no such gate and
  // just starts receiving events once enableGyroTilt() attaches the
  // listener. Requested once per session either way — a user who denies
  // it isn't asked again.
  function requestGyroPermissionOnce() {
    if (gyroPermissionRequested) return;
    gyroPermissionRequested = true;
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(function (state) {
        if (state === 'granted') enableGyroTilt();
      }).catch(function () {});
    } else if (typeof DeviceOrientationEvent !== 'undefined') {
      enableGyroTilt();
    }
  }

  // Re-zeroes the tilt to however the phone is being held right now —
  // called every time a tilt sheet opens (see openSheet(), inventory.js)
  // so "holding it flat/normally" always reads as neutral instead of
  // whatever angle the phone happened to be at when the listener first
  // attached. Harmless to call before permission is granted (or on
  // desktop, where it's simply never read).
  function recalibrateTilt() {
    gyroBaseline = null;
    gyroSmoothedPx = 0;
    gyroSmoothedPy = 0;
    requestGyroPermissionOnce();
  }

  function initTilt(el) {
    if (!el) return;

    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      function onMove(e) {
        var rect = el.getBoundingClientRect();
        var px = (e.clientX - rect.left) / rect.width - 0.5;
        var py = (e.clientY - rect.top) / rect.height - 0.5;
        applyTilt(el, px, py);
      }
      el.addEventListener('mousemove', onMove);
      el.addEventListener('mouseleave', function () { clearTilt(el); });
      return;
    }

    // Touch device: same effect, driven by the phone's real tilt (see
    // the Gyroscope tilt section above) instead of a cursor that
    // doesn't exist here. No-op if the browser has no orientation
    // sensor API at all.
    if (typeof DeviceOrientationEvent === 'undefined') return;
    gyroEls.push(el);
  }

  window.storageBase = Object.assign(window.storageBase || {}, {
    BASE_CATEGORIES: BASE_CATEGORIES,
    UNITS: UNITS,
    categoryList: categoryList,
    categoryIconHtml: categoryIconHtml,
    buildCategoryBadge: buildCategoryBadge,
    initTilt: initTilt,
    recalibrateTilt: recalibrateTilt
  });
})();
