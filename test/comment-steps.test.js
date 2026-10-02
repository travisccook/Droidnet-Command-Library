'use strict';
// 4.6.0: a comment keeps its place. DroidNet's stored-command field writes a comment on
// its own line as '^^***' and an inline one as '^***'; the builder must rebuild both
// byte for byte, so a builder action changes only the step it touches.
function loadEngine() {
  jest.resetModules();
  return require('../src/droidnet-command-library.js');
}

const LIB = {
  enums: { mode: { values: [{ code: '3', label: 'Alarm' }, { code: '92', label: 'VU' }] } },
  components: [{
    id: 'test', name: 'Test', kind: 'device-native',
    routing: { class: 'broadcast', nativeWrapper: 'none' },
    commands: [
      { id: 't.mode', name: 'Mode', template: '4T{mode}',
        params: [{ name: 'mode', enum: 'mode' }], examples: ['4T3'] },
    ],
  }],
};

describe('comment steps keep their place (4.6.0)', () => {
  let cb;
  beforeEach(() => {
    cb = loadEngine();
    cb.loadLibrary(JSON.parse(JSON.stringify(LIB)), { libraryVersion: 'test' });
  });

  test('a comment on its own line (^^***) is a standalone note, not the label', () => {
    const steps = cb.parseWCBValue('4T3^^*** own line');
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ type: 'command', commandId: 't.mode' });
    expect(steps[0].label).toBeUndefined();
    expect(steps[1]).toEqual({ type: 'comment', text: ' own line' });
  });

  test('a comment directly after a command (^***) is still its label', () => {
    const steps = cb.parseWCBValue('4T3^*** inline');
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ type: 'command', label: ' inline' });
  });

  test('a comment after a delay with a single ^ is an inline note step', () => {
    expect(cb.parseWCBValue(';t500^*** wait')[1]).toEqual({ type: 'comment', text: ' wait', inline: true });
  });

  test('a note step after another step is written on its own line', () => {
    expect(cb.buildWCBValue([
      { type: 'command', commandId: 't.mode', params: { mode: '3' } },
      { type: 'comment', text: ' note' },
    ])).toBe('4T3^^*** note');
  });

  test('a note step first in the value stays ***text', () => {
    expect(cb.buildWCBValue([
      { type: 'comment', text: ' note' },
      { type: 'command', commandId: 't.mode', params: { mode: '3' } },
    ])).toBe('*** note^4T3');
  });

  test.each([
    ['an inline comment', '4T3^*** note'],
    ['a comment on its own line', '4T3^^*** note'],
    ['a comment as the first line', '*** note^4T3'],
    ['two comment lines in a row', '4T3^^*** a^^*** b'],
    ['a comment on its own line after a delay', '4T3^;t500^^*** wait'],
    ['an inline comment after a delay', '4T3^;t500^*** wait'],
    ['two inline comments on one line', '4T3^*** a^*** b'],
    ['two comment lines first', '*** a^^*** b^4T92'],
    ['an inline comment after a first-line comment', '*** a^*** b'],
    ['a labelled raw step, then a comment line', '<XYZ>^*** r^^*** own'],
    ['a comment line between commands', '4T3^^*** own^4T92'],
  ])('%s rebuilds byte for byte: %s', (_name, value) => {
    expect(cb.buildWCBValue(cb.parseWCBValue(value))).toBe(value);
  });

  test('a note added in the builder after a command rebuilds byte for byte', () => {
    const steps = cb.parseWCBValue('4T3');
    steps.push({ type: 'comment', text: ' note' });
    const value = cb.buildWCBValue(steps);
    expect(value).toBe('4T3^^*** note');
    expect(cb.buildWCBValue(cb.parseWCBValue(value))).toBe(value);
  });

  test('the WCB runs the same commands: only empty segments and comments move', () => {
    const run = (v) => v.split('^').filter((s) => s !== '' && !s.startsWith('***'));
    for (const v of ['4T3^^*** a', '*** a^4T3', '4T3^*** a^^*** b^4T92', '^4T3^^4T92^']) {
      expect(run(cb.buildWCBValue(cb.parseWCBValue(v)))).toEqual(run(v));
    }
  });

  test('other empty segments still become no step', () => {
    expect(cb.buildWCBValue(cb.parseWCBValue('^4T3^^4T92^'))).toBe('4T3^4T92');
    expect(cb.buildWCBValue(cb.parseWCBValue('4T3^^^*** a'))).toBe('4T3^^*** a');
  });
});
