import { copyFile, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Metafile } from 'esbuild';

interface PackageMetadata { name: string; version: string; license?: unknown }
interface PackageOwner extends PackageMetadata { directory: string; bundles: Set<'backend' | 'renderer'> }
interface RendererLicense { name: string; version: string; identifier?: string; text?: string }
export interface LicenseManifestEntry {
  name: string;
  version: string;
  license: unknown;
  bundles: string[];
  files: string[];
  source?: string;
}

const legalName = /^(?:licen[cs]e|notice|copying|copyright)/i;
const fullLicenseName = /^(?:licen[cs]e|copying)/i;
const awsLicense = {
  file: fileURLToPath(new URL('./licenses/aws-sdk-v3.1177.0.LICENSE', import.meta.url)),
  source: 'https://raw.githubusercontent.com/aws/aws-sdk-js-v3/v3.1177.0/LICENSE',
};
const fallbacks = {
  '@aws-sdk/credential-provider-http@3.972.88': awsLicense,
  '@aws-sdk/credential-provider-login@3.972.94': awsLicense,
  '@aws-sdk/nested-clients@3.998.5': awsLicense,
  '@stylexjs/stylex@0.19.2': {
    file: fileURLToPath(new URL('./licenses/stylex-0.19.2.LICENSE', import.meta.url)),
    source: 'https://raw.githubusercontent.com/facebook/stylex/0.19.2/LICENSE',
  },
} satisfies Record<string, { file: string; source: string }>;

async function metadata(directory: string): Promise<PackageMetadata | null> {
  try {
    const value: unknown = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
    if (value && typeof value === 'object' && 'name' in value && 'version' in value && typeof value.name === 'string' && typeof value.version === 'string') {
      return value as PackageMetadata;
    }
    return null;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function inputOwner(input: string, root: string): Promise<PackageOwner | null> {
  let directory = path.dirname(path.resolve(root, input));
  if (!directory.split(path.sep).includes('node_modules')) return null;
  while (directory.split(path.sep).includes('node_modules')) {
    const info = await metadata(directory);
    if (info) return { ...info, directory: await realpath(directory), bundles: new Set(['backend']) };
    directory = path.dirname(directory);
  }
  throw new Error(`Cannot identify bundled dependency owner: ${input}`);
}

async function legalFiles(directory: string, prefix = '', insideLegalDirectory = false): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const relative = path.join(prefix, entry.name);
    const legal = legalName.test(entry.name);
    if (entry.isDirectory()) files.push(...await legalFiles(directory, relative, insideLegalDirectory || legal));
    else if ((insideLegalDirectory || legal) && (entry.isFile() || entry.isSymbolicLink() && (await stat(path.join(directory, relative))).isFile())) files.push(relative);
  }
  return files.sort();
}

export async function collectBundledLicenses(options: {
  root: string;
  metafile: Metafile;
  rendererLicenseFile: string;
  outputDirectory: string;
}): Promise<LicenseManifestEntry[]> {
  const { root, metafile, rendererLicenseFile, outputDirectory } = options;
  const owners = new Map<string, PackageOwner>();
  const inputs = new Set(Object.values(metafile.outputs).flatMap(output => Object.entries(output.inputs).filter(([, info]) => info.bytesInOutput > 0).map(([input]) => input)));
  for (const input of inputs) {
    const owner = await inputOwner(input, root);
    if (owner) owners.set(`${owner.name}@${owner.version}`, owner);
  }
  const renderer: unknown = JSON.parse(await readFile(rendererLicenseFile, 'utf8'));
  if (!Array.isArray(renderer)) throw new Error('Vite did not produce a dependency license manifest.');
  for (const entry of renderer as RendererLicense[]) {
    if (!entry || typeof entry.name !== 'string' || typeof entry.version !== 'string') throw new Error('Invalid Vite dependency license entry.');
    const key = `${entry.name}@${entry.version}`;
    const existing = owners.get(key);
    if (existing) { existing.bundles.add('renderer'); continue; }
    const directory = path.join(root, 'node_modules', entry.name);
    const info = await metadata(directory);
    if (!info || info.name !== entry.name || info.version !== entry.version) throw new Error(`Cannot locate exact bundled renderer dependency: ${key}`);
    owners.set(key, { ...info, directory: await realpath(directory), bundles: new Set(['renderer']) });
  }
  const manifest: LicenseManifestEntry[] = [];
  for (const owner of [...owners.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`))) {
    const key = `${owner.name}@${owner.version}`;
    const destination = path.join(outputDirectory, 'packages', `${encodeURIComponent(owner.name)}@${encodeURIComponent(owner.version)}`);
    const files = await legalFiles(owner.directory);
    let source: string | undefined;
    if (!files.some(file => fullLicenseName.test(path.basename(file)))) {
      const fallback = fallbacks[key as keyof typeof fallbacks];
      if (!fallback) throw new Error(`Bundled dependency has no full LICENSE/COPYING text: ${key}`);
      await mkdir(destination, { recursive: true });
      await copyFile(fallback.file, path.join(destination, 'LICENSE'));
      source = fallback.source;
    }
    for (const file of files) {
      const contents = await readFile(path.join(owner.directory, file));
      if (!contents.toString('utf8').trim()) throw new Error(`Empty legal notice in ${key}: ${file}`);
      const output = path.join(destination, file);
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, contents);
    }
    const outputFiles = [...files, ...(source ? ['LICENSE'] : [])].map(file => path.relative(outputDirectory, path.join(destination, file)).split(path.sep).join('/'));
    manifest.push({ name: owner.name, version: owner.version, license: owner.license ?? null, bundles: [...owner.bundles].sort(), files: outputFiles, ...(source ? { source } : {}) });
  }
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
