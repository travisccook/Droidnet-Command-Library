/**
 * @jest-environment jsdom
 */
'use strict';
// Every way out of "editing a step in the Add bar" leaves the Add bar in plain Add
// mode, with no step highlighted, so the next Insert appends instead of replacing.
// The five exits (Cancel, Update, removing the edited step, reordering, and setValue)
// share one reset; setValue's exit is also covered in ui-set-value.test.js.
const LIB = {
  enums: { mode: { values: [{ code: '3', label: 'Alarm' }, { code: '92', label: 'VU' }] } },
  components: [{
    id: 'test', name: 'Test', kind: 'device-native',
    routing: { class: 'broadcast', nativeWrapper: 'none' },
    commands: [
      { id: 't.mode', name: 'Mode', template: '4T{mode}',
        params: [{ name: 'mode', enum: 'mode' }], examples: ['4T3'] },
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

describe('leaving edit mode in the Add bar', () => {
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
  const label = () => host.querySelector('.add-lbl').textContent;
  const editFirst = () => {
    host.querySelector('.wcb-step-edit').click();
    expect(label()).toBe('Edit:');
    expect(host.querySelector('.wcb-step.editing')).not.toBeNull();
  };
  const expectAddMode = () => {
    expect(label()).toBe('Add:');
    expect(host.querySelector('.wcb-cancel')).toBeNull();
    expect(host.querySelector('.wcb-step.editing')).toBeNull();
  };
  const lastChange = () => changes[changes.length - 1];

  test('Cancel returns to Add mode and the next Insert appends', () => {
    render('4T3^4T92');
    editFirst();
    host.querySelector('.wcb-cancel').click();
    expectAddMode();
    expect(changes).toEqual([]);
    host.querySelector('.wcb-insert').click();
    expect(lastChange().startsWith('4T3^4T92^4T')).toBe(true);
  });

  test('Update writes the edited step and returns to Add mode', () => {
    render('4T3^4T92');
    editFirst();
    host.querySelector('.wcb-addbar .wcb-param').value = '92';
    host.querySelector('.wcb-insert').click();
    expectAddMode();
    expect(lastChange().startsWith('4T92^4T92')).toBe(true);
    host.querySelector('.wcb-insert').click();
    expect(lastChange().split('^').filter((t) => t.startsWith('4T'))).toHaveLength(3);
  });

  test('removing the step being edited returns to Add mode', () => {
    render('4T3^4T92');
    editFirst();
    host.querySelectorAll('.wcb-step-remove')[0].click();
    expectAddMode();
    expect(changes).toEqual(['4T92']);
  });

  test('reordering while editing returns to Add mode', () => {
    render('4T3^4T92');
    editFirst();
    const steps = host.querySelectorAll('.wcb-step');
    steps[0].dispatchEvent(new window.Event('dragstart'));
    steps[1].dispatchEvent(new window.Event('drop'));
    expectAddMode();
    expect(changes).toEqual(['4T92^4T3']);
  });
});
