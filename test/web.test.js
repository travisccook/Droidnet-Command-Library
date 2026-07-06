const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }

describe('hosted site — html wiring', () => {
  test('index.html loads engine, UI module, page scripts, and css', () => {
    const html = read('index.html');
    expect(html).toContain('src/droidnet-command-library.js');
    expect(html).toContain('src/droidnet-command-library-ui.js');
    expect(html).toContain('assets/boot.js');
    expect(html).toContain('assets/composer.js');
    expect(html).toContain('assets/app.css');
    // required mount/anchor ids
    ['composer', 'out', 'counter', 'copy', 'import', 'import-btn', 'errzone', 'libver']
      .forEach(id => expect(html).toContain('id="' + id + '"'));
  });

  test('reference.html loads engine, boot, reference script, and css', () => {
    const html = read('reference.html');
    expect(html).toContain('src/droidnet-command-library.js');
    expect(html).toContain('assets/boot.js');
    expect(html).toContain('assets/reference.js');
    expect(html).toContain('assets/app.css');
    ['catalog', 'search', 'errzone', 'libver']
      .forEach(id => expect(html).toContain('id="' + id + '"'));
    // reference page must NOT need the UI module
    expect(html).not.toContain('droidnet-command-library-ui.js');
  });
});
