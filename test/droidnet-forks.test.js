// DroidNet fork boards (spec 2026-09-22-fork-brightness-and-library-design, section 4).
// Two device-native boards describe commands that only the DroidNet forks run:
//   droidnet-rseries-logic  rseries.cfg.brightness  #LEBRI{unit}{level}
//   droidnet-flthy-hps      flthy.led.brightness    H{unit}B{level}
// Each sits right after its stock board in the manifest; the stock boards are unchanged.
// web.test.js only checks that an example decodes to SOME command, so this suite checks
// that each example decodes to its OWN id with the expected params.
const { readCatalog } = require('../src/load-node.js');
function loadEngine() { jest.resetModules(); return require('../src/droidnet-command-library.js'); }

const FORKS = [
  {
    board: 'droidnet-rseries-logic', stock: 'rseries-logic',
    commandId: 'rseries.cfg.brightness', template: '#LEBRI{unit}{level}',
    examples: {
      '#LEBRI128': { unit: '', level: '128' },
      '#LEBRIF255': { unit: 'F', level: '255' },
      '#LEBRIR1': { unit: 'R', level: '1' }
    },
    levelOnly: '#LEBRI128'
  },
  {
    board: 'droidnet-flthy-hps', stock: 'flthy-hps',
    commandId: 'flthy.led.brightness', template: 'H{unit}B{level}',
    examples: {
      HAB128: { unit: 'A', level: '128' },
      HFB255: { unit: 'F', level: '255' },
      HTB1: { unit: 'T', level: '1' }
    },
    levelOnly: 'HAB128'
  }
];

describe('DroidNet fork boards', () => {
  let cb;
  let manifest;
  beforeEach(() => {
    cb = loadEngine();
    const catalog = readCatalog();
    manifest = catalog.manifest;
    cb.loadLibrary(catalog.boards.map(b => JSON.parse(JSON.stringify(b))), { libraryVersion: manifest.libraryVersion });
  });

  describe.each(FORKS)('$board', (fork) => {
    test('holds exactly the one brightness command, with the agreed template', () => {
      expect(cb.getCommands(fork.board).map(c => c.id)).toEqual([fork.commandId]);
      const cmd = cb.getCommand(fork.commandId);
      expect(cmd._component.id).toBe(fork.board);
      expect(cmd.template).toBe(fork.template);
      expect(cmd.encoder).toBe('template');
      expect(cmd.safety).toBe('cosmetic');
      expect(cmd.category).toBe('Lighting');
      expect(cmd.supportsDuration).toBe(false);
      expect(Object.keys(fork.examples)).toEqual(cmd.examples);
    });

    test('is a community, device-native board with no duration suffix', () => {
      const comp = cb.getComponents().find(c => c.id === fork.board);
      expect(comp.kind).toBe('device-native');
      expect(comp.confidence).toBe('community');
      expect(comp.routing.durationSuffix).toEqual({ supported: false });
    });

    test('level is a required int from 1 to 255 with no default; unit has a default', () => {
      const params = Object.fromEntries(cb.getCommand(fork.commandId).params.map(p => [p.name, p]));
      expect(Object.keys(params)).toEqual(['unit', 'level']);
      expect(params.level).toMatchObject({ type: 'int', min: 1, max: 255, required: true });
      expect(params.level).not.toHaveProperty('default');
      expect(params.unit).toHaveProperty('default');
    });

    test('each example parses to its own command id with the expected params', () => {
      for (const [ex, params] of Object.entries(fork.examples)) {
        const steps = cb.parseWCBValue(ex);
        expect([ex, steps.length]).toEqual([ex, 1]);
        expect(steps[0]).toMatchObject({ type: 'command', commandId: fork.commandId, params });
      }
    });

    test('each example round-trips byte-identically', () => {
      for (const ex of Object.keys(fork.examples)) {
        expect(cb.buildWCBValue(cb.parseWCBValue(ex))).toBe(ex);
      }
    });

    test('encoding with only a level uses the unit default (every unit)', () => {
      expect(cb.encode(cb.getCommand(fork.commandId), { level: '128' }, {})).toBe(fork.levelOnly);
    });

    test('a trailing |n is not taken as a duration', () => {
      expect(cb.parseWCBValue(fork.levelOnly + '|5')[0].type).toBe('raw');
    });

    test('the stock board does not carry the fork command', () => {
      expect(cb.getCommands(fork.stock).map(c => c.id)).not.toContain(fork.commandId);
    });

    test('sits directly after its stock board in the manifest', () => {
      const ids = manifest.boards.map(b => b.id);
      expect(ids.indexOf(fork.board)).toBe(ids.indexOf(fork.stock) + 1);
      expect(manifest.boards.find(b => b.id === fork.board)).toEqual({
        id: fork.board,
        file: `boards/${fork.board}.json`,
        name: cb.getComponents().find(c => c.id === fork.board).name,
        confidence: 'community'
      });
    });
  });

  test('comment labels name the unit and the level', () => {
    const logics = cb.getCommand('rseries.cfg.brightness');
    const holos = cb.getCommand('flthy.led.brightness');
    expect(cb.renderCommentLabel(logics, { unit: '', level: '128' })).toBe('Logics Both brightness 128');
    expect(cb.renderCommentLabel(logics, { unit: 'F', level: '255' })).toBe('Logics Front brightness 255');
    expect(cb.renderCommentLabel(holos, { unit: 'A', level: '128' })).toBe('Holos All brightness 128');
  });

  test('no lighting-engine (!) command is in the library', () => {
    const bang = [];
    for (const comp of cb.getComponents()) {
      for (const cmd of cb.getCommands(comp.id)) {
        if (typeof cmd.template === 'string' && cmd.template.startsWith('!')) bang.push(cmd.id);
      }
    }
    expect(bang).toEqual([]);
  });

  test('the rseries.effect codes still stop at 105 (no effect 106)', () => {
    const codes = cb.getEnum('rseries.effect').values.map(v => Number(v.code));
    expect(Math.max(...codes)).toBe(105);
  });
});
