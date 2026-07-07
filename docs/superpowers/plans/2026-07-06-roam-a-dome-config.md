# Roam-A-Dome (Config) Board — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `roam-a-dome-config` device-native board covering the full reeltwo DomeControlFirmware `#DP` configuration family — 61 commands, 4 enums.

**Architecture:** Pure JSON data change: one new board file + manifest entry + version bump. No engine changes. Every command is one of 6 fixed shapes. Correctness enforced by `scripts/validate.js`, `test/web.test.js` (examples round-trip), explicit `test/engine.test.js` assertions, and — because 61 commands share the `#DP` prefix — an exhaustive grammar brute-force in the verification workflow.

**Tech Stack:** Node 20, Jest, ajv. No build step.

## Global Constraints

- **Source of truth:** the spec `docs/superpowers/specs/2026-07-06-roam-a-dome-config-design.md` (code-correct values, overriding README bugs). Every command/enum/value below is copied from it.
- **Board meta:** `id:"roam-a-dome-config"`, `name:"Roam-A-Dome (Config)"`, `kind:"device-native"`, `confidence:"high"`, `firmware:"RDH (DomeControlFirmware)"`, routing `{ class:"broadcast", nativeWrapper:"none", durationSuffix:{ supported:false } }`. Top-level `"enums"` object holds the 4 enums.
- **Command-id prefix:** `rad.cfg.` (globally unique — all new).
- **All numeric params:** `"type":"int"`, `"required":true`, with `min`/`max`/`default`. All on/off params: `"enum":"rad.onOff"`, `"required":true`, with a `default`. Baud params: `"enum":"rad.baudBasic"` or `"rad.baudFull"`. Free-text params: `{ "name":"<n>", "required":true }` — NO `type`, NO `enum` (unbounded).
- **Every command:** `"encoder":"template"`, a `commentLabel`, and ≥1 `examples`.
- **Version:** bump `libraryVersion` `2.4.0` → `2.5.0` in `libraries/manifest.json` AND `releases.json` (`latest.libraryVersion` + `libraries[0].libraryVersion`); they must stay equal.
- **Adding a board also requires** (learned from the Motion board): bump `test/load-node.test.js` component-count assertion `expect(lib.components.length).toBe(10)` → `11`. Do this in Task 1 (it is required for Task 1's `npm test` to pass).
- After each task: `npm run validate && npm test` must pass.

---

## File Structure

| File | Change |
|---|---|
| `libraries/boards/roam-a-dome-config.json` | Create — 4 enums, 61 commands |
| `libraries/manifest.json` | Task 1: add board entry + bump component count is N/A here; Task 2: bump `libraryVersion` |
| `test/load-node.test.js` | Task 1: component-count `10`→`11`; Task 2: 3 version assertions →`2.5.0` |
| `test/engine.test.js` | Task 1: add `describe('Roam-A-Dome config')`; Task 2: version assertion →`2.5.0` |
| `releases.json` | Task 2: version bump |

Do NOT touch `test/merge.test.js`, `test/schema.test.js`, or other boards.

---

### Task 1: Create the Roam-A-Dome (Config) board + tests + manifest entry

**Files:** Create `libraries/boards/roam-a-dome-config.json`; Modify `libraries/manifest.json` (board-list entry only), `test/load-node.test.js` (component count 10→11), `test/engine.test.js` (new describe block). Version stays `2.4.0`.

- [ ] **Step 1: Write the failing test block**

Add to `test/engine.test.js` (after the `describe('Roam-A-Dome motion')` block):

```js
describe('Roam-A-Dome config', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('no-arg and numeric encode', () => {
    expect(cb.encode(cb.getCommand('rad.cfg.zero'), {}, {})).toBe('#DPZERO');
    expect(cb.encode(cb.getCommand('rad.cfg.maxspeed'), { value: '50' }, {})).toBe('#DPMAXSPEED50');
  });
  test('on/off enum and baud enum', () => {
    expect(cb.match('#DPINVERT1')).toMatchObject({ commandId: 'rad.cfg.invert', params: { state: '1' } });
    expect(cb.match('#DPSERIALBAUD9600')).toMatchObject({ commandId: 'rad.cfg.serialbaud', params: { baud: '9600' } });
  });
  test('packed pin digits', () => {
    expect(cb.encode(cb.getCommand('rad.cfg.pin'), { pin: '1', value: '0' }, {})).toBe('#DPPIN10');
    expect(cb.match('#DPPIN10')).toMatchObject({ commandId: 'rad.cfg.pin', params: { pin: '1', value: '0' } });
  });
  test('shared-prefix disambiguation: D / DEBUG / DSCALE', () => {
    expect(cb.match('#DPD0')).toMatchObject({ commandId: 'rad.cfg.deleteSeq', params: { slot: '0' } });
    expect(cb.match('#DPDEBUG1')).toMatchObject({ commandId: 'rad.cfg.debug', params: { state: '1' } });
    expect(cb.match('#DPDSCALE100')).toMatchObject({ commandId: 'rad.cfg.dscale', params: { value: '100' } });
  });
  test('shared-prefix disambiguation: SYRENADDR vs SYRENADDRIN', () => {
    expect(cb.match('#DPSYRENADDR129')).toMatchObject({ commandId: 'rad.cfg.syrenaddr', params: { value: '129' } });
    expect(cb.match('#DPSYRENADDRIN129')).toMatchObject({ commandId: 'rad.cfg.syrenaddrin', params: { value: '129' } });
  });
  test('shared-prefix disambiguation: HOME family + HOMEPOS split', () => {
    expect(cb.match('#DPHOME1')).toMatchObject({ commandId: 'rad.cfg.home', params: { state: '1' } });
    expect(cb.match('#DPHOMESPEED40')).toMatchObject({ commandId: 'rad.cfg.homespeed', params: { value: '40' } });
    expect(cb.match('#DPHOMEPOS')).toMatchObject({ commandId: 'rad.cfg.homePosHere' });
    expect(cb.match('#DPHOMEPOS90')).toMatchObject({ commandId: 'rad.cfg.homePos', params: { deg: '90' } });
  });
  test('does not collide with uppity (#DP vs #P)', () => {
    expect(cb.match('#PD0')).toMatchObject({ commandId: 'uppity.cfg.deleteSeq' });
    expect(cb.match('#DPD0')).toMatchObject({ commandId: 'rad.cfg.deleteSeq' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest test/engine.test.js -t "Roam-A-Dome config"`
Expected: FAIL — `rad.cfg.*` commands don't exist yet.

- [ ] **Step 3: Create the board file**

Create `libraries/boards/roam-a-dome-config.json`. Start from this skeleton (exact meta + the 4 enums), then add all 61 command objects (Step 3b):

```json
{
  "$schema": "droidnet-command-library/library/v1",
  "generatedFrom": "reeltwo DomeControlFirmware (Roam-A-Dome) processConfigureCommand() — #DP config family; code-correct values",
  "enums": {
    "rad.onOff": {
      "label": "State",
      "values": [
        { "code": "0", "label": "Off / Disabled" },
        { "code": "1", "label": "On / Enabled" }
      ]
    },
    "rad.pin": {
      "label": "Digital Pin",
      "values": [
        { "code": "1", "label": "Pin 1" },
        { "code": "2", "label": "Pin 2" },
        { "code": "3", "label": "Pin 3" },
        { "code": "4", "label": "Pin 4" },
        { "code": "5", "label": "Pin 5" },
        { "code": "6", "label": "Pin 6" },
        { "code": "7", "label": "Pin 7" },
        { "code": "8", "label": "Pin 8" }
      ]
    },
    "rad.baudBasic": {
      "label": "Baud",
      "values": [
        { "code": "2400", "label": "2400" },
        { "code": "9600", "label": "9600" },
        { "code": "19200", "label": "19200" },
        { "code": "38400", "label": "38400" }
      ]
    },
    "rad.baudFull": {
      "label": "Baud",
      "values": [
        { "code": "2400", "label": "2400" },
        { "code": "9600", "label": "9600" },
        { "code": "19200", "label": "19200" },
        { "code": "38400", "label": "38400" },
        { "code": "57600", "label": "57600" },
        { "code": "115200", "label": "115200" }
      ]
    }
  },
  "components": [
    {
      "id": "roam-a-dome-config",
      "name": "Roam-A-Dome (Config)",
      "kind": "device-native",
      "confidence": "high",
      "firmware": "RDH (DomeControlFirmware)",
      "routing": { "class": "broadcast", "nativeWrapper": "none", "durationSuffix": { "supported": false } },
      "commands": [ /* 61 command objects — see Step 3b */ ]
    }
  ]
}
```

- [ ] **Step 3b: Add the 61 command objects**

Each command follows exactly ONE of these 6 shapes. Here is the canonical JSON for each shape (copy the structure, substitute the per-command values from the table below):

```jsonc
// SHAPE A — no-arg action
{ "id":"rad.cfg.zero", "name":"Reset Dome Settings", "group":"System", "safety":"power",
  "encoder":"template", "template":"#DPZERO", "params":[], "examples":["#DPZERO"], "commentLabel":"RAD reset settings" }

// SHAPE B — numeric setting
{ "id":"rad.cfg.maxspeed", "name":"Max Speed", "group":"Speeds", "safety":"config",
  "encoder":"template", "template":"#DPMAXSPEED{value}",
  "params":[ { "name":"value", "type":"int", "min":0, "max":100, "required":true, "default":50 } ],
  "examples":["#DPMAXSPEED50"], "commentLabel":"RAD max speed" }

// SHAPE C — on/off toggle
{ "id":"rad.cfg.invert", "name":"Invert Motor Direction", "group":"Modes", "safety":"config",
  "encoder":"template", "template":"#DPINVERT{state}",
  "params":[ { "name":"state", "enum":"rad.onOff", "required":true, "default":"1" } ],
  "examples":["#DPINVERT1"], "commentLabel":"RAD invert" }

// SHAPE D — baud enum
{ "id":"rad.cfg.serialbaud", "name":"Command Serial Baud", "group":"Serial", "safety":"config",
  "encoder":"template", "template":"#DPSERIALBAUD{baud}",
  "params":[ { "name":"baud", "enum":"rad.baudBasic", "required":true, "default":"9600" } ],
  "examples":["#DPSERIALBAUD9600"], "commentLabel":"RAD serial baud" }

// SHAPE E — packed pin digits (ONLY rad.cfg.pin)
{ "id":"rad.cfg.pin", "name":"Set Pin Default", "group":"Pins", "safety":"config",
  "encoder":"template", "template":"#DPPIN{pin}{value}",
  "params":[ { "name":"pin", "enum":"rad.pin", "required":true, "default":"1" },
             { "name":"value", "enum":"rad.onOff", "required":true, "default":"0" } ],
  "examples":["#DPPIN10","#DPPIN21"], "commentLabel":"RAD pin default" }

// SHAPE F — free-text (unbounded): param has ONLY name+required
{ "id":"rad.cfg.rname", "name":"Droid Remote Name", "group":"WiFi/Remote", "safety":"config",
  "encoder":"template", "template":"#DPRNAME{name}",
  "params":[ { "name":"name", "required":true } ],
  "examples":["#DPRNAMEMyDome"], "commentLabel":"RAD remote name (free text)" }
```

Now emit one object per row of this table (id → template, params, safety, group, example). `int(a,b,d)` = `{type:int,min:a,max:b,default:d}`. `onOff(d)` = `{enum:rad.onOff,default:"d"}`. All params `required:true`.

| id | name | group | template | param(s) | safety | example |
|---|---|---|---|---|---|---|
| rad.cfg.zero | Reset Dome Settings | System | `#DPZERO` | — | power | `#DPZERO` |
| rad.cfg.factory | Factory Reset | System | `#DPFACTORY` | — | power | `#DPFACTORY` |
| rad.cfg.restart | Reboot | System | `#DPRESTART` | — | power | `#DPRESTART` |
| rad.cfg.status | Print Status | System | `#DPSTATUS` | — | cosmetic | `#DPSTATUS` |
| rad.cfg.config | Dump Config | System | `#DPCONFIG` | — | cosmetic | `#DPCONFIG` |
| rad.cfg.setupVelocity | Setup Velocity | Setup | `#DPSETUPVELOCITY{value}` | value int(0,1000,100) | config | `#DPSETUPVELOCITY100` |
| rad.cfg.setup | Auto-Calibrate | Setup | `#DPSETUP` | — | movement | `#DPSETUP` |
| rad.cfg.maxspeed | Max Speed | Speeds | `#DPMAXSPEED{value}` | value int(0,100,50) | config | `#DPMAXSPEED50` |
| rad.cfg.homespeed | Home Speed | Speeds | `#DPHOMESPEED{value}` | value int(0,100,40) | config | `#DPHOMESPEED40` |
| rad.cfg.autospeed | Auto Speed | Speeds | `#DPAUTOSPEED{value}` | value int(0,100,30) | config | `#DPAUTOSPEED30` |
| rad.cfg.targetspeed | Target Speed | Speeds | `#DPTARGETSPEED{value}` | value int(0,100,100) | config | `#DPTARGETSPEED100` |
| rad.cfg.minspeed | Min Speed | Speeds | `#DPMINSPEED{value}` | value int(0,100,15) | config | `#DPMINSPEED15` |
| rad.cfg.inputspeed | Input Speed Scale | Speeds | `#DPINPUTSPEED{value}` | value int(0,100,100) | config | `#DPINPUTSPEED100` |
| rad.cfg.autoleft | Auto Left Limit | Tolerances | `#DPAUTOLEFT{value}` | value int(0,180,80) | config | `#DPAUTOLEFT80` |
| rad.cfg.autoright | Auto Right Limit | Tolerances | `#DPAUTORIGHT{value}` | value int(0,180,80) | config | `#DPAUTORIGHT80` |
| rad.cfg.fudge | Position Tolerance | Tolerances | `#DPFUDGE{value}` | value int(0,20,5) | config | `#DPFUDGE5` |
| rad.cfg.homePosHere | Set Home Here | Tolerances | `#DPHOMEPOS` | — | config | `#DPHOMEPOS` |
| rad.cfg.homePos | Set Home Position | Tolerances | `#DPHOMEPOS{deg}` | deg int(0,359,0) | config | `#DPHOMEPOS90` |
| rad.cfg.automin | Auto Min Delay | Delays | `#DPAUTOMIN{value}` | value int(0,255,6) | config | `#DPAUTOMIN6` |
| rad.cfg.automax | Auto Max Delay | Delays | `#DPAUTOMAX{value}` | value int(0,255,8) | config | `#DPAUTOMAX8` |
| rad.cfg.homemin | Home Min Delay | Delays | `#DPHOMEMIN{value}` | value int(0,255,6) | config | `#DPHOMEMIN6` |
| rad.cfg.homemax | Home Max Delay | Delays | `#DPHOMEMAX{value}` | value int(0,255,8) | config | `#DPHOMEMAX8` |
| rad.cfg.targetmin | Target Min Delay | Delays | `#DPTARGETMIN{value}` | value int(0,255,0) | config | `#DPTARGETMIN0` |
| rad.cfg.targetmax | Target Max Delay | Delays | `#DPTARGETMAX{value}` | value int(0,255,1) | config | `#DPTARGETMAX1` |
| rad.cfg.timeout | Movement Timeout | Delays | `#DPTIMEOUT{value}` | value int(0,30,5) | config | `#DPTIMEOUT5` |
| rad.cfg.report | Position Report Interval | Delays | `#DPREPORT{value}` | value int(0,60000,0) | config | `#DPREPORT100` |
| rad.cfg.home | Home Mode | Modes | `#DPHOME{state}` | state onOff(0) | config | `#DPHOME1` |
| rad.cfg.auto | Auto Random Mode | Modes | `#DPAUTO{state}` | state onOff(0) | config | `#DPAUTO1` |
| rad.cfg.autosafety | Auto-Safety Interlock | Modes | `#DPAUTOSAFETY{state}` | state onOff(1) | config | `#DPAUTOSAFETY1` |
| rad.cfg.autorestart | Auto Restart | Modes | `#DPAUTORESTART{state}` | state onOff(1) | config | `#DPAUTORESTART1` |
| rad.cfg.invert | Invert Motor Direction | Modes | `#DPINVERT{state}` | state onOff(1) | config | `#DPINVERT1` |
| rad.cfg.scale | Speed Ramping | Ramping | `#DPSCALE{state}` | state onOff(0) | config | `#DPSCALE1` |
| rad.cfg.ascale | Acceleration Scale | Ramping | `#DPASCALE{value}` | value int(0,255,20) | config | `#DPASCALE20` |
| rad.cfg.dscale | Deceleration Scale | Ramping | `#DPDSCALE{value}` | value int(0,255,50) | config | `#DPDSCALE50` |
| rad.cfg.serialin | Packet-Serial Input | Serial | `#DPSERIALIN{state}` | state onOff(1) | config | `#DPSERIALIN1` |
| rad.cfg.serialout | Packet-Serial Output | Serial | `#DPSERIALOUT{state}` | state onOff(1) | config | `#DPSERIALOUT1` |
| rad.cfg.serialbaud | Command Serial Baud | Serial | `#DPSERIALBAUD{baud}` | baud rad.baudBasic def "9600" | config | `#DPSERIALBAUD9600` |
| rad.cfg.syrenbaud | Syren Baud | Syren | `#DPSYRENBAUD{baud}` | baud rad.baudFull def "9600" | config | `#DPSYRENBAUD9600` |
| rad.cfg.syrenaddrin | Syren Input Address | Syren | `#DPSYRENADDRIN{value}` | value int(0,255,129) | config | `#DPSYRENADDRIN129` |
| rad.cfg.syrenaddrout | Syren Output Address | Syren | `#DPSYRENADDROUT{value}` | value int(0,255,129) | config | `#DPSYRENADDROUT129` |
| rad.cfg.syrenaddr | Syren Address (both) | Syren | `#DPSYRENADDR{value}` | value int(0,255,129) | config | `#DPSYRENADDR129` |
| rad.cfg.sensorbaud | Sensor Baud | Sensor | `#DPSENSORBAUD{baud}` | baud rad.baudFull def "115200" | config | `#DPSENSORBAUD115200` |
| rad.cfg.pwmin | PWM Input | PWM | `#DPPWMIN{state}` | state onOff(0) | config | `#DPPWMIN1` |
| rad.cfg.pwmout | PWM Output | PWM | `#DPPWMOUT{state}` | state onOff(0) | config | `#DPPWMOUT1` |
| rad.cfg.pwmarc | PWM Arc Mode | PWM | `#DPPWMARC{state}` | state onOff(0) | config | `#DPPWMARC1` |
| rad.cfg.pwmmin | PWM Min Pulse | PWM | `#DPPWMMIN{value}` | value int(801,2199,1000) | config | `#DPPWMMIN1000` |
| rad.cfg.pwmmax | PWM Max Pulse | PWM | `#DPPWMMAX{value}` | value int(801,2199,2000) | config | `#DPPWMMAX2000` |
| rad.cfg.pwmneutral | PWM Neutral Pulse | PWM | `#DPPWMNEUTRAL{value}` | value int(801,2199,1500) | config | `#DPPWMNEUTRAL1500` |
| rad.cfg.pwmdeadband | PWM Deadband % | PWM | `#DPPWMDEADBAND{value}` | value int(0,50,5) | config | `#DPPWMDEADBAND5` |
| rad.cfg.pin | Set Pin Default | Pins | `#DPPIN{pin}{value}` | pin rad.pin def "1"; value onOff(0) | config | `#DPPIN10` |
| rad.cfg.wifi | WiFi Enable | WiFi/Remote | `#DPWIFI{state}` | state onOff(1) | power | `#DPWIFI1` |
| rad.cfg.remote | Droid Remote Enable | WiFi/Remote | `#DPREMOTE{state}` | state onOff(1) | power | `#DPREMOTE1` |
| rad.cfg.rname | Droid Remote Name | WiFi/Remote | `#DPRNAME{name}` | name free-text | config | `#DPRNAMEMyDome` |
| rad.cfg.rsecret | Droid Remote Secret | WiFi/Remote | `#DPRSECRET{secret}` | secret free-text | config | `#DPRSECRETAstromech` |
| rad.cfg.pair | Start Pairing | WiFi/Remote | `#DPPAIR` | — | power | `#DPPAIR` |
| rad.cfg.unpair | Clear Pairing | WiFi/Remote | `#DPUNPAIR` | — | power | `#DPUNPAIR` |
| rad.cfg.listSeq | List Sequences | Sequences | `#DPL` | — | cosmetic | `#DPL` |
| rad.cfg.deleteSeq | Delete Sequence | Sequences | `#DPD{slot}` | slot int(0,100,0) | config | `#DPD0` |
| rad.cfg.storeSeq | Store Sequence | Sequences | `#DPS{slot}:{body}` | slot int(0,100,1); body free-text | config | `#DPS3:D50:W2:D-50` |
| rad.cfg.debug | Verbose Debug | Debug | `#DPDEBUG{state}` | state onOff(0) | config | `#DPDEBUG1` |
| rad.cfg.joy | VT100 Joystick | Debug | `#DPJOY` | — | cosmetic | `#DPJOY` |

`storeSeq` — set `commentLabel` to note the body accepts only `Z/R/A/D/W/H` steps, e.g. `"RAD store sequence (body: Z/R/A/D/W/H steps, colon-separated)"`. For `storeSeq` the `body` param is free-text: `{ "name":"body", "required":true }` (slot stays `int(0,100,1)`).

- [ ] **Step 4: Add the manifest board-list entry (NOT the version)**

Append to the `boards` array in `libraries/manifest.json` (leave `libraryVersion` at `2.4.0`):
```json
    {
      "id": "roam-a-dome-config",
      "file": "boards/roam-a-dome-config.json",
      "name": "Roam-A-Dome (Config)",
      "confidence": "high"
    }
```

- [ ] **Step 5: Bump the component-count assertion**

In `test/load-node.test.js`, change `expect(lib.components.length).toBe(10);` to:
```js
  expect(lib.components.length).toBe(11);
```

- [ ] **Step 6: Run the new tests + validate + full suite**

Run: `npx jest test/engine.test.js -t "Roam-A-Dome config" && npm run validate && npm test`
Expected: PASS — new block green; `library.test.js` manifest/disk match; `web.test.js` round-trips every bounded example; validate clean (version-sync still 2.4.0).

- [ ] **Step 7: Commit** (branch-guard: `git branch --show-current` must be `feat/roam-a-dome-config`)

```bash
git add libraries/boards/roam-a-dome-config.json libraries/manifest.json test/engine.test.js test/load-node.test.js
git commit -m "feat(roam-a-dome): add Config board — full #DP settings family (61 commands)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Version bump 2.4.0 → 2.5.0

**Files:** `libraries/manifest.json`, `releases.json`, `test/engine.test.js` (1 assertion), `test/load-node.test.js` (3 assertions).

- [ ] **Step 1: Update version assertions first**

`test/engine.test.js`: `expect(cb.getLibraryVersion()).toBe('2.4.0');` → `'2.5.0'`.
`test/load-node.test.js`: the three `'2.4.0'` version assertions (`manifest.libraryVersion`, `lib.libraryVersion`, `engine.getLibraryVersion()`) → `'2.5.0'`.

- [ ] **Step 2: Run to verify failure**

Run: `npx jest test/engine.test.js test/load-node.test.js`
Expected: FAIL — still `2.4.0`.

- [ ] **Step 3: Bump manifest** — `libraries/manifest.json`: `"libraryVersion": "2.5.0",`

- [ ] **Step 4: Bump releases** — `releases.json`:
```json
  "latest": {
    "libraryVersion": "2.5.0",
    "schemaVersion": "v1",
    "releasedAt": "2026-07-06",
    "url": "https://raw.githubusercontent.com/travisccook/droidnet-command-library/main/libraries/manifest.json",
    "notes": "Minor: adds the Roam-A-Dome (Config) board — the full reeltwo DomeControlFirmware #DP configuration family (61 commands: speeds, delays, tolerances, mode/safety toggles, ramping, serial/Syren/sensor baud + addresses, PWM, digital pins, WiFi/remote, sequence store/list/delete). Code-correct defaults."
  },
```
and `libraries[0].libraryVersion` → `"2.5.0"`.

- [ ] **Step 5: Run validate + full suite**

Run: `npm run validate && npm test`
Expected: PASS — version-sync clean, all green.

- [ ] **Step 6: Commit** (branch-guard first)

```bash
git add libraries/manifest.json releases.json test/engine.test.js test/load-node.test.js
git commit -m "chore(release): bump library to 2.5.0 for Roam-A-Dome Config board

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] `npm run validate && npm test` — all green.
- [ ] `node -e "const {readCatalog}=require('./src/load-node.js');const e=require('./src/droidnet-command-library.js');const {manifest,boards}=readCatalog();e.loadLibrary(boards,{libraryVersion:manifest.libraryVersion});console.log(e.getCommands('roam-a-dome-config').length+' config commands @ v'+manifest.libraryVersion);"` — expect `61 config commands @ v2.5.0`.

## Spec coverage self-check

61 commands across 15 groups (System 5, Setup 2, Speeds 6, Tolerances 5, Delays 8, Modes 5, Ramping 3, Serial 3, Syren 4, Sensor 1, PWM 7, Pins 1, WiFi/Remote 6, Sequences 3, Debug 2) → Task 1 table. 4 enums → Task 1 skeleton. Free-text RNAME/RSECRET/storeSeq → Shape F. Packed pin → Shape E. Code-correct defaults (INVERT/AUTOSAFETY/AUTORESTART=1, ASCALE=20, DSCALE=50, PWM 801–2199, baud 38400) → table. Shared-prefix disambiguation → engine tests + workflow grammar brute-force. Version 2.4.0→2.5.0 + component-count 10→11 → Tasks 1–2. Runtime `:DP` verbs + `#DPS` body validation + no-arg toggles → out of scope.
