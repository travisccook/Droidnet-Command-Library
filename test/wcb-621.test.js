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
