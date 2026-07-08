// Expanded PSIPro + RSeries Logic command sets (spec 2026-07-07-psipro-rseries-command-sets-design).
// These assert the FULL command set, the corrected mode labels, and — critically —
// that each new example parses back to its OWN command id (the generic @…/#…/single-letter
// tokens must not be claimed by another board earlier in the catalog).
const { readCatalog } = require('../src/load-node.js');
function loadEngine() { jest.resetModules(); return require('../src/droidnet-command-library.js'); }

describe('PSIPro expanded command set', () => {
  let cb;
  beforeEach(() => {
    cb = loadEngine();
    const { manifest, boards } = readCatalog();
    cb.loadLibrary(boards.map(b => JSON.parse(JSON.stringify(b))), { libraryVersion: manifest.libraryVersion });
  });

  test('exposes the full T/A/D/P command set', () => {
    const ids = cb.getCommands('psi-pro').map(c => c.id);
    expect(ids).toEqual(expect.arrayContaining([
      'psi.mode', 'psi.swipe', 'psi.default',
      'psi.cfg.alwaysOn', 'psi.cfg.brightSource', 'psi.cfg.brightSave', 'psi.cfg.brightTemp',
    ]));
  });

  test('mode enum is corrected and complete (23 values; 1=Swipe, 3=Alarm)', () => {
    const mode = cb.getEnum('psi.mode');
    expect(mode.values).toHaveLength(23); // 0-21 (22) + 92
    const byCode = Object.fromEntries(mode.values.map(v => [v.code, v.label]));
    expect(byCode['1']).toBe('Swipe (Default)');
    expect(byCode['3']).toBe('Alarm');
    expect(byCode['18']).toBe('Solid Green');
    expect(byCode['92']).toBe('VU Meter');
  });

  test('each new example parses to its own command id', () => {
    expect(cb.parseWCBValue('0T11|47')[0]).toMatchObject({ commandId: 'psi.mode', params: { address: '0', mode: '11' }, duration: 47 });
    expect(cb.parseWCBValue('4A')[0]).toMatchObject({ commandId: 'psi.swipe', params: { address: '4' } });
    expect(cb.parseWCBValue('5D')[0]).toMatchObject({ commandId: 'psi.default', params: { address: '5' } });
    expect(cb.parseWCBValue('0P1')[0]).toMatchObject({ commandId: 'psi.cfg.alwaysOn', params: { onoff: '1' } });
    expect(cb.parseWCBValue('1P1')[0]).toMatchObject({ commandId: 'psi.cfg.brightSource', params: { source: '1' } });
    expect(cb.parseWCBValue('2P150')[0]).toMatchObject({ commandId: 'psi.cfg.brightSave', params: { level: '150' } });
    expect(cb.parseWCBValue('3P0')[0]).toMatchObject({ commandId: 'psi.cfg.brightTemp', params: { level: '0' } });
  });

  test('examples round-trip byte-identical', () => {
    for (const ex of ['0T18', '4T92', '0T11|47', '4A', '5D', '0P1', '1P1', '2P200', '3P100']) {
      expect(cb.buildWCBValue(cb.parseWCBValue(ex))).toBe(ex);
    }
  });

  test('new commands render descriptive comments', () => {
    expect(cb.renderCommentLabel(cb.getCommand('psi.swipe'), { address: '4' })).toBe('PSI Front — Standard Swipe');
    expect(cb.renderCommentLabel(cb.getCommand('psi.cfg.brightSave'), { level: '150' })).toBe('PSI brightness 150 (saved)');
  });
});

describe('RSeries Logic expanded command set', () => {
  let cb;
  beforeEach(() => {
    cb = loadEngine();
    const { manifest, boards } = readCatalog();
    cb.loadLibrary(boards.map(b => JSON.parse(JSON.stringify(b))), { libraryVersion: manifest.libraryVersion });
  });

  // RSeries exposes the shared Marcduino text/font commands (@nM/@nP) IN ADDITION to
  // its Reeltwo-unique #LE set. The same @nM/@nP grammar also lives under
  // astropixels-logics — that duplication is intentional: a downstream host loads only
  // the boards its droid has, so each user's catalog is unambiguous. In OUR full
  // catalog the shared token resolves to the first board in manifest order, and
  // round-trip stays byte-identical either way.
  test('exposes text/font + the Reeltwo-unique config/system commands (effect unchanged)', () => {
    const ids = cb.getCommands('rseries-logic').map(c => c.id);
    expect(ids).toEqual(expect.arrayContaining([
      'rseries.effect', 'rseries.text', 'rseries.font',
      'rseries.cfg.wifi', 'rseries.cfg.remote', 'rseries.sys.restart', 'rseries.sys.zero',
    ]));
  });

  test('RSeries-unique #LE commands parse to their own id', () => {
    expect(cb.parseWCBValue('#LEWIFI1')[0]).toMatchObject({ commandId: 'rseries.cfg.wifi', params: { state: '1' } });
    expect(cb.parseWCBValue('#LEWIFI')[0]).toMatchObject({ commandId: 'rseries.cfg.wifi', params: { state: '' } });
    expect(cb.parseWCBValue('#LEREMOTE0')[0]).toMatchObject({ commandId: 'rseries.cfg.remote', params: { state: '0' } });
    expect(cb.parseWCBValue('#LERESTART')[0]).toMatchObject({ commandId: 'rseries.sys.restart' });
    expect(cb.parseWCBValue('#LEZERO')[0]).toMatchObject({ commandId: 'rseries.sys.zero' });
  });

  test('shared text/font commands encode from the RSeries board', () => {
    expect(cb.encode(cb.getCommand('rseries.text'), { address: '1', text: 'HELLO' }, {})).toBe('@1MHELLO');
    expect(cb.encode(cb.getCommand('rseries.font'), { address: '3', font: '61' }, {})).toBe('@3P61');
  });

  test('examples round-trip byte-identical', () => {
    for (const ex of ['@1MHELLO', '@3P61', '#LEWIFI1', '#LEWIFI', '#LEREMOTE0', '#LERESTART', '#LEZERO', '~RTLE51000']) {
      expect(cb.buildWCBValue(cb.parseWCBValue(ex))).toBe(ex);
    }
  });

  test('effect enum is left intact (verified-correct upstream)', () => {
    const eff = cb.getEnum('rseries.effect');
    const byCode = Object.fromEntries(eff.values.map(v => [v.code, v.label]));
    expect(byCode['5']).toBe('Solid Color');
    expect(byCode['105']).toBe('Color Wheel (custom)');
  });

  test('new commands render descriptive comments', () => {
    expect(cb.renderCommentLabel(cb.getCommand('rseries.cfg.wifi'), { state: '' })).toBe('Logics WiFi — Toggle');
    expect(cb.renderCommentLabel(cb.getCommand('rseries.cfg.remote'), { state: '1' })).toBe('Logics remote — On');
  });
});
