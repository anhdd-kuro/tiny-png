import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { APP_ID, APP_NAME } from '../src/shared/app';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'dist', `${APP_NAME}.app`);
const applications = path.join(os.homedir(), 'Applications');
const target = path.join(applications, `${APP_NAME}.app`);
const legacy = ['tiny assets.app', 'Tiny PNG.app'].map(name => path.join(applications, name));
const logPath = path.join(os.tmpdir(), `${APP_NAME.replace(/\s+/g, '-')}-startup.log`);

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `${command}: ${result.status}`);
  return result.stdout.trim();
}
const exists = (file: string): Promise<boolean> => fs.access(file).then(() => true, () => false);
function bundleValue(bundle: string, key: string): string {
  return run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, path.join(bundle, 'Contents/Info.plist')]);
}
function bundleExecutable(bundle: string): string {
  const name = bundleValue(bundle, 'CFBundleExecutable');
  if (!name || name !== path.basename(name) || name === '.' || name === '..') throw new Error('Invalid application executable.');
  return path.join(bundle, 'Contents/MacOS', name);
}
function processIds(executable: string): number[] {
  const escaped = executable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const result = spawnSync('pgrep', ['-f', `^${escaped}$`], { encoding: 'utf8' });
  if (result.error || ![0, 1].includes(result.status ?? -1)) throw result.error ?? new Error('Cannot inspect running app.');
  return result.stdout.trim().split(/\s+/).filter(Boolean).map(Number).filter(pid => Number.isInteger(pid) && pid > 0);
}
function running(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
}
async function stop(pids: number[]): Promise<void> {
  for (const pid of pids) {
    try { process.kill(pid, 'SIGTERM'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  }
  for (let attempts = 0; attempts < 100; attempts++) {
    if (!pids.some(running)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Quit ${APP_NAME} before updating it.`);
}
async function launch(bundle: string): Promise<void> {
  const log = await fs.open(logPath, 'a');
  try {
    const child = spawn(bundleExecutable(bundle), [], { detached: true, stdio: ['ignore', log.fd, log.fd] });
    await new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const exited = (code: number | null): void => { if (timer) clearTimeout(timer); reject(new Error(`Application exited during startup (${code}). See ${logPath}.`)); };
      child.once('error', reject);
      child.once('exit', exited);
      child.once('spawn', () => {
        timer = setTimeout(() => {
          child.removeListener('exit', exited);
          if (child.pid && running(child.pid)) resolve();
          else reject(new Error(`Application did not stay running. See ${logPath}.`));
        }, 1000);
      });
    });
    child.unref();
  } finally { await log.close(); }
}

async function main(): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('Install this app on macOS.');
  await fs.access(bundleExecutable(source));
  if (bundleValue(source, 'CFBundleIdentifier') !== APP_ID) throw new Error('Built app has an unexpected bundle identifier.');
  await fs.mkdir(applications, { recursive: true });
  const candidates: { bundle: string; pids: number[] }[] = [];
  const canonicalPaths = new Set<string>();
  const identities = new Set<string>();
  for (const candidate of [target, ...legacy]) {
    if (!await exists(candidate)) continue;
    const stat = await fs.lstat(candidate, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      if (candidate === target) throw new Error('The installation path is not a regular app bundle.');
      continue;
    }
    if (bundleValue(candidate, 'CFBundleIdentifier') !== APP_ID) {
      if (candidate === target) throw new Error('Another app already uses this installation path.');
      continue;
    }
    const bundle = await fs.realpath(candidate);
    const identity = `${stat.dev}:${stat.ino}`;
    if (canonicalPaths.has(bundle) || identities.has(identity)) continue;
    canonicalPaths.add(bundle);
    identities.add(identity);
    candidates.push({ bundle, pids: processIds(bundleExecutable(bundle)) });
  }
  const staging = await fs.mkdtemp(path.join(applications, '.tiny-assets-install-'));
  const next = path.join(staging, `${APP_NAME}.app`);
  const backups: { original: string; saved: string }[] = [];
  let installed = false;
  let cleanup = false;
  try {
    run('ditto', [source, next]);
    run('codesign', ['--verify', '--deep', '--strict', next]);
    for (const candidate of candidates) await stop(candidate.pids);
    for (const [index, candidate] of candidates.entries()) {
      if (bundleValue(candidate.bundle, 'CFBundleIdentifier') !== APP_ID) throw new Error('Installed app identity changed; update stopped.');
      const saved = path.join(staging, `previous-${index}.app`);
      await fs.rename(candidate.bundle, saved);
      backups.push({ original: candidate.bundle, saved });
    }
    await fs.rename(next, target);
    installed = true;
    await launch(target);
    cleanup = true;
  } catch (error) {
    try {
      if (installed) {
        await stop(processIds(bundleExecutable(target)));
        await fs.rename(target, path.join(staging, 'failed.app'));
      }
      for (const backup of [...backups].reverse()) await fs.rename(backup.saved, backup.original);
      cleanup = true;
      const previouslyRunning = candidates.find(candidate => candidate.pids.length > 0);
      if (previouslyRunning) await launch(previouslyRunning.bundle);
    } catch (rollbackError) {
      cleanup = false;
      throw new Error(`Install failed: ${String(error)}. Rollback needs attention: ${String(rollbackError)}. Backups: ${staging}`);
    }
    throw error;
  } finally {
    if (cleanup) await fs.rm(staging, { recursive: true, force: true });
  }
  console.log(`Installed and launched: ${target}\nStartup log: ${logPath}`);
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
