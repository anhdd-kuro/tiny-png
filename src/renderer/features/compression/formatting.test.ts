import test from 'node:test';
import assert from 'node:assert/strict';
import { formatReduction } from './formatting';

test('A positive compressed image never claims a 100 percent reduction', () => {
  assert.equal(formatReduction(3_600_000, 1_300, 'en'), '99.9');
  assert.equal(formatReduction(Number.MAX_SAFE_INTEGER, 1, 'en'), '99.9');
  assert.equal(formatReduction(3_600_000, 1_300, 'vi'), '99,9');
});

test('Savings round down to one decimal and follow the app language', () => {
  assert.equal(formatReduction(1_000, 800, 'en'), '20');
  assert.equal(formatReduction(1_000, 670, 'en'), '33');
  assert.equal(formatReduction(1_000, 644, 'en'), '35.6');
  assert.equal(formatReduction(1_000, 643.5, 'vi'), '35,6');
  assert.equal(formatReduction(1_000, 643.5, 'ja'), '35.6');
});

test('Unchanged, larger and unknown image sizes show no reduction', () => {
  assert.equal(formatReduction(1_000, 1_000, 'en'), '0');
  assert.equal(formatReduction(1_000, 1_200, 'en'), '0');
  assert.equal(formatReduction(0, 1_000, 'en'), '0');
  assert.equal(formatReduction(1_000, Infinity, 'en'), '0');
});
