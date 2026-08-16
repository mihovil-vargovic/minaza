(function () {
  var storageBase = window.storageBase;

  var input = document.getElementById('search-input');
  var clearBtn = document.getElementById('search-clear');
  var chipsEl = document.getElementById('search-category-chips');
  var resultsEl = document.getElementById('search-results');

  var itemsCache = [];
  var activeCategory = '';

  // Mobile-only tab (see planning5 "Mobile" — Search is a full takeover,
  // its own fourth tab, not a header icon). Loads its own copy of the
  // active items rather than sharing inventory.js's cache, since the two
  // views can be entered independently and shouldn't need to coordinate
  // load order.
  function load() {
    storageBase.call('list').then(function (res) {
      if (storageBase.handleAuthFailure(res)) return;
      if (res.ok) {
        itemsCache = res.items || [];
        buildCategoryChips();
        render();
      }
    });
  }

  // The category filter lives here (not the Inventory header) on mobile
  // — see planning5 "Mobile": Search is where both finding-by-name and
  // finding-by-category happen, since Inventory's header only has room
  // for the History icon once the search field itself moved to its own
  // tab.
  function buildCategoryChips() {
    var categories = storageBase.categoryList(itemsCache);
    chipsEl.innerHTML = '';
    buildChip('', 'All', false);
    categories.forEach(function (c) {
      buildChip(c, c, true);
    });
  }

  // "All" has no icon (it's a meta-option, not a real category) — every
  // real category gets the same icon as the New Item form's picker.
  function buildChip(value, label, withIcon) {
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = withIcon ? 'chip chip-category' : 'chip';
    if (withIcon) chip.innerHTML = storageBase.categoryIconSvg(value);
    var chipLabel = document.createElement('span');
    chipLabel.textContent = label;
    chip.appendChild(chipLabel);
    chip.classList.toggle('active', value === activeCategory);
    chip.addEventListener('click', function () {
      activeCategory = value;
      Array.prototype.forEach.call(chipsEl.children, function (c) {
        c.classList.toggle('active', c === chip);
      });
      render();
    });
    chipsEl.appendChild(chip);
  }

  function render() {
    var q = input.value.trim().toLowerCase();
    clearBtn.hidden = !q;
    resultsEl.innerHTML = '';

    // Empty until there's a query or an active category filter — per
    // planning5, not the unfiltered list.
    if (!q && !activeCategory) return;

    var matches = itemsCache.filter(function (item) {
      if (activeCategory && (item.category || '') !== activeCategory) return false;
      if (q && (item.name || '').toLowerCase().indexOf(q) === -1) return false;
      return true;
    });

    if (matches.length === 0) {
      var p = document.createElement('p');
      p.className = 'placeholder';
      p.textContent = 'No items match your search.';
      resultsEl.appendChild(p);
      return;
    }

    matches.forEach(function (item) {
      resultsEl.appendChild(storageBase.buildItemCard(item));
    });
  }

  input.addEventListener('input', render);

  clearBtn.addEventListener('click', function () {
    input.value = '';
    input.focus();
    render();
  });

  // Auto-focus + fresh data + reset every time the tab is entered.
  storageBase.onViewShown('search', function () {
    input.value = '';
    activeCategory = '';
    resultsEl.innerHTML = '';
    clearBtn.hidden = true;
    input.focus();
    load();
  });
})();
