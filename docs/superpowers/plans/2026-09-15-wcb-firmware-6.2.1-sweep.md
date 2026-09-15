# WCB Firmware v6.2.1 Command Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish droidnet-command-library **4.3.0** on top of 4.2.0: the WCB 6.2.1 command surface (Maestro comma verbs, a new DFPlayer board, HCR/MP3/WLED updates, 66 new `wcb-native` commands, range fixes) plus the FlthyHPs sequence-code fix — without breaking any value stored under a 4.2.0 id.

**Architecture:** JSON board authoring against the schema-driven engine; no engine or schema change. Guard tests land first and pass on 4.2.0; each board commit keeps its file's existing formatting so the diff stays reviewable.

**Tech Stack:** Node 20, ajv, jest. `npm ci`, `npm run validate`, `npm test`, `npx jest test/wcb-621.test.js`.

**Spec:** `docs/superpowers/specs/2026-09-15-wcb-firmware-6.2.1-sweep-design.md` (decisions D1-D6, per-board tables, id map, FlthyHPs evidence).

**Firmware source of truth:** greghulette/Wireless_Communication_Board-WCB @ `66845b9a` (`Code/WCB/`), greghulette/WcbCmd 0.8.0 @ `168f1e5` (`src/`), WCB 6.1.5 tag `v6.1.5_290119RJUN2026` for "(WCB 6.2+)" decisions, FlthyHPs v1.81 / v2.1 sketches.

## Global Constraints

- **Re-read every cited firmware line before encoding a template, range or enum.** If firmware and the spec disagree, follow firmware and say so in the commit message.
- **D2 freeze:** every 4.2.0 id keeps a byte-identical `template` and ordered param names. Only add ids. The one exception is A11 (three FlthyHPs templates), whitelisted in the freeze test.
- **D5 naming:** a command that needs 6.2 inside a board that also works on older firmware gets " (WCB 6.2+)" in `name`; a 6.2-only board carries it in the component and manifest `name`.
- **Hand-edit board files.** Do not regenerate a board with a JSON re-serializer: `wcb-native`, `wcb-hcr` and `wcb-wled` are compact files and a `JSON.stringify(o, null, 2)` rewrite produces thousand-line diffs. `maestro.json` is already fully expanded.
- **Categories:** every command has a `category` listed in the component `categories`. Non-standard names (`Volume`, `Variables`, `Routing`, `Advanced`) warn only.
- **Examples:** at least one per command, no `^`, and every example on a WCB board must decode to its own id (A2 test b). `wcb-verb` examples stay within 187 characters (A2 test c).
- **Order:** specific literals before catch-alls (first match wins).
- **Gate per commit:** `npm run validate` exits 0 and `npm test` is green.
- **Commits:** conventional messages; end with the `Co-Authored-By` trailer.

---

### Task A0: Prepare

- [ ] `git fetch origin && git status` — clean; `main == origin/main == 82b6a04`.
- [ ] If `origin/main` moved: rebase this plan onto it; if the new tip changed `libraryVersion`, target the next minor instead of 4.3.0.
- [ ] `git switch -c wcb-firmware-6.2.1-sweep`
- [ ] `npm ci && npm run validate && npm test` — baseline green (4.2.0: 11 suites, 324 tests).

### Task A1: Docs — `docs(wcb-6.2.1): sweep spec + plan`

**Files:** create the spec and this plan; modify `docs/BOARD_AUTHORING_GUIDE.md`.

- [ ] Spec: goal, firmware refs, D1-D6, per-board tables, out-of-scope list, ordering hazards, DroidNet 2.2.0 → 4.3.0 id map, FlthyHPs decision and evidence.
- [ ] Guide: after the "`safety` matters" paragraph, add that the composer shows neither `firmware` nor `routing.notes`, so a firmware requirement goes in the command or component name, e.g. "(WCB 6.2+)".

### Task A2: Guard tests — `test: freeze 4.2.0 ids/templates; WCB examples parse to their own command`

Lands before any board edit and must pass on 4.2.0.

**Files:** create `test/fixtures/catalog-4.2.0-commands.json`, `test/wcb-621.test.js`.

- [ ] Generate the fixture once at `82b6a04` from `require('./src/load-node.js').readCatalog()`: `{ "<id>": { "board": "<component id>", "template": "<template>" | null, "params": ["<name>", …] } }` for all 397 commands, in manifest order, one entry per line. Commit it — CI checks out with depth 1, so the test cannot read git history.
- [ ] `test/wcb-621.test.js`, using the `loadEngine()` pattern (`jest.resetModules()` + `require`):
  - **(a)** every fixture id still resolves with the same `template` and ordered param names (D2). Header: "update this fixture only on a major release". An explicit allowlist (empty in A2) pins `{ from, to }` for sanctioned template fixes.
  - **(b)** every example on `maestro`, `wcb-hcr`, `wcb-mp3`, `wcb-wled`, `wcb-native`, and `wcb-dfp` when present: `match(ex).commandId === cmd.id`. Scoped: the whole catalog already fails on `ap.logic.text` / `ap.logic.font` (decode as `rseries.*`), and `test/web.test.js` only checks that an example parses to *some* command.
  - **(c)** every example on a `kind === 'wcb-verb'` board is at most 187 characters (`WCB.ino:216-223`, `ETM_MAX_CMD_WITH_CRC`).
- [ ] Later commits append board-specific assertions to this file.

### Task A3: `feat(maestro): WCB 6.2 comma verbs and get queries; ids 0-9; subroutines 0-127`

**File:** `libraries/boards/maestro.json` (fully expanded JSON; key-order-preserving edit is fine).

**Firmware to re-check:** `WCB.ino:6729-6786` (`processMaestroCommand`), `WCB_Help.cpp:430-459`, `WCB_Maestro.cpp:397`; WcbCmd `WcbMaestro.h:32-51`, `WcbMaestro.cpp:6-21`; 6.1.5 `WCB_Maestro.cpp:143-168`, `WCB.ino:4871-4876`.

- [ ] `maestro.id` codes `0` All, `1`-`8` #1-#8, `9` All local (this WCB) — id 9 works on 6.1.5 too.
- [ ] New `maestro.queryId` codes `1`-`8`.
- [ ] Component: name "Maestro (WCB ;M verbs)" (manifest too); `firmware` "WCB 6.2.1_021242RSEP2026"; `categories` `["Sequences","Movement","System"]`; `routing` `{ "class": "wcb-verb", "notes": … }` — comma forms need 6.2.1 on sender and Maestro host; 6.1.x runs a comma form as subroutine 0; id 0 / 1-8 / 9 meaning; subroutines are Pololu data bytes 0-127 (help says 0-255); get queries take 1-8, are async, write `m<id>pos<ch>` / `m<id>moving` / `m<id>err`, are read by an `IF` in a later trigger, and must never be wrapped in `;W`; `getMovingState` is Mini Maestro only.
- [ ] `maestro.trigger` `seq` max 9 → 127 (template unchanged).
- [ ] Add the 12 `maestro.wcb.*` commands from the spec table (all `encoder: template`; `channel` int 0-23).
- [ ] Tests: `;M11` and `;M91` → `maestro.trigger`; `;M1,5` → `maestro.wcb.sub`; `;M3,5,1000` → `maestro.wcb.subParam`; `;M2,goHome` → `maestro.wcb.goHome` while bare `goHome` → `maestro.goHome`; all 12 `;M{id},` templates have names ending "(WCB 6.2+)".

### Task A4: `feat(wcb-dfp): DFPlayer Mini board (;D, verbs, WCB 6.2+)`

**File:** create `libraries/boards/wcb-dfp.json` (format like `wcb-mp3.json`); modify `libraries/manifest.json`.

**Firmware to re-check:** WcbCmd `WcbDfPlayer.cpp:51-168`; `WCB_DFP.cpp:144-327`; `WCB_Help.cpp:566-593`; `WCB.ino:6426-6428`.

- [ ] Component, enums (`dfp.eq`, `dfp.loopAll`) and the 21 commands from the spec table (`dfp.device` dropped: WCB 6.2.1 cannot run `DEVICE`, see the spec's As built). `dfp.play`, `dfp.stop`, `dfp.volume` keep DroidNet's templates and param names (D1).
- [ ] Manifest entry `{ "id": "wcb-dfp", "file": "boards/wcb-dfp.json", "name": "WCB · DFPlayer Mini (WCB 6.2+)", "confidence": "high" }` right after `wcb-mp3`.
- [ ] Update the component-count pin in `test/load-node.test.js` if it is checked before A12 (21 → 22).

### Task A5: `feat(wcb-hcr): TRIGGER, all-channel VOL/VOLUP/VOLDN steps; FN codes per 6.2.1`

**File:** `libraries/boards/wcb-hcr.json` (hand-edit, compact formatting).

**Firmware to re-check:** `WCB_HCR.cpp:263-299`, `:365-409`; WcbCmd `WcbHcr.cpp:7-36`; `WCB.ino:6391-6408`, `:6430`.

- [ ] `firmware` "WCB 6.2.1_021242RSEP2026"; `routing.notes` about host routing on 6.2.1 vs local-only on 6.1.x. Keep the word "host".
- [ ] `hcr.fn`: `fn` → new enum `hcr.fnCode`; `chan` max 99; `track` 0-9999. Template unchanged.
- [ ] Add `hcr.trigger`, `hcr.volAll`, `hcr.volUpAllStep`, `hcr.volDownAllStep` at the anchors in the spec.
- [ ] Do not touch `hcr.emotion` / `hcr.channel`.

### Task A6: `docs(wcb-mp3): 6.2.1 host routing`

- [ ] `wcb-mp3.json`: `firmware` "WCB 6.2.1_021242RSEP2026"; `routing.notes` (host routing on 6.2.1, `WCB.ino:6424`; local-only on 6.1.x). Verbs unchanged (WcbCmd `WcbMp3.cpp:32-93`).

### Task A7: `fix(wcb-wled): preset starts at 1; 6.2.1 metadata`

- [ ] `wled.preset` `preset` min 0 → 1.
- [ ] `firmware` "WCB 6.2.1_021242RSEP2026"; component and manifest name "WCB · WLED Lighting (WCB 6.2+)" (6.1.5 has no `;L`, 6.1.5 `WCB.ino:4697-4718`).
- [ ] `routing.notes`: needs 6.2.1; receiving WCB must know the WLED id (`?WLED,<id>:W<n>S<port>:<baud>` or WDP), no fallback; one mesh hop, no read-back; ≤187 characters with ETM checksum on.
- [ ] Other nine ids unchanged; skip `wled.fxSpeed`.

### Task A8: `fix(wcb-native): 6.2.1 ranges and grammar corrections`

**File:** `libraries/boards/wcb-native.json` (hand-edit, compact formatting; templates and param names unchanged).

- [ ] `firmware` "WCB 6.2.1_021242RSEP2026"; new enums `wcb.portUsb`, `wcb.devBaud`, `wcb.hcrField`, `wcb.varScope`, `wcb.varOp`, `wcb.varDir`; `categories` per spec.
- [ ] Apply the fix table in the spec (`wcb.maestro` spec pattern, `wcb.num`/`wcb.qty` 20, `wcb.routeWcb` 20, `wcb.routeSerial` S0, `wcb.timer` 1800000, `wcb.maestroClear` 8, `wcb.hcrPort` baud, `wcb.hcrPoll` min 3, `wcb.hcrGet` field enum, `wcb.etmMiss` 100, map destination patterns). Re-read `addSerialMonitorMapping` / `addPWMMapping` and check how a per-destination `R` interacts with the `,R,` literal of `wcb.mapSerialRaw`.
- [ ] Mark `?FUNCCHAR,?` as 6.2.1-only (`WCB.ino:4903-4910`).

### Task A9: `feat(wcb-native): 66 commands for WCB 6.2.1 (and missed 6.1.5 surface)`

- [ ] Insert the 66 commands at the anchors in the spec's "66 new commands" table; → items precede their catch-all.
- [ ] `wcb.pwmPulse` `;P{port}{width}`: `port` must be a single-digit enum or pattern (1-5), never an int — two adjacent int placeholders match greedily.
- [ ] Every 6.2+ command gets " (WCB 6.2+)"; `wcb.mapPwmClearOut` is `power` (reboots); `wcb.identify` is `cosmetic`.
- [ ] Tests: `?ALIAS,CLEAR` → `wcb.aliasClear`; `?ALIAS,clear` → no match; `?VAR,CLEAR,ALL` → `wcb.varClearAll`; `?DFP,ONERR,CLEAR` → `wcb.dfpOnErrClear`; `?MAESTRO,REMOTE` → `wcb.maestroRemote`; `?MAESTRO,M1:W2S1:57600` → `wcb.maestro`; `;Wdome,;A,PLAY,1` → `wcb.routeAlias`; `;W2,;A,PLAY,1` → `wcb.routeWcb`; `;Cwave,L` → `wcb.runSeqLocal`; `;Cwave` → `wcb.runSeq`; `;P11500` → `wcb.pwmPulse` with port `1`, width `1500`.

### Task A10 (optional): `docs(maestro-native): not a WCB grammar`

- [ ] `routing.notes` only (D3): bare Pololu action grammar for NaviCore and local controllers; a WCB does not translate it; use `maestro` (`;M{id},…`) on a WCB; WcbCmd omits restartScript, setSpeedAccel and setEasing (`WcbMaestro.h:48-51`).

### Task A11: `fix(flthy-hps): sequence codes per FlthyHPs v1.81 firmware`

**Decision recorded in the spec: follow the firmware source** (every sketch from v1.6 through v2.1 dispatches 005 solid, 006 rainbow, 007 short circuit and accepts X/Y/Z; the v1.8 manual table is the pre-v1.6 order).

- [ ] `flthy-hps.json`: `flthy.led.shortcircuit` → `{designator}007{color}`; `flthy.led.solid` → `{designator}005{color}`; `flthy.led.rainbow` → `{designator}006`; restore `X` (Front & Rear), `Y` (Front & Top), `Z` (Rear & Top) in `flthy.designator`; update examples.
- [ ] `test/wcb-621.test.js`: add exactly these three ids to the template-fix allowlist with their 4.2.0 and corrected templates, and a one-line reason.
- [ ] Tests that pin the old codes: `test/engine.test.js` (`A0065`, `A007|240`, `A0057`, and the `A007^*** Flthy rainbow` wire strings), `test/load-node.test.js` (`A0065` → `A0055`), `test/fixtures/commands.sample.json`.
- [ ] Docs and examples: `README.md` quick start (`A007^*** Flthy Rainbow`, `A0065`), `docs/INTEGRATION_GUIDE.md` (`A0065`, `A007^*** Flthy rainbow`), `examples/node-example.js`, the `durationSuffix` example in `schema/library.schema.json`.
- [ ] Add a superseded-by note to `docs/superpowers/specs/2026-07-06-flthy-hps-full-command-reference-design.md` (decisions 1 and 2; decision 3, the servo codes, stands).

### Task A12: `release: bump library to 4.3.0 (WCB 6.2.1 sweep)`

- [ ] `libraries/manifest.json`: `libraryVersion` 4.3.0; `generatedFrom` += `; WCB 6.2.1_021242RSEP2026 + WcbCmd 0.8.0 (2026-09)`; 22 boards.
- [ ] `releases.json`: `latest.libraryVersion` and `libraries[0].libraryVersion` 4.3.0; `releasedAt` = merge date; `latest.notes` one string starting "Minor:" (Maestro comma verbs and queries, ids 0-9 / subs 0-127; `wcb-dfp` with 21 verbs; HCR TRIGGER and all-channel volume, FN codes; 66 `wcb-native` commands and range fixes; WLED presets from 1; FlthyHPs codes follow firmware v1.6+; text fields need a host engine 3.1.0 or later; catalog 21 → 22).
- [ ] `package.json` and `package-lock.json` (both `version` fields) 4.3.0 — hand-edit, or `npm --no-git-tag-version version 4.3.0`.
- [ ] Test pins: `test/load-node.test.js` `'4.3.0'` and `toBe(22)`; `test/engine.test.js` `'4.3.0'`.
- [ ] Gate: `npm run validate` (warnings only for non-standard categories), `npm test` green.

### Task A13: PR, CI, merge

- [ ] Push the branch; open "WCB firmware 6.2.1 sweep (4.3.0)", linking the spec and summarizing the D1 id policy.
- [ ] CI `validate-and-test` green; resolve review threads (conversation resolution is required).
- [ ] Merge (branch protection needs one approval; an author cannot approve their own PR). Record the merge SHA.
- [ ] In the PR body, flag for NaviCore: the new `maestro.wcb.*` ids and the sequence ids (`wcb.runSeqLocal`, `wcb.runSeqLongLocal`, `wcb.seqNames`, `wcb.seqGet`, `wcb.timerStop`) that its local `wcb-sequences` split will not move automatically.

### Task A14: After-merge checks

Wait at least 300 s (raw.githubusercontent.com `max-age=300`), then:

- [ ] `releases.json` on `main` reports `4.3.0`; `libraries/manifest.json` reports `4.3.0` and 22 boards.
- [ ] GitHub Pages: `reference.html` lists `wcb-dfp` and the `maestro.wcb.*` commands; `index.html` composes `;D,PLAY,5`.
