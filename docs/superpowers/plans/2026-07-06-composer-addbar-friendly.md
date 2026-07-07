# Composer Add bar — friendlier labels + wider layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every field in the visual composer's inline "Add" bar a clear caption of what it is, and widen the page so a full command (RSeries Logic Effect and its 5 params) fits on one row.

**Architecture:** Pure view change. Add two small pure helpers to the UI module (`humanize`, `captionFor`) and render each control inside a captioned `<label class="wcb-field">` cell. CSS turns the Add bar into a bottom-aligned flex row of caption-over-control cells and raises the page width cap. The engine and its public API are untouched.

**Tech Stack:** Dependency-free UMD JS (no build step), plain CSS, Jest (`testEnvironment: node`) for the pure-helper unit tests. Browser verification via loading `index.html`.

**Spec:** `docs/superpowers/specs/2026-07-06-composer-addbar-friendly-design.md`

## Global Constraints

- **No `libraryVersion` bump.** No catalog/board content changes → do NOT touch `libraries/manifest.json` or `releases.json`.
- **Keep the engine DOM-free and the UI logic-free.** New helpers are pure string functions; all encode/parse stays in the engine.
- **Preserve the public rendering hooks** the engine/UI already rely on: control classes `wcb-param`, `wcb-duration`, `wcb-book`, `wcb-cmd`, `wcb-insert`, `wcb-cancel` and the `data-param` attribute must remain on the same elements. `insertOrUpdate()` and the seed/edit round-trip must keep working unchanged.
- **Dependency-free, no build step** — the browser loads `src/*.js` directly; don't introduce imports/bundling.
- **Commit only the files listed in each task** (`git add <exact paths>`). The working tree has unrelated in-flight changes (`libraries/manifest.json`, `releases.json`, `test/engine.test.js`, `test/load-node.test.js` from roam-a-dome work) — never stage those.
- **Commit trailer** (append to every commit message):
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01KUrBBn2vjQQz8aLvx28Qmf
  ```

---

### Task 1: Caption helpers + captioned param cells

Add pure `humanize` and `captionFor` helpers, export them for testing, and make `paramControl` return a captioned `<label>` cell instead of a bare control.

**Files:**
- Modify: `src/droidnet-command-library-ui.js` (add helpers near `esc` ~line 36; rewrite `paramControl` ~lines 206-218; add `fieldCell` inside `renderComposer`; extend the returned object ~line 301)
- Test: `test/ui-caption.test.js` (create)

**Interfaces:**
- Produces:
  - `humanize(name: string): string` — split camelCase and `_`/`-` into words, Title-Case them. `"speed"→"Speed"`, `"scrollSpeed"→"Scroll Speed"`.
  - `captionFor(param, getEnum): string` — `param.label` ?? (`param.enum` && `getEnum(param.enum).label`) ?? `humanize(param.name)`. `getEnum` is a `(name)=>enumObj|undefined` lookup.
  - `fieldCell(caption: string, controlHtml: string): string` — closure helper inside `renderComposer` returning `<label class="wcb-field"><span class="wcb-field-cap">…</span>…</label>`.
- Consumes: existing `esc`, `E().getEnum`.

- [ ] **Step 1: Write the failing test**

Create `test/ui-caption.test.js`:

```javascript
'use strict';
const UI = require('../src/droidnet-command-library-ui.js');

describe('humanize', () => {
  test('capitalizes a single lowercase word', () => {
    expect(UI.humanize('speed')).toBe('Speed');
    expect(UI.humanize('seconds')).toBe('Seconds');
  });
  test('splits camelCase into Title-Cased words', () => {
    expect(UI.humanize('scrollSpeed')).toBe('Scroll Speed');
  });
});

describe('captionFor', () => {
  const getEnum = (n) => ({
    'rseries.effect': { label: 'Effect' },
    'rseries.target': { label: 'Display' },
  })[n];

  test('prefers an explicit param.label', () => {
    expect(UI.captionFor({ name: 'x', label: 'Custom Name' }, getEnum)).toBe('Custom Name');
  });
  test('falls back to the enum label for enum params', () => {
    expect(UI.captionFor({ name: 'effect', enum: 'rseries.effect' }, getEnum)).toBe('Effect');
    expect(UI.captionFor({ name: 'target', enum: 'rseries.target' }, getEnum)).toBe('Display');
  });
  test('humanizes the param name for int params', () => {
    expect(UI.captionFor({ name: 'speed', type: 'int' }, getEnum)).toBe('Speed');
  });
  test('humanizes when the enum is absent or has no label', () => {
    expect(UI.captionFor({ name: 'target', enum: 'nope' }, getEnum)).toBe('Target');
    expect(UI.captionFor({ name: 'gain' }, getEnum)).toBe('Gain');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest test/ui-caption.test.js`
Expected: FAIL — `UI.humanize is not a function` (helpers not exported yet).

- [ ] **Step 3: Add the pure helpers**

In `src/droidnet-command-library-ui.js`, immediately after the `esc` definition (currently ~line 37, before `const MAX_VALUE_LEN`), add:

```javascript
  // "speed" → "Speed", "scrollSpeed" → "Scroll Speed". Param names are limited to
  // [A-Za-z][A-Za-z0-9]* by the schema, so this only needs camelCase handling.
  function humanize(name) {
    return String(name)
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  // Friendly caption for a param control: explicit label → enum's label → humanized name.
  // getEnum is a (name) => enumObject|undefined lookup (e.g. the engine's getEnum).
  function captionFor(p, getEnum) {
    if (p.label) return p.label;
    if (p.enum && getEnum) {
      const en = getEnum(p.enum);
      if (en && en.label) return en.label;
    }
    return humanize(p.name);
  }
```

- [ ] **Step 4: Rewrite `paramControl` to return a captioned cell**

Add a `fieldCell` helper inside `renderComposer` (place it just above `paramControl`, ~line 206):

```javascript
    function fieldCell(caption, controlHtml) {
      return `<label class="wcb-field"><span class="wcb-field-cap">${esc(caption)}</span>${controlHtml}</label>`;
    }
```

Replace the whole `paramControl` function body (currently ~lines 206-218) with:

```javascript
    function paramControl(p, cur) {
      const val = cur[p.name] !== undefined ? cur[p.name] : (p.default !== undefined ? p.default : '');
      const name = esc(p.name);
      const cap = captionFor(p, E().getEnum);
      let control;
      if (p.enum) {
        const en = E().getEnum(p.enum);
        const opts = ((en && en.values) || [])
          .map(v => `<option value="${esc(v.code)}"${String(v.code) === String(val) ? ' selected' : ''}>${esc(v.label)}</option>`).join('');
        control = `<select class="form-control wcb-param" data-param="${name}" aria-label="${esc(cap)}">${opts}</select>`;
      } else {
        const min = p.min !== undefined ? ` min="${p.min}"` : '';
        const max = p.max !== undefined ? ` max="${p.max}"` : '';
        control = `<input class="form-control wcb-param" data-param="${name}" aria-label="${esc(cap)}" type="number"${min}${max} value="${esc(val)}">`;
      }
      return fieldCell(cap, control);
    }
```

(The `title` and `placeholder="<name>"` attributes are dropped — the visible caption replaces them, and `aria-label` now carries the friendly caption.)

- [ ] **Step 5: Export the helpers**

Change the module's return (currently ~line 301) from:

```javascript
  return { renderComposer, stepLabel };
```

to:

```javascript
  return { renderComposer, stepLabel, humanize, captionFor };
```

- [ ] **Step 6: Run the unit test — verify it passes**

Run: `npx jest test/ui-caption.test.js`
Expected: PASS (all 6 tests green).

- [ ] **Step 7: Run the full suite — verify no regression**

Run: `npm test`
Expected: PASS. The engine/round-trip suites are unaffected (no engine change).

- [ ] **Step 8: Commit**

```bash
git add src/droidnet-command-library-ui.js test/ui-caption.test.js
git commit -m "feat(composer): add friendly captions above Add-bar param fields

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KUrBBn2vjQQz8aLvx28Qmf"
```

---

### Task 2: Caption the Board / Command / Duration cells

Wrap the Board and Command dropdowns and the optional duration input in the same `wcb-field` caption cells so the whole Add bar reads uniformly.

**Files:**
- Modify: `src/droidnet-command-library-ui.js` (`renderAddBar` innerHTML ~lines 258-265; the `supportsDuration` branch in `renderParams` ~lines 275-278)

**Interfaces:**
- Consumes: `fieldCell` (from Task 1), `esc`, `books`, `bookId`, `editing`.
- Produces: no new symbols; only markup changes. `.wcb-book`, `.wcb-cmd`, `.wcb-duration` remain queryable via `addbarEl.querySelector(...)`.

- [ ] **Step 1: Wrap Board and Command in caption cells**

In `renderAddBar`, replace the two bare `<select>` lines in the `addbarEl.innerHTML` template (the `.wcb-book` and `.wcb-cmd` selects, ~lines 260-262) so they read:

```javascript
        ${fieldCell('Board', `<select class="form-control wcb-book" aria-label="Board">${books
          .map(b => `<option value="${esc(b.id)}"${b.id === bookId ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select>`)}
        ${fieldCell('Command', `<select class="form-control wcb-cmd" aria-label="Command"></select>`)}
```

The surrounding `<span class="add-lbl">`, `<span class="wcb-params"></span>`, and the insert/cancel buttons stay exactly as they are.

- [ ] **Step 2: Caption the duration input**

In `renderParams`, replace the `supportsDuration` branch (currently ~lines 275-278):

```javascript
        if (cmd.supportsDuration) {
          const dv = (useSeed && s && s.commandId === cmd.id && s.duration != null) ? esc(s.duration) : '';
          html += `<input class="form-control wcb-duration" type="number" min="0" placeholder="secs" title="duration (s)" aria-label="duration in seconds" value="${dv}">`;
        }
```

with:

```javascript
        if (cmd.supportsDuration) {
          const dv = (useSeed && s && s.commandId === cmd.id && s.duration != null) ? esc(s.duration) : '';
          html += fieldCell('Duration', `<input class="form-control wcb-duration" type="number" min="0" aria-label="duration in seconds" value="${dv}">`);
        }
```

- [ ] **Step 3: Run the full suite — verify no regression**

Run: `npm test`
Expected: PASS. (No engine surface changed; the pure-helper test from Task 1 still passes.)

- [ ] **Step 4: Sanity-check the rendered markup in node**

Run:
```bash
node -e "const UI=require('./src/droidnet-command-library-ui.js'); console.log(typeof UI.captionFor==='function' && typeof UI.humanize==='function' ? 'helpers ok' : 'MISSING');"
```
Expected: `helpers ok`

- [ ] **Step 5: Commit**

```bash
git add src/droidnet-command-library-ui.js
git commit -m "feat(composer): caption Board, Command and Duration fields in Add bar

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KUrBBn2vjQQz8aLvx28Qmf"
```

---

### Task 3: CSS — caption cells, bottom-aligned Add bar, wider page

Style the new `wcb-field` cells, bottom-align the Add bar, narrow the number inputs, cap the long selects, widen the page, and keep it usable on small screens.

**Files:**
- Modify: `assets/app.css` (`.wcb-addbar`/`.wcb-params` block ~lines 86-89; `.dn-main` ~line 22; the `@media (max-width: 560px)` block ~lines 116-120)

**Interfaces:**
- Consumes: markup classes `wcb-field`, `wcb-field-cap`, `wcb-addbar`, `wcb-params`, `wcb-param`, `wcb-duration`, `wcb-book`, `wcb-cmd`, `add-lbl` (all produced by Tasks 1-2).

- [ ] **Step 1: Replace the Add-bar block**

In `assets/app.css`, replace the current block (lines 86-89):

```css
.wcb-addbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px;
  background: #0b0f14; border: 1px dashed var(--edge); border-radius: 10px; }
.wcb-addbar .add-lbl { color: var(--muted); font-size: .85rem; }
.wcb-params { display: inline-flex; flex-wrap: wrap; gap: 8px; }
```

with:

```css
.wcb-addbar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px 10px; padding: 12px;
  background: #0b0f14; border: 1px dashed var(--edge); border-radius: 10px; }
.wcb-addbar .add-lbl { color: var(--muted); font-size: .85rem; padding-bottom: 8px; }
/* let the param cells sit directly in the addbar flow so every field bottom-aligns */
.wcb-params { display: contents; }
.wcb-field { display: flex; flex-direction: column; gap: 3px; }
.wcb-field-cap { color: var(--muted); font-size: .72rem; letter-spacing: .02em; white-space: nowrap; }
.wcb-addbar .wcb-param[type="number"], .wcb-addbar .wcb-duration { width: 5rem; }
.wcb-book, .wcb-cmd { max-width: 16rem; }
```

- [ ] **Step 2: Widen the page**

Change `.dn-main` (line 22) from:

```css
.dn-main { max-width: 920px; margin: 0 auto; padding: 22px 20px 60px; }
```

to:

```css
.dn-main { max-width: 1200px; margin: 0 auto; padding: 22px 20px 60px; }
```

- [ ] **Step 3: Keep it usable on narrow screens**

In the `@media (max-width: 560px)` block (lines 116-120), add a `wcb-field` rule so each cell goes full width. The block becomes:

```css
@media (max-width: 560px) {
  .dn-nav { flex-wrap: wrap; }
  .dn-links { margin-left: 0; }
  .wcb-step { flex-wrap: wrap; }
  .wcb-field { flex: 1 1 100%; }
  .wcb-addbar .wcb-param, .wcb-addbar .wcb-duration, .wcb-book, .wcb-cmd { width: 100%; max-width: none; }
}
```

- [ ] **Step 4: Verify CSS is well-formed (brace balance)**

Run:
```bash
node -e "const c=require('fs').readFileSync('assets/app.css','utf8'); const o=(c.match(/{/g)||[]).length, x=(c.match(/}/g)||[]).length; console.log(o===x ? 'braces balanced ('+o+')' : 'UNBALANCED '+o+'/'+x);"
```
Expected: `braces balanced (…)`

- [ ] **Step 5: Commit**

```bash
git add assets/app.css
git commit -m "feat(composer): widen page to 1200px and lay Add bar out as captioned cells

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KUrBBn2vjQQz8aLvx28Qmf"
```

---

### Task 4 (optional): Document the `param.label` override in the schema

The UI already honours an optional `param.label`; document it in the schema for board authors. `param` already has `additionalProperties: true`, so this is documentation only — no validation behaviour changes.

**Files:**
- Modify: `schema/library.schema.json` (`$defs/param.properties`, ~lines 155-160)

**Interfaces:** none (schema doc only).

- [ ] **Step 1: Add the documented property**

In `schema/library.schema.json`, inside `"$defs": { "param": { "properties": { … } } }`, add a `label` property alongside `name` (immediately after the `"name": { … }` line ~156):

```json
        "label": { "type": "string", "description": "Optional friendly caption shown above this field in the composer. Overrides the enum label / humanized name." },
```

- [ ] **Step 2: Verify the schema still validates every board**

Run: `npm run validate`
Expected: PASS (structural + semantic checks all green).

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add schema/library.schema.json
git commit -m "docs(schema): document optional param.label caption override

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KUrBBn2vjQQz8aLvx28Qmf"
```

---

### Task 5: Browser verification

No automated DOM tests exist for the composer, so verify the rendered result in a browser. This is a gate, not a commit (unless it surfaces a fix).

**Files:** none (verification only).

- [ ] **Step 1: Serve the site locally**

Run (background): `python3 -m http.server 8848` from the repo root.
Open `http://localhost:8848/index.html`.

- [ ] **Step 2: Verify the RSeries row**

With the default board (RSeriesLogic) and "Logic Effect" command selected, confirm the Add bar shows captions **Board · Command · Effect · Color · Speed · Seconds · Display**, each above its control, and that the whole row sits on a single line at a typical desktop width (~1200px page). Values still read Normal / Default / 0 / 0 / All under their captions.

- [ ] **Step 3: Verify other boards + duration**

Switch the Board dropdown to a couple of others (e.g. FlthyHPs, and any board whose command sets `supportsDuration`). Confirm captions are sensible (enum labels where present, humanized names otherwise) and that a **Duration** caption appears above the seconds input when applicable.

- [ ] **Step 4: Verify round-trip still works**

Insert a step, confirm it appears in the step list with the correct serial token. Click the ✎ edit button — the Add bar pre-fills with the step's values under the right captions. Change a value, click Update, confirm the serial string updates. Paste a known string (e.g. `~RTLE10590`) into "Paste a string to edit" → Load, confirm it round-trips. The emitted serial string must be identical to pre-change behaviour.

- [ ] **Step 5: Verify narrow-screen behaviour**

Narrow the window below ~560px. Confirm the field cells wrap to full width and stack cleanly, nothing overflows horizontally, and the controls remain usable.

- [ ] **Step 6: Stop the server**

Stop the background `http.server`.

---

## Self-Review

**Spec coverage:**
- Caption resolution chain (`param.label` → enum label → humanize) → Task 1 (`captionFor`) ✓
- Captioned cells for params → Task 1 (`paramControl`/`fieldCell`); Board/Command/Duration → Task 2 ✓
- Bottom-aligned Add bar, `wcb-field`/`wcb-field-cap` styling, narrow-screen rule → Task 3 ✓
- `.dn-main` 920→1200px → Task 3 ✓
- Optional schema `param.label` doc → Task 4 ✓
- No `libraryVersion` bump / no board data change → Global Constraints (manifest/releases untouched) ✓
- Verification (browser, round-trip, narrow) → Task 5 ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/vague steps — every code step shows full code and every run step shows the exact command + expected output. ✓

**Type consistency:** `humanize`, `captionFor(p, getEnum)`, and `fieldCell(caption, controlHtml)` are named identically everywhere they appear (Tasks 1-3). The preserved control hooks (`wcb-param`, `wcb-duration`, `wcb-book`, `wcb-cmd`, `data-param`) match the engine/UI code that queries them. ✓
