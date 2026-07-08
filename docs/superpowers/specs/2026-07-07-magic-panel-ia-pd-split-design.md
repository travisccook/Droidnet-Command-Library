# MagicPanel → IA + PD vendor split — design

**Date:** 2026-07-07
**Status:** approved (design)
**Library version:** 3.1.0 → **4.0.0** (major — breaking command-id rename)

## Goal

There are two vendors of the same "Magic Panel" concept. Model them as two
separate boards:

1. **Rebrand** the existing board (`magic-panel` / `MagicPanel`) to **`IA MagicPanel`**,
   with a full id rename (user's explicit choice — see Decisions).
2. **Add** a new **`PD MagicPanel`** board (Printed Droid, "Magic Panel 32 Wireless"),
   modeling its full serial command set.

Source for PD: <https://www.printed-droid.com/kb/magic-panel-32-wireless/>
(fetched & cross-checked 2026-07-07).

## Decisions (settled with the user)

- **Full id rebrand of the IA board** (not just the display name). This changes the
  stored command id `mp.mode` → `iamp.mode`, which breaks any host app's saved
  selections for that command → **major version bump (4.0.0)**. The *wire string*
  (`T{mode}`) is unchanged, so stored wire values still round-trip; only the id moves.
- **PD board = comprehensive.** Anything the panel accepts over serial is included —
  a UART can't distinguish a human at the Arduino Serial Monitor from a WCB, so the
  "Extended Serial Protocol" commands (text, playlists, save/load, custom RGB, font,
  transitions) are as sendable via a controller as the terse JawaLite ones.
- **Panel power = `ON`/`OFF`, not JawaLite `A`/`D`.** Bare `A`/`D` collide with
  RSeries' `{address}A` / `{address}D` templates (empty address). `ON`/`OFF` are
  collision-safe (the only `ON`/`OFF` in the catalog are `*`-prefixed).
- **Exclude pure-diagnostic queries** `HELP` / `?` / `STATUS` / `LIST` — they only
  print to a serial console a controller can't read, so they're inert in a droid
  routine. `DEMO`, `SAVE`, `LOAD` are kept (they actuate).
- **Preset color labels generic** — the KB page documents `C <0-9>` but only *names*
  code 9 (Rainbow). Presets 0-8 are labeled generically ("Preset 0"…"Preset 8");
  refine later if the real color mapping is confirmed.

## Wire-form philosophy (PD)

The PD firmware exposes two dialects over the same UART. The board models each
logical action in exactly **one** canonical form, chosen to be faithful,
collision-safe, and round-trippable:

- **Terse JawaLite letters** (`T`, `B`, `V`, `P`) for the setters that are identical
  in both dialects — compact, controller-native, and consistent with the IA board's
  `T52` style.
- **Verbose extended forms** for (a) preset color, because it needs code `9`
  (Rainbow) which only the extended dialect documents, and (b) every feature JawaLite
  lacks (text, playlists, font, transitions, startup, save/load, demo).

All 20 forms were scanned against every existing board template and are either
collision-free or share a shape **by design** (the `T<n>` family — see Cross-board).

## Engine constraint that shaped the model

`match()` (src/droidnet-command-library.js:315) strips a trailing duration with a
**hardcoded `|`** separator: `/^(.*)\|(\d+)$/`. It does **not** consult the
component's `routing.durationSuffix.sep` (only `encode()` does, at line 245). PD's
timed-pattern form uses a **colon** (`T57:30`). Routing it through
`durationSuffix` would encode correctly but fail to re-parse (match can't strip
`:30`; the `^T(codes)$` regex rejects the suffix → the step degrades to `raw`).

**Therefore the timed pattern is its own command** with the colon literal in the
template (`T{pattern}:{duration}`), not a `durationSuffix`. Consequences:

- `T57` → plain pattern command; `T57:30` → timed command. Their regexes are
  disjoint (`^T(codes)$` vs `^T(codes):(\d+)$`), so match order is irrelevant.
- No component-level `durationSuffix` is set on PD. match only ever strips `|<n>`,
  and no PD command contains `|`, so the colon-bearing commands (`TEXT:`,
  `PLAYLIST_RUN:`, `TEXTSAVE:`) are safe.

## Part 1 — IA rebrand

`libraries/boards/magic-panel.json` → **`libraries/boards/ia-magic-panel.json`**:

| Field | From | To |
|---|---|---|
| component `id` | `magic-panel` | `ia-magic-panel` |
| component `name` | `MagicPanel` | `IA MagicPanel` |
| command `id` | `mp.mode` | `iamp.mode` |
| enum key | `mp.mode` | `iamp.mode` (and the param's `enum` ref) |
| `commentLabel` | `MP mode` | `IA MP mode` |

Template, enum values, category (`Patterns`), safety, routing — **unchanged**.

Manifest entry updated to `{ id: ia-magic-panel, file: boards/ia-magic-panel.json,
name: "IA MagicPanel", confidence: high }`, kept in its **current position**
(2nd, after flthy-hps) so it precedes PD.

## Part 2 — new `pd-magic-panel` board

Component: `id: pd-magic-panel`, `name: "PD MagicPanel"`, `kind: device-native`,
`vendor: "Printed Droid"`, `confidence: community`,
`firmware: "MP32-Wireless v2.2+"`,
`routing: { class: broadcast, nativeWrapper: none }` (no durationSuffix — see above).

`categories: ["Patterns","Lighting","Text","Sequences","Setup","Config","Power"]`
(Patterns & Text are board-outlier names → non-failing validator `warn`, same as
IA's existing "Patterns").

### Commands (20) — all `pdmp.*` ids

| id | name | template | params | category | safety | example |
|---|---|---|---|---|---|---|
| `pdmp.pattern` | Run Pattern | `T{pattern}` | pattern: enum `pd.pattern` | Patterns | cosmetic | `T57` |
| `pdmp.pattern.timed` | Run Pattern (timed) | `T{pattern}:{duration}` | pattern; duration: int 1-3600 (s) | Patterns | cosmetic | `T57:30` |
| `pdmp.demo` | Smart Demo | `DEMO` | — | Patterns | cosmetic | `DEMO` |
| `pdmp.brightness` | Brightness | `B{level}` | level: int 0-255 | Lighting | cosmetic | `B128` |
| `pdmp.speed` | Speed | `V{speed}` | speed: int 1-100 | Lighting | cosmetic | `V50` |
| `pdmp.color` | Preset Color | `C {color}` | color: enum `pd.color` | Lighting | cosmetic | `C 9` |
| `pdmp.rgb` | Custom RGB | `C {r},{g},{b}` | r,g,b: int 0-255 | Lighting | cosmetic | `C 255,100,0` |
| `pdmp.transition` | Transitions | `TRANSITION {state}` | state: enum `pd.toggle` | Lighting | cosmetic | `TRANSITION 1` |
| `pdmp.text` | Scroll Text | `TEXT:{message}` | message: text `.+` | Text | cosmetic | `TEXT:HELLO` |
| `pdmp.text.bounce` | Bounce Text | `TEXT_BOUNCE:{message}` | message: text `.+` | Text | cosmetic | `TEXT_BOUNCE:HI` |
| `pdmp.text.save` | Save Text Slot | `TEXTSAVE{slot}:{message}` | slot: int 0-9; message: text `.+` | Text | config | `TEXTSAVE3:HELLO` |
| `pdmp.text.load` | Load Text Slot | `TEXTLOAD{slot}` | slot: int 0-9 | Text | cosmetic | `TEXTLOAD3` |
| `pdmp.font` | Font | `FONT {font}` | font: enum `pd.font` | Text | cosmetic | `FONT 1` |
| `pdmp.playlist` | Run Playlist | `PLAYLIST_RUN:{ids}` | ids: text `[0-9]+(?:,[0-9]+)*` | Sequences | cosmetic | `PLAYLIST_RUN:1,2,3` |
| `pdmp.startup` | Set Startup Pattern | `START {pattern}` | pattern: enum `pd.pattern` | Setup | config | `START 5` |
| `pdmp.mode` | Operating Mode | `P{mode}` | mode: enum `pd.mode` | Setup | cosmetic | `P1` |
| `pdmp.save` | Save Settings | `SAVE` | — | Config | config | `SAVE` |
| `pdmp.load` | Load Settings | `LOAD` | — | Config | config | `LOAD` |
| `pdmp.on` | Panel On | `ON` | — | Power | cosmetic | `ON` |
| `pdmp.off` | Panel Off | `OFF` | — | Power | cosmetic | `OFF` |

`commentLabel` on each (concise, interpolating the pattern/param label where useful,
e.g. `pdmp.pattern` → `PD MP {pattern}`).

**Param notes**
- Free-text params (`message`, `ids`) carry a `pattern` so they re-parse instead of
  degrading to raw (per the board-authoring checklist). Non-capturing groups only.
- `message` uses `.+`. Caveat (inherent to the wire format, not this board): a `^`
  in a message is a step separator and a trailing `|<n>` is read as a duration —
  scroll text shouldn't contain those. Examples avoid them.
- `duration`, `level`, `speed`, `r`/`g`/`b`, `slot` are `type: int` with min/max.

### Enums (PD)

- `pd.pattern` — 73 values, codes `"0"`…`"68"`, `"80"`, `"97"`, `"98"`, `"99"`,
  with the exact names from the KB page (0 Off … 68 Space Invaders Animation, 80
  Bouncing Text, 97 Text Scroll (English), 98 Text Scroll (Aurebesh), 99 Test All).
- `pd.color` — `"0"`…`"8"` = "Preset 0"…"Preset 8", `"9"` = "Rainbow".
- `pd.mode` — `"0"` Timed, `"1"` AlwaysOn.
- `pd.font` — `"0"` Standard, `"1"` Aurebesh.
- `pd.toggle` — `"0"` Off/Disabled, `"1"` On/Enabled (transitions).

### Full pattern list (for `pd.pattern`)

```
0 Off · 1 On (Indefinite) · 2 On (2s) · 3 On (5s) · 4 On (10s) · 5 Toggle ·
6 Alert (4s) · 7 Alert (10s) · 8 Trace Up Fill · 9 Trace Up Line ·
10 Trace Down Fill · 11 Trace Down Line · 12 Trace Right Fill · 13 Trace Right Line ·
14 Trace Left Fill · 15 Trace Left Line · 16 Expand Fill · 17 Expand Ring ·
18 Compress Fill · 19 Compress Ring · 20 Cross · 21 Cylon (Column) · 22 Cylon (Row) ·
23 Eye Scan · 24 Fade Out/In · 25 Fade Out · 26 Flash All · 27 Flash Vertical ·
28 Flash Quadrants · 29 Two Loop · 30 One Loop · 31 Test Fill · 32 Test Pixel ·
33 AI Logo · 34 2GWD Logo · 35 Quadrant Sequence (Type 1) · 36 Quadrant Sequence (Type 2) ·
37 Quadrant Sequence (Type 3) · 38 Quadrant Sequence (Type 4) · 39 Random Pixel ·
40 Countdown from 9 · 41 Countdown from 3 · 42 Random Alert (4s) · 43 Random Alert (8s) ·
44 Smiley Face · 45 Sad Face · 46 Heart · 47 Checkerboard · 48 Compress In Fill ·
49 Compress In Clear · 50 Explode Out Fill · 51 Explode Out Clear · 52 VU Meter (Type 1) ·
53 VU Meter (Type 2) · 54 VU Meter (Type 3) · 55 VU Meter (Type 4) · 56 Animated Heart ·
57 Rainbow Cycle · 58 Fire Effect · 59 Twinkle · 60 Plasma · 61 Game of Life ·
62 Matrix Rain · 63 Rotating 3D Cube · 64 Kaleidoscope · 65 Raindrops · 66 Drip Effect ·
67 Pac-Man Animation · 68 Space Invaders Animation ·
80 Bouncing Text · 97 Text Scroll (English) · 98 Text Scroll (Aurebesh) · 99 Test All
```

(69-79 and 81-96 are undefined on the panel and omitted from the enum.)

## Part 3 — cross-board `match()` behavior

- IA `T{mode}` and PD `T{pattern}` deliberately share the `T<n>` shape (both panels
  literally accept `T57`). The wire string round-trips **byte-identical**; only the
  *label* is chosen, by manifest order. This mirrors the existing Marcduino
  shared-logic grammar and the PSI-vs-MagicPanel precedent.
- **IA must precede PD in the manifest.** The ~10 codes both enums share (e.g. `52`
  VU Meter) then resolve to IA, preserving the existing `T52 → iamp.mode` tests.
  PD-only codes (`57`, `63`, …) fall through to PD (IA's enum lacks them).
- PSI's addressed `4T92` is unaffected — it requires a leading address digit that
  neither MagicPanel command matches.
- Verified collision-free against all existing templates: `B<n>`, `V<n>`, `P<n>`,
  `C <n>`, `C <r,g,b>`, `ON`, `OFF`, `DEMO`, `SAVE`, `LOAD`, `START `, `FONT `,
  `TRANSITION `, `TEXT:`, `TEXT_BOUNCE:`, `TEXTSAVE<n>:`, `TEXTLOAD<n>`,
  `PLAYLIST_RUN:` (checked against `PLAY:`, `*ON`/`*OF`, `{address}A/D`, `#P…`,
  `<digit>P…`, `:P…`, `BAUD:`, etc.).

## Part 4 — files to touch (complete)

1. **Rename** `libraries/boards/magic-panel.json` → `ia-magic-panel.json` and apply
   Part-1 edits.
2. **Add** `libraries/boards/pd-magic-panel.json` (Part 2).
3. `libraries/manifest.json`:
   - update the IA entry (id/file/name), keep position 2;
   - add the PD entry immediately after IA (position 3);
   - bump `libraryVersion` → `4.0.0`;
   - append PD provenance to `generatedFrom`.
4. `releases.json`: `latest.libraryVersion` + `libraries[0].libraryVersion` →
   `4.0.0`; update `notes` + `releasedAt`.
5. **Test assertions:**
   - `test/load-node.test.js`: version `3.1.0`→`4.0.0` (L6, L13, L19);
     **component count `16`→`17` (L14)** — easy to miss, it's not a version line.
   - `test/engine.test.js`: version L22; `'magic-panel'`→`'ia-magic-panel'` (L19);
     `'mp.mode'`→`'iamp.mode'` (L53, L56, L71, L220, L308).
6. `examples/node-example.js` L19: `'mp.mode'`→`'iamp.mode'`.
7. **Living docs** (only): update board-list / example mentions of "MagicPanel" to
   "IA MagicPanel" and add PD where a board catalog is listed (e.g.
   `docs/INTEGRATION_GUIDE.md`, `docs/BOARD_AUTHORING_GUIDE.md`, `README` if present).
   **Do NOT touch** dated `docs/superpowers/{specs,plans}/*` (frozen records) or the
   `boardMp()` fixtures in `test/merge.test.js` (a local `mp` fixture, not the real
   board).

## Verification

- `npm run validate` — schema + semantic (enum refs, placeholder↔param, unique ids,
  category-declared). Expect the two board-outlier category warnings (Patterns, Text)
  plus IA's existing Patterns warning; no errors.
- `npm test` — auto-discovers both board files; exercises every command's `examples`
  round-trip (`web.test.js` bounded-param check); runs the updated
  version/count/id assertions and the PSI-vs-MagicPanel disambiguation.
- Manual spot-checks (node): `match('T57')`→`pdmp.pattern`; `match('T57:30')`→
  `pdmp.pattern.timed {duration:30}`; `match('T52')`→`iamp.mode` (IA wins the shared
  code); `buildWCBValue(parseWCBValue('TEXT:HELLO'))`===`'TEXT:HELLO'`;
  `match('C 255,100,0')`→`pdmp.rgb`; `match('C 9')`→`pdmp.color`.

## Out of scope

- Modeling the `\r` line terminator, I2C address 20, or the `%T` MarcDuino wrapper
  (all transport-layer, added by the controller — consistent with every other
  device-native board).
- The `S <n>` / `S<ID>:<Duration>` aliases for run-pattern (one canonical `T` form).
- Diagnostic queries `HELP`/`?`/`STATUS`/`LIST`.

## Review outcome (2026-07-07, 3-lens adversarial pass)

An adversarial review (doc-fidelity vs the KB page, correctness/round-trip vs the
engine, rename-completeness) ran before commit. Dispositions:

- **Speed `V{speed}` vs `SP`** — no change. Re-fetched the KB page: the JawaLite
  table lists `V<n>` (velocity/speed, 1-100, no space); `SP <1-100>` is the
  redundant *extended*-dialect alias. The board uses the terse JawaLite `V`,
  consistent with `T`/`B`/`P`.
- **Brightness spacing** — no change. JawaLite `B<n>` is terse/no-space (confirmed
  verbatim); `B <0-255>` is the extended alias.
- **PD `T{pattern}` shadows IA for the 10 shared codes** {0,6,18,23,25,35,44,45,46,52}
  — by design (Part 3), byte round-trip preserved. Nuance the review surfaced: IA and
  PD give those codes *different* labels (e.g. `6` = IA "Scream" vs PD "Alert (4s)"),
  so a PD plain-`T{code}` value round-tripped through a **bare** wire string reloads
  with the IA label. The composer selects the board at author time, so this only bites
  bare-string re-parse. If that matters, the documented `S <n>` run-pattern form would
  fully separate PD from IA (at the cost of diverging from the MarcDuino `%T` / JawaLite
  `T` trigger and splitting plain-vs-timed letters). Kept `T` as the faithful,
  pre-approved form.
- **Free-text ending in `|<digits>`** re-parses to a raw step (not the text command) —
  accepted; a known engine-wide limitation (match strips a trailing `|<n>` before
  dispatch), byte round-trip still preserved, and no declared example triggers it.
- **Rename completeness** — clean, no misses.
