// WCB firmware 6.2.1 sweep guards (spec 2026-09-15-wcb-firmware-6.2.1-sweep-design).
//
// (a) 4.2.0 freeze. test/fixtures/catalog-4.2.0-commands.json records every command id
//     published in 4.2.0 (commit 82b6a04) with its template and ordered param names. Stored
//     wire strings and host apps depend on both, so a minor/patch release may add ids and
//     tighten ranges/enums/patterns, but must not remove an id or change its template or
//     param names. Update this fixture only on a major release.
// (b) Every example on the WCB boards decodes to its OWN command. Matching is first-match-wins
//     in manifest order, so a greedy template (e.g. ?ALIAS,{name}) can silently claim a more
//     specific sibling (?ALIAS,CLEAR). test/web.test.js only checks that an example parses to
//     SOME command. Scoped to the WCB boards: the whole catalog is not self-matching today
//     (ap.logic.text / ap.logic.font examples decode as rseries.*).
// (c) wcb-verb examples fit the ETM limit of a mesh-routed command: 187 characters with the
//     checksum on (WCB 6.2.1 WCB.ino:216-223, ETM_MAX_CMD_WITH_CRC; the help text's "188" is
//     off by one).
//
// Board-specific assertions for the sweep are appended below the guards.
const { readCatalog } = require('../src/load-node.js');
const FROZEN_420 = require('./fixtures/catalog-4.2.0-commands.json');

function loadEngine() { jest.resetModules(); return require('../src/droidnet-command-library.js'); }

// Sanctioned template corrections to 4.2.0 ids (patch-class firmware fixes). Each entry pins
// both the frozen 4.2.0 template and the corrected one, plus the reason, so nothing else can
// change under cover of an allowlisted id. Param names stay frozen regardless.
//   'some.id': { from: '<4.2.0 template>', to: '<corrected template>', why: '<firmware ref>' },
const TEMPLATE_FIXES = {};

const WCB_BOARDS = ['maestro', 'wcb-hcr', 'wcb-mp3', 'wcb-wled', 'wcb-native', 'wcb-dfp'];
const ETM_MAX_CMD_WITH_CRC = 187;

describe('WCB 6.2.1 sweep guards', () => {
  let cb;
  beforeEach(() => {
    cb = loadEngine();
    const { manifest, boards } = readCatalog();
    cb.loadLibrary(boards.map(b => JSON.parse(JSON.stringify(b))), { libraryVersion: manifest.libraryVersion });
  });

  test('the 4.2.0 fixture is complete (397 commands)', () => {
    expect(Object.keys(FROZEN_420)).toHaveLength(397);
  });

  test('(a) every 4.2.0 id still resolves with the same template and ordered param names', () => {
    const drift = [];
    for (const [id, frozen] of Object.entries(FROZEN_420)) {
      const cmd = cb.getCommand(id);
      if (!cmd) { drift.push(`${id}: removed (was on ${frozen.board})`); continue; }
      const template = typeof cmd.template === 'string' ? cmd.template : null;
      const fix = TEMPLATE_FIXES[id];
      if (fix) {
        if (fix.from !== frozen.template) drift.push(`${id}: allowlist 'from' ${JSON.stringify(fix.from)} is not the 4.2.0 template ${JSON.stringify(frozen.template)}`);
        if (template !== fix.to) drift.push(`${id}: template ${JSON.stringify(template)} is not the allowlisted fix ${JSON.stringify(fix.to)}`);
      } else if (template !== frozen.template) {
        drift.push(`${id}: template ${JSON.stringify(frozen.template)} -> ${JSON.stringify(template)}`);
      }
      const params = (cmd.params || []).map(p => p.name);
      if (JSON.stringify(params) !== JSON.stringify(frozen.params)) {
        drift.push(`${id}: params ${JSON.stringify(frozen.params)} -> ${JSON.stringify(params)}`);
      }
    }
    expect(drift).toEqual([]);
  });

  test('(a) every template-fix allowlist entry names a frozen 4.2.0 id', () => {
    for (const id of Object.keys(TEMPLATE_FIXES)) expect(FROZEN_420).toHaveProperty([id]);
  });

  test('(b) every example on the WCB boards decodes to its own command', () => {
    const present = cb.getComponents().map(c => c.id).filter(id => WCB_BOARDS.includes(id));
    // Guard against a board rename silently emptying the scope; wcb-dfp arrives in 4.3.0.
    expect(present).toEqual(expect.arrayContaining(['maestro', 'wcb-hcr', 'wcb-mp3', 'wcb-wled', 'wcb-native']));
    const wrong = [];
    let checked = 0;
    for (const boardId of present) {
      for (const cmd of cb.getCommands(boardId)) {
        for (const ex of (cmd.examples || [])) {
          checked++;
          const hit = cb.match(ex);
          if (!hit || hit.commandId !== cmd.id) wrong.push(`${boardId} ${cmd.id}: ${ex} -> ${hit ? hit.commandId : 'no match'}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(wrong).toEqual([]);
  });

  test(`(c) wcb-verb examples fit the ${ETM_MAX_CMD_WITH_CRC}-character ETM limit`, () => {
    const verbBoards = cb.getComponents().filter(c => c.kind === 'wcb-verb');
    expect(verbBoards.length).toBeGreaterThan(0);
    const tooLong = [];
    for (const comp of verbBoards) {
      for (const cmd of cb.getCommands(comp.id)) {
        for (const ex of (cmd.examples || [])) {
          if (ex.length > ETM_MAX_CMD_WITH_CRC) tooLong.push(`${cmd.id}: ${ex.length} chars`);
        }
      }
    }
    expect(tooLong).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// maestro (A3): WCB 6.2 ;M comma verbs and get queries. Grammar: WCB 6.2.1 WCB.ino
// processMaestroCommand, WCB_Maestro.cpp sendMaestroServoVerb / handleMaestroGet, WcbCmd
// WcbMaestro::build. maestro-native is the bare NaviCore action grammar and shares no id.
describe('maestro: WCB 6.2 comma verbs and get queries', () => {
  let cb;
  let manifest;
  beforeEach(() => {
    cb = loadEngine();
    const cat = readCatalog();
    manifest = cat.manifest;
    cb.loadLibrary(cat.boards.map(b => JSON.parse(JSON.stringify(b))), { libraryVersion: manifest.libraryVersion });
  });

  const codes = (enumId) => cb.getEnum(enumId).values.map(v => v.code);

  test('maestro.id is 0-9 (0 = all, 9 = this WCB); get queries take 1-8 only', () => {
    expect(codes('maestro.id')).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(codes('maestro.queryId')).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    for (const id of ['maestro.wcb.getPosition', 'maestro.wcb.getMovingState', 'maestro.wcb.getErrors']) {
      expect(cb.getCommand(id).params.find(p => p.name === 'id').enum).toBe('maestro.queryId');
    }
  });

  test('Run Sequence keeps ;M{id}{seq}, accepts id 9 and subroutines up to 127', () => {
    expect(cb.match(';M11')).toMatchObject({ commandId: 'maestro.trigger', params: { id: '1', seq: '1' } });
    expect(cb.match(';M91')).toMatchObject({ commandId: 'maestro.trigger', params: { id: '9', seq: '1' } });
    expect(cb.match(';M0127')).toMatchObject({ commandId: 'maestro.trigger', params: { id: '0', seq: '127' } });
    expect(cb.getCommand('maestro.trigger').params.find(p => p.name === 'seq').max).toBe(127);
  });

  test('comma subroutine forms decode to their own ids', () => {
    expect(cb.match(';M1,5')).toMatchObject({ commandId: 'maestro.wcb.sub', params: { id: '1', sub: '5' } });
    expect(cb.match(';M3,5,1000')).toMatchObject({ commandId: 'maestro.wcb.subParam', params: { id: '3', sub: '5', param: '1000' } });
    expect(cb.match(';M2,sub,5')).toMatchObject({ commandId: 'maestro.wcb.subVerb', params: { id: '2', sub: '5' } });
    expect(cb.match(';M2,sub,5,1000')).toMatchObject({ commandId: 'maestro.wcb.subVerbParam', params: { id: '2', sub: '5', param: '1000' } });
  });

  test(';M2,goHome is the WCB verb; bare goHome stays on maestro-native (no shared id)', () => {
    const wcb = cb.match(';M2,goHome');
    const native = cb.match('goHome');
    expect(wcb).toMatchObject({ commandId: 'maestro.wcb.goHome', params: { id: '2' } });
    expect(native).toMatchObject({ commandId: 'maestro.goHome' });
    expect(cb.getCommand(wcb.commandId)._component.id).toBe('maestro');
    expect(cb.getCommand(native.commandId)._component.id).toBe('maestro-native');
    const wcbIds = new Set(cb.getCommands('maestro').map(c => c.id));
    expect(cb.getCommands('maestro-native').filter(c => wcbIds.has(c.id))).toEqual([]);
  });

  test('servo verbs encode with their defaults', () => {
    expect(cb.encode(cb.getCommand('maestro.wcb.setTarget'), { id: '1', channel: '0' })).toBe(';M1,setTarget,0,6000');
    expect(cb.match(';M5,setSpeed,3,10')).toMatchObject({ commandId: 'maestro.wcb.setSpeed', params: { id: '5', channel: '3', speed: '10' } });
    expect(cb.match(';M2,setAccel,0,5')).toMatchObject({ commandId: 'maestro.wcb.setAccel', params: { id: '2', channel: '0', accel: '5' } });
  });

  test('get queries reject the fan-out ids 0 and 9 (they stay raw)', () => {
    expect(cb.match(';M8,getErrors')).toMatchObject({ commandId: 'maestro.wcb.getErrors', params: { id: '8' } });
    expect(cb.match(';M2,getPosition,0')).toMatchObject({ commandId: 'maestro.wcb.getPosition', params: { id: '2', channel: '0' } });
    expect(cb.match(';M0,getMovingState')).toBeNull();
    expect(cb.match(';M9,getPosition,0')).toBeNull();
  });

  test('all 12 ;M{id}, commands are named "(WCB 6.2+)"; Run Sequence is not', () => {
    const comma = cb.getCommands('maestro').filter(c => c.template.startsWith(';M{id},'));
    expect(comma.map(c => c.id).sort()).toEqual([
      'maestro.wcb.getErrors', 'maestro.wcb.getMovingState', 'maestro.wcb.getPosition', 'maestro.wcb.goHome',
      'maestro.wcb.setAccel', 'maestro.wcb.setSpeed', 'maestro.wcb.setTarget', 'maestro.wcb.stopScript',
      'maestro.wcb.sub', 'maestro.wcb.subParam', 'maestro.wcb.subVerb', 'maestro.wcb.subVerbParam',
    ]);
    for (const c of comma) expect(c.name).toMatch(/ \(WCB 6\.2\+\)$/);
    expect(cb.getCommand('maestro.trigger').name).not.toMatch(/6\.2/);
  });

  test('component metadata: name matches the manifest, 6.2.1 firmware, notes cover the 6.1 hazard', () => {
    const comp = cb.getComponents().find(c => c.id === 'maestro');
    expect(comp.name).toBe('Maestro (WCB ;M verbs)');
    expect(manifest.boards.find(b => b.id === 'maestro').name).toBe(comp.name);
    expect(comp.firmware).toBe('WCB 6.2.1_021242RSEP2026');
    expect(comp.categories).toEqual(['Sequences', 'Movement', 'System']);
    expect(comp.routing.class).toBe('wcb-verb');
    expect(comp.routing.notes).toMatch(/subroutine 0/);
    expect(comp.routing.notes).toMatch(/1-8/);
  });
});

// ---- wcb-dfp: DFPlayer Mini ;D verbs (WCB 6.2+) --------------------------------------------
// Grammar and ranges: WcbCmd 0.8.0 DfPlayerCodec::handle (WcbDfPlayer.cpp:51-168), which WCB
// 6.2.1 links; dispatch WCB_DFP.cpp:69-91; host routing WCB.ino:6426-6428; help WCB_Help.cpp:566-593.
describe('wcb-dfp: DFPlayer Mini (;D, WCB 6.2+)', () => {
  let cb;
  beforeEach(() => {
    cb = loadEngine();
    const { manifest, boards } = readCatalog();
    cb.loadLibrary(boards.map(b => JSON.parse(JSON.stringify(b))), { libraryVersion: manifest.libraryVersion });
  });

  test('is listed right after wcb-mp3 and names WCB 6.2+ in the component and the manifest', () => {
    const { manifest } = readCatalog();
    const ids = manifest.boards.map(b => b.id);
    expect(ids.indexOf('wcb-dfp')).toBe(ids.indexOf('wcb-mp3') + 1);
    const comp = cb.getComponents().find(c => c.id === 'wcb-dfp');
    expect(comp).toMatchObject({ kind: 'wcb-verb', confidence: 'high', firmware: 'WCB 6.2.1_021242RSEP2026' });
    expect(comp.name).toBe('WCB · DFPlayer Mini (WCB 6.2+)');
    expect(manifest.boards.find(b => b.id === 'wcb-dfp').name).toBe(comp.name);
  });

  test('models the 21 verbs WCB 6.2.1 accepts, in order', () => {
    expect(cb.getCommands('wcb-dfp').map(c => c.template)).toEqual([
      ';D,PLAY,{track}', ';D,PLAY,{track},ONFIN,{key}',
      ';D,FOLDER,{folder},{track}', ';D,FOLDER,{folder},{track},ONFIN,{key}',
      ';D,MP3FOLDER,{track}', ';D,MP3FOLDER,{track},ONFIN,{key}',
      ';D,STOP', ';D,PAUSE', ';D,RESUME', ';D,NEXT', ';D,PREV', ';D,RANDOM',
      ';D,LOOP,{track}', ';D,LOOPALL,{state}', ';D,LOOPFOLDER,{folder}', ';D,EQ,{preset}',
      ';D,VOL,{volume}', ';D,VOLUP', ';D,VOLDN',
      ';D,RESET', ';D,STATUS',
    ]);
  });

  test('keeps the ids, templates and params of the DroidNet 2.2.0 dfp board', () => {
    const play = cb.getCommand('dfp.play');
    expect(play.template).toBe(';D,PLAY,{track}');
    expect(play.params).toEqual([expect.objectContaining({ name: 'track', type: 'int', min: 1, max: 2999 })]);
    expect(cb.getCommand('dfp.stop').template).toBe(';D,STOP');
    const vol = cb.getCommand('dfp.volume');
    expect(vol.template).toBe(';D,VOL,{volume}');
    expect(vol.params).toEqual([expect.objectContaining({ name: 'volume', type: 'int', min: 0, max: 30, default: 20 })]);
    expect(cb.encode(vol, {}, {})).toBe(';D,VOL,20');
  });

  test('ranges and enums follow DfPlayerCodec::handle', () => {
    const range = (id, name) => { const p = cb.getCommand(id).params.find(x => x.name === name); return [p.min, p.max]; };
    expect(range('dfp.folder', 'folder')).toEqual([1, 99]);
    expect(range('dfp.folder', 'track')).toEqual([1, 255]);
    expect(range('dfp.mp3Folder', 'track')).toEqual([1, 9999]);
    expect(range('dfp.loop', 'track')).toEqual([1, 2999]);
    expect(range('dfp.loopFolder', 'folder')).toEqual([1, 99]);
    expect(cb.getEnum('dfp.eq').values.map(v => v.code)).toEqual(['0', '1', '2', '3', '4', '5']);
    expect(cb.getEnum('dfp.loopAll').values.map(v => v.code)).toEqual(['0', '1']);
  });

  test('ONFIN callbacks decode to their own ids; the bare ,key form stays raw', () => {
    expect(cb.match(';D,PLAY,5')).toMatchObject({ commandId: 'dfp.play', params: { track: '5' } });
    expect(cb.match(';D,PLAY,5,ONFIN,done')).toMatchObject({ commandId: 'dfp.playCb', params: { track: '5', key: 'done' } });
    expect(cb.match(';D,FOLDER,1,5,ONFIN,done')).toMatchObject({ commandId: 'dfp.folderCb', params: { folder: '1', track: '5', key: 'done' } });
    expect(cb.match(';D,MP3FOLDER,3,ONFIN,done')).toMatchObject({ commandId: 'dfp.mp3FolderCb', params: { track: '3', key: 'done' } });
    expect(cb.match(';D,PLAY,5,done')).toBeNull();
    const v = ';D,PLAY,5,ONFIN,done^*** DFPlayer play+cb^;D,VOL,0';
    expect(cb.buildWCBValue(cb.parseWCBValue(v))).toBe(v);
  });

  test('LOOP / LOOPALL / LOOPFOLDER and VOL / VOLUP / VOLDN do not shadow each other', () => {
    expect(cb.match(';D,LOOP,5').commandId).toBe('dfp.loop');
    expect(cb.match(';D,LOOPALL,1').commandId).toBe('dfp.loopAll');
    expect(cb.match(';D,LOOPFOLDER,1').commandId).toBe('dfp.loopFolder');
    expect(cb.match(';D,VOL,20').commandId).toBe('dfp.volume');
    expect(cb.match(';D,VOLUP').commandId).toBe('dfp.volUp');
    expect(cb.match(';D,VOLDN').commandId).toBe('dfp.volDown');
  });

  test('only RESET is non-cosmetic', () => {
    const nonCosmetic = cb.getCommands('wcb-dfp').filter(c => c.safety !== 'cosmetic').map(c => `${c.id}:${c.safety}`);
    expect(nonCosmetic).toEqual(['dfp.reset:config']);
  });

  // ;D,DEVICE,<n> is documented (WCB_Help.cpp:581) but WCB 6.2.1 rejects it: processDFPCommand
  // strips the leading "D," (WCB_DFP.cpp:72-74), then DfPlayerCodec::handle strips an optional
  // leading 'D' again (WcbDfPlayer.cpp:54), so "DEVICE,2" reaches the verb table as "EVICE,2".
  // Add dfp.device (a minor) once a WcbCmd fix ships in WCB firmware.
  test(';D,DEVICE,<n> is not modeled while WCB 6.2.1 rejects it', () => {
    expect(cb.getCommand('dfp.device')).toBeNull();
    expect(cb.match(';D,DEVICE,2')).toBeNull();
  });
});

// wcb-hcr, wcb-mp3, wcb-wled (A5-A7).
describe('WCB 6.2.1: wcb-hcr / wcb-mp3 / wcb-wled', () => {
  const FW_621 = 'WCB 6.2.1_021242RSEP2026';
  let cb;
  let manifest;
  beforeEach(() => {
    cb = loadEngine();
    const cat = readCatalog();
    manifest = cat.manifest;
    cb.loadLibrary(cat.boards.map(b => JSON.parse(JSON.stringify(b))), { libraryVersion: manifest.libraryVersion });
  });
  const component = id => cb.getComponents().find(c => c.id === id);
  const param = (cmdId, name) => cb.getCommand(cmdId).params.find(p => p.name === name);

  describe('wcb-hcr', () => {
    test('is labelled for 6.2.1 and documents host routing (DroidNet matches /host/)', () => {
      const hcr = component('wcb-hcr');
      expect(hcr.firmware).toBe(FW_621);
      expect(hcr.routing.notes).toMatch(/host/i);
      expect(hcr.routing.notes).toMatch(/\?HCR,REMOTE,W<n>/);
    });

    test('TRIGGER sits beside STIM and decodes to its own command (WCB_HCR.cpp:290-299)', () => {
      expect(cb.encode(cb.getCommand('hcr.trigger'), { emotion: 'M', strength: 'MOD' }, {})).toBe(';H,TRIGGER,M,MOD');
      expect(cb.match(';H,TRIGGER,C,STRONG')).toMatchObject({ commandId: 'hcr.trigger', params: { emotion: 'C', strength: 'STRONG' } });
      expect(cb.match(';H,STIM,H,STRONG')).toMatchObject({ commandId: 'hcr.stim' });
    });

    test('VOL without a channel sets all channels (6.2+) and does not shadow the per-channel form', () => {
      expect(cb.getCommand('hcr.volAll').name).toMatch(/\(WCB 6\.2\+\)$/);
      expect(param('hcr.volAll', 'level')).toMatchObject({ min: 0, max: 100 });
      expect(cb.match(';H,VOL,60')).toMatchObject({ commandId: 'hcr.volAll', params: { level: '60' } });
      expect(cb.match(';H,VOL,A,80')).toMatchObject({ commandId: 'hcr.vol', params: { channel: 'A', level: '80' } });
    });

    test('VOLUP/VOLDN take an optional all-channel step (6.1.5 and 6.2.1, default 5)', () => {
      for (const [verb, stepId, bareId, chanId] of [
        ['VOLUP', 'hcr.volUpAllStep', 'hcr.volUpAll', 'hcr.volUp'],
        ['VOLDN', 'hcr.volDownAllStep', 'hcr.volDownAll', 'hcr.volDown'],
      ]) {
        const cmd = cb.getCommand(stepId);
        expect(cmd.name).not.toMatch(/6\.2/);
        expect(param(stepId, 'step')).toMatchObject({ min: 1, max: 100, default: 5 });
        expect(cb.encode(cmd, {}, {})).toBe(`;H,${verb},5`);
        expect(cb.match(`;H,${verb},10`)).toMatchObject({ commandId: stepId, params: { step: '10' } });
        expect(cb.match(`;H,${verb}`)).toMatchObject({ commandId: bareId });
        expect(cb.match(`;H,${verb},B,10`)).toMatchObject({ commandId: chanId, params: { channel: 'B', step: '10' } });
      }
    });

    test('FN takes only the firmware function codes (WcbHcr.cpp:7-36); template unchanged', () => {
      expect(cb.getCommand('hcr.fn').template).toBe(';H,FN,{fn},{chan},{track}');
      expect(param('hcr.fn', 'fn').enum).toBe('hcr.fnCode');
      expect(cb.getEnum('hcr.fnCode').values.map(v => v.code))
        .toEqual(['2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '13', '14', '16', '17', '18', '19']);
      // Codes the 6.1.5 FN switch lacks are flagged 6.2+.
      const newIn62 = cb.getEnum('hcr.fnCode').values.filter(v => /\(WCB 6\.2\+\)$/.test(v.label)).map(v => v.code);
      expect(newIn62).toEqual(['7', '10', '13', '18', '19']);
      expect(param('hcr.fn', 'chan')).toMatchObject({ min: 0, max: 99 });
      expect(param('hcr.fn', 'track')).toMatchObject({ min: 0, max: 9999 });
      expect(cb.match(';H,FN,14,1,5')).toMatchObject({ commandId: 'hcr.fn', params: { fn: '14', chan: '1', track: '5' } });
      expect(cb.match(';H,FN,7,30,60')).toMatchObject({ commandId: 'hcr.fn', params: { fn: '7', chan: '30', track: '60' } });
      expect(cb.match(';H,FN,19,0,10')).toMatchObject({ commandId: 'hcr.fn', params: { fn: '19' } });
      // 0, 1, 12 and 15 are rejected by the firmware, so they stay raw text.
      for (const code of ['0', '1', '12', '15']) expect(cb.match(`;H,FN,${code},0,0`)).toBeNull();
    });

    test('hcr.trigger, hcr.volAll, hcr.volUpAllStep, hcr.volDownAllStep are cosmetic', () => {
      for (const id of ['hcr.trigger', 'hcr.volAll', 'hcr.volUpAllStep', 'hcr.volDownAllStep']) {
        expect(cb.getCommand(id).safety).toBe('cosmetic');
      }
    });
  });

  describe('wcb-mp3', () => {
    test('is labelled for 6.2.1 and documents host routing', () => {
      const mp3 = component('wcb-mp3');
      expect(mp3.firmware).toBe(FW_621);
      expect(mp3.routing.notes).toMatch(/host/i);
      expect(mp3.routing.notes).toMatch(/\?MP3,REMOTE,W<n>/);
      expect(cb.match(';A,PLAY,1,ONFIN,wave')).toMatchObject({ commandId: 'mp3.playCb' });
    });
  });

  describe('wcb-wled', () => {
    test('the whole board is named for WCB 6.2+ in the component and the manifest', () => {
      const wled = component('wcb-wled');
      expect(wled.name).toBe('WCB · WLED Lighting (WCB 6.2+)');
      expect(manifest.boards.find(b => b.id === 'wcb-wled').name).toBe(wled.name);
      expect(wled.firmware).toBe(FW_621);
      expect(wled.routing.notes).toMatch(/187/);
    });

    test('presets start at 1 (WLED preset ids are 1-250)', () => {
      expect(param('wled.preset', 'preset')).toMatchObject({ min: 1, max: 250, default: 1 });
      expect(cb.match(';L1,PS,3')).toMatchObject({ commandId: 'wled.preset', params: { wledId: '1', preset: '3' } });
    });
  });
});

// ---- wcb-native (WCB (native config)) --------------------------------------------------------
// Ranges and grammars re-read from WCB 6.2.1 @ 66845b9a; 4.2.0 templates and param names stay frozen.
describe('wcb-native: WCB 6.2.1 ranges and grammar', () => {
  let cb;
  beforeEach(() => {
    cb = loadEngine();
    const { manifest, boards } = readCatalog();
    cb.loadLibrary(boards.map(b => JSON.parse(JSON.stringify(b))), { libraryVersion: manifest.libraryVersion });
  });
  const param = (id, name) => cb.getCommand(id).params.find(p => p.name === name);
  const codes = (enumId) => cb.getEnum(enumId).values.map(v => v.code);
  const roundTrips = (wire) => expect(cb.buildWCBValue(cb.parseWCBValue(wire))).toBe(wire);

  test('board is generated against 6.2.1', () => {
    expect(cb.getComponents().find(c => c.id === 'wcb-native').firmware).toBe('WCB 6.2.1_021242RSEP2026');
  });

  test('numeric ranges follow the firmware', () => {
    expect(param('wcb.num', 'n').max).toBe(20);            // WCB.ino:5298-5305, MAX_WCB_COUNT
    expect(param('wcb.qty', 'n').max).toBe(20);            // WCB_Storage.cpp:447-451
    expect(param('wcb.routeWcb', 'wcb').max).toBe(20);     // WCB.ino:6553-6566
    expect(param('wcb.timer', 'ms').max).toBe(1800000);    // command_timer.cpp:166
    expect(param('wcb.maestroClear', 'id').max).toBe(8);   // WCB_Maestro.cpp:817
    expect(param('wcb.etmMiss', 'count').max).toBe(100);   // WCB.ino:5211-5217
    expect(param('wcb.hcrPoll', 'sec').min).toBe(3);       // WCB_HCR.cpp:568-575
  });

  test(';S routes to S0 (USB) as well as S1-S5', () => {
    expect(codes(param('wcb.routeSerial', 'port').enum)).toEqual(['0', '1', '2', '3', '4', '5']);
    expect(cb.match(';S0,hello')).toEqual({ commandId: 'wcb.routeSerial', params: { port: '0', message: 'hello' } });
  });

  test('HCR port baud and GET fields are the firmware sets', () => {
    expect(codes(param('wcb.hcrPort', 'baud').enum)).toEqual(['9600', '19200', '38400', '57600', '115200']);
    expect(codes(param('wcb.hcrGet', 'field').enum)).toHaveLength(14);
    expect(cb.match('?HCR,GET,EMOTION,H')).toEqual({ commandId: 'wcb.hcrGet', params: { field: 'EMOTION,H' } });
    expect(cb.match('?HCR,GET,VOL,B')).toEqual({ commandId: 'wcb.hcrGet', params: { field: 'VOL,B' } });
    expect(cb.match('?HCR,GET,BOGUS')).toBeNull();
    expect(cb.match('?HCR,PORT,S1:256000')).toBeNull();
  });

  test('?MAESTRO spec is the M<id>:W<wcb>S<port>:<baud> list, not free text', () => {
    expect(cb.match('?MAESTRO,M1:W2S1:57600')).toEqual({ commandId: 'wcb.maestro', params: { spec: 'M1:W2S1:57600' } });
    expect(cb.match('?MAESTRO,M1:W1S2:115200,M2:W12S1:57600').commandId).toBe('wcb.maestro');
    const remote = cb.match('?MAESTRO,REMOTE');
    expect(remote && remote.commandId).not.toBe('wcb.maestro');
  });

  test('serial map destinations: comma list, S0-S5 / W1-20, per-destination R, and the ,R, raw source', () => {
    expect(cb.match('?MAP,SERIAL,S1,S2R,W12S0')).toEqual({ commandId: 'wcb.mapSerial', params: { port: '1', dest: 'S2R,W12S0' } });
    expect(cb.match('?MAP,SERIAL,S5,R,W3S2,W20S5R')).toEqual({ commandId: 'wcb.mapSerialRaw', params: { port: '5', dest: 'W3S2,W20S5R' } });
    // The ,R, literal belongs to mapSerialRaw only: a destination cannot start with R.
    const raw = cb.match('?MAP,SERIAL,S5,R,W3S2');
    expect(raw.commandId).toBe('wcb.mapSerialRaw');
    expect(cb.match('?MAP,SERIAL,S1,W21S1')).toBeNull();
    for (const w of ['?MAP,SERIAL,S1,S2R,W12S0', '?MAP,SERIAL,S5,R,W3S2,W20S5R']) roundTrips(w);
  });

  test('PWM map destinations: comma list of S1-S5 / W1-20S1-5', () => {
    expect(cb.match('?MAP,PWM,S1,S2,W20S5')).toEqual({ commandId: 'wcb.mapPwm', params: { port: '1', dest: 'S2,W20S5' } });
    expect(cb.match('?MAP,PWM,S1,S0')).toBeNull();
    roundTrips('?MAP,PWM,S1,S2,W20S5');
  });
});
