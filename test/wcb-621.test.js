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
