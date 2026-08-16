(function () {
  var storageBase = window.storageBase;

  var video = document.getElementById('scan-video');
  var viewfinder = document.querySelector('.scan-viewfinder');
  var permissionState = document.getElementById('scan-permission');
  var permissionRetry = document.getElementById('scan-permission-retry');
  var recentList = document.getElementById('scan-recent-list');
  var tabbar = document.querySelector('.tabbar');

  var sheet = document.getElementById('item-sheet');
  var sheetContent = document.getElementById('item-sheet-content');
  var sheetCancel = document.getElementById('item-sheet-cancel');
  var sheetRemove = document.getElementById('item-sheet-remove');

  // Bare-ID QR payload, e.g. ITEM-0001 — see Code.gs generateId_() and
  // ../_prd/technical-spec-backend_and_scanning.md §3.10 for why it's a
  // bare ID rather than a URL.
  var ID_PATTERN = /^ITEM-\d{4}$/;
  var RECENT_LIMIT = 8;

  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d', { willReadFrequently: true });

  var stream = null;
  var rafId = null;
  var scanning = false;
  var locked = false; // paused while a lookup is in flight or the sheet is open
  var lastValue = null;
  var lastValueAt = 0;
  var recentScans = [];
  var currentItem = null;

  // ---- camera lifecycle ----
  function startCamera() {
    if (stream || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) showPermissionState();
      return;
    }
    permissionState.hidden = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(function (s) {
        stream = s;
        video.srcObject = s;
        video.play();
        scanning = true;
        rafId = requestAnimationFrame(tick);
      })
      .catch(function () {
        showPermissionState();
      });
  }

  function stopCamera() {
    scanning = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }
    video.srcObject = null;
  }

  function showPermissionState() {
    permissionState.hidden = false;
  }

  permissionRetry.addEventListener('click', startCamera);

  function tick() {
    if (!scanning) return;
    if (!locked && video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
      if (code && code.data) handleDecoded(code.data);
    }
    rafId = requestAnimationFrame(tick);
  }

  function handleDecoded(value) {
    var now = Date.now();
    // Debounce: the same code sits in frame for many ticks in a row —
    // without this, one physical scan would fire the lookup dozens of
    // times before the user's hand moves the phone away.
    if (value === lastValue && now - lastValueAt < 3000) return;
    lastValue = value;
    lastValueAt = now;

    if (!ID_PATTERN.test(value)) {
      // Distinct from "item not found" per planning5 — this decoded fine
      // but clearly isn't a Storage Base label at all.
      storageBase.toast('That doesn\'t look like a Storage Base label.', { type: 'error' });
      return;
    }
    lookupAndOpen(value);
  }

  // ---- lookup + Confirm/detail sheet ----
  function lookupAndOpen(id) {
    if (locked) return;
    locked = true;
    storageBase.call('get', { id: id }).then(function (res) {
      if (storageBase.handleAuthFailure(res)) return;
      if (!res.ok) {
        storageBase.toast(
          res.error === 'not_found' ? 'Item not found. It may have been deleted.' : 'Could not look up that item.',
          { type: 'error' }
        );
        locked = false;
        return;
      }
      addRecentScan(res.item);
      openSheet(res.item);
    }).catch(function (err) {
      storageBase.toast(err.message || 'Could not reach the backend.', { type: 'error' });
      locked = false;
    });
  }

  function openSheet(item) {
    currentItem = item;
    renderSheet(item);
    sheet.hidden = false;
    tabbar.hidden = true; // per planning5 — tab bar hidden whenever an item is open
  }

  function closeSheet() {
    sheet.hidden = true;
    tabbar.hidden = false;
    currentItem = null;
    locked = false;
    // Otherwise re-pointing the camera at the same label within the 3s
    // debounce window right after closing does nothing — silently, with
    // no feedback — until the window naturally expires.
    lastValue = null;
  }

  function renderSheet(item) {
    sheetContent.innerHTML = '';
    var alreadyRemoved = !!item.removedAt;

    var name = document.createElement('h2');
    name.className = 'item-sheet-name';
    name.textContent = item.name;
    sheetContent.appendChild(name);

    var meta = document.createElement('div');
    meta.className = 'item-sheet-meta';
    if (item.category) {
      meta.appendChild(storageBase.buildCategoryBadge(item.category));
    }
    var amt = document.createElement('span');
    amt.textContent = item.amount + ' ' + item.unit;
    meta.appendChild(amt);
    sheetContent.appendChild(meta);

    if (item.expiryDate) {
      var expiry = document.createElement('div');
      expiry.className = 'item-card-expiry';
      expiry.textContent = 'Expires ' + item.expiryDate;
      sheetContent.appendChild(expiry);
    }

    if (item.notes) {
      var notes = document.createElement('p');
      notes.className = 'item-sheet-notes';
      notes.textContent = item.notes;
      sheetContent.appendChild(notes);
    }

    if (alreadyRemoved) {
      var warn = document.createElement('p');
      warn.className = 'item-sheet-warning';
      warn.textContent = 'This item was already removed.';
      sheetContent.appendChild(warn);
    }

    var idEl = document.createElement('div');
    idEl.className = 'item-sheet-id';
    idEl.textContent = item.id;
    sheetContent.appendChild(idEl);

    // No Remove action for an item that's already removed — nothing left
    // to confirm, so the sticky bar collapses to a single "Close".
    sheetRemove.hidden = alreadyRemoved;
    sheetCancel.textContent = alreadyRemoved ? 'Close' : 'Cancel';
  }

  sheetCancel.addEventListener('click', closeSheet);

  sheetRemove.addEventListener('click', function () {
    if (!currentItem) return;
    var target = currentItem;
    sheetRemove.disabled = true;
    sheetRemove.textContent = 'Removing…';
    storageBase.call('remove', { id: target.id }).then(function (res) {
      if (storageBase.handleAuthFailure(res)) return;
      if (!res.ok) {
        storageBase.toast(
          res.error === 'already_removed' ? 'This item is no longer available.' : 'Could not remove that item.',
          { type: 'error' }
        );
        if (currentItem === target) closeSheet();
        return;
      }
      // Plain copy per planning5 — no "logged in History" mention.
      storageBase.toast(res.item.name + ' removed.');
      markRecentRemoved(res.item.id);
      if (currentItem === target) closeSheet();
    }).catch(function (err) {
      storageBase.toast(err.message || 'Could not reach the backend.', { type: 'error' });
    }).finally(function () {
      // Stale response for a sheet the user already left (e.g. Cancel,
      // then scanned a different item before this resolved) — don't
      // touch the shared Remove button on someone else's sheet.
      if (currentItem === target) {
        sheetRemove.disabled = false;
        sheetRemove.textContent = 'Remove';
      }
    });
  });

  // ---- Recent scans ----
  function addRecentScan(item) {
    recentScans = recentScans.filter(function (i) { return i.id !== item.id; });
    recentScans.unshift(item);
    if (recentScans.length > RECENT_LIMIT) recentScans.length = RECENT_LIMIT;
    renderRecent();
  }

  function markRecentRemoved(id) {
    var entry = recentScans.filter(function (i) { return i.id === id; })[0];
    if (entry) entry.removedAt = new Date().toISOString();
    renderRecent();
  }

  function renderRecent() {
    recentList.innerHTML = '';
    if (recentScans.length === 0) {
      var p = document.createElement('p');
      p.className = 'placeholder';
      p.textContent = 'Scanned items will appear here.';
      recentList.appendChild(p);
      return;
    }
    recentScans.forEach(function (item) {
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'recent-row' + (item.removedAt ? ' recent-row-removed' : '');

      var name = document.createElement('span');
      name.className = 'recent-row-name';
      name.textContent = item.name;
      row.appendChild(name);

      var meta = document.createElement('span');
      meta.className = 'recent-row-meta';
      meta.textContent = item.removedAt ? 'Removed' : item.amount + ' ' + item.unit;
      row.appendChild(meta);

      // Re-fetch fresh rather than trusting this cached entry — another
      // device may have acted on it since it was scanned (no live sync).
      row.addEventListener('click', function () {
        lookupAndOpen(item.id);
      });
      recentList.appendChild(row);
    });
  }

  storageBase.onViewShown('scan', startCamera);
  storageBase.onViewHidden('scan', stopCamera);

  renderRecent();
})();
