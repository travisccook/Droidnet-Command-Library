# Per-board library split — design

- **Status:** approved design, pending spec review
- **Date:** 2026-06-26
- **Repo:** droidnet-command-library
- **Breaking:** yes — `libraryVersion` 1.0.0 → 2.0.0

## 1. Goal

Split the single monolithic catalog file `libraries/droidnet-astromech.json` into
**one self-contained file per board component**, indexed by a `manifest.json`. The
engine merges the board files **at runtime** (no build step). This makes each board
a clean, conflict-free PR target (one board = one documentation source = one file),
matching how the catalog is actually authored.

## 2. Locked decisions

These were settled during brainstorming and are not open for re-litigation in the
implementation plan:

1. **Per-board files + manifest, runtime merge.** `libraries/boards/<id>.json` plus
   `libraries/manifest.json`. Consumers fetch the manifest, then each board, then
   merge in the engine. **No build step.**
2. **Self-contained mini-library** per file: its own `enums` map + exactly **one**
   `component`. Each file validates standalone against `schema/library.schema.json`.
3. **Strict one file per component; shared enums duplicated.** `hcr.emotion` and
   `hcr.channel` are copied byte-identical into both `wcb-hcr.json` and
   `hcr-native.json`. Identical duplicate = OK; conflicting = error.
4. **Manifest-only, breaking 2.0.0.** Delete the combined file. Engine
   `loadLibrary(obj | array)` + `mergeLibrary(obj)`. `releases.json` update flow
   points at the manifest.
5. **Ship a Node loader helper** (`droidnet-command-library/node-loader`) so Node
   usage stays a one-liner.
6. **Clean break for the external Signal Booster app.** No deprecated bundle. The
   consuming app is updated in its own product repo (`droidnetsignalbooster`) — out
   of scope for this repo.

## 3. File layout

```
libraries/
  manifest.json            # catalog entry point — ordered board list + catalog libraryVersion
  boards/
    flthy-hps.json
    magic-panel.json
    rseries-logic.json
    wcb-hcr.json           # carries hcr.emotion + hcr.channel
    hcr-native.json        # carries hcr.emotion + hcr.channel (byte-identical)
    maestro.json
    psi-pro.json
  # droidnet-astromech.json  -> DELETED
schema/
  library.schema.json      # board-file schema (libraryVersion now optional)
  manifest.schema.json     # NEW — catalog manifest schema
src/
  droidnet-command-library.js     # engine + merge
  droidnet-command-library-ui.js  # unchanged (verified transparent to merge)
  load-node.js                    # NEW — Node loader helper
```

## 4. Catalog manifest (`libraries/manifest.json`)

```json
{
  "$schema": "droidnet-command-library/catalog/v1",
  "libraryVersion": "2.0.0",
  "schemaVersion": "v1",
  "generatedFrom": "FlthyHPs, MagicPanel, RSeriesLogic, WCB·HCR, Maestro, PSIPro, HCR native",
  "boards": [
    { "id": "flthy-hps",     "file": "boards/flthy-hps.json",     "name": "FlthyHPs",     "confidence": "high" },
    { "id": "magic-panel",   "file": "boards/magic-panel.json",   "name": "MagicPanel",   "confidence": "high" },
    { "id": "rseries-logic", "file": "boards/rseries-logic.json", "name": "RSeriesLogic", "confidence": "high" },
    { "id": "wcb-hcr",       "file": "boards/wcb-hcr.json",       "name": "WCB·HCR",      "confidence": "high" },
    { "id": "maestro",       "file": "boards/maestro.json",       "name": "Maestro",      "confidence": "high" },
    { "id": "psi-pro",       "file": "boards/psi-pro.json",       "name": "PSIPro",       "confidence": "high" },
    { "id": "hcr-native",    "file": "boards/hcr-native.json",    "name": "HCR native",   "confidence": "high" }
  ]
}
```

- **`boards[]` order is authoritative.** It preserves today's component order and is
  the order the engine iterates in `getComponents()` / `match()`. `file` is relative
  to the manifest's directory.
- The manifest is **distinct** from `releases.json`. `releases.json` is the *update
  pointer* (is there a newer catalog, and where); `manifest.json` is the *catalog
  entry point* (which boards, what order, what version). `releases.json.latest.url`
  now points at `manifest.json`; its `latest.libraryVersion` mirrors the manifest's
  (CI keeps them equal).

## 5. Per-board file shape & schema changes

Each board file is a complete library object that validates standalone:

```json
{
  "$schema": ".../schema/library.schema.json",
  "enums": { "flthy.color": { ... }, "flthy.designator": { ... } },
  "components": [ { "id": "flthy-hps", "name": "FlthyHPs", "kind": "device-native", "commands": [ ... ] } ]
}
```

`schema/library.schema.json` changes:

- **`libraryVersion` becomes optional** (remove from top-level `required`). The
  manifest owns the catalog version; board files omit it. The field stays defined so
  a legacy single monolithic object still validates.
- One-component-per-file is **not** expressible cleanly in JSON Schema → enforced by
  a validator assertion + test (§8), not the schema.

New `schema/manifest.schema.json`:

- `required: ["libraryVersion", "boards"]`.
- `libraryVersion`: semver (reuse the existing pattern).
- `boards`: non-empty array of `{ id (kebab), file (string), name?, confidence? }`,
  `required: ["id", "file"]`.

## 6. Engine (`src/droidnet-command-library.js`)

### 6.1 Public API

| Function | Behavior |
| --- | --- |
| `loadLibrary(obj, opts?)` | **Reset** then load one library. Back-compat: unchanged for the single-object case. `opts.libraryVersion` overrides the catalog version. |
| `loadLibrary(array, opts?)` | **Reset** then merge all libraries **in array order**. `opts.libraryVersion` (from the manifest) sets the catalog version. |
| `mergeLibrary(obj)` | **Append** one library to the current catalog without reset. Idempotent (see §6.3). Initializes an empty catalog first if none loaded. |
| `merge(array, opts?)` | **Pure** — returns a merged library object `{ libraryVersion, enums, components }` without mutating engine state. Used by `loadLibrary`, the Node loader (`load: false`), and the validator (single source of merge-conflict truth). |
| `getLibraryVersion()` | Returns the catalog version: `opts.libraryVersion` if supplied, else the first input object's `libraryVersion`, else `null`. |

Existing getters (`getComponents`, `getCommands`, `getCommand`, `getEnum`), `encode`,
`match`, `registerEncoder`, `buildWCBValue`, `parseWCBValue` are unchanged in
signature.

### 6.2 Merge algorithm (atomic, validation-first)

A private accumulator builds a fresh result and runs **all** conflict checks before
anything is returned, so a conflict mid-merge can never leave engine state
half-written (transaction semantics). It sets each command's non-enumerable
`_component` back-ref as it goes, so a merged object is immediately usable by
`encode` (which reads `cmd._component`):

```
_accumulate(libs, opts):                          # throws on first conflict
  acc = { libraryVersion: opts?.libraryVersion ?? libs[0]?.libraryVersion ?? null,
          enums: {}, components: [] }
  byId = {}
  for lib in libs:
    for [id, def] in entries(lib.enums ?? {}):
      if id in acc.enums:
        if !deepEqual(acc.enums[id], def):
          throw Error("enum '"+id+"' defined differently across board files")
        # identical -> idempotent, skip
      else acc.enums[id] = def
    for comp in lib.components:
      for cmd in comp.commands:
        if cmd.id in byId:
          throw Error("duplicate command id '"+cmd.id+"' across board files")
        define cmd._component = comp (non-enumerable); delete cmd._matcher
        byId[cmd.id] = cmd
      acc.components.push(comp)
  return { acc, byId }
```

- **`merge(libs, opts)`** (public, pure) = `_accumulate(libs, opts).acc` — the merged
  library object `{ libraryVersion, enums, components }`, no engine-state mutation.
- **`loadLibrary(libOrArray, opts)`**:
  1. `libs = Array.isArray(libOrArray) ? libOrArray : [libOrArray]`.
  2. `{ acc, byId } = _accumulate(libs, opts)` — throws before any commit.
  3. Commit: `_lib = acc`, `_commandsById = byId`. (Back-refs and matcher
     invalidation already done during accumulation.)

`mergeLibrary(obj)`: re-run `merge([...currentLibs, obj])` semantics against a clone
of current state, commit on success. For a component `id` already present: if the new
component is `deepEqual` to the existing one it is a **no-op** (idempotent re-merge);
otherwise it **throws**.

### 6.3 Hardening rules (each neutralizes a high-severity risk)

- **Deterministic order** — components are appended in manifest/array order;
  `getComponents()` and therefore `match()` precedence follow that order. Documented
  as the contract. (Preserves PSI-vs-MagicPanel and HCR O-family disambiguation.)
- **Matcher cache invalidation** — every `loadLibrary`/`mergeLibrary` deletes all
  cached `cmd._matcher`. Prevents stale regexes when a merged board widens an enum.
- **Enum identity** — `deepEqual`: objects compared key-order-insensitively, **arrays
  order-sensitively** (so `enum.values` order matters). Covers the same-code /
  different-label case (errors).
- **Command-id collision** — throws instead of silently overwriting `_commandsById`.
- **Atomic commit** — conflicts throw before any state mutation.
- **Version ownership** — catalog version comes from the manifest via `opts`, never
  guessed from an arbitrary board file.

`deepEqual(a, b)`: arrays → equal length and `deepEqual` elementwise (order-sensitive);
plain objects → same key set and `deepEqual` per key; else `===`. Operates on
enumerable keys, so non-enumerable `_component`/`_matcher` are naturally ignored.

## 7. Node loader helper (`src/load-node.js`)

Small, dependency-free, `fs`-based. Exported via `package.json` `exports` as
`droidnet-command-library/node-loader`.

```js
const { loadCatalog } = require('droidnet-command-library/node-loader');
loadCatalog();                          // reads manifest + boards, merges, loads the engine
const lib = loadCatalog({ load: false }); // returns the merged library object only
```

- `readCatalog(libDir?)` → `{ manifest, boards }` (manifest parsed; each
  `manifest.boards[].file` read relative to `libDir`, default `../libraries`).
- `loadCatalog({ libDir?, load = true })` → reads the catalog; if `load`, calls
  `engine.loadLibrary(boards, { libraryVersion: manifest.libraryVersion })` and
  returns the engine; if `load: false`, returns
  `engine.merge(boards, { libraryVersion: manifest.libraryVersion })` (pure merged
  object).

## 8. Validator (`scripts/validate.js`) — cross-file rewrite

- **Discovery:** find `libraries/manifest.json` and `libraries/boards/*.json`.
- **Manifest:** validate against `schema/manifest.schema.json`; check **both-way
  consistency** — every `boards[].file` exists on disk, and every
  `boards/*.json` is listed in the manifest (no orphans); `libraryVersion` is semver.
- **Per board file:** validate against `library.schema.json`; assert **exactly one
  component** (`components.length === 1`); existing semantic checks (enum refs
  resolve locally, template ↔ param consistency, custom-encoder warning) unchanged.
- **Cross-file (reuse `engine.merge`):** load all boards in manifest order and call
  `engine.merge(...)`. Its throws surface global command-id collisions and conflicting
  duplicate-enum definitions as validation errors — one implementation of merge truth,
  shared by engine and CI (no drift).
- Exit non-zero on any error; warnings (custom encoders, unused params) stay
  non-fatal. Keep the ajv-absent graceful-skip behavior for structural checks.

## 9. Tests

`test/engine.test.js`:
- Replace the single-file load with a helper that reads `manifest.json` + all boards
  and loads them in manifest order (or uses the Node loader's `merge`).
- `getLibraryVersion()` now expects `2.0.0` (from the manifest).
- All existing encode / match / round-trip / disambiguation tests stay green against
  the merged catalog.

New merge tests:
- Identical duplicate enum across two boards → merges OK.
- Conflicting duplicate enum (different label or value order) → throws.
- Duplicate command id across two boards → throws.
- Atomic rollback: a failing array load leaves prior `_lib` unchanged.
- `mergeLibrary` idempotency: re-merging the same board is a no-op; conflicting
  re-merge throws.
- Matcher rebuild: a board merged after first `match()` that widens a shared enum is
  recognized on the next `match()`.
- Order: PSI `4T92` vs MagicPanel `T52`, and HCR O-family, resolve correctly under
  manifest order.

`test/library.test.js`:
- Iterate `libraries/boards/*.json` (exclude the manifest); assert one component per
  file and standalone schema validity; keep the per-file id/enum/template checks.
- New: manifest schema + both-way consistency; merged-catalog global command-id
  uniqueness and shared-enum identity (via `engine.merge`).

## 10. Docs / consumers / distribution

| File | Change |
| --- | --- |
| `README.md` | Browser: fetch `manifest.json` → fetch each board → `loadLibrary(boards, {libraryVersion})`. Node: `require('droidnet-command-library/node-loader').loadCatalog()`. |
| `examples/node-example.js` | Use the Node loader instead of `require('.../droidnet-astromech.json')`. |
| `docs/INTEGRATION_GUIDE.md` | New loading examples (browser + Node), Engine-API table for `loadLibrary(obj\|array)`/`mergeLibrary`/`merge`, and the manifest-based update flow. |
| `docs/BOARD_AUTHORING_GUIDE.md` | Per-board anatomy; version lives in the manifest; "duplicate shared enums byte-identically"; add a manifest entry for a new board. |
| `CONTRIBUTING.md` | Edit `boards/<id>.json` (one component/file); add the manifest entry; enum-duplication rule; cross-file validator checks. |
| `CLAUDE.md` | Update the architecture diagram and the engine API description. |
| `releases.json` | `latest.url` → `manifest.json`; `latest.libraryVersion` → `2.0.0`; restructure `libraries[]`; update `_comment` to the fetch-manifest-then-boards flow. |
| `package.json` | Bump to `2.0.0`; add `./node-loader` (and `./manifest`) to `exports`; `files` already ships `libraries/`. |
| `.github/workflows/ci.yml` | Update the validate-step comment to mention manifest + cross-file checks (commands run unchanged: `npm run validate`, `npm test`). |

## 11. Update flow (host "Update Library")

1. Fetch `releases.json`; compare `latest.libraryVersion` to installed.
2. If newer, fetch `latest.url` (`manifest.json`).
3. Fetch every `manifest.boards[].file`, **in order**.
4. Validate each board; on success, `loadLibrary(boards, { libraryVersion })`
   (atomic — a single bad board aborts the whole update, leaving the prior catalog
   intact).

Network atomicity (fetch all boards before loading) is a **consumer** concern; the
engine assumes all boards are in hand before `loadLibrary`. The integration guide
documents the all-or-nothing pattern.

## 12. Risk register → mitigation

| Risk (severity) | Mitigation in this design |
| --- | --- |
| Non-deterministic component order breaks `match()` (high) | Manifest `boards[]` order is authoritative; engine preserves it; test asserts disambiguation. §4, §6.3 |
| Stale `_matcher` after enum merge (high) | Invalidate all matchers on every load/merge. §6.3 |
| "Identical" enum undefined (high) | Precise `deepEqual` (arrays order-sensitive). §6.3 |
| Half-merged corrupted state (high) | Validation-first atomic commit. §6.2 |
| `loadLibrary`/`mergeLibrary` semantics undefined (high) | Documented: load resets, merge appends; merge idempotent. §6.1, §6.3 |
| Silent command-id overwrite (med) | Throw on cross-file collision. §6.2 |
| Board file with 2+ components (med) | Validator assertion + test. §8, §9 |
| Manifest ↔ disk drift / orphans (med) | Both-way consistency check in validator. §8 |
| Shared-enum drift between HCR files (high, authoring) | Cross-file deep-equal check in CI via `engine.merge`. §8 |
| Missing manifest entry for a new board (high, authoring) | Both-way consistency check. §8 |
| Version not bumped (high, authoring) | `releases.json`↔manifest version sync check in CI. §10 |
| Node `require()` of deleted file breaks (high) | Node loader helper. §7 |
| External Signal Booster 404 (high) | Accepted clean break; updated in its own product repo. §2 |

## 13. Out of scope / future

- Content-hash board URLs + strong ETags for CDN cache-busting (note in docs; not
  implemented now).
- A browser fetch-and-merge helper (the guide shows the pattern; helper optional
  later).
- Independent per-board versioning (the catalog has one version by design).

## 14. Implementation order (for the plan)

1. Engine: `merge` + `loadLibrary(obj|array, opts)` + `mergeLibrary` + matcher
   invalidation + `deepEqual`; unit tests for merge semantics.
2. Split data: generate `boards/*.json` from the current monolith (preserving order
   and duplicating the two HCR enums); write `manifest.json`; delete the monolith.
3. Schemas: make `libraryVersion` optional; add `manifest.schema.json`.
4. Validator: cross-file rewrite reusing `engine.merge`.
5. Node loader; wire `package.json` exports + version bump.
6. Tests: migrate `engine.test.js`/`library.test.js`; add merge + manifest tests.
7. Docs: README, guides, CONTRIBUTING, CLAUDE.md, releases.json, ci.yml comment.
8. Full `npm run validate && npm test` green.
