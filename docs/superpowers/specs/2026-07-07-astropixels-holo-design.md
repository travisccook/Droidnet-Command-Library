# AstroPixelsPlus (Holo) board — design + plan

**Date:** 2026-07-07
**New board:** `libraries/boards/astropixels-holo.json`
**Source of truth:** research `scratchpad/astropixelsplus-reference.md` §5 (Marcduino `*`/`@6-8` aliases) and §10.2 (native `HP` grammar from `Reeltwo/src/dome/HoloLights.h`).

## Scope (user-approved)

Friendly Marcduino aliases **AND** the full native `HP…` grammar (reachable via `@HP…`). One board, grouped. **28 commands.**

**Important numbering note:** the native HoloLights LED functions differ from FlthyHPs — here **05 = Solid, 06 = Rainbow, 07 = Short Circuit** (FlthyHPs was 05/06/07 = short/solid/rainbow). Colors: `9 = White` (not Pink). Use these.

## Board meta

`id: astropixels-holo`, `name: "AstroPixelsPlus (Holo)"`, `kind: device-native`, `confidence: high`, `firmware: "AstroPixelsPlus"`, routing `{ class:"broadcast", nativeWrapper:"none", durationSuffix:{ supported:true, sep:"|", unit:"seconds" } }`. Command-id prefix `ap.hp.`.

## Enums

| Enum | Values |
|---|---|
| `ap.hpDevice` | F Front, R Rear, T Top, X Front+Rear, Y Front+Top, Z Rear+Top, D Radar Eye, O Other HP, A All |
| `ap.hpColor` | 0 Random, 1 Red, 2 Orange, 3 Yellow, 4 Green, 5 Cyan, 6 Blue, 7 Purple, 8 Magenta, 9 White |
| `ap.hpPosition` | 0 Down, 1 Center, 2 Up, 3 Left, 4 Upper Left, 5 Lower Left, 6 Right, 7 Upper Right, 8 Lower Right |
| `ap.hpClearMode` | 96 Clear·auto-off·no-off-color, 971 Clear·auto default, 972 Clear·auto random, 98 Clear·off-color·auto-off, 991 Clear·off-color·auto default, 992 Clear·off-color·auto random |
| `ap.hpTwitch` | 98 Disable, 99 Enable |
| `ap.hpSeq` | S1 Leia Mode, S2 OLED Anim 1, S3 OLED Anim 2, S4 Clear+Disable, S5 Clear+Enable Default, S7 Clear+Disable (off-color), S8 Clear+Enable Default (off-color), S9 Clear+Enable Random |
| `ap.hpAlias3` | 01 Front, 02 Rear, 03 Top |
| `ap.hpAliasOff` | 01 Front, 02 Rear, 03 Top, 04 Radar Eye |
| `ap.hpRadar` | 3 Dim Pulse, R Dim Pulse (Red), 4 Cycle, 6 Rainbow |
| `ap.hpLegacyDev` | 6 Front, 7 Top, 8 Rear |

## Commands (28)

**Group "Friendly" (safety cosmetic for LED, movement for position/wag/nod; supportsDuration false):**
| id | name | template | params |
|---|---|---|---|
| `ap.hp.on` | HP On | `*ON{dev}` | dev=`ap.hpAlias3` |
| `ap.hp.off` | HP Off | `*OF{dev}` | dev=`ap.hpAliasOff` |
| `ap.hp.resetAll` | Reset All HPs | `*ST00` | — |
| `ap.hp.random` | Random Position | `*RD{dev}` | dev=`ap.hpAlias3` (movement) |
| `ap.hp.dimPulse` | Dim Pulse | `*HPS3{dev}` | dev=`ap.hpAlias3` |
| `ap.hp.rainbow` | Rainbow | `*HPS6{dev}` | dev=`ap.hpAlias3` |
| `ap.hp.position` | Move to Position | `*HP{pos}{dev}` | pos=`ap.hpPosition`, dev=`ap.hpAlias3` (movement) |
| `ap.hp.wag` | Wag L/R | `*HW{dev}` | dev=`ap.hpAlias3` (movement) |
| `ap.hp.nod` | Nod U/D | `*HN{dev}` | dev=`ap.hpAlias3` (movement) |
| `ap.hp.radar` | Radar Eye Effect | `*HRS{mode}` | mode=`ap.hpRadar` |
| `ap.hp.legacyOn` | Legacy HP On | `@{ldev}T1` | ldev=`ap.hpLegacyDev` |
| `ap.hp.legacyOff` | Legacy HP Off | `@{ldev}D` | ldev=`ap.hpLegacyDev` |

**Group "Native LED" (safety cosmetic; supportsDuration TRUE):**
| id | name | template | params |
|---|---|---|---|
| `ap.hp.native.leia` | Leia | `@HP{dev}001` | dev=`ap.hpDevice` |
| `ap.hp.native.colorproj` | Color Projector | `@HP{dev}002{color}` | dev, color=`ap.hpColor` (def "0") |
| `ap.hp.native.dimpulse` | Dim Pulse | `@HP{dev}003{color}{speed}` | dev, color (def "0"), speed int 0–9 (req, def 5) |
| `ap.hp.native.cycle` | Cycle | `@HP{dev}004{color}` | dev, color (def "0") |
| `ap.hp.native.solid` | Solid Color | `@HP{dev}005{color}` | dev, color (def "1") |
| `ap.hp.native.rainbow` | Rainbow | `@HP{dev}006` | dev |
| `ap.hp.native.shortcircuit` | Short Circuit | `@HP{dev}007{color}` | dev, color (def "0") |
| `ap.hp.native.clearauto` | Clear / Auto | `@HP{dev}0{mode}` | dev, mode=`ap.hpClearMode` (supportsDuration false) |

**Group "Native Servo" (safety movement; supportsDuration false):**
| id | name | template | params |
|---|---|---|---|
| `ap.hp.native.preset` | Preset Position | `@HP{dev}101{position}` | dev, position=`ap.hpPosition` |
| `ap.hp.native.rcLR` | RC Control L/R | `@HP{dev}102` | dev |
| `ap.hp.native.rcUD` | RC Control U/D | `@HP{dev}103` | dev |
| `ap.hp.native.randomPos` | Random Position | `@HP{dev}104` | dev |
| `ap.hp.native.wag` | Wag L/R | `@HP{dev}105` | dev |
| `ap.hp.native.nod` | Nod U/D | `@HP{dev}106` | dev |
| `ap.hp.native.autotwitch` | Auto Twitch On/Off | `@HP{dev}1{mode}` | dev, mode=`ap.hpTwitch` |

**Group "Native Sequence" (safety movement; supportsDuration false):**
| id | name | template | params |
|---|---|---|---|
| `ap.hp.native.sequence` | HP Sequence Mode | `@HP{seq}` | seq=`ap.hpSeq` |

## Grammar & collision analysis

The native `@HP{dev}…` family mirrors the FlthyHPs board's proven structure (leia `001`, clear/auto `0{96|97x|98|99x}`, servo `101{pos}` vs autotwitch `1{98|99}`) — anchored `^…$` regexes + longest-code-first enum sort keep them mutually exclusive. Extra devices (X/Y/Z/D/O/A) don't change that.

Distinct prefixes prevent all cross-family/cross-board collision:
- Friendly `*…` (star) vs native `@HP…` (at+H) vs legacy `@6/7/8…` (at+digit).
- `@HP{seq}` uses `S…`; `S` is not in `ap.hpDevice`, so `@HPS1` ≠ `@HP{dev}…`.
- **Cross-board (Logics/PSI use `@{0|1|2|3}…`):** native `@HP…` = `@H…` (H not a digit) → disjoint. Legacy holo `@{6|7|8}…` vs Logics `@{0|1|2}T…` and PSI `@{0|1|2}P…` → digit sets {6,7,8} vs {0,1,2,3} are disjoint. `@6T1` cannot match Logics `@{0|1|2}T{effect}` (addr 6 ∉ {0,1,2}).
- Duration `|secs` only on Native LED commands (the continuous effects); stripped before matching, so no ambiguity.

The workflow's grammar verifier will brute-force all 28 commands across full device/color/position/mode domains + every other board's tokens (especially Logics/PSI `@…` and FlthyHPs) to confirm zero collisions/misroutes.

## Versioning & files (Task structure for the workflow)

- **Task 1:** create `libraries/boards/astropixels-holo.json` (11 enums + 28 commands); add manifest board entry; bump `test/load-node.test.js` component count `16`→`17`; add a `describe('AstroPixelsPlus holo')` engine-test block. Version stays 2.10.0.
- **Task 2:** bump `libraryVersion` `2.10.0`→`2.11.0` (manifest + releases latest + libraries[0]); update the 4 version assertions.

Engine tests must cover: native leia/solid/rainbow/shortcircuit encode with the AstroPixels numbering (solid `@HPF0051`, rainbow `@HPF006`, short `@HPF0070`); clear/auto vs leia disambiguation (`@HPA096` vs `@HPA001`); servo preset vs autotwitch (`@HPF1011` vs `@HPF199`); sequence (`@HPS1`); a duration round-trip (`@HPA006|30`); friendly `*ON01`, `*HP401` (upper-left front), `*HRSR`; legacy `@6T1`; and cross-board non-collision (`@1T1`→`ap.logic.effect`, `@1P1`→`ap.psi.effect`, `@6T1`→`ap.hp.legacyOn`).

## Testing

Every command needs ≥1 example; bounded examples round-trip. `npm run validate && npm test` green. Component count → 17.

## Out of scope

- The `*HP701`/`*HP801` README "Upper Right" typo (we use source-correct: 7=Upper Right, 8=Lower Right).
- OLED-holo-specific `S2`/`S3` behavior detail (modeled as opaque sequence codes).
- `~RT`/`@AP` generic passthroughs (rseries-logic already exposes the LE passthrough; a generic raw-passthrough command is a separate concern).
