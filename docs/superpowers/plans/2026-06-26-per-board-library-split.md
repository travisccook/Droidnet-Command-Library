# Per-board library split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the monolithic `libraries/droidnet-astromech.json` catalog into one self-contained file per board, indexed by `libraries/manifest.json`, merged at runtime by a hardened engine.

**Architecture:** Each board file is a standalone mini-library (its own `enums` + exactly one `component`). A manifest lists the board files in authoritative order and owns the catalog `libraryVersion`. The engine gains an atomic, validation-first merge (`loadLibrary(obj|array)`, `mergeLibrary`, pure `merge`) with deterministic ordering, command-id collision detection, deep-equal enum-conflict detection, and matcher-cache invalidation. The validator and a Node loader both reuse the engine's `merge` so there is one merge implementation.

**Tech Stack:** Vanilla Node.js (no runtime deps), UMD modules, Jest, ajv (dev-only), JSON Schema draft 2020-12.

**Reference spec:** `docs/superpowers/specs/2026-06-26-per-board-library-split-design.md`

## Global Constraints

- Node 20; CI runs `npm run validate` then `npm test`.
- **Zero runtime dependencies** — engine, UI, and Node loader must stay dependency-free. `ajv` and `jest` are devDependencies only.
- Preserve the UMD wrapper and `MPL-2.0` license header comment in every `src/*.js` file.
- Catalog `libraryVersion` is **2.0.0** (breaking bump from 1.0.0).
- Catalog manifest `$schema` value: `droidnet-command-library/catalog/v1`. Board file `$schema` value: `droidnet-command-library/library/v1`.
- Board files have **exactly one** component and **omit** `libraryVersion`.
- `hcr.emotion` and `hcr.channel` are duplicated **byte-identically** into `wcb-hcr.json` and `hcr-native.json`.
- `deepEqual`: arrays compared **order-sensitively**, objects compared **key-order-insensitively** over enumerable keys.
- Component/board order is authoritative for `match()`; preserve the current order: `flthy-hps, magic-panel, rseries-logic, wcb-hcr, maestro, psi-pro, hcr-native`.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Each task keeps `npm test` (and, where noted, `npm run validate`) green before its commit.

---

### Task 1: Engine merge core (`merge`, array `loadLibrary`, `mergeLibrary`, `deepEqual`)

Adds runtime-merge capability to the engine. Tested with synthetic in-test libraries — does not depend on the data split. The existing single-object `loadLibrary` path and all current tests stay green.

**Files:**
- Modify: `src/droidnet-command-library.js` (replace `loadLibrary` at lines 32-42; export new functions in the return object at lines 234-239)
- Test: `test/merge.test.js` (create)

**Interfaces:**
- Produces:
  - `deepEqual(a, b) -> boolean` — arrays order-sensitive, objects key-order-insensitive over enumerable keys.
  - `merge(libOrArray, opts?) -> { libraryVersion, enums, components }` — pure; throws on conflict; no engine-state mutation.
  - `loadLibrary(libOrArray, opts?) -> void` — reset + load/merge; `opts.libraryVersion` sets the catalog version.
  - `mergeLibrary(lib) -> void` — append without reset; whole-component idempotent; throws on conflict.
  - `getLibraryVersion() -> string|null` — unchanged signature; now returns the merged catalog version.

- [ ] **Step 1: Write the failing tests**

Create `test/merge.test.js`:

```js
const path = require('path');

function loadEngine() {
  jest.resetModules();
  return require('../src/droidnet-command-library.js');
}

// Minimal synthetic boards (template encoder).
function boardFlthy() {
  return {
    enums: { 'c.color': { values: [{ code: '5', label: 'Blue' }] } },
    components: [{
      id: 'flthy', name: 'Flthy', kind: 'device-native',
      commands: [{ id: 'flthy.solid', name: 'Solid', template: '{color}', params: [{ name: 'color', enum: 'c.color' }] }],
    }],
  };
}
function boardMp() {
  return {
    enums: { 'm.mode': { values: [{ code: '52', label: 'VU' }] } },
    components: [{
      id: 'mp', name: 'MP', kind: 'device-native',
      commands: [{ id: 'mp.mode', name: 'Mode', template: 'T{mode}', params: [{ name: 'mode', enum: 'm.mode' }] }],
    }],
  };
}

describe('deepEqual', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); });
  test('objects are key-order-insensitive', () => {
    expect(cb.deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });
  test('arrays are order-sensitive', () => {
    expect(cb.deepEqual([1, 2], [2, 1])).toBe(false);
  });
  test('nested mismatch is detected', () => {
    expect(cb.deepEqual({ v: [{ code: 'H' }] }, { v: [{ code: 'S' }] })).toBe(false);
  });
});

describe('merge (pure)', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); });
  test('merges enums and components in order', () => {
    const m = cb.merge([boardFlthy(), boardMp()], { libraryVersion: '2.0.0' });
    expect(m.libraryVersion).toBe('2.0.0');
    expect(m.components.map(c => c.id)).toEqual(['flthy', 'mp']);
    expect(Object.keys(m.enums).sort()).toEqual(['c.color', 'm.mode']);
  });
  test('identical duplicate enum is idempotent', () => {
    const a = boardFlthy();
    const b = boardFlthy(); b.components[0].id = 'flthy2';
    b.components[0].commands[0].id = 'flthy2.solid';
    expect(() => cb.merge([a, b])).not.toThrow();
  });
  test('conflicting duplicate enum throws', () => {
    const a = boardFlthy();
    const b = boardFlthy(); b.components[0].id = 'flthy2';
    b.components[0].commands[0].id = 'flthy2.solid';
    b.enums['c.color'].values[0].label = 'Red';
    expect(() => cb.merge([a, b])).toThrow(/c\.color/);
  });
  test('duplicate command id across boards throws', () => {
    const a = boardFlthy();
    const b = boardMp(); b.components[0].commands[0].id = 'flthy.solid';
    expect(() => cb.merge([a, b])).toThrow(/flthy\.solid/);
  });
  test('does not mutate engine state', () => {
    cb.merge([boardFlthy()]);
    expect(cb.getComponents()).toEqual([]);
  });
});

describe('loadLibrary (array + opts)', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); });
  test('loads and merges an array, version from opts', () => {
    cb.loadLibrary([boardFlthy(), boardMp()], { libraryVersion: '2.0.0' });
    expect(cb.getLibraryVersion()).toBe('2.0.0');
    expect(cb.getComponents().map(c => c.id)).toEqual(['flthy', 'mp']);
    expect(cb.getCommand('mp.mode').name).toBe('Mode');
  });
  test('single object still works (back-compat)', () => {
    cb.loadLibrary(boardFlthy());
    expect(cb.getCommand('flthy.solid')).not.toBeNull();
  });
  test('a failing array load leaves prior state unchanged (atomic)', () => {
    cb.loadLibrary([boardFlthy()]);
    const bad = boardMp(); bad.components[0].commands[0].id = 'flthy.solid';
    expect(() => cb.loadLibrary([boardFlthy(), bad])).toThrow();
    expect(cb.getComponents().map(c => c.id)).toEqual(['flthy']);
  });
});

describe('mergeLibrary', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); });
  test('appends without reset', () => {
    cb.loadLibrary([boardFlthy()], { libraryVersion: '2.0.0' });
    cb.mergeLibrary(boardMp());
    expect(cb.getComponents().map(c => c.id)).toEqual(['flthy', 'mp']);
    expect(cb.getLibraryVersion()).toBe('2.0.0');
  });
  test('re-merging identical component is a no-op', () => {
    cb.loadLibrary([boardFlthy()]);
    cb.mergeLibrary(boardFlthy());
    expect(cb.getComponents().map(c => c.id)).toEqual(['flthy']);
  });
  test('re-merging a changed component throws', () => {
    cb.loadLibrary([boardFlthy()]);
    const changed = boardFlthy();
    changed.components[0].commands[0].name = 'Different';
    expect(() => cb.mergeLibrary(changed)).toThrow(/flthy/);
  });
  test('initializes an empty catalog when none loaded', () => {
    cb.mergeLibrary(boardFlthy());
    expect(cb.getCommand('flthy.solid')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest test/merge.test.js`
Expected: FAIL — `cb.deepEqual is not a function` / `cb.merge is not a function`.

- [ ] **Step 3: Implement the engine changes**

In `src/droidnet-command-library.js`, replace the `loadLibrary` function (lines 32-42) with the following block (defines `deepEqual`, `_accumulate`, `merge`, `loadLibrary`, `mergeLibrary`):

```js
  function deepEqual(a, b) {
    if (a === b) return true;
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
      return true;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      const ka = Object.keys(a), kb = Object.keys(b);
      if (ka.length !== kb.length) return false;
      for (const k of ka) {
        if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
        if (!deepEqual(a[k], b[k])) return false;
      }
      return true;
    }
    return false;
  }

  // Build a merged library from an array of libraries. Runs ALL conflict checks
  // before returning, so a thrown conflict never leaves a half-written result
  // (callers commit only on success). Sets each command's non-enumerable
  // _component back-ref and clears its _matcher cache as it goes.
  function _accumulate(libs, opts) {
    opts = opts || {};
    const acc = {
      libraryVersion: opts.libraryVersion !== undefined ? opts.libraryVersion
        : (libs[0] && libs[0].libraryVersion !== undefined ? libs[0].libraryVersion : null),
      enums: {}, components: [],
    };
    const byId = {};
    for (const lib of libs) {
      const enums = (lib && lib.enums) || {};
      for (const id of Object.keys(enums)) {
        if (Object.prototype.hasOwnProperty.call(acc.enums, id)) {
          if (!deepEqual(acc.enums[id], enums[id])) {
            throw new Error("enum '" + id + "' is defined differently across board files");
          }
        } else {
          acc.enums[id] = enums[id];
        }
      }
      for (const comp of (lib && lib.components) || []) {
        for (const cmd of comp.commands || []) {
          if (Object.prototype.hasOwnProperty.call(byId, cmd.id)) {
            throw new Error("duplicate command id '" + cmd.id + "' across board files");
          }
          delete cmd._matcher;
          Object.defineProperty(cmd, '_component', { value: comp, enumerable: false, configurable: true, writable: true });
          byId[cmd.id] = cmd;
        }
        acc.components.push(comp);
      }
    }
    return { acc, byId };
  }

  // Pure: merged library object, no engine-state mutation.
  function merge(libOrArray, opts) {
    return _accumulate(Array.isArray(libOrArray) ? libOrArray : [libOrArray], opts).acc;
  }

  function _commit(acc, byId) {
    _lib = acc;
    for (const k of Object.keys(_commandsById)) delete _commandsById[k];
    Object.assign(_commandsById, byId);
  }

  // Reset, then load a single library or merge an array (in order).
  function loadLibrary(libOrArray, opts) {
    const libs = Array.isArray(libOrArray) ? libOrArray : [libOrArray];
    const { acc, byId } = _accumulate(libs, opts);
    _commit(acc, byId);
  }

  // Append a library without resetting. A component whose id is already loaded
  // is a no-op when identical, and throws when its content differs.
  function mergeLibrary(lib) {
    const current = _lib || { libraryVersion: null, enums: {}, components: [] };
    const existing = {};
    for (const c of current.components) existing[c.id] = c;
    const incoming = [];
    for (const comp of (lib.components || [])) {
      if (existing[comp.id]) {
        if (deepEqual(existing[comp.id], comp)) continue; // identical -> no-op
        throw new Error("component '" + comp.id + "' already loaded with different content");
      }
      incoming.push(comp);
    }
    const { acc, byId } = _accumulate([
      { libraryVersion: current.libraryVersion, enums: current.enums, components: current.components },
      { enums: lib.enums || {}, components: incoming },
    ], { libraryVersion: current.libraryVersion });
    _commit(acc, byId);
  }
```

Then add the new functions to the exported object (the `return { ... }` at lines 234-239). Change it to:

```js
  return {
    loadLibrary, mergeLibrary, merge, deepEqual, getLibraryVersion,
    getComponents, getCommands, getCommand, getEnum,
    encode, registerEncoder, match,
    buildWCBValue, parseWCBValue,
  };
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `npx jest test/merge.test.js`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Run the full suite to confirm no regression**

Run: `npm test`
Expected: PASS — existing `engine.test.js` and `library.test.js` still green (single-object `loadLibrary` unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/droidnet-command-library.js test/merge.test.js
git commit -m "$(printf 'feat(engine): runtime merge (merge/loadLibrary array/mergeLibrary)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 2: Schema changes (optional `libraryVersion`, new manifest schema)

Makes `libraryVersion` optional on library files and adds the catalog manifest schema. Additive — the existing monolith (which has `libraryVersion`) still validates.

**Files:**
- Modify: `schema/library.schema.json:7` (the top-level `required` array)
- Create: `schema/manifest.schema.json`
- Test: `test/schema.test.js` (create)

**Interfaces:**
- Produces: `schema/manifest.schema.json` validating `{ libraryVersion (semver), boards: [{ id, file, name?, confidence? }] }`.

- [ ] **Step 1: Write the failing tests**

Create `test/schema.test.js`:

```js
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv/dist/2020');

const ajv = new Ajv({ allErrors: true, strict: false });
const libSchema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schema', 'library.schema.json'), 'utf8'));
const manifestSchemaPath = path.join(__dirname, '..', 'schema', 'manifest.schema.json');

test('a board file without libraryVersion validates', () => {
  const validate = ajv.compile(libSchema);
  const board = {
    enums: { 'c.color': { values: [{ code: '5', label: 'Blue' }] } },
    components: [{ id: 'flthy', name: 'Flthy', kind: 'device-native',
      commands: [{ id: 'flthy.solid', name: 'Solid', template: '{color}', params: [{ name: 'color', enum: 'c.color' }] }] }],
  };
  expect(validate(board)).toBe(true);
});

test('manifest schema accepts a valid manifest', () => {
  const schema = JSON.parse(fs.readFileSync(manifestSchemaPath, 'utf8'));
  const validate = ajv.compile(schema);
  const manifest = { libraryVersion: '2.0.0', boards: [{ id: 'flthy-hps', file: 'boards/flthy-hps.json' }] };
  expect(validate(manifest)).toBe(true);
});

test('manifest schema rejects a non-semver version and an empty boards list', () => {
  const schema = JSON.parse(fs.readFileSync(manifestSchemaPath, 'utf8'));
  const validate = ajv.compile(schema);
  expect(validate({ libraryVersion: 'v2', boards: [{ id: 'x', file: 'x.json' }] })).toBe(false);
  expect(validate({ libraryVersion: '2.0.0', boards: [] })).toBe(false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest test/schema.test.js`
Expected: FAIL — `manifest.schema.json` does not exist (ENOENT); the board-without-version test fails because `libraryVersion` is still required.

- [ ] **Step 3a: Make `libraryVersion` optional**

In `schema/library.schema.json`, change line 7 from:

```json
  "required": ["libraryVersion", "components"],
```

to:

```json
  "required": ["components"],
```

- [ ] **Step 3b: Create the manifest schema**

Create `schema/manifest.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://raw.githubusercontent.com/travisccook/droidnet-command-library/main/schema/manifest.schema.json",
  "title": "Command Builder Catalog Manifest",
  "description": "The catalog entry point: an ordered list of board files plus the catalog libraryVersion. Distinct from releases.json (the update pointer).",
  "type": "object",
  "required": ["libraryVersion", "boards"],
  "properties": {
    "$schema": { "type": "string" },
    "libraryVersion": {
      "type": "string",
      "description": "Semantic version of the whole catalog.",
      "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+([.-].*)?$"
    },
    "schemaVersion": { "type": "string" },
    "generatedFrom": { "type": "string" },
    "boards": {
      "type": "array",
      "description": "Board files in authoritative load/iteration order.",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["id", "file"],
        "properties": {
          "id": { "type": "string", "pattern": "^[a-z0-9][a-z0-9-]*$" },
          "file": { "type": "string", "description": "Path to the board file, relative to the manifest's directory." },
          "name": { "type": "string" },
          "confidence": { "type": "string", "enum": ["high", "community", "low"] }
        },
        "additionalProperties": true
      }
    }
  },
  "additionalProperties": true
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest test/schema.test.js`
Expected: PASS.

- [ ] **Step 5: Confirm the monolith still validates**

Run: `npm run validate`
Expected: `✓ libraries/droidnet-astromech.json` (still has `libraryVersion`, so unaffected).

- [ ] **Step 6: Commit**

```bash
git add schema/library.schema.json schema/manifest.schema.json test/schema.test.js
git commit -m "$(printf 'feat(schema): optional libraryVersion + catalog manifest schema\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 3: Validator cross-file rewrite

Rewrites `scripts/validate.js` to support manifest mode (validate the manifest, each board standalone with a one-component assertion, cross-file conflicts via `engine.merge`, manifest↔disk consistency, and version sync with `releases.json`) while keeping legacy mode for when no manifest exists. The cross-file logic is factored into pure, exported functions so it can be unit-tested without disk fixtures. With no manifest present yet, the validator runs in legacy mode and `npm run validate` stays green on the monolith.

**Files:**
- Modify: `scripts/validate.js` (full rewrite)
- Test: `test/validate.test.js` (create)

**Interfaces:**
- Consumes: `merge` from `src/droidnet-command-library.js` (Task 1).
- Produces (exported from `scripts/validate.js`):
  - `boardSemanticErrors(lib) -> { errors: string[], warnings: string[] }` — per-file checks incl. exactly-one-component.
  - `crossFileErrors(boards) -> string[]` — wraps `merge(boards)`; returns its thrown message as an error.
  - `manifestConsistencyErrors(manifest, filesOnDisk) -> string[]` — both-way listed/exists check.
  - `versionSyncErrors(manifest, releases) -> string[]` — manifest vs `releases.json` `latest.libraryVersion`.

- [ ] **Step 1: Write the failing tests**

Create `test/validate.test.js`:

```js
const v = require('../scripts/validate.js');

function board(id, enums, commands) {
  return { enums: enums || {}, components: [{ id, name: id, kind: 'device-native', commands }] };
}

describe('boardSemanticErrors', () => {
  test('errors when a board has more than one component', () => {
    const lib = { enums: {}, components: [
      { id: 'a', name: 'A', kind: 'device-native', commands: [{ id: 'a.x', name: 'X', template: 'X' }] },
      { id: 'b', name: 'B', kind: 'device-native', commands: [{ id: 'b.y', name: 'Y', template: 'Y' }] },
    ] };
    expect(v.boardSemanticErrors(lib).errors.join(' ')).toMatch(/exactly one component/i);
  });
  test('clean single-component board has no errors', () => {
    const lib = board('a', {}, [{ id: 'a.x', name: 'X', template: 'X' }]);
    expect(v.boardSemanticErrors(lib).errors).toEqual([]);
  });
});

describe('crossFileErrors', () => {
  test('reports a duplicate command id across boards', () => {
    const a = board('a', {}, [{ id: 'dup', name: 'X', template: 'X' }]);
    const b = board('b', {}, [{ id: 'dup', name: 'Y', template: 'Y' }]);
    expect(v.crossFileErrors([a, b]).join(' ')).toMatch(/dup/);
  });
  test('reports a conflicting shared enum', () => {
    const a = board('a', { 'e': { values: [{ code: 'H', label: 'Happy' }] } }, [{ id: 'a.x', name: 'X', template: '{p}', params: [{ name: 'p', enum: 'e' }] }]);
    const b = board('b', { 'e': { values: [{ code: 'H', label: 'Sad' }] } }, [{ id: 'b.y', name: 'Y', template: '{p}', params: [{ name: 'p', enum: 'e' }] }]);
    expect(v.crossFileErrors([a, b]).join(' ')).toMatch(/enum 'e'/);
  });
  test('clean boards produce no cross-file errors', () => {
    const a = board('a', {}, [{ id: 'a.x', name: 'X', template: 'X' }]);
    const b = board('b', {}, [{ id: 'b.y', name: 'Y', template: 'Y' }]);
    expect(v.crossFileErrors([a, b])).toEqual([]);
  });
});

describe('manifestConsistencyErrors', () => {
  const manifest = { boards: [{ id: 'a', file: 'boards/a.json' }, { id: 'b', file: 'boards/b.json' }] };
  test('passes when manifest and disk agree', () => {
    expect(v.manifestConsistencyErrors(manifest, ['boards/a.json', 'boards/b.json'])).toEqual([]);
  });
  test('flags a listed-but-missing board', () => {
    expect(v.manifestConsistencyErrors(manifest, ['boards/a.json']).join(' ')).toMatch(/boards\/b\.json/);
  });
  test('flags an orphaned board file', () => {
    expect(v.manifestConsistencyErrors(manifest, ['boards/a.json', 'boards/b.json', 'boards/c.json']).join(' ')).toMatch(/c\.json/);
  });
});

describe('versionSyncErrors', () => {
  test('passes when versions match', () => {
    expect(v.versionSyncErrors({ libraryVersion: '2.0.0' }, { latest: { libraryVersion: '2.0.0' } })).toEqual([]);
  });
  test('flags a mismatch', () => {
    expect(v.versionSyncErrors({ libraryVersion: '2.0.0' }, { latest: { libraryVersion: '1.0.0' } }).join(' ')).toMatch(/2\.0\.0/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest test/validate.test.js`
Expected: FAIL — `v.boardSemanticErrors is not a function` (the script does not export yet and runs `main()` on require).

- [ ] **Step 3: Rewrite the validator**

Replace the entire contents of `scripts/validate.js` with:

```js
#!/usr/bin/env node
/*
 * validate.js — validate a droidnet-command-library catalog.
 *
 * Manifest mode (libraries/manifest.json present):
 *   - manifest validates against schema/manifest.schema.json
 *   - manifest <-> disk consistency (every listed board exists; no orphans)
 *   - each board validates against schema/library.schema.json + has exactly one component
 *   - cross-file conflicts (duplicate command ids, conflicting shared enums) via engine.merge
 *   - manifest libraryVersion matches releases.json latest.libraryVersion
 * Legacy mode (no manifest): validate libraries/*.json as before.
 *
 * Exit code 0 = valid, 1 = at least one error.
 * Licensed under the Mozilla Public License 2.0.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const engine = require('../src/droidnet-command-library.js');

const ROOT = path.join(__dirname, '..');
const LIB_DIR = path.join(ROOT, 'libraries');
const BOARDS_DIR = path.join(LIB_DIR, 'boards');
const MANIFEST_PATH = path.join(LIB_DIR, 'manifest.json');
const RELEASES_PATH = path.join(ROOT, 'releases.json');
const LIB_SCHEMA_PATH = path.join(ROOT, 'schema', 'library.schema.json');
const MANIFEST_SCHEMA_PATH = path.join(ROOT, 'schema', 'manifest.schema.json');
const KNOWN_BUILTIN_ENCODERS = new Set(['template', 'rseries-le']);

function loadJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

// ---- structural validation (optional ajv) ----
function structuralValidate(obj, schemaPath) {
  let Ajv;
  try { Ajv = require('ajv/dist/2020'); } catch (_) {
    try { Ajv = require('ajv'); } catch (_2) { return { skipped: true, errors: [] }; }
  }
  const ajv = new Ajv({ allErrors: true, strict: false });
  let validate;
  try { validate = ajv.compile(loadJson(schemaPath)); }
  catch (e) { return { skipped: false, errors: [`schema failed to compile: ${e.message}`] }; }
  if (validate(obj)) return { skipped: false, errors: [] };
  return { skipped: false, errors: (validate.errors || []).map(e => `${e.instancePath || '/'} ${e.message}`) };
}

// ---- per-board semantic checks (cross-references JSON Schema can't express) ----
function boardSemanticErrors(lib) {
  const errors = [];
  const warnings = [];
  const enums = lib.enums || {};
  const comps = lib.components || [];
  if (comps.length !== 1) {
    errors.push(`a board file must contain exactly one component (found ${comps.length})`);
  }
  for (const comp of comps) {
    for (const cmd of comp.commands || []) {
      const where = `${comp.id}/${cmd.id}`;
      const encoder = cmd.encoder || 'template';
      if (!KNOWN_BUILTIN_ENCODERS.has(encoder)) {
        warnings.push(`${where}: uses custom encoder '${encoder}' — it must be registered via DroidNetCommandLibrary.registerEncoder() at runtime.`);
      }
      for (const p of cmd.params || []) {
        if (p.enum && !enums[p.enum]) {
          errors.push(`${where}: param '${p.name}' references undefined enum '${p.enum}'`);
        }
      }
      if (encoder === 'template') {
        if (typeof cmd.template !== 'string') {
          errors.push(`${where}: template encoder requires a 'template' string`);
          continue;
        }
        const paramNames = new Set((cmd.params || []).map(p => p.name));
        const placeholders = [...cmd.template.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
        for (const ph of placeholders) {
          if (!paramNames.has(ph)) errors.push(`${where}: template placeholder {${ph}} has no matching param`);
        }
        for (const name of paramNames) {
          if (!placeholders.includes(name)) warnings.push(`${where}: param '${name}' is never used in the template`);
        }
      }
    }
  }
  return { errors, warnings };
}

// ---- cross-file checks via the engine's single merge implementation ----
function crossFileErrors(boards) {
  try { engine.merge(boards); return []; }
  catch (e) { return [e.message]; }
}

// ---- manifest <-> disk consistency ----
function manifestConsistencyErrors(manifest, filesOnDisk) {
  const errors = [];
  const listed = new Set((manifest.boards || []).map(b => b.file));
  const onDisk = new Set(filesOnDisk);
  for (const b of manifest.boards || []) {
    if (!onDisk.has(b.file)) errors.push(`manifest lists '${b.file}' but it does not exist on disk`);
  }
  for (const f of filesOnDisk) {
    if (!listed.has(f)) errors.push(`board file '${f}' exists on disk but is not listed in the manifest`);
  }
  return errors;
}

// ---- manifest version <-> releases.json sync ----
function versionSyncErrors(manifest, releases) {
  if (!releases || !releases.latest) return [];
  if (releases.latest.libraryVersion !== manifest.libraryVersion) {
    return [`manifest libraryVersion '${manifest.libraryVersion}' does not match releases.json latest.libraryVersion '${releases.latest.libraryVersion}'`];
  }
  return [];
}

// ---- legacy single-file semantic validation (no manifest) ----
function legacySemanticErrors(lib) {
  const errors = [];
  const seen = new Map();
  for (const comp of lib.components || []) {
    for (const cmd of comp.commands || []) {
      if (seen.has(cmd.id)) errors.push(`duplicate command id '${cmd.id}' (in ${comp.id} and ${seen.get(cmd.id)})`);
      else seen.set(cmd.id, comp.id);
    }
  }
  // reuse the per-board param/template checks per component (skip the one-component assertion)
  for (const comp of lib.components || []) {
    const { errors: e } = boardSemanticErrors({ enums: lib.enums || {}, components: [comp] });
    for (const msg of e) if (!/exactly one component/.test(msg)) errors.push(msg);
  }
  return errors;
}

function listBoardFilesOnDisk() {
  if (!fs.existsSync(BOARDS_DIR)) return [];
  return fs.readdirSync(BOARDS_DIR).filter(f => f.endsWith('.json')).map(f => `boards/${f}`);
}

function runManifestMode() {
  let anyError = false;
  let anySkip = false;
  const report = (ok, rel, errors, warnings) => {
    if (errors.length) { anyError = true; console.error(`✗ ${rel}`); for (const e of errors) console.error(`    ERROR  ${e}`); }
    else console.log(`✓ ${rel}`);
    for (const w of (warnings || [])) console.log(`    warn   ${w}`);
  };

  const manifest = loadJson(MANIFEST_PATH);
  const ms = structuralValidate(manifest, MANIFEST_SCHEMA_PATH);
  anySkip = anySkip || ms.skipped;
  const consistency = manifestConsistencyErrors(manifest, listBoardFilesOnDisk());
  const releases = fs.existsSync(RELEASES_PATH) ? loadJson(RELEASES_PATH) : null;
  report(true, 'libraries/manifest.json', [...ms.errors, ...consistency, ...versionSyncErrors(manifest, releases)], []);

  const boards = [];
  for (const entry of manifest.boards || []) {
    const file = path.join(LIB_DIR, entry.file);
    let lib;
    try { lib = loadJson(file); } catch (e) { report(true, entry.file, [`could not parse JSON: ${e.message}`], []); continue; }
    boards.push(lib);
    const s = structuralValidate(lib, LIB_SCHEMA_PATH);
    anySkip = anySkip || s.skipped;
    const sem = boardSemanticErrors(lib);
    report(true, entry.file, [...s.errors, ...sem.errors], sem.warnings);
  }

  const cross = crossFileErrors(boards);
  if (cross.length) { anyError = true; console.error('✗ cross-file'); for (const e of cross) console.error(`    ERROR  ${e}`); }
  else console.log('✓ cross-file (merged catalog)');

  if (anySkip) console.log('\nNote: ajv not installed — ran semantic checks only. Run `npm install` for full structural validation.');
  return anyError;
}

function runLegacyMode(files) {
  let anyError = false;
  let anySkip = false;
  for (const file of files) {
    const rel = path.relative(process.cwd(), file);
    let lib;
    try { lib = loadJson(file); } catch (e) { anyError = true; console.error(`✗ ${rel}`); console.error(`    ERROR  could not parse JSON: ${e.message}`); continue; }
    const s = structuralValidate(lib, LIB_SCHEMA_PATH);
    anySkip = anySkip || s.skipped;
    const errors = [...s.errors, ...legacySemanticErrors(lib)];
    if (errors.length) { anyError = true; console.error(`✗ ${rel}`); for (const e of errors) console.error(`    ERROR  ${e}`); }
    else console.log(`✓ ${rel}`);
  }
  if (anySkip) console.log('\nNote: ajv not installed — ran semantic checks only. Run `npm install` for full structural validation.');
  return anyError;
}

function main() {
  const argv = process.argv.slice(2);
  let anyError;
  if (argv.length) {
    anyError = runLegacyMode(argv);
  } else if (fs.existsSync(MANIFEST_PATH)) {
    anyError = runManifestMode();
  } else {
    const files = fs.existsSync(LIB_DIR)
      ? fs.readdirSync(LIB_DIR).filter(f => f.endsWith('.json')).map(f => path.join(LIB_DIR, f)) : [];
    if (!files.length) { console.error('No library files to validate.'); process.exit(1); }
    anyError = runLegacyMode(files);
  }
  process.exit(anyError ? 1 : 0);
}

module.exports = { boardSemanticErrors, crossFileErrors, manifestConsistencyErrors, versionSyncErrors, legacySemanticErrors };

if (require.main === module) main();
```

- [ ] **Step 4: Run the validator unit tests to verify they pass**

Run: `npx jest test/validate.test.js`
Expected: PASS.

- [ ] **Step 5: Confirm legacy validation still works on the monolith**

Run: `npm run validate`
Expected: `✓ libraries/droidnet-astromech.json` (no manifest yet → legacy mode).

- [ ] **Step 6: Commit**

```bash
git add scripts/validate.js test/validate.test.js
git commit -m "$(printf 'feat(validate): cross-file manifest-mode validation\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 4: Split the monolith into per-board files + manifest

Generates `libraries/boards/*.json` and `libraries/manifest.json` from the monolith (preserving component order; each board carries exactly the enums its commands reference, so the two HCR boards both get `hcr.emotion`/`hcr.channel` byte-identically). Keeps the monolith for now (deleted in Task 6). After this task, `npm run validate` runs in manifest mode.

**Files:**
- Create: `scripts/split-monolith.js` (one-off generator, kept as provenance)
- Create: `libraries/boards/*.json` (7 files, generated)
- Create: `libraries/manifest.json` (generated)
- Test: `test/split.test.js` (create)

**Interfaces:**
- Consumes: `merge`, `deepEqual` from the engine (Task 1).

- [ ] **Step 1: Write the generator**

Create `scripts/split-monolith.js`:

```js
#!/usr/bin/env node
/* One-off: derive libraries/boards/*.json + libraries/manifest.json from the
 * monolithic libraries/droidnet-astromech.json. Each board gets exactly the
 * enums its commands reference (shared enums are duplicated byte-identically).
 * Kept in-repo as provenance; safe to re-run (idempotent). MPL-2.0. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIB_DIR = path.join(ROOT, 'libraries');
const mono = JSON.parse(fs.readFileSync(path.join(LIB_DIR, 'droidnet-astromech.json'), 'utf8'));
const boardsDir = path.join(LIB_DIR, 'boards');
fs.mkdirSync(boardsDir, { recursive: true });

const manifestBoards = [];
for (const comp of mono.components) {
  const used = new Set();
  for (const cmd of comp.commands || []) for (const p of cmd.params || []) if (p.enum) used.add(p.enum);
  const enums = {};
  for (const id of Object.keys(mono.enums || {})) if (used.has(id)) enums[id] = mono.enums[id];
  const board = { $schema: 'droidnet-command-library/library/v1', enums, components: [comp] };
  const file = `boards/${comp.id}.json`;
  fs.writeFileSync(path.join(LIB_DIR, file), JSON.stringify(board, null, 2) + '\n');
  manifestBoards.push({ id: comp.id, file, name: comp.name, confidence: comp.confidence || 'community' });
}

const manifest = {
  $schema: 'droidnet-command-library/catalog/v1',
  libraryVersion: '2.0.0',
  schemaVersion: 'v1',
  generatedFrom: mono.generatedFrom || 'libraries/droidnet-astromech.json',
  boards: manifestBoards,
};
fs.writeFileSync(path.join(LIB_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${manifestBoards.length} board files + manifest.json`);
```

- [ ] **Step 2: Run the generator**

Run: `node scripts/split-monolith.js`
Expected: `Wrote 7 board files + manifest.json`, creating `libraries/boards/{flthy-hps,magic-panel,rseries-logic,wcb-hcr,maestro,psi-pro,hcr-native}.json` and `libraries/manifest.json`.

- [ ] **Step 3: Write the equivalence + duplication tests**

Create `test/split.test.js`:

```js
const fs = require('fs');
const path = require('path');

function loadEngine() { jest.resetModules(); return require('../src/droidnet-command-library.js'); }

const LIB_DIR = path.join(__dirname, '..', 'libraries');
const mono = JSON.parse(fs.readFileSync(path.join(LIB_DIR, 'droidnet-astromech.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(LIB_DIR, 'manifest.json'), 'utf8'));
const boards = manifest.boards.map(b => JSON.parse(fs.readFileSync(path.join(LIB_DIR, b.file), 'utf8')));

test('manifest preserves the monolith component order', () => {
  expect(manifest.boards.map(b => b.id)).toEqual(mono.components.map(c => c.id));
});

test('each board file has exactly one component and no libraryVersion', () => {
  for (const b of boards) {
    expect(b.components).toHaveLength(1);
    expect(b.libraryVersion).toBeUndefined();
  }
});

test('the two HCR boards carry byte-identical shared enums', () => {
  const wcb = boards[manifest.boards.findIndex(b => b.id === 'wcb-hcr')];
  const nat = boards[manifest.boards.findIndex(b => b.id === 'hcr-native')];
  expect(JSON.stringify(wcb.enums['hcr.emotion'])).toBe(JSON.stringify(nat.enums['hcr.emotion']));
  expect(JSON.stringify(wcb.enums['hcr.channel'])).toBe(JSON.stringify(nat.enums['hcr.channel']));
});

test('merging the boards reproduces the monolith enums and components', () => {
  const cb = loadEngine();
  const merged = cb.merge(boards, { libraryVersion: '2.0.0' });
  expect(cb.deepEqual(merged.enums, mono.enums)).toBe(true);
  expect(cb.deepEqual(merged.components, mono.components)).toBe(true);
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest test/split.test.js`
Expected: PASS (all four).

- [ ] **Step 5: Confirm manifest-mode validation passes**

Run: `npm run validate`
Expected: `✓ libraries/manifest.json`, a `✓` per board file, and `✓ cross-file (merged catalog)`. (The leftover monolith at the libraries root is ignored in manifest mode.)

- [ ] **Step 6: Commit**

```bash
git add scripts/split-monolith.js libraries/boards libraries/manifest.json test/split.test.js
git commit -m "$(printf 'feat(libraries): split catalog into per-board files + manifest\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 5: Node loader helper

Adds `src/load-node.js` so Node consumers (and the migrated `engine.test.js`) read the manifest + boards from disk and merge them with one call. Wired into `package.json` `exports`.

**Files:**
- Create: `src/load-node.js`
- Modify: `package.json` (`exports` map at lines 17-21)
- Test: `test/load-node.test.js` (create)

**Interfaces:**
- Consumes: `loadLibrary`, `merge` from the engine (Task 1); `libraries/manifest.json` + boards (Task 4).
- Produces:
  - `readCatalog(libDir?) -> { manifest, boards }` — pure disk read; no engine mutation.
  - `loadCatalog({ libDir?, load = true }) -> engine | mergedLibraryObject` — `load` loads the engine and returns it; `load: false` returns `merge(boards, { libraryVersion })`.

- [ ] **Step 1: Write the failing tests**

Create `test/load-node.test.js`:

```js
const path = require('path');
const { readCatalog, loadCatalog } = require('../src/load-node.js');

test('readCatalog returns the manifest and every board, in order', () => {
  const { manifest, boards } = readCatalog();
  expect(manifest.libraryVersion).toBe('2.0.0');
  expect(boards).toHaveLength(manifest.boards.length);
  expect(boards.map(b => b.components[0].id)).toEqual(manifest.boards.map(b => b.id));
});

test('loadCatalog({ load: false }) returns the merged catalog object', () => {
  const lib = loadCatalog({ load: false });
  expect(lib.libraryVersion).toBe('2.0.0');
  expect(lib.components.length).toBe(7);
});

test('loadCatalog() loads the engine and resolves commands', () => {
  const engine = loadCatalog();
  expect(engine.getLibraryVersion()).toBe('2.0.0');
  expect(engine.getCommand('flthy.led.solid')).not.toBeNull();
  expect(engine.encode(engine.getCommand('flthy.led.solid'), { designator: 'A', color: '5' }, {})).toBe('A0055');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest test/load-node.test.js`
Expected: FAIL — `Cannot find module '../src/load-node.js'`.

- [ ] **Step 3: Implement the loader**

Create `src/load-node.js`:

```js
/*!
 * droidnet-command-library/node-loader — read the manifest + board files from
 * disk and merge them into the engine. Node-only (uses fs); dependency-free.
 *
 * Licensed under the Mozilla Public License 2.0 (see LICENSE).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const engine = require('./droidnet-command-library.js');

const DEFAULT_LIB_DIR = path.join(__dirname, '..', 'libraries');

function readCatalog(libDir) {
  libDir = libDir || DEFAULT_LIB_DIR;
  const manifest = JSON.parse(fs.readFileSync(path.join(libDir, 'manifest.json'), 'utf8'));
  const boards = manifest.boards.map(b => JSON.parse(fs.readFileSync(path.join(libDir, b.file), 'utf8')));
  return { manifest, boards };
}

function loadCatalog(opts) {
  opts = opts || {};
  const { manifest, boards } = readCatalog(opts.libDir);
  if (opts.load === false) return engine.merge(boards, { libraryVersion: manifest.libraryVersion });
  engine.loadLibrary(boards, { libraryVersion: manifest.libraryVersion });
  return engine;
}

module.exports = { readCatalog, loadCatalog };
```

- [ ] **Step 4: Wire the package export**

In `package.json`, replace the `exports` block (lines 17-21) with:

```json
  "exports": {
    ".": "./src/droidnet-command-library.js",
    "./ui": "./src/droidnet-command-library-ui.js",
    "./node-loader": "./src/load-node.js",
    "./schema": "./schema/library.schema.json"
  },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest test/load-node.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/load-node.js package.json test/load-node.test.js
git commit -m "$(printf 'feat(loader): Node manifest+boards loader (node-loader export)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 6: Migrate existing tests, delete the monolith, bump to 2.0.0

Repoints `engine.test.js` and `library.test.js` at the merged catalog, deletes `libraries/droidnet-astromech.json`, and bumps the package version. After this task nothing references the monolith.

**Files:**
- Modify: `test/engine.test.js:1-15` (loader/setup) and `:20-21` (version assertion)
- Modify: `test/library.test.js` (full rewrite of discovery + per-file assertions)
- Delete: `libraries/droidnet-astromech.json`
- Modify: `package.json:3` (`"version"`)

**Interfaces:**
- Consumes: `readCatalog` from `src/load-node.js` (Task 5).

- [ ] **Step 1: Repoint `engine.test.js` setup at the merged catalog**

In `test/engine.test.js`, replace lines 1-15 (the `require`s, `loadEngine`, `LIB` constant, and the first `beforeEach`) with:

```js
const { readCatalog } = require('../src/load-node.js');

// Fresh engine instance per call (the engine holds a module-level loaded library).
function loadEngine() {
  jest.resetModules();
  return require('../src/droidnet-command-library.js');
}

const { manifest, boards } = readCatalog();
const VERSION = manifest.libraryVersion;
function freshBoards() { return boards.map(b => JSON.parse(JSON.stringify(b))); }
function loadCatalog(cb) { cb.loadLibrary(freshBoards(), { libraryVersion: VERSION }); }

describe('engine lookups', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });
```

Then, within `engine.test.js`, update every other `beforeEach` that currently reads `cb.loadLibrary(LIB)` or `cb.loadLibrary(JSON.parse(JSON.stringify(LIB)))` to call `loadCatalog(cb)` instead. (There are several — one per `describe` block: `encode`, `match`, `build/parse`, `rseries-le`, `wcb-verb`, `PSIPro`, `hcr-native`. The `registerEncoder` block builds its own library and is unchanged.)

- [ ] **Step 2: Update the version assertion**

In `test/engine.test.js`, change the `getLibraryVersion` test (lines 20-21 area) from expecting `'1.0.0'` to:

```js
  test('getLibraryVersion reports the loaded version', () => {
    expect(cb.getLibraryVersion()).toBe('2.0.0');
  });
```

- [ ] **Step 3: Run the engine tests to verify they pass**

Run: `npx jest test/engine.test.js`
Expected: PASS — all encode/match/round-trip/disambiguation tests green against the merged catalog (confirms manifest order preserves PSI-vs-MagicPanel and HCR O-family behavior).

- [ ] **Step 4: Rewrite `library.test.js` for per-board files**

Replace the entire contents of `test/library.test.js` with:

```js
const fs = require('fs');
const path = require('path');

const LIB_DIR = path.join(__dirname, '..', 'libraries');
const BOARDS_DIR = path.join(LIB_DIR, 'boards');
const boardFiles = fs.readdirSync(BOARDS_DIR).filter(f => f.endsWith('.json'));
const manifest = JSON.parse(fs.readFileSync(path.join(LIB_DIR, 'manifest.json'), 'utf8'));

describe.each(boardFiles)('board %s', (file) => {
  const lib = JSON.parse(fs.readFileSync(path.join(BOARDS_DIR, file), 'utf8'));

  test('has exactly one component with required fields and a known kind', () => {
    expect(lib.components).toHaveLength(1);
    const c = lib.components[0];
    expect(c.id && c.name).toBeTruthy();
    expect(['device-native', 'wcb-verb']).toContain(c.kind);
    if (c.confidence) expect(['high', 'community', 'low']).toContain(c.confidence);
    expect(Array.isArray(c.commands)).toBe(true);
  });

  test('every command has an id, name, and template (or non-template encoder)', () => {
    for (const cmd of lib.components[0].commands) {
      expect(cmd.id && cmd.name).toBeTruthy();
      if ((cmd.encoder || 'template') === 'template') expect(typeof cmd.template).toBe('string');
      if (cmd.safety) expect(['cosmetic', 'movement', 'power', 'config']).toContain(cmd.safety);
    }
  });

  test('every param.enum resolves locally with code+label values', () => {
    const enums = lib.enums || {};
    for (const cmd of lib.components[0].commands) {
      for (const p of (cmd.params || [])) {
        if (!p.enum) continue;
        const e = enums[p.enum];
        if (!e) throw new Error(`enum ${p.enum} (in ${cmd.id}) is not defined in this board file`);
        for (const v of e.values) expect(typeof v.code === 'string' && typeof v.label === 'string').toBe(true);
      }
    }
  });

  test('every {param} placeholder has a matching param', () => {
    for (const cmd of lib.components[0].commands) {
      if ((cmd.encoder || 'template') !== 'template') continue;
      const names = (cmd.params || []).map(p => p.name);
      const placeholders = [...cmd.template.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
      for (const ph of placeholders) expect(names).toContain(ph);
    }
  });
});

describe('catalog', () => {
  test('every board file is listed in the manifest and vice-versa', () => {
    const listed = manifest.boards.map(b => b.file).sort();
    const onDisk = boardFiles.map(f => `boards/${f}`).sort();
    expect(onDisk).toEqual(listed);
  });

  test('command ids are unique across the whole catalog', () => {
    const seen = new Set();
    for (const f of boardFiles) {
      const lib = JSON.parse(fs.readFileSync(path.join(BOARDS_DIR, f), 'utf8'));
      for (const cmd of lib.components[0].commands) {
        expect(seen.has(cmd.id)).toBe(false);
        seen.add(cmd.id);
      }
    }
  });
});
```

- [ ] **Step 5: Delete the monolith and bump the version**

Run: `git rm libraries/droidnet-astromech.json`

In `package.json`, change line 3 from `"version": "1.0.0",` to `"version": "2.0.0",`.

- [ ] **Step 6: Run the full suite + validation**

Run: `npm test && npm run validate`
Expected: all jest suites PASS; validator prints `✓ libraries/manifest.json`, a `✓` per board, and `✓ cross-file (merged catalog)`.

- [ ] **Step 7: Commit**

```bash
git add test/engine.test.js test/library.test.js package.json libraries/droidnet-astromech.json
git commit -m "$(printf 'feat!: migrate tests to merged catalog; remove monolith; v2.0.0\n\nBREAKING CHANGE: libraries/droidnet-astromech.json is removed; load the\ncatalog via libraries/manifest.json + libraries/boards/ (see node-loader).\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 7: Update docs, releases.json, and CI comment

Brings every consumer-facing document in line with the manifest + per-board + runtime-merge model.

**Files:**
- Modify: `README.md` (Quick start browser block ~35-50; Node block ~54-63; "What's here" table ~83-91)
- Modify: `examples/node-example.js` (lines 9-10)
- Modify: `releases.json` (full)
- Modify: `docs/INTEGRATION_GUIDE.md` (Loading, Engine API, update-flow sections)
- Modify: `docs/BOARD_AUTHORING_GUIDE.md` (Anatomy, Versioning sections)
- Modify: `CONTRIBUTING.md` (Quick checklist + validator-enforces sections)
- Modify: `CLAUDE.md` (architecture diagram + engine API description)
- Modify: `.github/workflows/ci.yml:20` (validate-step comment)

- [ ] **Step 1: Update `examples/node-example.js`**

Replace lines 9-10 (the two `require`s of the engine + monolith):

```js
const DroidNetCommandLibrary = require('../src/droidnet-command-library.js');
const lib = require('../libraries/droidnet-astromech.json');

DroidNetCommandLibrary.loadLibrary(lib);
```

with:

```js
const DroidNetCommandLibrary = require('../src/droidnet-command-library.js');
const { readCatalog } = require('../src/load-node.js');

const { manifest, boards } = readCatalog();
DroidNetCommandLibrary.loadLibrary(boards, { libraryVersion: manifest.libraryVersion });
```

- [ ] **Step 2: Update `README.md`**

Replace the browser `<script>` example body (the `fetch('libraries/droidnet-astromech.json')...` chain) with a manifest-first fetch:

```html
<script>
  const base = 'libraries/';
  fetch(base + 'manifest.json')
    .then(r => r.json())
    .then(m => Promise.all(m.boards.map(b => fetch(base + b.file).then(r => r.json())))
      .then(boards => {
        DroidNetCommandLibrary.loadLibrary(boards, { libraryVersion: m.libraryVersion });
        DroidNetCommandLibraryUI.renderComposer(
          document.getElementById('host'),
          'A006^*** Flthy Rainbow',
          { onChange: (wire) => console.log(wire) }
        );
      }));
</script>
```

Replace the Node example body with the loader:

```js
const DroidNetCommandLibrary = require('droidnet-command-library');
require('droidnet-command-library/node-loader').loadCatalog(); // reads manifest + boards, merges, loads

const solid = DroidNetCommandLibrary.getCommand('flthy.led.solid');
DroidNetCommandLibrary.encode(solid, { designator: 'A', color: '5' }, {}); // 'A0055'
DroidNetCommandLibrary.match('A0055'); // { commandId: 'flthy.led.solid', params: {...} }
```

In the "What's here" table, replace the single-file row with two rows and add the loader:

```text
| `libraries/manifest.json` | Catalog entry point — ordered board list + catalog `libraryVersion`. |
| `libraries/boards/` | One self-contained file per board. Add yours here and list it in the manifest. |
| `src/load-node.js` | Node helper: read the manifest + boards and merge them (`node-loader` export). |
```

- [ ] **Step 3: Rewrite `releases.json`**

Replace the whole file with:

```json
{
  "$schema": "droidnet-command-library/releases/v1",
  "_comment": "Update pointer for the 'Update Library' flow. A device fetches this file, compares latest.libraryVersion to its installed catalog, and (if newer) downloads latest.url (the catalog manifest), then fetches each board listed in manifest.boards in order, validates them, and loads them via loadLibrary(boards, { libraryVersion }).",
  "latest": {
    "libraryVersion": "2.0.0",
    "schemaVersion": "v1",
    "releasedAt": "2026-06-26",
    "url": "https://raw.githubusercontent.com/travisccook/droidnet-command-library/main/libraries/manifest.json",
    "notes": "Per-board catalog: FlthyHPs, MagicPanel, RSeriesLogic, WCB·HCR, Maestro, PSIPro, HCR native, indexed by manifest.json."
  },
  "libraries": [
    {
      "id": "droidnet-astromech",
      "name": "DroidNet Astromech Boards",
      "libraryVersion": "2.0.0",
      "schemaVersion": "v1",
      "url": "https://raw.githubusercontent.com/travisccook/droidnet-command-library/main/libraries/manifest.json"
    }
  ]
}
```

- [ ] **Step 4: Update the guides, CONTRIBUTING, and CLAUDE.md**

- `docs/INTEGRATION_GUIDE.md`: in "Loading the engine", show the manifest-first browser fetch (as in Step 2) and the `node-loader` for Node; in "Engine API", add rows for `loadLibrary(lib | lib[], opts?)`, `mergeLibrary(lib)`, and `merge(lib | lib[], opts?)`; in "Keeping the library up to date", replace the single-file fetch with: fetch `releases.json` → compare `latest.libraryVersion` → fetch `latest.url` (manifest) → fetch each `manifest.boards[].file` in order → `loadLibrary(boards, { libraryVersion })` (note it is atomic: one bad board aborts the update and leaves the prior catalog intact).
- `docs/BOARD_AUTHORING_GUIDE.md`: in "Anatomy of a library", state that each file under `libraries/boards/` is a standalone mini-library (its own `enums` + exactly one `component`, no `libraryVersion`); if a board reuses an enum another board defines (e.g. `hcr.emotion`), copy it **byte-identically**. In "Versioning", state the catalog `libraryVersion` lives in `manifest.json` and is bumped there.
- `CONTRIBUTING.md`: in the Quick checklist, change "Add or edit a library under `libraries/`" to "Add or edit a board file under `libraries/boards/<id>.json`, and add/keep its entry in `libraries/manifest.json`"; note that the catalog version is bumped in the manifest. In "What the validator enforces", add: "Command ids are unique across **all** board files; a duplicated enum id must be byte-identical across files; the manifest and `boards/` agree (no missing or orphaned files); manifest version matches `releases.json`."
- `CLAUDE.md`: update the architecture diagram so the input is `libraries/manifest.json + libraries/boards/*.json` fetched and merged into the engine; update the engine-API description to note `loadLibrary(obj | array, opts?)`, `mergeLibrary`, and `merge`, and that board order is authoritative for `match()`.

- [ ] **Step 5: Update the CI comment**

In `.github/workflows/ci.yml`, change the step name/comment at line 20 from `Validate all libraries against the schema` to `Validate the manifest and all board libraries (schema + cross-file checks)`.

- [ ] **Step 6: Verify everything still runs**

Run: `npm run validate && npm test && node examples/node-example.js`
Expected: validator green; jest green; the example prints the built macro, parsed steps, `solid : F0051`, and a `match` object.

- [ ] **Step 7: Commit**

```bash
git add README.md examples/node-example.js releases.json docs/INTEGRATION_GUIDE.md docs/BOARD_AUTHORING_GUIDE.md CONTRIBUTING.md CLAUDE.md .github/workflows/ci.yml
git commit -m "$(printf 'docs: manifest + per-board catalog across docs and update flow\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 8: Final verification sweep

Confirms the whole catalog is consistent and nothing references the deleted monolith.

**Files:** none (verification only)

- [ ] **Step 1: Full green check**

Run: `npm run validate && npm test`
Expected: validator green (manifest, 7 boards, cross-file); all jest suites PASS.

- [ ] **Step 2: Confirm no lingering references to the monolith**

Run: `grep -rn "droidnet-astromech" . --include='*.js' --include='*.json' --include='*.md' --include='*.yml' | grep -v node_modules | grep -v docs/superpowers`
Expected: no output (the only remaining mentions, if any, are inside the spec/plan under `docs/superpowers/`, which describe the migration and are excluded).

- [ ] **Step 3: Confirm the package tarball ships the new layout**

Run: `npm pack --dry-run 2>&1 | grep -E 'manifest|boards/|load-node'`
Expected: lists `libraries/manifest.json`, the `libraries/boards/*.json` files, and `src/load-node.js`.

- [ ] **Step 4: Final commit (if Step 3 required a `files` tweak; otherwise skip)**

If `npm pack --dry-run` omitted the loader or boards, add them to `package.json` `files` (`"src/"` already covers `load-node.js`; `"libraries/"` already covers boards + manifest — a tweak should not be needed), then:

```bash
git add package.json
git commit -m "$(printf 'chore: ensure manifest+boards+loader are packaged\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Self-review notes

- **Spec coverage:** engine merge/hardening (§6 → Task 1), schema changes (§5 → Task 2), validator (§8 → Task 3), data split + manifest (§3,§4 → Task 4), Node loader (§7 → Task 5), tests (§9 → Tasks 1/3/4/5/6), docs + releases + version (§10 → Tasks 6,7), update flow (§11 → Task 7 docs), risk mitigations (§12 → Tasks 1/3). All spec sections map to a task.
- **Ordering keeps the suite green:** engine and schema/validator changes land before the data split; the monolith is removed only once nothing references it (Task 6); the validator's manifest mode activates exactly when the manifest appears (Task 4).
- **Type/name consistency:** `merge`, `loadLibrary`, `mergeLibrary`, `deepEqual`, `readCatalog`, `loadCatalog`, `boardSemanticErrors`, `crossFileErrors`, `manifestConsistencyErrors`, `versionSyncErrors` are used with identical signatures everywhere they appear.
