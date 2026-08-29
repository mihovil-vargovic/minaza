(function () {
  var storageBase = window.storageBase;

  var itemsCache = [];
  var activeCategory = '';
  var expirySort = ''; // '' | 'asc' | 'desc' — Expiry column header cycles through these
  var selectedCategory = ''; // New Item form's category chip selection
  var selectedUnit = '';
  var createdItem = null;
  var selectedItemId = null; // desktop detail-panel selection only

  function isDesktop() {
    return window.matchMedia('(min-width: 1024px)').matches;
  }

  // ---- DOM refs ----
  var newBtn = document.getElementById('inv-new-btn');
  var searchBtn = document.getElementById('inv-search-btn');
  var palette = document.getElementById('search-palette');
  var paletteInput = document.getElementById('palette-input');
  var paletteResults = document.getElementById('palette-results');
  var categoryBtn = document.getElementById('inv-category-btn');
  var categoryMenu = document.getElementById('inv-category-menu');
  var categoryClear = document.getElementById('inv-category-clear');
  var expirySortBtn = document.getElementById('inv-sort-expiry');
  var stateEl = document.getElementById('inv-list-state');
  // The Inventory list is a table on both desktop and mobile now.
  var tableCard = document.getElementById('inv-table-card');
  var tableBody = document.getElementById('inv-table-body');

  var overlay = document.getElementById('new-item-modal');
  var closeBtn = document.getElementById('ni-close');
  var cancelBtn = document.getElementById('ni-cancel');
  var submitBtn = document.getElementById('ni-submit');
  var doneBtn = document.getElementById('ni-done');
  var printBtn = document.getElementById('ni-print');
  var downloadBtn = document.getElementById('ni-download');

  var stageForm = document.getElementById('new-item-stage-form');
  var stageLabel = document.getElementById('new-item-stage-label');
  var footerForm = document.getElementById('new-item-footer-form');
  var footerLabel = document.getElementById('new-item-footer-label');

  var nameInput = document.getElementById('ni-name');
  var categoryChips = document.getElementById('ni-category-chips');
  var amountInput = document.getElementById('ni-amount');
  var unitRow = document.getElementById('ni-unit-row');
  var unitOtherInput = document.getElementById('ni-unit-other');
  var expiryInput = document.getElementById('ni-expiry');
  var notesInput = document.getElementById('ni-notes');

  var qrBox = document.getElementById('ni-qr');
  var idEl = document.getElementById('ni-id');

  var printLabelEl = document.getElementById('print-label');

  var ivOverlay = document.getElementById('item-view-modal');
  var ivCloseBtn = document.getElementById('iv-close');
  var ivQr = document.getElementById('iv-qr');
  var ivId = document.getElementById('iv-id');
  var ivKv = {
    name: document.getElementById('iv-kv-name'),
    category: document.getElementById('iv-kv-category'),
    amount: document.getElementById('iv-kv-amount'),
    expiry: document.getElementById('iv-kv-expiry'),
    notes: document.getElementById('iv-kv-notes')
  };

  var detailEmpty = document.getElementById('inv-detail-empty');
  var detailContent = document.getElementById('inv-detail-content');
  var detailTitle = document.getElementById('detail-title');
  var detailQr = document.getElementById('detail-qr');
  var detailId = document.getElementById('detail-id');
  var detailKv = {
    name: document.getElementById('detail-kv-name'),
    category: document.getElementById('detail-kv-category'),
    amount: document.getElementById('detail-kv-amount'),
    expiry: document.getElementById('detail-kv-expiry'),
    notes: document.getElementById('detail-kv-notes')
  };
  var detailDeleteBtn = document.getElementById('detail-delete-btn');
  var detailDeleteConfirm = document.getElementById('detail-delete-confirm');
  var detailDeleteCancel = document.getElementById('detail-delete-cancel');
  var detailDeleteConfirmBtn = document.getElementById('detail-delete-confirm-btn');

  var detailMenuBtn = document.getElementById('detail-menu-btn');
  var detailMenu = document.getElementById('detail-menu');
  var detailReprintBtn = document.getElementById('detail-reprint-btn');
  var detailDownloadBtn = document.getElementById('detail-download-btn');

  // ---- Inventory list ----
  // Stale-while-revalidate: only the very first load (nothing on screen
  // yet) shows the loading skeleton. Every subsequent call — including
  // the refresh that fires on every switch back to this tab, see
  // onViewShown below — keeps showing whatever's already rendered and
  // refetches quietly in the background, swapping in the fresh data
  // once it arrives. Session-only cache: itemsCache lives in memory for
  // as long as the tab stays open, not persisted past a reload.
  var hasLoadedOnce = false;

  function loadItems() {
    if (!hasLoadedOnce) setState('loading');
    storageBase.call('list').then(function (res) {
      if (storageBase.handleAuthFailure(res)) return;
      if (!res.ok) {
        if (!hasLoadedOnce) setState('error');
        return;
      }
      hasLoadedOnce = true;
      itemsCache = res.items || [];
      populateCategoryFilter();
      renderList();
    }).catch(function () {
      if (!hasLoadedOnce) setState('error');
    });
  }

  function setState(kind) {
    if (!kind) {
      stateEl.hidden = true;
      tableCard.hidden = false;
      return;
    }

    // Loading renders skeleton rows in place (so the layout it's about
    // to show doesn't jump), everything else uses the plain text/retry
    // state block.
    if (kind === 'loading') {
      stateEl.hidden = true;
      tableCard.hidden = false;
      renderSkeleton();
      return;
    }

    tableCard.hidden = true;
    // Don't leave stale rows behind a hidden container — see
    // loadItems()'s stale-while-revalidate note.
    tableBody.innerHTML = '';
    stateEl.hidden = false;
    stateEl.innerHTML = '';

    var p = document.createElement('p');
    p.className = 'placeholder';
    stateEl.appendChild(p);

    if (kind === 'error') {
      p.textContent = 'Could not load inventory.';
      var retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn btn-tertiary';
      retry.textContent = 'Retry';
      retry.addEventListener('click', loadItems);
      stateEl.appendChild(retry);
    } else if (kind === 'empty') {
      p.textContent = 'No items yet. Add your first item to get started.';
    } else if (kind === 'empty-filtered') {
      p.textContent = 'No items match this filter.';
    }
  }

  // Each column's placeholder mirrors the shape of what actually renders
  // there (see buildRow below) — the category cell is a pill, not a text
  // line, since it stands in for the category badge. The category and
  // expiry cells also carry the same classes their real counterparts do
  // (.inv-row-category / .inv-row-expiry) so the existing mobile rules
  // that shrink the category badge to icon-only and hide Expiry entirely
  // apply to the skeleton too, instead of it showing a column that never
  // actually exists once items load.
  function renderSkeleton() {
    tableBody.innerHTML = '';
    for (var i = 0; i < 4; i++) {
      var tr = document.createElement('tr');
      tr.className = 'inv-row skeleton-row';

      var nameTd = document.createElement('td');
      nameTd.className = 'skeleton-cell-line';
      var nameLine = document.createElement('div');
      nameLine.className = 'skeleton-line skeleton-line-inv-name';
      nameTd.appendChild(nameLine);
      tr.appendChild(nameTd);

      var catTd = document.createElement('td');
      catTd.className = 'inv-row-category';
      var catPill = document.createElement('div');
      catPill.className = 'skeleton-line skeleton-pill-inv-category';
      catTd.appendChild(catPill);
      tr.appendChild(catTd);

      var amtTd = document.createElement('td');
      amtTd.className = 'skeleton-cell-line';
      var amtLine = document.createElement('div');
      amtLine.className = 'skeleton-line skeleton-line-inv-amount';
      amtTd.appendChild(amtLine);
      tr.appendChild(amtTd);

      var expTd = document.createElement('td');
      expTd.className = 'inv-row-expiry';
      var expLine = document.createElement('div');
      expLine.className = 'skeleton-line skeleton-line-inv-expiry';
      expTd.appendChild(expLine);
      tr.appendChild(expTd);

      tableBody.appendChild(tr);
    }
  }

  function populateCategoryFilter() {
    var categories = storageBase.categoryList(itemsCache);
    categoryMenu.innerHTML = '';
    buildCategoryMenuItem('', 'All categories');
    categories.forEach(function (c) {
      buildCategoryMenuItem(c, c);
    });
  }

  function buildCategoryMenuItem(value, label) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'category-menu-item';
    btn.dataset.value = value;
    // "All categories" isn't a real category — no icon for it, same
    // trusted-icon/untrusted-label split as buildCategoryChips.
    if (value) {
      btn.innerHTML = storageBase.categoryIconHtml(value);
    }
    var labelEl = document.createElement('span');
    labelEl.textContent = label;
    btn.appendChild(labelEl);
    btn.classList.toggle('active', value === activeCategory);
    btn.addEventListener('click', function () {
      selectCategory(value);
    });
    categoryMenu.appendChild(btn);
  }

  function selectCategory(value) {
    activeCategory = value;
    categoryClear.hidden = !activeCategory;
    categoryBtn.classList.toggle('active', !!activeCategory);
    Array.prototype.forEach.call(categoryMenu.children, function (btn) {
      btn.classList.toggle('active', btn.dataset.value === value);
    });
    closeCategoryMenu();
    renderList();
  }

  function openCategoryMenu() {
    categoryMenu.hidden = false;
    categoryBtn.setAttribute('aria-expanded', 'true');
  }

  function closeCategoryMenu() {
    categoryMenu.hidden = true;
    categoryBtn.setAttribute('aria-expanded', 'false');
  }

  function renderList() {
    var filtered = itemsCache.filter(function (item) {
      if (activeCategory && (item.category || '') !== activeCategory) return false;
      return true;
    });

    if (expirySort) {
      // expiryDate is the <input type="date"> value (YYYY-MM-DD), so a
      // plain string comparison already sorts chronologically. Items
      // with no expiry date always sort last, in either direction —
      // "no expiry" isn't meaningfully soonest or latest.
      filtered = filtered.slice().sort(function (a, b) {
        var ad = a.expiryDate || '';
        var bd = b.expiryDate || '';
        if (!ad && !bd) return 0;
        if (!ad) return 1;
        if (!bd) return -1;
        if (ad === bd) return 0;
        var cmp = ad < bd ? -1 : 1;
        return expirySort === 'asc' ? cmp : -cmp;
      });
    }

    if (filtered.length === 0) {
      setState(itemsCache.length === 0 ? 'empty' : 'empty-filtered');
      updateDesktopSelection(filtered);
      return;
    }
    setState(null);

    tableBody.innerHTML = '';
    filtered.forEach(function (item) {
      tableBody.appendChild(buildRow(item));
    });
    updateDesktopSelection(filtered);
  }

  // Table row, used on both desktop and mobile. Desktop selects the row
  // into the persistent side panel; mobile (no room for a panel) opens
  // the existing read-only modal instead.
  function buildRow(item) {
    var tr = document.createElement('tr');
    tr.className = 'inv-row';
    tr.dataset.itemId = item.id;
    tr.classList.toggle('inv-row-selected', item.id === selectedItemId);

    var nameTd = document.createElement('td');
    nameTd.className = 'inv-row-name';
    nameTd.textContent = item.name || '';
    tr.appendChild(nameTd);

    var catTd = document.createElement('td');
    catTd.className = 'inv-row-category';
    if (item.category) {
      catTd.appendChild(storageBase.buildCategoryBadge(item.category, { small: true }));
    }
    tr.appendChild(catTd);

    var amtTd = document.createElement('td');
    amtTd.textContent = item.amount + ' ' + item.unit;
    tr.appendChild(amtTd);

    var expTd = document.createElement('td');
    expTd.className = 'inv-row-expiry';
    expTd.textContent = item.expiryDate || '—';
    tr.appendChild(expTd);

    tr.addEventListener('click', function () {
      if (isDesktop()) {
        selectDesktopItem(item);
      } else {
        modalController.render(item);
        openItemView();
      }
    });

    return tr;
  }

  // No longer used by Inventory itself (that's the table above, on both
  // desktop and mobile) — kept for the mobile Search tab's results,
  // reused via storageBase.buildItemCard. Always opens the existing
  // read-only modal.
  function buildCard(item) {
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'item-card';
    card.dataset.itemId = item.id;

    var name = document.createElement('div');
    name.className = 'item-card-name';
    name.textContent = item.name || '';
    card.appendChild(name);

    var meta = document.createElement('div');
    meta.className = 'item-card-meta';
    if (item.category) {
      meta.appendChild(storageBase.buildCategoryBadge(item.category));
    }
    var amount = document.createElement('span');
    amount.className = 'item-card-amount';
    amount.textContent = item.amount + ' ' + item.unit;
    meta.appendChild(amount);
    card.appendChild(meta);

    if (item.expiryDate) {
      var expiry = document.createElement('div');
      expiry.className = 'item-card-expiry';
      expiry.textContent = 'Expires ' + item.expiryDate;
      card.appendChild(expiry);
    }

    // Re-fetches fresh rather than trusting this cached card's data —
    // same reasoning as Scan's Recent-scans list (scan.js): this card
    // was built from a snapshot that could be stale by the time it's
    // tapped (no live sync between devices), so the item shown could
    // have been edited or removed elsewhere in the meantime.
    card.addEventListener('click', function () {
      storageBase.call('get', { id: item.id }).then(function (res) {
        if (storageBase.handleAuthFailure(res)) return;
        if (!res.ok) {
          storageBase.toast(
            res.error === 'not_found' ? 'Item not found. It may have been deleted.' : 'Could not look up that item.',
            { type: 'error' }
          );
          return;
        }
        modalController.render(res.item);
        openItemView();
      }).catch(function (err) {
        storageBase.toast(err.message || 'Could not reach the backend.', { type: 'error' });
      });
    });

    return card;
  }

  // Native iOS bottom-sheet feel: slide up/down + backdrop fade instead
  // of the old instant hidden-attribute snap. Shared by every .sheet
  // overlay (Item View, New Item) so they all animate identically —
  // duration matches the CSS transition on .modal-overlay.sheet (see
  // app.css); the setTimeout just needs to outlast it before hiding
  // for real. The 'is-closing' class (rather than a module-level flag)
  // tracks in-flight closes per-overlay, so two different sheets can
  // close independently without stepping on each other's state.
  var SHEET_TRANSITION_MS = 320;

  function openSheet(sheetOverlay) {
    sheetOverlay.classList.remove('is-closing');
    sheetOverlay.hidden = false;
    void sheetOverlay.offsetWidth; // force layout so is-open's transition starts from the closed state, not skips straight to open
    sheetOverlay.classList.add('is-open');
  }

  function closeSheet(sheetOverlay) {
    if (sheetOverlay.hidden || sheetOverlay.classList.contains('is-closing')) return;
    sheetOverlay.classList.add('is-closing');
    sheetOverlay.classList.remove('is-open');
    setTimeout(function () {
      sheetOverlay.hidden = true;
      sheetOverlay.classList.remove('is-closing');
    }, SHEET_TRANSITION_MS);
  }

  function openItemView() {
    openSheet(ivOverlay);
  }

  function closeItemView() {
    closeSheet(ivOverlay);
  }

  ivCloseBtn.addEventListener('click', closeItemView);
  ivOverlay.addEventListener('click', function (e) {
    if (e.target === ivOverlay) closeItemView();
  });

  // ---- Shared detail rendering + delete flow, used by both the desktop
  // side panel and (minus delete, which is desktop-only per planning5)
  // the mobile read-only modal — one QR/meta-rendering implementation
  // and one delete confirm/cancel/confirm flow instead of two copies.
  function createDetailController(refs) {
    var item = null;
    var hasDelete = !!refs.deleteBtn;

    function render(it) {
      item = it;
      if (hasDelete) resetDeleteConfirm();

      if (refs.title) refs.title.textContent = it.name || '';

      refs.qr.innerHTML = '';
      new QRCode(refs.qr, {
        text: it.id,
        width: refs.qrSize,
        height: refs.qrSize,
        colorDark: '#09090b',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
      refs.id.textContent = it.id;

      if (refs.kv) {
        // Desktop panel: a key-value table, every field always shown
        // (placeholder "—" when empty) rather than the mobile modal's
        // inline chips + conditionally-hidden rows.
        refs.kv.name.textContent = it.name || '—';
        refs.kv.category.textContent = it.category || '—';
        refs.kv.amount.textContent = it.amount ? it.amount + ' ' + it.unit : '—';
        refs.kv.expiry.textContent = it.expiryDate || '—';
        refs.kv.notes.textContent = it.notes || '—';
      } else {
        refs.meta.innerHTML = '';
        if (it.category) {
          refs.meta.appendChild(storageBase.buildCategoryBadge(it.category));
        }
        var amt = document.createElement('span');
        amt.textContent = it.amount + ' ' + it.unit;
        refs.meta.appendChild(amt);

        if (it.expiryDate) {
          refs.expiry.textContent = 'Expires ' + it.expiryDate;
          refs.expiry.hidden = false;
        } else {
          refs.expiry.hidden = true;
        }

        if (it.notes) {
          refs.notes.textContent = it.notes;
          refs.notes.hidden = false;
        } else {
          refs.notes.hidden = true;
        }
      }
    }

    function resetDeleteConfirm() {
      refs.deleteConfirm.hidden = true;
      refs.deleteConfirmBtn.disabled = false;
      refs.deleteConfirmBtn.textContent = 'Delete permanently';
    }

    // deleteBtn now lives inside the "⋮" menu (see detailDeleteBtn's own
    // click listener below, which closes that menu) rather than being a
    // standalone link below the table — it doesn't need hiding/showing
    // itself, just needs to reveal the confirm block.
    if (hasDelete) {
      refs.deleteBtn.addEventListener('click', function () {
        refs.deleteConfirm.hidden = false;
      });

      refs.deleteCancel.addEventListener('click', resetDeleteConfirm);

      refs.deleteConfirmBtn.addEventListener('click', function () {
        if (!item) return;
        var target = item;
        refs.deleteConfirmBtn.disabled = true;
        refs.deleteConfirmBtn.textContent = 'Deleting…';
        storageBase.call('delete', { id: target.id }).then(function (res) {
          if (storageBase.handleAuthFailure(res)) return;
          // deleteConfirmBtn is one shared element for whichever item the
          // panel currently shows — if the selection moved on to a
          // different item while this request was in flight (e.g. the
          // user clicked another row before this one resolved), this
          // response is stale and must not touch a button that now
          // belongs to a different item's confirm dialog.
          var stillCurrent = item === target;
          if (!res.ok) {
            // Same distinction Remove already makes (scan.js) — the
            // no-live-sync race (another device already deleted it) gets
            // its own clear message per planning5, not a generic failure.
            storageBase.toast(
              res.error === 'not_found' ? 'This item is no longer available.' : 'Could not delete that item.',
              { type: 'error' }
            );
            if (stillCurrent) {
              refs.deleteConfirmBtn.disabled = false;
              refs.deleteConfirmBtn.textContent = 'Delete permanently';
            }
            // If it's already gone (another device beat us to it), the
            // panel is showing stale data — refresh so it advances off
            // this item like a successful delete would, instead of
            // sitting on a confirm screen for something that no longer
            // exists.
            if (res.error === 'not_found') loadItems();
            return;
          }
          storageBase.toast('Item deleted.');
          // itemsCache no longer contains this id once loadItems() resolves,
          // so updateDesktopSelection() naturally falls back to a new
          // selection (or the empty state) — no separate "cleared" signal needed.
          loadItems();
        }).catch(function (err) {
          storageBase.toast(err.message || 'Could not reach the backend.', { type: 'error' });
          if (item === target) {
            refs.deleteConfirmBtn.disabled = false;
            refs.deleteConfirmBtn.textContent = 'Delete permanently';
          }
        });
      });
    }

    return {
      render: render,
      getItem: function () { return item; }
    };
  }

  // Mobile item view now renders the same label:value kv-table as the
  // desktop panel (refs.kv branch in createDetailController), not its own
  // inline-chip layout — same fields, same "one row per field" logic,
  // just presented in a bottom sheet instead of a side panel.
  var modalController = createDetailController({
    qr: ivQr, id: ivId, kv: ivKv, qrSize: 160
  });

  var panelController = createDetailController({
    title: detailTitle, qr: detailQr, id: detailId, kv: detailKv, qrSize: 180,
    deleteBtn: detailDeleteBtn, deleteConfirm: detailDeleteConfirm, deleteCancel: detailDeleteCancel, deleteConfirmBtn: detailDeleteConfirmBtn
  });

  // ---- Desktop detail-panel selection ----
  function selectDesktopItem(item) {
    selectedItemId = item.id;
    detailEmpty.hidden = true;
    detailContent.hidden = false;
    panelController.render(item);
    markSelectedCard();
  }

  function clearDesktopSelection() {
    selectedItemId = null;
    detailEmpty.hidden = false;
    detailContent.hidden = true;
  }

  function markSelectedCard() {
    Array.prototype.forEach.call(tableBody.querySelectorAll('.inv-row'), function (row) {
      row.classList.toggle('inv-row-selected', row.dataset.itemId === selectedItemId);
    });
  }

  // Called after every render (initial load, search, filter, restore,
  // delete): keeps the current selection if it still exists anywhere in
  // the inventory (even if the active filter now hides it — filtering
  // the list shouldn't kick you out of the item you're looking at),
  // otherwise auto-selects the first item of the current filtered view,
  // or shows the empty state if there's nothing to select.
  function updateDesktopSelection(filtered) {
    if (!isDesktop()) return;
    var stillExists = selectedItemId && itemsCache.some(function (i) { return i.id === selectedItemId; });
    if (stillExists) {
      var current = itemsCache.filter(function (i) { return i.id === selectedItemId; })[0];
      selectDesktopItem(current);
      return;
    }
    if (filtered.length > 0) {
      selectDesktopItem(filtered[0]);
    } else {
      clearDesktopSelection();
    }
  }

  // ---- Detail-panel "more actions" menu (Reprint / Download) ----
  function openDetailMenu() {
    detailMenu.hidden = false;
    detailMenuBtn.setAttribute('aria-expanded', 'true');
  }
  function closeDetailMenu() {
    detailMenu.hidden = true;
    detailMenuBtn.setAttribute('aria-expanded', 'false');
  }

  detailMenuBtn.addEventListener('click', function () {
    if (detailMenu.hidden) openDetailMenu();
    else closeDetailMenu();
  });

  document.addEventListener('click', function (e) {
    if (!detailMenu.hidden && !detailMenu.contains(e.target) && !detailMenuBtn.contains(e.target)) {
      closeDetailMenu();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !detailMenu.hidden) closeDetailMenu();
  });

  detailReprintBtn.addEventListener('click', function () {
    var item = panelController.getItem();
    closeDetailMenu();
    if (item) printLabelFor(item);
  });

  detailDownloadBtn.addEventListener('click', function () {
    var item = panelController.getItem();
    closeDetailMenu();
    if (item) downloadLabelFor(item);
  });

  // panelController's own click listener (attached when it was created
  // above) reveals the confirm block — this just closes the menu itself,
  // same as Reprint/Download.
  detailDeleteBtn.addEventListener('click', closeDetailMenu);

  // ---- Desktop search palette (cmdk-style jump-to-item) ----
  // Replaces the old persistent inline search field: this modal doesn't
  // filter the table itself (activeCategory/expirySort still do that),
  // it's purely a fast way to find an item by name and select it
  // straight into the detail panel. Desktop-only, same as searchBtn's
  // container (see .inv-controls' <1024px display: none).
  var paletteMatches = [];
  var paletteActiveIndex = -1;

  function openPalette() {
    palette.hidden = false;
    paletteInput.value = '';
    renderPaletteResults('');
    paletteInput.focus();
  }

  function closePalette() {
    palette.hidden = true;
  }

  function renderPaletteResults(query) {
    var q = query.trim().toLowerCase();
    paletteMatches = itemsCache.filter(function (item) {
      return !q || (item.name || '').toLowerCase().indexOf(q) !== -1;
    }).slice(0, 8);
    paletteActiveIndex = paletteMatches.length ? 0 : -1;

    paletteResults.innerHTML = '';

    if (paletteMatches.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'palette-empty';
      empty.textContent = itemsCache.length === 0 ? 'No items yet.' : 'No items match your search.';
      paletteResults.appendChild(empty);
      return;
    }

    var label = document.createElement('div');
    label.className = 'palette-group-label';
    label.textContent = 'Items';
    paletteResults.appendChild(label);

    paletteMatches.forEach(function (item, i) {
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'palette-item';
      row.classList.toggle('active', i === paletteActiveIndex);
      // Icon is a trusted fixed glyph (see categoryIconHtml) — the name
      // itself is untrusted data, so it goes in via a separate
      // textContent-set span, same split shared.js already uses.
      row.innerHTML = storageBase.categoryIconHtml(item.category || '');
      var name = document.createElement('span');
      name.className = 'palette-item-name';
      name.textContent = item.name || '';
      row.appendChild(name);
      var meta = document.createElement('span');
      meta.className = 'palette-item-meta';
      meta.textContent = item.amount + ' ' + item.unit;
      row.appendChild(meta);
      row.addEventListener('mouseenter', function () {
        paletteActiveIndex = i;
        updatePaletteActive();
      });
      row.addEventListener('click', function () {
        choosePaletteItem(item);
      });
      paletteResults.appendChild(row);
    });
  }

  function updatePaletteActive() {
    Array.prototype.forEach.call(paletteResults.querySelectorAll('.palette-item'), function (row, i) {
      var isActive = i === paletteActiveIndex;
      row.classList.toggle('active', isActive);
      if (isActive) row.scrollIntoView({ block: 'nearest' });
    });
  }

  function choosePaletteItem(item) {
    closePalette();
    selectDesktopItem(item);
  }

  searchBtn.addEventListener('click', openPalette);

  palette.addEventListener('click', function (e) {
    if (e.target === palette) closePalette();
  });

  paletteInput.addEventListener('input', function () {
    renderPaletteResults(paletteInput.value);
  });

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && isDesktop()) {
      e.preventDefault();
      if (palette.hidden) openPalette(); else closePalette();
      return;
    }
    if (palette.hidden) return;

    if (e.key === 'Escape') {
      closePalette();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (paletteMatches.length) {
        paletteActiveIndex = (paletteActiveIndex + 1) % paletteMatches.length;
        updatePaletteActive();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (paletteMatches.length) {
        paletteActiveIndex = (paletteActiveIndex - 1 + paletteMatches.length) % paletteMatches.length;
        updatePaletteActive();
      }
    } else if (e.key === 'Enter') {
      if (paletteActiveIndex >= 0 && paletteMatches[paletteActiveIndex]) {
        choosePaletteItem(paletteMatches[paletteActiveIndex]);
      }
    }
  });

  categoryBtn.addEventListener('click', function () {
    if (categoryMenu.hidden) openCategoryMenu();
    else closeCategoryMenu();
  });

  document.addEventListener('click', function (e) {
    if (!categoryMenu.hidden && !categoryMenu.contains(e.target) && !categoryBtn.contains(e.target)) {
      closeCategoryMenu();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !categoryMenu.hidden) closeCategoryMenu();
  });

  categoryClear.addEventListener('click', function () {
    selectCategory('');
  });

  var EXPIRY_SORT_ICONS = {
    '': '<path d="M8 9l4-4 4 4"></path><path d="M16 15l-4 4-4-4"></path>',
    asc: '<polyline points="18 15 12 9 6 15"></polyline>',
    desc: '<polyline points="6 9 12 15 18 9"></polyline>'
  };

  function updateExpirySortUI() {
    expirySortBtn.classList.toggle('sort-asc', expirySort === 'asc');
    expirySortBtn.classList.toggle('sort-desc', expirySort === 'desc');
    var icon = expirySortBtn.querySelector('.inv-th-sort-icon');
    icon.innerHTML = EXPIRY_SORT_ICONS[expirySort];
  }

  expirySortBtn.addEventListener('click', function () {
    expirySort = expirySort === '' ? 'asc' : (expirySort === 'asc' ? 'desc' : '');
    updateExpirySortUI();
    renderList();
  });

  // ---- New Item modal ----
  function openModal() {
    resetForm();
    buildCategoryChips();
    buildUnitChips();
    showStageForm();
    openSheet(overlay);
    nameInput.focus();
  }

  function closeModal() {
    closeSheet(overlay);
  }

  function resetForm() {
    nameInput.value = '';
    selectedCategory = '';
    amountInput.value = '';
    unitOtherInput.value = '';
    unitOtherInput.hidden = true;
    expiryInput.value = '';
    notesInput.value = '';
    selectedUnit = '';
    createdItem = null;
    clearFieldError('name');
    clearFieldError('amount');
    clearFieldError('unit');
  }

  function showStageForm() {
    stageForm.hidden = false;
    stageLabel.hidden = true;
    footerForm.hidden = false;
    footerLabel.hidden = true;
  }

  function showStageLabel(item) {
    stageForm.hidden = true;
    stageLabel.hidden = false;
    footerForm.hidden = true;
    footerLabel.hidden = false;

    idEl.textContent = item.id;
    qrBox.innerHTML = '';
    new QRCode(qrBox, {
      text: item.id,
      width: 200,
      height: 200,
      colorDark: '#09090b',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  // Chips are the only category selector now — no free-text fallback,
  // so Category is locked to the shared list (see storageBase.categoryList).
  function buildCategoryChips() {
    var categories = storageBase.categoryList(itemsCache);
    categoryChips.innerHTML = '';
    categories.forEach(function (c) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip chip-category';
      // Icon markup is always our own fixed SVG string (safe); the
      // category label is untrusted data, so it goes in via a separate
      // textContent-set span rather than being concatenated into the
      // same innerHTML string.
      chip.innerHTML = storageBase.categoryIconHtml(c);
      var chipLabel = document.createElement('span');
      chipLabel.textContent = c;
      chip.appendChild(chipLabel);
      chip.dataset.category = c;
      chip.classList.toggle('active', c === selectedCategory);
      chip.addEventListener('click', function () {
        selectCategoryChip(c);
      });
      categoryChips.appendChild(chip);
    });
  }

  // Clicking the already-selected chip deselects it (category is
  // optional, per Code.gs — there must be a way back to "none").
  function selectCategoryChip(c) {
    selectedCategory = selectedCategory === c ? '' : c;
    Array.prototype.forEach.call(categoryChips.querySelectorAll('.chip-category'), function (chip) {
      chip.classList.toggle('active', chip.dataset.category === selectedCategory);
    });
  }

  function buildUnitChips() {
    unitRow.innerHTML = '';
    storageBase.UNITS.forEach(function (u) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip chip-unit';
      chip.textContent = u === 'other' ? 'Other' : u;
      chip.dataset.unit = u;
      chip.addEventListener('click', function () {
        selectUnit(u);
      });
      unitRow.appendChild(chip);
    });
  }

  function selectUnit(u) {
    selectedUnit = u;
    Array.prototype.forEach.call(unitRow.querySelectorAll('.chip-unit'), function (chip) {
      chip.classList.toggle('active', chip.dataset.unit === u);
    });
    unitOtherInput.hidden = u !== 'other';
    if (u === 'other') unitOtherInput.focus();
    clearFieldError('unit');
  }

  function setFieldError(field, message) {
    var el = document.querySelector('[data-error-for="' + field + '"]');
    if (el) {
      el.textContent = message;
      el.hidden = false;
    }
  }

  function clearFieldError(field) {
    var el = document.querySelector('[data-error-for="' + field + '"]');
    if (el) {
      el.hidden = true;
      el.textContent = '';
    }
  }

  // Mirrors Code.gs's own validation so the common cases never round-trip
  // to the server — handleServerValidationError below still covers the
  // server rejecting something the client let through.
  function validate() {
    var valid = true;
    var firstInvalidField = null;
    clearFieldError('name');
    clearFieldError('amount');
    clearFieldError('unit');

    var name = nameInput.value.trim();
    if (!name) {
      setFieldError('name', 'Name is required.');
      valid = false;
      firstInvalidField = firstInvalidField || nameInput;
    }

    var amountRaw = amountInput.value;
    var amount = Number(amountRaw);
    if (!amountRaw || !isFinite(amount) || amount <= 0) {
      setFieldError('amount', 'Enter a positive amount.');
      valid = false;
      firstInvalidField = firstInvalidField || amountInput;
    }

    var unit = selectedUnit;
    if (!unit) {
      setFieldError('unit', 'Pick a unit.');
      valid = false;
    } else if (unit === 'other') {
      unit = unitOtherInput.value.trim();
      if (!unit) {
        setFieldError('unit', 'Enter a unit.');
        valid = false;
        firstInvalidField = firstInvalidField || unitOtherInput;
      }
    }

    // Per planning5's form-validation spec: block submission, show the
    // inline error, and focus the field — not just the error text.
    if (firstInvalidField) firstInvalidField.focus();

    if (!valid) return null;
    return {
      name: name,
      category: selectedCategory,
      amount: amountRaw,
      unit: unit,
      expiryDate: expiryInput.value,
      notes: notesInput.value.trim()
    };
  }

  function handleServerValidationError(code) {
    if (code === 'name_required') setFieldError('name', 'Name is required.');
    else if (code === 'amount_invalid') setFieldError('amount', 'Enter a positive amount.');
    else if (code === 'unit_required') setFieldError('unit', 'Pick a unit.');
    else storageBase.toast('Could not add item. Try again.', { type: 'error' });
  }

  newBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  doneBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!overlay.hidden) closeModal();
    else if (!ivOverlay.hidden) closeItemView();
  });

  submitBtn.addEventListener('click', function () {
    var data = validate();
    if (!data) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding…';

    storageBase.call('create', data).then(function (res) {
      if (storageBase.handleAuthFailure(res)) return;
      if (!res.ok) {
        handleServerValidationError(res.error);
        return;
      }
      createdItem = res.item;
      showStageLabel(createdItem);
      storageBase.toast(createdItem.name + ' added to inventory.');
      loadItems();
    }).catch(function (err) {
      // Modal stays open with the form data intact — per planning5, a
      // failed save must not lose the user's input.
      storageBase.toast(err.message || 'Could not reach the backend.', { type: 'error' });
    }).finally(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add new item';
    });
  });

  // ---- Print (browser print, 23x23mm label) ----
  // Shared by the New Item modal's post-creation stage and the desktop
  // detail panel's "Reprint" menu item — any item, not just a just-
  // created one, can be (re)printed.
  function printLabelFor(item) {
    printLabelEl.innerHTML = '';
    new QRCode(printLabelEl, {
      text: item.id,
      width: 236,
      height: 236,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
    window.print();
  }

  // ---- Download (print-ready PNG, 300dpi at 23x23mm) ----
  // Format is a working assumption pending real QL-800 output — see
  // ../_prd/planning5 "Label generation & printing" and PROGRESS.md.
  function downloadLabelFor(item) {
    var px = Math.round((23 / 25.4) * 300);

    var offscreen = document.createElement('div');
    offscreen.style.position = 'fixed';
    offscreen.style.left = '-9999px';
    document.body.appendChild(offscreen);

    new QRCode(offscreen, {
      text: item.id,
      width: px,
      height: px,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });

    var qrCanvas = offscreen.querySelector('canvas');
    var out = document.createElement('canvas');
    out.width = px;
    out.height = px;
    var ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, px, px);
    if (qrCanvas) ctx.drawImage(qrCanvas, 0, 0, px, px);

    out.toBlob(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = item.id + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      offscreen.remove();
      storageBase.toast('Label file downloaded.');
    }, 'image/png');
  }

  printBtn.addEventListener('click', function () {
    if (createdItem) printLabelFor(createdItem);
  });

  downloadBtn.addEventListener('click', function () {
    if (createdItem) downloadLabelFor(createdItem);
  });

  // Cursor tilt/parallax on every QR "card" — New Item's label stage,
  // the desktop detail panel, and the (mobile) item-view modal. Attached
  // once; survives QRCode.js rebuilding each box's children on every
  // render since the listener lives on the container element itself.
  storageBase.initTilt(qrBox);
  storageBase.initTilt(ivQr);
  storageBase.initTilt(detailQr);

  // Refreshes every time Inventory becomes the visible view (not just
  // once on app-open) — items removed via mobile Scan while this same
  // session was on another tab need to disappear the moment the user
  // switches back, not stay stale until a reload.
  storageBase.onViewShown('inventory', loadItems);

  // Exposed so the mobile Search tab can reuse the same card markup
  // (and, through it, the mobile item-detail modal) instead of
  // duplicating either — one source for what an item "looks like".
  window.storageBase = Object.assign(window.storageBase || {}, {
    buildItemCard: buildCard
  });
})();
