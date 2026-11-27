import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { NotificationIdentity } from '../../../shared/notifications';

export function readNotificationIdentity(executable: string, appId: string, version: string): NotificationIdentity {
  const identity: NotificationIdentity = { appId, version, mode: 'unknown', codeHash: null, requirement: null, changedSinceLastRun: null };
  if (process.platform !== 'darwin') return identity;
  const bundle = path.resolve(executable, '../../..');
  if (!bundle.endsWith('.app')) return identity;
  const details = spawnSync('/usr/bin/codesign', ['-dv', '--verbose=4', bundle], { encoding: 'utf8', timeout: 5000 });
  if (details.status !== 0) return identity;
  const output = details.stderr;
  identity.appId = /^Identifier=(.+)$/m.exec(output)?.[1] ?? appId;
  identity.mode = /^Signature=adhoc$/m.test(output) ? 'adhoc' : /^Authority=/m.test(output) ? 'certificate' : 'unknown';
  identity.codeHash = /^CDHash=([a-fA-F0-9]+)$/m.exec(output)?.[1] ?? null;
  const requirements = spawnSync('/usr/bin/codesign', ['-dr', '-', bundle], { encoding: 'utf8', timeout: 5000 });
  if (requirements.status === 0) identity.requirement = /^#?\s*designated => (.+)$/m.exec(requirements.stderr + requirements.stdout)?.[1]?.slice(0, 8192) ?? null;
  return identity;
}
