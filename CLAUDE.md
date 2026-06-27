# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A dependency-free engine + visual composer that builds **serial commands to
control a vibrant community of Astromech droid components** from schema-driven JSON
definitions. The grammar of each board lives in **data**
(`libraries/*.json`), not code: the engine turns structured steps into wire
strings and parses them back. Adding/editing a board is a PR against a JSON file
that CI validates — **no code change** for the common (template) case. The
non-template case (bespoke grammars) requires a registered custom encoder in
`src/droidnet-command-library.js`.

Ships as plain UMD scripts — no build step, no transpile. The browser loads the
two `src/*.js` files directly; Node/bundlers consume them via CommonJS.

## Commands

```bash
npm install              # ajv (validator) + jest (tests)
npm run validate         # structural (schema) + semantic (cross-ref) checks on libraries/*.json
npm test                 # jest: round-trip, encode/decode, per-library checks
npm run lint             # eslint (best-effort; `|| true`, eslint not in devDeps)

npx jest -t "substitutes enum params"        # run a single test by name
npx jest test/engine.test.js                 # run one test file
node scripts/validate.js libraries/foo.json  # validate a specific library
node examples/node-example.js                # runnable usage walkthrough
```

CI (`.github/workflows/ci.yml`) runs `npm run validate` then `npm test` on Node 20
for every push/PR. Both must pass for a board contribution to merge.

## Architecture

Three layers, strictly separated — the data describes grammar, the engine is pure
logic, the UI is view-only:

```
libraries/manifest.json             ──fetch+merge──▶  loadLibrary  ──▶  droidnet-command-library  ──renderComposer──▶  droidnet-command-library-ui
+ libraries/boards/*.json                             (boards[],         (encode / match / parse,                       (inline step composer,
  (one component per file,                             { libraryVersion}) round-trips wire strings)                      drag-reorder, no modal)
   enums, templates)
```

- **`src/droidnet-command-library.js`** — the engine (pure, no DOM). Holds the
  loaded library in module-level state (`_lib`, `_commandsById`), so there is **one
  global loaded library per module instance**. Public API: `loadLibrary(obj|array, opts?)` (load/replace; pass an array of board objects + `{ libraryVersion }` for the per-board catalog; board order is authoritative for `match()`), `mergeLibrary(lib)` (additive single-board merge), `merge(obj|array, opts?)` (return merged result without loading), `getComponents`/`getCommands`/`getCommand`/`getEnum`, `encode`, `match`, `buildWCBValue`/`parseWCBValue`, `registerEncoder`. Exposed as
  `window.DroidNetCommandLibrary` (browser) and `module.exports` (CommonJS/AMD).
- **`src/droidnet-command-library-ui.js`** — the visual composer. Depends only on
  the engine (resolved lazily off the global in the browser, `require`d under
  CommonJS). Owns no encode/parse logic — it calls `buildWCBValue`/`parseWCBValue`
  for everything and just renders. `window.DroidNetCommandLibraryUI`.
- **`schema/library.schema.json`** — JSON Schema (draft 2020-12) for a library.
  The contract every `libraries/*.json` must satisfy.
- **`scripts/validate.js`** — `npm run validate`. Two layers: structural (ajv vs
  the schema; skipped with a note if ajv is absent) + semantic checks JSON Schema
  can't express (enum refs resolve, every `{placeholder}` ↔ param, unique command
  ids, custom encoders flagged).
- **`releases.json`** — update manifest. Host apps fetch it, compare
  `latest.libraryVersion` to their installed library, and one-click-update without
  shipping an app release.

### Data model (a library)

`enums` (top-level, reusable named value sets) → `components` (boards) →
`commands` → `params`. A `param` either references an `enum` (dropdown) or is an
`int`. A command's `template` is a literal string with `{param}` placeholders; the
param names must exactly match the placeholders (validator enforces both
directions). `component.kind` is `device-native` (the board's own grammar) or
`wcb-verb` (interpreted by an intermediary like a WCB). `command.safety`
(`cosmetic`/`movement`/`power`/`config`) drives a confirm-before-firing warning in
the UI — anything non-`cosmetic` is treated as potentially dangerous.

### Encoders

`encode`/`match` dispatch through the `_encoders` registry keyed by
`command.encoder` (default `"template"`):

- **`template`** — the common path. Substitutes `{param}` placeholders; honors
  `param.default`, `param.pad` (zero-pad to fixed width), the component's
  `routing.durationSuffix` (trailing `|<n>`), and an `opts.targetPrefix`. Its
  `match` builds a regex per command (cached on `cmd._matcher`), sorting enum codes
  **longest-first** so multi-char codes win.
- **`rseries-le`** — a built-in *custom* encoder (packed numeric value, not a
  placeholder template). The worked example for `registerEncoder`. Note: broadcast
  RSeries effects canonicalize leading zeros, so they round-trip
  **firmware-equivalent, not byte-identical**.
- **Custom encoders** are registered in code via
  `registerEncoder(name, { encode, match? })`. Libraries reference them by name.
  The validator only *warns* about unknown encoders (it can't see runtime
  registrations) — they must be registered before `encode`/`match` is called.

### The wire format

Steps join with `^`. A `***`-prefixed fragment is an inline comment: it becomes
the **label** of the preceding command/raw step, or a standalone comment step if
there's nothing to attach to. `;t<ms>` is a delay. Anything `match` doesn't
recognize survives as a `raw` step (lossless). The core invariant, exercised by
tests against `test/fixtures/commands.sample.json`:
`buildWCBValue(parseWCBValue(v)) === v` (byte-identical, except the documented
rseries leading-zero canonicalization).

## Working in this repo

- **Most changes are JSON, not code.** New/edited boards go in `libraries/boards/<id>.json`; list the entry in `libraries/manifest.json`. After
  editing, `npm run validate && npm test` — the test suite auto-discovers every
  board file and every command's `examples` array is exercised, so add at least
  one `examples` string per command.
- **Bump `libraryVersion`** (semver) in `libraries/manifest.json` on every catalog
  change: patch = fix a template/enum, minor = add commands/board, major =
  rename/remove command ids (breaks stored values). Update `releases.json` when the
  released version changes.
- **The engine's loaded-library state is module-global.** Tests get a fresh engine
  via `jest.resetModules()` + `require(...)` (see `loadEngine()` in
  `test/engine.test.js`) — follow that pattern rather than relying on `loadLibrary`
  to fully reset across test cases.
- **Keep the engine DOM-free and the UI logic-free.** Encoding/parsing belongs in
  the engine; the UI must go through `buildWCBValue`/`parseWCBValue`.
- **Naming/grammar invariants worth preserving:** command ids are unique across the
  *whole* library; enum match is longest-code-first (disambiguates overlapping
  prefixes like HCR's `<O...>` family); `match` only accepts a trailing duration if
  the matched command sets `supportsDuration`.

## Docs

- `docs/INTEGRATION_GUIDE.md` — full engine API, wire format, embedding the UI.
- `docs/BOARD_AUTHORING_GUIDE.md` — schema walkthrough, worked board example,
  custom encoders, versioning.
- `CONTRIBUTING.md` — PR process, what the validator enforces, `confidence` badges
  (`high`/`community`/`low` — unverified contributions use `community`).
