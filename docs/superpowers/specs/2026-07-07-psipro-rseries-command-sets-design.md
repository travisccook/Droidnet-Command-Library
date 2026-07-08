# PSIPro + RSeries Logic — command-set completion & descriptive comments

**Date:** 2026-07-07
**Status:** proposed (awaiting maintainer review)
**Scope:** two boards (`psi-pro.json`, `rseries-logic.json`) expanded to their full
upstream command sets; plus the already-landed descriptive-comment engine feature
that both depend on.

## Motivation

The composer's auto-comment was a static per-command string (`*** PSI effect`
regardless of the effect chosen), and the PSIPro / RSeries boards each modeled a
single command that under-represented their firmware. This work fixes both.

## Part A — Descriptive comments (LANDED)

Already implemented, tested (283 green), and verified in the live composer:

- New pure engine helper `renderCommentLabel(cmd, params)`. `commentLabel` now
  supports `{param}` placeholders (→ the selected value's **label**, not wire code)
  and `[ … ]` optional segments dropped when the placeholder inside is blank or at
  its default. Placeholder-free labels pass through verbatim (backward compatible).
- UI: fresh inserts render the label from the selection; **editing a step
  re-renders an auto label** (the reported bug) while preserving a hand-typed note.
- Validator: every `{param}` in a `commentLabel` must reference a real param;
  `[ ]` brackets must balance.
- Docs: `BOARD_AUTHORING_GUIDE.md` documents the grammar.

The two boards below use this feature for their new commands.

## Sources (both high-confidence, primary firmware)

- **PSIPro** — `github.com/nhutchison/PSIPro` v1.7 (JawaLite protocol; `parseCommand`,
  `doTcommand`, `doDcommand`, `doPcommand`, `runPattern`). Live command letters:
  **T, A, D, P** (`R`/`S`/`M` handlers are commented out; no RGB serial command).
- **RSeries Logic** — Reeltwo `WLogicEngine32` + `Reeltwo/src/dome/LogicEngine.h`
  (effect/color enums, value packing), `MarcduinoLogics.h` (`@nT`/`@nM`/`@nP`),
  `#LE…` config commands. Our existing effect (0–24, 99, 100–105) and color (0–9)
  enums were verified **exact** — no change.

## Part B — PSIPro proposed board

`component.categories` → `["Lighting", "Config"]`. Duration suffix `|<s>` cap
raised 99 → 255 (T-only; the firmware `atoi` has no hard cap, 256 ≈ always-on).

### Enums

```jsonc
"psi.address": { "label": "PSI", "values": [
  { "code": "0", "label": "All" }, { "code": "4", "label": "Front" }, { "code": "5", "label": "Rear" }
]},
"psi.mode": { "label": "Effect", "values": [
  { "code": "0",  "label": "Off" },
  { "code": "1",  "label": "Swipe (Default)" },   // was mislabeled "Reset"
  { "code": "2",  "label": "Flash" },
  { "code": "3",  "label": "Alarm" },             // was mislabeled "Slow Flash"
  { "code": "4",  "label": "Short Circuit" },
  { "code": "5",  "label": "Scream" },
  { "code": "6",  "label": "Leia" },
  { "code": "7",  "label": "I Heart U" },
  { "code": "8",  "label": "Radar" },
  { "code": "9",  "label": "Heart" },
  { "code": "10", "label": "Star Wars Title" },
  { "code": "11", "label": "Imperial March" },
  { "code": "12", "label": "Disco (timed)" },
  { "code": "13", "label": "Disco" },
  { "code": "14", "label": "Rebel Symbol" },
  { "code": "15", "label": "Knight Rider" },
  { "code": "16", "label": "Test Pattern" },
  { "code": "17", "label": "Solid Red" },
  { "code": "18", "label": "Solid Green" },
  { "code": "19", "label": "Lightsaber" },
  { "code": "20", "label": "Star Wars Intro" },
  { "code": "21", "label": "VU Meter (timed)" },
  { "code": "92", "label": "VU Meter" }
]},
"psi.alwaysOn": { "label": "Always-On", "values": [
  { "code": "0", "label": "Revert after sequence" }, { "code": "1", "label": "Always On" }
]},
"psi.brightnessSource": { "label": "Brightness Source", "values": [
  { "code": "0", "label": "External POT" }, { "code": "1", "label": "Internal value" }
]}
```

### Commands (order matters for `match`)

| id | name | template | params | duration | safety | category | commentLabel | examples |
|---|---|---|---|---|---|---|---|---|
| `psi.mode` | Run Effect | `{address}T{mode}` | address, mode (both enum, required) | yes | cosmetic | Lighting | `PSI {address} — {mode}` | `0T18`, `4T92`, `0T11\|47` |
| `psi.swipe` | Standard Swipe | `{address}A` | address | no | cosmetic | Lighting | `PSI {address} — Standard Swipe` | `0A`, `4A`, `5A` |
| `psi.default` | Default Pattern | `{address}D` | address | no | cosmetic | Lighting | `PSI {address} — Default Pattern` | `0D`, `4D`, `5D` |
| `psi.cfg.alwaysOn` | Always-On Mode | `0P{onoff}` | onoff (enum `psi.alwaysOn`, default 0) | no | config | Config | `PSI always-on — {onoff}` | `0P0`, `0P1` |
| `psi.cfg.brightSource` | Brightness Source | `1P{source}` | source (enum `psi.brightnessSource`, default 0) | no | config | Config | `PSI brightness source — {source}` | `1P0`, `1P1` |
| `psi.cfg.brightSave` | Brightness · Save | `2P{level}` | level (int 0–200, default 20; label warns ≤20 on USB) | no | config | Config | `PSI brightness {level} (saved)` | `2P20`, `2P150`, `2P200` |
| `psi.cfg.brightTemp` | Brightness · Temp | `3P{level}` | level (int 0–200; 0 = restore) | no | config | Config | `PSI brightness {level} (temp)` | `3P0`, `3P100`, `3P200` |

Notes: `A` and `D` both run the default pattern (both documented, both kept). For
`P` the leading digit is a **parameter selector** (0/1/2/3), not an address — hence
four fixed-template commands. Relabeling modes 1 & 3 does **not** change wire codes,
so stored values still round-trip.

## Part C — RSeries Logic proposed board

`component.categories` → `["Lighting", "Text", "Config", "System"]`. The board mixes
three wire prefixes — `~RT` (existing `rseries-le` encoder), `@` (shared Marcduino
text/font) and `#` (Reeltwo config/system) — all `template` except the effect. This
is engine-legal: each command carries its own template prefix.

### Shared Marcduino commands are duplicated on purpose

RSeries's firmware speaks the Marcduino `@nM` (text) / `@nP` (font) logic grammar —
**and so does every Marcduino logic display**, so the same commands also live under
`astropixels-logics` (`ap.logic.text`, `ap.logic.font`, addr `1/2/3`). We **keep
both**: a downstream host loads only the boards its droid actually has, so within any
real user's catalog the command appears once and is unambiguous. Hiding it from
RSeries would just make it undiscoverable for an RSeries-only owner.

In OUR full-catalog reference composer both boards are loaded, so a bare `@1P60`
parses to whichever board is first in `libraries/manifest.json` (RSeries, at
position 3, currently wins) — and because both boards encode the token identically,
**byte-identical round-trip is preserved regardless of the owner**. Tests for shared
tokens therefore assert *presence + encode + round-trip*, and treat the parse
`commandId` as "either board" rather than pinning one (see `test/psipro-rseries.test.js`
and the order-agnostic font/PSI test in `test/engine.test.js`).

### Existing (unchanged except examples)

`rseries.effect` "Logic Effect" — enums verified correct; keep. Refresh the one
misleading example so examples decode as labeled: `["~RTLE51000", "~RTLE10590", "~RTLE213000"]`.
`commentLabel` stays `Logics {target} — {effect}[ · {color}]`.

### New enums

```jsonc
"logicTextAddress": { "label": "Display", "values": [
  { "code": "1", "label": "Top Front" }, { "code": "2", "label": "Bottom Front" }, { "code": "3", "label": "Rear" }
]},
"logicFont": { "label": "Font", "values": [
  { "code": "60", "label": "Latin" }, { "code": "61", "label": "Aurabesh" }
]},
"logicToggle": { "label": "State", "values": [
  { "code": "", "label": "Toggle" }, { "code": "0", "label": "Off" }, { "code": "1", "label": "On" }
]}
```

### New commands

| id | name | template | params | safety | category | commentLabel | examples |
|---|---|---|---|---|---|---|---|
| `rseries.text` | Set Logic Text | `@{address}M{text}` | address (enum `logicTextAddress`), text (free, `pattern:".+"`) | cosmetic | Text | `Logics {address} text` | `@1MHELLO`, `@3MR2-D2` |
| `rseries.font` | Set Logic Font | `@{address}P{font}` | address, font (enum `logicFont`, default 60) | cosmetic | Text | `Logics {address} font — {font}` | `@1P60`, `@3P61` |
| `rseries.cfg.wifi` | WiFi Enable | `#LEWIFI{state}` | state (enum `logicToggle`, default "") | config | Config | `Logics WiFi — {state}` | `#LEWIFI1`, `#LEWIFI0`, `#LEWIFI` |
| `rseries.cfg.remote` | Remote Enable | `#LEREMOTE{state}` | state (enum `logicToggle`, default "") | config | Config | `Logics remote — {state}` | `#LEREMOTE1`, `#LEREMOTE0`, `#LEREMOTE` |
| `rseries.sys.restart` | Restart | `#LERESTART` | — | config | System | `Logics restart` | `#LERESTART` |
| `rseries.sys.zero` | Factory Reset | `#LEZERO` | — | config | System | `Logics factory reset` | `#LEZERO` |

`rseries.text` / `rseries.font` are the shared Marcduino commands (see above).
`#LEZERO` clears preferences (destructive); `config` safety gives it the
confirm-before-firing warning.

### Incidental UI fix

`paramControl` rendered any free-text (`pattern`) param as a **number** input,
contradicting the schema (which says a `pattern` param "Renders as a text input").
Added the missing `type="text"` branch — needed by the new `rseries.text` and fixes
the existing free-text commands too (`ap.logic.text`, `roam-a-dome` remote name /
stored sequence).

## Match / round-trip risks (test plan)

The single-letter (`0A`, `0D`) and `@…`/`#…` tokens are generic. `match()` returns
the first board (manifest order) whose command matches. Two cases:

- **Unique tokens** (`#LE…`, `0A/0D`, `0P…`) must parse to their OWN command — assert
  the exact `commandId` (guards against an *accidental* collision with an unrelated
  board). All pass.
- **Deliberately shared tokens** (`@nM`/`@nP`, duplicated with `astropixels-logics`)
  parse to whichever board is first; that is expected, not a bug. Assert
  presence + encode + byte-identical round-trip, and accept either owner for the
  parse. Both boards encode identically, so the round-trip invariant holds.

The test suite round-trips every command's `examples`; `test/psipro-rseries.test.js`
adds the per-command-id guards, and `test/engine.test.js`'s font/PSI test is
order-agnostic for the shared `@nP` token.

Per-command matcher sanity (enum codes sorted longest-first): `logicToggle`'s empty
code makes `#LEWIFI` (toggle) and `#LEWIFI1` both parse; `psi.mode` code `92` and
two-digit modes need the longest-first sort (already the engine default).

## Versioning, testing, rollout

- **One release: `libraryVersion` 3.0.0 → 3.1.0** (minor: additive commands + the
  comment feature; existing command ids and wire codes preserved). Update
  `libraries/manifest.json`, `releases.json` (latest + libraries + notes), and the
  four version assertions (`test/load-node.test.js` ×3, `test/engine.test.js` ×1).
- New command counts: **PSIPro 1→7, RSeries 1→7** (dedicated collision-guard tests
  in `test/psipro-rseries.test.js`).
- `npm run validate && npm test` green; then drive the live composer to spot-check a
  few new commands (insert + round-trip via the paste box).

## Deferred (out of scope this pass) & open questions

- **Deferred by decision:** RSeries JawaLite `@nT` trigger — a 7-effect subset that
  is redundant with the far richer `~RTLE` Logic Effect (and already modeled as
  `ap.logic.effect`); could be added under the shared-command principle if wanted.
  RSeries remote-management `#LERNAME/RSECRET/PAIR/UNPAIR` (niche; firmware writes
  RNAME & RSECRET to the same key — a firmware bug, not ours).
- **Pre-existing latent issue (flag, not fixing here):** effects 100–105 cannot
  broadcast to "All" (payload ≥7 digits self-produces a target digit); the
  `rseries-le` encoder already *throws* for these at target="". Selecting effect
  ≥100 with target=All in the UI would surface that throw. Worth a follow-up
  (default those effects to an explicit Front/Rear), but separate from this task.
- **Duration cap** raised to 255 is a UI soft cap, not a firmware constant — adjust
  to taste.
- **USB-power caution** for `2P`/`3P` is surfaced via the param label; not a
  separate warning mechanism.
