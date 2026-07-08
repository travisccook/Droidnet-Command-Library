'use strict';
const UI = require('../src/droidnet-command-library-ui.js');
const cmd = (id, category) => ({ id, name: id, category });

describe('groupCommandsForDropdown', () => {
  test('renders sections in the declared categories order', () => {
    const cmds = [cmd('a', 'Config'), cmd('b', 'Movement'), cmd('c', 'Movement')];
    const groups = UI.groupCommandsForDropdown(cmds, ['Movement', 'Config']);
    expect(groups.map(g => g.label)).toEqual(['Movement', 'Config']);
    expect(groups[0].commands.map(c => c.id)).toEqual(['b', 'c']);
    expect(groups[1].commands.map(c => c.id)).toEqual(['a']);
  });
  test('drops a declared category that has no commands', () => {
    const groups = UI.groupCommandsForDropdown([cmd('a', 'Movement')], ['Movement', 'Config']);
    expect(groups.map(g => g.label)).toEqual(['Movement']);
  });
  test('routes uncategorized and unknown-category commands to a trailing Other', () => {
    const cmds = [cmd('a', 'Movement'), cmd('b', null), cmd('c', 'Nope')];
    const groups = UI.groupCommandsForDropdown(cmds, ['Movement']);
    expect(groups.map(g => g.label)).toEqual(['Movement', 'Other']);
    expect(groups[1].commands.map(c => c.id)).toEqual(['b', 'c']);
  });
  test('with no declared categories, orders by standard vocab then first-appearance outliers', () => {
    const cmds = [cmd('a', 'Config'), cmd('b', 'Friendly'), cmd('c', 'Lighting'), cmd('d', 'Muse')];
    const groups = UI.groupCommandsForDropdown(cmds, undefined);
    expect(groups.map(g => g.label)).toEqual(['Lighting', 'Config', 'Friendly', 'Muse']);
  });
});
