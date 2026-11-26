import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslator } from './localization';

test('English image counts use singular for one and plural for zero or many', () => {
  const t = createTranslator('en');
  assert.equal(t('queue.compress', { count: 1 }), 'Compress 1 image');
  assert.equal(t('queue.compress', { count: 0 }), 'Compress 0 images');
  assert.equal(t('queue.compress', { count: 2 }), 'Compress 2 images');
  assert.equal(t('queue.completed', { count: 1, percent: 25 }), '1 image · 25% smaller');
  assert.equal(t('queue.completed', { count: 3, percent: 25 }), '3 images · 25% smaller');
});

test('Vietnamese and Japanese counts retain their language forms', () => {
  assert.equal(createTranslator('vi')('queue.compress', { count: 1 }), 'Nén 1 ảnh');
  assert.equal(createTranslator('ja')('queue.compress', { count: 2 }), '2件を圧縮');
});

test('Snapshot dictionaries support plural fallbacks and preserve unresolved placeholders', () => {
  const t = createTranslator('en', { message: '{count} items for {name}', message_one: '{count} item for {name}' });
  assert.equal(t('message', { count: 1, name: 'Ada' }), '1 item for Ada');
  assert.equal(t('message', { count: 2 }), '2 items for {name}');
  assert.equal(t('unknown'), 'unknown');
});
