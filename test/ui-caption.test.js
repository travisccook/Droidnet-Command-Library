'use strict';
const UI = require('../src/droidnet-command-library-ui.js');

describe('humanize', () => {
  test('capitalizes a single lowercase word', () => {
    expect(UI.humanize('speed')).toBe('Speed');
    expect(UI.humanize('seconds')).toBe('Seconds');
  });
  test('splits camelCase into Title-Cased words', () => {
    expect(UI.humanize('scrollSpeed')).toBe('Scroll Speed');
  });
});

describe('captionFor', () => {
  const getEnum = (n) => ({
    'rseries.effect': { label: 'Effect' },
    'rseries.target': { label: 'Display' },
  })[n];

  test('prefers an explicit param.label', () => {
    expect(UI.captionFor({ name: 'x', label: 'Custom Name' }, getEnum)).toBe('Custom Name');
  });
  test('falls back to the enum label for enum params', () => {
    expect(UI.captionFor({ name: 'effect', enum: 'rseries.effect' }, getEnum)).toBe('Effect');
    expect(UI.captionFor({ name: 'target', enum: 'rseries.target' }, getEnum)).toBe('Display');
  });
  test('humanizes the param name for int params', () => {
    expect(UI.captionFor({ name: 'speed', type: 'int' }, getEnum)).toBe('Speed');
  });
  test('humanizes when the enum is absent or has no label', () => {
    expect(UI.captionFor({ name: 'target', enum: 'nope' }, getEnum)).toBe('Target');
    expect(UI.captionFor({ name: 'gain' }, getEnum)).toBe('Gain');
  });
});
