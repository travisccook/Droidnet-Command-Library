# Command Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group each board's command dropdown into ordered category sections, standardize the category vocabulary, and consolidate the AstroPixelsPlus and Roam-A-Dome split families into single boards.

**Architecture:** Categories are UI-only grouping data. Rename the dead `command.group` field to `command.category`; add a per-component ordered `categories` array. The engine is untouched (encode/match/parse never see categories). The UI buckets commands by category into `<optgroup>`s. A data migration applies a verified per-board mapping; two families merge from 5 files into 2 boards. Board catalog goes 19 → 16 files; `libraryVersion` 2.14.0 → 3.0.0.

**Tech Stack:** Plain UMD JavaScript (no build step), Node 20, Jest, ajv (validator). Boards are schema-driven JSON.

## Global Constraints

- **Dependency-free, no build step.** Do not add runtime dependencies; browser loads `src/*.js` directly.
- **Engine stays DOM-free; UI stays logic-free.** Categories are rendered by the UI only; the engine gains no category logic.
- **Command IDs are stable.** No command id is renamed or removed during the merges (preserves round-trip of stored values).
- **Round-trip invariant holds:** `buildWCBValue(parseWCBValue(v)) === v` (except documented rseries canonicalization).
- **Component id must equal its manifest board id** (asserted by `test/load-node.test.js:8`).
- **Each board file has exactly one component** (asserted by validator + `test/library.test.js`).
- **Standard category vocabulary (canonical order):** `Lighting, Movement, Sound, Sequences, Setup, Config, Power, System`. Per-board outlier names are allowed.
- **Source of truth for category assignments:** `docs/superpowers/specs/2026-07-07-command-categories-design.md` and the verified migration map embedded in Task 3.
- **Keep every commit green:** `npm run validate && npm test` must pass at the end of each task.

---

## File Structure

- `schema/library.schema.json` — add `command.category`, add `component.categories`, remove `command.group` (Tasks 1, 7).
- `src/droidnet-command-library-ui.js` — add `groupCommandsForDropdown` + `STANDARD_CATEGORY_ORDER`; render optgroups in `fillCommands` (Task 2).
- `scripts/migrate-categories.js` — one-shot data migration (Task 3).
- `scripts/validate.js` — add category semantic rules (Task 6).
- `libraries/boards/*.json` — all boards migrated; `astropixels-plus.json` + `roam-a-dome.json` created; 5 source files deleted (Tasks 3–5).
- `libraries/manifest.json`, `releases.json` — board list + version (Tasks 4, 5, 8).
- `test/ui-categories.test.js` (new), `test/categories.test.js` (new), `test/validate.test.js`, `test/schema.test.js`, `test/load-node.test.js`, `test/engine.test.js` — tests (throughout).
- `docs/*`, `CLAUDE.md` — documentation (Task 9).

---

### Task 1: Schema — add `category` and `categories`

**Files:**
- Modify: `schema/library.schema.json`
- Test: `test/schema.test.js`

**Interfaces:**
- Produces: JSON contract accepting `command.category` (string) and `component.categories` (array of strings). `command.group` still accepted for now (removed in Task 7).

- [ ] **Step 1: Write the failing test** — add to `test/schema.test.js`:

```js
test('a board with component.categories and command.category validates', () => {
  const validate = ajv.compile(libSchema);
  const board = {
    enums: {},
    components: [{
      id: 'x', name: 'X', kind: 'device-native',
      categories: ['Movement', 'Config'],
      commands: [{ id: 'x.a', name: 'A', template: 'A', category: 'Movement' }],
    }],
  };
  expect(validate(board)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/schema.test.js -t "component.categories"`
Expected: PASS is NOT guaranteed to fail (schema has `additionalProperties: true`), so this test may already pass. That is acceptable — its purpose is to lock the contract. If it passes here, proceed; the schema edits below make the fields first-class and documented.

- [ ] **Step 3: Add the properties** — in `schema/library.schema.json`, under `component.properties` (sibling of `commands`), add:

```json
"categories": {
  "type": "array",
  "description": "Ordered category section names for this board's dropdown. Section order follows this array. Every command's `category` must appear here.",
  "items": { "type": "string" }
},
```

And under `command.properties` (sibling of `group`), add:

```json
"category": {
  "type": "string",
  "description": "UI section this command appears under. Must be listed in the component's `categories` array."
},
```

- [ ] **Step 4: Run the test + full suite to verify green**

Run: `npx jest test/schema.test.js && npm run validate`
Expected: PASS; validate exits 0.

- [ ] **Step 5: Commit**

```bash
git add schema/library.schema.json test/schema.test.js
git commit -m "feat(schema): add command.category and component.categories"
```

---

### Task 2: UI — grouped-dropdown rendering

**Files:**
- Modify: `src/droidnet-command-library-ui.js` (add helper near `captionFor` ~line 59; edit `fillCommands` at 310–315; add to exports at 330)
- Test: `test/ui-categories.test.js` (create)

**Interfaces:**
- Produces: `groupCommandsForDropdown(cmds, categories) -> [{ label: string, commands: cmd[] }]` (exported). Ordered sections; uncategorized/unknown → trailing `"Other"`; no `categories` → standard order then first-appearance outliers.

- [ ] **Step 1: Write the failing tests** — create `test/ui-categories.test.js`:

```js
'use strict';
const UI = require('../src/droidnet-command-library-ui.js');
const cmd = (id, category) => ({ id, name: id, category });

describe('groupCommandsForDropdown', () => {
  test('renders sections in the declared categories order', () => {
    const cmds = [cmd('a', 'Config'), cmd('b', 'Movement'), cmd('c', 'Movement')];
    const groups = UI.groupCommandsForDropdown(cmds, ['Movement', 'Config']);
    expect(groups.map(g => g.label)).toEqual(['Movement', 'Config']);
    expect(groups[0].commands.map(c => c.id)).toEqual(['b', 'c']);
    expect(groups[1].commands.map(c => c.id)).toEqual(['a']);
  });
  test('drops a declared category that has no commands', () => {
    const groups = UI.groupCommandsForDropdown([cmd('a', 'Movement')], ['Movement', 'Config']);
    expect(groups.map(g => g.label)).toEqual(['Movement']);
  });
  test('routes uncategorized and unknown-category commands to a trailing Other', () => {
    const cmds = [cmd('a', 'Movement'), cmd('b', null), cmd('c', 'Nope')];
    const groups = UI.groupCommandsForDropdown(cmds, ['Movement']);
    expect(groups.map(g => g.label)).toEqual(['Movement', 'Other']);
    expect(groups[1].commands.map(c => c.id)).toEqual(['b', 'c']);
  });
  test('with no declared categories, orders by standard vocab then first-appearance outliers', () => {
    const cmds = [cmd('a', 'Config'), cmd('b', 'Friendly'), cmd('c', 'Lighting'), cmd('d', 'Muse')];
    const groups = UI.groupCommandsForDropdown(cmds, undefined);
    expect(groups.map(g => g.label)).toEqual(['Lighting', 'Config', 'Friendly', 'Muse']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest test/ui-categories.test.js`
Expected: FAIL — `UI.groupCommandsForDropdown is not a function`.

- [ ] **Step 3: Add the helper** — in `src/droidnet-command-library-ui.js`, immediately after the `captionFor` function (after line 59), insert:

```js
  // Standard category display order (see spec 2026-07-07-command-categories-design).
  const STANDARD_CATEGORY_ORDER = ['Lighting', 'Movement', 'Sound', 'Sequences', 'Setup', 'Config', 'Power', 'System'];

  // Bucket commands into ordered { label, commands } sections for the command dropdown.
  // - categories: the component's ordered category list (may be undefined/empty).
  // - A command with no category, or a category not in a non-empty `categories`, goes to a trailing "Other".
  // - With no `categories`, order = standard vocabulary first, then outliers in first-appearance order.
  function groupCommandsForDropdown(cmds, categories) {
    const declared = Array.isArray(categories) ? categories.filter((c) => typeof c === 'string') : [];
    const OTHER = 'Other';
    const buckets = new Map();
    const put = (name, c) => { if (!buckets.has(name)) buckets.set(name, []); buckets.get(name).push(c); };
    for (const c of (cmds || [])) {
      const cat = (typeof c.category === 'string' && c.category) ? c.category : null;
      if (cat && (declared.length === 0 || declared.indexOf(cat) !== -1)) put(cat, c);
      else put(OTHER, c);
    }
    let order;
    if (declared.length) {
      order = declared.filter((n) => buckets.has(n));
    } else {
      const present = [...buckets.keys()].filter((n) => n !== OTHER);
      const known = STANDARD_CATEGORY_ORDER.filter((n) => present.indexOf(n) !== -1);
      const outliers = present.filter((n) => STANDARD_CATEGORY_ORDER.indexOf(n) === -1);
      order = known.concat(outliers);
    }
    if (buckets.has(OTHER)) order.push(OTHER);
    return order.map((name) => ({ label: name, commands: buckets.get(name) }));
  }
```

- [ ] **Step 4: Export the helper** — change the return at line 330 from:

```js
  return { renderComposer, stepLabel, humanize, captionFor };
```
to:
```js
  return { renderComposer, stepLabel, humanize, captionFor, groupCommandsForDropdown };
```

- [ ] **Step 5: Run to verify the helper tests pass**

Run: `npx jest test/ui-categories.test.js`
Expected: PASS (all 4).

- [ ] **Step 6: Wire `fillCommands` to render optgroups** — replace `fillCommands` (lines 310–315) with:

```js
      function fillCommands(useSeed) {
        const cmds = E().getCommands(bookSel.value);
        const book = books.find((b) => b.id === bookSel.value);
        const groups = groupCommandsForDropdown(cmds, book && book.categories);
        cmdSel.innerHTML = groups.map((g) =>
          `<optgroup label="${esc(g.label)}">`
          + g.commands.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')
          + `</optgroup>`).join('');
        if (useSeed && s && s.commandId && cmds.some((c) => c.id === s.commandId)) cmdSel.value = s.commandId;
        renderParams(useSeed);
      }
```

(`books` is already in scope — `const books = E().getComponents();` at line 283.)

- [ ] **Step 7: Run the full UI + web suites**

Run: `npx jest test/ui-caption.test.js test/ui-categories.test.js test/web.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/droidnet-command-library-ui.js test/ui-categories.test.js
git commit -m "feat(ui): render command dropdown as ordered category optgroups"
```

---

### Task 3: Data migration — rename `group` → `category`, add `categories`

**Files:**
- Create: `scripts/migrate-categories.js`
- Create: `test/categories.test.js`
- Modify (via script): every `libraries/boards/*.json`

**Interfaces:**
- Consumes: current board JSON with `command.group`.
- Produces: every command has `category` (no `group`); the 14 non-merging boards gain a `categories` array. (The 5 merge-source boards get `category` on commands but no `categories` array yet — assembled in Tasks 4–5.)

**Note:** This is a data migration, not classic feature TDD. The migration is driven by a verified map (238/238 commands checked, 0 mismatches). Board JSON is rewritten with `JSON.stringify(…, null, 2)` — **expect a large reflow diff**; the semantic change is the `group→category` values, which the invariant test + validator guard.

- [ ] **Step 1: Create the migration script** — `scripts/migrate-categories.js`:

```js
#!/usr/bin/env node
/* One-shot: rename command.group -> command.category (standardized values) and
 * add component.categories to non-merging boards. Fails loud on any unmapped command. */
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'libraries', 'boards');

// group -> category per SOURCE component id (keying per-source resolves the cross-file
// "Pins"/"Timing" cases). Only r2uppityspinner-alt needs per-command overrides.
const RULES = {
  'astropixels-config': { byGroup: { 'WiFi/Remote': 'Setup', 'System': 'System' } },
  'astropixels-panels': { byGroup: { 'Macros': 'Panels', 'Dynamic': 'Sequences' } },
  'astropixels-sequences': { byGroup: { 'Sequences': 'Sequences' } },
  'astropixels-holo': { byGroup: { 'Friendly': 'Friendly', 'Native LED': 'Lighting', 'Native Servo': 'Movement', 'Native Sequence': 'Sequences' } },
  'astropixels-logics': { byGroup: { 'Effects': 'Lighting', 'Text': 'Text' } },
  'astropixels-psi': { byGroup: { 'PSI': 'Lighting' } },
  'astropixels-servo': { byGroup: { 'Move': 'Movement', 'Config': 'Config' } },
  'astropixels-sound': { byGroup: { 'Playback': 'Playback', 'Ambient': 'Ambient', 'Named': 'Named Clips', 'Volume': 'Volume' } },
  'chirp': { byGroup: { 'Playback': 'Playback', 'Volume': 'Volume', 'Status': 'Status', 'Config': 'Config', 'Debug': 'Debug', 'Generate': 'Debug' } },
  'flthy-hps': { byGroup: { 'LED Effects': 'Lighting', 'Servo': 'Servo', 'Special': 'Sequences' } },
  'hcr-native': { byGroup: { 'Stimuli': 'Sound', 'Muse': 'Muse', 'SD WAV': 'Sound', 'Stop': 'Sound', 'Volume': 'Sound', 'Override': 'Config', 'Record': 'Record', 'Query': 'Query' } },
  'maestro': { byGroup: { 'Sequences': 'Sequences' } },
  'magic-panel': { byGroup: { 'Patterns': 'Patterns' } },
  'psi-pro': { byGroup: { 'Effects': 'Lighting' } },
  'r2uppityspinner-alt': {
    byGroup: { 'Playback': 'Sequences', 'Lifter': 'Lifter', 'Rotary': 'Rotary', 'Random Mode': 'Sequences', 'Lights': 'Lighting', 'Timing': 'Sequences', 'Configuration': 'Setup' },
    overrides: { 'uppity.estop': 'Power', 'uppity.cfg.zero': 'Config', 'uppity.cfg.factory': 'Config', 'uppity.cfg.debug': 'Config', 'uppity.cfg.status': 'Config', 'uppity.cfg.config': 'Config', 'uppity.cfg.listSeq': 'Config', 'uppity.cfg.deleteSeq': 'Config', 'uppity.cfg.restart': 'Power' },
  },
  'roam-a-dome-motion': { byGroup: { 'Rotate': 'Movement', 'Spin': 'Movement', 'Home': 'Movement', 'Timing': 'Sequences', 'Playback': 'Sequences', 'Pins': 'Power' } },
  'roam-a-dome-config': { byGroup: { 'System': 'System', 'Setup': 'Setup', 'Speeds': 'Movement', 'Tolerances': 'Setup', 'Delays': 'Timing', 'Modes': 'Modes', 'Ramping': 'Movement', 'Serial': 'Serial', 'Syren': 'Serial', 'Sensor': 'Serial', 'PWM': 'I/O', 'Pins': 'I/O', 'WiFi/Remote': 'WiFi/Remote', 'Sequences': 'Sequences', 'Debug': 'System' } },
  'rseries-logic': { byGroup: { 'Effects': 'Lighting' } },
  'wcb-hcr': { byGroup: { 'Emotion': 'Emotion', 'Audio': 'Sound' } },
};

// Ordered categories for the 14 non-merging boards (final board id == source id).
const CATEGORIES = {
  'flthy-hps': ['Lighting', 'Servo', 'Sequences'],
  'magic-panel': ['Patterns'],
  'rseries-logic': ['Lighting'],
  'wcb-hcr': ['Emotion', 'Sound'],
  'maestro': ['Sequences'],
  'psi-pro': ['Lighting'],
  'hcr-native': ['Sound', 'Muse', 'Config', 'Record', 'Query'],
  'chirp': ['Playback', 'Volume', 'Status', 'Config', 'Debug'],
  'r2uppityspinner-alt': ['Lifter', 'Rotary', 'Sequences', 'Lighting', 'Power', 'Setup', 'Config'],
  'astropixels-holo': ['Friendly', 'Lighting', 'Movement', 'Sequences'],
  'astropixels-sound': ['Named Clips', 'Playback', 'Ambient', 'Volume'],
  'astropixels-servo': ['Movement', 'Config'],
  'astropixels-logics': ['Lighting', 'Text'],
  'astropixels-psi': ['Lighting'],
};

let n = 0;
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
  const full = path.join(DIR, file);
  const lib = JSON.parse(fs.readFileSync(full, 'utf8'));
  const comp = lib.components[0];
  const rule = RULES[comp.id];
  if (!rule) throw new Error(`no migration rule for board '${comp.id}'`);
  for (const cmd of comp.commands) {
    const cat = (rule.overrides && rule.overrides[cmd.id]) || rule.byGroup[cmd.group];
    if (!cat) throw new Error(`${comp.id}/${cmd.id}: no category for group '${cmd.group}'`);
    delete cmd.group;      // rename: drop the dead field...
    cmd.category = cat;    // ...add the standardized category
  }
  if (CATEGORIES[comp.id]) {
    comp.categories = CATEGORIES[comp.id];
    const set = new Set(comp.categories);
    for (const cmd of comp.commands) {
      if (!set.has(cmd.category)) throw new Error(`${comp.id}/${cmd.id}: category '${cmd.category}' not in ${JSON.stringify(comp.categories)}`);
    }
  }
  fs.writeFileSync(full, JSON.stringify(lib, null, 2) + '\n');
  n++;
}
console.log(`migrated ${n} board files`);
```

- [ ] **Step 2: Write the invariant test** — create `test/categories.test.js`:

```js
const fs = require('fs');
const path = require('path');
const BOARDS_DIR = path.join(__dirname, '..', 'libraries', 'boards');
const boardFiles = fs.readdirSync(BOARDS_DIR).filter((f) => f.endsWith('.json'));

describe.each(boardFiles)('categories — %s', (file) => {
  const comp = JSON.parse(fs.readFileSync(path.join(BOARDS_DIR, file), 'utf8')).components[0];

  test('no command retains a legacy group field', () => {
    for (const cmd of comp.commands) expect(cmd.group).toBeUndefined();
  });

  test('if the component declares categories, every command has a listed category', () => {
    if (!Array.isArray(comp.categories)) return;
    for (const cmd of comp.commands) {
      expect(typeof cmd.category).toBe('string');
      expect(comp.categories).toContain(cmd.category);
    }
  });
});
```

- [ ] **Step 3: Run the invariant test to verify it fails**

Run: `npx jest test/categories.test.js -t "legacy group"`
Expected: FAIL — boards still carry `group`.

- [ ] **Step 4: Run the migration**

Run: `node scripts/migrate-categories.js`
Expected: `migrated 19 board files` (no thrown error).

- [ ] **Step 5: Run the invariant test + full suite**

Run: `npx jest test/categories.test.js && npm run validate && npm test`
Expected: PASS; validate exits 0 (outlier-name warnings are added in Task 6, not yet). Full suite green.

- [ ] **Step 6: Spot-check the migration**

Run: `node -e "const c=require('./libraries/boards/r2uppityspinner-alt.json').components[0]; const byCat={}; for(const x of c.commands){(byCat[x.category]=byCat[x.category]||0); byCat[x.category]++;} console.log('categories:',c.categories); console.log(byCat);"`
Expected: `categories: [ 'Lifter', 'Rotary', 'Sequences', 'Lighting', 'Power', 'Setup', 'Config' ]` and counts including `Setup` and `Config` and `Power` (the Configuration split).

- [ ] **Step 7: Commit**

```bash
git add scripts/migrate-categories.js test/categories.test.js libraries/boards/
git commit -m "refactor(boards): migrate command.group to standardized command.category"
```

---

### Task 4: Merge AstroPixelsPlus core (config + panels + sequences)

**Files:**
- Create: `libraries/boards/astropixels-plus.json`
- Delete: `astropixels-config.json`, `astropixels-panels.json`, `astropixels-sequences.json`
- Modify: `libraries/manifest.json`, `test/load-node.test.js:14`

**Interfaces:**
- Produces: board `astropixels-plus` (component id `astropixels-plus`, 11 commands, categories `Panels › Sequences › Setup › System`). All command ids preserved.

- [ ] **Step 1: Assemble the merged board + update manifest** — run:

```bash
node -e '
const fs=require("fs");
const D="libraries/boards/";
const read=f=>JSON.parse(fs.readFileSync(D+f,"utf8"));
const cfg=read("astropixels-config.json"), pan=read("astropixels-panels.json"), seq=read("astropixels-sequences.json");
const board={
  "$schema":"droidnet-command-library/library/v1",
  generatedFrom:"reeltwo AstroPixelsPlus.ino — #AP config + : panel macros + :SE sequences (consolidated)",
  enums:Object.assign({},cfg.enums,pan.enums,seq.enums),
  components:[{
    id:"astropixels-plus", name:"AstroPixelsPlus", kind:"device-native", confidence:"high",
    firmware:"AstroPixelsPlus",
    routing:{class:"broadcast",nativeWrapper:"none",durationSuffix:{supported:false}},
    categories:["Panels","Sequences","Setup","System"],
    commands:[...cfg.components[0].commands, ...pan.components[0].commands, ...seq.components[0].commands],
  }],
};
const set=new Set(board.components[0].categories);
for(const c of board.components[0].commands) if(!set.has(c.category)) throw new Error("stray category "+c.category+" on "+c.id);
fs.writeFileSync(D+"astropixels-plus.json", JSON.stringify(board,null,2)+"\n");
for(const f of ["astropixels-config.json","astropixels-panels.json","astropixels-sequences.json"]) fs.unlinkSync(D+f);
// manifest
const mfPath="libraries/manifest.json", mf=JSON.parse(fs.readFileSync(mfPath,"utf8"));
const drop=new Set(["astropixels-config","astropixels-panels","astropixels-sequences"]);
const at=mf.boards.findIndex(b=>drop.has(b.id));
mf.boards=mf.boards.filter(b=>!drop.has(b.id));
mf.boards.splice(at,0,{id:"astropixels-plus",file:"boards/astropixels-plus.json",name:"AstroPixelsPlus",confidence:"high"});
fs.writeFileSync(mfPath, JSON.stringify(mf,null,2)+"\n");
console.log("astropixels-plus:", board.components[0].commands.length, "commands; boards now", mf.boards.length);
'
```
Expected: `astropixels-plus: 11 commands; boards now 17`.

- [ ] **Step 2: Update the board-count assertion** — in `test/load-node.test.js:14`, change `.toBe(19)` to `.toBe(17)`.

- [ ] **Step 3: Run validate + full suite**

Run: `npm run validate && npm test`
Expected: PASS; validate exits 0. (`engine.test.js` AstroPixels tests resolve `ap.cfg.*` / `ap.panel.*` by command id, unaffected by the merge.)

- [ ] **Step 4: Commit**

```bash
git add libraries/boards/ libraries/manifest.json test/load-node.test.js
git commit -m "refactor(astropixels): consolidate config+panels+sequences into astropixels-plus"
```

---

### Task 5: Merge Roam-A-Dome (motion + config)

**Files:**
- Create: `libraries/boards/roam-a-dome.json`
- Delete: `roam-a-dome-motion.json`, `roam-a-dome-config.json`
- Modify: `libraries/manifest.json`, `test/load-node.test.js:14`

**Interfaces:**
- Produces: board `roam-a-dome` (component id `roam-a-dome`, 72 commands, categories `Movement › Sequences › Modes › Timing › Serial › I/O › Setup › WiFi/Remote › Power › System`). All command ids preserved.

- [ ] **Step 1: Assemble the merged board + update manifest** — run:

```bash
node -e '
const fs=require("fs");
const D="libraries/boards/";
const read=f=>JSON.parse(fs.readFileSync(D+f,"utf8"));
const mot=read("roam-a-dome-motion.json"), cfg=read("roam-a-dome-config.json");
const board={
  "$schema":"droidnet-command-library/library/v1",
  generatedFrom:"reeltwo DomeControlFirmware (Roam-A-Dome) — :DP motion + #DP config (consolidated)",
  enums:Object.assign({},mot.enums,cfg.enums),
  components:[{
    id:"roam-a-dome", name:"Roam-A-Dome", kind:"device-native", confidence:"high",
    firmware:"RDH (DomeControlFirmware)",
    routing:{class:"broadcast",nativeWrapper:"none",durationSuffix:{supported:false}},
    categories:["Movement","Sequences","Modes","Timing","Serial","I/O","Setup","WiFi/Remote","Power","System"],
    commands:[...mot.components[0].commands, ...cfg.components[0].commands],
  }],
};
const set=new Set(board.components[0].categories);
for(const c of board.components[0].commands) if(!set.has(c.category)) throw new Error("stray category "+c.category+" on "+c.id);
fs.writeFileSync(D+"roam-a-dome.json", JSON.stringify(board,null,2)+"\n");
for(const f of ["roam-a-dome-motion.json","roam-a-dome-config.json"]) fs.unlinkSync(D+f);
const mfPath="libraries/manifest.json", mf=JSON.parse(fs.readFileSync(mfPath,"utf8"));
const drop=new Set(["roam-a-dome-motion","roam-a-dome-config"]);
const at=mf.boards.findIndex(b=>drop.has(b.id));
mf.boards=mf.boards.filter(b=>!drop.has(b.id));
mf.boards.splice(at,0,{id:"roam-a-dome",file:"boards/roam-a-dome.json",name:"Roam-A-Dome",confidence:"high"});
fs.writeFileSync(mfPath, JSON.stringify(mf,null,2)+"\n");
console.log("roam-a-dome:", board.components[0].commands.length, "commands; boards now", mf.boards.length);
'
```
Expected: `roam-a-dome: 72 commands; boards now 16`.

- [ ] **Step 2: Update the board-count assertion** — in `test/load-node.test.js:14`, change `.toBe(17)` to `.toBe(16)`.

- [ ] **Step 3: Run validate + full suite**

Run: `npm run validate && npm test`
Expected: PASS. (`engine.test.js:470` matches `#DPRESTART → rad.cfg.restart` by command id — still resolves.)

- [ ] **Step 4 (optional tidy): freshen a stale test description** — `test/engine.test.js:470` reads `'does not collide with roam-a-dome-config (#AP vs #DP)'`. The board is now `roam-a-dome`; you may rename the string to `'does not collide with roam-a-dome config (#AP vs #DP)'`. Behavior is unchanged.

- [ ] **Step 5: Commit**

```bash
git add libraries/boards/ libraries/manifest.json test/load-node.test.js test/engine.test.js
git commit -m "refactor(roam): consolidate motion+config into a single roam-a-dome board"
```

---

### Task 6: Validator — category semantic rules

**Files:**
- Modify: `scripts/validate.js` (add `STANDARD_CATEGORIES` ~line 28; extend `boardSemanticErrors` ~lines 55–82)
- Test: `test/validate.test.js`

**Interfaces:**
- Consumes: `boardSemanticErrors(lib) -> { errors, warnings }` (existing signature, unchanged).
- Produces: **error** when a command's `category` is not in `component.categories`; **warnings** for missing category, non-standard (outlier) name, and dangling declared category.

- [ ] **Step 1: Write the failing tests** — append to `test/validate.test.js`:

```js
describe('boardSemanticErrors — categories', () => {
  const comp = (categories, commands) => ({ enums: {}, components: [{ id: 'a', name: 'A', kind: 'device-native', categories, commands }] });
  test('errors when a command category is not in the categories array', () => {
    const lib = comp(['Movement'], [{ id: 'a.x', name: 'X', template: 'X', category: 'Config' }]);
    expect(v.boardSemanticErrors(lib).errors.join(' ')).toMatch(/not listed in the component's categories/i);
  });
  test('no error when the category is listed and standard', () => {
    const lib = comp(['Movement'], [{ id: 'a.x', name: 'X', template: 'X', category: 'Movement' }]);
    expect(v.boardSemanticErrors(lib).errors).toEqual([]);
  });
  test('warns on a missing category', () => {
    const lib = comp(['Movement'], [{ id: 'a.x', name: 'X', template: 'X' }]);
    expect(v.boardSemanticErrors(lib).warnings.join(' ')).toMatch(/no category/i);
  });
  test('warns on a non-standard (outlier) category name', () => {
    const lib = comp(['Friendly'], [{ id: 'a.x', name: 'X', template: 'X', category: 'Friendly' }]);
    expect(v.boardSemanticErrors(lib).warnings.join(' ')).toMatch(/not a standard category/i);
  });
  test('warns on a dangling declared category', () => {
    const lib = comp(['Movement', 'Config'], [{ id: 'a.x', name: 'X', template: 'X', category: 'Movement' }]);
    expect(v.boardSemanticErrors(lib).warnings.join(' ')).toMatch(/has no commands/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest test/validate.test.js -t "categories"`
Expected: FAIL (no category checks yet).

- [ ] **Step 3: Add the `STANDARD_CATEGORIES` set** — in `scripts/validate.js`, after line 28 (`const KNOWN_BUILTIN_ENCODERS = …`):

```js
const STANDARD_CATEGORIES = new Set(['Lighting', 'Movement', 'Sound', 'Sequences', 'Setup', 'Config', 'Power', 'System']);
```

- [ ] **Step 4: Extend `boardSemanticErrors`** — inside `for (const comp of comps) {` (after line 55), before the `for (const cmd of comp.commands || [])` loop, add:

```js
    const declaredCats = Array.isArray(comp.categories) ? comp.categories : null;
    const usedCats = new Set();
```

Then inside the command loop (after the `const where = …;` line at 57), add:

```js
      if (cmd.category === undefined || cmd.category === '') {
        warnings.push(`${where}: command has no category (will render under 'Other')`);
      } else {
        usedCats.add(cmd.category);
        if (declaredCats && !declaredCats.includes(cmd.category)) {
          errors.push(`${where}: category '${cmd.category}' is not listed in the component's categories array`);
        }
        if (!STANDARD_CATEGORIES.has(cmd.category)) {
          warnings.push(`${where}: category '${cmd.category}' is not a standard category name (intentional outlier? check for typos)`);
        }
      }
```

Then after the command loop closes (before the `}` that closes `for (const comp of comps)`), add:

```js
    if (declaredCats) {
      for (const c of declaredCats) {
        if (!usedCats.has(c)) warnings.push(`${comp.id}: declared category '${c}' has no commands`);
      }
    }
```

- [ ] **Step 5: Run the category tests + full suite**

Run: `npx jest test/validate.test.js && npm run validate && npm test`
Expected: PASS. `npm run validate` exits 0 — outlier names (Friendly, Named Clips, Lifter, Modes, Serial, I/O, WiFi/Remote, Muse, Record, Query, Emotion, Patterns, Text, Servo, Playback, Volume, Status, Debug, Ambient, Panels, Timing) produce `warn` lines but no errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/validate.js test/validate.test.js
git commit -m "feat(validate): enforce command.category ∈ component.categories, warn on outliers"
```

---

### Task 7: Remove the dead `group` property from the schema

**Files:**
- Modify: `schema/library.schema.json`

**Interfaces:**
- Produces: schema no longer documents `command.group`. (`test/categories.test.js` already asserts no board uses it.)

- [ ] **Step 1: Remove the property** — in `schema/library.schema.json`, delete the `command.properties.group` line:

```json
"group": { "type": "string", "description": "Optional grouping label for the UI." },
```

- [ ] **Step 2: Verify no board or code relies on it**

Run: `grep -rn '"group"' libraries/ ; grep -rn '\.group\b' src/ scripts/`
Expected: no `"group":` command field in any board (the only hits, if any, are unrelated); no `.group` reads in code.

- [ ] **Step 3: Run validate + full suite**

Run: `npm run validate && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add schema/library.schema.json
git commit -m "chore(schema): drop the retired command.group property"
```

---

### Task 8: Version bump 2.14.0 → 3.0.0

**Files:**
- Modify: `libraries/manifest.json`, `releases.json`
- Modify: `test/load-node.test.js:6,13,19`, `test/engine.test.js:22`

**Interfaces:**
- Produces: catalog `libraryVersion` 3.0.0, synced across manifest + releases; version assertions updated.

- [ ] **Step 1: Bump the manifest** — in `libraries/manifest.json`, change `"libraryVersion": "2.14.0"` to `"libraryVersion": "3.0.0"`. Optionally update `generatedFrom` to note the category restructure.

- [ ] **Step 2: Bump releases.json** — set `latest.libraryVersion` and `libraries[0].libraryVersion` to `"3.0.0"`, set `latest.releasedAt` to the release date, and replace `latest.notes` with:

```
"Major: introduces in-dropdown command categories (command.group renamed to command.category; new per-board ordered component.categories). Consolidates AstroPixelsPlus config/panels/sequences into a single astropixels-plus board and Roam-A-Dome motion/config into roam-a-dome. Board catalog 19 -> 16. Command ids are preserved, so stored command strings still round-trip; host apps referencing the removed board ids must migrate."
```

- [ ] **Step 3: Update the four version assertions**

- `test/load-node.test.js:6` — `.toBe('2.14.0')` → `.toBe('3.0.0')`
- `test/load-node.test.js:13` — `.toBe('2.14.0')` → `.toBe('3.0.0')`
- `test/load-node.test.js:19` — `.toBe('2.14.0')` → `.toBe('3.0.0')`
- `test/engine.test.js:22` — `.toBe('2.14.0')` → `.toBe('3.0.0')`

- [ ] **Step 4: Run validate + full suite**

Run: `npm run validate && npm test`
Expected: PASS. `versionSyncErrors` is clean (manifest matches releases).

- [ ] **Step 5: Commit**

```bash
git add libraries/manifest.json releases.json test/load-node.test.js test/engine.test.js
git commit -m "release: bump library to 3.0.0 (command categories + board consolidation)"
```

---

### Task 9: Documentation

**Files:**
- Modify: `CLAUDE.md`, `docs/BOARD_AUTHORING_GUIDE.md`, `docs/INTEGRATION_GUIDE.md`

**Interfaces:** Docs only. No test.

- [ ] **Step 1: Update `CLAUDE.md`** — in the "Data model" section, replace the `command.group` description with `command.category` + `component.categories`: a command declares a `category`; the component declares an ordered `categories` array that drives dropdown section order; categories are UI-only (engine never sees them). Note the standard vocabulary (`Lighting, Movement, Sound, Sequences, Setup, Config, Power, System`) and that outliers are allowed.

- [ ] **Step 2: Update `docs/BOARD_AUTHORING_GUIDE.md`** — add a "Categories" subsection: every command needs a `category`; list it in the component's ordered `categories`; prefer the standard vocabulary; the validator errors if a `category` isn't declared and warns on non-standard names. Show a short example component with a `categories` array and two categorized commands.

- [ ] **Step 3: Update `docs/INTEGRATION_GUIDE.md`** — note that the command dropdown renders as `<optgroup>` sections ordered by `component.categories`, and that categories do not affect `encode`/`match`/`parse`.

- [ ] **Step 4: Verify docs reference no removed board ids as current** — `grep -n "astropixels-config\|astropixels-panels\|astropixels-sequences\|roam-a-dome-motion\|roam-a-dome-config" docs/BOARD_AUTHORING_GUIDE.md docs/INTEGRATION_GUIDE.md CLAUDE.md README.md` — fix any that describe them as current boards. (Historical files under `docs/superpowers/` may keep their references.)

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/BOARD_AUTHORING_GUIDE.md docs/INTEGRATION_GUIDE.md
git commit -m "docs: document command categories and the consolidated boards"
```

---

## Final Verification

- [ ] `npm run validate` — exits 0 (outlier-name warnings expected, no errors).
- [ ] `npm test` — all suites green; `test/load-node.test.js` asserts 16 components at v3.0.0; `test/categories.test.js` confirms no `group` and every declared category satisfied.
- [ ] `node -e "const {loadCatalog}=require('./src/load-node.js'); const l=loadCatalog({load:false}); console.log(l.libraryVersion, l.components.length, 'boards'); for(const c of l.components) console.log(' ', c.id, '→', (c.categories||['(none)']).join(' › '));"` — 16 boards at 3.0.0, each with its ordered categories; `astropixels-plus` and `roam-a-dome` present; the 5 source ids absent.
- [ ] Manual UI check (optional): render the composer, select `roam-a-dome`, confirm the command dropdown shows ordered `<optgroup>` sections (Movement first, System last).

## Notes / Deviations from strict TDD

- Task 3 is a data migration; its "test" is the invariant suite (`test/categories.test.js`) plus `validate` + full `jest`, and the migration map was pre-verified (238/238 commands, 0 mismatches).
- Board JSON is rewritten pretty-printed (`JSON.stringify(…, null, 2)`), so migration commits carry a large reflow diff; the meaningful change is `group → category` values, guarded by the invariant test and validator.
- Roam-A-Dome section order (Task 5) is the spec's recommended fine-grained default. If review prefers the coarse 6-band alternative (fold Modes/Timing/Serial/I-O into Config, WiFi/Remote into Setup), adjust the `categories` array in the Task 5 assembly script and the per-command category values in `scripts/migrate-categories.js` accordingly, then re-run Tasks 3 & 5.
