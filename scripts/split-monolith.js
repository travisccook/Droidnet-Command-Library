#!/usr/bin/env node
/* One-off: derive libraries/boards/*.json + libraries/manifest.json from the
 * monolithic libraries/droidnet-astromech.json. Each board gets exactly the
 * enums its commands reference (shared enums are duplicated byte-identically).
 * Kept in-repo as provenance; safe to re-run (idempotent). MPL-2.0. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIB_DIR = path.join(ROOT, 'libraries');
const mono = JSON.parse(fs.readFileSync(path.join(LIB_DIR, 'droidnet-astromech.json'), 'utf8'));
const boardsDir = path.join(LIB_DIR, 'boards');
fs.mkdirSync(boardsDir, { recursive: true });

const manifestBoards = [];
for (const comp of mono.components) {
  const used = new Set();
  for (const cmd of comp.commands || []) for (const p of cmd.params || []) if (p.enum) used.add(p.enum);
  const enums = {};
  for (const id of Object.keys(mono.enums || {})) if (used.has(id)) enums[id] = mono.enums[id];
  const board = { $schema: 'droidnet-command-library/library/v1', enums, components: [comp] };
  const file = `boards/${comp.id}.json`;
  fs.writeFileSync(path.join(LIB_DIR, file), JSON.stringify(board, null, 2) + '\n');
  manifestBoards.push({ id: comp.id, file, name: comp.name, confidence: comp.confidence || 'community' });
}

const manifest = {
  $schema: 'droidnet-command-library/catalog/v1',
  libraryVersion: '2.0.0',
  schemaVersion: 'v1',
  generatedFrom: mono.generatedFrom || 'libraries/droidnet-astromech.json',
  boards: manifestBoards,
};
fs.writeFileSync(path.join(LIB_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${manifestBoards.length} board files + manifest.json`);
