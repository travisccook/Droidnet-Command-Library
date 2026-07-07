const { readCatalog } = require('../src/load-node.js');

// Fresh engine instance per call (the engine holds a module-level loaded library).
function loadEngine() {
  jest.resetModules();
  return require('../src/droidnet-command-library.js');
}

const { manifest, boards } = readCatalog();
const VERSION = manifest.libraryVersion;
function freshBoards() { return boards.map(b => JSON.parse(JSON.stringify(b))); }
function loadCatalog(cb) { cb.loadLibrary(freshBoards(), { libraryVersion: VERSION }); }

describe('engine lookups', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('getComponents returns the seed books', () => {
    expect(cb.getComponents().map(c => c.id)).toEqual(expect.arrayContaining(['flthy-hps', 'magic-panel']));
  });
  test('getLibraryVersion reports the loaded version', () => {
    expect(cb.getLibraryVersion()).toBe('2.13.0');
  });
  test('getCommand resolves and back-links its component', () => {
    const cmd = cb.getCommand('flthy.led.solid');
    expect(cmd.name).toBe('Solid Color');
    expect(cmd._component.id).toBe('flthy-hps');
  });
  test('getEnum resolves enum values', () => {
    expect(cb.getEnum('flthy.color').values.find(v => v.code === '5').label).toBe('Blue');
  });
  test('loadLibrary is idempotent — reloading does not leak stale commands', () => {
    cb.loadLibrary({ libraryVersion: '0', enums: {}, components: [] });
    expect(cb.getComponents()).toEqual([]);
    expect(cb.getCommand('flthy.led.solid')).toBeNull();
  });
});

describe('encode (template)', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('substitutes enum params', () => {
    expect(cb.encode(cb.getCommand('flthy.led.solid'), { designator: 'A', color: '5' }, {})).toBe('A0065');
  });
  test('uses param default when value missing', () => {
    expect(cb.encode(cb.getCommand('flthy.led.solid'), { designator: 'A' }, {})).toBe('A0065');
  });
  test('appends duration with the component sep', () => {
    expect(cb.encode(cb.getCommand('flthy.led.rainbow'), { designator: 'A' }, { duration: 240 })).toBe('A007|240');
  });
  test('ignores duration when command does not support it', () => {
    expect(cb.encode(cb.getCommand('mp.mode'), { mode: '52' }, { duration: 9 })).toBe('T52');
  });
  test('prepends a manual target prefix', () => {
    expect(cb.encode(cb.getCommand('mp.mode'), { mode: '52' }, { targetPrefix: ';S3' })).toBe(';S3T52');
  });
});

describe('match (template)', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('recognizes a FlthyHPs solid token', () => {
    expect(cb.match('A0065')).toEqual({ commandId: 'flthy.led.solid', params: { designator: 'A', color: '5' }, duration: undefined });
  });
  test('recovers a duration suffix', () => {
    expect(cb.match('A007|240')).toEqual({ commandId: 'flthy.led.rainbow', params: { designator: 'A' }, duration: 240 });
  });
  test('recognizes a MagicPanel mode token', () => {
    expect(cb.match('T52')).toEqual({ commandId: 'mp.mode', params: { mode: '52' }, duration: undefined });
  });
  test('returns null for an unknown token', () => {
    expect(cb.match('%ZZ')).toBeNull();
  });
});

describe('FlthyHPs LED effects', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('leia encodes and round-trips (color-free)', () => {
    expect(cb.encode(cb.getCommand('flthy.led.leia'), { designator: 'F' }, {})).toBe('F001');
    expect(cb.match('F001')).toMatchObject({ commandId: 'flthy.led.leia', params: { designator: 'F' } });
  });
  test('color projector carries a color', () => {
    expect(cb.encode(cb.getCommand('flthy.led.colorproj'), { designator: 'F', color: '5' }, {})).toBe('F0025');
    expect(cb.match('F0025')).toMatchObject({ commandId: 'flthy.led.colorproj', params: { designator: 'F', color: '5' } });
  });
  test('dim pulse always emits the required speed digit and round-trips', () => {
    expect(cb.encode(cb.getCommand('flthy.led.dimpulse'), { designator: 'A', color: '6' }, {})).toBe('A00365'); // speed defaults to 5
    expect(cb.encode(cb.getCommand('flthy.led.dimpulse'), { designator: 'A', color: '6', speed: '2' }, {})).toBe('A00362');
    expect(cb.match('A00362')).toMatchObject({ commandId: 'flthy.led.dimpulse', params: { designator: 'A', color: '6', speed: '2' } });
  });
  test('short circuit defaults to orange (shortColor)', () => {
    expect(cb.encode(cb.getCommand('flthy.led.shortcircuit'), { designator: 'A' }, {})).toBe('A0057');
  });
  test('clear/auto uses longest-code-first so 3-digit modes win', () => {
    expect(cb.encode(cb.getCommand('flthy.led.clearauto'), { designator: 'A', mode: '96' }, {})).toBe('A096');
    expect(cb.match('A0971')).toMatchObject({ commandId: 'flthy.led.clearauto', params: { designator: 'A', mode: '971' } });
    expect(cb.match('A096')).toMatchObject({ commandId: 'flthy.led.clearauto', params: { designator: 'A', mode: '96' } });
  });
  test('clear/auto ignores a duration suffix (unsupported)', () => {
    // supportsDuration:false -> a trailing |n is not consumed, token falls through to raw
    expect(cb.match('A096|30')).toBeNull();
  });
});

describe('FlthyHPs servo', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('preset position carries a position and round-trips', () => {
    expect(cb.encode(cb.getCommand('flthy.servo.preset'), { designator: 'F', position: '1' }, {})).toBe('F1011');
    expect(cb.match('F1011')).toMatchObject({ commandId: 'flthy.servo.preset', params: { designator: 'F', position: '1' } });
  });
  test('table semantics: 103 = RC Up/Down, 104 = Random (not the p.23 examples)', () => {
    expect(cb.match('F103')).toMatchObject({ commandId: 'flthy.servo.rc-ud', params: { designator: 'F' } });
    expect(cb.match('A104')).toMatchObject({ commandId: 'flthy.servo.random', params: { designator: 'A' } });
  });
  test('wag commands encode', () => {
    expect(cb.encode(cb.getCommand('flthy.servo.wag-lr'), { designator: 'F' }, {})).toBe('F105');
    expect(cb.encode(cb.getCommand('flthy.servo.wag-ud'), { designator: 'F' }, {})).toBe('F106');
  });
  test('auto twitch on/off and preset do not collide', () => {
    expect(cb.match('T199')).toMatchObject({ commandId: 'flthy.servo.autotwitch', params: { designator: 'T', mode: '99' } });
    expect(cb.match('A198')).toMatchObject({ commandId: 'flthy.servo.autotwitch', params: { designator: 'A', mode: '98' } });
    expect(cb.match('F1011')).toMatchObject({ commandId: 'flthy.servo.preset' }); // still preset, not autotwitch
  });
  test('servo commands ignore a duration suffix', () => {
    expect(cb.match('F104|30')).toBeNull();
  });
});

describe('FlthyHPs special sequences', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('special sequence encodes the raw S-code', () => {
    expect(cb.encode(cb.getCommand('flthy.special.sequence'), { special: 'S1' }, {})).toBe('S1');
    expect(cb.encode(cb.getCommand('flthy.special.sequence'), { special: 'S5' }, {})).toBe('S5');
  });
  test('special sequence round-trips', () => {
    expect(cb.match('S1')).toMatchObject({ commandId: 'flthy.special.sequence', params: { special: 'S1' } });
    expect(cb.buildWCBValue(cb.parseWCBValue('S9'))).toBe('S9');
  });
});

describe('Roam-A-Dome motion', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('encodes absolute rotate', () => {
    expect(cb.encode(cb.getCommand('rad.rotate.abs'), { deg: '90' }, {})).toBe(':DPA90');
  });
  test('signed spin and relative round-trip', () => {
    expect(cb.match(':DPR-30')).toMatchObject({ commandId: 'rad.spin', params: { speed: '-30' } });
    expect(cb.match(':DPD-90')).toMatchObject({ commandId: 'rad.rotate.rel', params: { deg: '-90' } });
  });
  test('A-form disambiguation (abs / ramp / random)', () => {
    expect(cb.match(':DPA90')).toMatchObject({ commandId: 'rad.rotate.abs', params: { deg: '90' } });
    expect(cb.match(':DPA90,20,100')).toMatchObject({ commandId: 'rad.rotate.absRamp', params: { deg: '90', speed: '20', maxspeed: '100' } });
    expect(cb.match(':DPAR')).toMatchObject({ commandId: 'rad.rotate.absRandom' });
  });
  test('wait vs wait-random split', () => {
    expect(cb.match(':DPW2')).toMatchObject({ commandId: 'rad.wait', params: { seconds: '2' } });
    expect(cb.match(':DPWR10,20')).toMatchObject({ commandId: 'rad.waitRandom', params: { min: '10', max: '20' } });
  });
  test('does not collide with r2uppityspinner-alt (:P vs :DP)', () => {
    expect(cb.match(':PR-80')).toMatchObject({ commandId: 'uppity.rotary.spin', params: { speed: '-80' } });
    expect(cb.match(':DPR-80')).toMatchObject({ commandId: 'rad.spin', params: { speed: '-80' } });
  });
});

describe('Roam-A-Dome config', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('no-arg and numeric encode', () => {
    expect(cb.encode(cb.getCommand('rad.cfg.zero'), {}, {})).toBe('#DPZERO');
    expect(cb.encode(cb.getCommand('rad.cfg.maxspeed'), { value: '50' }, {})).toBe('#DPMAXSPEED50');
  });
  test('on/off enum and baud enum', () => {
    expect(cb.match('#DPINVERT1')).toMatchObject({ commandId: 'rad.cfg.invert', params: { state: '1' } });
    expect(cb.match('#DPSERIALBAUD9600')).toMatchObject({ commandId: 'rad.cfg.serialbaud', params: { baud: '9600' } });
  });
  test('packed pin digits', () => {
    expect(cb.encode(cb.getCommand('rad.cfg.pin'), { pin: '1', value: '0' }, {})).toBe('#DPPIN10');
    expect(cb.match('#DPPIN10')).toMatchObject({ commandId: 'rad.cfg.pin', params: { pin: '1', value: '0' } });
  });
  test('shared-prefix disambiguation: D / DEBUG / DSCALE', () => {
    expect(cb.match('#DPD0')).toMatchObject({ commandId: 'rad.cfg.deleteSeq', params: { slot: '0' } });
    expect(cb.match('#DPDEBUG1')).toMatchObject({ commandId: 'rad.cfg.debug', params: { state: '1' } });
    expect(cb.match('#DPDSCALE100')).toMatchObject({ commandId: 'rad.cfg.dscale', params: { value: '100' } });
  });
  test('shared-prefix disambiguation: SYRENADDR vs SYRENADDRIN', () => {
    expect(cb.match('#DPSYRENADDR129')).toMatchObject({ commandId: 'rad.cfg.syrenaddr', params: { value: '129' } });
    expect(cb.match('#DPSYRENADDRIN129')).toMatchObject({ commandId: 'rad.cfg.syrenaddrin', params: { value: '129' } });
  });
  test('shared-prefix disambiguation: HOME family + HOMEPOS split', () => {
    expect(cb.match('#DPHOME1')).toMatchObject({ commandId: 'rad.cfg.home', params: { state: '1' } });
    expect(cb.match('#DPHOMESPEED40')).toMatchObject({ commandId: 'rad.cfg.homespeed', params: { value: '40' } });
    expect(cb.match('#DPHOMEPOS')).toMatchObject({ commandId: 'rad.cfg.homePosHere' });
    expect(cb.match('#DPHOMEPOS90')).toMatchObject({ commandId: 'rad.cfg.homePos', params: { deg: '90' } });
  });
  test('does not collide with uppity (#DP vs #P)', () => {
    expect(cb.match('#PD0')).toMatchObject({ commandId: 'uppity.cfg.deleteSeq' });
    expect(cb.match('#DPD0')).toMatchObject({ commandId: 'rad.cfg.deleteSeq' });
  });
});

describe('build/parse + round-trip', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('buildWCBValue joins steps and emits labels', () => {
    const v = cb.buildWCBValue([
      { type: 'command', commandId: 'flthy.led.rainbow', params: { designator: 'A' }, label: ' Flthy rainbow' },
      { type: 'delay', ms: 500 },
      { type: 'command', commandId: 'mp.mode', params: { mode: '52' } },
    ]);
    expect(v).toBe('A007^*** Flthy rainbow^;t500^T52');
  });

  test('parseWCBValue recognizes commands, raw, and labels', () => {
    const steps = cb.parseWCBValue('A007^*** Flthy rainbow^<XYZ>^*** raw note');
    expect(steps[0]).toMatchObject({ type: 'command', commandId: 'flthy.led.rainbow', label: ' Flthy rainbow' });
    expect(steps[1]).toMatchObject({ type: 'raw', text: '<XYZ>', label: ' raw note' });
  });

  test('round-trips every fixture macro byte-identically', () => {
    const macros = require('./fixtures/commands.sample.json');
    for (const m of macros) {
      expect(cb.buildWCBValue(cb.parseWCBValue(m.value))).toBe(m.value);
    }
  });

  test('round-trips a bare *** comment fragment (empty label) losslessly', () => {
    const v = 'A007^***';
    expect(cb.buildWCBValue(cb.parseWCBValue(v))).toBe(v);
  });
});

describe('rseries-le encoder', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('encodes a broadcast effect', () => {
    expect(cb.encode(cb.getCommand('rseries.effect'),
      { effect: '1', color: '0', speed: '5', seconds: '90', target: '' }, {})).toBe('~RTLE10590');
  });
  test('encodes a targeted effect with 6-digit padding', () => {
    expect(cb.encode(cb.getCommand('rseries.effect'),
      { effect: '5', color: '1', speed: '0', seconds: '0', target: '1' }, {})).toBe('~RTLE1051000');
  });
  test('decodes a broadcast token', () => {
    expect(cb.match('~RTLE213000')).toMatchObject({ commandId: 'rseries.effect',
      params: { effect: '21', color: '3', speed: '0', seconds: '0', target: '' } });
  });
  test('decodes a targeted token (body >= 9 -> first digit is id)', () => {
    expect(cb.match('~RTLE1051000')).toMatchObject({ commandId: 'rseries.effect',
      params: { effect: '5', color: '1', speed: '0', seconds: '0', target: '1' } });
  });
  test('rseries broadcast canonicalizes leading zeros (firmware-equivalent)', () => {
    expect(cb.buildWCBValue(cb.parseWCBValue('~RTLE051000'))).toBe('~RTLE51000');
  });
  test('rseries refuses to broadcast a custom effect (must target a display)', () => {
    expect(() => cb.encode(cb.getCommand('rseries.effect'),
      { effect: '100', color: '0', speed: '0', seconds: '0', target: '' }, {})).toThrow();
  });
});

describe('wcb-verb books', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('HCR stimulus encodes', () => {
    expect(cb.encode(cb.getCommand('hcr.stim'), { emotion: 'H', strength: 'STRONG' }, {})).toBe(';H,STIM,H,STRONG');
  });
  test('Maestro trigger encodes', () => {
    expect(cb.encode(cb.getCommand('maestro.trigger'), { id: '1', seq: '1' }, {})).toBe(';M11');
  });
  test('Maestro trigger decodes adjacent single-char params', () => {
    expect(cb.match(';M11')).toMatchObject({ commandId: 'maestro.trigger', params: { id: '1', seq: '1' } });
  });
  test('Maestro trigger round-trips', () => {
    expect(cb.buildWCBValue(cb.parseWCBValue(';M11'))).toBe(';M11');
  });
  test('HCR play round-trips', () => {
    expect(cb.buildWCBValue(cb.parseWCBValue(';H,PLAY,B,9'))).toBe(';H,PLAY,B,9');
  });
});

describe('PSIPro book', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });
  test('PSI front mode encodes with address prefix', () => {
    expect(cb.encode(cb.getCommand('psi.mode'), { address: '4', mode: '92' }, {})).toBe('4T92');
  });
  test('PSI mode round-trips with duration', () => {
    expect(cb.buildWCBValue(cb.parseWCBValue('4T17|3'))).toBe('4T17|3');
  });
  test('PSI mode decodes (disambiguated from MagicPanel)', () => {
    expect(cb.match('4T92')).toMatchObject({ commandId: 'psi.mode', params: { address: '4', mode: '92' } });
    expect(cb.match('4T17|3')).toMatchObject({ commandId: 'psi.mode', params: { address: '4', mode: '17' }, duration: 3 });
  });
  test('MagicPanel T{mode} is NOT mis-recognized as PSI', () => {
    expect(cb.match('T52')).toMatchObject({ commandId: 'mp.mode', params: { mode: '52' } });
  });
});

describe('hcr-native book', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('stimulus encodes wrapped', () => {
    expect(cb.encode(cb.getCommand('hcr.native.stimulus'), { emotion: 'H', intensity: '1' }, {})).toBe('<SH1>');
  });
  test('overload (no params) encodes', () => {
    expect(cb.encode(cb.getCommand('hcr.native.overload'), {}, {})).toBe('<SE>');
  });
  test('WAV file number zero-pads to 4 digits', () => {
    expect(cb.encode(cb.getCommand('hcr.native.playWav'), { channel: 'A', file: '25' }, {})).toBe('<CA0025>');
  });
  test('random WAV pads both file numbers', () => {
    expect(cb.encode(cb.getCommand('hcr.native.playWavRandom'), { channel: 'B', fileFrom: '3', fileTo: '185' }, {})).toBe('<CB0003C0185>');
  });
  test('volume + setEmotion encode', () => {
    expect(cb.encode(cb.getCommand('hcr.native.volume'), { target: 'V', level: '100' }, {})).toBe('<PVV100>');
    expect(cb.encode(cb.getCommand('hcr.native.setEmotion'), { emotion: 'H', value: '50' }, {})).toBe('<OH50>');
  });
  test('decodes a stimulus (S is both prefix and Sad emotion)', () => {
    expect(cb.match('<SS0>')).toMatchObject({ commandId: 'hcr.native.stimulus', params: { emotion: 'S', intensity: '0' } });
  });
  test('overload is not mis-read as a stimulus', () => {
    expect(cb.match('<SE>')).toMatchObject({ commandId: 'hcr.native.overload' });
  });
  test('WAV vs random-WAV disambiguation', () => {
    expect(cb.match('<CA0025>')).toMatchObject({ commandId: 'hcr.native.playWav', params: { channel: 'A', file: '0025' } });
    expect(cb.match('<CB0003C0185>')).toMatchObject({ commandId: 'hcr.native.playWavRandom', params: { channel: 'B', fileFrom: '0003', fileTo: '0185' } });
  });
  test('O-family disambiguation (mode / override / reset / setEmotion)', () => {
    expect(cb.match('<OA1>')).toMatchObject({ commandId: 'hcr.native.canonMode', params: { mode: '1' } });
    expect(cb.match('<O1>')).toMatchObject({ commandId: 'hcr.native.personalityOverride', params: { state: '1' } });
    expect(cb.match('<OR>')).toMatchObject({ commandId: 'hcr.native.resetEmotions' });
    expect(cb.match('<OM100>')).toMatchObject({ commandId: 'hcr.native.setEmotion', params: { emotion: 'M', value: '100' } });
  });
  test('muse-family disambiguation (state / single / gaps)', () => {
    expect(cb.match('<M1>')).toMatchObject({ commandId: 'hcr.native.muse', params: { state: '1' } });
    expect(cb.match('<MT>')).toMatchObject({ commandId: 'hcr.native.muse', params: { state: 'T' } });
    expect(cb.match('<MM>')).toMatchObject({ commandId: 'hcr.native.museSingle' });
    expect(cb.match('<MN5>')).toMatchObject({ commandId: 'hcr.native.museMinGap', params: { seconds: '5' } });
  });
  test('record + stop/volume disambiguation', () => {
    expect(cb.match('<R0>')).toMatchObject({ commandId: 'hcr.native.memoryMode', params: { mode: '0' } });
    expect(cb.match('<RRP3>')).toMatchObject({ commandId: 'hcr.native.memoryPlay', params: { slot: '3' } });
    expect(cb.match('<PSV>')).toMatchObject({ commandId: 'hcr.native.stop', params: { target: 'V' } });
    expect(cb.match('<PVV100>')).toMatchObject({ commandId: 'hcr.native.volume', params: { target: 'V', level: '100' } });
  });
  test('query decodes (longest-first enum: EH before E)', () => {
    expect(cb.match('<QEH>')).toMatchObject({ commandId: 'hcr.native.query', params: { query: 'EH' } });
    expect(cb.match('<QE>')).toMatchObject({ commandId: 'hcr.native.query', params: { query: 'E' } });
  });
  test('round-trips real single-container HCR macros', () => {
    for (const v of ['<SH0>', '<SE>', '<M1>', '<CA0001>', '<CB0009>', '<PVV100>', '<OH50>', '<QEH>']) {
      expect(cb.buildWCBValue(cb.parseWCBValue(v))).toBe(v);
    }
  });
  test('comma-batched container survives losslessly as a raw step', () => {
    const v = '<M0,PSG,PSA,PSB>';
    expect(cb.buildWCBValue(cb.parseWCBValue(v))).toBe(v);
    expect(cb.parseWCBValue(v)[0].type).toBe('raw');
  });
});

describe('registerEncoder (custom board grammar)', () => {
  let cb;
  beforeEach(() => {
    cb = loadEngine();
    cb.registerEncoder('shout', {
      encode(cmd, params) { return '!' + String(params.text || '').toUpperCase(); },
      match(token) {
        const m = /^!([A-Z]+)$/.exec(token);
        return m ? { commandId: 'demo.shout', params: { text: m[1] } } : null;
      },
    });
    cb.loadLibrary({
      libraryVersion: '0.0.1', enums: {},
      components: [{
        id: 'demo', name: 'Demo Board', kind: 'device-native',
        commands: [{ id: 'demo.shout', name: 'Shout', encoder: 'shout', params: [{ name: 'text' }] }],
      }],
    });
  });
  test('encodes via the custom encoder', () => {
    expect(cb.encode(cb.getCommand('demo.shout'), { text: 'hi' }, {})).toBe('!HI');
  });
  test('parse uses the custom encoder match', () => {
    expect(cb.parseWCBValue('!HELLO')[0]).toMatchObject({ type: 'command', commandId: 'demo.shout', params: { text: 'HELLO' } });
  });
});

describe('chirp board', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('simple PLAY encodes, decodes, and round-trips', () => {
    expect(cb.encode(cb.getCommand('chirp.play'), { index: '5' }, {})).toBe('PLAY:5');
    expect(cb.match('PLAY:5')).toMatchObject({ commandId: 'chirp.play', params: { index: '5' } });
    expect(cb.buildWCBValue(cb.parseWCBValue('PLAY:5'))).toBe('PLAY:5');
  });

  test('full PLAY (index,bank,page,volume) encodes, decodes, and round-trips', () => {
    expect(cb.encode(cb.getCommand('chirp.play.full'),
      { index: '5', bank: '2', page: 'A', volume: '80' }, {})).toBe('PLAY:5,2,A,80');
    expect(cb.match('PLAY:5,2,A,80')).toMatchObject({
      commandId: 'chirp.play.full',
      params: { index: '5', bank: '2', page: 'A', volume: '80' },
    });
    expect(cb.buildWCBValue(cb.parseWCBValue('PLAY:5,2,A,80'))).toBe('PLAY:5,2,A,80');
  });

  test('the PLAY split disambiguates simple vs full by arity', () => {
    expect(cb.match('PLAY:5').commandId).toBe('chirp.play');
    expect(cb.match('PLAY:5,2,A,80').commandId).toBe('chirp.play.full');
  });

  test('CHRP sweep encodes, decodes, and round-trips', () => {
    expect(cb.encode(cb.getCommand('chirp.chirp'),
      { startHz: '200', endHz: '2000', durationMs: '500' }, {})).toBe('CHRP:200,2000,500');
    expect(cb.match('CHRP:200,2000,500')).toMatchObject({
      commandId: 'chirp.chirp',
      params: { startHz: '200', endHz: '2000', durationMs: '500' },
    });
    expect(cb.buildWCBValue(cb.parseWCBValue('CHRP:200,2000,500'))).toBe('CHRP:200,2000,500');
  });

  test('STOP:* (all streams) encodes, decodes, and round-trips', () => {
    expect(cb.encode(cb.getCommand('chirp.stop.stream'), { stream: '*' }, {})).toBe('STOP:*');
    expect(cb.match('STOP:*')).toMatchObject({ commandId: 'chirp.stop.stream', params: { stream: '*' } });
    expect(cb.buildWCBValue(cb.parseWCBValue('STOP:*'))).toBe('STOP:*');
  });

  test('STAT:5 encodes, decodes, and round-trips', () => {
    expect(cb.encode(cb.getCommand('chirp.stat'), { stream: '5' }, {})).toBe('STAT:5');
    expect(cb.match('STAT:5')).toMatchObject({ commandId: 'chirp.stat', params: { stream: '5' } });
    expect(cb.buildWCBValue(cb.parseWCBValue('STAT:5'))).toBe('STAT:5');
  });

  test('VOL:2,40 (stream volume) encodes, decodes, and round-trips', () => {
    expect(cb.encode(cb.getCommand('chirp.vol.stream'), { stream: '2', volume: '40' }, {})).toBe('VOL:2,40');
    expect(cb.match('VOL:2,40')).toMatchObject({ commandId: 'chirp.vol.stream', params: { stream: '2', volume: '40' } });
    expect(cb.buildWCBValue(cb.parseWCBValue('VOL:2,40'))).toBe('VOL:2,40');
  });
});

describe('AstroPixelsPlus config', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('wifi/remote enum encode + match', () => {
    expect(cb.encode(cb.getCommand('ap.cfg.wifi'), { state: '0' }, {})).toBe('#APWIFI0');
    expect(cb.match('#APREMOTE1')).toMatchObject({ commandId: 'ap.cfg.remote', params: { state: '1' } });
  });
  test('no-arg actions decode', () => {
    expect(cb.match('#APZERO')).toMatchObject({ commandId: 'ap.cfg.zero' });
    expect(cb.match('#APPAIR')).toMatchObject({ commandId: 'ap.cfg.pair' });
    expect(cb.match('#APUNPAIR')).toMatchObject({ commandId: 'ap.cfg.unpair' });
  });
  test('does not collide with roam-a-dome-config (#AP vs #DP)', () => {
    expect(cb.match('#APRESTART')).toMatchObject({ commandId: 'ap.cfg.restart' });
    expect(cb.match('#DPRESTART')).toMatchObject({ commandId: 'rad.cfg.restart' });
  });
});

describe('AstroPixelsPlus sound', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('play sound (bank + number) encode + match', () => {
    expect(cb.encode(cb.getCommand('ap.snd.play'), { bank: '5', nn: '12' }, {})).toBe('$512');
    expect(cb.match('$105')).toMatchObject({ commandId: 'ap.snd.play', params: { bank: '1', nn: '05' } });
  });
  test('single-char cues are case-sensitive and distinct', () => {
    expect(cb.match('$C')).toMatchObject({ commandId: 'ap.snd.cantinaMusic' });
    expect(cb.match('$c')).toMatchObject({ commandId: 'ap.snd.beepCantina' });
    expect(cb.match('$M')).toMatchObject({ commandId: 'ap.snd.march' });
    expect(cb.match('$m')).toMatchObject({ commandId: 'ap.snd.volMid' });
  });
  test('volume +/- symbols decode', () => {
    expect(cb.match('$+')).toMatchObject({ commandId: 'ap.snd.volUp' });
    expect(cb.match('$-')).toMatchObject({ commandId: 'ap.snd.volDown' });
  });
  test('a single-letter cue does not match the bank-play grammar', () => {
    expect(cb.match('$R')).toMatchObject({ commandId: 'ap.snd.random' });
  });
});

describe('AstroPixelsPlus PSI', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('effect encodes with address + effect', () => {
    expect(cb.encode(cb.getCommand('ap.psi.effect'), { addr: '1', effect: '6' }, {})).toBe('@1P6');
  });
  test('longest-code-first: P11 (March) vs P1 (Normal)', () => {
    expect(cb.match('@0P11')).toMatchObject({ commandId: 'ap.psi.effect', params: { addr: '0', effect: '11' } });
    expect(cb.match('@1P1')).toMatchObject({ commandId: 'ap.psi.effect', params: { addr: '1', effect: '1' } });
  });
});

describe('AstroPixelsPlus logics', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('effect + font encode', () => {
    expect(cb.encode(cb.getCommand('ap.logic.effect'), { addr: '0', effect: '11' }, {})).toBe('@0T11');
    expect(cb.encode(cb.getCommand('ap.logic.font'), { addr: '3', font: '61' }, {})).toBe('@3P61');
  });
  test('font (@xP60/61) does NOT collide with PSI (@xP1..P11)', () => {
    expect(cb.match('@1P60')).toMatchObject({ commandId: 'ap.logic.font', params: { addr: '1', font: '60' } });
    expect(cb.match('@1P1')).toMatchObject({ commandId: 'ap.psi.effect' });          // PSI, not logic font
    expect(cb.match('@3P60')).toMatchObject({ commandId: 'ap.logic.font', params: { addr: '3', font: '60' } }); // addr 3 = logic-only
    expect(cb.match('@0P11')).toMatchObject({ commandId: 'ap.psi.effect' });          // addr 0 = PSI-only
  });
  test('scroll-text is free-text (unbounded) and does not collide', () => {
    expect(cb.encode(cb.getCommand('ap.logic.text'), { addr: '1', text: 'HELLO' }, {})).toBe('@1MHELLO');
  });
});

describe('AstroPixelsPlus sequences', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('sequence encode + match across both ranges', () => {
    expect(cb.encode(cb.getCommand('ap.seq.play'), { seq: '01' }, {})).toBe(':SE01');
    expect(cb.match(':SE57')).toMatchObject({ commandId: 'ap.seq.play', params: { seq: '57' } });
    expect(cb.match(':SE00')).toMatchObject({ commandId: 'ap.seq.play', params: { seq: '00' } });
  });
  test('does not collide with :DP (motion) or :P (uppity)', () => {
    expect(cb.match(':SE01')).toMatchObject({ commandId: 'ap.seq.play' });
    expect(cb.match(':DPH')).toMatchObject({ commandId: 'rad.home' });
    expect(cb.match(':PH')).toMatchObject({ commandId: 'uppity.lifter.home' });
  });
});

describe('AstroPixelsPlus holo', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('native LED effects encode with AstroPixels numbering (05=solid, 06=rainbow, 07=short)', () => {
    expect(cb.encode(cb.getCommand('ap.hp.native.leia'), { dev: 'F' }, {})).toBe('@HPF001');
    expect(cb.encode(cb.getCommand('ap.hp.native.solid'), { dev: 'F' }, {})).toBe('@HPF0051');       // color default 1
    expect(cb.encode(cb.getCommand('ap.hp.native.rainbow'), { dev: 'F' }, {})).toBe('@HPF006');
    expect(cb.encode(cb.getCommand('ap.hp.native.shortcircuit'), { dev: 'F' }, {})).toBe('@HPF0070'); // color default 0
  });

  test('clear/auto vs leia disambiguation', () => {
    expect(cb.match('@HPA096')).toMatchObject({ commandId: 'ap.hp.native.clearauto', params: { dev: 'A', mode: '96' } });
    expect(cb.match('@HPA001')).toMatchObject({ commandId: 'ap.hp.native.leia', params: { dev: 'A' } });
  });

  test('servo preset vs autotwitch disambiguation', () => {
    expect(cb.match('@HPF1011')).toMatchObject({ commandId: 'ap.hp.native.preset', params: { dev: 'F', position: '1' } });
    expect(cb.match('@HPF199')).toMatchObject({ commandId: 'ap.hp.native.autotwitch', params: { dev: 'F', mode: '99' } });
  });

  test('sequence mode encodes and round-trips', () => {
    expect(cb.encode(cb.getCommand('ap.hp.native.sequence'), { seq: 'S1' }, {})).toBe('@HPS1');
    expect(cb.match('@HPS1')).toMatchObject({ commandId: 'ap.hp.native.sequence', params: { seq: 'S1' } });
  });

  test('native LED duration round-trips (@HPA006|30)', () => {
    expect(cb.match('@HPA006|30')).toMatchObject({ commandId: 'ap.hp.native.rainbow', params: { dev: 'A' }, duration: 30 });
    expect(cb.buildWCBValue(cb.parseWCBValue('@HPA006|30'))).toBe('@HPA006|30');
  });

  test('friendly aliases encode and decode (*ON01, *HP401, *HRSR)', () => {
    expect(cb.encode(cb.getCommand('ap.hp.on'), { dev: '01' }, {})).toBe('*ON01');
    expect(cb.match('*ON01')).toMatchObject({ commandId: 'ap.hp.on', params: { dev: '01' } });
    expect(cb.match('*HP401')).toMatchObject({ commandId: 'ap.hp.position', params: { pos: '4', dev: '01' } });
    expect(cb.match('*HRSR')).toMatchObject({ commandId: 'ap.hp.radar', params: { mode: 'R' } });
  });

  test('legacy holo and cross-board non-collision (@6T1 vs @1T1/@1P1)', () => {
    expect(cb.match('@6T1')).toMatchObject({ commandId: 'ap.hp.legacyOn', params: { ldev: '6' } });
    expect(cb.match('@1T1')).toMatchObject({ commandId: 'ap.logic.effect' });
    expect(cb.match('@1P1')).toMatchObject({ commandId: 'ap.psi.effect' });
  });
});

describe('AstroPixelsPlus panels', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('fixed macro encode + match', () => {
    expect(cb.encode(cb.getCommand('ap.panel.macro'), { action: 'OP', group: '00' }, {})).toBe(':OP00');
    expect(cb.match(':CL12')).toMatchObject({ commandId: 'ap.panel.macro', params: { action: 'CL', group: '12' } });
  });
  test('dynamic ($hex) encodes and is distinct from a fixed macro', () => {
    expect(cb.encode(cb.getCommand('ap.panel.dynamic'), { code: 'OP', rest: '4000' }, {})).toBe(':OP$4000');
    expect(cb.match(':OP$4000')).toMatchObject({ commandId: 'ap.panel.dynamic', params: { code: 'OP', rest: '4000' } });
    expect(cb.match(':OP00')).toMatchObject({ commandId: 'ap.panel.macro' });            // digit after code -> fixed
  });
  test('longer dynamic codes win (OCL/OWC before OC/OW)', () => {
    expect(cb.match(':OCL$8')).toMatchObject({ commandId: 'ap.panel.dynamic', params: { code: 'OCL', rest: '8' } });
    expect(cb.match(':OC$8')).toMatchObject({ commandId: 'ap.panel.dynamic', params: { code: 'OC', rest: '8' } });
  });
  test('does not collide with :DP (motion), :P (uppity), or :SE (sequences)', () => {
    expect(cb.match(':OP00')).toMatchObject({ commandId: 'ap.panel.macro' });
    expect(cb.match(':DPH')).toMatchObject({ commandId: 'rad.home' });
    expect(cb.match(':SE01')).toMatchObject({ commandId: 'ap.seq.play' });
  });
});

describe('AstroPixelsPlus servo', () => {
  let cb;
  beforeEach(() => { cb = loadEngine(); loadCatalog(cb); });

  test('SM variants disambiguate by argument count', () => {
    expect(cb.match(':SM0,1500')).toMatchObject({ commandId: 'ap.servo.move', params: { index: '0', pulse: '1500' } });
    expect(cb.match(':SM0,1000,1500')).toMatchObject({ commandId: 'ap.servo.moveTimed', params: { index: '0', moveTime: '1000', pulse: '1500' } });
    expect(cb.match(':SM0,500,1000,1500')).toMatchObject({ commandId: 'ap.servo.moveDelayed' });
    expect(cb.match(':SM0,500,1000,1000,2000')).toMatchObject({ commandId: 'ap.servo.moveFrom' });
  });
  test('SL variants disambiguate by argument count', () => {
    expect(cb.match(':SL0,1000,2000')).toMatchObject({ commandId: 'ap.servo.limits3' });
    expect(cb.match(':SL0,1000,2000,1500')).toMatchObject({ commandId: 'ap.servo.limits4' });
    expect(cb.match(':SL0,1000,2000,1500,7')).toMatchObject({ commandId: 'ap.servo.limits5', params: { group: '7' } });
  });
  test('SQ quick move and SF easing', () => {
    expect(cb.encode(cb.getCommand('ap.servo.quickMove'), { index: '0', pulse: '1500' }, {})).toBe(':SQ0,1500');
    expect(cb.encode(cb.getCommand('ap.servo.easing'), { easingId: '26', group: '3F' }, {})).toBe(':SF26$3F');
    expect(cb.match(':SF0$4000')).toMatchObject({ commandId: 'ap.servo.easing', params: { easingId: '0', group: '4000' } });
  });
  test('does not collide with :SE (sequences) or :OP (panels)', () => {
    expect(cb.match(':SM0,1500')).toMatchObject({ commandId: 'ap.servo.move' });
    expect(cb.match(':SE01')).toMatchObject({ commandId: 'ap.seq.play' });
    expect(cb.match(':OP00')).toMatchObject({ commandId: 'ap.panel.macro' });
  });
});
