'use strict';
// 4.5.0: parse what the firmware accepts. Stored WCB commands written by hand (or by
// older tools) use spellings the firmware treats as equal to the canonical form — a
// stray '^', '4T03' for '4T3', 'A007' with the colour left off. The builder showed each
// as an unrecognized raw step. These tests pin the leniency to what the firmware does.
const { readCatalog } = require('../src/load-node.js');
const v = require('../scripts/validate.js');
const UI = require('../src/droidnet-command-library-ui.js');

function loadEngine() {
  jest.resetModules();
  return require('../src/droidnet-command-library.js');
}
const { manifest, boards } = readCatalog();
function loadCatalog(cb) {
  cb.loadLibrary(boards.map(b => JSON.parse(JSON.stringify(b))), { libraryVersion: manifest.libraryVersion });
}
const raws = (steps) => steps.filter(s => s.type === 'raw').map(s => s.text);

const LIB = {
  enums: {
    mode: { values: [{ code: '0', label: 'Off' }, { code: '3', label: 'Alarm' }, { code: '92', label: 'VU' }] },
    color: { values: [{ code: '1', label: 'Red' }, { code: '5', label: 'Blue' }] },
  },
  components: [{
    id: 'test', name: 'Test', kind: 'device-native',
    routing: { class: 'broadcast', nativeWrapper: 'none', durationSuffix: { supported: true, sep: '|' } },
    commands: [
      { id: 't.mode', name: 'Mode', template: '4T{mode}', supportsDuration: true,
        params: [{ name: 'mode', enum: 'mode', leadingZeros: true }], examples: ['4T3'] },
      { id: 't.strict', name: 'Strict', template: 'S{mode}',
        params: [{ name: 'mode', enum: 'mode' }], examples: ['S3'] },
      { id: 't.pulse', name: 'Pulse', template: 'A003{color}{speed}', supportsDuration: true,
        params: [{ name: 'color', enum: 'color', default: '5', omittable: true },
                 { name: 'speed', type: 'int', min: 0, max: 9, default: 5, omittable: true }],
        examples: ['A00315'] },
    ],
  }],
};

describe('parseWCBValue — empty fragments', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); cb.loadLibrary(LIB, { libraryVersion: 'test' }); });

  test('a trailing ^ adds no step (the WCB skips empty segments)', () => {
    const steps = cb.parseWCBValue('4T3^*** note^');
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ type: 'command', commandId: 't.mode', label: ' note' });
  });
  test('doubled and leading ^ add no steps', () => {
    expect(raws(cb.parseWCBValue('^4T3^^S3^^'))).toEqual([]);
    expect(cb.parseWCBValue('^4T3^^S3^^')).toHaveLength(2);
  });
  test('an empty value parses to no steps', () => {
    expect(cb.parseWCBValue('')).toEqual([]);
  });
  test('rebuilding drops the empty segments (firmware-equivalent)', () => {
    expect(cb.buildWCBValue(cb.parseWCBValue('4T3^*** note^'))).toBe('4T3^*** note');
  });
});

describe('leadingZeros params', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); cb.loadLibrary(LIB, { libraryVersion: 'test' }); });

  test('match accepts leading zeros and returns the canonical code', () => {
    expect(cb.match('4T03')).toMatchObject({ commandId: 't.mode', params: { mode: '3' } });
    expect(cb.match('4T092')).toMatchObject({ params: { mode: '92' } });
  });
  test('zero itself still matches, with or without extra zeros', () => {
    expect(cb.match('4T0')).toMatchObject({ params: { mode: '0' } });
    expect(cb.match('4T00')).toMatchObject({ params: { mode: '0' } });
  });
  test('keeps working with a duration suffix', () => {
    expect(cb.match('4T03|15')).toMatchObject({ commandId: 't.mode', params: { mode: '3' }, duration: 15 });
  });
  test('rebuild writes the canonical form (firmware-equivalent)', () => {
    expect(cb.buildWCBValue(cb.parseWCBValue('4T03'))).toBe('4T3');
  });
  test('params without the flag stay strict', () => {
    expect(cb.match('S03')).toBeNull();
    expect(cb.match('S3')).toMatchObject({ commandId: 't.strict' });
  });
  test('an unknown code with leading zeros is still unrecognized', () => {
    expect(cb.match('4T07')).toBeNull();
  });
});

describe('omittable params', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); cb.loadLibrary(LIB, { libraryVersion: 'test' }); });

  test('match accepts the command with trailing params left off', () => {
    expect(cb.match('A003')).toMatchObject({ commandId: 't.pulse', params: { color: '', speed: '' } });
    expect(cb.match('A0031')).toMatchObject({ commandId: 't.pulse', params: { color: '1', speed: '' } });
    expect(cb.match('A00315')).toMatchObject({ commandId: 't.pulse', params: { color: '1', speed: '5' } });
  });
  test('a later param cannot be present without the earlier one', () => {
    // 'A0037' — 7 is not a colour; the firmware would read it as one, so it is not a speed either
    expect(cb.match('A0037')).toBeNull();
  });
  test('parse → build is byte-identical', () => {
    for (const s of ['A003', 'A0031', 'A00315', 'A003|30', 'A0031|240']) {
      expect(cb.buildWCBValue(cb.parseWCBValue(s))).toBe(s);
    }
  });
  test("encode: '' omits the param and everything after it", () => {
    const cmd = cb.getCommand('t.pulse');
    expect(cb.encode(cmd, { color: '', speed: '' })).toBe('A003');
    expect(cb.encode(cmd, { color: '1', speed: '' })).toBe('A0031');
    expect(cb.encode(cmd, { color: '', speed: '7' })).toBe('A003');
  });
  test('encode: an absent value still falls back to the default', () => {
    expect(cb.encode(cb.getCommand('t.pulse'), {})).toBe('A00355');
  });
});

describe('validator — omittable and leadingZeros', () => {
  const board = (commands, enums) => ({ enums: enums || { c: { values: [{ code: '1', label: 'One' }] } },
    components: [{ id: 'a', name: 'A', kind: 'device-native', commands }] });

  test('accepts omittable params at the end of the template', () => {
    const lib = board([{ id: 'a.x', name: 'X', category: 'Lighting', template: 'X{p}{q}',
      params: [{ name: 'p', enum: 'c', omittable: true }, { name: 'q', type: 'int', omittable: true }] }]);
    expect(v.boardSemanticErrors(lib).errors).toEqual([]);
  });
  test('rejects literal text after an omittable param', () => {
    const lib = board([{ id: 'a.x', name: 'X', template: 'X{p}Y', params: [{ name: 'p', enum: 'c', omittable: true }] }]);
    expect(v.boardSemanticErrors(lib).errors.join(' ')).toMatch(/omittable/i);
  });
  test('rejects a required param after an omittable one', () => {
    const lib = board([{ id: 'a.x', name: 'X', template: 'X{p}{q}',
      params: [{ name: 'p', enum: 'c', omittable: true }, { name: 'q', type: 'int' }] }]);
    expect(v.boardSemanticErrors(lib).errors.join(' ')).toMatch(/omittable/i);
  });
  test('rejects a param that is both omittable and required', () => {
    const lib = board([{ id: 'a.x', name: 'X', template: 'X{p}', params: [{ name: 'p', enum: 'c', omittable: true, required: true }] }]);
    expect(v.boardSemanticErrors(lib).errors.join(' ')).toMatch(/omittable.*required|required.*omittable/i);
  });
  test('rejects leadingZeros on a free-text pattern param', () => {
    const lib = board([{ id: 'a.x', name: 'X', template: 'X{p}', params: [{ name: 'p', pattern: '.+', leadingZeros: true }] }]);
    expect(v.boardSemanticErrors(lib).errors.join(' ')).toMatch(/leadingZeros/);
  });
  test('rejects leadingZeros on an enum with a non-numeric code', () => {
    const lib = board([{ id: 'a.x', name: 'X', template: 'X{p}', params: [{ name: 'p', enum: 'e', leadingZeros: true }] }],
      { e: { values: [{ code: 'A', label: 'A' }] } });
    expect(v.boardSemanticErrors(lib).errors.join(' ')).toMatch(/leadingZeros/);
  });
});

describe('composer — omittable enum params', () => {
  const en = { values: [{ code: '1', label: 'Red' }, { code: '5', label: 'Blue' }] };
  const getEnum = () => en;

  test('offers a Board default choice, selected for a blank value', () => {
    const html = UI.paramControlHtml({ name: 'color', enum: 'c', omittable: true }, '', getEnum);
    expect(html).toMatch(/<option value="" selected>Board default<\/option>/);
  });
  test('a chosen value is selected instead', () => {
    const html = UI.paramControlHtml({ name: 'color', enum: 'c', omittable: true }, '5', getEnum);
    expect(html).toMatch(/<option value="">Board default<\/option>/);
    expect(html).toMatch(/<option value="5" selected>Blue<\/option>/);
  });
  test('a param that is not omittable has no Board default choice', () => {
    expect(UI.paramControlHtml({ name: 'color', enum: 'c' }, '5', getEnum)).not.toMatch(/Board default/);
  });
  test('an omittable number input says a blank uses the board default', () => {
    expect(UI.paramControlHtml({ name: 'speed', type: 'int', omittable: true }, '', getEnum))
      .toMatch(/placeholder="Board default"/);
  });
});

describe('catalog — c2-body stored commands that were unrecognized', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test.each([
    ['PSI Pro effect with a leading zero', '4T03', 'psi.mode', { address: '4', mode: '3' }],
    ['PSI Pro effect with a leading zero and a duration', '4T09|15', 'psi.mode', { address: '4', mode: '9' }],
    ['IA Magic Panel mode with a leading zero', 'T00', 'iamp.mode', { mode: '0' }],
    ['FlthyHPs short circuit in the board colour', 'A007|240', 'flthy.led.shortcircuit', { designator: 'A', color: '' }],
    ['FlthyHPs solid in the board colour', 'F005', 'flthy.led.solid', { designator: 'F', color: '' }],
    ['FlthyHPs colour projector in the board colour', 'F002', 'flthy.led.colorproj', { designator: 'F', color: '' }],
    ['FlthyHPs cycle in the board colour', 'R004', 'flthy.led.cycle', { designator: 'R', color: '' }],
    ['FlthyHPs dim pulse with the board speed', 'A0031', 'flthy.led.dimpulse', { designator: 'A', color: '1', speed: '' }],
    ['FlthyHPs wag up/down for 3 s', 'F106|3', 'flthy.servo.wag-ud', { designator: 'F' }],
    ['FlthyHPs wag left/right for 3 s', 'F105|3', 'flthy.servo.wag-lr', { designator: 'F' }],
    ['FlthyHPs RC left/right for 10 s', 'F102|10', 'flthy.servo.rc-lr', { designator: 'F' }],
    ['FlthyHPs RC up/down for 10 s', 'F103|10', 'flthy.servo.rc-ud', { designator: 'F' }],
  ])('%s: %s', (_, token, commandId, params) => {
    expect(cb.match(token)).toMatchObject({ commandId, params });
  });

  test('the alarm, cantina and angrysound values parse with no raw steps', () => {
    const values = [
      ';H,PLAY,A,10^*** Play Death Star Klaxon on Channel A^4T03^5T03^~RTLE10590^A00319|120^T7',
      ';H,PLAY,B,9^*** Play Royal Cafe on Channel B^4T92^5T92^~RTLE135000^A007|240^T52',
      ';H,STIM,M,MOD^*** HCR Mild Angry^',
    ];
    for (const value of values) expect(raws(cb.parseWCBValue(value))).toEqual([]);
  });

  test('FlthyHPs codes that already parsed keep their meaning', () => {
    expect(cb.match('A00319|120')).toMatchObject({ commandId: 'flthy.led.dimpulse', params: { color: '1', speed: '9' }, duration: 120 });
    expect(cb.match('A0071')).toMatchObject({ commandId: 'flthy.led.shortcircuit', params: { color: '1' } });
    expect(cb.match('A006')).toMatchObject({ commandId: 'flthy.led.rainbow' });
    expect(cb.match('F1011')).toMatchObject({ commandId: 'flthy.servo.preset' });
    expect(cb.match('A104|30')).toBeNull(); // Random twitch is one-shot; a duration does nothing
  });

  test('the Magic Panel still refuses a duration (its firmware ignores |n)', () => {
    expect(cb.match('T35|180')).toBeNull();
  });
});
