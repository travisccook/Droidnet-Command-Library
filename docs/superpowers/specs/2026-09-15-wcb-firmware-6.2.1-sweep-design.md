# WCB Firmware v6.2.1 — Command Sweep (4.3.0)

**Date:** 2026-09-15
**Status:** Draft (implementation on branch `wcb-firmware-6.2.1-sweep`)
**Library base:** `main` @ `82b6a04` — libraryVersion 4.2.0, 21 boards, 397 commands
**Firmware source:** [greghulette/Wireless_Communication_Board-WCB](https://github.com/greghulette/Wireless_Communication_Board-WCB) @ `66845b9a` — `Code/WCB/WCB.ino:181` `SoftwareVersion = "6.2.1_021242RSEP2026"`
**Shared translators:** [greghulette/WcbCmd](https://github.com/greghulette/WcbCmd) 0.8.0 @ `168f1e5` (2026-08-05) — the `;M` / `;A` / `;D` / `;H` / `;L` text-to-device translators that 6.2.1 compiles in (`WCB.ino:87`)
**Baseline for "(WCB 6.2+)":** WCB `v6.1.5_290119RJUN2026` (`5cd4b6ba`). There is no 6.2.0 release, so "6.2+" means 6.2.1 or later.
**Plan:** [`docs/superpowers/plans/2026-09-15-wcb-firmware-6.2.1-sweep.md`](../plans/2026-09-15-wcb-firmware-6.2.1-sweep.md)

All firmware references below are `Code/WCB/<file>:<line>` at `66845b9a` unless marked
6.1.5 (`v6.1.5_290119RJUN2026`) or WcbCmd (`src/<file>:<line>` at `168f1e5`).

## Goal

The 4.1.0 sweep modeled WCB 6.1.5. WCB 6.2.1 adds:

- a DFPlayer Mini verb family (`;D,`);
- comma and verb spellings of `;M` (Pololu servo verbs and asynchronous get queries);
- host routing for `;A`, `;D` and `;H` (the command runs on the board that hosts the device);
- alias routing (`;W<alias>,…`), local-only sequence runs (`;C<key>,L`), persistent variables (`;VP`);
- whole `?` config families: WDP discovery, WLED, DFP, MP3/HCR remote hosts, the controller peer, the mesh channel.

The 4.1.0 sweep also missed part of the 6.1.5 surface (`;P`, `;V` / `IF`, `?VAR`, `?ALIAS`,
`?STOP`, `?IDENTIFY`, …), and 4.2.0 carries a few ranges copied from stale help text.

This sweep brings the catalog to 6.2.1 as a **minor** release (4.3.0) without breaking any
value stored under a 4.2.0 command id, and corrects the FlthyHPs LED sequence codes (see
"FlthyHPs sequence codes").

## Engine facts that shape the design

- **First match wins.** `match()` walks components in manifest order and commands in array
  order, and returns the first anchored template regex that matches
  (`src/droidnet-command-library.js:293`, `:297-306`). Specific literals must come before
  catch-all patterns.
- **Int ranges are UI-only.** Int params always match `(-?\d+)`; `min` / `max` bound the
  composer control, never the parser. Enum and `pattern` params do constrain the parser.
- **The composer never shows `firmware` or `routing.notes`.** Neither
  `src/droidnet-command-library-ui.js` nor the hosted site (`assets/*.js`) reads them, so a
  firmware requirement a user must see goes in a name (D5). The fields stay accurate as the
  reviewer's record of what was verified.
- **Existing tests would not catch a wrong match.** `test/web.test.js` checks that an example
  parses to *some* command. The new guard test checks it parses to *its own* command.

## Decisions

### D1 — 4.3.0 is a minor release

- No 4.2.0 command id is removed, renamed or re-templated (the FlthyHPs template fix is the one
  documented exception; see D2).
- The WCB `;M{id},…` verbs are published under **new** ids, `maestro.wcb.*`. The ids
  `maestro.goHome`, `maestro.stopScript` and `maestro.setTarget` already belong to the
  `maestro-native` board (bare Pololu action grammar); reusing them for `;M` forms would be a
  rename, i.e. 5.0.0.
- DroidNet's unpublished `wled.power`, `wled.brightness`, `wled.effect`, `wled.effectTuned` and
  `wled.palette` are **not** added. They emit the same wire strings as the published
  `wled.on/off/toggle`, `wled.bri`, `wled.fx`, `wled.fxfull` and `wled.pal`, and would shadow
  them (or be shadowed).
- `dfp.play`, `dfp.stop` and `dfp.volume` keep DroidNet's templates and param names (`track`
  1-2999; `volume` 0-30, default 20), so wire text DroidNet already stored decodes unchanged.

### D2 — existing ids may tighten; templates and param names are frozen

- Ranges, enums and patterns on existing ids may change (patch-class fixes).
- Every 4.2.0 id keeps a byte-identical `template` and the same ordered list of param names.
  `test/wcb-621.test.js` enforces this against `test/fixtures/catalog-4.2.0-commands.json`
  (generated from the real catalog at `82b6a04`). The fixture changes only on a major release.
- `wcb.mapSerial`, `wcb.mapSerialRaw` and `wcb.mapPwm` keep `{dest}`; only its `pattern` widens.
- **Exception:** the three FlthyHPs LED templates (`flthy.led.solid`, `flthy.led.rainbow`,
  `flthy.led.shortcircuit`) are corrected to the firmware's codes. Their param names do not
  change. The freeze test lists them in an explicit allowlist that pins both the 4.2.0 and the
  corrected template, so nothing else can slip through.

### D3 — `maestro-native` stays as is

It is the bare Pololu action grammar used by NaviCore (upstream PR #8). A WCB does not
translate it; WcbCmd leaves out `restartScript`, `setSpeedAccel` and `setEasing`
(WcbCmd `WcbMaestro.h:48-51`). At most add `routing.notes` pointing WCB users at the `maestro`
board. Its channel max of 31 is left to its author.

### D4 — one version number

`package.json` `version` and `package-lock.json` `version` (top level and `packages[""]`) move
to `4.3.0` together with `libraries/manifest.json` and `releases.json`. Neither package file
has tracked the catalog before (`2.1.1` / `1.0.0`).

### D5 — firmware requirements go in names

- A command that needs 6.2 inside a board that otherwise works on older firmware gets the
  suffix **" (WCB 6.2+)"** in its `name`.
- A board that only exists on 6.2 (`wcb-dfp`, `wcb-wled`) carries "(WCB 6.2+)" in the
  component `name` and in its manifest `name`.
- `docs/BOARD_AUTHORING_GUIDE.md` records the rule for future boards.

### D6 — left out of 4.3.0

| Item | Why |
|---|---|
| `?OTA`, `?OTALOCAL` (`WCB.ino:5345`, `:5359`) | The Wizard's OTA transfer protocol (base64 chunks), not a user command |
| `?MGMT`, `?RTERM`, `WCB_WEBTOOL_CONFIG_PULL`, `?CHK`, `?CS` | Internal / bootstrap machine protocols |
| `?STATS,RPT,…` (`WCB.ino:5539`) | Machine-to-machine reports |
| Legacy aliases (`?SPECIAL`, `?HWx`, `?BAUDSx,…`, `;H,VOLDOWN`, …) | Deprecated spellings; author canonical forms only (as in 4.1.0) |
| Implicit `,key` callbacks (`;A,PLAY,5,key`, `;D,PLAY,5,key`) | Ambiguous next to the explicit `,ONFIN,key` form |
| No-comma `;S{port}{msg}` | Would turn existing `targetPrefix` values such as `;S3T52` into route commands |
| Bare `;L,<verb>` (lowest-id local WLED, `WCB_WLED.cpp:125-137`) | Undocumented in help; needs an empty-code enum on `wledId` |
| Safety class of `wcb.runSeq`, `wcb.runSeqLong`, `wcb.timer` (`config` today) | These can trigger movement; changing the class is a follow-up review |

## Board changes

Values below come from the cited firmware lines (the grammar, range and routing claims were
spot-checked against `66845b9a` while writing this spec). Each implementation commit re-reads
its citations before encoding a template, range or enum; where firmware and this table
disagree, the firmware wins and the commit message says so.

### `maestro` (wcb-verb) — comma verbs and get queries

Grammar: `processMaestroCommand` (`WCB.ino:6729-6786`), help (`WCB_Help.cpp:430-459`),
WcbCmd `WcbMaestro.h:32-41`, `WcbMaestro.cpp:6-21`, `:98-120`.

- **Component:** name "Maestro (WCB ;M verbs)" (manifest too); `firmware` "WCB
  6.2.1_021242RSEP2026"; `categories` `["Sequences","Movement","System"]`; `routing.notes`
  cover the facts below.
- **`maestro.id`** codes: `0` All, `1`-`8` #1-#8, `9` All local (this WCB). Id 9 is **not**
  6.2-only: 6.1.5 already sends `;M9…` to every local Maestro (6.1.5 `WCB_Maestro.cpp:143-168`).
- **New `maestro.queryId`** codes `1`-`8`: get queries reject 0 and 9
  (`WCB_Maestro.cpp:397`, `WCB_Help.cpp:451`).
- **`maestro.trigger`** `seq` max 9 → 127. Firmware accepts 0-255 (`WCB.ino:6750-6754`), but a
  Pololu data byte is 0-127. Template `;M{id}{seq}` unchanged.
- Comma forms need 6.2.1 on the sending board **and** the Maestro host. 6.1.x reads `;M1,5` as
  id 1 with `",5".toInt()` = subroutine **0** (6.1.5 `WCB.ino:4871-4876`).
- get* queries are asynchronous and write RAM variables `m<id>pos<ch>`, `m<id>moving`,
  `m<id>err`; an `IF` in a separate, later trigger reads them; never wrap a get in `;W`
  (`WCB_Help.cpp:451-459`). `getMovingState` is Mini Maestro only.

| id | name | template | params | category | safety | example |
|---|---|---|---|---|---|---|
| `maestro.wcb.sub` | Run Subroutine (WCB 6.2+) | `;M{id},{sub}` | sub 0-127 | Sequences | movement | `;M1,5` |
| `maestro.wcb.subParam` | Run Subroutine with Parameter (WCB 6.2+) | `;M{id},{sub},{param}` | sub 0-127, param 0-16383 | Sequences | movement | `;M3,5,1000` |
| `maestro.wcb.subVerb` | Run Subroutine, sub verb (WCB 6.2+) | `;M{id},sub,{sub}` | sub 0-127 | Sequences | movement | `;M2,sub,5` |
| `maestro.wcb.subVerbParam` | Run Subroutine with Parameter, sub verb (WCB 6.2+) | `;M{id},sub,{sub},{param}` | sub 0-127, param 0-16383 | Sequences | movement | `;M2,sub,5,1000` |
| `maestro.wcb.stopScript` | Stop Script (WCB 6.2+) | `;M{id},stopScript` | — | Sequences | movement | `;M1,stopScript` |
| `maestro.wcb.goHome` | Go Home (WCB 6.2+) | `;M{id},goHome` | — | Movement | movement | `;M2,goHome` |
| `maestro.wcb.setTarget` | Set Servo Target (WCB 6.2+) | `;M{id},setTarget,{channel},{target}` | channel 0-23; target 0-16383, default 6000 | Movement | movement | `;M1,setTarget,0,6000` |
| `maestro.wcb.setSpeed` | Set Speed Limit (WCB 6.2+) | `;M{id},setSpeed,{channel},{speed}` | channel 0-23; speed 0-16383, default 0 | Movement | movement | `;M5,setSpeed,3,10` |
| `maestro.wcb.setAccel` | Set Acceleration Limit (WCB 6.2+) | `;M{id},setAccel,{channel},{accel}` | channel 0-23; accel 0-255 | Movement | movement | `;M2,setAccel,0,5` |
| `maestro.wcb.getPosition` | Read Servo Position (WCB 6.2+) | `;M{id},getPosition,{channel}` | id = `maestro.queryId`; channel 0-23 | System | cosmetic | `;M2,getPosition,0` |
| `maestro.wcb.getMovingState` | Read Moving State (WCB 6.2+) | `;M{id},getMovingState` | id = `maestro.queryId` | System | cosmetic | `;M2,getMovingState` |
| `maestro.wcb.getErrors` | Read Errors (WCB 6.2+) | `;M{id},getErrors` | id = `maestro.queryId` | System | cosmetic | `;M2,getErrors` |

Channel max 23 is the largest Maestro (Mini Maestro 24); the frame builder accepts up to 127.

### `wcb-dfp` (new, wcb-verb) — DFPlayer Mini

Grammar: WcbCmd `WcbDfPlayer.cpp:51-168`; config `WCB_DFP.cpp:144-327`; help
`WCB_Help.cpp:566-593`; routing `WCB.ino:6426-6428`.

- **Component:** id `wcb-dfp`, name "WCB · DFPlayer Mini (WCB 6.2+)", `kind` wcb-verb,
  `confidence` high, `firmware` "WCB 6.2.1_021242RSEP2026", `categories`
  `["Sound","Volume","System"]`. Manifest entry right after `wcb-mp3` (the `;D,` prefix is
  unique, so position does not affect matching).
- **`routing.notes`:** needs `?DFP,S<port>` (baud fixed at 9600); `;D` runs on the local host,
  else the `?DFP,REMOTE` board, else a board advertising a DFPlayer over WDP; volume 0 = silent,
  30 = loudest (the reverse of `;A`); allow 1.5-3 s after power-on; clone modules may ignore
  RANDOM, EQ and LOOPFOLDER.
- **Enums:** `dfp.eq` 0 Normal, 1 Pop, 2 Rock, 3 Jazz, 4 Classic, 5 Bass; `dfp.device` 1 USB,
  2 SD card, 3 AUX, 4 Sleep, 5 Flash; `dfp.loopAll` 0 Off, 1 On.
- **22 commands**, all `cosmetic` except `dfp.device` and `dfp.reset` (`config`). Callback key
  pattern `[A-Za-z0-9_]+`.

| id | template | params | example |
|---|---|---|---|
| `dfp.play` | `;D,PLAY,{track}` | track 1-2999 | `;D,PLAY,5` |
| `dfp.playCb` | `;D,PLAY,{track},ONFIN,{key}` | track, key | `;D,PLAY,5,ONFIN,done` |
| `dfp.folder` | `;D,FOLDER,{folder},{track}` | folder 1-99, track 1-255 | `;D,FOLDER,1,5` |
| `dfp.folderCb` | `;D,FOLDER,{folder},{track},ONFIN,{key}` | folder, track, key | `;D,FOLDER,1,5,ONFIN,done` |
| `dfp.mp3Folder` | `;D,MP3FOLDER,{track}` | track 1-9999 | `;D,MP3FOLDER,3` |
| `dfp.mp3FolderCb` | `;D,MP3FOLDER,{track},ONFIN,{key}` | track, key | `;D,MP3FOLDER,3,ONFIN,done` |
| `dfp.stop`, `dfp.pause`, `dfp.resume`, `dfp.next`, `dfp.prev`, `dfp.random` | `;D,STOP`, `;D,PAUSE`, `;D,RESUME`, `;D,NEXT`, `;D,PREV`, `;D,RANDOM` | — | same as template |
| `dfp.loop` | `;D,LOOP,{track}` | track 1-2999 | `;D,LOOP,5` |
| `dfp.loopAll` | `;D,LOOPALL,{state}` | `dfp.loopAll` | `;D,LOOPALL,1` |
| `dfp.loopFolder` | `;D,LOOPFOLDER,{folder}` | folder 1-99 | `;D,LOOPFOLDER,1` |
| `dfp.eq` | `;D,EQ,{preset}` | `dfp.eq` | `;D,EQ,2` |
| `dfp.volume` | `;D,VOL,{volume}` | volume 0-30, default 20 | `;D,VOL,20` |
| `dfp.volUp`, `dfp.volDown` | `;D,VOLUP`, `;D,VOLDN` | — (steps of 2) | same as template |
| `dfp.device` | `;D,DEVICE,{source}` | `dfp.device` | `;D,DEVICE,2` |
| `dfp.reset` | `;D,RESET` | — | `;D,RESET` |
| `dfp.status` | `;D,STATUS` | — | `;D,STATUS` |

### `wcb-hcr` — TRIGGER, all-channel volume steps, FN codes

Grammar: `WCB_HCR.cpp:263-285` (FN), `:290-299` (TRIGGER), `:365-409` (VOL / VOLUP / VOLDN);
WcbCmd `WcbHcr.cpp:7-36`.

- **Component:** `firmware` "WCB 6.2.1_021242RSEP2026" (replaces the stale "WCB 6.1.0
  HCR_Integration"); `routing.notes`: on 6.2.1 `;H` runs on the board that **hosts** the HCR —
  this board, else the `?HCR,REMOTE,W<n>` board, else a board advertising HCR over WDP
  (`WCB.ino:6391-6408`, `:6430`); 6.1.x runs `;H` on the local board only. Keep the word
  "host" (a DroidNet test matches it).
- **`hcr.fn`** (template unchanged): `fn` becomes enum `hcr.fnCode` — 2 SetEmotion, 3 Trigger,
  4 Stimulate, 5 Overload, 6 Muse, 7 Muse gap (6.2+), 8 Stop all, 9 Stop emote, 10 Override
  (6.2+), 11 Reset emotions, 13 Set muse (6.2+), 14 Play WAV, 16 Stop WAV, 17 Set volume,
  18 Vol up all (6.2+), 19 Vol down all (6.2+). Codes 12 and 15 are rejected. `chan` max 99
  (fn 7); `track` 0-9999 (fn 14).
- **Do not touch** `hcr.emotion` / `hcr.channel`: `test/library.test.js` requires them
  byte-identical to `hcr-native.json`.

| id | name | template | params | category | example | insert before |
|---|---|---|---|---|---|---|
| `hcr.trigger` | Emotional Trigger | `;H,TRIGGER,{emotion},{strength}` | `hcr.emotion`, `hcr.strength` | Emotion | `;H,TRIGGER,M,MOD` | `hcr.play` |
| `hcr.volAll` | Set Volume, all channels (WCB 6.2+) | `;H,VOL,{level}` | level 0-100 | Volume | `;H,VOL,60` | `hcr.volUp` |
| `hcr.volUpAllStep` | Volume Up by step, all channels | `;H,VOLUP,{step}` | step 1-100, default 5 | Volume | `;H,VOLUP,10` | `hcr.volDown` |
| `hcr.volDownAllStep` | Volume Down by step, all channels | `;H,VOLDN,{step}` | step 1-100, default 5 | Volume | `;H,VOLDN,10` | `hcr.fadeIn` |

All four are `cosmetic`.

### `wcb-mp3` — host routing notes

`firmware` "WCB 6.2.1_021242RSEP2026". `routing.notes`: on 6.2.1 `;A` runs on the MP3 host
(local, `?MP3,REMOTE,W<n>`, or a board advertising it over WDP; `WCB.ino:6424`); 6.1.x plays
only on the local board. Verbs unchanged (WcbCmd `WcbMp3.cpp:32-93`).

### `wcb-wled` — preset range and 6.2 naming

- `wled.preset` `preset` min 0 → 1 (WLED preset ids are 1-250).
- `firmware` "WCB 6.2.1_021242RSEP2026". Component and manifest name "WCB · WLED Lighting (WCB
  6.2+)": 6.1.5 has no `;L` dispatch (6.1.5 `WCB.ino:4697-4718`; 6.2.1 `WCB.ino:6432-6433`).
- `routing.notes`: needs 6.2.1; the receiving WCB must know the WLED id (`?WLED,<id>:W<n>S<port>:<baud>`
  or learned over WDP) — no fallback; forwarded one mesh hop, no read-back; a mesh-routed
  command must stay within 187 characters while the ETM checksum is on.
- The other nine ids are unchanged. `wled.fxSpeed` (FX with speed but no intensity, WcbCmd
  `WcbWled.cpp:80-90`) is skipped.

### `wcb-native` — range and grammar fixes (templates unchanged)

New enums: `wcb.portUsb` (`0` "S0 (USB)" plus the `wcb.port` values), `wcb.devBaud` (9600,
19200, 38400, 57600, 115200), `wcb.hcrField` (`EMOTION,H|S|M|C`, `DURATION`, `OVERRIDE`,
`MUSE`, `WAVCOUNT`, `PLAYING,V|A|B`, `VOL,V|A|B`), `wcb.varScope` (`V` Volatile (RAM), `VP`
Persistent (NVS, WCB 6.2+)), `wcb.varOp` (TOGGLE, INC, DEC, true, false), `wcb.varDir` (INC,
DEC). `categories` become `["Setup","Config","Routing","Movement","Sequences","Variables","System","Power"]`.

| Id | Change | Firmware |
|---|---|---|
| `wcb.maestro` | `spec` pattern `.+` → `M[0-9]:W[0-9]{1,2}S[0-9]:[0-9]+(?:,M[0-9]:W[0-9]{1,2}S[0-9]:[0-9]+)*`; today `?MAESTRO,REMOTE` parses as `wcb.maestro` | `WCB.ino:5437` |
| `wcb.num`, `wcb.qty` | max 9 → 20 | `WCB.ino:5298-5305`, `WCB_Storage.cpp:447-451` |
| `wcb.routeWcb` | `wcb` max 20 | `WCB.ino:6553-6566` |
| `wcb.routeSerial` | port → `wcb.portUsb`; 6.2.1 strips one comma, 6.1.x put ",msg" on the wire | `WCB.ino:6450-6463` |
| `wcb.timer` | ms max 1800000 | `command_timer.cpp:166` |
| `wcb.maestroClear` | id max 8 | `WCB_Maestro.cpp:817` |
| `wcb.hcrPort` | baud → `wcb.devBaud` (S3-S5 only 9600) | `WCB_HCR.cpp:631-640` |
| `wcb.hcrPoll` | min 3 (0 / OFF = off → `wcb.hcrPollOff`) | `WCB_HCR.cpp:568-575` |
| `wcb.hcrGet` | `field` → `wcb.hcrField` | `WCB_HCR.cpp:586-604` |
| `wcb.etmMiss` | max 100 | `WCB.ino:5211-5217` |
| `wcb.mapSerial`, `wcb.mapSerialRaw` | `dest` pattern → comma list of `S0-S5` / `W1-20S0-5`, optional `R` per destination; re-check against the `,R,` literal in `mapSerialRaw` | `WCB_Storage.cpp` `addSerialMonitorMapping` |
| `wcb.mapPwm` | `dest` pattern → comma list of `S1-S5` / `W1-20S1-5` | `WCB_PWM.cpp` `addPWMMapping` |

`?FUNCCHAR,?` (existing example) only works on 6.2.1, which exempts FUNCCHAR/CMDCHAR from the
trailing-`?` help shortcut (`WCB.ino:4903-4910`); say so in the command name or notes.

### `wcb-native` — 66 new commands

Names, safety and categories follow the 4.1.0 conventions (`config` for `?` setup, `cosmetic`
for read-only queries and identify, `movement` for `;P`, `power` for anything that reboots).
Every command marked 6.2+ gets " (WCB 6.2+)". An arrow (→) marks a command that must precede
the catch-all after it.

| Insert before | Commands (id: template) | Firmware |
|---|---|---|
| `wcb.mac2` | `wcb.meshChannel` `?WCBCH,{ch}` 1-11 (6.2+, applies on reboot) · → `wcb.aliasClear` `?ALIAS,CLEAR` · → `wcb.aliasList` `?ALIAS,LIST` · `wcb.alias` `?ALIAS,{name}` pattern `(?![Cc][Ll][Ee][Aa][Rr]$\|[Ll][Ii][Ss][Tt]$)[A-Za-z](?:[^,;?^\|\r\n]{0,22}[^,;?^\|\s])?` · `wcb.controllerOn` `?CONTROLLER,ON` · `wcb.controllerOnId` `?CONTROLLER,ON,{id}` 1-20 · `wcb.controllerOff` `?CONTROLLER,OFF` (controller 6.2+) · `wcb.ledPin` `?LED,PIN,{gpio}` 0-48 · `wcb.ledPinQuery` `?LED,PIN` · `wcb.identify` `?IDENTIFY` (cosmetic) | `WCB.ino:5323`, `:5372-5384`, `:5394-5420`, `:5678-5681`, `:5629`; `WCB_Storage.cpp:212-240` |
| `wcb.bcastReset` | `wcb.bcastOutUsb` `?BCAST,OUT,S0,{state}` (6.2+) | `WCB.ino:5133` |
| `wcb.mapPwmList` | `wcb.mapPwmClearOut` `?MAP,PWM,CLEAR,OUT,S{port}` — **safety `power`**, it reboots | `WCB.ino:5026-5033` |
| near `wcb.kyber*` | `wcb.kyberLocalMaestros` `?KYBER,LOCAL,S{port},{spec}` (spec = the Maestro spec pattern above) | `WCB_Help.cpp:213` |
| `wcb.maestro` | → `wcb.maestroRemote` `?MAESTRO,REMOTE` | `WCB.ino:5437-5441` |
| `wcb.mp3*` block | `wcb.mp3Remote` `?MP3,REMOTE,W{wcb}` 1-20 · `wcb.mp3RemoteOff` `?MP3,REMOTE,OFF` (6.2+) | `WCB_MP3.cpp:206-209` |
| `wcb.hcrPort` | `wcb.dfpCfg` `?DFP,S{port}:9600:V{vol}` (vol 0-30) · `wcb.dfpPort` `?DFP,S{port}` · `wcb.dfpList` · `wcb.dfpClear` · `wcb.dfpRemote` `?DFP,REMOTE,W{wcb}` · `wcb.dfpRemoteOff` · → `wcb.dfpOnErrClear` `?DFP,ONERR,CLEAR` · `wcb.dfpOnErr` `?DFP,ONERR,{key}` (all 6.2+) | `WCB_DFP.cpp:144-327` |
| `wcb.hcrList` | `wcb.hcrPollOff` `?HCR,POLL,OFF` · `wcb.hcrRemote` `?HCR,REMOTE,W{wcb}` (6.2+) · `wcb.hcrRemoteOff` `?HCR,REMOTE,OFF` (6.2+) | `WCB_HCR.cpp:537-562`, `:568-575` |
| `wcb.routeSerial` | `wcb.wledCfg` `?WLED,{id}:W{wcb}S{port}:{baud}` (id 1-9, wcb 1-20, port `wcb.portUsb`, baud `wcb.devBaud`; `?WLED,1:W3S2:115200`) · `wcb.wledList` · `wcb.wledStatus` · `wcb.wledClear` · `wcb.wledClearId` `?WLED,CLEAR,{id}` (all 6.2+) | `WCB_WLED.cpp:229-353` |
| `wcb.timer` | `wcb.routeAlias` `;W{alias},{message}`, alias `[A-Za-z](?:[^,;?^\|\r\n]{0,22}[^,;?^\|\s])?` (6.2+) · `wcb.pwmPulse` `;P{port}{width}` port single-digit 1-5 (enum or pattern, see hazards), width 500-2500, Movement / movement | `WCB.ino:6525-6550`, `:6788-6834` |
| `wcb.seqList` | `wcb.seqNames` `?SEQ,NAMES` · `wcb.seqGet` `?SEQ,GET,{key}` (6.2+) | `WCB.ino:5497`, `:5513` |
| after `wcb.runSeqLong` | `wcb.runSeqLocal` `;C{key},L` · `wcb.runSeqLongLocal` `;SEQ{key},L` (6.2+; on 6.1 the `,L` becomes part of the key) · `wcb.timerStop` `?STOP` | `WCB.ino:6654-6691`, `:7053`; `command_timer.cpp:66-78` |
| `wcb.etmOn` | `wcb.varSet` `;{scope},{name},{value}` (name `[A-Za-z0-9_]{1,15}`, value int) · `wcb.varOp` `;{scope},{name},{op}` · `wcb.varStep` `;{scope},{name},{dir},{n}` · `wcb.if` `IF,{cond}` (gates the next step; cannot ride inside a `;W` or `;T` payload) · `wcb.varList` `?VAR,LIST` · `wcb.varSetNvs` `?VAR,SET,{name},{value}` · `wcb.varGet` `?VAR,GET,{name}` · → `wcb.varClearAll` `?VAR,CLEAR,ALL` · `wcb.varClear` `?VAR,CLEAR,{name}` | `WCB_Variables.cpp:63-73`, `:209-337`, `:372`, `:435`; `WCB.ino:6568-6581` |
| `wcb.stats` | `wcb.debugMgmt` `?DEBUG,MGMT,{state}` · `wcb.debugRaw` `?DEBUG,RAW,{state}` · `wcb.track` `?TRACK,{state}` · `wcb.trackStatus` `?TRACK,STATUS` · `wcb.version` `?VERSION` · `wcb.peersLive` `?PEERSLIVE` (6.2+) · WDP (all 6.2+): `wcb.wdpList` `?WDP,LIST`, `wcb.wdpDetail` `?WDP,{wcb}`, `wcb.wdpStatus`, `wcb.wdpDump`, `wcb.wdpDa`, `wcb.wdpPoll`, `wcb.wdpEnable` `?WDP,{state}`, `wcb.wdpAutojoin`, `wcb.wdpAutojoinSet` `?WDP,AUTOJOIN,{state}`, `wcb.wdpAdd` `?WDP,ADD,{wcb}`, `wcb.wdpForget` `?WDP,FORGET,{wcb}`, `wcb.wdpClear` | `WCB.ino:4965-4976`, `:5336`, `:5551`, `:5749`; `WCB_WDP.cpp:1201-1276` |

Behavior changes between 6.1 and 6.2 that existing commands' notes should mention:

- `;C<key>` / `;SEQ<key>` now run on **every** mesh board that stores the key
  (`WCB.ino:6654-6691`); 6.1.5 ran them locally. `,L` restores local-only.
- `;A`, `;D`, `;H` run on the device host (`routeStoredOrCap`, `WCB.ino:6391-6408`).
- `;V` is now volatile (RAM only); `;VP` is persistent (`WCB_Variables.cpp:203-220`). In 6.1.5
  `;V` persisted.

### `maestro-native` (optional)

`routing.notes` only: "Bare Pololu action grammar used by NaviCore and local controllers; a WCB
does not translate it. For a WCB use the `maestro` board (`;M{id},…`)." No other change (D3).

## Ordering and grammar hazards

First-match-wins makes these pairs order-sensitive. The guard test (b) catches any regression
because every example on the WCB boards must decode to its own id.

| Specific (must come first) | Catch-all it would lose to |
|---|---|
| `wcb.aliasClear` `?ALIAS,CLEAR`, `wcb.aliasList` `?ALIAS,LIST` | `wcb.alias` `?ALIAS,{name}` (the negative lookahead also keeps any-case CLEAR/LIST out, matching the firmware's case-insensitive compare at `WCB.ino:5374-5379`; `?ALIAS,clear` stays a raw step) |
| `wcb.maestroRemote` `?MAESTRO,REMOTE` | `wcb.maestro` `?MAESTRO,{spec}` (also fixed by tightening `spec`) |
| `wcb.dfpOnErrClear` `?DFP,ONERR,CLEAR` | `wcb.dfpOnErr` `?DFP,ONERR,{key}` |
| `wcb.varClearAll` `?VAR,CLEAR,ALL` | `wcb.varClear` `?VAR,CLEAR,{name}` |
| existing `wcb.maestroClearAll`, `wcb.mp3OnErrClear`, `wcb.seqClearAll` (4.1.0 `43c6721`) | their `{…}` siblings |

Not order-sensitive, but worth a test:

- `;Cwave,L` vs `;Cwave` — the key pattern excludes `,`, so `wcb.runSeq` cannot claim `,L`.
- `;Wdome,…` vs `;W2,…` — an alias starts with a letter, a board number is digits
  (`WCB.ino:6525-6566`).
- `;M2,goHome` (`maestro.wcb.goHome`) vs bare `goHome` (`maestro.goHome`, `maestro-native`) —
  distinct boards, no shared id.
- `;H,VOL,60` vs `;H,VOL,A,80`, `;H,VOLUP` vs `;H,VOLUP,10` vs `;H,VOLUP,A,5` — anchored
  templates with different field counts.
- **`wcb.pwmPulse` `;P{port}{width}`:** two adjacent placeholders. An int `port` would match
  greedily (`;P11500` → port `1150`, width `0`), so `port` must be a single-digit enum or
  pattern. Firmware reads exactly one digit, port 1-5, width 500-2500 (`WCB.ino:6791-6794`).
- Whole-catalog self-match is **not** a goal: `ap.logic.text` / `ap.logic.font` examples already
  decode as `rseries.*` (earlier in the manifest). The guard is scoped to the WCB boards.

## FlthyHPs sequence codes

**Decision: follow the firmware source.** 4.3.0 ships the fix (plan task A11):
`flthy.led.solid` → `{designator}005{color}`, `flthy.led.rainbow` → `{designator}006`,
`flthy.led.shortcircuit` → `{designator}007{color}`, and `flthy.designator` regains `X`
(Front & Rear), `Y` (Front & Top), `Z` (Rear & Top).

2.3.0 (`b38b5d2`) set solid 006 / rainbow 007 / short circuit 005 and dropped X/Y/Z, following
the command table of *FlthyHPs Manual v1.8* (see
`2026-07-06-flthy-hps-full-command-reference-design.md`). That table describes the sketch
**before v1.6**. From v1.6 on, every release — v1.81 (the last v1) and the author's current
v2.1 — dispatches 005 solid, 006 rainbow, 007 short circuit, and accepts X/Y/Z.

| Source | Lines | 005 | 006 | 007 | X/Y/Z |
|---|---|---|---|---|---|
| FlthyHPs v1.3 / v1.4 / v1.5 sketches ([apsteven/FlthyHP](https://github.com/apsteven/FlthyHP) @ `bdbcbe3`, a copy of the 2geekswebdesign.com distribution) | v1.3 `Sketches/FlthyHPs_v1.3.ino:84-86`, dispatch `:793-795`; v1.4 `:86-88`, `:761-763`; v1.5 `:87-89`, `:762-764` | short circuit | solid | rainbow | yes (v1.3 `:692-694`) |
| FlthyHPs v1.6 | `Sketches/FlthyHPs_v1.6.ino:114-116`, dispatch `:866-868` | solid | rainbow | short circuit | yes (`:759-761`) |
| **FlthyHPs v1.81** | `Sketches/FlthyHPs_v1.8.ino:3` ("v1.81"), table `:118-120`, designators `:794-796` and `:813-817`, function = digits 3-4 `:802`, dispatch `:932-934` (`case 5: ledColor`, `case 6: rainbow`, `case 7: ShortCircuit`), `LEDFunction = functionState` `:1418`, short-circuit default color when `functionState==7` `:1426` | solid | rainbow | short circuit | yes |
| FlthyHPs v2.1, author's repo ([ryan-sondgeroth/FlthyHPs](https://github.com/ryan-sondgeroth/FlthyHPs) @ `aea19d8`) | `PCA9685/FlthyHPs_v2.1.ino:440-442` (`SOLID_COLOR = 5`, `RAINBOW = 6`, `SHORT_CIRCUIT = 7`), function digits `:1019`, designator masks `:1122-1125`; `Maestro/FlthyHPs_v2.1_Maestro/FlthyHPs_v2.1_Maestro.ino:450-452`, `:1045`, `:1180-1182` | solid | rainbow | short circuit | yes |
| Author's current manual (same repo) | `docs/README.md:349-351` (X/Y/Z), `:362-363`, examples `:404` "R0053 — Rear HP LEDs set solid Green", `:406` "T006 — Starts Rainbow", `:436` `A006\|45` rainbow | solid | rainbow | short circuit | yes |
| *FlthyHPs Manual v1.8* PDF, command table (p. 22) | 05 Short Circuit, 06 Toggles Color, 07 Rainbow; examples `R0063`, `T007` | short circuit | solid | rainbow | F/R/T/A only |

- The v1.81 sketch header's own example "A007\|25 would run the Rainbow Sequence"
  (`FlthyHPs_v1.8.ino:155`) is the same leftover: it is the v1.3 wording and contradicts the
  table 35 lines above it and the dispatch. The v1.8 manual's MarcDuino section (`A006|10` =
  rainbow) already matched the source.
- v1.6 moved short circuit out of the random auto-twitch range: twitch picks
  `random(2,7)` = functions 2-6 (`FlthyHPs_v1.6.ino:905`, `FlthyHPs_v1.8.ino:976`), so solid and
  rainbow can twitch and short circuit cannot. That is the renumbering's evident purpose.
- The servo codes the 2.3.0 spec chose from the table (1 preset, 2 RC L/R, 3 RC U/D, 4 random)
  match the v1.81 dispatch (`FlthyHPs_v1.8.ino:956-961`); they stay.
- A C2B5 working copy of v1.81 has the identical dispatch; it differs from the stock sketch
  only in user settings.
- This catalog already agrees with the source elsewhere: `astropixels-holo` (the AstroPixelsPlus
  `@HP` port of the same holoprojector grammar) publishes `ap.hp.native.solid` `@HP{dev}005{color}`,
  `ap.hp.native.rainbow` `@HP{dev}006` and `ap.hp.native.shortcircuit` `@HP{dev}007{color}`.

**Effect on stored values.** Wire text never changes; decoding follows what the firmware does.
`A0057` (4.x "Short Circuit, Orange") becomes `flthy.led.solid` orange. `A0065` and `A007`
(4.x "Solid" / "Rainbow") no longer match a template and survive as raw steps; on v1.6+
firmware they run rainbow and short circuit respectively. DroidNet's bundled 2.1.0 catalog
already emits 005 / 006, so adopting 4.3.0 is not a user-facing regression.

**Hardware check** (not yet run): send `A0055` (solid blue) and `A006` (rainbow) to a v1.81
board. Merging this fix in 4.3.0 needs that result or the maintainer's sign-off on the source
evidence above; otherwise it moves to a 4.3.1 released before the DroidNet release that bundles
4.3.0. The 4.3.0 release notes spell out the decode change for steps saved by 4.2.0.

**Freeze-test exception.** The A2 fixture keeps the 4.2.0 templates. A11 adds exactly these
three ids to the freeze test's allowlist, each pinning its 4.2.0 and corrected template.

## How DroidNet's unpublished 2.2.0 ids map to 4.3.0

DroidNet's `feature/wcb-6.2.1` branch bundled a local "2.2.0" catalog that was never
published (and whose version number collides with published 2.2.0, `3a1b16a`). Nothing in
DroidNet stores command ids — Comlink buttons, Studio sessions, the Maestro serial editor and
WCB rows store wire text only — so the map below changes how text is *displayed*, never what
is stored.

| id | DroidNet 2.2.0 (branch) | Published 4.2.0 | 4.3.0 |
|---|---|---|---|
| `maestro.goHome`, `maestro.stopScript`, `maestro.setTarget` | `;M{id},…` | `maestro-native` bare verbs | unchanged (native) |
| `maestro.subParam` | `;M{id},{sub},{param}` | — | not used; the form is `maestro.wcb.subParam` |
| `maestro.wcb.*` (12) | — | — | new |
| `maestro.id` | codes 0-9 | codes 0-2 | codes 0-9 |
| `wled.power`, `wled.brightness`, `wled.effect`, `wled.effectTuned`, `wled.palette` | DroidNet only | — | not added (D1) |
| `wled.preset` | `{id}` enum, 1-250 | `{wledId}` int, 0-250 | published shape, min 1 |
| `wled.color` | named-color enum | hex `pattern` | unchanged |
| `dfp.play`, `dfp.stop`, `dfp.volume` | as in the `wcb-dfp` table | — | same template and params, plus 19 more `dfp.*` |
| `mp.mode` / `magic-panel` | DroidNet | `iamp.mode` / `ia-magic-panel` since 4.0.0 | unchanged |
| `flthy.led.solid`, `flthy.led.rainbow` | 005 / 006 | 006 / 007 | 005 / 006 (firmware) |

| Wire text | DroidNet `main` (2.1.0) / branch (2.2.0) | 4.3.0 |
|---|---|---|
| `T52` | `mp.mode` | `iamp.mode` |
| `;M2,goHome` | raw / command | `maestro.wcb.goHome` |
| `;M91` | trigger | `maestro.trigger` (id 9) |
| `;D,PLAY,5` | raw / `dfp.play` | `dfp.play` |
| `;L1,ON` | raw / `wled.power` | `wled.on` |
| `;A,PLAY,1` | raw | `mp3.play` |
| `A0055`, `A006` | solid / rainbow | solid / rainbow |

## Guard tests

Committed before any board edit and green on 4.2.0:

- `test/fixtures/catalog-4.2.0-commands.json` — `{ "<id>": { "board", "template", "params": [names] } }`
  for all 397 commands, generated once from the real catalog at `82b6a04` (CI checks out with
  depth 1, so the test cannot read history).
- `test/wcb-621.test.js`:
  - **(a)** every fixture id still resolves with the same `template` and ordered param names
    (D2), except the allowlisted FlthyHPs fixes;
  - **(b)** every example on `maestro`, `wcb-hcr`, `wcb-mp3`, `wcb-wled`, `wcb-native` and
    (once present) `wcb-dfp` matches its own command;
  - **(c)** every example on a `wcb-verb` board is at most **187** characters — the ETM
    limit with checksums on (`WCB.ino:216-223`, `ETM_MAX_CMD_WITH_CRC`). The help text says 188
    (`WCB_Help.cpp:295`); the code is authoritative.
- Later commits append board-specific assertions (the order-sensitive pairs above, `;M1,5` →
  `maestro.wcb.sub`, `;M91` → `maestro.trigger`, …).

## Versioning and release

- `libraries/manifest.json` `libraryVersion` 4.2.0 → **4.3.0**; `generatedFrom` appends
  `; WCB 6.2.1_021242RSEP2026 + WcbCmd 0.8.0 (2026-09)`; boards 21 → 22.
- `releases.json` `latest.libraryVersion` and `libraries[0].libraryVersion` 4.3.0, new
  `releasedAt`, one-string `notes` starting "Minor:". The notes say text fields need a host
  engine 3.1.0 or later: older DroidNet builds show these notes in their update dialog and
  render `pattern` params as number inputs.
- `package.json` / `package-lock.json` 4.3.0 (D4). Test pins in `test/load-node.test.js` and
  `test/engine.test.js` follow.
- Expected validator warnings only: non-standard categories (`Variables`, `Volume`, …).

## Consumers

- **DroidNet** re-vendors the published 4.3.0 tree byte-for-byte (catalog, engine and UI
  together) after merge, and moves its Studio and Maestro serial loaders to its effective
  catalog API. Its own tests move to `maestro.wcb.*`, the published `wled.*` ids and
  `ia-magic-panel`.
- **NaviCore** vendors the library and splits a `wcb-sequences` board locally. The new sequence
  ids (`wcb.runSeqLocal`, `wcb.runSeqLongLocal`, `wcb.seqNames`, `wcb.seqGet`,
  `wcb.timerStop`) are not moved by its split automatically; mention them in the PR.

## As built

Where the implementation commits re-read the firmware and departed from, or refined, the
tables above (each commit message gives the detail):

- **`wcb-dfp` has 21 commands, not 22.** `dfp.device` and its enum are not modeled because WCB
  6.2.1 rejects `;D,DEVICE,<n>`: `processDFPCommand` strips the leading `D,`
  (`WCB_DFP.cpp:72-74`), then WcbCmd `DfPlayerCodec::handle` strips an optional leading `D`
  again (`WcbDfPlayer.cpp:54`), so the codec sees `EVICE,<n>`. WcbCmd's own golden vector
  `DEVICE,2` (`examples/GoldenVectors/GoldenVectors.ino:211`) fails the same way. `;D,DEVICE,2`
  stays a raw step; adding `dfp.device` once a fix ships is a minor. Only `dfp.reset` is
  `config`.
- **`maestro` comma forms.** A 6.2.1 board forwards a comma form whose payload is only a
  number (`;M1,5`) in the legacy spelling `;M15` (`WCB_Maestro.cpp:262-271`), so only verbs
  and subroutines with a parameter need 6.2.1 on the Maestro host. 6.1.5 also accepts a
  Maestro configured as id 9 (6.1.5 `WCB_Maestro.cpp:247-248`); 6.2.1 allows 1-8. The
  `routing.notes` say both.
- **`wcb-native`.**
  - `wcb.wledCfg` port uses `wcb.port` (S1-S5), not `wcb.portUsb`: a local WLED must be on
    S1-S5 (`WCB_WLED.cpp:311`).
  - Alias names (`wcb.alias`, `wcb.routeAlias`) exclude `^ , ; ? CR LF`, `|` and trailing
    whitespace. `saveWCBAlias` trims and rewrites the first six to `_` (`WCB_Storage.cpp:212-229`),
    and `?ALIAS` and `;W<alias>,` trim before comparing (`WCB.ino:5372-5384`, `:6525-6531`), so
    `?ALIAS,List ` runs LIST and stays a raw step. `^` splits steps, and a trailing `|<digits>` is
    read as a duration, so `?ALIAS,Dome|25` cannot decode to `wcb.alias`. The firmware keeps `|`
    in an alias; the patterns leave it out so both ids share one alias shape, and such a step
    survives as raw text.
  - `wcb.dfpOnErr` and `wcb.varClear` get case-insensitive lookaheads like `wcb.alias`, because
    the firmware compares `CLEAR` and `ALL` case-insensitively (`WCB_DFP.cpp:189`,
    `WCB_Variables.cpp:326-328`). The ONERR key is capped at 23 characters
    (`WCB_DFP.cpp:193`).
  - Read-only `?` queries keep the board's existing `config` convention; only `wcb.identify`
    is `cosmetic`.
  - `wcb.varScope`, `wcb.varOp`, `wcb.varDir` and the Movement and Variables categories land
    with the 66 new commands rather than with the range fixes.
- **`wcb-hcr`.** `;H,VOL` / `VOLUP` / `VOLDN` accept 0-100, but `hcrSetVol` sends at most 99
  (`WCB_HCR.cpp:84-87`). Ranges stay 0-100 and the notes record the cap. `hcr.fn` `track`
  0-9999 fits fn 14 (Play WAV); the other codes take 0-99.
- **Totals.** 22 boards and 500 commands: 397 + 12 `maestro.wcb.*` + 21 `dfp.*` + 4 `hcr.*` +
  66 `wcb.*`. The only template changes to 4.2.0 ids are the three allowlisted FlthyHPs codes.

## Verification status

Verified against source only (WCB `66845b9a`, WcbCmd `168f1e5`, the Pololu Maestro guide, the
WLED JSON API, FlthyHPs sketches). Not yet bench-tested: Maestro verbs and get queries, `;D`,
`;L`, the `?WDP` family, DFPlayer clone quirks, the FlthyHPs check above. Boards stay
`confidence: high` under the CONTRIBUTING definition ("verified against firmware/official
docs").
