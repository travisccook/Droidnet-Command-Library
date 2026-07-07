const v = require('../scripts/validate.js');

function board(id, enums, commands) {
  return { enums: enums || {}, components: [{ id, name: id, kind: 'device-native', commands }] };
}

describe('boardSemanticErrors', () => {
  test('errors when a board has more than one component', () => {
    const lib = { enums: {}, components: [
      { id: 'a', name: 'A', kind: 'device-native', commands: [{ id: 'a.x', name: 'X', template: 'X' }] },
      { id: 'b', name: 'B', kind: 'device-native', commands: [{ id: 'b.y', name: 'Y', template: 'Y' }] },
    ] };
    expect(v.boardSemanticErrors(lib).errors.join(' ')).toMatch(/exactly one component/i);
  });
  test('clean single-component board has no errors', () => {
    const lib = board('a', {}, [{ id: 'a.x', name: 'X', template: 'X' }]);
    expect(v.boardSemanticErrors(lib).errors).toEqual([]);
  });
  test('errors when a param references an undefined enum', () => {
    const lib = board('a', {}, [{ id: 'a.x', name: 'X', template: '{p}', params: [{ name: 'p', enum: 'nope' }] }]);
    expect(v.boardSemanticErrors(lib).errors.join(' ')).toMatch(/undefined enum/i);
  });
  test('errors when a template placeholder has no matching param', () => {
    const lib = board('a', {}, [{ id: 'a.x', name: 'X', template: '{missing}' }]);
    expect(v.boardSemanticErrors(lib).errors.join(' ')).toMatch(/placeholder/i);
  });
});

describe('crossFileErrors', () => {
  test('reports a duplicate command id across boards', () => {
    const a = board('a', {}, [{ id: 'dup', name: 'X', template: 'X' }]);
    const b = board('b', {}, [{ id: 'dup', name: 'Y', template: 'Y' }]);
    expect(v.crossFileErrors([a, b]).join(' ')).toMatch(/dup/);
  });
  test('reports a conflicting shared enum', () => {
    const a = board('a', { 'e': { values: [{ code: 'H', label: 'Happy' }] } }, [{ id: 'a.x', name: 'X', template: '{p}', params: [{ name: 'p', enum: 'e' }] }]);
    const b = board('b', { 'e': { values: [{ code: 'H', label: 'Sad' }] } }, [{ id: 'b.y', name: 'Y', template: '{p}', params: [{ name: 'p', enum: 'e' }] }]);
    expect(v.crossFileErrors([a, b]).join(' ')).toMatch(/enum 'e'/);
  });
  test('clean boards produce no cross-file errors', () => {
    const a = board('a', {}, [{ id: 'a.x', name: 'X', template: 'X' }]);
    const b = board('b', {}, [{ id: 'b.y', name: 'Y', template: 'Y' }]);
    expect(v.crossFileErrors([a, b])).toEqual([]);
  });
});

describe('manifestConsistencyErrors', () => {
  const manifest = { boards: [{ id: 'a', file: 'boards/a.json' }, { id: 'b', file: 'boards/b.json' }] };
  test('passes when manifest and disk agree', () => {
    expect(v.manifestConsistencyErrors(manifest, ['boards/a.json', 'boards/b.json'])).toEqual([]);
  });
  test('flags a listed-but-missing board', () => {
    expect(v.manifestConsistencyErrors(manifest, ['boards/a.json']).join(' ')).toMatch(/boards\/b\.json/);
  });
  test('flags an orphaned board file', () => {
    expect(v.manifestConsistencyErrors(manifest, ['boards/a.json', 'boards/b.json', 'boards/c.json']).join(' ')).toMatch(/c\.json/);
  });
});

describe('versionSyncErrors', () => {
  test('passes when versions match', () => {
    expect(v.versionSyncErrors({ libraryVersion: '2.0.0' }, { latest: { libraryVersion: '2.0.0' } })).toEqual([]);
  });
  test('flags a mismatch', () => {
    expect(v.versionSyncErrors({ libraryVersion: '2.0.0' }, { latest: { libraryVersion: '1.0.0' } }).join(' ')).toMatch(/2\.0\.0/);
  });
});

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

describe('legacySemanticErrors', () => {
  test('errors when two components share a duplicate command id', () => {
    const lib = {
      enums: {},
      components: [
        { id: 'a', name: 'A', kind: 'device-native', commands: [{ id: 'dup', name: 'X', template: 'X' }] },
        { id: 'b', name: 'B', kind: 'device-native', commands: [{ id: 'dup', name: 'Y', template: 'Y' }] },
      ],
    };
    expect(v.legacySemanticErrors(lib).errors.join(' ')).toMatch(/duplicate command id/i);
  });
  test('clean multi-component library returns no duplicate error', () => {
    const lib = {
      enums: {},
      components: [
        { id: 'a', name: 'A', kind: 'device-native', commands: [{ id: 'a.x', name: 'X', template: 'X' }] },
        { id: 'b', name: 'B', kind: 'device-native', commands: [{ id: 'b.y', name: 'Y', template: 'Y' }] },
      ],
    };
    expect(v.legacySemanticErrors(lib).errors.filter(e => /duplicate/.test(e))).toEqual([]);
  });
});
