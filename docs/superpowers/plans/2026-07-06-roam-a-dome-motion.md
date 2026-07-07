# Roam-A-Dome (Motion) Board — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `roam-a-dome-motion` device-native board covering the reeltwo DomeControlFirmware runtime `:DP` motion verbs — 11 commands, all integer params, no enums.

**Architecture:** Pure JSON data change: one new board file + a manifest board-list entry + a version bump. No engine changes. Mirrors the sibling `r2uppityspinner-alt` board. Correctness enforced by `scripts/validate.js` (schema + semantic + version-sync), `test/web.test.js` (every command has an example; every bounded command's examples parse to a recognized step), and explicit `test/engine.test.js` assertions.

**Tech Stack:** Node 20, Jest, ajv. No build step.

## Global Constraints

- **Source of truth:** reeltwo DomeControlFirmware README, "Dome commands" (`:DP…` runtime family). Config `#DP…` family is a SEPARATE future board — do not add it here.
- **All params are integers** (`type: "int"`), `required: true`, with a `default`. No enums. The engine matches ints as `(-?\d+)`, so signed values round-trip.
- **Every template begins `:DP`.** Every command has a `commentLabel` and ≥1 `examples`.
- **Board meta:** `id: "roam-a-dome-motion"`, `name: "Roam-A-Dome (Motion)"`, `kind: "device-native"`, `confidence: "high"`, `firmware: "RDH (DomeControlFirmware)"`, routing `{ class:"broadcast", nativeWrapper:"none", durationSuffix:{ supported:false } }`.
- **Command-id prefix:** `rad.` (must be globally unique across the catalog — these are all new).
- **Version:** bump `libraryVersion` `2.3.0` → `2.4.0` (minor: new board) in BOTH `libraries/manifest.json` and `releases.json`; they must stay equal (validate enforces). `releases.json` `libraries[0].libraryVersion` too.
- After each task: `npm run validate && npm test` must pass.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `libraries/boards/roam-a-dome-motion.json` | The new board (11 commands, no enums) | Create |
| `libraries/manifest.json` | Catalog board list + version | Add board entry (Task 1); bump version (Task 2) |
| `releases.json` | Update pointer | Bump version (Task 2) |
| `test/engine.test.js` | Explicit encode/match assertions | Add a `describe('Roam-A-Dome motion')` block (Task 1); bump version assertion (Task 2) |
| `test/load-node.test.js` | Version assertions | Bump 3 assertions (Task 2) |

**Do NOT touch** synthetic-board tests (`test/merge.test.js`, `test/schema.test.js`) or any other board.

---

### Task 1: Create the Roam-A-Dome (Motion) board + tests + manifest entry

Adds the board file, its engine tests, and the manifest board-list entry. Version stays `2.3.0` this task (validate's version-sync stays satisfied because nothing version-related changes).

**Files:**
- Create: `libraries/boards/roam-a-dome-motion.json`
- Modify: `libraries/manifest.json` (add a board-list entry only — NOT the version)
- Modify: `test/engine.test.js` (add a `describe` block)

**Interfaces:**
- Produces 11 commands, all `encoder: "template"`, all params `type:"int"`:
  - `rad.rotate.abs` → `:DPA{deg}`
  - `rad.rotate.absRamp` → `:DPA{deg},{speed},{maxspeed}`
  - `rad.rotate.absRandom` → `:DPAR`
  - `rad.rotate.rel` → `:DPD{deg}`
  - `rad.rotate.relRandom` → `:DPDR`
  - `rad.spin` → `:DPR{speed}`
  - `rad.home` → `:DPH`
  - `rad.wait` → `:DPW{seconds}`
  - `rad.waitRandom` → `:DPWR{min},{max}`
  - `rad.playSeq` → `:DPS{number}`
  - `rad.togglePin` → `:DPT{pin}`

- [ ] **Step 1: Write the failing test block**

Add this block to `test/engine.test.js` (e.g. after the `describe('FlthyHPs special sequences')` block):

```js
describe('Roam-A-Dome motion', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('encodes absolute rotate', () => {
    expect(cb.encode(cb.getCommand('rad.rotate.abs'), { deg: '90' }, {})).toBe(':DPA90');
  });
  test('signed spin and relative round-trip', () => {
    expect(cb.match(':DPR-30')).toMatchObject({ commandId: 'rad.spin', params: { speed: '-30' } });
    expect(cb.match(':DPD-90')).toMatchObject({ commandId: 'rad.rotate.rel', params: { deg: '-90' } });
  });
  test('A-form disambiguation (abs / ramp / random)', () => {
    expect(cb.match(':DPA90')).toMatchObject({ commandId: 'rad.rotate.abs', params: { deg: '90' } });
    expect(cb.match(':DPA90,20,100')).toMatchObject({ commandId: 'rad.rotate.absRamp', params: { deg: '90', speed: '20', maxspeed: '100' } });
    expect(cb.match(':DPAR')).toMatchObject({ commandId: 'rad.rotate.absRandom' });
  });
  test('wait vs wait-random split', () => {
    expect(cb.match(':DPW2')).toMatchObject({ commandId: 'rad.wait', params: { seconds: '2' } });
    expect(cb.match(':DPWR10,20')).toMatchObject({ commandId: 'rad.waitRandom', params: { min: '10', max: '20' } });
  });
  test('does not collide with r2uppityspinner-alt (:P vs :DP)', () => {
    expect(cb.match(':PR-80')).toMatchObject({ commandId: 'uppity.rotary.spin', params: { speed: '-80' } });
    expect(cb.match(':DPR-80')).toMatchObject({ commandId: 'rad.spin', params: { speed: '-80' } });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest test/engine.test.js -t "Roam-A-Dome motion"`
Expected: FAIL — `getCommand('rad.rotate.abs')` is null, so `encode` throws / `match` returns null.

- [ ] **Step 3: Create the board file**

Create `libraries/boards/roam-a-dome-motion.json` with exactly this content:

```json
{
  "$schema": "droidnet-command-library/library/v1",
  "generatedFrom": "reeltwo DomeControlFirmware (Roam-A-Dome) README — runtime :DP motion commands",
  "enums": {},
  "components": [
    {
      "id": "roam-a-dome-motion",
      "name": "Roam-A-Dome (Motion)",
      "kind": "device-native",
      "confidence": "high",
      "firmware": "RDH (DomeControlFirmware)",
      "routing": {
        "class": "broadcast",
        "nativeWrapper": "none",
        "durationSuffix": { "supported": false }
      },
      "commands": [
        {
          "id": "rad.rotate.abs",
          "name": "Rotate to Absolute",
          "group": "Rotate",
          "safety": "movement",
          "encoder": "template",
          "template": ":DPA{deg}",
          "params": [
            { "name": "deg", "type": "int", "min": -359, "max": 359, "required": true, "default": 180 }
          ],
          "examples": [":DPA90", ":DPA270", ":DPA-90"],
          "commentLabel": "RAD rotate absolute"
        },
        {
          "id": "rad.rotate.absRamp",
          "name": "Rotate to Absolute (speed ramp)",
          "group": "Rotate",
          "safety": "movement",
          "encoder": "template",
          "template": ":DPA{deg},{speed},{maxspeed}",
          "params": [
            { "name": "deg", "type": "int", "min": -359, "max": 359, "required": true, "default": 90 },
            { "name": "speed", "type": "int", "min": 0, "max": 100, "required": true, "default": 20 },
            { "name": "maxspeed", "type": "int", "min": 0, "max": 100, "required": true, "default": 100 }
          ],
          "examples": [":DPA90,20,100", ":DPA180,40,80"],
          "commentLabel": "RAD rotate absolute + ramp"
        },
        {
          "id": "rad.rotate.absRandom",
          "name": "Rotate to Random Absolute",
          "group": "Rotate",
          "safety": "movement",
          "encoder": "template",
          "template": ":DPAR",
          "params": [],
          "examples": [":DPAR"],
          "commentLabel": "RAD rotate random absolute"
        },
        {
          "id": "rad.rotate.rel",
          "name": "Rotate Relative",
          "group": "Rotate",
          "safety": "movement",
          "encoder": "template",
          "template": ":DPD{deg}",
          "params": [
            { "name": "deg", "type": "int", "min": -360, "max": 360, "required": true, "default": 90 }
          ],
          "examples": [":DPD90", ":DPD-90", ":DPD45"],
          "commentLabel": "RAD rotate relative (+ CCW / - CW)"
        },
        {
          "id": "rad.rotate.relRandom",
          "name": "Rotate Random Relative",
          "group": "Rotate",
          "safety": "movement",
          "encoder": "template",
          "template": ":DPDR",
          "params": [],
          "examples": [":DPDR"],
          "commentLabel": "RAD rotate random relative"
        },
        {
          "id": "rad.spin",
          "name": "Spin Continuous",
          "group": "Spin",
          "safety": "movement",
          "encoder": "template",
          "template": ":DPR{speed}",
          "params": [
            { "name": "speed", "type": "int", "min": -100, "max": 100, "required": true, "default": 30 }
          ],
          "examples": [":DPR30", ":DPR-30", ":DPR0"],
          "commentLabel": "RAD spin (- CW, 0 = stop)"
        },
        {
          "id": "rad.home",
          "name": "Home",
          "group": "Home",
          "safety": "movement",
          "encoder": "template",
          "template": ":DPH",
          "params": [],
          "examples": [":DPH"],
          "commentLabel": "RAD home"
        },
        {
          "id": "rad.wait",
          "name": "Wait Seconds",
          "group": "Timing",
          "safety": "cosmetic",
          "encoder": "template",
          "template": ":DPW{seconds}",
          "params": [
            { "name": "seconds", "type": "int", "min": 1, "max": 600, "required": true, "default": 2 }
          ],
          "examples": [":DPW2", ":DPW60"],
          "commentLabel": "RAD wait"
        },
        {
          "id": "rad.waitRandom",
          "name": "Wait Random Range",
          "group": "Timing",
          "safety": "cosmetic",
          "encoder": "template",
          "template": ":DPWR{min},{max}",
          "params": [
            { "name": "min", "type": "int", "min": 1, "max": 600, "required": true, "default": 10 },
            { "name": "max", "type": "int", "min": 1, "max": 600, "required": true, "default": 20 }
          ],
          "examples": [":DPWR10,20"],
          "commentLabel": "RAD wait random range"
        },
        {
          "id": "rad.playSeq",
          "name": "Play Stored Sequence",
          "group": "Playback",
          "safety": "movement",
          "encoder": "template",
          "template": ":DPS{number}",
          "params": [
            { "name": "number", "type": "int", "min": 0, "max": 100, "required": true, "default": 1 }
          ],
          "examples": [":DPS1", ":DPS0"],
          "commentLabel": "RAD play sequence"
        },
        {
          "id": "rad.togglePin",
          "name": "Toggle Pin",
          "group": "Pins",
          "safety": "power",
          "encoder": "template",
          "template": ":DPT{pin}",
          "params": [
            { "name": "pin", "type": "int", "min": 1, "max": 8, "required": true, "default": 1 }
          ],
          "examples": [":DPT3", ":DPT1"],
          "commentLabel": "RAD toggle pin"
        }
      ]
    }
  ]
}
```

- [ ] **Step 4: Add the manifest board-list entry (NOT the version)**

In `libraries/manifest.json`, add this object to the END of the `boards` array (after the last existing entry — mind the comma on the previous entry). Leave `libraryVersion` unchanged at `2.3.0`:

```json
    {
      "id": "roam-a-dome-motion",
      "file": "boards/roam-a-dome-motion.json",
      "name": "Roam-A-Dome (Motion)",
      "confidence": "high"
    }
```

- [ ] **Step 5: Run the new tests + validate + full suite**

Run: `npx jest test/engine.test.js -t "Roam-A-Dome motion" && npm run validate && npm test`
Expected: PASS — the new block is green; `library.test.js` "every board file is listed in the manifest and vice-versa" passes (board added to both disk and manifest); `web.test.js` round-trips every new example; validate clean (version-sync still 2.3.0 == 2.3.0).

- [ ] **Step 6: Commit**

```bash
git add libraries/boards/roam-a-dome-motion.json libraries/manifest.json test/engine.test.js
git commit -m "feat(roam-a-dome): add Motion board — :DP rotate/spin/home/wait/seq/pin verbs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Version bump 2.3.0 → 2.4.0

Bumps the catalog version and release pointer together and updates the version assertions.

**Files:**
- Modify: `libraries/manifest.json` (`libraryVersion`)
- Modify: `releases.json` (`latest.libraryVersion`, `latest.releasedAt`, `latest.notes`, `libraries[0].libraryVersion`)
- Modify: `test/engine.test.js` (1 version assertion)
- Modify: `test/load-node.test.js` (3 version assertions)

**Interfaces:** none (final integration task).

- [ ] **Step 1: Update the version assertions first (they will fail until the bump lands)**

In `test/engine.test.js`, change the assertion `expect(cb.getLibraryVersion()).toBe('2.3.0');` to:
```js
    expect(cb.getLibraryVersion()).toBe('2.4.0');
```
In `test/load-node.test.js`, change all three `'2.3.0'` version assertions (`manifest.libraryVersion`, `lib.libraryVersion`, `engine.getLibraryVersion()`) to `'2.4.0'`:
```js
  expect(manifest.libraryVersion).toBe('2.4.0');
```
```js
  expect(lib.libraryVersion).toBe('2.4.0');
```
```js
  expect(engine.getLibraryVersion()).toBe('2.4.0');
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest test/engine.test.js test/load-node.test.js`
Expected: FAIL — version is still `2.3.0`.

- [ ] **Step 3: Bump the manifest**

In `libraries/manifest.json`, change `"libraryVersion": "2.3.0",` to:
```json
  "libraryVersion": "2.4.0",
```

- [ ] **Step 4: Bump the release pointer**

In `releases.json`, set `latest.libraryVersion`, `latest.releasedAt`, `latest.notes`, and `libraries[0].libraryVersion`:
```json
  "latest": {
    "libraryVersion": "2.4.0",
    "schemaVersion": "v1",
    "releasedAt": "2026-07-06",
    "url": "https://raw.githubusercontent.com/travisccook/droidnet-command-library/main/libraries/manifest.json",
    "notes": "Minor: adds the Roam-A-Dome (Motion) board — the reeltwo DomeControlFirmware runtime :DP motion verbs (rotate absolute/relative + random, continuous spin, home, wait, play stored sequence, toggle pin)."
  },
```
and in `libraries[0]`:
```json
      "libraryVersion": "2.4.0",
```

- [ ] **Step 5: Run validate + full suite**

Run: `npm run validate && npm test`
Expected: PASS — `versionSyncErrors` clean (manifest === releases), all suites green.

- [ ] **Step 6: Commit**

```bash
git add libraries/manifest.json releases.json test/engine.test.js test/load-node.test.js
git commit -m "chore(release): bump library to 2.4.0 for Roam-A-Dome Motion board

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] `npm run validate && npm test` — all green.
- [ ] `node -e "const {readCatalog}=require('./src/load-node.js');const e=require('./src/droidnet-command-library.js');const {manifest,boards}=readCatalog();e.loadLibrary(boards,{libraryVersion:manifest.libraryVersion});console.log(e.getCommands('roam-a-dome-motion').length+' RAD motion commands @ v'+manifest.libraryVersion);"` — expect `11 RAD motion commands @ v2.4.0`.
- [ ] Confirm canonical tokens recognize to the right command and DON'T collide with uppity: `:DPA90`→`rad.rotate.abs`, `:DPA90,20,100`→`rad.rotate.absRamp`, `:DPAR`→`rad.rotate.absRandom`, `:DPD-90`→`rad.rotate.rel`, `:DPR-30`→`rad.spin`, `:DPWR10,20`→`rad.waitRandom`, `:DPS1`→`rad.playSeq`, `:DPT3`→`rad.togglePin`; and `:PR-80`→`uppity.rotary.spin` (unchanged).

## Spec coverage self-check

- 11 `:DP` motion commands → Task 1 (board file). No enums (all int) → board has `"enums": {}`. Manifest board entry → Task 1. Signed round-trip (spin/rel/abs-neg) → engine tests + examples. Grammar disambiguation (A-forms, wait/waitRandom) → engine tests. Cross-board non-collision vs uppity → engine test + spec analysis. Version 2.3.0→2.4.0 + releases sync → Task 2. Config `#DP` family + colon-chaining + `#DPS` sequence-def → explicitly out of scope (separate board).
