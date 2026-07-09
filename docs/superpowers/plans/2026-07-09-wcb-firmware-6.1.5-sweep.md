# WCB Firmware v6.1.5 Full Command Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture the WCB firmware v6.1.5 command surface in the catalog — HCR volume/fade + full HCR verb round-out on `wcb-hcr`, a new `wcb-mp3` audio board, and a new `wcb-native` board for the `?` config/routing/sequence set.

**Architecture:** Pure JSON board authoring against the schema-driven engine — no engine or schema code changes. Every command is a `template` encoder with enum / `int` / free-text `pattern` params. The test suite auto-discovers each board file and round-trips every command's `examples` string (encode → wire → `match` → params), which is the correctness gate.

**Tech Stack:** Node 20, ajv (schema validation), jest. Commands: `npm run validate`, `npm test`, `npx jest <file>`.

**Spec:** `docs/superpowers/specs/2026-07-09-wcb-firmware-6.1.5-sweep-design.md`
**Firmware source of truth:** greghulette/Wireless_Communication_Board-WCB @ v6.1.5 — `Code/WCB/WCB_Help.h` (`?`/`;`/`;A` reference), `Code/WCB/WCB_HCR.cpp` (`;H,` grammar).

## Global Constraints

- **libraryVersion:** `4.0.0` → **`4.1.0`** (additive). Must be set byte-equal in **three** files: `libraries/manifest.json` `libraryVersion`, `releases.json` `latest.libraryVersion` (validator errors if these two differ), and `releases.json` `libraries[0].libraryVersion`.
- **Provenance:** `libraries/manifest.json` `generatedFrom` and `wcb-hcr.json` component `firmware` → mention **WCB 6.1.5_290119RJUN2026**.
- **One component per board file** — `test/library.test.js` asserts `lib.components` has length 1.
- **Command ids unique across the whole catalog** — new prefixes `hcr.*` (new verbs), `mp3.*`, `wcb.*` must not collide. `hcr-native.json` uses `hcr.native.*`; existing `wcb-hcr.json` uses `hcr.stim`/`hcr.play` — do not reuse those two ids.
- **Shared HCR enums byte-identical:** `test/library.test.js` requires `hcr.emotion` and `hcr.channel` to be byte-identical JSON between `wcb-hcr.json` and `hcr-native.json`. Any enum id reused from another board (e.g. `hcr.volTarget`, `hcr.onoff`) must be copied **byte-identically** (the validator's `crossFileErrors` runs `engine.merge` over all boards).
- **Categories:** every command has a `category`, and the component's `categories` array must list it (`test/categories.test.js`, validator). Standard vocab: `Lighting, Movement, Sound, Sequences, Setup, Config, Power, System`. `Volume` and `Routing` are intentional outliers — the validator emits a non-failing `warn` for outliers; that is expected.
- **Every template `{param}` has a matching `param`, and vice-versa** (validator + `test/library.test.js`).
- **Every command needs ≥1 `examples` string** that round-trips.
- **Gate per task:** `npm run validate` exits 0 (errors fail, warnings don't) **and** `npm test` green before every commit.
- **Safety enum:** one of `cosmetic | movement | power | config`.

---

## Phase 1 — the volume gap

### Task 1: HCR volume/fade verbs (`wcb-hcr.json`)

**Files:**
- Modify: `libraries/boards/wcb-hcr.json` (add 3 enums, 8 commands, extend `categories`)

**Interfaces:**
- Produces: command ids `hcr.vol`, `hcr.volUp`, `hcr.volUpAll`, `hcr.volDown`, `hcr.volDownAll`, `hcr.fadeIn`, `hcr.fadeOut`, `hcr.playFade`; enums `hcr.volTarget`, `hcr.museMode` (Task 3), `hcr.onoff` (Task 3).

- [ ] **Step 1: Add the volume/fade enums.** In `wcb-hcr.json`, add these to the top-level `enums` object (copy `hcr.volTarget` byte-identically from `hcr-native.json`):

```json
"hcr.volTarget": {
  "label": "Channel",
  "values": [
    { "code": "V", "label": "Vocalizer" },
    { "code": "A", "label": "WAV A" },
    { "code": "B", "label": "WAV B" }
  ]
}
```

- [ ] **Step 2: Add the 8 volume/fade commands** to the `commands` array of the single component. Note the two-variant modeling of VOLUP/VOLDN (channel-specific vs all-channels) — the firmware makes the channel optional, and the template encoder can't express an optional field, so each direction is two commands with distinct anchored templates:

```json
{
  "id": "hcr.vol",
  "name": "Set Channel Volume",
  "safety": "cosmetic",
  "encoder": "template",
  "template": ";H,VOL,{channel},{level}",
  "params": [
    { "name": "channel", "enum": "hcr.volTarget", "required": true },
    { "name": "level", "type": "int", "min": 0, "max": 100, "required": true }
  ],
  "examples": [";H,VOL,A,80"],
  "commentLabel": "HCR volume",
  "category": "Volume"
},
{
  "id": "hcr.volUp",
  "name": "Volume Up (channel)",
  "safety": "cosmetic",
  "encoder": "template",
  "template": ";H,VOLUP,{channel},{step}",
  "params": [
    { "name": "channel", "enum": "hcr.volTarget", "required": true },
    { "name": "step", "type": "int", "min": 1, "max": 100, "default": 5, "required": false }
  ],
  "examples": [";H,VOLUP,A,5"],
  "commentLabel": "HCR vol up",
  "category": "Volume"
},
{
  "id": "hcr.volUpAll",
  "name": "Volume Up (all channels)",
  "safety": "cosmetic",
  "encoder": "template",
  "template": ";H,VOLUP",
  "params": [],
  "examples": [";H,VOLUP"],
  "commentLabel": "HCR vol up all",
  "category": "Volume"
},
{
  "id": "hcr.volDown",
  "name": "Volume Down (channel)",
  "safety": "cosmetic",
  "encoder": "template",
  "template": ";H,VOLDN,{channel},{step}",
  "params": [
    { "name": "channel", "enum": "hcr.volTarget", "required": true },
    { "name": "step", "type": "int", "min": 1, "max": 100, "default": 5, "required": false }
  ],
  "examples": [";H,VOLDN,B,10"],
  "commentLabel": "HCR vol down",
  "category": "Volume"
},
{
  "id": "hcr.volDownAll",
  "name": "Volume Down (all channels)",
  "safety": "cosmetic",
  "encoder": "template",
  "template": ";H,VOLDN",
  "params": [],
  "examples": [";H,VOLDN"],
  "commentLabel": "HCR vol down all",
  "category": "Volume"
},
{
  "id": "hcr.fadeIn",
  "name": "Fade In",
  "safety": "cosmetic",
  "encoder": "template",
  "template": ";H,FADEIN,{channel},{sec}",
  "params": [
    { "name": "channel", "enum": "hcr.channel", "required": true },
    { "name": "sec", "type": "int", "min": 0, "max": 600, "required": true }
  ],
  "examples": [";H,FADEIN,A,3"],
  "commentLabel": "HCR fade in",
  "category": "Volume"
},
{
  "id": "hcr.fadeOut",
  "name": "Fade Out",
  "safety": "cosmetic",
  "encoder": "template",
  "template": ";H,FADEOUT,{channel},{sec}",
  "params": [
    { "name": "channel", "enum": "hcr.channel", "required": true },
    { "name": "sec", "type": "int", "min": 0, "max": 600, "required": true }
  ],
  "examples": [";H,FADEOUT,B,2"],
  "commentLabel": "HCR fade out",
  "category": "Volume"
},
{
  "id": "hcr.playFade",
  "name": "Play WAV with Fade-In",
  "safety": "cosmetic",
  "encoder": "template",
  "template": ";H,PLAY,{channel},{file},FADEIN,{sec}",
  "params": [
    { "name": "channel", "enum": "hcr.channel", "required": true },
    { "name": "file", "type": "int", "min": 0, "max": 9999, "required": true },
    { "name": "sec", "type": "int", "min": 0, "max": 600, "required": true }
  ],
  "examples": [";H,PLAY,A,9,FADEIN,3"],
  "commentLabel": "HCR play+fade",
  "category": "Sound"
}
```

- [ ] **Step 3: Extend the component's `categories` array** to include `Volume`. It currently is `["Emotion", "Sound"]`; set it to `["Emotion", "Sound", "Volume"]`.

- [ ] **Step 4: Validate.** Run: `npm run validate`
  Expected: `✓ boards/wcb-hcr.json` (an outlier `warn` for `Volume` is acceptable — it must NOT be an `ERROR`, and the process exits 0).

- [ ] **Step 5: Run the round-trip suite.** Run: `npx jest test/library.test.js test/web.test.js test/categories.test.js`
  Expected: PASS. (`web.test.js` round-trips every command's `examples`; a bad template or example fails here.)

- [ ] **Step 6: Commit.**

```bash
git add libraries/boards/wcb-hcr.json
git commit -m "feat(wcb-hcr): HCR volume/fade verbs (VOL, VOLUP/DN, FADEIN/OUT, PLAY+fade)"
```

---

### Task 2: New MP3 Trigger audio board (`wcb-mp3.json`) + version bump

**Files:**
- Create: `libraries/boards/wcb-mp3.json`
- Modify: `libraries/manifest.json` (register board, bump version + provenance)
- Modify: `releases.json` (bump `latest.libraryVersion` + `libraries[0].libraryVersion`)
- Modify: `test/load-node.test.js` (version `4.0.0`→`4.1.0` ×3; component count `17`→`18`)
- Modify: `test/engine.test.js:22` (version `4.0.0`→`4.1.0`)

**Interfaces:**
- Produces: board id `wcb-mp3`; command ids `mp3.play`, `mp3.playCb`, `mp3.playFs`, `mp3.playFsCb`, `mp3.stop`, `mp3.next`, `mp3.prev`, `mp3.vol`, `mp3.volUp`, `mp3.volDown`, `mp3.count`, `mp3.ver`.

- [ ] **Step 1: Create `libraries/boards/wcb-mp3.json`** with the complete board:

```json
{
  "$schema": "droidnet-command-library/library/v1",
  "enums": {},
  "components": [
    {
      "id": "wcb-mp3",
      "name": "WCB · MP3 Trigger",
      "kind": "wcb-verb",
      "confidence": "high",
      "firmware": "WCB 6.1.5_290119RJUN2026",
      "routing": { "class": "wcb-verb" },
      "commands": [
        { "id": "mp3.play", "name": "Play Track", "safety": "cosmetic", "encoder": "template",
          "template": ";A,PLAY,{track}",
          "params": [ { "name": "track", "type": "int", "min": 1, "max": 255, "required": true } ],
          "examples": [";A,PLAY,1"], "commentLabel": "MP3 play", "category": "Sound" },
        { "id": "mp3.playCb", "name": "Play Track + Callback", "safety": "cosmetic", "encoder": "template",
          "template": ";A,PLAY,{track},ONFIN,{key}",
          "params": [ { "name": "track", "type": "int", "min": 1, "max": 255, "required": true },
                      { "name": "key", "pattern": "[A-Za-z0-9_]+", "required": true } ],
          "examples": [";A,PLAY,1,ONFIN,wave"], "commentLabel": "MP3 play+cb", "category": "Sound" },
        { "id": "mp3.playFs", "name": "Play Track (filesystem order)", "safety": "cosmetic", "encoder": "template",
          "template": ";A,PLAYFS,{track}",
          "params": [ { "name": "track", "type": "int", "min": 0, "max": 255, "required": true } ],
          "examples": [";A,PLAYFS,0"], "commentLabel": "MP3 play FS", "category": "Sound" },
        { "id": "mp3.playFsCb", "name": "Play Track (FS) + Callback", "safety": "cosmetic", "encoder": "template",
          "template": ";A,PLAYFS,{track},ONFIN,{key}",
          "params": [ { "name": "track", "type": "int", "min": 0, "max": 255, "required": true },
                      { "name": "key", "pattern": "[A-Za-z0-9_]+", "required": true } ],
          "examples": [";A,PLAYFS,0,ONFIN,done"], "commentLabel": "MP3 play FS+cb", "category": "Sound" },
        { "id": "mp3.stop", "name": "Start/Stop Toggle", "safety": "cosmetic", "encoder": "template",
          "template": ";A,STOP", "params": [], "examples": [";A,STOP"], "commentLabel": "MP3 stop", "category": "Sound" },
        { "id": "mp3.next", "name": "Next Track", "safety": "cosmetic", "encoder": "template",
          "template": ";A,NEXT", "params": [], "examples": [";A,NEXT"], "commentLabel": "MP3 next", "category": "Sound" },
        { "id": "mp3.prev", "name": "Previous Track", "safety": "cosmetic", "encoder": "template",
          "template": ";A,PREV", "params": [], "examples": [";A,PREV"], "commentLabel": "MP3 prev", "category": "Sound" },
        { "id": "mp3.vol", "name": "Set Volume", "safety": "cosmetic", "encoder": "template",
          "template": ";A,VOL,{level}",
          "params": [ { "name": "level", "type": "int", "min": 0, "max": 64, "required": true } ],
          "examples": [";A,VOL,32"], "commentLabel": "MP3 volume", "category": "Volume" },
        { "id": "mp3.volUp", "name": "Volume Up", "safety": "cosmetic", "encoder": "template",
          "template": ";A,VOLUP", "params": [], "examples": [";A,VOLUP"], "commentLabel": "MP3 vol up", "category": "Volume" },
        { "id": "mp3.volDown", "name": "Volume Down", "safety": "cosmetic", "encoder": "template",
          "template": ";A,VOLDN", "params": [], "examples": [";A,VOLDN"], "commentLabel": "MP3 vol down", "category": "Volume" },
        { "id": "mp3.count", "name": "Request Track Count", "safety": "cosmetic", "encoder": "template",
          "template": ";A,COUNT", "params": [], "examples": [";A,COUNT"], "commentLabel": "MP3 count", "category": "System" },
        { "id": "mp3.ver", "name": "Request Firmware Version", "safety": "cosmetic", "encoder": "template",
          "template": ";A,VER", "params": [], "examples": [";A,VER"], "commentLabel": "MP3 version", "category": "System" }
      ],
      "categories": ["Sound", "Volume", "System"]
    }
  ]
}
```

- [ ] **Step 2: Register the board in `libraries/manifest.json`.** Add to the `boards` array (place after `wcb-hcr` for locality — order is not semantically critical here since no other board shares the `;A,` prefix):

```json
{ "id": "wcb-mp3", "file": "boards/wcb-mp3.json", "name": "WCB · MP3 Trigger", "confidence": "high" }
```

- [ ] **Step 3: Bump version + provenance in `libraries/manifest.json`.** Set `"libraryVersion": "4.1.0"`, and update `generatedFrom` to append `WCB 6.1.5_290119RJUN2026 (2026-07)`.

- [ ] **Step 4: Bump `releases.json`.** Set `latest.libraryVersion` and `libraries[0].libraryVersion` to `"4.1.0"`, set `latest.releasedAt` to `"2026-07-09"`. (Final `latest.notes` copy is written in Task 5 once all boards exist — a short interim note is fine now.)

- [ ] **Step 5: Update version + count assertions.** In `test/load-node.test.js` change the three `'4.0.0'` literals to `'4.1.0'` and `expect(lib.components.length).toBe(17)` to `toBe(18)`. In `test/engine.test.js` line ~22 change `'4.0.0'` to `'4.1.0'`.

- [ ] **Step 6: Validate.** Run: `npm run validate`
  Expected: exits 0. `✓ libraries/manifest.json` (no version-sync error — manifest and releases both `4.1.0`), `✓ boards/wcb-mp3.json`.

- [ ] **Step 7: Full test run.** Run: `npm test`
  Expected: PASS (load-node component count 18, versions 4.1.0, all examples round-trip).

- [ ] **Step 8: Commit.**

```bash
git add libraries/boards/wcb-mp3.json libraries/manifest.json releases.json test/load-node.test.js test/engine.test.js
git commit -m "feat(wcb-mp3): new MP3 Trigger audio board (;A, verbs); bump catalog to 4.1.0"
```

---

## Phase 2 — HCR verb round-out

### Task 3: Remaining non-volume `;H,` verbs (`wcb-hcr.json`)

**Files:**
- Modify: `libraries/boards/wcb-hcr.json` (add 2 enums, 12 commands, extend `categories`)

**Interfaces:**
- Consumes: `hcr.emotion`, `hcr.channel` (existing); `hcr.volTarget` (Task 1).
- Produces: command ids `hcr.overload`, `hcr.setEmotion`, `hcr.override`, `hcr.muse`, `hcr.museSet`, `hcr.museGap`, `hcr.stopEmote`, `hcr.resetEmotions`, `hcr.stop`, `hcr.stopWav`, `hcr.fn`, `hcr.raw`; enums `hcr.onoff`, `hcr.museMode`.

- [ ] **Step 1: Add two enums** to `wcb-hcr.json` `enums`. Copy `hcr.onoff` **byte-identically** from `hcr-native.json`; `hcr.museMode` is new (literal codes the `;H,MUSE` parser recognizes — `ON`, `OFF`, `TOGGLE`):

```json
"hcr.onoff": {
  "label": "State",
  "values": [
    { "code": "1", "label": "Enable" },
    { "code": "0", "label": "Disable" }
  ]
},
"hcr.museMode": {
  "label": "Muse",
  "values": [
    { "code": "ON", "label": "On" },
    { "code": "OFF", "label": "Off" },
    { "code": "TOGGLE", "label": "Toggle" }
  ]
}
```

- [ ] **Step 2: Add the 12 round-out commands** to the component's `commands` array:

```json
{ "id": "hcr.overload", "name": "Overload", "safety": "cosmetic", "encoder": "template",
  "template": ";H,OVERLOAD", "params": [], "examples": [";H,OVERLOAD"], "commentLabel": "HCR overload", "category": "Emotion" },
{ "id": "hcr.setEmotion", "name": "Set Emotion Level", "safety": "cosmetic", "encoder": "template",
  "template": ";H,SETEMOTION,{emotion},{value}",
  "params": [ { "name": "emotion", "enum": "hcr.emotion", "required": true },
              { "name": "value", "type": "int", "min": 0, "max": 100, "required": true } ],
  "examples": [";H,SETEMOTION,H,80"], "commentLabel": "HCR set emotion", "category": "Emotion" },
{ "id": "hcr.override", "name": "Override Emotions", "safety": "cosmetic", "encoder": "template",
  "template": ";H,OVERRIDE,{state}",
  "params": [ { "name": "state", "enum": "hcr.onoff", "required": true } ],
  "examples": [";H,OVERRIDE,1"], "commentLabel": "HCR override", "category": "Emotion" },
{ "id": "hcr.muse", "name": "Muse (once)", "safety": "cosmetic", "encoder": "template",
  "template": ";H,MUSE", "params": [], "examples": [";H,MUSE"], "commentLabel": "HCR muse", "category": "Emotion" },
{ "id": "hcr.museSet", "name": "Muse On/Off/Toggle", "safety": "cosmetic", "encoder": "template",
  "template": ";H,MUSE,{mode}",
  "params": [ { "name": "mode", "enum": "hcr.museMode", "required": true } ],
  "examples": [";H,MUSE,TOGGLE"], "commentLabel": "HCR muse set", "category": "Emotion" },
{ "id": "hcr.museGap", "name": "Muse Gap Range", "safety": "cosmetic", "encoder": "template",
  "template": ";H,MUSE,GAP,{min},{max}",
  "params": [ { "name": "min", "type": "int", "min": 0, "max": 3600, "required": true },
              { "name": "max", "type": "int", "min": 0, "max": 3600, "required": true } ],
  "examples": [";H,MUSE,GAP,10,30"], "commentLabel": "HCR muse gap", "category": "Emotion" },
{ "id": "hcr.stopEmote", "name": "Stop Emote", "safety": "cosmetic", "encoder": "template",
  "template": ";H,STOPEMOTE", "params": [], "examples": [";H,STOPEMOTE"], "commentLabel": "HCR stop emote", "category": "Emotion" },
{ "id": "hcr.resetEmotions", "name": "Reset Emotions", "safety": "cosmetic", "encoder": "template",
  "template": ";H,RESETEMOTIONS", "params": [], "examples": [";H,RESETEMOTIONS"], "commentLabel": "HCR reset emotions", "category": "Emotion" },
{ "id": "hcr.stop", "name": "Stop All", "safety": "cosmetic", "encoder": "template",
  "template": ";H,STOP", "params": [], "examples": [";H,STOP"], "commentLabel": "HCR stop", "category": "Sound" },
{ "id": "hcr.stopWav", "name": "Stop WAV Channel", "safety": "cosmetic", "encoder": "template",
  "template": ";H,STOPWAV,{channel}",
  "params": [ { "name": "channel", "enum": "hcr.channel", "required": true } ],
  "examples": [";H,STOPWAV,A"], "commentLabel": "HCR stop wav", "category": "Sound" },
{ "id": "hcr.fn", "name": "Function (numeric)", "safety": "cosmetic", "encoder": "template",
  "template": ";H,FN,{fn},{chan},{track}",
  "params": [ { "name": "fn", "type": "int", "min": 0, "max": 99, "required": true },
              { "name": "chan", "type": "int", "min": 0, "max": 9, "required": true },
              { "name": "track", "type": "int", "min": 0, "max": 9999, "required": true } ],
  "examples": [";H,FN,14,1,5"], "commentLabel": "HCR fn", "category": "System" },
{ "id": "hcr.raw", "name": "Raw Passthrough", "safety": "cosmetic", "encoder": "template",
  "template": ";H,RAW,{payload}",
  "params": [ { "name": "payload", "pattern": ".+", "required": true } ],
  "examples": [";H,RAW,<CA0>"], "commentLabel": "HCR raw", "category": "System" }
```

- [ ] **Step 3: Extend `categories`** to `["Emotion", "Sound", "Volume", "System"]`.

- [ ] **Step 4: Validate + test.** Run: `npm run validate && npx jest test/library.test.js test/web.test.js test/categories.test.js`
  Expected: exit 0 / PASS. (Confirm no `ERROR`; `hcr.emotion`/`hcr.channel` byte-identical check still passes since they were untouched.)

- [ ] **Step 5: Commit.**

```bash
git add libraries/boards/wcb-hcr.json
git commit -m "feat(wcb-hcr): round out non-volume ;H, verbs (overload, muse, setEmotion, stopWav, fn, raw, …)"
```

---

## Phase 3 — WCB-native command board

### Task 4: New `wcb-native.json` board (`?` set + `;` routing/sequence)

**Files:**
- Create: `libraries/boards/wcb-native.json`
- Modify: `libraries/manifest.json` (register board)
- Modify: `test/load-node.test.js` (component count `18`→`19`)

**Interfaces:**
- Produces: board id `wcb-native`; command ids all `wcb.*` (see table); enums `wcb.port`, `wcb.baud`, `wcb.hwVersion`, `wcb.onOff`.

- [ ] **Step 1: Create the board skeleton** `libraries/boards/wcb-native.json` with the four enums, then fill the `commands` array from the table in Step 2. Component header:

```json
{
  "$schema": "droidnet-command-library/library/v1",
  "enums": {
    "wcb.port": { "label": "Serial Port", "values": [
      { "code": "1", "label": "S1" }, { "code": "2", "label": "S2" }, { "code": "3", "label": "S3" },
      { "code": "4", "label": "S4" }, { "code": "5", "label": "S5" } ] },
    "wcb.baud": { "label": "Baud", "values": [
      { "code": "110", "label": "110" }, { "code": "300", "label": "300" }, { "code": "600", "label": "600" },
      { "code": "1200", "label": "1200" }, { "code": "2400", "label": "2400" }, { "code": "9600", "label": "9600" },
      { "code": "14400", "label": "14400" }, { "code": "19200", "label": "19200" }, { "code": "38400", "label": "38400" },
      { "code": "57600", "label": "57600" }, { "code": "115200", "label": "115200" },
      { "code": "128000", "label": "128000" }, { "code": "256000", "label": "256000" } ] },
    "wcb.hwVersion": { "label": "Hardware", "values": [
      { "code": "1", "label": "v1.0" }, { "code": "21", "label": "v2.1" }, { "code": "23", "label": "v2.3" },
      { "code": "24", "label": "v2.4" }, { "code": "31", "label": "v3.1" }, { "code": "32", "label": "v3.2" } ] },
    "wcb.onOff": { "label": "State", "values": [ { "code": "ON", "label": "On" }, { "code": "OFF", "label": "Off" } ] }
  },
  "components": [
    {
      "id": "wcb-native",
      "name": "WCB (native config)",
      "kind": "device-native",
      "confidence": "high",
      "firmware": "WCB 6.1.5_290119RJUN2026",
      "commands": [ /* Step 2 */ ],
      "categories": ["Setup", "Config", "Routing", "Sequences", "System", "Power"]
    }
  ]
}
```

- [ ] **Step 2: Author every command in this table** into the `commands` array. Each row → one command object shaped exactly like the worked examples below the table (verbatim `template`; `safety`/`category` as given; one `examples` string that the template produces; `commentLabel` a short label). Templates are copied from `WCB_Help.h` v6.1.5. Param shapes: `E:name` = enum, `I:name(min..max)` = int, `P:name=/regex/` = free-text `pattern`.

| id | template | params | safety | category | example |
|---|---|---|---|---|---|
| `wcb.hw` | `?HW,{ver}` | E:ver=wcb.hwVersion | config | Setup | `?HW,31` |
| `wcb.num` | `?WCB,{n}` | I:n(1..9) | config | Setup | `?WCB,1` |
| `wcb.qty` | `?WCBQ,{n}` | I:n(1..9) | config | Setup | `?WCBQ,3` |
| `wcb.mac2` | `?MAC,2,{hex}` | P:hex=`[0-9A-Fa-f]{2}` | config | Setup | `?MAC,2,AB` |
| `wcb.mac3` | `?MAC,3,{hex}` | P:hex=`[0-9A-Fa-f]{2}` | config | Setup | `?MAC,3,CD` |
| `wcb.epass` | `?EPASS,{password}` | P:password=`.+` | config | Setup | `?EPASS,mysecret` |
| `wcb.baud` | `?BAUD,S{port},{rate}` | E:port=wcb.port, E:rate=wcb.baud | config | Config | `?BAUD,S1,57600` |
| `wcb.label` | `?LABEL,S{port},{text}` | E:port=wcb.port, P:text=`.+` | config | Config | `?LABEL,S1,Marcduino` |
| `wcb.labelClear` | `?LABEL,CLEAR,S{port}` | E:port=wcb.port | config | Config | `?LABEL,CLEAR,S1` |
| `wcb.labelClearAll` | `?LABEL,CLEAR,ALL` | — | config | Config | `?LABEL,CLEAR,ALL` |
| `wcb.bcastIn` | `?BCAST,IN,S{port},{state}` | E:port=wcb.port, E:state=wcb.onOff | config | Config | `?BCAST,IN,S3,OFF` |
| `wcb.bcastOut` | `?BCAST,OUT,S{port},{state}` | E:port=wcb.port, E:state=wcb.onOff | config | Config | `?BCAST,OUT,S2,OFF` |
| `wcb.bcastReset` | `?BCAST,RESET` | — | config | Config | `?BCAST,RESET` |
| `wcb.mapSerial` | `?MAP,SERIAL,S{port},{dest}` | E:port=wcb.port, P:dest=`(?:S[1-5]\|W[1-9]S[1-5])` | config | Config | `?MAP,SERIAL,S5,W3S2` |
| `wcb.mapSerialRaw` | `?MAP,SERIAL,S{port},R,{dest}` | E:port=wcb.port, P:dest=`(?:S[1-5]\|W[1-9]S[1-5])` | config | Config | `?MAP,SERIAL,S5,R,W3S2` |
| `wcb.mapSerialList` | `?MAP,SERIAL,LIST` | — | config | Config | `?MAP,SERIAL,LIST` |
| `wcb.mapSerialClear` | `?MAP,SERIAL,CLEAR,S{port}` | E:port=wcb.port | config | Config | `?MAP,SERIAL,CLEAR,S5` |
| `wcb.mapSerialClearAll` | `?MAP,SERIAL,CLEAR,ALL` | — | config | Config | `?MAP,SERIAL,CLEAR,ALL` |
| `wcb.mapPwm` | `?MAP,PWM,S{port},{dest}` | E:port=wcb.port, P:dest=`(?:S[1-5]\|W[1-9]S[1-5])` | config | Config | `?MAP,PWM,S1,W2S3` |
| `wcb.mapPwmOut` | `?MAP,PWM,OUT,S{port}` | E:port=wcb.port | config | Config | `?MAP,PWM,OUT,S1` |
| `wcb.mapPwmList` | `?MAP,PWM,LIST` | — | config | Config | `?MAP,PWM,LIST` |
| `wcb.mapPwmClear` | `?MAP,PWM,CLEAR,S{port}` | E:port=wcb.port | config | Config | `?MAP,PWM,CLEAR,S1` |
| `wcb.mapPwmClearAll` | `?MAP,PWM,CLEAR,ALL` | — | config | Config | `?MAP,PWM,CLEAR,ALL` |
| `wcb.mapClearAll` | `?MAP,CLEAR,ALL` | — | config | Config | `?MAP,CLEAR,ALL` |
| `wcb.kyberLocal` | `?KYBER,LOCAL` | — | config | Config | `?KYBER,LOCAL` |
| `wcb.kyberRemote` | `?KYBER,REMOTE` | — | config | Config | `?KYBER,REMOTE` |
| `wcb.kyberClear` | `?KYBER,CLEAR` | — | config | Config | `?KYBER,CLEAR` |
| `wcb.kyberList` | `?KYBER,LIST` | — | config | Config | `?KYBER,LIST` |
| `wcb.maestro` | `?MAESTRO,{spec}` | P:spec=`.+` | config | Config | `?MAESTRO,M1:W2S1:57600` |
| `wcb.maestroList` | `?MAESTRO,LIST` | — | config | Config | `?MAESTRO,LIST` |
| `wcb.maestroClear` | `?MAESTRO,CLEAR,{id}` | I:id(1..9) | config | Config | `?MAESTRO,CLEAR,1` |
| `wcb.maestroClearAll` | `?MAESTRO,CLEAR,ALL` | — | config | Config | `?MAESTRO,CLEAR,ALL` |
| `wcb.mp3Cfg` | `?MP3,{spec}` | P:spec=`S[1-5]:\d+:V\d+` | config | Config | `?MP3,S5:9600:V0` |
| `wcb.mp3List` | `?MP3,LIST` | — | config | Config | `?MP3,LIST` |
| `wcb.mp3OnErr` | `?MP3,ONERR,{key}` | P:key=`[A-Za-z0-9_]+` | config | Config | `?MP3,ONERR,errseq` |
| `wcb.mp3OnErrClear` | `?MP3,ONERR,CLEAR` | — | config | Config | `?MP3,ONERR,CLEAR` |
| `wcb.mp3Clear` | `?MP3,CLEAR` | — | config | Config | `?MP3,CLEAR` |
| `wcb.hcrPort` | `?HCR,PORT,S{port}:{baud}` | E:port=wcb.port, E:baud=wcb.baud | config | Config | `?HCR,PORT,S1:9600` |
| `wcb.hcrPoll` | `?HCR,POLL,{sec}` | I:sec(0..3600) | config | Config | `?HCR,POLL,10` |
| `wcb.hcrList` | `?HCR,LIST` | — | config | Config | `?HCR,LIST` |
| `wcb.hcrStatus` | `?HCR,STATUS` | — | config | Config | `?HCR,STATUS` |
| `wcb.hcrRefresh` | `?HCR,REFRESH` | — | config | Config | `?HCR,REFRESH` |
| `wcb.hcrClear` | `?HCR,CLEAR` | — | config | Config | `?HCR,CLEAR` |
| `wcb.hcrGet` | `?HCR,GET,{field}` | P:field=`.+` | config | Config | `?HCR,GET,WAVCOUNT` |
| `wcb.routeSerial` | `;S{port},{message}` | E:port=wcb.port, P:message=`.+` | config | Routing | `;S1,#SD01` |
| `wcb.routeWcb` | `;W{wcb},{message}` | I:wcb(1..9), P:message=`.+` | config | Routing | `;W2,;A,PLAY,1` |
| `wcb.timer` | `;T{ms},{command}` | I:ms(0..600000), P:command=`.+` | config | Routing | `;T500,;A,PLAY,1` |
| `wcb.seqSave` | `?SEQ,SAVE,{key},{value}` | P:key=`[A-Za-z0-9_]+`, P:value=`[^\^]+` | config | Sequences | `?SEQ,SAVE,wave,;A,PLAY,1` |
| `wcb.seqList` | `?SEQ,LIST` | — | config | Sequences | `?SEQ,LIST` |
| `wcb.seqClear` | `?SEQ,CLEAR,{key}` | P:key=`[A-Za-z0-9_]+` | config | Sequences | `?SEQ,CLEAR,wave` |
| `wcb.seqClearAll` | `?SEQ,CLEAR,ALL` | — | config | Sequences | `?SEQ,CLEAR,ALL` |
| `wcb.runSeq` | `;C{key}` | P:key=`[A-Za-z0-9_]+` | config | Sequences | `;Cwave` |
| `wcb.runSeqLong` | `;SEQ{key}` | P:key=`[A-Za-z0-9_]+` | config | Sequences | `;SEQwave` |
| `wcb.etmOn` | `?ETM,ON` | — | config | System | `?ETM,ON` |
| `wcb.etmOff` | `?ETM,OFF` | — | config | System | `?ETM,OFF` |
| `wcb.etmTimeout` | `?ETM,TIMEOUT,{ms}` | I:ms(0..60000) | config | System | `?ETM,TIMEOUT,500` |
| `wcb.etmHb` | `?ETM,HB,{sec}` | I:sec(1..3600) | config | System | `?ETM,HB,10` |
| `wcb.etmMiss` | `?ETM,MISS,{count}` | I:count(1..99) | config | System | `?ETM,MISS,3` |
| `wcb.etmBoot` | `?ETM,BOOT,{sec}` | I:sec(0..60) | config | System | `?ETM,BOOT,2` |
| `wcb.etmCount` | `?ETM,COUNT,{n}` | I:n(10..200) | config | System | `?ETM,COUNT,20` |
| `wcb.etmDelay` | `?ETM,DELAY,{ms}` | I:ms(0..10000) | config | System | `?ETM,DELAY,100` |
| `wcb.etmChar` | `?ETM,CHAR` | — | config | System | `?ETM,CHAR` |
| `wcb.etmChksum` | `?ETM,CHKSM,{state}` | E:state=wcb.onOff | config | System | `?ETM,CHKSM,ON` |
| `wcb.debug` | `?DEBUG,{state}` | E:state=wcb.onOff | config | System | `?DEBUG,ON` |
| `wcb.debugEtm` | `?DEBUG,ETM,{state}` | E:state=wcb.onOff | config | System | `?DEBUG,ETM,ON` |
| `wcb.debugPwm` | `?DEBUG,PWM,{state}` | E:state=wcb.onOff | config | System | `?DEBUG,PWM,OFF` |
| `wcb.debugMaestro` | `?DEBUG,MAESTRO,{state}` | E:state=wcb.onOff | config | System | `?DEBUG,MAESTRO,ON` |
| `wcb.debugHcr` | `?DEBUG,HCR,{state}` | E:state=wcb.onOff | config | System | `?DEBUG,HCR,ON` |
| `wcb.stats` | `?STATS` | — | config | System | `?STATS` |
| `wcb.statsReset` | `?STATS,RESET` | — | config | System | `?STATS,RESET` |
| `wcb.delim` | `?DELIM,{char}` | P:char=`.` | config | System | `?DELIM,^` |
| `wcb.funcChar` | `?FUNCCHAR,{char}` | P:char=`.` | config | System | `?FUNCCHAR,?` |
| `wcb.cmdChar` | `?CMDCHAR,{char}` | P:char=`.` | config | System | `?CMDCHAR,;` |
| `wcb.config` | `?config` | — | config | System | `?config` |
| `wcb.backup` | `?backup` | — | config | System | `?backup` |
| `wcb.reboot` | `?reboot` | — | power | Power | `?reboot` |
| `wcb.eraseNvs` | `?ERASE,NVS` | — | power | Power | `?ERASE,NVS` |

**Worked JSON shapes** — every command object matches one of these four (copy the shape, swap in the row's values):

```json
// bare (no params)
{ "id": "wcb.config", "name": "Print Configuration", "safety": "config", "encoder": "template",
  "template": "?config", "params": [], "examples": ["?config"], "commentLabel": "WCB config", "category": "System" }

// enum param(s)
{ "id": "wcb.baud", "name": "Set Baud Rate", "safety": "config", "encoder": "template",
  "template": "?BAUD,S{port},{rate}",
  "params": [ { "name": "port", "enum": "wcb.port", "required": true },
              { "name": "rate", "enum": "wcb.baud", "required": true } ],
  "examples": ["?BAUD,S1,57600"], "commentLabel": "WCB baud", "category": "Config" }

// int param(s)
{ "id": "wcb.num", "name": "Set Board Number", "safety": "config", "encoder": "template",
  "template": "?WCB,{n}",
  "params": [ { "name": "n", "type": "int", "min": 1, "max": 9, "required": true } ],
  "examples": ["?WCB,1"], "commentLabel": "WCB number", "category": "Setup" }

// free-text pattern param(s)
{ "id": "wcb.maestro", "name": "Configure Maestro", "safety": "config", "encoder": "template",
  "template": "?MAESTRO,{spec}",
  "params": [ { "name": "spec", "pattern": ".+", "required": true } ],
  "examples": ["?MAESTRO,M1:W2S1:57600"], "commentLabel": "WCB maestro", "category": "Config" }
```

Notes carried from the spec:
- **`wcb.timer` / `;t` overlap:** modeled as requested. It parses fine (the engine's delay step regex `^;t(\d+)$` is lowercase and anchored, so `;T500,…` survives as this command, not a delay).
- **`wcb.seqSave` value:** `pattern` is `[^\^]+` (any run without `^`) so a single-command body round-trips; a `^`-joined multi-command body is a documented limitation (it would split on the step delimiter).
- **char params** (`wcb.delim` etc.) use `pattern: "."` (exactly one char).

- [ ] **Step 3: Register in `libraries/manifest.json`.** Add to `boards`:

```json
{ "id": "wcb-native", "file": "boards/wcb-native.json", "name": "WCB (native config)", "confidence": "high" }
```

- [ ] **Step 4: Update the component count** in `test/load-node.test.js`: `expect(lib.components.length).toBe(18)` → `toBe(19)`.

- [ ] **Step 5: Validate.** Run: `npm run validate`
  Expected: exit 0. `✓ boards/wcb-native.json` with `warn` lines for the `Routing` outlier category (expected, non-failing). No `ERROR` lines. If any `{param}`↔param or category error appears, fix the offending row.

- [ ] **Step 6: Full test run.** Run: `npm test`
  Expected: PASS. `test/web.test.js` round-trips all ~75 native examples; a template whose `match` doesn't recover the exact params (e.g. a greedy `.+` swallowing a later literal) fails here — fix by tightening that row's `pattern`.

- [ ] **Step 7: Commit.**

```bash
git add libraries/boards/wcb-native.json libraries/manifest.json test/load-node.test.js
git commit -m "feat(wcb-native): WCB native ? config/routing/sequence command board"
```

---

### Task 5: Finalize provenance, release notes, docs

**Files:**
- Modify: `releases.json` (`latest.notes`)
- Modify: `README.md` and/or `docs/BOARD_AUTHORING_GUIDE.md` board list if either enumerates boards (grep first)

- [ ] **Step 1: Write the real `latest.notes`** in `releases.json` describing the 4.1.0 change: HCR volume/fade + verb round-out on `wcb-hcr`, new `wcb-mp3` (`;A,` MP3 Trigger audio), new `wcb-native` (`?` config/routing/sequence set); generated against WCB firmware 6.1.5.

- [ ] **Step 2: Check for a hard-coded board list to update.** Run: `grep -rn "wcb-hcr\|MagicPanel\|board reference\|Roam-A-Dome" README.md docs/*.md`
  If a human-maintained board list exists, add `WCB · MP3 Trigger` and `WCB (native config)`. If not, skip.

- [ ] **Step 3: Full suite.** Run: `npm run validate && npm test`
  Expected: exit 0 / all green.

- [ ] **Step 4: Commit.**

```bash
git add releases.json README.md docs/BOARD_AUTHORING_GUIDE.md
git commit -m "docs: 4.1.0 release notes + board list for WCB 6.1.5 sweep"
```

- [ ] **Step 5: Finish the branch.** Invoke `superpowers:finishing-a-development-branch` to choose merge / PR / cleanup.

---

## Self-Review

**Spec coverage:**
- HCR volume/fade → Task 1 ✓; HCR non-volume round-out → Task 3 ✓; `wcb-mp3` `;A,` family → Task 2 ✓; `wcb-native` `?` set + `;S`/`;W`/`;T` routing + `;C`/`;SEQ` → Task 4 ✓; version 4.1.0 + provenance 6.1.5 (manifest/releases/wcb-hcr firmware) → Tasks 2 & 4 & 5 ✓; phasing 1-3 → Tasks 1-2 / 3 / 4-5 ✓; testing/examples/count assertions → each task ✓.
- Flagged risks documented in Task 4 notes (`;T`/`;t` overlap; `?SEQ,SAVE` value limitation) ✓.

**Placeholder scan:** No TBD/TODO; every command has an exact template + example; the Task-4 table + four worked shapes give complete content per row (the `/* Step 2 */` marker is a fill-point whose content is the table immediately below it, not a deferral).

**Type consistency:** Enum ids referenced by params are all defined — `hcr.volTarget` (Task 1), `hcr.onoff`/`hcr.museMode` (Task 3), `wcb.port`/`wcb.baud`/`wcb.hwVersion`/`wcb.onOff` (Task 4). `hcr.emotion`/`hcr.channel` reused unchanged. Component-count assertion steps chain correctly: 17 → 18 (Task 2) → 19 (Task 4). Version literals set to `4.1.0` in Task 2 across `load-node.test.js` (×3) and `engine.test.js` (×1); `releases.json` and `manifest.json` set in Task 2, notes finalized Task 5.
