'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { chooseOption, degreeLevel } = require('../src/engine/optionMatcher');

const opts = (...pairs) => pairs.map(([value, label]) => ({ value, label }));
const DEGREES = opts(['', 'Select…'], ['bachelors', "Bachelor's Degree"], ['masters', "Master's Degree"], ['phd', 'Doctorate (PhD)']);

test('an exact value match wins, case-insensitively', () => {
  assert.equal(chooseOption('PHD', DEGREES)?.value, 'phd');
});

test('an exact label match is found after normalisation', () => {
  const o = opts(['us', 'United States'], ['in', 'India']);
  assert.equal(chooseOption('united  states', o)?.value, 'us');
});

test('degree abbreviations map to the right level', () => {
  assert.equal(chooseOption('B.Tech', DEGREES)?.value, 'bachelors');
  assert.equal(chooseOption('B.Sc', DEGREES)?.value, 'bachelors');
  assert.equal(chooseOption('M.Tech', DEGREES)?.value, 'masters');
  assert.equal(chooseOption('MSc', DEGREES)?.value, 'masters');
  assert.equal(chooseOption('Ph.D', DEGREES)?.value, 'phd');
});

test('a degree level with no matching option picks nothing instead of a wrong level', () => {
  assert.equal(chooseOption('B.Tech', opts(['masters', "Master's Degree"], ['phd', 'PhD'])), null);
});

test('containment matches longer labels', () => {
  const o = opts(['cse', 'Computer Science and Engineering'], ['ece', 'Electronics']);
  assert.equal(chooseOption('Computer Science', o)?.value, 'cse');
});

test('placeholder options never match anything', () => {
  const o = opts(['', ''], ['', 'Select…'], ['x', '--Please choose--']);
  assert.equal(chooseOption('Anything', o), null);
  assert.equal(chooseOption('Select', o), null);
});

test('no options or no match returns null', () => {
  assert.equal(chooseOption('B.Tech', []), null);
  assert.equal(chooseOption('B.Tech', undefined), null);
  assert.equal(chooseOption('Zebra', DEGREES), null);
  assert.equal(chooseOption('', DEGREES), null);
});

test('degreeLevel classifies common spellings', () => {
  assert.equal(degreeLevel('B.Tech'), 'bachelor');
  assert.equal(degreeLevel("Bachelor of Science"), 'bachelor');
  assert.equal(degreeLevel('M.E.'), 'master');
  assert.equal(degreeLevel("Master's Degree"), 'master');
  assert.equal(degreeLevel('MBA'), 'mba');
  assert.equal(degreeLevel('Ph.D.'), 'doctorate');
  assert.equal(degreeLevel('Associate degree'), 'associate');
  assert.equal(degreeLevel('Computer Science'), null);
});
