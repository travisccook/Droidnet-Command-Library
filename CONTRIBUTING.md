# Contributing

Thanks for helping grow the shared board catalog! Most contributions are **new
boards** or **fixes/additions to existing boards** — both are pure edits to a board file under `libraries/boards/`.

Browse the **[live board reference](https://travisccook.github.io/Droidnet-Command-Library/reference.html)**
to see every board and command already in the catalog (and try the
**[composer](https://travisccook.github.io/Droidnet-Command-Library/index.html)**) —
once your board merges to `main`, it shows up there automatically.

## Quick checklist

1. Fork and create a branch.
2. Add or edit a board file under `libraries/boards/<id>.json`, and add/keep its
   entry in `libraries/manifest.json` (see
   [docs/BOARD_AUTHORING_GUIDE.md](docs/BOARD_AUTHORING_GUIDE.md)).
3. Bump the catalog version in `libraries/manifest.json` (semver):
   - **patch** — fix a template/enum/typo,
   - **minor** — add commands or a new board,
   - **major** — rename/remove command ids or otherwise break existing stored values.
4. Add at least one `examples` string per command — these are exercised by tests.
5. Run the checks locally:

   ```bash
   npm install
   npm run validate
   npm test
   ```

6. Open a pull request. CI runs the validator and tests on your change.

## What the validator enforces

- Each board file matches `schema/library.schema.json` (structural).
- Every `param.enum` resolves to a defined enum.
- Every `{placeholder}` in a `template` has a matching param (and vice-versa).
- Command ids are unique across **all** board files.
- A duplicated enum id must be byte-identical across files.
- The manifest and `boards/` agree (no missing or orphaned files); manifest version
  matches `releases.json`.
- Custom encoders are flagged (they must be registered in code — see below).

## Confidence badges

Set `confidence` on each component honestly — it drives a trust badge in the UI:

| Value | Meaning |
| --- | --- |
| `high` | Verified against firmware/official docs. |
| `community` | Contributed and plausibly correct, but unverified on hardware. |
| `low` | Experimental / best-effort. |

New community contributions without hardware verification should use
`community`, not `high`.

## Custom encoders

If your board's grammar can't be expressed as a `{placeholder}` template (e.g. a
packed numeric value), you'll need a custom encoder. Open an issue or PR that adds
it to `src/droidnet-command-library.js` via the encoder registry (see `rseries-le`
for a worked example), with tests. Libraries reference it by `encoder` name.

## Code of conduct

Be kind, assume good faith, and keep board data accurate. Misrepresenting a
command's `safety` class (e.g. labelling a movement command `cosmetic`) can cause
real hardware to move unexpectedly — when in doubt, choose the more cautious class.

## License

By contributing you agree your contribution is licensed under the project's
[MPL-2.0](LICENSE).
