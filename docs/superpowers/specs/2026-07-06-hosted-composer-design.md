# Hosted Command Composer + Board Reference (GitHub Pages)

**Status:** Approved design — ready for implementation planning
**Date:** 2026-07-06
**Scope:** Add a GitHub Pages site to `droidnet-command-library` that lets anyone
in the droid community visually build a serial command string, copy it out, and
browse a searchable reference of every board/command. No engine changes.

---

## 1. Goal & context

The repo already ships a pure engine (`src/droidnet-command-library.js`) and a
DOM visual composer (`src/droidnet-command-library-ui.js`,
`renderComposer(container, value, callbacks)`), and `INTEGRATION_GUIDE.md`
documents the browser embed pattern (fetch manifest → fetch boards →
`loadLibrary` → `renderComposer`). **Nothing mounts it** — there is no HTML in
the repo and no Pages setup.

This project wraps the existing composer in a hosted, two-page site:

- **Composer page** — build a sequence of steps and copy the resulting wire
  string to paste into a WCB web config field or a serial monitor.
- **Reference page** — a searchable catalog of every board and command.

The hard part (encode/parse/round-trip) already exists and is test-covered; this
is an app/presentation layer plus the CSS the composer expects a host to supply.

### Decisions already made (from brainstorming)

| Question | Decision |
|---|---|
| Scope | Composer page **+** board reference |
| Layout | **Two separate pages**, linked by a shared nav |
| Paste targets | WCB web config field + serial monitor → **copy the raw wire string as-is**; no prefix/wrapping/newline machinery in v1 |
| Design ambition | **Polished + on-theme** (dark, techy astromech/maker aesthetic, per-board color accents); driven with the frontend-design skill |
| Hosting | **GitHub Pages from repo root**, referencing the canonical `src/` + `libraries/` directly (Approach ①) |
| `?s=` deep-link param | **Keep it** — powers the reference→composer "Try in composer" bridge; doubles as a shareable link |
| Test footprint | Add **one lightweight node smoke test**; primary verification is live in-browser |

### Why hosting Approach ① (root, reference canonical files)

The pages load `src/*.js` directly and `fetch('libraries/...')` — the exact
pattern the README/INTEGRATION_GUIDE already document. Result: **no build, no
workflow, no vendored copies, zero drift.** Merging a board JSON to `main`
updates the live reference with no site change — a living catalog. This mirrors
the repo's stated ethos ("the browser loads the two `src/*.js` files directly").
The only cost is a few files at repo root, contained by an `assets/` folder.

Rejected alternatives: an Action that assembles a `/web` artifact (clean URLs
but a workflow to maintain, more moving parts for little gain at this size); a
self-contained `/docs` copy (vendored copies drift; `/docs` is for the markdown
guides).

---

## 2. Files added

All new; **the only existing files modified are docs** (a short README section
and a one-line cross-link in `INTEGRATION_GUIDE.md`). No engine, UI, schema,
library, or test-harness code is changed.

```
index.html            Composer page
reference.html        Board/command catalog page
assets/app.css        Polished dark theme + full styling for every class the composer emits
assets/boot.js        Shared library loader (fetch manifest + boards → loadLibrary); error banner on failure
assets/composer.js    Composer page glue (renderComposer + Copy + live output + paste-to-import + ?s=)
assets/reference.js   Reference page glue (build catalog from engine read API)
.nojekyll             Disable Jekyll so Pages serves files verbatim
```

Load order per page (UMD globals, no bundler):

- `index.html` → `src/droidnet-command-library.js`, `src/droidnet-command-library-ui.js`, `assets/boot.js`, `assets/composer.js`
- `reference.html` → `src/droidnet-command-library.js`, `assets/boot.js`, `assets/reference.js` (no UI module needed — read-only)

---

## 3. Units & interfaces

Each unit has one purpose, a defined interface, and is independently testable.

### 3.1 `assets/boot.js` — library loader (shared)

- **Does:** fetch `libraries/manifest.json`, then fetch each `manifest.boards[].file`
  (relative to `libraries/`), then call
  `DroidNetCommandLibrary.loadLibrary(boards, { libraryVersion })`.
- **Interface:** exposes two functions on `window.DroidNetComposerBoot`:
  - `load(opts?) → Promise<{ libraryVersion, manifest, boards }>` — `opts.basePath`
    defaults to `'libraries/'` (override for tests/subpath hosting).
  - `renderError(targetEl, err)` — renders an inline error banner ("Couldn't
    load the command library — &lt;reason&gt;. Try reloading.") into `targetEl`.
- **Depends on:** `window.DroidNetCommandLibrary`, `fetch`.
- **Errors:** `load()` **rejects** on any fetch/`loadLibrary` failure and
  `console.error`s. Each page's glue calls `.catch(e => renderError(main, e))`,
  so the shell stays intact (no blank screen). This keeps boot ignorant of page
  layout — the caller owns where the banner goes.

### 3.2 `assets/composer.js` — composer page glue

- **Does:** `boot()` → read `?s=` from `location.search` → `renderComposer(host, seed, { onChange })`
  → keep an output box + char counter in sync → wire the Copy button and the
  paste-to-import input.
- **Interface:** self-invoking on `DOMContentLoaded`; no exports.
- **Output box:** read-only `<code>` / textarea reflecting the current wire
  string. Updated by the `onChange(v)` callback and seeded once with the initial
  value.
- **Copy:** `navigator.clipboard.writeText(v)` with a hidden-textarea +
  `document.execCommand('copy')` fallback for insecure/older contexts; transient
  "Copied!" affordance; promise rejection handled (never throws to console-fatal).
- **Import:** a text input; on change/enter, re-render the composer with the
  pasted value. `parseWCBValue` never throws — unknown tokens degrade to raw
  steps, empty → empty composer.
- **`?s=`:** `decodeURIComponent(new URLSearchParams(location.search).get('s'))`
  seeds the initial composer value.

### 3.3 `assets/reference.js` — reference page glue

- **Does:** `boot()` → `getComponents()` → for each board render a section
  (name + `confidence` + `kind` badges) listing `getCommands(comp.id)`; per
  command show name, id, `template`, params (enum options via `getEnum(p.enum).values`
  or int `min`/`max`), `safety` badge, `supportsDuration`, and the first
  `command.examples` string as a copyable token with a **"Try in composer →"**
  link to `index.html?s=<encodeURIComponent(example)>`.
- **Interface:** self-invoking on `DOMContentLoaded`; no exports.
- **Search:** a client-side text filter over board name, command name/id, and
  template text. Hides non-matching commands/sections. No failure modes.

### 3.4 `assets/app.css` — theme + composer styling contract

Must fully style, with **no Bootstrap/CDN dependency**, every class the composer
emits (authoritative list extracted from `src/droidnet-command-library-ui.js` at
implementation time):

`wcb-builder`, `wcb-builder-head`, `wcb-steps`, `wcb-step` (+`.editing`),
`wcb-step-board` (+`.raw`), `wcb-step-name`, `wcb-step-token`,
`wcb-step-actions`, `wcb-icon-btn` (+`.danger`), `wcb-grip`, `wcb-addbar`,
`wcb-foot`, `wcb-len`, `wcb-safety`, `wcb-empty`, `wcb-book`, `wcb-cmd`,
`wcb-param`, `wcb-params`, `wcb-add-delay`, `wcb-add-note`, `wcb-insert`,
`wcb-cancel`, plus generic `btn` / `btn-sm` / `btn-primary` / `btn-secondary`
and `form-control`. Plus the site chrome (nav, output panel, reference catalog,
badges) and the polished dark theme with per-board accent colors. Responsive;
usable on a phone. This is the bulk of the implementation effort.

### 3.5 `index.html`, `reference.html` — page shells

Minimal semantic HTML: shared header/nav (title, `library vN` badge, cross-link),
a `<main>` mount point, `<script>` includes in the load order above. No inline
logic beyond the script tags.

---

## 4. Data flow

```
boot()  ── fetch libraries/manifest.json
        └─ Promise.all( fetch libraries/<board.file> )
        └─ DroidNetCommandLibrary.loadLibrary(boards, { libraryVersion })
        └─ resolve { libraryVersion, manifest, boards }

composer.js:  boot() → seed = ?s= or ''
              → UI.renderComposer(host, seed, { onChange: v => syncOutput(v) })
              → syncOutput(seed)                    // seed output box + counter
              Copy button → clipboard(currentValue)
              Import input → renderComposer(host, pasted, …)

reference.js: boot() → getComponents().forEach(comp =>
                 render section from getCommands(comp.id), getEnum(p.enum) )
              Search box → filter rendered rows
              "Try in composer" → index.html?s=<encoded first example>
```

The two pages never share in-memory state; the only cross-page channel is the
`?s=` query param. Each page loads its own engine instance and library copy —
cheap, and keeps the pages fully independent.

---

## 5. Error handling summary

| Failure | Behavior |
|---|---|
| manifest/board fetch fails, or `loadLibrary` throws | Inline error banner in the page; console.error; shell intact |
| Clipboard API unavailable/denied | Hidden-textarea `execCommand('copy')` fallback; if that fails, select the text so the user can copy manually |
| Pasted/`?s=` string unrecognized | `parseWCBValue` degrades to raw steps (lossless); no crash |
| Empty string | Empty composer, empty output, counter `0` |

---

## 6. Testing & verification

- **Existing coverage unchanged:** no engine/UI-module logic is added, so the
  jest suite (round-trip, encode/decode, per-board examples) still governs
  correctness.
- **New smoke test (`test/web.test.js`, lightweight, no new deps):**
  1. Assert `index.html` and `reference.html` exist and reference the canonical
     `src/droidnet-command-library.js` (and the UI module on the composer page)
     and load `assets/` scripts — guards against a broken `<script src>` path.
  2. Load the engine via the existing `loadEngine()` pattern and assert the two
     things the reference page relies on: (a) every command exposes a first
     `examples` string (shown on the card + used as the "Try in composer" seed);
     (b) examples for **fully-bounded** commands (every param is an `enum` or
     `int`) parse back to a recognized command step. Free-text params (e.g.
     `chirp.pvoice`'s `{filename}`) can't round-trip through the matcher and land
     as an editable raw step, so they're excluded from (b) by construction —
     which also keeps the test robust as new free-text commands are added.
     (Verified against the current catalog: 42 commands, 0 missing examples, 41
     bounded commands all round-trip.)
- **Live verification (primary):** serve the repo root with
  `python3 -m http.server` and drive it in a real browser (browser tools / the
  `verify` skill): compose a sequence → Copy → confirm clipboard → paste back via
  import → confirm the composer reconstructs it → open a reference "Try in
  composer" link → confirm it lands pre-seeded.

---

## 7. Docs & housekeeping

- **README:** add a short "Hosted composer" section with the Pages URL and one
  line on enabling Pages (Settings → Pages → Deploy from branch → `main` → `/`
  root). Cross-link from `INTEGRATION_GUIDE.md`.
- **No `libraryVersion` bump** and **no `releases.json` change** — this is
  app-layer, not a catalog change.
- **`.nojekyll`** at root so Pages serves files verbatim (avoids Jekyll
  processing markdown/underscore files unexpectedly).

---

## 8. Out of scope (YAGNI)

Presets/saved sequences, user accounts, any server, a live serial connection,
Marcduino-style prefix wrapping, in-browser board authoring/editing, and
permalinks beyond the single `?s=` seed param. Any of these can be a later,
separately-scoped project.
