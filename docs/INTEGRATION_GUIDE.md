# Integration Guide

How to embed `droidnet-command-library` (and the optional UI) in your application.
The examples mirror how the visual WCB command builder is wired in DroidNet.

- [Concepts](#concepts)
- [Loading the engine](#loading-the-engine)
- [Engine API](#engine-api)
- [The wire format](#the-wire-format)
- [The visual composer (UI)](#the-visual-composer-ui)
- [Styling](#styling)
- [Keeping the library up to date](#keeping-the-library-up-to-date)
- [Bundler / Node usage](#bundler--node-usage)

## Concepts

- **Library** — a JSON document (validated by `schema/library.schema.json`)
  describing **components** (boards / verb books), each with **commands**, and a
  set of reusable **enums**.
- **Command** — one action on a board. It declares how a set of typed
  **params** encode into a wire string, usually via a `{placeholder}` `template`.
- **Step** — a structured instance the engine works with: a `command` (with
  params + optional duration + label), a `delay`, a `comment`, or an
  unrecognized `raw` token.
- **Wire value** — the flat string actually stored/sent. Steps `^`-join into it,
  and it parses back into steps losslessly.

## Loading the engine

The engine is a UMD module. In a browser it attaches to `window.DroidNetCommandLibrary`:

```html
<script src="src/droidnet-command-library.js"></script>
<script>
  fetch('libraries/droidnet-astromech.json')
    .then(r => r.json())
    .then(lib => DroidNetCommandLibrary.loadLibrary(lib));
</script>
```

`loadLibrary()` is idempotent — call it again to hot-swap the catalog (this is
exactly what an "Update Library" button does after downloading a newer file).

## Engine API

`DroidNetCommandLibrary` exposes:

| Method | Returns | Notes |
| --- | --- | --- |
| `loadLibrary(lib)` | — | Load/replace the active library. |
| `getLibraryVersion()` | `string\|null` | The loaded library's `libraryVersion`. |
| `getComponents()` | `Component[]` | All boards/books. |
| `getCommands(componentId)` | `Command[]` | Commands for one board. |
| `getCommand(commandId)` | `Command\|null` | Resolves a command; `cmd._component` back-links its board. |
| `getEnum(enumId)` | `Enum\|null` | A named value set. |
| `encode(cmd, params, opts)` | `string` | Encode one command. `opts`: `{ duration, targetPrefix }`. |
| `match(token)` | `{commandId, params, duration}\|null` | Recognize a single wire token. |
| `buildWCBValue(steps)` | `string` | Compile steps → wire value. |
| `parseWCBValue(value)` | `Step[]` | Parse wire value → steps. |
| `registerEncoder(name, impl)` | — | Add a custom encoder (see authoring guide). |

```js
const cmd = DroidNetCommandLibrary.getCommand('flthy.led.solid');
DroidNetCommandLibrary.encode(cmd, { designator: 'A', color: '5' }, {});       // 'A0055'
DroidNetCommandLibrary.encode(cmd, { designator: 'A' }, { duration: 60 });     // 'A0055|60'  (default color, duration)
DroidNetCommandLibrary.match('A0055');  // { commandId: 'flthy.led.solid', params: { designator:'A', color:'5' }, duration: undefined }
```

## The wire format

`buildWCBValue` / `parseWCBValue` use a compact, line-free format:

- Steps are joined by `^`.
- A `***text` fragment is a **comment**. Immediately after a command/raw step it
  becomes that step's inline **label**; otherwise it's a standalone note.
- `;t<ms>` is a **delay** step.
- Anything `match()` doesn't recognize is preserved verbatim as a **raw** step,
  so unknown tokens round-trip without loss.

```text
A006^*** Flthy rainbow^;t500^T52
└ cmd ┘└── label ──┘└delay┘└cmd┘
```

Round-trips are byte-identical except where a board's firmware is itself lossy
(e.g. RSeriesLogic drops leading zeros — the engine normalizes to the
firmware-equivalent canonical form).

## The visual composer (UI)

The optional UI renders an inline step editor into any element. It depends on the
engine being loaded first.

```html
<script src="src/droidnet-command-library.js"></script>
<script src="src/droidnet-command-library-ui.js"></script>
<div id="host"></div>
<script>
  fetch('libraries/droidnet-astromech.json').then(r => r.json()).then(lib => {
    DroidNetCommandLibrary.loadLibrary(lib);
    DroidNetCommandLibraryUI.renderComposer(
      document.getElementById('host'),
      'A006^*** Flthy Rainbow',           // initial wire value (or '' for empty)
      {
        onChange: (wireValue) => {
          // fired on every edit — persist or mirror it
          document.getElementById('out').textContent = wireValue;
        },
        onTest: () => { /* optional: wire a "test" affordance */ },
      }
    );
  });
</script>
```

`renderComposer(container, value, callbacks)`:

- **container** — host element; its contents are replaced.
- **value** — initial wire string (`parseWCBValue` is applied).
- **callbacks.onChange(wireValue)** — called after any edit with the recompiled
  wire string. This is your source of truth; store it.
- **callbacks.onTest()** — optional; called if you add a test affordance.

The composer handles add/edit/remove, drag-reorder, inline delays and notes, a
length counter, and a safety warning when any non-`cosmetic` command is present.

## Styling

The UI emits semantic `wcb-*` and Bootstrap-ish `btn`/`form-control` class names
but ships **no CSS** — style it to match your app. The classes you'll target:
`.wcb-builder`, `.wcb-steps`, `.wcb-step` (`.editing`, `.dragging`),
`.wcb-step-board` (`.raw`), `.wcb-step-name`, `.wcb-step-token`, `.wcb-addbar`,
`.wcb-params`, `.wcb-foot`, `.wcb-len` (`.over`), `.wcb-safety`, `.wcb-empty`.

## Keeping the library up to date

Because the catalog is just data, a host app can refresh it without an app update:

1. Fetch the project's `releases.json` manifest.
2. Compare `latest.libraryVersion` to your installed `DroidNetCommandLibrary.getLibraryVersion()`.
3. If newer, download `latest.url`, validate it (re-use `scripts/validate.js`
   server-side, or at minimum check `libraryVersion` + parse), store it as an
   overlay, and call `loadLibrary()` again.

DroidNet implements exactly this as an "Update Library" button; see its
`scripts/command_library_manager.py` and `/api/wcb/library*` endpoints for a
reference implementation.

## Bundler / Node usage

```js
const DroidNetCommandLibrary = require('droidnet-command-library');
const DroidNetCommandLibraryUI = require('droidnet-command-library/ui'); // needs a DOM (e.g. jsdom)
const lib = require('droidnet-command-library/libraries/droidnet-astromech.json');
DroidNetCommandLibrary.loadLibrary(lib);
```

The engine has zero runtime dependencies and no DOM requirement; only the UI
touches the DOM.
