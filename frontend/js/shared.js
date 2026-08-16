(function () {
  // One shared category/unit source for desktop's New Item quick-pick,
  // desktop's Inventory filter, and (later) mobile's chip row — per
  // ../_prd/planning5, these must not be maintained in three places.
  var BASE_CATEGORIES = ['Jams', 'Vegetables', 'Oil & Acid', 'Tomato', 'Toilet', 'Fruit'];
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

  // One small hand-authored icon per base category (same 24x24 stroke
  // style as the rest of the app's icons), plus a generic fallback for
  // any category appended from real usage that isn't in this fixed set.
  // 12x12 to match shadcn/ui's Badge spec ([&>svg]:size-3, i.e. 0.75rem).
  var ICON_ATTRS = 'viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  var CATEGORY_ICONS = {
    'Jams': '<path d="M8 4h8v3a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V4z"></path><path d="M7 8h10l1 12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L7 8z"></path>',
    'Vegetables': '<path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 9-9h5v5c0 5-4 9-9 9z"></path><path d="M4 21c4-4 6-7 9-13"></path>',
    'Oil & Acid': '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"></path>',
    'Tomato': '<circle cx="12" cy="14" r="7"></circle><path d="M9 7c1-2 5-2 6 0"></path><path d="M12 7V5"></path>',
    'Toilet': '<rect x="3" y="6" width="14" height="12" rx="2"></rect><circle cx="10" cy="12" r="3"></circle><path d="M17 9c2 0 4 1.5 4 3.5S19 16 17 16"></path>',
    'Fruit': '<path d="M12 8c-4 0-7 3-7 7a6 6 0 0 0 11.5 2.3A6 6 0 0 0 19 15c0-4-3-7-7-7z"></path><path d="M12 8c0-2 1-3 1-3"></path><path d="M12 5c1-1 2-1 3 0"></path>'
  };
  var FALLBACK_ICON = '<path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L3 13V3h10l7.59 7.59a2 2 0 0 1 0 2.82z"></path><circle cx="7.5" cy="7.5" r="1"></circle>';

  function categoryIconSvg(name) {
    return '<svg ' + ICON_ATTRS + '>' + (CATEGORY_ICONS[name] || FALLBACK_ICON) + '</svg>';
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
    el.innerHTML = categoryIconSvg(name);
    var label = document.createElement('span');
    label.textContent = name;
    el.appendChild(label);
    return el;
  }

  // Cursor-tracked tilt/parallax for the QR "cards" (detail panel, New
  // Item label stage, item-view modal) — call once per element; the
  // listener stays attached across re-renders since QRCode.js only
  // replaces the element's children, never the element itself. Skipped
  // entirely on touch devices (no real cursor to track, and touch
  // synthesizes mousemove unreliably) — same hover-capability guard
  // used elsewhere in this app's CSS.
  function initTilt(el) {
    if (!el || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    var maxTilt = 10; // degrees

    function onMove(e) {
      var rect = el.getBoundingClientRect();
      var px = (e.clientX - rect.left) / rect.width - 0.5;
      var py = (e.clientY - rect.top) / rect.height - 0.5;
      var rotateY = px * maxTilt * 2;
      var rotateX = -py * maxTilt * 2;
      el.style.transform = 'perspective(600px) rotateX(' + rotateX.toFixed(2) + 'deg) rotateY(' + rotateY.toFixed(2) + 'deg) scale(1.04)';
      // Shadow shifts opposite the tilt, like a light source overhead —
      // reinforces the 3D effect instead of just rotating flatly.
      el.style.boxShadow = (-px * 22).toFixed(1) + 'px ' + (-py * 22 + 6).toFixed(1) + 'px 24px rgba(0, 0, 0, 0.18)';
    }

    function onLeave() {
      el.style.transform = '';
      el.style.boxShadow = '';
    }

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
  }

  window.storageBase = Object.assign(window.storageBase || {}, {
    BASE_CATEGORIES: BASE_CATEGORIES,
    UNITS: UNITS,
    categoryList: categoryList,
    categoryIconSvg: categoryIconSvg,
    buildCategoryBadge: buildCategoryBadge,
    initTilt: initTilt
  });
})();
