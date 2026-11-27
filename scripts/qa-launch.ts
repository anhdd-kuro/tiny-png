import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { app, nativeTheme } from 'electron';
import { DEFAULT_SETTINGS } from '../src/main/features/settings/store';

const root = process.cwd();
const qaRoot = path.join(root, 'tmp/ui-qa');
const appData = path.join(qaRoot, 'qa-app-data');
const profile = path.join(appData, 'Tiny PNG');
const settingsFile = path.join(profile, 'settings.json');
fs.mkdirSync(profile, { recursive: true });
if (!fs.existsSync(settingsFile)) {
  fs.writeFileSync(settingsFile, JSON.stringify({
    ...DEFAULT_SETTINGS,
    notificationsEnabled: false,
    cornerEnabled: false,
    watchEnabled: false,
    watchPath: null,
    s3Enabled: false,
    overwrite: false,
  }, null, 2));
}
const theme = process.env.TINY_ASSETS_QA_THEME ?? 'system';
if (theme !== 'light' && theme !== 'dark' && theme !== 'system') throw new Error('Invalid QA appearance.');
app.setPath('appData', appData);
nativeTheme.themeSource = theme;
const applicationRoot = process.env.TINY_ASSETS_QA_PACKAGED === '1' ? app.getAppPath() : root;
const require = createRequire(path.join(applicationRoot, 'package.json'));
require(path.join(applicationRoot, 'build/main/index.cjs'));
app.setName('Tiny Assets QA');
fs.writeFileSync(path.join(qaRoot, 'qa-runtime.json'), JSON.stringify({
  pid: process.pid, theme, profile, source: process.env.TINY_ASSETS_QA_PACKAGED === '1' ? 'packaged app' : 'local build', applicationRoot, appName: app.getName(),
}, null, 2));
