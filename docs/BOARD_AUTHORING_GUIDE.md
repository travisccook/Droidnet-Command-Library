# Board Authoring Guide

This guide shows how to add or edit a board in a library JSON file. For the
common case you write **only data** — no code. The
[schema](../schema/library.schema.json) is the source of truth; this guide is the
friendly version.

- [Anatomy of a library](#anatomy-of-a-library)
- [Enums](#enums)
- [Components (boards)](#components-boards)
- [Commands](#commands)
- [Params](#params)
- [Categories](#categories)
- [The template encoder](#the-template-encoder)
- [Duration suffixes](#duration-suffixes)
- [A worked example: adding a board](#a-worked-example-adding-a-board)
- [Custom encoders](#custom-encoders)
- [Validate and test](#validate-and-test)
- [Versioning](#versioning)

## Anatomy of a library

Each file under `libraries/boards/` is a **standalone mini-library**: it contains
its own `enums` and exactly **one** `component`. Board files do **not** carry a
`libraryVersion` — the catalog version lives in `libraries/manifest.json` and is
bumped there.

```jsonc
{
  "$schema": "droidnet-command-library/library/v1",
  "generatedFrom": "MyBoard fw 2.3", // free-text provenance (optional)
  "enums":    { /* reusable value sets defined by this board */ },
  "components": [ /* exactly one board */ ]
}
```

If your board reuses an enum that another board already defines (for example
`hcr.emotion`), copy it **byte-identically** — the validator enforces that any
enum id shared across files has the same definition in every file.

## Enums

An enum is a named, reusable list of choices. Each value has a `code` (the literal
wire fragment) and a `label` (shown in the UI dropdown). An empty `code` is a
legitimate "all/broadcast" choice.

```json
"enums": {
  "myboard.color": { "label": "Color", "values": [
    { "code": "1", "label": "Red" },
    { "code": "2", "label": "Green" },
    { "code": "0", "label": "Random" }
  ]}
}
```

Decoding prefers **longer codes first**, so `EH` wins over `E` when both could
match — multi-character codes are safe.

## Components (boards)

A component is one board (or a "verb book" interpreted by an intermediary like a
WCB). Required: `id`, `name`, `kind`, `commands`.

```json
{
  "id": "myboard",                 // lowercase-kebab, unique, stable
  "name": "MyBoard Lighting",      // first word becomes the UI chip ("MyBoard")
  "kind": "device-native",         // or "wcb-verb"
  "confidence": "community",        // high | community | low  → trust badge
  "firmware": "v2.3",
  "routing": { "class": "broadcast", "nativeWrapper": "none" },
  "commands": [ /* ... */ ]
}
```

- **kind** — `device-native` if these are the board's own commands;
  `wcb-verb` if an intermediary interprets them.
- **confidence** — be honest: `high` only when verified against firmware/docs;
  `community` for contributed-but-unverified; `low` for experimental.

## Commands

Required: `id` (unique across the whole library) and `name`.

```json
{
  "id": "myboard.solid",           // globally unique
  "name": "Solid Color",
  "category": "Lighting",           // dropdown section — must be in the component's `categories`
  "safety": "cosmetic",             // cosmetic | movement | power | config
  "encoder": "template",            // default; can omit
  "template": "C{color}",
  "params": [ { "name": "color", "enum": "myboard.color", "default": "1" } ],
  "examples": ["C1", "C2"],         // exercised by tests — include at least one
  "commentLabel": "MyBoard solid"   // default inline note on insert
}
```

**`safety` matters.** Anything other than `cosmetic` triggers a
confirm-before-firing warning in the UI. Use `movement` for anything that moves
hardware, `power` for power switching, `config` for settings that change state.
When unsure, pick the more cautious class.

## Params

Each param fills one `{placeholder}` in the template.

| Field | Purpose |
| --- | --- |
| `name` | Must match a `{name}` in the template. |
| `enum` | Reference a named enum → renders a dropdown. |
| `type: "int"` | A numeric value → renders a number input. Pair with `min`/`max`. |
| `default` | Value used when left blank. |
| `required` | Marks the param as required (advisory). |
| `pad` | Zero-pad a numeric value to a fixed width (e.g. `4` → `0025`). |

A param is either enum-backed **or** numeric (`type: "int"`), not both.

## Categories

Every command should declare a `category` — the `<optgroup>` section it appears
under in the command dropdown. The component declares an ordered `categories`
array listing every category name it uses; section order in the UI follows that
array. A command with no `category` (or a component with no `categories` at all)
falls to a trailing "Other" group.

Prefer the standard vocabulary, in canonical order:
`Lighting, Movement, Sound, Sequences, Setup, Config, Power, System`. Per-board
outlier names (e.g. `"WiFi/Remote"`) are allowed when none of the standard names
fit — just list them in `categories` too.

The validator **errors** if a command's `category` isn't listed in the
component's `categories`, and **warns** if a category name isn't from the
standard vocabulary (typo check) or if a declared category has no commands.
Categories are UI-only — they never affect `encode`/`match`/`parse`.

```json
{
  "id": "myboard",
  "name": "MyBoard Lighting",
  "kind": "device-native",
  "categories": ["Lighting", "Config"],
  "commands": [
    { "id": "myboard.solid", "name": "Solid Color", "category": "Lighting", "template": "C{color}", "params": [ /* ... */ ] },
    { "id": "myboard.reset", "name": "Factory Reset", "category": "Config", "template": "R" }
  ]
}
```

## The template encoder

The default `template` encoder substitutes `{name}` placeholders with param
values (or their `default`), applies any `pad`, and — for `match()` — builds a
regex from the literal text plus the enum codes / digit runs. So one template
gives you **both** encode and decode for free.

```text
template:  "C{color}"      params: color ∈ {1,2,0}
encode({color:"2"}) → "C2"
match("C2")         → { color: "2" }
```

Anything the template can express round-trips automatically. If your grammar packs
multiple values into one number, or needs math, you need a custom encoder (below).

## Duration suffixes

If a board accepts a trailing duration (e.g. `C1|60` = "for 60s"), declare it once
on the component and opt-in per command:

```json
"routing": { "durationSuffix": { "supported": true, "sep": "|", "unit": "seconds", "max": 99 } }
```

```json
{ "id": "myboard.solid", "supportsDuration": true, /* ... */ }
```

The engine then appends/strips `|<n>` automatically.

## A worked example: adding a board

Goal: add a fictional "Dome Spinner" board with one command, `;DS<speed>`, where
speed is 0–9.

1. (Optional) add an enum if the choices are fixed. Here speed is a free integer,
   so no enum is needed.
2. Add the component to `components`:

   ```json
   {
     "id": "dome-spinner",
     "name": "Dome Spinner",
     "kind": "wcb-verb",
     "confidence": "community",
     "routing": { "class": "wcb-verb" },
     "categories": ["Movement"],
     "commands": [
       {
         "id": "dome.spin",
         "name": "Spin",
         "category": "Movement",
         "safety": "movement",
         "encoder": "template",
         "template": ";DS{speed}",
         "params": [ { "name": "speed", "type": "int", "min": 0, "max": 9, "default": 0 } ],
         "examples": [";DS5", ";DS0"],
         "commentLabel": "Dome spin"
       }
     ]
   }
   ```

3. Validate and test (next section). `;DS5` now encodes and decodes, and shows a
   movement-safety warning in the UI. Done — no code changed.

## Custom encoders

When a template can't express the grammar (packed numerics, checksums, etc.),
register an encoder in `src/droidnet-command-library.js` and reference it by name.
An encoder is `{ encode(cmd, params, opts), match(token)? }`:

```js
DroidNetCommandLibrary.registerEncoder('myboard-packed', {
  encode(cmd, params) {
    const n = (+params.a) * 100 + (+params.b);
    return 'P' + String(n).padStart(4, '0');
  },
  match(token) {
    const m = /^P(\d{4})$/.exec(token);
    if (!m) return null;
    const n = +m[1];
    return { commandId: 'myboard.packed', params: { a: String(Math.floor(n/100)), b: String(n%100) } };
  },
});
```

```json
{ "id": "myboard.packed", "name": "Packed", "encoder": "myboard-packed",
  "params": [ {"name":"a","type":"int"}, {"name":"b","type":"int"} ] }
```

`rseries-le` in the engine is a real example (it packs effect/color/speed/seconds
into one integer and chooses broadcast vs targeted form). The validator will warn
that a custom encoder must be registered — that's expected.

## Validate and test

```bash
npm install
npm run validate        # schema + enum/template/uniqueness checks
npm test                # encode/decode + round-trip across all libraries
```

The library tests automatically pick up every board file in `libraries/boards/`, so a new
board is covered as soon as it parses. Adding explicit round-trip cases for your
`examples` in `test/` is welcome for tricky grammars.

## Versioning

The catalog `libraryVersion` lives in `libraries/manifest.json` — **not** in the
individual board files. Bump it there on every catalog change so host apps can
detect updates:

- **patch** (`1.0.0 → 1.0.1`) — fix a template/enum/typo.
- **minor** (`1.0.0 → 1.1.0`) — add commands or a new board.
- **major** (`1.0.0 → 2.0.0`) — rename/remove command ids or otherwise break
  existing stored wire values.
