# Hosted Command Composer + Board Reference — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-page GitHub Pages site (composer + searchable board reference) that lets anyone build a serial command string in the browser and copy it out.

**Architecture:** Static files served from the repo root. The pages load the canonical `src/droidnet-command-library.js` (+ the UI module on the composer page) directly and `fetch()` the real `libraries/manifest.json` + boards — no build, no bundler, no vendored copies. A shared `assets/boot.js` loads the library; `composer.js` drives `renderComposer` + copy-out + paste-import; `reference.js` builds the catalog from the engine's read API; `assets/app.css` supplies the polished dark theme and the styling the composer expects a host to provide.

**Tech Stack:** Plain HTML/CSS/ES5-compatible browser JS (UMD globals), the existing engine + UI modules, Jest for the two smoke tests, GitHub Pages (branch = `main`, folder = `/` root).

## Global Constraints

- **No build step, no dependencies.** No CDN, no Bootstrap, no external fonts/scripts. `app.css` must fully style every class the composer emits itself. (Repo ethos: "the browser loads the two `src/*.js` files directly.")
- **Serve from repo root.** Pages reference `src/…`, `libraries/…`, and `assets/…` with root-relative paths. A `.nojekyll` file at root disables Jekyll.
- **Reference canonical files — never copy `src/` or `libraries/`.** Zero drift; a merged board JSON updates the live site with no site change.
- **Only existing files modified are docs** (`README.md` + one cross-link in `docs/INTEGRATION_GUIDE.md`). No engine/UI/schema/library/test-harness code changes.
- **No `libraryVersion` bump, no `releases.json` change** — this is app-layer.
- **Copy the raw wire string as-is** — no prefix/wrapping/newline machinery in v1.
- **CI must stay green on Node 20:** `npm run validate` then `npm test`. New Jest file lives under `test/`; browser JS lives under `assets/` (Jest ignores it).
- **Composer classes to style (authoritative, from `src/droidnet-command-library-ui.js`):** `wcb-builder`, `wcb-builder-head`, `wcb-steps`, `wcb-step` (+`.editing`), `wcb-grip`, `wcb-step-board` (+`.raw`), `wcb-step-name`, `wcb-step-token`, `wcb-step-actions`, `wcb-icon-btn` (+`.danger`), `wcb-step-edit`, `wcb-step-remove`, `wcb-empty`, `wcb-delay-ms`, `wcb-note-text`, `wcb-addbar`, `add-lbl`, `wcb-book`, `wcb-cmd`, `wcb-params`, `wcb-param`, `wcb-duration`, `wcb-insert`, `wcb-cancel`, `wcb-foot`, `wcb-add-delay`, `wcb-add-note`, `spacer`, `wcb-safety`, `wcb-len`, `lbl`, and generic `btn` / `btn-sm` / `btn-primary` / `btn-secondary` / `form-control`.

---

## File structure

| File | Responsibility |
|---|---|
| `index.html` (create) | Composer page shell + script includes |
| `reference.html` (create) | Reference page shell + script includes |
| `assets/boot.js` (create) | Shared loader: `load()` → fetch manifest+boards → `loadLibrary`; `renderError()` |
| `assets/composer.js` (create) | Composer glue: `renderComposer` + Copy + live output + paste-import + `?s=` |
| `assets/reference.js` (create) | Reference glue: build catalog from `getComponents/getCommands/getEnum` + search |
| `assets/app.css` (create) | Polished dark theme + full composer class styling |
| `.nojekyll` (create) | Disable Jekyll on Pages |
| `test/web.test.js` (create) | Smoke tests: html script-wiring + reference data contract |
| `README.md` (modify) | "Hosted composer" section |
| `docs/INTEGRATION_GUIDE.md` (modify) | One-line cross-link to the hosted site |

---

## Task 1: Page shells, `.nojekyll`, and the html-wiring smoke test

**Files:**
- Create: `index.html`, `reference.html`, `.nojekyll`
- Test: `test/web.test.js`

**Interfaces:**
- Produces: two root pages whose script tags reference `src/droidnet-command-library.js`, `src/droidnet-command-library-ui.js` (composer only), `assets/boot.js`, `assets/composer.js` / `assets/reference.js`, and `assets/app.css`. Element ids consumed by later tasks: `#composer`, `#out`, `#counter`, `#copy`, `#import`, `#import-btn`, `#errzone`, `#libver` (composer); `#catalog`, `#search`, `#errzone`, `#libver` (reference).

- [ ] **Step 1: Write the failing wiring test**

Create `test/web.test.js`:

```javascript
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }

describe('hosted site — html wiring', () => {
  test('index.html loads engine, UI module, page scripts, and css', () => {
    const html = read('index.html');
    expect(html).toContain('src/droidnet-command-library.js');
    expect(html).toContain('src/droidnet-command-library-ui.js');
    expect(html).toContain('assets/boot.js');
    expect(html).toContain('assets/composer.js');
    expect(html).toContain('assets/app.css');
    // required mount/anchor ids
    ['composer', 'out', 'counter', 'copy', 'import', 'import-btn', 'errzone', 'libver']
      .forEach(id => expect(html).toContain('id="' + id + '"'));
  });

  test('reference.html loads engine, boot, reference script, and css', () => {
    const html = read('reference.html');
    expect(html).toContain('src/droidnet-command-library.js');
    expect(html).toContain('assets/boot.js');
    expect(html).toContain('assets/reference.js');
    expect(html).toContain('assets/app.css');
    ['catalog', 'search', 'errzone', 'libver']
      .forEach(id => expect(html).toContain('id="' + id + '"'));
    // reference page must NOT need the UI module
    expect(html).not.toContain('droidnet-command-library-ui.js');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx jest test/web.test.js -t "html wiring"`
Expected: FAIL — `ENOENT ... index.html` (files don't exist yet).

- [ ] **Step 3: Create `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DroidNet Command Composer</title>
  <link rel="stylesheet" href="assets/app.css">
</head>
<body>
  <header class="dn-nav">
    <span class="dn-brand">DroidNet <b>Command Composer</b></span>
    <span id="libver" class="dn-badge dn-ver"></span>
    <nav class="dn-links">
      <a href="index.html" class="active">Composer</a>
      <a href="reference.html">Reference</a>
    </nav>
  </header>

  <main class="dn-main">
    <div id="errzone"></div>

    <section class="dn-pane">
      <div id="composer"></div>
    </section>

    <section class="dn-out">
      <div class="dn-out-head">
        <span>Serial string</span>
        <span id="counter" class="dn-badge"></span>
      </div>
      <code id="out" class="dn-out-box" aria-live="polite"></code>
      <div class="dn-out-actions">
        <button id="copy" class="btn btn-primary" type="button">Copy</button>
      </div>
      <label class="dn-import">
        <span>Paste a string to edit</span>
        <span class="dn-import-row">
          <input id="import" class="form-control" type="text" placeholder="A0T1^HPF0002…">
          <button id="import-btn" class="btn btn-secondary btn-sm" type="button">Load</button>
        </span>
      </label>
    </section>
  </main>

  <script src="src/droidnet-command-library.js"></script>
  <script src="src/droidnet-command-library-ui.js"></script>
  <script src="assets/boot.js"></script>
  <script src="assets/composer.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create `reference.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DroidNet Board Reference</title>
  <link rel="stylesheet" href="assets/app.css">
</head>
<body>
  <header class="dn-nav">
    <span class="dn-brand">DroidNet <b>Board Reference</b></span>
    <span id="libver" class="dn-badge dn-ver"></span>
    <nav class="dn-links">
      <a href="index.html">Composer</a>
      <a href="reference.html" class="active">Reference</a>
    </nav>
  </header>

  <main class="dn-main">
    <div id="errzone"></div>
    <div class="dn-search">
      <input id="search" class="form-control" type="search"
             placeholder="Search boards, commands, templates…" aria-label="Search commands">
    </div>
    <div id="catalog" class="dn-catalog"></div>
  </main>

  <script src="src/droidnet-command-library.js"></script>
  <script src="assets/boot.js"></script>
  <script src="assets/reference.js"></script>
</body>
</html>
```

- [ ] **Step 5: Create `.nojekyll`** (empty file)

```bash
touch .nojekyll
```

- [ ] **Step 6: Run the wiring test and confirm it passes**

Run: `npx jest test/web.test.js -t "html wiring"`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add index.html reference.html .nojekyll test/web.test.js
git commit -m "feat(site): page shells + .nojekyll + html-wiring smoke test"
```

---

## Task 2: `assets/boot.js` loader + reference data-contract test

**Files:**
- Create: `assets/boot.js`
- Test: add a `describe` block to `test/web.test.js`

**Interfaces:**
- Produces `window.DroidNetComposerBoot` with:
  - `load(opts?) → Promise<{ libraryVersion, manifest, boards }>` — `opts.basePath` defaults to `'libraries/'`.
  - `renderError(targetEl, err)` — writes an inline error banner into `targetEl`.
- Consumes: `window.DroidNetCommandLibrary.loadLibrary(boards, { libraryVersion })`, `fetch`.

- [ ] **Step 1: Write the failing data-contract test**

Append to `test/web.test.js`. Two assertions the reference page depends on:
(1) every command exposes a first example (shown on the card + used as the "Try
in composer" seed); (2) examples for **fully-bounded** commands (every param is
an `enum` or `int`) parse back to a recognized command step. Free-text params
(e.g. `chirp.pvoice`'s `{filename}`) legitimately can't round-trip through the
matcher and land as an editable raw step in the composer — so they are excluded
from (2) by construction, which also keeps the test robust as new free-text
commands are added.

```javascript
const { readCatalog } = require('../src/load-node.js');
function loadEngine() { jest.resetModules(); return require('../src/droidnet-command-library.js'); }

describe('hosted site — reference data contract', () => {
  let cb;
  beforeEach(() => {
    cb = loadEngine();
    const { manifest, boards } = readCatalog();
    cb.loadLibrary(boards.map(b => JSON.parse(JSON.stringify(b))), { libraryVersion: manifest.libraryVersion });
  });

  const isBounded = (cmd) => (cmd.params || []).every(p => p.enum || p.type === 'int');

  test('every command exposes a first example (card + Try-in-composer seed)', () => {
    const missing = [];
    for (const comp of cb.getComponents())
      for (const cmd of cb.getCommands(comp.id))
        if (!(cmd.examples && cmd.examples[0])) missing.push(cmd.id);
    expect(missing).toEqual([]);
  });

  test('examples for fully-bounded commands round-trip to a recognized step', () => {
    const bad = [];
    for (const comp of cb.getComponents())
      for (const cmd of cb.getCommands(comp.id)) {
        if (!isBounded(cmd)) continue;                 // free-text arg (e.g. chirp.pvoice) → editable raw step, skip
        const ex = cmd.examples && cmd.examples[0];
        if (!ex) continue;                              // presence covered above
        const steps = cb.parseWCBValue(ex);
        if (!steps.some(s => s.commandId && cb.getCommand(s.commandId))) bad.push(cmd.id + ' -> ' + ex);
      }
    expect(bad).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it passes already**

Run: `npx jest test/web.test.js -t "reference data contract"`
Expected: PASS (2 tests) — verified against the current catalog: 42 commands, 0
missing examples; 41 fully-bounded commands all round-trip, 1 free-text command
(`chirp.pvoice`) correctly excluded from (2). (If (1) fails, a board is missing
an example; if (2) fails, a bounded command has a bogus example — fix the board
JSON, not this test.)

- [ ] **Step 3: Create `assets/boot.js`**

```javascript
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
    el.innerHTML = '<div class="dn-error" role="alert">Couldn’t load the command library — '
      + esc(msg) + '. Try reloading.</div>';
  }

  root.DroidNetComposerBoot = { load: load, renderError: renderError };
})(typeof window !== 'undefined' ? window : this);
```

- [ ] **Step 4: Run the whole new test file**

Run: `npx jest test/web.test.js`
Expected: PASS (all 3 tests). `boot.js` is browser-only, so it is exercised by live verification, not Jest.

- [ ] **Step 5: Commit**

```bash
git add assets/boot.js test/web.test.js
git commit -m "feat(site): shared boot.js loader + reference data-contract test"
```

---

## Task 3: `assets/composer.js` — composer glue

**Files:**
- Create: `assets/composer.js`

**Interfaces:**
- Consumes: `window.DroidNetComposerBoot.load/renderError`, `window.DroidNetCommandLibraryUI.renderComposer(host, value, { onChange })`, DOM ids from Task 1.
- Behavior: seeds from `?s=`, keeps `#out`/`#counter` synced via `onChange`, Copy button (clipboard + fallback), paste-to-import re-mounts the composer.

- [ ] **Step 1: Create `assets/composer.js`**

```javascript
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
        var prev = copyBtn.textContent;
        copyBtn.textContent = ok ? 'Copied!' : 'Copy failed';
        copyBtn.classList.toggle('is-ok', !!ok);
        setTimeout(function () {
          copyBtn.textContent = prev;
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
```

- [ ] **Step 2: Live-verify (this task's test cycle)**

```bash
python3 -m http.server 8099 --directory "$(git rev-parse --show-toplevel)"
```
Then in a browser at `http://localhost:8099/index.html`:
- Expected: no console errors; `library v2.1.0` badge shows; composer renders an "Add" bar.
- Add a step (e.g. MagicPanel ▸ Run Mode ▸ Scream) → Expected: `#out` shows a token like `T6`; counter updates.
- Click **Copy** → Expected: button flashes "Copied!"; paste elsewhere yields the same string.
- Type `T6^T0` into the import box, click **Load** → Expected: composer rebuilds two recognized MagicPanel steps and `#out` shows `T6^T0`.
- Open `http://localhost:8099/index.html?s=T6%5ET0` → Expected: composer loads pre-seeded with those two steps.

- [ ] **Step 3: Commit**

```bash
git add assets/composer.js
git commit -m "feat(site): composer page glue (renderComposer + copy + import + ?s=)"
```

---

## Task 4: `assets/reference.js` — searchable catalog

**Files:**
- Create: `assets/reference.js`

**Interfaces:**
- Consumes: `window.DroidNetComposerBoot`, `window.DroidNetCommandLibrary.getComponents/getCommands/getEnum`, DOM ids `#catalog`, `#search`, `#errzone`, `#libver`.
- A command's fields used: `id`, `name`, `template`, `safety`, `supportsDuration`, `examples[0]`, `params[]` (each `{ name, enum? , min?, max? }`). A component's fields used: `id`, `name`, `kind`, `confidence`.

- [ ] **Step 1: Create `assets/reference.js`**

```javascript
/*! droidnet hosted site — reference page glue. */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var root = document.getElementById('catalog');
    var search = document.getElementById('search');
    var errzone = document.getElementById('errzone');
    var Boot = window.DroidNetComposerBoot;
    var E = window.DroidNetCommandLibrary;

    function paramDesc(p) {
      if (p.enum) {
        var vals = (E.getEnum(p.enum) || { values: [] }).values || [];
        var opts = vals.map(function (v) { return esc(v.code) + '=' + esc(v.label); }).join(', ');
        return '<b>' + esc(p.name) + '</b>: ' + opts;
      }
      var rng = [];
      if (p.min !== undefined) rng.push('min ' + esc(p.min));
      if (p.max !== undefined) rng.push('max ' + esc(p.max));
      return '<b>' + esc(p.name) + '</b>: int' + (rng.length ? ' (' + rng.join(', ') + ')' : '');
    }

    function cmdHtml(boardName, cmd) {
      var ex = (cmd.examples && cmd.examples[0]) || '';
      var params = (cmd.params || []).map(function (p) { return '<li>' + paramDesc(p) + '</li>'; }).join('');
      var hay = (boardName + ' ' + cmd.name + ' ' + cmd.id + ' ' + (cmd.template || '')).toLowerCase();
      var badges = '<span class="dn-badge dn-safety-' + esc(cmd.safety || 'cosmetic') + '">' + esc(cmd.safety || '') + '</span>'
        + (cmd.supportsDuration ? '<span class="dn-badge">duration</span>' : '');
      var foot = ex
        ? '<div class="dn-cmd-foot"><code class="dn-ex">' + esc(ex) + '</code>'
          + '<a class="dn-try" href="index.html?s=' + encodeURIComponent(ex) + '">Try in composer →</a></div>'
        : '';
      return '<div class="dn-cmd" data-hay="' + esc(hay) + '">'
        + '<div class="dn-cmd-head"><span class="dn-cmd-name">' + esc(cmd.name) + '</span>'
        + '<code class="dn-cmd-id">' + esc(cmd.id) + '</code>' + badges + '</div>'
        + '<code class="dn-tmpl">' + esc(cmd.template || '') + '</code>'
        + (params ? '<ul class="dn-params">' + params + '</ul>' : '')
        + foot + '</div>';
    }

    function render() {
      root.innerHTML = E.getComponents().map(function (c) {
        var rows = (E.getCommands(c.id) || []).map(function (cmd) { return cmdHtml(c.name, cmd); }).join('');
        return '<section class="dn-board">'
          + '<h2 class="dn-board-name">' + esc(c.name)
          + '<span class="dn-badge dn-conf-' + esc(c.confidence || '') + '">' + esc(c.confidence || '') + '</span>'
          + '<span class="dn-badge">' + esc(c.kind || '') + '</span></h2>'
          + rows + '</section>';
      }).join('');
    }

    function applyFilter() {
      var q = search.value.trim().toLowerCase();
      var cmds = root.querySelectorAll('.dn-cmd');
      for (var i = 0; i < cmds.length; i++) {
        var hay = cmds[i].getAttribute('data-hay');
        cmds[i].style.display = (!q || hay.indexOf(q) !== -1) ? '' : 'none';
      }
      var boards = root.querySelectorAll('.dn-board');
      for (var j = 0; j < boards.length; j++) {
        var visible = boards[j].querySelectorAll('.dn-cmd');
        var any = false;
        for (var k = 0; k < visible.length; k++) { if (visible[k].style.display !== 'none') { any = true; break; } }
        boards[j].style.display = any ? '' : 'none';
      }
    }

    Boot.load().then(function (info) {
      var badge = document.getElementById('libver');
      if (badge) badge.textContent = 'library v' + info.libraryVersion;
      render();
      search.addEventListener('input', applyFilter);
    }).catch(function (err) { Boot.renderError(errzone, err); });
  });
})();
```

- [ ] **Step 2: Live-verify (this task's test cycle)**

With the server from Task 3 running, open `http://localhost:8099/reference.html`:
- Expected: no console errors; `library v2.1.0` badge; one section per board (FlthyHPs, MagicPanel, RSeriesLogic, WCB·HCR, Maestro, PSIPro, HCR native, CHiRP), each listing commands with template, params, safety badge, example, and a "Try in composer →" link.
- Type `magic` in search → Expected: only the MagicPanel section remains visible.
- Clear search → Expected: all boards return.
- Click a "Try in composer →" link → Expected: lands on `index.html?s=…` with that command pre-seeded (confirms cross-page bridge).

- [ ] **Step 3: Commit**

```bash
git add assets/reference.js
git commit -m "feat(site): searchable board/command reference page"
```

---

## Task 5: `assets/app.css` — polished dark theme + composer styling

**Files:**
- Create: `assets/app.css`

**Interfaces:**
- Consumes: the class list in Global Constraints (composer classes + `dn-*` site chrome). No JS.
- Note: during execution, **invoke the frontend-design skill** to refine palette/typography; the CSS below is a complete, working baseline that already satisfies the styling contract.

- [ ] **Step 1: Create `assets/app.css`**

```css
/* droidnet hosted site — theme + composer styling. No external deps. */
:root {
  --bg: #0d1117; --panel: #161b22; --panel-2: #1c2330; --edge: #2a3340;
  --ink: #e6edf3; --muted: #9aa7b4; --accent: #4db8ff; --accent-2: #7ee787;
  --warn: #ffb454; --danger: #ff6b6b; --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--sans); line-height: 1.5; }

/* ---- nav ---- */
.dn-nav { display: flex; align-items: center; gap: 14px; padding: 12px 20px;
  background: linear-gradient(180deg, #12171f, var(--panel)); border-bottom: 1px solid var(--edge); }
.dn-brand { font-size: 1.05rem; letter-spacing: .3px; }
.dn-brand b { color: var(--accent); font-weight: 700; }
.dn-links { margin-left: auto; display: flex; gap: 6px; }
.dn-links a { color: var(--muted); text-decoration: none; padding: 6px 12px; border-radius: 8px; font-size: .92rem; }
.dn-links a:hover { color: var(--ink); background: var(--panel-2); }
.dn-links a.active { color: var(--bg); background: var(--accent); font-weight: 600; }

/* ---- layout ---- */
.dn-main { max-width: 920px; margin: 0 auto; padding: 22px 20px 60px; }
.dn-pane, .dn-out, .dn-board { background: var(--panel); border: 1px solid var(--edge); border-radius: 12px; }
.dn-pane { padding: 16px; }
.dn-out { margin-top: 18px; padding: 16px; }
.dn-out-head { display: flex; justify-content: space-between; align-items: center; color: var(--muted); font-size: .85rem; margin-bottom: 8px; }
.dn-out-box { display: block; font-family: var(--mono); font-size: .95rem; color: var(--accent-2);
  background: #0b0f14; border: 1px solid var(--edge); border-radius: 8px; padding: 12px; min-height: 44px;
  white-space: pre-wrap; word-break: break-all; }
.dn-out-actions { margin: 12px 0; }
.dn-import { display: block; margin-top: 8px; color: var(--muted); font-size: .85rem; }
.dn-import-row { display: flex; gap: 8px; margin-top: 6px; }
.dn-import-row .form-control { flex: 1; }

/* ---- badges / error ---- */
.dn-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: .72rem;
  background: var(--panel-2); color: var(--muted); border: 1px solid var(--edge); font-family: var(--mono); }
.dn-ver { color: var(--accent); }
.dn-safety-movement, .dn-safety-power { color: var(--warn); border-color: var(--warn); }
.dn-safety-config { color: var(--accent); border-color: var(--accent); }
.dn-conf-community { color: var(--warn); border-color: var(--warn); }
.dn-conf-low { color: var(--danger); border-color: var(--danger); }
.dn-error { background: #2a1417; border: 1px solid var(--danger); color: #ffd7d7;
  padding: 12px 14px; border-radius: 10px; }

/* ---- generic controls (Bootstrap-compat classes the composer emits) ---- */
.btn { font: inherit; cursor: pointer; border: 1px solid var(--edge); border-radius: 8px;
  padding: 8px 14px; background: var(--panel-2); color: var(--ink); }
.btn:hover { border-color: var(--accent); }
.btn-sm { padding: 4px 10px; font-size: .85rem; }
.btn-primary { background: var(--accent); border-color: var(--accent); color: #04121e; font-weight: 600; }
.btn-primary:hover { filter: brightness(1.08); }
.btn-secondary { background: var(--panel-2); }
.btn.is-ok { background: var(--accent-2); border-color: var(--accent-2); color: #06210c; }
.form-control { font: inherit; color: var(--ink); background: #0b0f14; border: 1px solid var(--edge);
  border-radius: 8px; padding: 7px 10px; }
.form-control:focus { outline: none; border-color: var(--accent); }

/* ---- composer (wcb-*) ---- */
.wcb-builder { display: flex; flex-direction: column; gap: 12px; }
.wcb-builder-head { display: flex; justify-content: space-between; align-items: center; color: var(--muted); font-size: .85rem; }
.wcb-builder-head .lbl { text-transform: uppercase; letter-spacing: .06em; }
.wcb-len { font-family: var(--mono); }
.wcb-steps { display: flex; flex-direction: column; gap: 8px; }
.wcb-empty { color: var(--muted); font-style: italic; padding: 10px; text-align: center;
  border: 1px dashed var(--edge); border-radius: 8px; }
.wcb-step { display: flex; align-items: center; gap: 10px; padding: 8px 10px;
  background: var(--panel-2); border: 1px solid var(--edge); border-radius: 10px; }
.wcb-step.editing { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(77,184,255,.18); }
.wcb-grip { cursor: grab; color: var(--muted); }
.wcb-step-board { font-size: .7rem; text-transform: uppercase; letter-spacing: .04em;
  padding: 2px 8px; border-radius: 6px; background: var(--accent); color: #04121e; font-weight: 700; }
.wcb-step-board.raw { background: var(--edge); color: var(--muted); }
.wcb-step-name { flex: 1; }
.wcb-step-token { font-family: var(--mono); color: var(--accent-2); background: #0b0f14;
  padding: 2px 8px; border-radius: 6px; }
.wcb-step-actions { display: flex; gap: 4px; }
.wcb-icon-btn { background: transparent; border: 1px solid transparent; color: var(--muted);
  cursor: pointer; border-radius: 6px; padding: 4px 7px; font-size: .95rem; }
.wcb-icon-btn:hover { color: var(--ink); border-color: var(--edge); }
.wcb-icon-btn.danger:hover { color: var(--danger); border-color: var(--danger); }
.wcb-delay-ms, .wcb-note-text { width: auto; }
.wcb-delay-ms { width: 90px; }
.wcb-addbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px;
  background: #0b0f14; border: 1px dashed var(--edge); border-radius: 10px; }
.wcb-addbar .add-lbl { color: var(--muted); font-size: .85rem; }
.wcb-params { display: inline-flex; flex-wrap: wrap; gap: 8px; }
.wcb-foot { display: flex; align-items: center; gap: 8px; }
.wcb-foot .spacer { flex: 1; }
.wcb-safety { color: var(--warn); font-size: .8rem; }

/* ---- reference ---- */
.dn-search { margin-bottom: 16px; }
.dn-search .form-control { width: 100%; font-size: 1rem; }
.dn-catalog { display: flex; flex-direction: column; gap: 18px; }
.dn-board { padding: 16px; }
.dn-board-name { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; font-size: 1.1rem; }
.dn-cmd { padding: 12px 0; border-top: 1px solid var(--edge); }
.dn-cmd:first-of-type { border-top: none; }
.dn-cmd-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dn-cmd-name { font-weight: 600; }
.dn-cmd-id, .dn-tmpl, .dn-ex { font-family: var(--mono); }
.dn-cmd-id { color: var(--muted); font-size: .8rem; }
.dn-tmpl { display: inline-block; margin: 6px 0; color: var(--accent); background: #0b0f14;
  padding: 2px 8px; border-radius: 6px; }
.dn-params { margin: 6px 0; padding-left: 18px; color: var(--muted); font-size: .88rem; }
.dn-params b { color: var(--ink); font-family: var(--sans); }
.dn-cmd-foot { display: flex; align-items: center; gap: 12px; margin-top: 6px; }
.dn-ex { color: var(--accent-2); background: #0b0f14; padding: 2px 8px; border-radius: 6px; }
.dn-try { color: var(--accent); text-decoration: none; font-size: .85rem; }
.dn-try:hover { text-decoration: underline; }

/* ---- responsive ---- */
@media (max-width: 560px) {
  .dn-nav { flex-wrap: wrap; }
  .dn-links { margin-left: 0; }
  .wcb-step { flex-wrap: wrap; }
}
```

- [ ] **Step 2: Live-verify styling**

Reload `http://localhost:8099/index.html` and `reference.html`:
- Expected: dark themed pages; composer steps, add-bar, buttons, output box all legibly styled (no unstyled Bootstrap remnants); reference badges colored by safety/confidence; layout holds at a narrow (mobile) width.

- [ ] **Step 3: (Optional) frontend-design refinement**

Invoke the frontend-design skill to refine typography/color if a more distinctive look is wanted. Re-verify visually after any change.

- [ ] **Step 4: Commit**

```bash
git add assets/app.css
git commit -m "feat(site): polished dark theme + full composer styling"
```

---

## Task 6: Docs + full test run + Pages enablement

**Files:**
- Modify: `README.md`, `docs/INTEGRATION_GUIDE.md`

**Interfaces:** none (docs + verification).

- [ ] **Step 1: Add a "Hosted composer" section to `README.md`**

Insert after the intro/usage section (adjust anchor to match the file):

```markdown
## Hosted composer

A ready-to-use visual composer and board reference are served straight from this
repo via GitHub Pages:

- **Composer** — <https://travisccook.github.io/droidnet-command-library/index.html>
- **Board reference** — <https://travisccook.github.io/droidnet-command-library/reference.html>

Build a sequence of steps, copy the resulting serial string, and paste it into
your WCB web config or a serial monitor. The pages load the engine and the
`libraries/` catalog directly, so a merged board JSON shows up on the site with
no separate deploy.

**Enabling Pages (maintainers):** Settings → Pages → *Deploy from a branch* →
`main` → `/` (root). The site is static (no build); a `.nojekyll` file keeps
Pages from processing files.
```

- [ ] **Step 2: Add a cross-link in `docs/INTEGRATION_GUIDE.md`**

Near the embedding/UI section, add one line:

```markdown
> A hosted, ready-to-use build of this composer + a searchable board reference is
> published via GitHub Pages — see the "Hosted composer" section in the README.
```

- [ ] **Step 3: Run the full CI-equivalent suite**

Run: `npm run validate && npm test`
Expected: validate passes; all Jest suites pass, including `test/web.test.js` (3 tests).

- [ ] **Step 4: Final end-to-end live verification**

With `python3 -m http.server 8099` running at repo root, confirm the full loop in a browser: compose → Copy → paste-import round-trips → reference search → "Try in composer" deep-link lands seeded. (This is the `verify` skill's end-to-end check.)

- [ ] **Step 5: Commit**

```bash
git add README.md docs/INTEGRATION_GUIDE.md
git commit -m "docs: document the hosted GitHub Pages composer + reference"
```

- [ ] **Step 6: Manual maintainer step (not code)**

After merge to `main`, enable Pages: Settings → Pages → *Deploy from a branch* → `main` → `/` (root). Verify the two public URLs load.

---

## Self-review notes

- **Spec §2 files** → Tasks 1–5 create every listed file; Task 6 does the doc edits. ✔
- **Spec §3 units/interfaces** → boot (`load`/`renderError`) Task 2; composer glue Task 3; reference glue Task 4; app.css contract Task 5. Signatures match across tasks (`DroidNetComposerBoot.load/renderError`, `renderComposer(host, value, { onChange })`). ✔
- **Spec §4 data flow / `?s=`** → Task 3 seed + Task 4 "Try in composer" link (`encodeURIComponent`/`decodeURIComponent` symmetric via `URLSearchParams`). ✔
- **Spec §5 error handling** → boot rejects + `renderError` banner (Tasks 2–4 `.catch`); clipboard fallback (Task 3); `parseWCBValue` raw-step degradation (Task 3 import). ✔
- **Spec §6 testing** → `test/web.test.js` wiring (Task 1) + data contract (Task 2); live verification steps in Tasks 3–6. ✔
- **Spec §7 docs / no version bump** → Task 6; no `libraryVersion`/`releases.json` touched anywhere. ✔
- **No placeholders**: every code step contains complete file contents. ✔
```
