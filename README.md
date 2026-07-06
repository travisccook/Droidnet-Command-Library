# DroidNet Command Library

> `droidnet-command-library`

A small, dependency-free engine + visual composer for building **serial commands
to control a vibrant community of Astromech droid components** from structured,
schema-driven definitions. Anyone can add support for their board by editing a JSON
library — **no code changes required** for the common case.

This is a standalone project in the **DroidNet universe** — not part of any one
product. [DroidNet Signal Booster](https://github.com/travisccook/droidnetsignalbooster-releases)
is one consumer (it powers the Signal Booster's visual WCB command builder), but
the library is independent and meant to be used by any app or droid, with the
community growing a shared catalog of boards.

```text
 Board library (JSON)            droidnet-command-library            droidnet-command-library-ui
 ─────────────────────           ───────────────────             ──────────────────
 components / commands  ──load──▶  encode / parse / match  ──▶  inline step composer
 enums / templates                round-trip wire strings       (drag-reorder, no modal)
```

## Why

Most "command builders" hard-code every board's grammar in the app. This one moves
the grammar into **data**: a per-board JSON file describes each board's commands as
templates with typed parameters, and the engine turns structured steps into wire
strings (and back). Adding a board is a pull request against a JSON file that CI
validates — not a code change.

## Quick start

### Browser (drop-in, no build step)

```html
<script src="src/droidnet-command-library.js"></script>
<script src="src/droidnet-command-library-ui.js"></script>
<script>
  const base = 'libraries/';
  fetch(base + 'manifest.json')
    .then(r => r.json())
    .then(m => Promise.all(m.boards.map(b => fetch(base + b.file).then(r => r.json())))
      .then(boards => {
        DroidNetCommandLibrary.loadLibrary(boards, { libraryVersion: m.libraryVersion });
        DroidNetCommandLibraryUI.renderComposer(
          document.getElementById('host'),
          'A006^*** Flthy Rainbow',
          { onChange: (wire) => console.log(wire) }
        );
      }));
</script>
```

### Node / bundler

```js
const DroidNetCommandLibrary = require('droidnet-command-library');
require('droidnet-command-library/node-loader').loadCatalog(); // reads manifest + boards, merges, loads

const solid = DroidNetCommandLibrary.getCommand('flthy.led.solid');
DroidNetCommandLibrary.encode(solid, { designator: 'A', color: '5' }, {}); // 'A0055'
DroidNetCommandLibrary.match('A0055'); // { commandId: 'flthy.led.solid', params: {...} }
```

See **[docs/INTEGRATION_GUIDE.md](docs/INTEGRATION_GUIDE.md)** for the full API.

## Hosted composer

A ready-to-use visual composer and board reference are served straight from this
repo via GitHub Pages:

- **Composer** — <https://travisccook.github.io/Droidnet-Command-Library/index.html>
- **Board reference** — <https://travisccook.github.io/Droidnet-Command-Library/reference.html>

Build a sequence of steps, copy the resulting serial string, and paste it into
your WCB web config or a serial monitor. The pages load the engine and the
`libraries/` catalog directly, so a merged board JSON shows up on the site with
no separate deploy.

**Enabling Pages (maintainers):** Settings → Pages → *Deploy from a branch* →
`main` → `/` (root). The site is static (no build); a `.nojekyll` file keeps
Pages from processing files.

## Adding or editing a board

Edit or add a board file under `libraries/boards/<id>.json` (and list it in `libraries/manifest.json`), then validate:

```bash
npm install
npm run validate     # schema + cross-reference checks
npm test             # round-trip + encode/decode tests
```

The full walkthrough — schema, a worked example, and custom encoders — is in
**[docs/BOARD_AUTHORING_GUIDE.md](docs/BOARD_AUTHORING_GUIDE.md)**. See
**[CONTRIBUTING.md](CONTRIBUTING.md)** for the PR process.

## What's here

| Path | What |
| --- | --- |
| `src/droidnet-command-library.js` | The engine (pure, no DOM). `window.DroidNetCommandLibrary` / CommonJS. |
| `src/droidnet-command-library-ui.js` | The inline visual composer. `window.DroidNetCommandLibraryUI`. |
| `schema/library.schema.json` | The formal JSON Schema for a board library. |
| `scripts/validate.js` | `npm run validate` — structural + semantic validation. |
| `libraries/manifest.json` | Catalog entry point — ordered board list + catalog `libraryVersion`. |
| `libraries/boards/` | One self-contained file per board. Add yours here and list it in the manifest. |
| `src/load-node.js` | Node helper: read the manifest + boards and merge them (`node-loader` export). |
| `releases.json` | Update manifest consumed by host apps' "Update Library" flows. |
| `docs/` | Integration guide + board authoring guide. |

## Versioning

The catalog's semver `libraryVersion` lives in `libraries/manifest.json`. Host applications compare it
against `releases.json` to offer one-click library updates without shipping a full
application update. Bump it on every catalog change (see the authoring guide).

## License

[MPL-2.0](LICENSE). You can use this commercially and link it from closed code;
improvements to the library's own files stay open. Contributed board definitions
are licensed under the same terms.
