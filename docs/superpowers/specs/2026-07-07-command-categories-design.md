# In-Dropdown Command Categories — Design

**Date:** 2026-07-07
**Status:** Approved for planning
**Scope:** Data model + UI + validator + board catalog restructure

## Summary

Replace the practice of splitting one physical board/feature across multiple
library files with a single board per component, whose command dropdown is
divided into **ordered category sections** (e.g. Movement before Config). This
prevents overloading users with a flat list while keeping "one library = one
board/feature."

The grouping mechanism is mostly latent already: the schema defines a
`command.group` string and every board populates it, but **no code reads it** —
the UI renders a flat `<option>` list in raw array order. This work *activates*
that data (as `<optgroup>` sections), *standardizes* the label vocabulary, and
*consolidates* the two families that were only split because this layer was
missing.

## Motivation

- Some boards were fragmented into many files purely to avoid a long flat
  dropdown (AstroPixelsPlus → 8 files; Roam-A-Dome → 2 files). That fights the
  "one board per feature" model and scatters one component's grammar.
- A single board can still overwhelm: Roam-A-Dome has 72 commands. Users need
  the list chunked into meaningful, ordered sections — everyday actions first,
  destructive/diagnostic last.
- The `command.group` field is documented-and-populated but dead. We should
  either honor it or remove it; this design honors it (renamed to `category`).

## Goals

- One board file per addressable component; command dropdown grouped into
  ordered, labeled sections.
- Category **names and order are authored per-board**, drawing on a standard
  vocabulary where it fits and allowing per-board outlier sections where it
  doesn't.
- Engine remains category-agnostic: categories never affect
  `encode`/`match`/`parse`. Pure UI grouping.
- Preserve all command IDs so previously-composed wire strings still round-trip.

## Non-Goals

- No change to wire format, encoders, or the `^`/`;t`/`***` step grammar.
- No collapsible/searchable dropdown UX beyond native `<optgroup>` sections
  (future enhancement, out of scope).
- No two-level (category → subcategory) nesting. One level only.

## Data Model

Categories are UI-only grouping hints. Two changes to the JSON contract:

### 1. Rename `command.group` → `command.category`

`command.group` is dead (verified: no `.group` read in `src/`, `scripts/`, or
`test/`). Rename it to `category` across all boards and the schema. Rationale
for renaming rather than reusing the name as-is:

- Every board file is edited anyway (to standardize values + add the ordered
  list), so the rename is nearly-free incremental churn, not a separate
  migration.
- `category`/`categories` is self-documenting and matches the feature.
- It removes a latent collision: a **param** literally named `group` already
  exists on `ap.panel.macro`, `ap.servo.limits5`, `ap.servo.easing` (a
  servo/panel group *wire value*). Renaming the UI field frees `group` to mean
  only that.

Schema (`schema/library.schema.json`), under `command.properties`:

```json
"category": {
  "type": "string",
  "description": "UI section this command appears under. Must be listed in the component's `categories` array."
}
```

Remove the `group` property definition. (`additionalProperties: true` means
stragglers won't hard-fail, but the migration renames every occurrence.)

### 2. Add ordered `component.categories`

A per-component array declaring section display order and labels. Category names
are display-ready strings (e.g. `"Named Clips"`), so an array of strings
suffices — no `{name,label}` objects until a board needs a display label that
differs from the key (YAGNI).

Schema, under `component.properties`:

```json
"categories": {
  "type": "array",
  "description": "Ordered category section names for this board's dropdown. Section order follows this array. Every command's `category` must appear here.",
  "items": { "type": "string" }
}
```

### Rendering / fallback rules

- Commands are bucketed by their `category`; sections render as `<optgroup>`s in
  the order of the component's `categories` array. Within a section, commands
  keep JSON array order.
- **No `categories` array:** derive order = standard vocabulary order for known
  terms, then first-appearance order (from the commands array) for
  outliers/unknowns.
- **Command with no/unknown `category`:** falls into a trailing `"Other"`
  section so nothing is ever dropped from the dropdown.

## Standard Vocabulary

Eight canonical section names, default order **everyday → destructive**, which
also tracks `command.safety` so the **Power** section coincides with the
confirm-before-fire boundary:

| # | Category | Meaning |
|---|----------|---------|
| 1 | **Lighting** | Cosmetic visual output: LED effects, PSI/logic animations, MagicPanel patterns. |
| 2 | **Movement** | Physical actuation: servos, dome rotation, holo aim, lifter/periscope, panels. |
| 3 | **Sound** | Audio: clip playback, volume, ambient beds, vocalizer speech. |
| 4 | **Sequences** | Canned multi-step macros / personality routines. |
| 5 | **Setup** | One-time provisioning/calibration: wiring, tolerances, WiFi/remote enrollment. |
| 6 | **Config** | Persistent tunable settings that survive power cycles: speeds, modes, timing. |
| 7 | **Power** | Destructive/lifecycle: restart, factory reset, zero, power on/off, pair/unpair. |
| 8 | **System** | Maintenance/diagnostics, mostly read-only: status, config dump, debug, version. |

**Outliers.** A board may add per-board section names that slot into the nearest
band (they inherit the ordering neighborhood of the standard category they
specialize). Confirmed outliers in the current catalog: `Friendly`, `Named
Clips`, `Ambient`, `Playback`, `Volume`, `Status`, `Debug`, `Text`, `Panels`,
`Servo`, `Lifter`, `Rotary`, `Modes`, `Timing`, `Serial`, `I/O`,
`WiFi/Remote`, `Muse`, `Record`, `Query`, `Emotion`, `Patterns`.

**Ordering convention.** Performance/everyday first (Lighting, Movement, Sound,
Sequences), then occasional (Setup, Config), then Power (gated), then System
(diagnostic) last. Per-board `categories` arrays may reorder freely; the standard
order is only the default.

## Board Topology: 19 files → 16 boards

**All 16 final boards receive the field migration** (`group`→`category`,
standardized values, a `categories` array). Only *file existence* differs: 9
standalone boards keep their files unchanged in topology; two families
consolidate.

### Consolidations

**AstroPixelsPlus (8 → 6):** physical components stay their own boards; the
controller's non-component/meta slices fold into one core board.

- **New `astropixels-plus`** ("AstroPixelsPlus") = merge of `astropixels-config`
  + `astropixels-panels` + `astropixels-sequences`. Sections:
  **Panels › Sequences › Setup › System** (11 commands).
- Stay separate (each keeps its file/id, gains category layer): `astropixels-holo`,
  `astropixels-sound`, `astropixels-servo`, `astropixels-logics`,
  `astropixels-psi`.
- Removed files: `astropixels-config.json`, `astropixels-panels.json`,
  `astropixels-sequences.json`.

**Roam-A-Dome (2 → 1):** **New `roam-a-dome`** ("Roam-A-Dome") = merge of
`roam-a-dome-motion` + `roam-a-dome-config`, 72 commands. Removed files:
`roam-a-dome-motion.json`, `roam-a-dome-config.json`.

All command IDs are preserved through both merges (no renumbering).

### Final board list (16) with ordered sections

| Board id | Name | Sections (in order) | # |
|---|---|---|---|
| `astropixels-plus` *(new)* | AstroPixelsPlus | Panels › Sequences › Setup › System | 11 |
| `astropixels-holo` | AstroPixelsPlus (Holo) | Friendly › Lighting › Movement › Sequences | 28 |
| `astropixels-sound` | AstroPixelsPlus (Sound) | Named Clips › Playback › Ambient › Volume | 17 |
| `astropixels-servo` | AstroPixelsPlus (Servo) | Movement › Config | 9 |
| `astropixels-logics` | AstroPixelsPlus (Logics) | Lighting › Text | 3 |
| `astropixels-psi` | AstroPixelsPlus (PSI) | Lighting | 1 |
| `roam-a-dome` *(new)* | Roam-A-Dome | *see tuning note* | 72 |
| `flthy-hps` | FlthyHPs Holoprojectors | Lighting › Servo › Sequences | 16 |
| `hcr-native` | HCR Vocalizer (native) | Sound › Muse › Config › Record › Query | 18 |
| `chirp` | CHiRP Audio Trigger | Playback › Volume › Status › Config › Debug | 16 |
| `r2uppityspinner-alt` | R2 Uppity Spinner ALT | Lifter › Rotary › Sequences › Lighting › Power › Setup › Config | 41 |
| `wcb-hcr` | WCB · HCR Vocalizer | Emotion › Sound | 2 |
| `magic-panel` | MagicPanel | Patterns | 1 |
| `rseries-logic` | RSeriesLogic | Lighting | 1 |
| `psi-pro` | PSIPro | Lighting | 1 |
| `maestro` | Maestro | Sequences | 1 |

### Per-command migration mapping (old `group` → new `category`)

This is the authoritative curation blueprint. Note where a single old group
**splits** across categories or several old groups **merge** into one.

**astropixels-plus** (merged): `WiFi/Remote`→Setup ×6 · `System`→System ×2 ·
`Macros`→Panels ×1 · `Dynamic`→Sequences ×1 · `Sequences`→Sequences ×1.

**astropixels-holo:** `Friendly`→Friendly ×12 · `Native LED`→Lighting ×8 ·
`Native Servo`→Movement ×7 · `Native Sequence`→Sequences ×1.

**astropixels-sound:** `Named`→Named Clips ×8 · `Volume`→Volume ×5 ·
`Ambient`→Ambient ×3 · `Playback`→Playback ×1.

**astropixels-servo:** `Move`→Movement ×5 · `Config`→Config ×4.

**astropixels-logics:** `Effects`→Lighting ×1 · `Text`→Text ×2.

**astropixels-psi:** `PSI`→Lighting ×1.

**flthy-hps:** `LED Effects`→Lighting ×8 · `Servo`→Servo ×7 · `Special`→Sequences ×1.

**hcr-native:** `Stimuli`+`SD WAV`+`Stop`+`Volume`→Sound ×6 · `Muse`→Muse ×4 ·
`Override`→Config ×4 · `Record`→Record ×3 · `Query`→Query ×1.

**chirp:** `Playback`→Playback ×4 · `Status`→Status ×4 · `Volume`→Volume ×2 ·
`Config`→Config ×4 · `Debug`+`Generate`→Debug ×2.

**r2uppityspinner-alt:** `Lifter`→Lifter ×5 (+ ×1 → Power) · `Rotary`→Rotary ×7 ·
`Playback`+`Random Mode`+`Timing`→Sequences ×6 · `Lights`→Lighting ×2 ·
`Configuration`→Setup ×12 / Config ×7 / Power ×1.

**roam-a-dome** (merged): `Speeds`+`Ramping`→Movement (config) · `Rotate`+`Spin`+
`Home`→Movement (motion) · `Modes`→Modes · `Delays`→Timing · `Setup`+
`Tolerances`→Setup · `Sequences`(config)+`Timing`+`Playback`(motion)→Sequences ·
`WiFi/Remote`→WiFi/Remote · `Serial`+`Syren`+`Sensor`→Serial · `PWM`+`Pins`→I/O ·
`Pins`(motion)→Power · `System`+`Debug`→System.

**wcb-hcr:** `Emotion`→Emotion ×1 · `Audio`→Sound ×1.

**Singletons** (`magic-panel` `Patterns`, `rseries-logic`/`psi-pro` `Effects`→Lighting,
`maestro` `Sequences`): trivial one-command mappings.

## UI Changes

Single function: `fillCommands()` in `src/droidnet-command-library-ui.js:310–315`.

- Today: `cmdSel.innerHTML = cmds.map(c => <option>).join('')` — flat list.
- New: read the component (via `E().getComponents()`), bucket `cmds` by
  `c.category`, and emit an `<optgroup label="…">` per section in the order of
  `component.categories`; append an `"Other"` optgroup for uncategorized
  commands if any. Selecting/prefilling by value (`cmdSel.value = s.commandId`)
  is unaffected by optgroup nesting; all downstream code reads `cmdSel.value`,
  not DOM structure.
- Light CSS optional; native `<optgroup>` renders without it.

Engine: **unchanged.** `getCommands` still returns the raw array; the UI reads
the component object for its `categories`. (Optional convenience:
`getCategories(componentId)` helper — not required.)

## Validator Changes

In `scripts/validate.js` (semantic layer):

1. **Hard error:** if a component declares `categories`, every command's
   `category` must appear in that array.
2. **Warn:** a command missing `category` (falls to "Other" at render).
3. **Warn (info):** a `category` value outside the standard 8-term set — nudges
   typos; intentional outliers are expected and fine to keep.
4. **Warn:** a `categories` entry with zero commands (dangling section).

## Versioning & Migration

Board catalog restructures → **major bump: `2.14.0` → `3.0.0`**.

- `libraries/manifest.json`: bump `libraryVersion`; remove the 5 merged entries
  (`astropixels-config`, `astropixels-panels`, `astropixels-sequences`,
  `roam-a-dome-motion`, `roam-a-dome-config`); add `astropixels-plus` and
  `roam-a-dome`. Board count 19 → 16.
- `releases.json`: update `latest.libraryVersion` to `3.0.0`.
- Tests: update the component-count assertion (16) and any per-board id
  references; every command's `examples` array is still auto-exercised.
- Command-ID stability means previously-composed wire strings still parse; the
  round-trip invariant `buildWCBValue(parseWCBValue(v)) === v` must still hold.
  Host apps that reference *board ids* must migrate to the new ids (breaking →
  justifies the major bump).

## Safety Interaction

Categories are orthogonal to `command.safety`. The default ordering is *aligned*
to safety (Power section = the confirm-before-fire boundary) as a convention,
not an enforcement. The existing per-command safety warning is unchanged.

## Testing Plan

- `npm run validate` passes with the new schema + validator rules.
- `npm test` passes: round-trip invariant intact; component count = 16; every
  command example round-trips; merged boards (`astropixels-plus`, `roam-a-dome`)
  expose all their commands.
- Add a UI-level check (or manual verification) that `fillCommands` emits
  optgroups in `categories` order and routes uncategorized commands to "Other".

## Open / Tunable Points

- **Roam-A-Dome section granularity & order (the one real knob).** Merged, it has
  72 commands. Recommended fine-grained order (labeled ~7-command sections scan
  better than a few large ones):
  **Movement › Sequences › Modes › Timing › Serial › I/O › Setup › WiFi/Remote › Power › System.**
  Alternative: coarse 6-band (fold Modes/Timing/Serial/I-O into Config, WiFi/Remote
  into Setup) → Movement › Sequences › Setup › Config › Power › System. Decide
  during implementation; both are valid, the fine-grained order is the default.

## Out of Scope / Future

- Searchable/filterable or collapsible dropdown UX.
- `{name,label}` category objects (distinct display label vs. key).
- Sub-categories / nesting.
- Any encoder or wire-format change.
