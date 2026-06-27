const fs = require('fs');
const path = require('path');

function loadEngine() { jest.resetModules(); return require('../src/droidnet-command-library.js'); }

const LIB_DIR = path.join(__dirname, '..', 'libraries');
const mono = JSON.parse(fs.readFileSync(path.join(LIB_DIR, 'droidnet-astromech.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(LIB_DIR, 'manifest.json'), 'utf8'));
const boards = manifest.boards.map(b => JSON.parse(fs.readFileSync(path.join(LIB_DIR, b.file), 'utf8')));

test('manifest preserves the monolith component order', () => {
  expect(manifest.boards.map(b => b.id)).toEqual(mono.components.map(c => c.id));
});

test('each board file has exactly one component and no libraryVersion', () => {
  for (const b of boards) {
    expect(b.components).toHaveLength(1);
    expect(b.libraryVersion).toBeUndefined();
  }
});

test('the two HCR boards carry byte-identical shared enums', () => {
  const wcb = boards[manifest.boards.findIndex(b => b.id === 'wcb-hcr')];
  const nat = boards[manifest.boards.findIndex(b => b.id === 'hcr-native')];
  expect(JSON.stringify(wcb.enums['hcr.emotion'])).toBe(JSON.stringify(nat.enums['hcr.emotion']));
  expect(JSON.stringify(wcb.enums['hcr.channel'])).toBe(JSON.stringify(nat.enums['hcr.channel']));
});

test('merging the boards reproduces the monolith enums and components', () => {
  const cb = loadEngine();
  const merged = cb.merge(boards, { libraryVersion: '2.0.0' });
  expect(cb.deepEqual(merged.enums, mono.enums)).toBe(true);
  expect(cb.deepEqual(merged.components, mono.components)).toBe(true);
});
