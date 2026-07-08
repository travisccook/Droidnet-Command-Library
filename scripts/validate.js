#!/usr/bin/env node
/*
 * validate.js — validate a droidnet-command-library catalog.
 *
 * Manifest mode (libraries/manifest.json present):
 *   - manifest validates against schema/manifest.schema.json
 *   - manifest <-> disk consistency (every listed board exists; no orphans)
 *   - each board validates against schema/library.schema.json + has exactly one component
 *   - cross-file conflicts (duplicate command ids, conflicting shared enums) via engine.merge
 *   - manifest libraryVersion matches releases.json latest.libraryVersion
 * Legacy mode (no manifest): validate libraries/*.json as before.
 *
 * Exit code 0 = valid, 1 = at least one error.
 * Licensed under the Mozilla Public License 2.0.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const engine = require('../src/droidnet-command-library.js');

const ROOT = path.join(__dirname, '..');
const LIB_DIR = path.join(ROOT, 'libraries');
const BOARDS_DIR = path.join(LIB_DIR, 'boards');
const MANIFEST_PATH = path.join(LIB_DIR, 'manifest.json');
const RELEASES_PATH = path.join(ROOT, 'releases.json');
const LIB_SCHEMA_PATH = path.join(ROOT, 'schema', 'library.schema.json');
const MANIFEST_SCHEMA_PATH = path.join(ROOT, 'schema', 'manifest.schema.json');
const KNOWN_BUILTIN_ENCODERS = new Set(['template', 'rseries-le']);
const STANDARD_CATEGORIES = new Set(['Lighting', 'Movement', 'Sound', 'Sequences', 'Setup', 'Config', 'Power', 'System']);

function loadJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

// ---- structural validation (optional ajv) ----
function structuralValidate(obj, schemaPath) {
  let Ajv;
  try { Ajv = require('ajv/dist/2020'); } catch (_) {
    try { Ajv = require('ajv'); } catch (_2) { return { skipped: true, errors: [] }; }
  }
  const ajv = new Ajv({ allErrors: true, strict: false });
  let validate;
  try { validate = ajv.compile(loadJson(schemaPath)); }
  catch (e) { return { skipped: false, errors: [`schema failed to compile: ${e.message}`] }; }
  if (validate(obj)) return { skipped: false, errors: [] };
  return { skipped: false, errors: (validate.errors || []).map(e => `${e.instancePath || '/'} ${e.message}`) };
}

// ---- per-board semantic checks (cross-references JSON Schema can't express) ----
function boardSemanticErrors(lib) {
  const errors = [];
  const warnings = [];
  const enums = lib.enums || {};
  const comps = lib.components || [];
  if (comps.length !== 1) {
    errors.push(`a board file must contain exactly one component (found ${comps.length})`);
  }
  for (const comp of comps) {
    const declaredCats = Array.isArray(comp.categories) ? comp.categories : null;
    const usedCats = new Set();
    for (const cmd of comp.commands || []) {
      const where = `${comp.id}/${cmd.id}`;
      if (cmd.category === undefined || cmd.category === '') {
        warnings.push(`${where}: command has no category (will render under 'Other')`);
      } else {
        usedCats.add(cmd.category);
        if (declaredCats && !declaredCats.includes(cmd.category)) {
          errors.push(`${where}: category '${cmd.category}' is not listed in the component's categories array`);
        }
      }
      const encoder = cmd.encoder || 'template';
      if (!KNOWN_BUILTIN_ENCODERS.has(encoder)) {
        warnings.push(`${where}: uses custom encoder '${encoder}' — it must be registered via DroidNetCommandLibrary.registerEncoder() at runtime.`);
      }
      for (const p of cmd.params || []) {
        if (p.enum && !enums[p.enum]) {
          errors.push(`${where}: param '${p.name}' references undefined enum '${p.enum}'`);
        }
      }
      if (encoder === 'template') {
        if (typeof cmd.template !== 'string') {
          errors.push(`${where}: template encoder requires a 'template' string`);
          continue;
        }
        const paramNames = new Set((cmd.params || []).map(p => p.name));
        const placeholders = [...cmd.template.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
        for (const ph of placeholders) {
          if (!paramNames.has(ph)) errors.push(`${where}: template placeholder {${ph}} has no matching param`);
        }
        for (const name of paramNames) {
          if (!placeholders.includes(name)) warnings.push(`${where}: param '${name}' is never used in the template`);
        }
      }
      // commentLabel may interpolate {param} placeholders (→ selected value labels) and
      // [ ... ] optional segments; every placeholder must reference a real param.
      if (typeof cmd.commentLabel === 'string') {
        const cparams = new Set((cmd.params || []).map(p => p.name));
        for (const ph of [...cmd.commentLabel.matchAll(/\{(\w+)\}/g)].map(m => m[1])) {
          if (!cparams.has(ph)) errors.push(`${where}: commentLabel placeholder {${ph}} has no matching param`);
        }
        const opens = (cmd.commentLabel.match(/\[/g) || []).length;
        const closes = (cmd.commentLabel.match(/\]/g) || []).length;
        if (opens !== closes) errors.push(`${where}: commentLabel has unbalanced [ ] optional-segment brackets`);
      }
    }
    if (declaredCats) {
      for (const c of declaredCats) {
        if (!usedCats.has(c)) warnings.push(`${comp.id}: declared category '${c}' has no commands`);
      }
    }
    for (const cat of usedCats) {
      if (!STANDARD_CATEGORIES.has(cat)) warnings.push(`${comp.id}: category '${cat}' is not a standard category name (intentional outlier? check for typos)`);
    }
  }
  return { errors, warnings };
}

// ---- cross-file checks via the engine's single merge implementation ----
function crossFileErrors(boards) {
  try { engine.merge(boards); return []; }
  catch (e) { return [e instanceof Error ? e.message : String(e)]; }
}

// ---- manifest <-> disk consistency ----
function manifestConsistencyErrors(manifest, filesOnDisk) {
  const errors = [];
  const listed = new Set((manifest.boards || []).map(b => b.file));
  const onDisk = new Set(filesOnDisk);
  for (const b of manifest.boards || []) {
    if (!onDisk.has(b.file)) errors.push(`manifest lists '${b.file}' but it does not exist on disk`);
  }
  for (const f of filesOnDisk) {
    if (!listed.has(f)) errors.push(`board file '${f}' exists on disk but is not listed in the manifest`);
  }
  return errors;
}

// ---- manifest version <-> releases.json sync ----
function versionSyncErrors(manifest, releases) {
  if (!releases || !releases.latest) return [];
  if (releases.latest.libraryVersion !== manifest.libraryVersion) {
    return [`manifest libraryVersion '${manifest.libraryVersion}' does not match releases.json latest.libraryVersion '${releases.latest.libraryVersion}'`];
  }
  return [];
}

// ---- legacy single-file semantic validation (no manifest) ----
function legacySemanticErrors(lib) {
  const errors = [];
  const warnings = [];
  const seen = new Map();
  for (const comp of lib.components || []) {
    for (const cmd of comp.commands || []) {
      if (seen.has(cmd.id)) errors.push(`duplicate command id '${cmd.id}' (in ${comp.id} and ${seen.get(cmd.id)})`);
      else seen.set(cmd.id, comp.id);
    }
  }
  // reuse the per-board param/template checks per component (skip the one-component assertion)
  for (const comp of lib.components || []) {
    const { errors: e, warnings: w } = boardSemanticErrors({ enums: lib.enums || {}, components: [comp] });
    for (const msg of e) if (!/exactly one component/.test(msg)) errors.push(msg);
    for (const msg of w) warnings.push(msg);
  }
  return { errors, warnings };
}

function listBoardFilesOnDisk() {
  if (!fs.existsSync(BOARDS_DIR)) return [];
  return fs.readdirSync(BOARDS_DIR).filter(f => f.endsWith('.json')).map(f => `boards/${f}`);
}

function runManifestMode() {
  let anyError = false;
  let anySkip = false;
  const report = (rel, errors, warnings) => {
    if (errors.length) { anyError = true; console.error(`✗ ${rel}`); for (const e of errors) console.error(`    ERROR  ${e}`); }
    else console.log(`✓ ${rel}`);
    for (const w of (warnings || [])) console.log(`    warn   ${w}`);
  };

  const manifest = loadJson(MANIFEST_PATH);
  const ms = structuralValidate(manifest, MANIFEST_SCHEMA_PATH);
  anySkip = anySkip || ms.skipped;
  const consistency = manifestConsistencyErrors(manifest, listBoardFilesOnDisk());
  const releases = fs.existsSync(RELEASES_PATH) ? loadJson(RELEASES_PATH) : null;
  report('libraries/manifest.json', [...ms.errors, ...consistency, ...versionSyncErrors(manifest, releases)], []);

  const boards = [];
  for (const entry of manifest.boards || []) {
    const file = path.join(LIB_DIR, entry.file);
    let lib;
    try { lib = loadJson(file); } catch (e) { report(entry.file, [`could not parse JSON: ${e.message}`], []); continue; }
    boards.push(lib);
    const s = structuralValidate(lib, LIB_SCHEMA_PATH);
    anySkip = anySkip || s.skipped;
    const sem = boardSemanticErrors(lib);
    report(entry.file, [...s.errors, ...sem.errors], sem.warnings);
  }

  const cross = crossFileErrors(boards);
  if (cross.length) { anyError = true; console.error('✗ cross-file'); for (const e of cross) console.error(`    ERROR  ${e}`); }
  else console.log('✓ cross-file (merged catalog)');

  if (anySkip) console.log('\nNote: ajv not installed — ran semantic checks only. Run `npm install` for full structural validation.');
  return anyError;
}

function runLegacyMode(files) {
  let anyError = false;
  let anySkip = false;
  for (const file of files) {
    const rel = path.relative(process.cwd(), file);
    let lib;
    try { lib = loadJson(file); } catch (e) { anyError = true; console.error(`✗ ${rel}`); console.error(`    ERROR  could not parse JSON: ${e.message}`); continue; }
    const s = structuralValidate(lib, LIB_SCHEMA_PATH);
    anySkip = anySkip || s.skipped;
    const { errors: semErrors, warnings } = legacySemanticErrors(lib);
    const errors = [...s.errors, ...semErrors];
    if (errors.length) { anyError = true; console.error(`✗ ${rel}`); for (const e of errors) console.error(`    ERROR  ${e}`); }
    else { console.log(`✓ ${rel}`); for (const w of warnings) console.log(`    warn   ${w}`); }
  }
  if (anySkip) console.log('\nNote: ajv not installed — ran semantic checks only. Run `npm install` for full structural validation.');
  return anyError;
}

function main() {
  const argv = process.argv.slice(2);
  let anyError;
  if (argv.length) {
    anyError = runLegacyMode(argv);
  } else if (fs.existsSync(MANIFEST_PATH)) {
    anyError = runManifestMode();
  } else {
    const files = fs.existsSync(LIB_DIR)
      ? fs.readdirSync(LIB_DIR).filter(f => f.endsWith('.json')).map(f => path.join(LIB_DIR, f)) : [];
    if (!files.length) { console.error('No library files to validate.'); process.exit(1); }
    anyError = runLegacyMode(files);
  }
  process.exit(anyError ? 1 : 0);
}

module.exports = { boardSemanticErrors, crossFileErrors, manifestConsistencyErrors, versionSyncErrors, legacySemanticErrors };

if (require.main === module) main();
