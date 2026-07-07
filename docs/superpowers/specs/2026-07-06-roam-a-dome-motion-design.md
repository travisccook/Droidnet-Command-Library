# Roam-A-Dome (Motion) board

**Date:** 2026-07-06
**New board:** `libraries/boards/roam-a-dome-motion.json`
**Source of truth:** [reeltwo/DomeControlFirmware](https://github.com/reeltwo/DomeControlFirmware) README — "Dome commands" (the runtime `:DP…` family).
**Closest existing board (template to mirror):** `libraries/boards/r2uppityspinner-alt.json`

## Context

Roam-A-Dome-Home (RDH) is reeltwo's ESP32 dome-rotation controller. Its serial protocol has two families:

- **`:DP…` runtime motion commands** — the performable verbs (rotate, spin, home, wait, play sequence, toggle pin). This spec.
- **`#DP…` configuration commands** (~55 EEPROM setup: speeds, PWM, Syren addresses, WiFi…). **Out of scope here** — a separate `roam-a-dome-config` board is a follow-up cycle.

The firmware accepts motion verbs either colon-chained (`:DPA90:W2:H`) or as individual `:DP`-prefixed lines (`:DPA90`, `:DPW2`, `:DPH`). This library models a routine as **steps joined by `^`**, each dispatched to its target, so we model **one command per verb** encoding to the standalone `:DP<verb>…` form. The composer's step list *is* the chain (`:DPA90^:DPW2^:DPH`). This needs no special chaining logic and matches every other board — including the sibling `r2uppityspinner-alt`, which models the identical reeltwo pattern with `:P…` verbs.

## Data model

**Board:** `id: roam-a-dome-motion`, `name: "Roam-A-Dome (Motion)"` (chip label "Roam-A-Dome"), `kind: device-native`, `confidence: high` (transcribed from the official firmware README, like the FlthyHPs manual), `firmware: "RDH (DomeControlFirmware)"`.

**Routing:** `{ class: "broadcast", nativeWrapper: "none", durationSuffix: { supported: false } }`. No `|`-duration — `wait` is its own verb.

**No enums.** Every parameter is an integer. The engine matches int params as `(-?\d+)` (main's negative-range fix), so signed degrees/speeds round-trip.

### Commands (11)

Command-id prefix `rad.`. All templates begin `:DP`.

| id | name | group | template | params (type int) | safety |
|---|---|---|---|---|---|
| `rad.rotate.abs` | Rotate to Absolute | Rotate | `:DPA{deg}` | deg −359…359, def 180 | movement |
| `rad.rotate.absRamp` | Rotate to Absolute (speed ramp) | Rotate | `:DPA{deg},{speed},{maxspeed}` | deg −359…359 def 90; speed 0…100 def 20; maxspeed 0…100 def 100 | movement |
| `rad.rotate.absRandom` | Rotate to Random Absolute | Rotate | `:DPAR` | — | movement |
| `rad.rotate.rel` | Rotate Relative | Rotate | `:DPD{deg}` | deg −360…360 def 90 (+ = CCW, − = CW) | movement |
| `rad.rotate.relRandom` | Rotate Random Relative | Rotate | `:DPDR` | — | movement |
| `rad.spin` | Spin Continuous | Spin | `:DPR{speed}` | speed −100…100 def 30 (− = CW, 0 = stop) | movement |
| `rad.home` | Home | Home | `:DPH` | — | movement |
| `rad.wait` | Wait Seconds | Timing | `:DPW{seconds}` | seconds 1…600 def 2 | cosmetic |
| `rad.waitRandom` | Wait Random Range | Timing | `:DPWR{min},{max}` | min 1…600 def 10; max 1…600 def 20 | cosmetic |
| `rad.playSeq` | Play Stored Sequence | Playback | `:DPS{number}` | number 0…100 def 1 | movement |
| `rad.togglePin` | Toggle Pin | Pins | `:DPT{pin}` | pin 1…8 def 1 | power |

Each command carries a `commentLabel` and ≥1 `examples` (see Testing).

**YAGNI cuts** (firmware supports, intentionally omitted): the 2-arg `A{deg},{speed}` middle form (the ramp form subsumes it — set speed=maxspeed); `H{speed}` and `HR`; the bare `WR` / single-arg `WR{n}` random-wait shorthands (the `{min},{max}` range covers the need). Adding any later is a one-command patch.

## Grammar & collision analysis

Every template is a fully-anchored (`^…$`) regex; the engine returns the first matching command in catalog order. Within this board:

- Comma-delimited ints keep the `A` forms mutually exclusive: `:DPA90` → `abs` (no comma), `:DPA90,20,100` → `absRamp` (two commas), `:DPAR` → `absRandom` (literal `R`, not a digit).
- Literal `R` markers separate random/plain: `:DPD-90` → `rel`, `:DPDR` → `relRandom`; `:DPW2` → `wait`, `:DPWR10,20` → `waitRandom` (the `wait` regex requires a digit immediately after `:DPW`, which `R` is not).
- `:DPR{speed}` (spin) vs `:DPD…` (rotate) vs `:DPS…`/`:DPH`/`:DPT…` — distinct verb letters.

**Cross-board (vs `r2uppityspinner-alt`, the only other `:`/`#`-prefixed rotary board):** uppity uses `:P…`/`#P…`; RAD uses `:DP…`/`#DP…`. The character after `:`/`#` is always `P` (uppity) vs `D` (RAD), so no anchored regex from either board can match the other's tokens (e.g. `:PR-80` ≠ `:DPR…`, `:PD-90` ≠ `:DPD…`). No other board uses a `:`/`#` prefix. Conclusion: every valid wire token matches exactly one command.

## Versioning & files

| File | Change |
|---|---|
| `libraries/boards/roam-a-dome-motion.json` | New board: 11 commands, no enums |
| `libraries/manifest.json` | Add board entry; bump `libraryVersion` `2.3.0` → `2.4.0` |
| `releases.json` | Bump `latest.libraryVersion` + `libraries[0].libraryVersion` → `2.4.0`; update `releasedAt`/`notes` |

Adding a board is a **minor** bump. (The follow-up Config board will be another minor, `2.4.0` → `2.5.0`.)

## Testing

- `test/web.test.js` requires every command to have `examples[0]` and — since every param is `int` (bounded) — round-trips every example to a recognized step. Provide ≥1 example per command, including signed cases: `:DPA90`, `:DPA-90`, `:DPA90,20,100`, `:DPAR`, `:DPD-90`, `:DPDR`, `:DPR-30`, `:DPH`, `:DPW2`, `:DPWR10,20`, `:DPS1`, `:DPT3`.
- Add a `describe('Roam-A-Dome motion')` block to `test/engine.test.js` asserting: encode of a representative verb (`:DPA90`), a signed round-trip (`match(':DPR-30')` → `rad.spin` speed `-30`; `match(':DPD-90')` → `rad.rotate.rel`), the `A`-form disambiguation (`:DPA90` → abs, `:DPA90,20,100` → absRamp, `:DPAR` → absRandom), the wait/waitRandom split (`:DPW2` → wait, `:DPWR10,20` → waitRandom), and non-collision with uppity (`match(':PR-80')` still → `uppity.rotary.spin`; `match(':DPR-80')` → `rad.spin`).
- `npm run validate && npm test` green (structural schema + semantic cross-ref + version-sync + round-trips).

## Out of scope

- The `#DP…` configuration family (~55 commands) → separate `roam-a-dome-config` board, its own spec/plan/implementation cycle.
- Native colon-chaining as a single wire token (`:DPA90:W2:H`) — modeled as separate `^`-joined steps instead.
- The `#DPS<n>:<sequence>` sequence-*definition* command (stores a macro in EEPROM) — belongs to the Config board; this board's `rad.playSeq` only *plays* a stored sequence.
