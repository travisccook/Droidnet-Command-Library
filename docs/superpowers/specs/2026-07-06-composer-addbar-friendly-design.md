# Composer Add bar — friendlier labels + wider layout

**Date:** 2026-07-06
**Status:** Approved (design)
**Area:** `src/droidnet-command-library-ui.js`, `assets/app.css` (host demo site)

## Problem

The inline "Add" bar in the visual composer renders each command parameter as a
bare control (a `<select>` or number `<input>`) carrying only a `title`/`aria-label`.
Nothing on screen tells the user what a field is *for*. The RSeries **Logic Effect**
command is the worst case: its row reads `Normal / Default / 0 / 0 / All` with no
hint that those are **Effect / Color / Speed / Seconds / Display**.

Separately, the host page is capped at `max-width: 920px`, so on a normal-width
monitor the composer floats in a narrow column with large empty margins, and the
Add bar wraps its params onto a second row instead of using the available width.

## Goals

1. Every field in the Add bar shows a clear, human-readable caption of what it is.
2. The Add bar uses the screen width so a full command (RSeries included) fits on
   a single row on a typical desktop, wrapping gracefully when it can't.
3. Generic — the Add bar is shared by every board, so the fix benefits all of them.
4. No board-data churn and **no `libraryVersion` bump** (pure view change).

## Non-goals

- No change to the engine's encode/parse/build logic or its public API.
- No change to the step list, output box, delay/note controls, or Reference page
  content (the Reference page inherits the wider `.dn-main` cap, which is fine).
- Not populating per-param labels in any board JSON yet (the override hook is
  supported but left unused).

## Design

### Caption resolution (works for every board, zero data changes)

Each field's caption is resolved through a fallback chain:

```
caption = param.label            // optional author override (supported, unused for now)
        ?? enum.label            // for enum params, e.g. rseries.effect → "Effect"
        ?? humanize(param.name)  // for int params, e.g. "speed" → "Speed"
```

`humanize(name)` splits on underscores/dashes/camelCase word boundaries and
title-cases the result (`"seconds"` → `"Seconds"`, `"some_param"` → `"Some Param"`).

For the RSeries Logic Effect command this yields exactly:

| param     | source        | caption   |
|-----------|---------------|-----------|
| `effect`  | enum label    | Effect    |
| `color`   | enum label    | Color     |
| `speed`   | humanize name | Speed     |
| `seconds` | humanize name | Seconds   |
| `target`  | enum label    | Display   |

The Board and Command dropdowns also receive captions (**Board**, **Command**) so
the whole row reads uniformly. The trailing duration input (for boards that set
`supportsDuration`) gets a **Duration** caption.

### Markup: each field is a caption-over-control cell

`paramControl(p, cur)` returns a labelled cell rather than a bare control:

```html
<label class="wcb-field">
  <span class="wcb-field-cap">Effect</span>
  <select class="form-control wcb-param" data-param="effect">…</select>
</label>
```

Wrapping the control in a `<label>` associates the caption with the input for
accessibility (replacing today's `title`-only affordance). The inner control keeps
its existing classes and hooks unchanged — `wcb-param`, `data-param`, `wcb-duration`,
`wcb-book`, `wcb-cmd` — so `insertOrUpdate()` and the seed/edit round-trip logic
need no changes. `renderAddBar()` emits `wcb-field` cells for the Board and Command
dropdowns too.

### Layout & width (CSS only)

- `.wcb-addbar` stays `display: flex; flex-wrap: wrap` but becomes
  `align-items: flex-end`, so the leading `Add:`/`Edit:` tag and the trailing
  `Insert`/`Cancel` buttons sit on the control baseline, not the caption row.
- `.wcb-field` is a small vertical flex stack (caption on top, control below).
  Cells wrap as whole units; number-input cells stay narrow, dropdown cells size
  to their control.
- `.wcb-field-cap` is a small muted caption (~`.72rem`, `--muted`), single line.
- `.dn-main` max-width **920px → 1200px** (still centered). This widens the
  composer, step list, and output box, and gives the Add bar room to place a full
  RSeries command on one row. Exact one-row fit varies with board/command name
  lengths; anything longer wraps as grouped cells, which is acceptable.
- The existing `@media (max-width: 560px)` breakpoint continues to let steps wrap;
  add a rule so `wcb-field` cells go comfortably full-width on very narrow screens.

### Optional schema note

`schema/library.schema.json`'s `param` definition already has
`additionalProperties: true`, so a per-param `label` is permitted today. We may
add an explicit, documented `label` property to that `$defs/param` block for
discoverability. This is cosmetic and does not change validation behaviour.

## Files touched

- `src/droidnet-command-library-ui.js` — `paramControl` (return a labelled cell,
  add caption resolution + `humanize`) and `renderAddBar` (caption cells for
  Board/Command and the duration input).
- `assets/app.css` — `.wcb-field`, `.wcb-field-cap`, `.wcb-addbar` alignment, the
  `.dn-main` width bump, and a narrow-screen rule.
- `schema/library.schema.json` — (optional) document the `param.label` field.

## Versioning

None. No catalog content changes → `libraries/manifest.json` `libraryVersion` and
`releases.json` are untouched.

## Verification

The engine test suite (`npm test`) and validator (`npm run validate`) must stay
green — this change touches only the view and no public engine surface, so they
should be unaffected. Because the composer has no automated DOM tests, verify in a
browser by loading `index.html` and checking:

1. The RSeries **Logic Effect** row shows captions **Effect / Color / Speed /
   Seconds / Display**, plus **Board** and **Command**, and fits on one row at a
   typical desktop width.
2. A couple of other boards (e.g. FlthyHPs, a `supportsDuration` board) render
   sensible captions, including the **Duration** field.
3. Insert, Edit (pre-fill), Update, Cancel, and Load-from-string still round-trip
   correctly — the emitted serial string is unchanged from before.
4. Narrow the window: cells wrap as groups and remain usable; nothing overflows.
