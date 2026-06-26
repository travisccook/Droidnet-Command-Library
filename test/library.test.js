const fs = require('fs');
const path = require('path');

const LIB_DIR = path.join(__dirname, '..', 'libraries');
const libFiles = fs.readdirSync(LIB_DIR).filter(f => f.endsWith('.json'));

describe.each(libFiles)('library %s', (file) => {
  const lib = JSON.parse(fs.readFileSync(path.join(LIB_DIR, file), 'utf8'));

  test('has a semver libraryVersion and at least one component', () => {
    expect(typeof lib.libraryVersion).toBe('string');
    expect(lib.libraryVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(Array.isArray(lib.components) && lib.components.length).toBeTruthy();
  });

  test('every component has required fields and a known kind', () => {
    for (const c of lib.components) {
      expect(c.id && c.name).toBeTruthy();
      expect(['device-native', 'wcb-verb']).toContain(c.kind);
      if (c.confidence) expect(['high', 'community', 'low']).toContain(c.confidence);
      expect(Array.isArray(c.commands)).toBe(true);
    }
  });

  test('every command has an id, name, and template (or non-template encoder)', () => {
    for (const c of lib.components) {
      for (const cmd of c.commands) {
        expect(cmd.id && cmd.name).toBeTruthy();
        const encoder = cmd.encoder || 'template';
        if (encoder === 'template') expect(typeof cmd.template).toBe('string');
        if (cmd.safety) expect(['cosmetic', 'movement', 'power', 'config']).toContain(cmd.safety);
      }
    }
  });

  test('command ids are unique across the library', () => {
    const seen = new Set();
    for (const c of lib.components) {
      for (const cmd of c.commands) {
        expect(seen.has(cmd.id)).toBe(false);
        seen.add(cmd.id);
      }
    }
  });

  test('every param.enum reference resolves to a defined enum with code+label values', () => {
    for (const c of lib.components) {
      for (const cmd of c.commands) {
        for (const p of (cmd.params || [])) {
          if (!p.enum) continue;
          const e = (lib.enums || {})[p.enum];
          if (!e) throw new Error(`enum ${p.enum} (in ${cmd.id}) is not defined`);
          for (const v of e.values) {
            expect(typeof v.code === 'string' && typeof v.label === 'string').toBe(true);
          }
        }
      }
    }
  });

  test('every {param} placeholder in a template has a matching param', () => {
    for (const c of lib.components) {
      for (const cmd of c.commands) {
        if ((cmd.encoder || 'template') !== 'template') continue;
        const names = (cmd.params || []).map(p => p.name);
        const placeholders = [...cmd.template.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
        for (const ph of placeholders) expect(names).toContain(ph);
      }
    }
  });
});
