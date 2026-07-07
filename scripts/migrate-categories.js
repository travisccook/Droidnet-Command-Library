#!/usr/bin/env node
/* One-shot: rename command.group -> command.category (standardized values) and
 * add component.categories to non-merging boards. Fails loud on any unmapped command. */
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'libraries', 'boards');

// group -> category per SOURCE component id (keying per-source resolves the cross-file
// "Pins"/"Timing" cases). Only r2uppityspinner-alt needs per-command overrides.
const RULES = {
  'astropixels-config': { byGroup: { 'WiFi/Remote': 'Setup', 'System': 'System' } },
  'astropixels-panels': { byGroup: { 'Macros': 'Panels', 'Dynamic': 'Sequences' } },
  'astropixels-sequences': { byGroup: { 'Sequences': 'Sequences' } },
  'astropixels-holo': { byGroup: { 'Friendly': 'Friendly', 'Native LED': 'Lighting', 'Native Servo': 'Movement', 'Native Sequence': 'Sequences' } },
  'astropixels-logics': { byGroup: { 'Effects': 'Lighting', 'Text': 'Text' } },
  'astropixels-psi': { byGroup: { 'PSI': 'Lighting' } },
  'astropixels-servo': { byGroup: { 'Move': 'Movement', 'Config': 'Config' } },
  'astropixels-sound': { byGroup: { 'Playback': 'Playback', 'Ambient': 'Ambient', 'Named': 'Named Clips', 'Volume': 'Volume' } },
  'chirp': { byGroup: { 'Playback': 'Playback', 'Volume': 'Volume', 'Status': 'Status', 'Config': 'Config', 'Debug': 'Debug', 'Generate': 'Debug' } },
  'flthy-hps': { byGroup: { 'LED Effects': 'Lighting', 'Servo': 'Servo', 'Special': 'Sequences' } },
  'hcr-native': { byGroup: { 'Stimuli': 'Sound', 'Muse': 'Muse', 'SD WAV': 'Sound', 'Stop': 'Sound', 'Volume': 'Sound', 'Override': 'Config', 'Record': 'Record', 'Query': 'Query' } },
  'maestro': { byGroup: { 'Sequences': 'Sequences' } },
  'magic-panel': { byGroup: { 'Patterns': 'Patterns' } },
  'psi-pro': { byGroup: { 'Effects': 'Lighting' } },
  'r2uppityspinner-alt': {
    byGroup: { 'Playback': 'Sequences', 'Lifter': 'Lifter', 'Rotary': 'Rotary', 'Random Mode': 'Sequences', 'Lights': 'Lighting', 'Timing': 'Sequences', 'Configuration': 'Setup' },
    overrides: { 'uppity.estop': 'Power', 'uppity.cfg.zero': 'Config', 'uppity.cfg.factory': 'Config', 'uppity.cfg.debug': 'Config', 'uppity.cfg.status': 'Config', 'uppity.cfg.config': 'Config', 'uppity.cfg.listSeq': 'Config', 'uppity.cfg.deleteSeq': 'Config', 'uppity.cfg.restart': 'Power' },
  },
  'roam-a-dome-motion': { byGroup: { 'Rotate': 'Movement', 'Spin': 'Movement', 'Home': 'Movement', 'Timing': 'Sequences', 'Playback': 'Sequences', 'Pins': 'Power' } },
  'roam-a-dome-config': { byGroup: { 'System': 'System', 'Setup': 'Setup', 'Speeds': 'Movement', 'Tolerances': 'Setup', 'Delays': 'Timing', 'Modes': 'Modes', 'Ramping': 'Movement', 'Serial': 'Serial', 'Syren': 'Serial', 'Sensor': 'Serial', 'PWM': 'I/O', 'Pins': 'I/O', 'WiFi/Remote': 'WiFi/Remote', 'Sequences': 'Sequences', 'Debug': 'System' } },
  'rseries-logic': { byGroup: { 'Effects': 'Lighting' } },
  'wcb-hcr': { byGroup: { 'Emotion': 'Emotion', 'Audio': 'Sound' } },
};

// Ordered categories for the 14 non-merging boards (final board id == source id).
const CATEGORIES = {
  'flthy-hps': ['Lighting', 'Servo', 'Sequences'],
  'magic-panel': ['Patterns'],
  'rseries-logic': ['Lighting'],
  'wcb-hcr': ['Emotion', 'Sound'],
  'maestro': ['Sequences'],
  'psi-pro': ['Lighting'],
  'hcr-native': ['Sound', 'Muse', 'Config', 'Record', 'Query'],
  'chirp': ['Playback', 'Volume', 'Status', 'Config', 'Debug'],
  'r2uppityspinner-alt': ['Lifter', 'Rotary', 'Sequences', 'Lighting', 'Power', 'Setup', 'Config'],
  'astropixels-holo': ['Friendly', 'Lighting', 'Movement', 'Sequences'],
  'astropixels-sound': ['Named Clips', 'Playback', 'Ambient', 'Volume'],
  'astropixels-servo': ['Movement', 'Config'],
  'astropixels-logics': ['Lighting', 'Text'],
  'astropixels-psi': ['Lighting'],
};

let n = 0;
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
  const full = path.join(DIR, file);
  const lib = JSON.parse(fs.readFileSync(full, 'utf8'));
  const comp = lib.components[0];
  const rule = RULES[comp.id];
  if (!rule) throw new Error(`no migration rule for board '${comp.id}'`);
  for (const cmd of comp.commands) {
    const cat = (rule.overrides && rule.overrides[cmd.id]) || rule.byGroup[cmd.group];
    if (!cat) throw new Error(`${comp.id}/${cmd.id}: no category for group '${cmd.group}'`);
    delete cmd.group;      // rename: drop the dead field...
    cmd.category = cat;    // ...add the standardized category
  }
  if (CATEGORIES[comp.id]) {
    comp.categories = CATEGORIES[comp.id];
    const set = new Set(comp.categories);
    for (const cmd of comp.commands) {
      if (!set.has(cmd.category)) throw new Error(`${comp.id}/${cmd.id}: category '${cmd.category}' not in ${JSON.stringify(comp.categories)}`);
    }
  }
  fs.writeFileSync(full, JSON.stringify(lib, null, 2) + '\n');
  n++;
}
console.log(`migrated ${n} board files`);
