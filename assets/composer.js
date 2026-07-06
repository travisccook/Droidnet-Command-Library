/*! droidnet hosted site — composer page glue. */
(function () {
  'use strict';

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () {
        return legacyCopy(text);
      });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var host = document.getElementById('composer');
    var out = document.getElementById('out');
    var counter = document.getElementById('counter');
    var errzone = document.getElementById('errzone');
    var copyBtn = document.getElementById('copy');
    var importInput = document.getElementById('import');
    var importBtn = document.getElementById('import-btn');
    var Boot = window.DroidNetComposerBoot;
    var UI = window.DroidNetCommandLibraryUI;

    var current = '';

    function syncOutput(v) {
      current = v || '';
      out.textContent = current;
      counter.textContent = current.length + ' chars';
    }

    function mount(value) {
      UI.renderComposer(host, value || '', { onChange: syncOutput });
      syncOutput(value || '');
    }

    copyBtn.addEventListener('click', function () {
      copyText(current).then(function (ok) {
        copyBtn.textContent = ok ? 'Copied!' : 'Copy failed';
        copyBtn.classList.toggle('is-ok', !!ok);
        setTimeout(function () {
          copyBtn.textContent = 'Copy';
          copyBtn.classList.remove('is-ok');
        }, 1200);
      });
    });

    function doImport() { mount(importInput.value.trim()); }
    importBtn.addEventListener('click', doImport);
    importInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doImport(); });

    Boot.load().then(function (info) {
      var badge = document.getElementById('libver');
      if (badge) badge.textContent = 'library v' + info.libraryVersion;
      var seed = '';
      try { seed = new URLSearchParams(location.search).get('s') || ''; } catch (e) {}
      mount(seed);
    }).catch(function (err) { Boot.renderError(errzone, err); });
  });
})();
