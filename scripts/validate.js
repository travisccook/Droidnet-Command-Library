#!/usr/bin/env node
/*
 * validate.js — validate a droidnet-command-library board library file.
 *
 * Two layers:
 *   1. Structural — against schema/library.schema.json (uses ajv if installed).
 *   2. Semantic   — cross-references that JSON Schema can't express:
 *        - every param.enum resolves to a defined enum
 *        - every {placeholder} in a template has a matching param (template encoder)
 *        - every param maps to a {placeholder} (template encoder) — catches typos
 *        - command ids are unique across the whole library
 *        - non-template encoders are flagged (must be registered in code)
 *
 * Usage:
 *   node scripts/validate.js [file ...]      # defaults to libraries/*.json
 *   npm run validate
 *
 * Exit code 0 = all files valid, 1 = at least one error.
 * Licensed under the Mozilla Public License 2.0.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'schema', 'library.schema.json');
const KNOWN_BUILTIN_ENCODERS = new Set(['template', 'rseries-le']);

function listDefaultFiles() {
  const dir = path.join(ROOT, 'libraries');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => path.join(dir, f));
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ---- structural validation (optional ajv) ----
function structuralValidate(lib) {
  let Ajv;
  // The schema is JSON Schema draft 2020-12, so use ajv's 2020 build.
  try { Ajv = require('ajv/dist/2020'); } catch (_) {
    try { Ajv = require('ajv'); } catch (_2) {
      return { skipped: true, errors: [] };
    }
  }
  const ajv = new Ajv({ allErrors: true, strict: false });
  const schema = loadJson(SCHEMA_PATH);
  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (e) {
    return { skipped: false, errors: [`schema failed to compile: ${e.message}`] };
  }
  if (validate(lib)) return { skipped: false, errors: [] };
  return {
    skipped: false,
    errors: (validate.errors || []).map(e => `${e.instancePath || '/'} ${e.message}`),
  };
}

// ---- semantic validation ----
function semanticValidate(lib) {
  const errors = [];
  const warnings = [];
  const enums = lib.enums || {};
  const seenCommandIds = new Map();

  for (const comp of lib.components || []) {
    for (const cmd of comp.commands || []) {
      const where = `${comp.id}/${cmd.id}`;

      if (seenCommandIds.has(cmd.id)) {
        errors.push(`duplicate command id '${cmd.id}' (in ${comp.id} and ${seenCommandIds.get(cmd.id)})`);
      } else {
        seenCommandIds.set(cmd.id, comp.id);
      }

      const encoder = cmd.encoder || 'template';
      if (!KNOWN_BUILTIN_ENCODERS.has(encoder)) {
        warnings.push(`${where}: uses custom encoder '${encoder}' — it must be registered via DroidNetCommandLibrary.registerEncoder() at runtime.`);
      }

      // enum references
      for (const p of cmd.params || []) {
        if (p.enum && !enums[p.enum]) {
          errors.push(`${where}: param '${p.name}' references undefined enum '${p.enum}'`);
        }
      }

      // template placeholder <-> param consistency (template encoder only)
      if (encoder === 'template') {
        if (typeof cmd.template !== 'string') {
          errors.push(`${where}: template encoder requires a 'template' string`);
          continue;
        }
        const paramNames = new Set((cmd.params || []).map(p => p.name));
        const placeholders = [...cmd.template.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
        for (const ph of placeholders) {
          if (!paramNames.has(ph)) {
            errors.push(`${where}: template placeholder {${ph}} has no matching param`);
          }
        }
        for (const name of paramNames) {
          if (!placeholders.includes(name)) {
            warnings.push(`${where}: param '${name}' is never used in the template`);
          }
        }
      }
    }
  }
  return { errors, warnings };
}

function validateFile(file) {
  let lib;
  try {
    lib = loadJson(file);
  } catch (e) {
    return { errors: [`could not parse JSON: ${e.message}`], warnings: [], structuralSkipped: false };
  }
  const structural = structuralValidate(lib);
  const semantic = semanticValidate(lib);
  return {
    errors: [...structural.errors, ...semantic.errors],
    warnings: semantic.warnings,
    structuralSkipped: structural.skipped,
  };
}

function main() {
  const files = process.argv.slice(2);
  const targets = files.length ? files : listDefaultFiles();
  if (!targets.length) {
    console.error('No library files to validate (pass paths or add files to libraries/).');
    process.exit(1);
  }

  let anyError = false;
  let anySkip = false;
  for (const file of targets) {
    const rel = path.relative(process.cwd(), file);
    const { errors, warnings, structuralSkipped } = validateFile(file);
    anySkip = anySkip || structuralSkipped;
    if (errors.length) {
      anyError = true;
      console.error(`✗ ${rel}`);
      for (const e of errors) console.error(`    ERROR  ${e}`);
    } else {
      console.log(`✓ ${rel}`);
    }
    for (const w of warnings) console.log(`    warn   ${w}`);
  }

  if (anySkip) {
    console.log('\nNote: ajv not installed — ran semantic checks only. Run `npm install` for full structural validation.');
  }
  process.exit(anyError ? 1 : 0);
}

main();
