const fs = require('fs');
const path = require('path');
const BOARDS_DIR = path.join(__dirname, '..', 'libraries', 'boards');
const boardFiles = fs.readdirSync(BOARDS_DIR).filter((f) => f.endsWith('.json'));

describe.each(boardFiles)('categories — %s', (file) => {
  const comp = JSON.parse(fs.readFileSync(path.join(BOARDS_DIR, file), 'utf8')).components[0];

  test('no command retains a legacy group field', () => {
    for (const cmd of comp.commands) expect(cmd.group).toBeUndefined();
  });

  test('if the component declares categories, every command has a listed category', () => {
    if (!Array.isArray(comp.categories)) return;
    for (const cmd of comp.commands) {
      expect(typeof cmd.category).toBe('string');
      expect(comp.categories).toContain(cmd.category);
    }
  });
});
