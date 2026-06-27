function loadEngine() {
  jest.resetModules();
  return require('../src/droidnet-command-library.js');
}

// Minimal synthetic boards (template encoder).
function boardFlthy() {
  return {
    enums: { 'c.color': { values: [{ code: '5', label: 'Blue' }] } },
    components: [{
      id: 'flthy', name: 'Flthy', kind: 'device-native',
      commands: [{ id: 'flthy.solid', name: 'Solid', template: '{color}', params: [{ name: 'color', enum: 'c.color' }] }],
    }],
  };
}
function boardMp() {
  return {
    enums: { 'm.mode': { values: [{ code: '52', label: 'VU' }] } },
    components: [{
      id: 'mp', name: 'MP', kind: 'device-native',
      commands: [{ id: 'mp.mode', name: 'Mode', template: 'T{mode}', params: [{ name: 'mode', enum: 'm.mode' }] }],
    }],
  };
}

describe('deepEqual', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); });
  test('objects are key-order-insensitive', () => {
    expect(cb.deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });
  test('arrays are order-sensitive', () => {
    expect(cb.deepEqual([1, 2], [2, 1])).toBe(false);
  });
  test('nested mismatch is detected', () => {
    expect(cb.deepEqual({ v: [{ code: 'H' }] }, { v: [{ code: 'S' }] })).toBe(false);
  });
  test('null and mixed primitive types', () => {
    expect(cb.deepEqual(null, null)).toBe(true);
    expect(cb.deepEqual(null, {})).toBe(false);
    expect(cb.deepEqual(1, '1')).toBe(false);
  });
});

describe('merge (pure)', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); });
  test('merges enums and components in order', () => {
    const m = cb.merge([boardFlthy(), boardMp()], { libraryVersion: '2.0.0' });
    expect(m.libraryVersion).toBe('2.0.0');
    expect(m.components.map(c => c.id)).toEqual(['flthy', 'mp']);
    expect(Object.keys(m.enums).sort()).toEqual(['c.color', 'm.mode']);
  });
  test('identical duplicate enum is idempotent', () => {
    const a = boardFlthy();
    const b = boardFlthy(); b.components[0].id = 'flthy2';
    b.components[0].commands[0].id = 'flthy2.solid';
    expect(() => cb.merge([a, b])).not.toThrow();
  });
  test('conflicting duplicate enum throws', () => {
    const a = boardFlthy();
    const b = boardFlthy(); b.components[0].id = 'flthy2';
    b.components[0].commands[0].id = 'flthy2.solid';
    b.enums['c.color'].values[0].label = 'Red';
    expect(() => cb.merge([a, b])).toThrow(/c\.color/);
  });
  test('duplicate command id across boards throws', () => {
    const a = boardFlthy();
    const b = boardMp(); b.components[0].commands[0].id = 'flthy.solid';
    expect(() => cb.merge([a, b])).toThrow(/flthy\.solid/);
  });
  test('does not mutate engine state', () => {
    cb.merge([boardFlthy()]);
    expect(cb.getComponents()).toEqual([]);
  });
});

describe('loadLibrary (array + opts)', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); });
  test('loads and merges an array, version from opts', () => {
    cb.loadLibrary([boardFlthy(), boardMp()], { libraryVersion: '2.0.0' });
    expect(cb.getLibraryVersion()).toBe('2.0.0');
    expect(cb.getComponents().map(c => c.id)).toEqual(['flthy', 'mp']);
    expect(cb.getCommand('mp.mode').name).toBe('Mode');
  });
  test('single object still works (back-compat)', () => {
    cb.loadLibrary(boardFlthy());
    expect(cb.getCommand('flthy.solid')).not.toBeNull();
  });
  test('a failing array load leaves prior state unchanged (atomic)', () => {
    cb.loadLibrary([boardFlthy()]);
    const bad = boardMp(); bad.components[0].commands[0].id = 'flthy.solid';
    expect(() => cb.loadLibrary([boardFlthy(), bad])).toThrow();
    expect(cb.getComponents().map(c => c.id)).toEqual(['flthy']);
  });
});

describe('mergeLibrary', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); });
  test('appends without reset', () => {
    cb.loadLibrary([boardFlthy()], { libraryVersion: '2.0.0' });
    cb.mergeLibrary(boardMp());
    expect(cb.getComponents().map(c => c.id)).toEqual(['flthy', 'mp']);
    expect(cb.getLibraryVersion()).toBe('2.0.0');
  });
  test('re-merging identical component is a no-op', () => {
    cb.loadLibrary([boardFlthy()]);
    cb.mergeLibrary(boardFlthy());
    expect(cb.getComponents().map(c => c.id)).toEqual(['flthy']);
  });
  test('re-merging a changed component throws', () => {
    cb.loadLibrary([boardFlthy()]);
    const changed = boardFlthy();
    changed.components[0].commands[0].name = 'Different';
    expect(() => cb.mergeLibrary(changed)).toThrow(/flthy/);
  });
  test('initializes an empty catalog when none loaded', () => {
    cb.mergeLibrary(boardFlthy());
    expect(cb.getCommand('flthy.solid')).not.toBeNull();
  });
});

describe('matcher cache invalidation on reload', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); });

  test('a widened enum is recognized after reloading the same library (cached matcher is invalidated)', () => {
    const lib = {
      enums: { 'c.color': { values: [{ code: '5', label: 'Blue' }] } },
      components: [{
        id: 'flthy', name: 'Flthy', kind: 'device-native',
        commands: [{ id: 'flthy.solid', name: 'Solid', template: '{color}', params: [{ name: 'color', enum: 'c.color' }] }],
      }],
    };
    cb.loadLibrary(lib);
    // First match() builds and caches the matcher against the initial enum {5}.
    expect(cb.match('5')).toMatchObject({ commandId: 'flthy.solid', params: { color: '5' } });
    expect(cb.match('7')).toBeNull(); // '7' is not yet a valid code

    // Widen the enum on the SAME command object, then reload.
    lib.enums['c.color'].values.push({ code: '7', label: 'Red' });
    cb.loadLibrary(lib);

    // The cached matcher must have been invalidated and rebuilt against {5,7}.
    expect(cb.match('7')).toMatchObject({ commandId: 'flthy.solid', params: { color: '7' } });
  });
});
