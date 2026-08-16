(function () {
  var storageBase = window.storageBase;

  var stateEl = document.getElementById('hist-list-state');
  var listEl = document.getElementById('hist-list');

  // Stale-while-revalidate, same as inventory.js's loadItems() — only
  // the first load shows the loading state; every re-entry after that
  // keeps showing what's already rendered and refetches quietly in the
  // background.
  var hasLoadedOnce = false;

  function loadHistory() {
    if (!hasLoadedOnce) setState('loading');
    storageBase.call('history').then(function (res) {
      if (storageBase.handleAuthFailure(res)) return;
      if (!res.ok) {
        if (!hasLoadedOnce) setState('error');
        return;
      }
      hasLoadedOnce = true;
      render(res.items || []);
    }).catch(function () {
      if (!hasLoadedOnce) setState('error');
    });
  }

  function setState(kind) {
    if (!kind) {
      stateEl.hidden = true;
      listEl.hidden = false;
      return;
    }

    if (kind === 'loading') {
      stateEl.hidden = true;
      listEl.hidden = false;
      listEl.innerHTML = '';
      return;
    }

    listEl.hidden = true;
    listEl.innerHTML = ''; // don't leave stale rows behind a hidden container — see loadHistory()'s stale-while-revalidate note
    stateEl.hidden = false;
    stateEl.innerHTML = '';

    var p = document.createElement('p');
    p.className = 'placeholder';
    stateEl.appendChild(p);

    if (kind === 'error') {
      p.textContent = 'Could not load history.';
      var retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn btn-secondary';
      retry.textContent = 'Retry';
      retry.addEventListener('click', loadHistory);
      stateEl.appendChild(retry);
    } else if (kind === 'empty') {
      p.textContent = 'No removed items yet.';
    }
  }

  function formatRemovedDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function render(items) {
    if (items.length === 0) {
      setState('empty');
      return;
    }
    setState(null);

    listEl.innerHTML = '';
    items.forEach(function (item) {
      listEl.appendChild(buildRow(item));
    });
  }

  function buildRow(item) {
    var tr = document.createElement('tr');
    tr.className = 'inv-row hist-row';

    var nameTd = document.createElement('td');
    nameTd.className = 'inv-row-name';
    nameTd.textContent = item.name || '';
    tr.appendChild(nameTd);

    var catTd = document.createElement('td');
    if (item.category) {
      catTd.appendChild(storageBase.buildCategoryBadge(item.category, { small: true }));
    }
    tr.appendChild(catTd);

    var amtTd = document.createElement('td');
    amtTd.textContent = item.amount + ' ' + item.unit;
    tr.appendChild(amtTd);

    var removedTd = document.createElement('td');
    removedTd.className = 'inv-row-expiry';
    removedTd.textContent = formatRemovedDate(item.removedAt);
    tr.appendChild(removedTd);

    var actionTd = document.createElement('td');
    actionTd.className = 'hist-row-action';
    var restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.className = 'btn btn-secondary';
    restoreBtn.textContent = 'Restore';
    restoreBtn.addEventListener('click', function () {
      restore(item, restoreBtn);
    });
    actionTd.appendChild(restoreBtn);
    tr.appendChild(actionTd);

    return tr;
  }

  // Undoes an accidental Remove — clears removedAt server-side, puts the
  // item back in active Inventory. No confirmation step: unlike Delete
  // this is fully reversible (Remove it again).
  function restore(item, btn) {
    btn.disabled = true;
    btn.textContent = 'Restoring…';
    storageBase.call('restore', { id: item.id }).then(function (res) {
      if (storageBase.handleAuthFailure(res)) return;
      if (!res.ok) {
        // Same distinction Delete/Remove already make — if another
        // device deleted it outright (not just left it removed), it's
        // gone for good; refresh so the phantom row doesn't just sit
        // there, unrestorable, forever.
        storageBase.toast(
          res.error === 'not_found' ? 'This item is no longer available.' : 'Could not restore that item.',
          { type: 'error' }
        );
        if (res.error === 'not_found') {
          loadHistory();
          return;
        }
        btn.disabled = false;
        btn.textContent = 'Restore';
        return;
      }
      storageBase.toast((item.name || 'Item') + ' restored.');
      loadHistory();
    }).catch(function (err) {
      storageBase.toast(err.message || 'Could not reach the backend.', { type: 'error' });
      btn.disabled = false;
      btn.textContent = 'Restore';
    });
  }

  // Refreshes every time History becomes the visible view — an item
  // removed elsewhere in the same session (mobile Scan, desktop Inventory)
  // needs to show up without a full reload, same pattern as Inventory's
  // own onViewShown refresh.
  storageBase.onViewShown('history', loadHistory);
})();
