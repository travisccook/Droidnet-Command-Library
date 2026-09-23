const path = require('path');
const { readCatalog, loadCatalog } = require('../src/load-node.js');

test('readCatalog returns the manifest and every board, in order', () => {
  const { manifest, boards } = readCatalog();
  expect(manifest.libraryVersion).toBe('4.4.0');
  expect(boards).toHaveLength(manifest.boards.length);
  expect(boards.map(b => b.components[0].id)).toEqual(manifest.boards.map(b => b.id));
});

test('loadCatalog({ load: false }) returns the merged catalog object', () => {
  const lib = loadCatalog({ load: false });
  expect(lib.libraryVersion).toBe('4.4.0');
  expect(lib.components.length).toBe(24);
});

test('loadCatalog() loads the engine and resolves commands', () => {
  const engine = loadCatalog();
  expect(engine.getLibraryVersion()).toBe('4.4.0');
  expect(engine.getCommand('flthy.led.solid')).not.toBeNull();
  expect(engine.encode(engine.getCommand('flthy.led.solid'), { designator: 'A', color: '5' }, {})).toBe('A0055');
});

test('package.json, package-lock.json and releases.json carry the manifest libraryVersion', () => {
  const root = path.join(__dirname, '..');
  const read = f => JSON.parse(require('fs').readFileSync(path.join(root, f), 'utf8'));
  const version = readCatalog().manifest.libraryVersion;
  const lock = read('package-lock.json');
  const releases = read('releases.json');
  expect(read('package.json').version).toBe(version);
  expect(lock.version).toBe(version);
  expect(lock.packages[''].version).toBe(version);
  expect(releases.latest.libraryVersion).toBe(version);
  expect(releases.libraries.map(l => l.libraryVersion)).toEqual([version]);
});
