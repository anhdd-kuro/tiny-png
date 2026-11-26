import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNearCorner } from './drag-monitor.ts';
import type { DropCorner } from '../../../shared/contracts.ts';

test('nearby policy recognizes each configured corner and respects circular radius', () => {
  const area = { x: 0, y: 24, width: 1440, height: 876 };
  for (const [corner, x, y] of [['topLeft', 0, 24], ['topRight', 1440, 24], ['bottomLeft', 0, 900], ['bottomRight', 1440, 900]] as const) {
    assert.equal(isNearCorner({ x, y }, area, corner), true);
    assert.equal(isNearCorner({ x: 720, y: 462 }, area, corner), false);
  }
  assert.equal(isNearCorner({ x: 1420, y: 44 }, area, 'topRight', 30), true);
  assert.equal(isNearCorner({ x: 1410, y: 54 }, area, 'topRight', 30), false);
});

test('nearby policy handles negative monitor origins and rejects points on other screens', () => {
  const area = { x: -1920, y: -1080, width: 1920, height: 1080 };
  assert.equal(isNearCorner({ x: -1900, y: -1060 }, area, 'topLeft'), true);
  assert.equal(isNearCorner({ x: 20, y: -20 }, area, 'bottomRight'), false);
  assert.equal(isNearCorner({ x: -20, y: -20 }, area, 'bottomRight'), true);
  assert.equal(isNearCorner({ x: -950, y: -1060 }, area, 'topCenter'), true);
  assert.equal(isNearCorner({ x: 20, y: -1060 }, area, 'topCenter'), false);
});

test('top-center position activates near the middle of the top edge instead of either corner', () => {
  const area = { x: 0, y: 24, width: 1440, height: 876 };
  assert.equal(isNearCorner({ x: 720, y: 24 }, area, 'topCenter'), true);
  assert.equal(isNearCorner({ x: 820, y: 60 }, area, 'topCenter'), true);
  assert.equal(isNearCorner({ x: 0, y: 24 }, area, 'topCenter'), false);
  assert.equal(isNearCorner({ x: 1440, y: 24 }, area, 'topCenter'), false);
});

test('nearby policy rejects malformed coordinates and settings', () => {
  const area = { x: 0, y: 0, width: 1000, height: 1000 };
  assert.equal(isNearCorner({ x: NaN, y: 0 }, area, 'topLeft'), false);
  assert.equal(isNearCorner({ x: 0, y: 0 }, area, 'unknown' as DropCorner), false);
  assert.equal(isNearCorner({ x: 0, y: 0 }, area, 'topLeft', -10), false);
});

test('top-center reveal remains active through the menu bar inside the same physical display', () => {
  const bounds = { x: 0, y: 0, width: 1440, height: 900 };
  const workArea = { x: 0, y: 38, width: 1440, height: 862 };
  for (const y of [50, 38, 20, 0]) assert.equal(isNearCorner({ x: 720, y }, workArea, 'topCenter', 180, bounds), true);
  assert.equal(isNearCorner({ x: 720, y: -1 }, workArea, 'topCenter', 180, bounds), false);
  assert.equal(isNearCorner({ x: 0, y: 0 }, workArea, 'topCenter', 180, bounds), false);
  const secondBounds = { x: -1920, y: -1080, width: 1920, height: 1080 };
  const secondWorkArea = { x: -1920, y: -1056, width: 1920, height: 1056 };
  assert.equal(isNearCorner({ x: -960, y: -1080 }, secondWorkArea, 'topCenter', 180, secondBounds), true);
  assert.equal(isNearCorner({ x: -960, y: -1081 }, secondWorkArea, 'topCenter', 180, secondBounds), false);
});
