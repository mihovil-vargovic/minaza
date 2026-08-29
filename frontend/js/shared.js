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
    'Tomato': 'orange',
    'Toilet': 'toilet',
    'Fruit': 'basket'
  };
  var FALLBACK_ICON = 'package';

  function categoryIconHtml(name) {
    return '<i class="ph-duotone ph-' + (CATEGORY_ICONS[name] || FALLBACK_ICON) + ' category-icon"></i>';
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
    categoryIconHtml: categoryIconHtml,
    buildCategoryBadge: buildCategoryBadge,
    initTilt: initTilt
  });
})();
