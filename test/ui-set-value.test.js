/**
 * @jest-environment jsdom
 */
'use strict';
// 4.6.0: renderComposer returns { setValue(value) }, so a host that also edits the value
// as text (DroidNet's stored-command field) can hand the builder each change.
const LIB = {
  enums: { mode: { values: [{ code: '3', label: 'Alarm' }, { code: '92', label: 'VU' }] } },
  components: [{
    id: 'test', name: 'Test', kind: 'device-native',
    routing: { class: 'broadcast', nativeWrapper: 'none' },
    commands: [
      { id: 't.mode', name: 'Mode', template: '4T{mode}',
        params: [{ name: 'mode', enum: 'mode' }], examples: ['4T3'] },
      { id: 't.move', name: 'Move', template: 'MV{mode}', safety: 'movement',
        params: [{ name: 'mode', enum: 'mode' }], examples: ['MV3'] },
    ],
  }],
};

function loadUI() {
  jest.resetModules();
  const engine = require('../src/droidnet-command-library.js');
  const UI = require('../src/droidnet-command-library-ui.js');
  engine.loadLibrary(JSON.parse(JSON.stringify(LIB)), { libraryVersion: 'test' });
  return UI;
}

describe('renderComposer handle', () => {
  let UI;
  let host;
  let changes;
  beforeEach(() => {
    UI = loadUI();
    document.body.innerHTML = '<div id="host"></div>';
    host = document.getElementById('host');
    changes = [];
  });
  const render = (value) => UI.renderComposer(host, value, { onChange: (v) => changes.push(v) });
  const tokens = () => [...host.querySelectorAll('.wcb-step-token')].map((e) => e.textContent);

  test('returns a handle with setValue', () => {
    expect(typeof render('4T3').setValue).toBe('function');
  });

  test('setValue with the compiled value changes nothing', () => {
    const handle = render('4T3^*** note');
    const step = host.querySelector('.wcb-step');
    handle.setValue('4T3^*** note');
    expect(host.querySelector('.wcb-step')).toBe(step);
    expect(changes).toEqual([]);
  });

  test('setValue re-renders the steps, the length and the safety note without onChange', () => {
    const handle = render('4T3');
    expect(host.querySelector('.wcb-safety').textContent).toBe('');
    handle.setValue('4T3^MV92');
    expect(tokens()).toEqual(['4T3', 'MV92']);
    expect(host.querySelector('.wcb-len').textContent).toBe('8 / 200');
    expect(host.querySelector('.wcb-safety').textContent).toMatch(/movement/);
    expect(changes).toEqual([]);
  });

  test('an empty or null value shows the empty state', () => {
    const handle = render('4T3');
    handle.setValue('');
    expect(host.querySelectorAll('.wcb-step')).toHaveLength(0);
    expect(host.querySelector('.wcb-empty')).not.toBeNull();
    expect(host.querySelector('.wcb-len').textContent).toBe('0 / 200');
    handle.setValue('4T3');
    handle.setValue(null);
    expect(host.querySelectorAll('.wcb-step')).toHaveLength(0);
  });

  test('a half-filled Add bar is kept', () => {
    const handle = render('4T3');
    const cmdSel = host.querySelector('.wcb-cmd');
    cmdSel.value = 't.move';
    cmdSel.dispatchEvent(new window.Event('change'));
    const param = host.querySelector('.wcb-addbar .wcb-param');
    param.value = '92';
    handle.setValue('4T92');
    expect(host.querySelector('.wcb-addbar .wcb-param')).toBe(param);
    expect(param.value).toBe('92');
    expect(host.querySelector('.wcb-cmd').value).toBe('t.move');
  });

  test('a step being edited in the Add bar is cancelled', () => {
    const handle = render('4T3^4T92');
    host.querySelector('.wcb-step-edit').click();
    expect(host.querySelector('.add-lbl').textContent).toBe('Edit:');
    handle.setValue('4T92');
    expect(host.querySelector('.add-lbl').textContent).toBe('Add:');
    expect(host.querySelector('.wcb-cancel')).toBeNull();
    expect(host.querySelector('.wcb-step.editing')).toBeNull();
    expect(changes).toEqual([]);
  });

  test('builder actions after setValue work on the new steps', () => {
    const handle = render('4T3');
    handle.setValue('4T3^4T92');
    host.querySelectorAll('.wcb-step-remove')[0].click();
    expect(changes).toEqual(['4T92']);
  });
});
