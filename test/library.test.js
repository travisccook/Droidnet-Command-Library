const fs = require('fs');
const path = require('path');

const LIB_DIR = path.join(__dirname, '..', 'libraries');
const BOARDS_DIR = path.join(LIB_DIR, 'boards');
const boardFiles = fs.readdirSync(BOARDS_DIR).filter(f => f.endsWith('.json'));
const manifest = JSON.parse(fs.readFileSync(path.join(LIB_DIR, 'manifest.json'), 'utf8'));

describe.each(boardFiles)('board %s', (file) => {
  const lib = JSON.parse(fs.readFileSync(path.join(BOARDS_DIR, file), 'utf8'));

  test('has exactly one component with required fields and a known kind', () => {
    expect(lib.components).toHaveLength(1);
    const c = lib.components[0];
    expect(c.id && c.name).toBeTruthy();
    expect(['device-native', 'wcb-verb']).toContain(c.kind);
    if (c.confidence) expect(['high', 'community', 'low']).toContain(c.confidence);
    expect(Array.isArray(c.commands)).toBe(true);
  });

  test('every command has an id, name, and template (or non-template encoder)', () => {
    for (const cmd of lib.components[0].commands) {
      expect(cmd.id && cmd.name).toBeTruthy();
      if ((cmd.encoder || 'template') === 'template') expect(typeof cmd.template).toBe('string');
      if (cmd.safety) expect(['cosmetic', 'movement', 'power', 'config']).toContain(cmd.safety);
    }
  });

  test('every param.enum resolves locally with code+label values', () => {
    const enums = lib.enums || {};
    for (const cmd of lib.components[0].commands) {
      for (const p of (cmd.params || [])) {
        if (!p.enum) continue;
        const e = enums[p.enum];
        if (!e) throw new Error(`enum ${p.enum} (in ${cmd.id}) is not defined in this board file`);
        for (const v of e.values) {
          expect(typeof v.code).toBe('string');
          expect(typeof v.label).toBe('string');
        }
      }
    }
  });

  test('every {param} placeholder has a matching param', () => {
    for (const cmd of lib.components[0].commands) {
      if ((cmd.encoder || 'template') !== 'template') continue;
      const names = (cmd.params || []).map(p => p.name);
      const placeholders = [...cmd.template.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
      for (const ph of placeholders) expect(names).toContain(ph);
    }
  });
});

describe('catalog', () => {
  test('every board file is listed in the manifest and vice-versa', () => {
    const listed = manifest.boards.map(b => b.file).sort();
    const onDisk = boardFiles.map(f => `boards/${f}`).sort();
    expect(onDisk).toEqual(listed);
  });

  test('command ids are unique across the whole catalog', () => {
    const seen = new Set();
    for (const f of boardFiles) {
      const lib = JSON.parse(fs.readFileSync(path.join(BOARDS_DIR, f), 'utf8'));
      for (const cmd of lib.components[0].commands) {
        expect(seen.has(cmd.id)).toBe(false);
        seen.add(cmd.id);
      }
    }
  });

  test('hcr.emotion and hcr.channel are byte-identical across the two HCR boards', () => {
    const wcb = JSON.parse(fs.readFileSync(path.join(BOARDS_DIR, 'wcb-hcr.json'), 'utf8'));
    const nat = JSON.parse(fs.readFileSync(path.join(BOARDS_DIR, 'hcr-native.json'), 'utf8'));
    for (const id of ['hcr.emotion', 'hcr.channel']) {
      expect(wcb.enums[id]).toBeDefined();
      expect(nat.enums[id]).toBeDefined();
      expect(JSON.stringify(wcb.enums[id])).toBe(JSON.stringify(nat.enums[id]));
    }
  });
});
