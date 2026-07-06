# FlthyHPs v1.8 — Full Command Reference

**Date:** 2026-07-06
**Board:** `libraries/boards/flthy-hps.json`
**Source of truth:** [FlthyHPs Manual v1.8](https://www.printed-droid.com/wp-content/uploads/2020/01/FlthyHPsManual_v1.8.pdf), "I2C/Serial Command Structure" (pp. 22–24)

## Problem

The `flthy-hps` board implements only 2 of the manual's ~20 device commands, and **both are mis-encoded** (off by one sequence number):

- `flthy.led.solid` emits `…005…` — that is sequence **05 = Short Circuit**, not a solid color. Solid is **06**.
- `flthy.led.rainbow` emits `…006` — that is sequence **06 = Toggle/Solid Color**, not rainbow (and it drops the color). Rainbow is **07**.

Verified against the manual's worked examples: `R0063` = "toggles Rear to Green" (06 = solid) and `T007` / `A007|45` = Rainbow (07). Both round-trip cleanly through the engine, so tests pass — the *encodings* are simply wrong.

This spec brings the board to full v1.8 coverage and corrects the two bugs.

## Source-of-truth decisions

The PDF is authoritative. Where the current JSON or the PDF's own examples disagree with the PDF's command **table**, the table wins:

1. **Drop `X`/`Y`/`Z` designators.** The current enum has `X` (Front+Rear), `Y` (Front+Top), `Z` (Rear+Top). The v1.8 manual (p.22) lists only `F`, `R`, `T`, `A`. Remove X/Y/Z.
2. **Fix `flthy.led.solid` and `flthy.led.rainbow` in place** — keep the ids (they are the right *names*), correct the templates to `006`/`007`.
3. **Servo codes follow the command table (p.22), not the examples (p.23).** The manual contradicts itself: the table says `03` = RC Up/Down, but example `F103` claims "up position"; the table says `04` = Random Position, but `R104` claims "RC mode." The table is the definitional spec; the p.23 examples are a known erratum. We encode the table.

## Command grammar (from the manual)

Structure: `D T ## [C] [S|P]` — Designator, Type (`0`=LED, `1`=Servo), 2-or-3-digit Sequence, optional Color / Speed / Position. Plus a separate global `S#` "special sequence" family. A `|<seconds>` timed suffix may follow LED sequence commands.

## Data model

### Enums

| Enum | Values |
|---|---|
| `flthy.designator` | `F` Front, `R` Rear, `T` Top, `A` All *(X/Y/Z removed)* |
| `flthy.color` | `1` Red, `2` Yellow, `3` Green, `4` Cyan, `5` Blue, `6` Magenta, `7` Orange, `8` Purple, `9` White, `0` Random *(unchanged)* |
| `flthy.position` *(new)* | `0` Down, `1` Center, `2` Up, `3` Left, `4` Upper Left, `5` Lower Left, `6` Right, `7` Upper Right, `8` Lower Right |
| `flthy.ledClearMode` *(new)* | `96` Clear · off-color off · auto off; `971` Clear · auto on (default seq); `972` Clear · auto on (random seq); `98` Clear · off-color on · auto off; `991` Clear · off-color on · auto on (default); `992` Clear · off-color on · auto on (random) |
| `flthy.servoTwitch` *(new)* | `98` Disable, `99` Enable |
| `flthy.special` *(new)* | `S1` Leia Mode, `S4` Clear+Disable (no off-color), `S5` Clear+Enable default (no off-color), `S6` Clear+Enable random (no off-color), `S7` Clear+Disable (off-color), `S8` Clear+Enable default (off-color), `S9` Clear+Enable random (off-color) |

### Commands (15 total)

**Group "LED Effects"** — `safety: cosmetic`, `supportsDuration: true`

| id | name | template | params |
|---|---|---|---|
| `flthy.led.leia` | Leia | `{designator}001` | designator |
| `flthy.led.colorproj` | Color Projector | `{designator}002{color}` | designator, color (default `5`) |
| `flthy.led.dimpulse` | Dim Pulse | `{designator}003{color}{speed}` | designator, color (default `5`), speed (int 0–9, **required, default `5`**) |
| `flthy.led.cycle` | Cycle | `{designator}004{color}` | designator, color (default `5`) |
| `flthy.led.shortcircuit` | Short Circuit | `{designator}005{color}` | designator, color (default `7`) |
| `flthy.led.solid` | Solid Color | `{designator}006{color}` | designator, color (default `5`) |
| `flthy.led.rainbow` | Rainbow | `{designator}007` | designator |
| `flthy.led.clearauto` | Clear / Auto Mode | `{designator}0{mode}` | designator, mode = `flthy.ledClearMode` |

**Group "Servo"** — `safety: movement`, `supportsDuration: false` (manual: timers have "little effect on servo commands")

| id | name | template | params |
|---|---|---|---|
| `flthy.servo.preset` | Preset Position | `{designator}101{position}` | designator, position |
| `flthy.servo.rc-lr` | RC Control L/R | `{designator}102` | designator |
| `flthy.servo.rc-ud` | RC Control U/D | `{designator}103` | designator |
| `flthy.servo.random` | Random Position | `{designator}104` | designator |
| `flthy.servo.wag-lr` | Wag L/R | `{designator}105` | designator |
| `flthy.servo.wag-ud` | Wag U/D | `{designator}106` | designator |
| `flthy.servo.autotwitch` | Auto Twitch On/Off | `{designator}1{mode}` | designator, mode = `flthy.servoTwitch` |

**Group "Special"** — `safety: movement`, `supportsDuration: false`

| id | name | template | params |
|---|---|---|---|
| `flthy.special.sequence` | Special Sequence | `{special}` | special = `flthy.special` |

## Engine constraints that shape the design

The template matcher (`_buildTemplateMatcher`) has two properties that drive decisions:

1. **No optional params.** Every `{param}` becomes a required capture group; there is no `?`. A trailing *optional* param cannot round-trip. → **Dim-pulse `speed` is required with a default of `5`.** Encode always emits the digit (`F00355`), so `match()` always re-parses it. `speed=5` is the firmware default (`#define DIMPULSESPEED 5`), so this is behaviorally identical to omitting it.
2. **Non-enum params match greedily as `(\d+)`.** Safe here because `speed` is the last token and `position` is an enum. No two int groups are ever adjacent.

### Ambiguity analysis (why no two templates collide)

- LED (`…0…`) vs Servo (`…1…`) differ in the type digit.
- Each fixed effect has a distinct literal middle: `001`–`007`, `101`–`106`.
- The collapsed enums (`ledClearMode`, `servoTwitch`, `special`) rely on the engine's **longest-code-first** sort: `A0971` matches `971`, not `96` + leftover. `A096` matches `96`.
- `flthy.special` codes are `S`-prefixed and share no prefix with any designator command.

Conclusion: every valid wire string matches exactly one command.

## Versioning & files

| File | Change |
|---|---|
| `libraries/boards/flthy-hps.json` | Rewrite: 6 enums, 15 commands |
| `libraries/manifest.json` | `libraryVersion` `2.1.0` → `2.2.0` |
| `releases.json` | Update `latest` to match the new `libraryVersion` |

**Version rationale:** minor bump. The dominant change is net-new commands (minor); command **ids** are preserved. The solid/rainbow re-encode is a bugfix of a stub board, and the X/Y/Z removal only invalidates values that were never valid v1.8. No command id is renamed or removed, so this is not a major bump under the repo's convention.

## Testing

- The suite auto-discovers every board and exercises each command's `examples` array for `buildWCBValue(parseWCBValue(v)) === v` round-tripping. Every command gets **≥1 example**.
- Include manual-sourced canonical examples so the fix is pinned to the source of truth: `R0063` (Solid Rear Green), `T007` (Rainbow Top), `A007|45` (Rainbow All, 45s), `F0036` (Dim Pulse Front Magenta — note: now `F00365` with the required speed), plus one per new command.
- `npm run validate && npm test` must pass (structural schema + semantic cross-ref + round-trip).

## Out of scope

- Sketch-level settings (I2C addresses, pin assignments, twitch intervals, servo coordinates) — these are compile-time `#define`s, not runtime commands.
- Marcduino `&25,"…\r` I2C wrapping (p.32) — that is the host/WCB transport layer, not the FlthyHP device grammar.
- RC pulse-width ranges, brightness, and other configuration constants.
