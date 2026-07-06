/*! droidnet hosted site — shared library loader. Browser-only (uses fetch). */
(function (root) {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function load(opts) {
    opts = opts || {};
    var base = opts.basePath || 'libraries/';
    var engine = root.DroidNetCommandLibrary;
    if (!engine) return Promise.reject(new Error('engine script not loaded'));
    return fetch(base + 'manifest.json')
      .then(function (r) { if (!r.ok) throw new Error('manifest.json (' + r.status + ')'); return r.json(); })
      .then(function (manifest) {
        return Promise.all(manifest.boards.map(function (b) {
          return fetch(base + b.file).then(function (r) {
            if (!r.ok) throw new Error(b.file + ' (' + r.status + ')');
            return r.json();
          });
        })).then(function (boards) {
          engine.loadLibrary(boards, { libraryVersion: manifest.libraryVersion });
          return { libraryVersion: manifest.libraryVersion, manifest: manifest, boards: boards };
        });
      })
      .catch(function (err) {
        if (typeof console !== 'undefined') console.error('[droidnet] library load failed', err);
        throw err;
      });
  }

  function renderError(el, err) {
    if (!el) return;
    var msg = (err && err.message) ? err.message : String(err);
    el.innerHTML = '<div class="dn-error" role="alert">Couldn\'t load the command library - '
      + esc(msg) + '. Try reloading.</div>';
  }

  root.DroidNetComposerBoot = { load: load, renderError: renderError };
})(typeof window !== 'undefined' ? window : this);
