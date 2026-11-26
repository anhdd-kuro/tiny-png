import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { collectBundledLicenses } from './licenses';

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tiny-assets-licenses-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const rendererLicenseFile = path.join(root, 'renderer-licenses.json');
  await writeFile(rendererLicenseFile, '[]');
  return { root, rendererLicenseFile, outputDirectory: path.join(root, 'build/licenses') };
}

async function dependency(root: string, name: string, version: string, files: Record<string, string>) {
  const directory = path.join(root, 'node_modules', name);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name, version, main: 'index.cjs', license: 'MIT' }));
  await writeFile(path.join(directory, 'index.cjs'), 'module.exports = 42;');
  for (const [relative, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(directory, relative)), { recursive: true });
    await writeFile(path.join(directory, relative), text);
  }
}

async function bundled(root: string, name: string) {
  const result = await build({
    absWorkingDir: root, stdin: { contents: `console.log(require(${JSON.stringify(name)}));`, resolveDir: root },
    platform: 'node', bundle: true, metafile: true, write: false,
  });
  return result.metafile;
}

test('Bundled owners retain full legal files, without copying unrelated installed dependencies', async t => {
  const options = await fixture(t);
  await dependency(options.root, '@example/backend', '1.0.0', {
    'licenses/LICENSE': 'Backend license text', NOTICE: 'Backend attribution',
    'vendor/NOTICE.txt': 'Nested attribution', CopyrightNotice: 'Copyright holder',
  });
  await dependency(options.root, 'frontend', '2.0.0', { COPYING: 'Frontend license text' });
  await dependency(options.root, 'unused-build-tool', '3.0.0', {});
  await writeFile(options.rendererLicenseFile, JSON.stringify([{ name: 'frontend', version: '2.0.0', identifier: 'MIT', text: 'Frontend license text' }]));
  const manifest = await collectBundledLicenses({ ...options, metafile: await bundled(options.root, '@example/backend') });
  assert.deepEqual(manifest.map(entry => entry.name).sort(), ['@example/backend', 'frontend']);
  const backend = manifest.find(entry => entry.name === '@example/backend')!;
  assert.deepEqual(backend.bundles, ['backend']);
  assert.equal(backend.files.length, 4);
  const nested = backend.files.find(file => file.endsWith('/vendor/NOTICE.txt'))!;
  assert.equal(await readFile(path.join(options.outputDirectory, nested), 'utf8'), 'Nested attribution');
  assert.deepEqual(JSON.parse(await readFile(path.join(options.outputDirectory, 'manifest.json'), 'utf8')), manifest);
});

test('A NOTICE alone cannot silently replace a missing full dependency license', async t => {
  const options = await fixture(t);
  await dependency(options.root, 'missing-license', '1.0.0', { NOTICE: 'Attribution only' });
  await assert.rejects(collectBundledLicenses({ ...options, metafile: await bundled(options.root, 'missing-license') }), /no full LICENSE\/COPYING text: missing-license@1.0.0/);
  await dependency(options.root, 'nested-notice-only', '1.0.0', { 'licenses/NOTICE.txt': 'Attribution without license terms' });
  await assert.rejects(collectBundledLicenses({ ...options, metafile: await bundled(options.root, 'nested-notice-only') }), /no full LICENSE\/COPYING text: nested-notice-only@1.0.0/);
});

test('Known StyleX omission receives its full pinned license; unknown versions fail closed', async t => {
  const options = await fixture(t);
  await dependency(options.root, '@stylexjs/stylex', '0.19.2', {});
  const metafile = await bundled(options.root, '@stylexjs/stylex');
  const [entry] = await collectBundledLicenses({ ...options, metafile });
  assert.equal(entry?.source, 'https://raw.githubusercontent.com/facebook/stylex/0.19.2/LICENSE');
  const text = await readFile(path.join(options.outputDirectory, entry!.files[0]!), 'utf8');
  assert.match(text, /Copyright \(c\) Meta Platforms, Inc\. and affiliates\./);
  assert.match(text, /Permission is hereby granted/);
  await dependency(options.root, '@stylexjs/stylex', '0.19.3', {});
  await assert.rejects(collectBundledLicenses({ ...options, metafile }), /no full LICENSE\/COPYING text: @stylexjs\/stylex@0.19.3/);
});
