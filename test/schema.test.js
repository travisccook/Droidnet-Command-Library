const fs = require('fs');
const path = require('path');
const Ajv = require('ajv/dist/2020');

const ajv = new Ajv({ allErrors: true, strict: false });
const libSchema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schema', 'library.schema.json'), 'utf8'));
const manifestSchemaPath = path.join(__dirname, '..', 'schema', 'manifest.schema.json');

test('a board file without libraryVersion validates', () => {
  const validate = ajv.compile(libSchema);
  const board = {
    enums: { 'c.color': { values: [{ code: '5', label: 'Blue' }] } },
    components: [{ id: 'flthy', name: 'Flthy', kind: 'device-native',
      commands: [{ id: 'flthy.solid', name: 'Solid', template: '{color}', params: [{ name: 'color', enum: 'c.color' }] }] }],
  };
  expect(validate(board)).toBe(true);
});

test('manifest schema accepts a valid manifest', () => {
  const schema = JSON.parse(fs.readFileSync(manifestSchemaPath, 'utf8'));
  const manifestAjv = new Ajv({ allErrors: true, strict: false });
  const validate = manifestAjv.compile(schema);
  const manifest = { libraryVersion: '2.0.0', boards: [{ id: 'flthy-hps', file: 'boards/flthy-hps.json' }] };
  expect(validate(manifest)).toBe(true);
});

test('manifest schema rejects a non-semver version and an empty boards list', () => {
  const schema = JSON.parse(fs.readFileSync(manifestSchemaPath, 'utf8'));
  const manifestAjv = new Ajv({ allErrors: true, strict: false });
  const validate = manifestAjv.compile(schema);
  expect(validate({ libraryVersion: 'v2', boards: [{ id: 'x', file: 'x.json' }] })).toBe(false);
  expect(validate({ libraryVersion: '2.0.0', boards: [] })).toBe(false);
});
