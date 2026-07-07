const path = require('path');
const { readCatalog, loadCatalog } = require('../src/load-node.js');

test('readCatalog returns the manifest and every board, in order', () => {
  const { manifest, boards } = readCatalog();
  expect(manifest.libraryVersion).toBe('2.12.0');
  expect(boards).toHaveLength(manifest.boards.length);
  expect(boards.map(b => b.components[0].id)).toEqual(manifest.boards.map(b => b.id));
});

test('loadCatalog({ load: false }) returns the merged catalog object', () => {
  const lib = loadCatalog({ load: false });
  expect(lib.libraryVersion).toBe('2.12.0');
  expect(lib.components.length).toBe(18);
});

test('loadCatalog() loads the engine and resolves commands', () => {
  const engine = loadCatalog();
  expect(engine.getLibraryVersion()).toBe('2.12.0');
  expect(engine.getCommand('flthy.led.solid')).not.toBeNull();
  expect(engine.encode(engine.getCommand('flthy.led.solid'), { designator: 'A', color: '5' }, {})).toBe('A0065');
});
