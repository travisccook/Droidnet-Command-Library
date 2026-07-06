# FlthyHPs v1.8 Full Command Reference — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand `libraries/boards/flthy-hps.json` from 2 (mis-encoded) commands to the full FlthyHPs v1.8 device command set — 16 commands across 6 enums — and correct the two existing commands.

**Architecture:** Pure JSON data change to one board file, driven by the schema-driven `template` encoder. No engine code changes. Correctness is enforced by three existing test layers: `scripts/validate.js` (schema + semantic + version-sync), `test/web.test.js` (every command has an example; every bounded command's examples parse to a recognized step), and explicit `test/engine.test.js` encode/match/round-trip assertions.

**Tech Stack:** Node 20, Jest, ajv. No build step.

## Global Constraints

- **Source of truth:** FlthyHPs Manual v1.8 command table (pp. 22–24). Where the current JSON or the manual's p.23 *examples* disagree with the p.22 command *table*, the table wins.
- **Designators:** `F`, `R`, `T`, `A` only. `X`/`Y`/`Z` are removed (not in v1.8).
- **Wire grammar:** `D T ## [C] [S|P]` — Designator, Type (`0`=LED, `1`=Servo), 2-or-3-digit Sequence, optional Color/Speed/Position. Special `S#` sequences carry no designator.
- **Matcher limitation:** template params are NOT optional — every `{param}` is a required capture group. Any param that must always appear in the wire is `required` and carries a `default`.
- **Version:** bump `libraryVersion` `2.2.1` → `2.3.0` (minor) in BOTH `libraries/manifest.json` and `releases.json`; they must stay equal (validate enforces it).
- **Every command needs ≥1 `examples` string.** All params in this board are `enum` or `type:int`, so `web.test.js` treats every command as "bounded" and round-trips every example — a bad example fails the suite.
- After each task: `npm run validate && npm test` must pass.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `libraries/boards/flthy-hps.json` | The board grammar (enums + commands) | Rewrite: 6 enums, 16 commands |
| `libraries/manifest.json` | Catalog version + board list | Bump `libraryVersion` to `2.3.0` |
| `releases.json` | Update pointer for host apps | Bump `latest.libraryVersion` + `libraries[0].libraryVersion` to `2.3.0`; update `notes` + `releasedAt` |
| `test/engine.test.js` | Explicit encode/match/round-trip assertions | Correct the pinned solid/rainbow encodings; add assertions for new commands |
| `test/load-node.test.js` | Catalog load + one solid encode assertion | Correct solid encoding; bump version assertions |
| `test/fixtures/commands.sample.json` | Round-trip fixture macros | Correct the `rainbowdemo` macro `A006` → `A007` |

**Tests that use SYNTHETIC `flthy` boards and must NOT be touched:** `test/merge.test.js` (its `boardFlthy()` is a fake board with template `{color}`) and `test/schema.test.js` (inline `flthy.solid` fixture). Leave both entirely alone.

---

### Task 1: Correct the two existing commands + drop X/Y/Z designators

Fixes the off-by-one bug: `solid` currently emits `005` (= Short Circuit) and `rainbow` emits `006` (= Solid). Correct to `006`/`007`, and remove the non-v1.8 `X`/`Y`/`Z` designators. Update every test/fixture that pins the old wire strings. Version stays `2.2.1` this task.

**Files:**
- Modify: `libraries/boards/flthy-hps.json` (designator enum; `flthy.led.solid` + `flthy.led.rainbow` templates)
- Modify: `test/engine.test.js` (lines pinning `A0055`/`A006`)
- Modify: `test/load-node.test.js:21`
- Modify: `test/fixtures/commands.sample.json:4`

**Interfaces:**
- Produces: `flthy.led.solid` → template `{designator}006{color}` (params `designator`, `color` default `5`); `flthy.led.rainbow` → template `{designator}007` (param `designator`). Both `supportsDuration: true`, `safety: cosmetic`, `group: "LED Effects"`.

- [ ] **Step 1: Update the engine tests to the corrected encodings (write the new expectations first)**

In `test/engine.test.js`, make exactly these replacements:

Line 44 — `substitutes enum params`:
```js
    expect(cb.encode(cb.getCommand('flthy.led.solid'), { designator: 'A', color: '5' }, {})).toBe('A0065');
```
Line 47 — `uses param default when value missing`:
```js
    expect(cb.encode(cb.getCommand('flthy.led.solid'), { designator: 'A' }, {})).toBe('A0065');
```
Line 50 — `appends duration with the component sep`:
```js
    expect(cb.encode(cb.getCommand('flthy.led.rainbow'), { designator: 'A' }, { duration: 240 })).toBe('A007|240');
```
Line 65 — `recognizes a FlthyHPs solid token`:
```js
    expect(cb.match('A0065')).toEqual({ commandId: 'flthy.led.solid', params: { designator: 'A', color: '5' }, duration: undefined });
```
Line 68 — `recovers a duration suffix`:
```js
    expect(cb.match('A007|240')).toEqual({ commandId: 'flthy.led.rainbow', params: { designator: 'A' }, duration: 240 });
```
Lines 84 & 88 — `buildWCBValue joins steps and emits labels` (change the rainbow token in the expected string):
```js
      { type: 'command', commandId: 'flthy.led.rainbow', params: { designator: 'A' }, label: ' Flthy rainbow' },
```
```js
    expect(v).toBe('A007^*** Flthy rainbow^;t500^T52');
```
Lines 92 & 93 — `parseWCBValue recognizes commands, raw, and labels`:
```js
    const steps = cb.parseWCBValue('A007^*** Flthy rainbow^<XYZ>^*** raw note');
    expect(steps[0]).toMatchObject({ type: 'command', commandId: 'flthy.led.rainbow', label: ' Flthy rainbow' });
```
Line 105 — `round-trips a bare *** comment fragment`:
```js
    const v = 'A007^***';
```

In `test/load-node.test.js`, line 21:
```js
  expect(engine.encode(engine.getCommand('flthy.led.solid'), { designator: 'A', color: '5' }, {})).toBe('A0065');
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest test/engine.test.js test/load-node.test.js`
Expected: FAIL — the board still emits `A0055`/`A006`, so the new `A0065`/`A007` expectations don't match yet.

- [ ] **Step 3: Correct the board JSON**

In `libraries/boards/flthy-hps.json`:

(a) Remove the `X`, `Y`, `Z` entries from `flthy.designator.values`, leaving exactly:
```json
      "values": [
        { "code": "F", "label": "Front" },
        { "code": "R", "label": "Rear" },
        { "code": "T", "label": "Top" },
        { "code": "A", "label": "All" }
      ]
```

(b) Change `flthy.led.solid`'s template from `{designator}005{color}` to:
```json
          "template": "{designator}006{color}",
```
and set its examples to:
```json
          "examples": ["A0065", "R0063", "A0065|60"],
```

(c) Change `flthy.led.rainbow`'s template from `{designator}006` to:
```json
          "template": "{designator}007",
```
and set its examples to:
```json
          "examples": ["T007", "A007|45"],
```

- [ ] **Step 4: Update the fixture macro**

In `test/fixtures/commands.sample.json`, change the `rainbowdemo` entry (line 4) from `A006` to `A007`:
```json
  { "key": "rainbowdemo", "value": "A007^*** Flthy Rainbow^T52^*** MP VU Meter" },
```

- [ ] **Step 5: Run validate + full test suite**

Run: `npm run validate && npm test`
Expected: PASS — all suites green (version still `2.2.1`).

- [ ] **Step 6: Commit**

```bash
git add libraries/boards/flthy-hps.json test/engine.test.js test/load-node.test.js test/fixtures/commands.sample.json
git commit -m "fix(flthy): correct solid (006) and rainbow (007) sequence codes; drop non-v1.8 X/Y/Z designators

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Add the remaining LED-effect commands

Adds Leia, Color Projector, Dim Pulse, Cycle, Short Circuit, and the collapsed Clear/Auto command — completing LED coverage (`T=0`).

**Files:**
- Modify: `libraries/boards/flthy-hps.json` (add `flthy.ledClearMode` enum; add 6 commands)
- Modify: `test/engine.test.js` (add a `describe('FlthyHPs LED effects')` block)

**Interfaces:**
- Consumes: `flthy.designator`, `flthy.color` (existing).
- Produces commands (all `group: "LED Effects"`, `safety: "cosmetic"`, `supportsDuration: true`):
  - `flthy.led.leia` → `{designator}001`
  - `flthy.led.colorproj` → `{designator}002{color}`
  - `flthy.led.dimpulse` → `{designator}003{color}{speed}` (`speed` int 0–9, required, default 5)
  - `flthy.led.cycle` → `{designator}004{color}`
  - `flthy.led.shortcircuit` → `{designator}005{color}` (color default `7`)
  - `flthy.led.clearauto` → `{designator}0{mode}` (`mode` = `flthy.ledClearMode`; `supportsDuration: false`)

- [ ] **Step 1: Write the failing tests**

Add this block to `test/engine.test.js` (e.g. after the existing `describe('match (template)'` block):

```js
describe('FlthyHPs LED effects', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('leia encodes and round-trips (color-free)', () => {
    expect(cb.encode(cb.getCommand('flthy.led.leia'), { designator: 'F' }, {})).toBe('F001');
    expect(cb.match('F001')).toMatchObject({ commandId: 'flthy.led.leia', params: { designator: 'F' } });
  });
  test('color projector carries a color', () => {
    expect(cb.encode(cb.getCommand('flthy.led.colorproj'), { designator: 'F', color: '5' }, {})).toBe('F0025');
    expect(cb.match('F0025')).toMatchObject({ commandId: 'flthy.led.colorproj', params: { designator: 'F', color: '5' } });
  });
  test('dim pulse always emits the required speed digit and round-trips', () => {
    expect(cb.encode(cb.getCommand('flthy.led.dimpulse'), { designator: 'A', color: '6' }, {})).toBe('A00365'); // speed defaults to 5
    expect(cb.encode(cb.getCommand('flthy.led.dimpulse'), { designator: 'A', color: '6', speed: '2' }, {})).toBe('A00362');
    expect(cb.match('A00362')).toMatchObject({ commandId: 'flthy.led.dimpulse', params: { designator: 'A', color: '6', speed: '2' } });
  });
  test('short circuit defaults to orange (shortColor)', () => {
    expect(cb.encode(cb.getCommand('flthy.led.shortcircuit'), { designator: 'A' }, {})).toBe('A0057');
  });
  test('clear/auto uses longest-code-first so 3-digit modes win', () => {
    expect(cb.encode(cb.getCommand('flthy.led.clearauto'), { designator: 'A', mode: '96' }, {})).toBe('A096');
    expect(cb.match('A0971')).toMatchObject({ commandId: 'flthy.led.clearauto', params: { designator: 'A', mode: '971' } });
    expect(cb.match('A096')).toMatchObject({ commandId: 'flthy.led.clearauto', params: { designator: 'A', mode: '96' } });
  });
  test('clear/auto ignores a duration suffix (unsupported)', () => {
    // supportsDuration:false -> a trailing |n is not consumed, token falls through to raw
    expect(cb.match('A096|30')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest test/engine.test.js -t "FlthyHPs LED effects"`
Expected: FAIL — `getCommand('flthy.led.leia')` is null, so `encode` throws / `match` returns null.

- [ ] **Step 3: Add the enum**

In `libraries/boards/flthy-hps.json`, add to the top-level `enums` object:

```json
    "flthy.ledClearMode": {
      "label": "Clear / Auto Mode",
      "values": [
        { "code": "96",  "label": "Clear · No Off-Color · Auto Off" },
        { "code": "971", "label": "Clear · No Off-Color · Auto Default" },
        { "code": "972", "label": "Clear · No Off-Color · Auto Random" },
        { "code": "98",  "label": "Clear · Off-Color · Auto Off" },
        { "code": "991", "label": "Clear · Off-Color · Auto Default" },
        { "code": "992", "label": "Clear · Off-Color · Auto Random" }
      ]
    }
```

- [ ] **Step 4: Add the 6 commands**

Add these to the `flthy-hps` component's `commands` array (order them before `flthy.led.solid` so the LED group reads 01→07; order does not affect matching here since every template is unambiguous):

```json
        {
          "id": "flthy.led.leia",
          "name": "Leia",
          "group": "LED Effects",
          "safety": "cosmetic",
          "encoder": "template",
          "template": "{designator}001",
          "params": [
            { "name": "designator", "enum": "flthy.designator", "required": true }
          ],
          "supportsDuration": true,
          "examples": ["F001", "A001|30"],
          "commentLabel": "Flthy Leia"
        },
        {
          "id": "flthy.led.colorproj",
          "name": "Color Projector",
          "group": "LED Effects",
          "safety": "cosmetic",
          "encoder": "template",
          "template": "{designator}002{color}",
          "params": [
            { "name": "designator", "enum": "flthy.designator", "required": true },
            { "name": "color", "enum": "flthy.color", "default": "5" }
          ],
          "supportsDuration": true,
          "examples": ["F0025", "A0023|20"],
          "commentLabel": "Flthy color projector"
        },
        {
          "id": "flthy.led.dimpulse",
          "name": "Dim Pulse",
          "group": "LED Effects",
          "safety": "cosmetic",
          "encoder": "template",
          "template": "{designator}003{color}{speed}",
          "params": [
            { "name": "designator", "enum": "flthy.designator", "required": true },
            { "name": "color", "enum": "flthy.color", "default": "5" },
            { "name": "speed", "type": "int", "min": 0, "max": 9, "default": 5, "required": true }
          ],
          "supportsDuration": true,
          "examples": ["A00365", "F00362|30"],
          "commentLabel": "Flthy dim pulse"
        },
        {
          "id": "flthy.led.cycle",
          "name": "Cycle",
          "group": "LED Effects",
          "safety": "cosmetic",
          "encoder": "template",
          "template": "{designator}004{color}",
          "params": [
            { "name": "designator", "enum": "flthy.designator", "required": true },
            { "name": "color", "enum": "flthy.color", "default": "5" }
          ],
          "supportsDuration": true,
          "examples": ["F0043", "A0045|20"],
          "commentLabel": "Flthy cycle"
        },
        {
          "id": "flthy.led.shortcircuit",
          "name": "Short Circuit",
          "group": "LED Effects",
          "safety": "cosmetic",
          "encoder": "template",
          "template": "{designator}005{color}",
          "params": [
            { "name": "designator", "enum": "flthy.designator", "required": true },
            { "name": "color", "enum": "flthy.color", "default": "7" }
          ],
          "supportsDuration": true,
          "examples": ["A0057", "F0055|10"],
          "commentLabel": "Flthy short circuit"
        },
        {
          "id": "flthy.led.clearauto",
          "name": "Clear / Auto Mode",
          "group": "LED Effects",
          "safety": "cosmetic",
          "encoder": "template",
          "template": "{designator}0{mode}",
          "params": [
            { "name": "designator", "enum": "flthy.designator", "required": true },
            { "name": "mode", "enum": "flthy.ledClearMode", "required": true }
          ],
          "supportsDuration": false,
          "examples": ["A096", "A0971", "F0992"],
          "commentLabel": "Flthy clear/auto"
        },
```

- [ ] **Step 5: Run the new tests + validate**

Run: `npx jest test/engine.test.js -t "FlthyHPs LED effects" && npm run validate && npm test`
Expected: PASS — new block green, `web.test.js` round-trips every new example, validate clean.

- [ ] **Step 6: Commit**

```bash
git add libraries/boards/flthy-hps.json test/engine.test.js
git commit -m "feat(flthy): add Leia, Color Projector, Dim Pulse, Cycle, Short Circuit, Clear/Auto LED commands

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Add the servo commands

Adds the `T=1` servo functions, per the manual's p.22 command table (not the contradictory p.23 examples).

**Files:**
- Modify: `libraries/boards/flthy-hps.json` (add `flthy.position` + `flthy.servoTwitch` enums; add 7 commands)
- Modify: `test/engine.test.js` (add a `describe('FlthyHPs servo')` block)

**Interfaces:**
- Consumes: `flthy.designator` (existing).
- Produces commands (all `group: "Servo"`, `safety: "movement"`, `supportsDuration: false`):
  - `flthy.servo.preset` → `{designator}101{position}` (`position` = `flthy.position`)
  - `flthy.servo.rc-lr` → `{designator}102`
  - `flthy.servo.rc-ud` → `{designator}103`
  - `flthy.servo.random` → `{designator}104`
  - `flthy.servo.wag-lr` → `{designator}105`
  - `flthy.servo.wag-ud` → `{designator}106`
  - `flthy.servo.autotwitch` → `{designator}1{mode}` (`mode` = `flthy.servoTwitch`)

- [ ] **Step 1: Write the failing tests**

Add to `test/engine.test.js`:

```js
describe('FlthyHPs servo', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('preset position carries a position and round-trips', () => {
    expect(cb.encode(cb.getCommand('flthy.servo.preset'), { designator: 'F', position: '1' }, {})).toBe('F1011');
    expect(cb.match('F1011')).toMatchObject({ commandId: 'flthy.servo.preset', params: { designator: 'F', position: '1' } });
  });
  test('table semantics: 103 = RC Up/Down, 104 = Random (not the p.23 examples)', () => {
    expect(cb.match('F103')).toMatchObject({ commandId: 'flthy.servo.rc-ud', params: { designator: 'F' } });
    expect(cb.match('A104')).toMatchObject({ commandId: 'flthy.servo.random', params: { designator: 'A' } });
  });
  test('wag commands encode', () => {
    expect(cb.encode(cb.getCommand('flthy.servo.wag-lr'), { designator: 'F' }, {})).toBe('F105');
    expect(cb.encode(cb.getCommand('flthy.servo.wag-ud'), { designator: 'F' }, {})).toBe('F106');
  });
  test('auto twitch on/off and preset do not collide', () => {
    expect(cb.match('T199')).toMatchObject({ commandId: 'flthy.servo.autotwitch', params: { designator: 'T', mode: '99' } });
    expect(cb.match('A198')).toMatchObject({ commandId: 'flthy.servo.autotwitch', params: { designator: 'A', mode: '98' } });
    expect(cb.match('F1011')).toMatchObject({ commandId: 'flthy.servo.preset' }); // still preset, not autotwitch
  });
  test('servo commands ignore a duration suffix', () => {
    expect(cb.match('F104|30')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest test/engine.test.js -t "FlthyHPs servo"`
Expected: FAIL — servo commands not defined yet.

- [ ] **Step 3: Add the enums**

Add to the board's `enums`:

```json
    "flthy.position": {
      "label": "Position",
      "values": [
        { "code": "0", "label": "Down" },
        { "code": "1", "label": "Center" },
        { "code": "2", "label": "Up" },
        { "code": "3", "label": "Left" },
        { "code": "4", "label": "Upper Left" },
        { "code": "5", "label": "Lower Left" },
        { "code": "6", "label": "Right" },
        { "code": "7", "label": "Upper Right" },
        { "code": "8", "label": "Lower Right" }
      ]
    },
    "flthy.servoTwitch": {
      "label": "Auto Twitch",
      "values": [
        { "code": "98", "label": "Disable" },
        { "code": "99", "label": "Enable" }
      ]
    }
```

- [ ] **Step 4: Add the 7 commands**

Append to the component's `commands` array:

```json
        {
          "id": "flthy.servo.preset",
          "name": "Preset Position",
          "group": "Servo",
          "safety": "movement",
          "encoder": "template",
          "template": "{designator}101{position}",
          "params": [
            { "name": "designator", "enum": "flthy.designator", "required": true },
            { "name": "position", "enum": "flthy.position", "required": true }
          ],
          "supportsDuration": false,
          "examples": ["F1011", "A1010"],
          "commentLabel": "Flthy preset position"
        },
        {
          "id": "flthy.servo.rc-lr",
          "name": "RC Control L/R",
          "group": "Servo",
          "safety": "movement",
          "encoder": "template",
          "template": "{designator}102",
          "params": [
            { "name": "designator", "enum": "flthy.designator", "required": true }
          ],
          "supportsDuration": false,
          "examples": ["F102"],
          "commentLabel": "Flthy RC L/R"
        },
        {
          "id": "flthy.servo.rc-ud",
          "name": "RC Control U/D",
          "group": "Servo",
          "safety": "movement",
          "encoder": "template",
          "template": "{designator}103",
          "params": [
            { "name": "designator", "enum": "flthy.designator", "required": true }
          ],
          "supportsDuration": false,
          "examples": ["F103"],
          "commentLabel": "Flthy RC U/D"
        },
        {
          "id": "flthy.servo.random",
          "name": "Random Position",
          "group": "Servo",
          "safety": "movement",
          "encoder": "template",
          "template": "{designator}104",
          "params": [
            { "name": "designator", "enum": "flthy.designator", "required": true }
          ],
          "supportsDuration": false,
          "examples": ["A104", "F104"],
          "commentLabel": "Flthy random position"
        },
        {
          "id": "flthy.servo.wag-lr",
          "name": "Wag L/R",
          "group": "Servo",
          "safety": "movement",
          "encoder": "template",
          "template": "{designator}105",
          "params": [
            { "name": "designator", "enum": "flthy.designator", "required": true }
          ],
          "supportsDuration": false,
          "examples": ["F105"],
          "commentLabel": "Flthy wag L/R"
        },
        {
          "id": "flthy.servo.wag-ud",
          "name": "Wag U/D",
          "group": "Servo",
          "safety": "movement",
          "encoder": "template",
          "template": "{designator}106",
          "params": [
            { "name": "designator", "enum": "flthy.designator", "required": true }
          ],
          "supportsDuration": false,
          "examples": ["F106"],
          "commentLabel": "Flthy wag U/D"
        },
        {
          "id": "flthy.servo.autotwitch",
          "name": "Auto Twitch On/Off",
          "group": "Servo",
          "safety": "movement",
          "encoder": "template",
          "template": "{designator}1{mode}",
          "params": [
            { "name": "designator", "enum": "flthy.designator", "required": true },
            { "name": "mode", "enum": "flthy.servoTwitch", "required": true }
          ],
          "supportsDuration": false,
          "examples": ["T199", "A198"],
          "commentLabel": "Flthy servo auto twitch"
        },
```

- [ ] **Step 5: Run the new tests + validate**

Run: `npx jest test/engine.test.js -t "FlthyHPs servo" && npm run validate && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libraries/boards/flthy-hps.json test/engine.test.js
git commit -m "feat(flthy): add servo commands (preset, RC, random, wag, auto-twitch) per v1.8 command table

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Add the Special Sequence command

Adds the global `S#` special sequences as one dropdown-driven command.

**Files:**
- Modify: `libraries/boards/flthy-hps.json` (add `flthy.special` enum; add 1 command)
- Modify: `test/engine.test.js` (add a `describe('FlthyHPs special sequences')` block)

**Interfaces:**
- Produces: `flthy.special.sequence` → `{special}` (`special` = `flthy.special`), `group: "Special"`, `safety: "movement"`, `supportsDuration: false`.

- [ ] **Step 1: Write the failing tests**

Add to `test/engine.test.js`:

```js
describe('FlthyHPs special sequences', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('special sequence encodes the raw S-code', () => {
    expect(cb.encode(cb.getCommand('flthy.special.sequence'), { special: 'S1' }, {})).toBe('S1');
    expect(cb.encode(cb.getCommand('flthy.special.sequence'), { special: 'S5' }, {})).toBe('S5');
  });
  test('special sequence round-trips', () => {
    expect(cb.match('S1')).toMatchObject({ commandId: 'flthy.special.sequence', params: { special: 'S1' } });
    expect(cb.buildWCBValue(cb.parseWCBValue('S9'))).toBe('S9');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest test/engine.test.js -t "FlthyHPs special sequences"`
Expected: FAIL — `flthy.special.sequence` not defined.

- [ ] **Step 3: Add the enum**

Add to the board's `enums`:

```json
    "flthy.special": {
      "label": "Special Sequence",
      "values": [
        { "code": "S1", "label": "Leia Mode" },
        { "code": "S4", "label": "Clear + Disable (no Off-Color)" },
        { "code": "S5", "label": "Clear + Enable Default (no Off-Color)" },
        { "code": "S6", "label": "Clear + Enable Random (no Off-Color)" },
        { "code": "S7", "label": "Clear + Disable (Off-Color)" },
        { "code": "S8", "label": "Clear + Enable Default (Off-Color)" },
        { "code": "S9", "label": "Clear + Enable Random (Off-Color)" }
      ]
    }
```

- [ ] **Step 4: Add the command**

Append to the component's `commands` array:

```json
        {
          "id": "flthy.special.sequence",
          "name": "Special Sequence",
          "group": "Special",
          "safety": "movement",
          "encoder": "template",
          "template": "{special}",
          "params": [
            { "name": "special", "enum": "flthy.special", "required": true }
          ],
          "supportsDuration": false,
          "examples": ["S1", "S5", "S9"],
          "commentLabel": "Flthy special"
        }
```

- [ ] **Step 5: Run the new tests + validate**

Run: `npx jest test/engine.test.js -t "FlthyHPs special sequences" && npm run validate && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libraries/boards/flthy-hps.json test/engine.test.js
git commit -m "feat(flthy): add Special Sequence command (S1, S4-S9)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Version bump + release pointer

Bumps the catalog version and the release pointer together (validate requires them equal) and updates the version assertions.

**Files:**
- Modify: `libraries/manifest.json`
- Modify: `releases.json`
- Modify: `test/load-node.test.js` (version assertions)
- Modify: `test/engine.test.js:22` (version assertion)

**Interfaces:** none (final integration task).

- [ ] **Step 1: Update the version assertions first (they will fail until the bump lands)**

In `test/engine.test.js`, line 22:
```js
    expect(cb.getLibraryVersion()).toBe('2.3.0');
```
In `test/load-node.test.js`, lines 6, 13, 19:
```js
  expect(manifest.libraryVersion).toBe('2.3.0');
```
```js
  expect(lib.libraryVersion).toBe('2.3.0');
```
```js
  expect(engine.getLibraryVersion()).toBe('2.3.0');
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest test/engine.test.js test/load-node.test.js`
Expected: FAIL — version is still `2.2.1`.

- [ ] **Step 3: Bump the manifest**

In `libraries/manifest.json`, change:
```json
  "libraryVersion": "2.3.0",
```

- [ ] **Step 4: Bump the release pointer**

In `releases.json`, set `latest.libraryVersion`, `latest.releasedAt`, `latest.notes`, and `libraries[0].libraryVersion`:
```json
  "latest": {
    "libraryVersion": "2.3.0",
    "schemaVersion": "v1",
    "releasedAt": "2026-07-06",
    "url": "https://raw.githubusercontent.com/travisccook/droidnet-command-library/main/libraries/manifest.json",
    "notes": "Minor: FlthyHPs board expanded to the full v1.8 command reference (Leia, Color Projector, Dim Pulse, Cycle, Short Circuit, Rainbow, Clear/Auto, servo preset/RC/random/wag/auto-twitch, and S1/S4-S9 special sequences). Corrects the previous Solid (now 006) and Rainbow (now 007) sequence codes and drops the non-v1.8 X/Y/Z designators."
  },
```
and in `libraries[0]`:
```json
      "libraryVersion": "2.3.0",
```

- [ ] **Step 5: Run validate + full suite**

Run: `npm run validate && npm test`
Expected: PASS — `versionSyncErrors` clean (manifest === releases), all suites green.

- [ ] **Step 6: Commit**

```bash
git add libraries/manifest.json releases.json test/engine.test.js test/load-node.test.js
git commit -m "chore(release): bump library to 2.3.0 for full FlthyHPs v1.8 coverage

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] `npm run validate && npm test` — all green.
- [ ] `node -e "const {readCatalog}=require('./src/load-node.js');const e=require('./src/droidnet-command-library.js');const {manifest,boards}=readCatalog();e.loadLibrary(boards,{libraryVersion:manifest.libraryVersion});console.log(e.getCommands('flthy-hps').length+' flthy commands');"` — expect `16 flthy commands`.
- [ ] Confirm the manual's canonical examples all recognize: `R0063` (solid), `T007` (rainbow), `A007|45` (rainbow timed), `F103` (RC U/D), `A104` (random), `S1` (Leia mode).

## Spec coverage self-check

- Drop X/Y/Z → Task 1. Fix solid/rainbow → Task 1. LED effects 01–07 → Tasks 1–2. Clear/auto 96/97x/98/99x → Task 2 (`flthy.ledClearMode`). Dim-pulse required-speed → Task 2. Servo 01–06/98/99 + table-over-examples → Task 3. Position enum → Task 3. Special S1/S4–S9 → Task 4. Version 2.2.1→2.3.0 + releases sync → Task 5. Out-of-scope items (sketch `#define`s, Marcduino wrapping) → not implemented, by design.
