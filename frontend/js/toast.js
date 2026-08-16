(function () {
  var container = document.getElementById('toast-container');
  var DURATION = 4000;

  // Top-anchored, stacking, auto-dismiss with a visible draining bar,
  // tap-to-dismiss — per ../_prd/planning5 "Feedback & notifications".
  function showToast(message, opts) {
    opts = opts || {};
    var el = document.createElement('div');
    el.className = 'toast' + (opts.type === 'error' ? ' toast-error' : '');
    el.style.setProperty('--toast-duration', DURATION + 'ms');

    var text = document.createElement('div');
    text.className = 'toast-text';
    text.textContent = message;

    var bar = document.createElement('div');
    bar.className = 'toast-bar';

    el.appendChild(text);
    el.appendChild(bar);
    container.appendChild(el);

    var dismissed = false;
    var timer = setTimeout(dismiss, DURATION);

    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      clearTimeout(timer);
      el.classList.add('toast-out');
      setTimeout(function () {
        if (el.parentNode) el.remove();
      }, 200);
    }

    el.addEventListener('click', dismiss);
  }

  window.storageBase = Object.assign(window.storageBase || {}, {
    toast: showToast
  });
})();
