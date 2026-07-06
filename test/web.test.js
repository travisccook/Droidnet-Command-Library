const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }

describe('hosted site — html wiring', () => {
  test('index.html loads engine, UI module, page scripts, and css', () => {
    const html = read('index.html');
    expect(html).toContain('src/droidnet-command-library.js');
    expect(html).toContain('src/droidnet-command-library-ui.js');
    expect(html).toContain('assets/boot.js');
    expect(html).toContain('assets/composer.js');
    expect(html).toContain('assets/app.css');
    // required mount/anchor ids
    ['composer', 'out', 'counter', 'copy', 'import', 'import-btn', 'errzone', 'libver']
      .forEach(id => expect(html).toContain('id="' + id + '"'));
  });

  test('reference.html loads engine, boot, reference script, and css', () => {
    const html = read('reference.html');
    expect(html).toContain('src/droidnet-command-library.js');
    expect(html).toContain('assets/boot.js');
    expect(html).toContain('assets/reference.js');
    expect(html).toContain('assets/app.css');
    ['catalog', 'search', 'errzone', 'libver']
      .forEach(id => expect(html).toContain('id="' + id + '"'));
    // reference page must NOT need the UI module
    expect(html).not.toContain('droidnet-command-library-ui.js');
  });
});

const { readCatalog } = require('../src/load-node.js');
function loadEngine() { jest.resetModules(); return require('../src/droidnet-command-library.js'); }

describe('hosted site — reference data contract', () => {
  let cb;
  beforeEach(() => {
    cb = loadEngine();
    const { manifest, boards } = readCatalog();
    cb.loadLibrary(boards.map(b => JSON.parse(JSON.stringify(b))), { libraryVersion: manifest.libraryVersion });
  });

  const isBounded = (cmd) => (cmd.params || []).every(p => p.enum || p.type === 'int');

  test('every command exposes a first example (card + Try-in-composer seed)', () => {
    const missing = [];
    for (const comp of cb.getComponents())
      for (const cmd of cb.getCommands(comp.id))
        if (!(cmd.examples && cmd.examples[0])) missing.push(cmd.id);
    expect(missing).toEqual([]);
  });

  test('examples for fully-bounded commands round-trip to a recognized step', () => {
    const bad = [];
    for (const comp of cb.getComponents())
      for (const cmd of cb.getCommands(comp.id)) {
        if (!isBounded(cmd)) continue;                 // free-text arg (e.g. chirp.pvoice) → editable raw step, skip
        for (const ex of (cmd.examples || [])) {        // EVERY example — a bad non-first example (e.g. an invalid enum code) hid here before
          const steps = cb.parseWCBValue(ex);
          if (!steps.some(s => s.commandId && cb.getCommand(s.commandId))) bad.push(cmd.id + ' -> ' + ex);
        }
      }
    expect(bad).toEqual([]);
  });
});

describe('engine — negative-range int params round-trip (regression)', () => {
  let cb;
  beforeEach(() => {
    cb = loadEngine();
    const { manifest, boards } = readCatalog();
    cb.loadLibrary(boards.map(b => JSON.parse(JSON.stringify(b))), { libraryVersion: manifest.libraryVersion });
  });

  // A non-enum int param whose range allows negatives (uppity.rotary.spin min -100,
  // uppity.rotary.rel min -180). The matcher must accept a leading '-' so a pasted /
  // reloaded value re-parses to a structured, editable step instead of a raw step.
  test("match() accepts a leading '-' for int params", () => {
    const spin = cb.match(':PR-80');
    expect(spin).toBeTruthy();
    expect(spin.commandId).toBe('uppity.rotary.spin');
    expect(spin.params.speed).toBe('-80');

    const rel = cb.match(':PD-90');
    expect(rel).toBeTruthy();
    expect(rel.commandId).toBe('uppity.rotary.rel');
    expect(rel.params.degrees).toBe('-90');
  });
});
