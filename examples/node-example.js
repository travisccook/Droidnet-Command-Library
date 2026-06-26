/*
 * Minimal Node example — encode steps to a wire string and parse it back.
 * Run: node examples/node-example.js
 *
 * The wire format joins steps with '^'; '***' fragments are inline comment
 * labels; ';t<ms>' is a delay. This is exactly what the visual composer emits.
 */
'use strict';
const DroidNetCommandLibrary = require('../src/droidnet-command-library.js');
const lib = require('../libraries/droidnet-astromech.json');

DroidNetCommandLibrary.loadLibrary(lib);

// 1) Build a multi-step macro from structured steps.
const macro = DroidNetCommandLibrary.buildWCBValue([
  { type: 'command', commandId: 'flthy.led.rainbow', params: { designator: 'A' }, label: ' Flthy rainbow' },
  { type: 'delay', ms: 500 },
  { type: 'command', commandId: 'mp.mode', params: { mode: '52' }, label: ' MP VU meter' },
]);
console.log('built :', macro);
// built : A006^*** Flthy rainbow^;t500^T52^*** MP VU meter

// 2) Parse a wire string back into steps (round-trips byte-identically).
const steps = DroidNetCommandLibrary.parseWCBValue(macro);
console.log('steps :', JSON.stringify(steps.map(s => ({ type: s.type, id: s.commandId || s.ms })), null, 0));

// 3) Encode a single command directly.
const solid = DroidNetCommandLibrary.getCommand('flthy.led.solid');
console.log('solid :', DroidNetCommandLibrary.encode(solid, { designator: 'F', color: '1' }, {})); // F0051

// 4) Recognize an unknown-but-well-formed token.
console.log('match :', DroidNetCommandLibrary.match('A0055'));
