import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { AppState, Settings as Preferences, SettingsPatch, SettingsCategory } from '../../../shared/contracts';
import { LOCALES } from '../../../shared/locales';
import type { ActionRunner } from '../application/useAppState';
import type { Translator } from '../../../shared/localization';
import { WatchControls } from '../folder-watch/WatchControls';
import { History } from '../history/History';
import { Diagnostics } from '../notifications/Diagnostics';
import { controls } from '../../lib/controls.stylex';
import { theme } from '../../lib/theme.stylex';
import { Icon } from '../../lib/Icon';

interface Props { state: AppState; category: SettingsCategory; setCategory: (category: SettingsCategory) => void; run: ActionRunner; t: Translator }
function Toggle({ label, checked, disabled, change }: { label: string; checked: boolean; disabled?: boolean; change: (value: boolean) => void }) {
  return <label {...stylex.props(controls.row)}><span>{label}</span><input type="checkbox" role="switch" checked={checked} disabled={disabled}
    {...stylex.props(controls.focus, styles.toggle, checked && styles.checked)} onChange={(event) => change(event.currentTarget.checked)} /></label>;
}
function NumericSetting({ value, label, max = 32768, errorKey = 'error.dimensions', change, t }: { value: number; label: string; max?: number; errorKey?: string; change: (value: number) => void; t: Translator }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <label {...stylex.props(styles.dimension)}>{label}<input {...stylex.props(controls.focus, controls.field, styles.number)} type="number" min="1" max={max} step="1" required value={draft}
    onChange={(event) => { event.currentTarget.setCustomValidity(''); setDraft(event.currentTarget.value); }}
    onBlur={(event) => {
      const input = event.currentTarget;
      input.setCustomValidity('');
      if (!input.checkValidity() || !Number.isInteger(Number(input.value))) { input.setCustomValidity(t(errorKey)); input.reportValidity(); return; }
      if (Number(input.value) !== value) change(Number(input.value));
    }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>;
}
function Quality({ value, disabled, change, t }: { value: number; disabled: boolean; change: (value: number) => void; t: Translator }) {
  const selected = value >= 90 ? 95 : value <= 65 ? 60 : 80;
  return <fieldset {...stylex.props(styles.fieldset, styles.qualityGroup)}>
    <legend {...stylex.props(styles.qualityHeading, disabled && styles.disabledText)}>{t('settings.quality')}</legend>
    <div {...stylex.props(styles.qualityTabs)}>
      {([{ quality: 95, label: 'settings.qualityLight' }, { quality: 80, label: 'settings.qualityBalanced' }, { quality: 60, label: 'settings.qualityStrong' }] as const).map((preset) =>
        <label key={preset.quality} {...stylex.props(styles.qualityTab, selected === preset.quality && styles.qualitySelected, disabled && styles.disabledSegment, disabled && selected === preset.quality && styles.disabledSelected)}>
          <input {...stylex.props(styles.qualityInput)} type="radio" name="quality" value={preset.quality} checked={selected === preset.quality}
            onChange={() => change(preset.quality)} />
          <span>{t(preset.label)}</span>
        </label>)}
    </div>
  </fieldset>;
}

function S3Settings({ state, run, t }: Pick<Props, 'state' | 'run' | 't'>) {
  const settings = state.settings;
  const [region, setRegion] = useState(settings.s3Region);
  const [bucket, setBucket] = useState(settings.s3Bucket);
  const [prefix, setPrefix] = useState(settings.s3Prefix);
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setRegion(settings.s3Region); setBucket(settings.s3Bucket); setPrefix(settings.s3Prefix); }, [settings.s3Region, settings.s3Bucket, settings.s3Prefix]);
  useEffect(() => {
    const clearDrafts = () => { if (document.hidden) { setAccessKeyId(''); setSecretAccessKey(''); setSessionToken(''); } };
    document.addEventListener('visibilitychange', clearDrafts);
    return () => document.removeEventListener('visibilitychange', clearDrafts);
  }, []);
  const configured = state.hasS3Credentials && !!settings.s3Region.trim() && !!settings.s3Bucket.trim();
  const destinationChanged = region !== settings.s3Region || bucket !== settings.s3Bucket || prefix !== settings.s3Prefix;
  const saveDestination = () => void run(async () => {
    setSaving(true);
    try { await window.tinyPNG.updateSettings({ s3Region: region.trim(), s3Bucket: bucket.trim(), s3Prefix: prefix }); }
    finally { setSaving(false); }
  });
  const saveCredentials = () => void run(async () => {
    setSaving(true);
    try {
      await window.tinyPNG.saveS3Credentials({ accessKeyId: accessKeyId.trim(), secretAccessKey: secretAccessKey.trim(), ...(sessionToken.trim() ? { sessionToken: sessionToken.trim() } : {}) });
      setAccessKeyId(''); setSecretAccessKey(''); setSessionToken('');
    } finally { setSaving(false); }
  });

  return <fieldset {...stylex.props(styles.fieldset, controls.section)} disabled={state.isProcessing || saving}>
    <Toggle label={t('s3.enabled')} checked={settings.s3Enabled} disabled={!settings.s3Enabled && !configured}
      change={(s3Enabled) => void run(() => window.tinyPNG.updateSettings({ s3Enabled }))} />
    <p {...stylex.props(styles.note)}>{t('s3.disclosure')}</p>
    <label {...stylex.props(controls.row)}><span>{t('s3.region')}</span><input {...stylex.props(controls.focus, controls.field)} type="text" autoComplete="off" spellCheck={false} value={region} onChange={(event) => setRegion(event.currentTarget.value)} /></label>
    <label {...stylex.props(controls.row)}><span>{t('s3.bucket')}</span><input {...stylex.props(controls.focus, controls.field)} type="text" autoComplete="off" spellCheck={false} value={bucket} onChange={(event) => setBucket(event.currentTarget.value)} /></label>
    <label {...stylex.props(controls.row)}><span>{t('s3.prefix')}</span><input {...stylex.props(controls.focus, controls.field)} type="text" autoComplete="off" spellCheck={false} value={prefix} onChange={(event) => setPrefix(event.currentTarget.value)} /></label>
    <button type="button" {...stylex.props(controls.focus, controls.button, styles.saveS3)} disabled={!destinationChanged || !region.trim() || !bucket.trim()} onClick={saveDestination}>{t('s3.saveConfig')}</button>
    <p {...stylex.props(styles.credentialStatus)} role="status">{t(state.hasS3Credentials ? 's3.credentialsSaved' : 's3.notConfigured')}</p>
    <label {...stylex.props(styles.credentialField)}>{t('s3.accessKeyId')}<input {...stylex.props(controls.focus, controls.field, styles.credentialInput)} type="password" autoComplete="new-password" spellCheck={false} value={accessKeyId} onChange={(event) => setAccessKeyId(event.currentTarget.value)} /></label>
    <label {...stylex.props(styles.credentialField)}>{t('s3.secretAccessKey')}<input {...stylex.props(controls.focus, controls.field, styles.credentialInput)} type="password" autoComplete="new-password" spellCheck={false} value={secretAccessKey} onChange={(event) => setSecretAccessKey(event.currentTarget.value)} /></label>
    <label {...stylex.props(styles.credentialField)}>{t('s3.sessionToken')}<input {...stylex.props(controls.focus, controls.field, styles.credentialInput)} type="password" autoComplete="new-password" spellCheck={false} value={sessionToken} onChange={(event) => setSessionToken(event.currentTarget.value)} /></label>
    <button type="button" {...stylex.props(controls.focus, controls.button, styles.saveS3)} disabled={!accessKeyId.trim() || !secretAccessKey.trim()} onClick={saveCredentials}>{t(saving ? 's3.saving' : 's3.saveCredentials')}</button>
  </fieldset>;
}

const categories = [
  { id: 'images', label: 'settings.images', icon: 'photo' },
  { id: 'automation', label: 'settings.automation', icon: 'automation' },
  { id: 'general', label: 'settings.general', icon: 'general' },
  { id: 'cloud', label: 's3.heading', icon: 'cloud' },
  { id: 'history', label: 'history.heading', icon: 'history' },
] as const;

export function Settings({ state, category, setCategory, run, t }: Props) {
  const [testingNotification, setTestingNotification] = useState(false);
  const settings = state.settings;
  const patch = (value: SettingsPatch) => void run(() => window.tinyPNG.updateSettings(value));
  const testNotification = () => void run(async () => {
    setTestingNotification(true);
    try { await window.tinyPNG.testNotification(); }
    finally { setTestingNotification(false); }
  });
  return <main {...stylex.props(styles.window, settings.glassEnabled && styles.glass)}>
    <div {...stylex.props(styles.body)}>
      <nav {...stylex.props(styles.sidebar, settings.glassEnabled && styles.glassSidebar(`light-dark(rgba(237,237,240,${settings.glassOpacity / 100}),rgba(36,36,39,${settings.glassOpacity / 100}))`))} aria-label={t('settings.heading')}>
        {categories.map((item) => <button type="button" key={item.id} {...stylex.props(controls.focus, styles.navigation, category === item.id && styles.navigationSelected)} aria-current={category === item.id ? 'page' : undefined} onClick={() => setCategory(item.id)}>
          <Icon name={item.icon} size={16} /><span>{t(item.label)}</span>
        </button>)}
      </nav>
      <div {...stylex.props(styles.panel)} role="region" aria-label={t(categories.find((item) => item.id === category)!.label)}>
        {category === 'images' && <>
          <fieldset {...stylex.props(styles.fieldset, controls.section)} disabled={state.isProcessing}>
            <Quality value={settings.quality} disabled={state.isProcessing} change={(quality) => patch({ quality })} t={t} />
          </fieldset>
          <fieldset {...stylex.props(styles.fieldset, controls.section)} disabled={state.isProcessing}>
            <h4 {...stylex.props(controls.heading)}>{t('settings.saveHeading')}</h4>
            <Toggle label={t('settings.overwrite')} checked={settings.overwrite} change={(overwrite) => patch({ overwrite })} />
            <label {...stylex.props(controls.row)}><span>{t('settings.format')}</span><select {...stylex.props(controls.focus, controls.field)} value={settings.format} onChange={(event) => patch({ format: event.currentTarget.value as Preferences['format'] })}>
              <option value="original">{t('settings.originalFormat')}</option>{(['webp', 'jpeg', 'png', 'avif'] as const).map((format) => <option key={format} value={format}>{format === 'jpeg' ? 'JPEG' : format === 'webp' ? 'WebP' : format.toUpperCase()}</option>)}</select></label>
            <div {...stylex.props(styles.pathGroup)}><span {...stylex.props(styles.pathLabel)}>{t('settings.outputFolder')}</span><div {...stylex.props(controls.pathRow)}><span {...stylex.props(controls.path)} title={settings.outputDirectory ?? ''}>{settings.outputDirectory || t('settings.sameFolder')}</span>
              <button type="button" {...stylex.props(controls.focus, controls.button)} aria-label={t('settings.chooseOutputFolder')} onClick={() => void run(() => window.tinyPNG.chooseOutputFolder())}>{t('common.choose')}</button>
              {settings.outputDirectory && <button type="button" {...stylex.props(controls.focus, controls.button)} onClick={() => patch({ outputDirectory: null })}>{t('settings.reset')}</button>}</div></div>
          </fieldset>
          <fieldset {...stylex.props(styles.fieldset, controls.section)} disabled={state.isProcessing}>
            <Toggle label={t('settings.resize')} checked={settings.resizeEnabled} change={(resizeEnabled) => patch({ resizeEnabled })} />
            <fieldset {...stylex.props(styles.fieldset, styles.resize)} disabled={!settings.resizeEnabled}>
              <div {...stylex.props(styles.qualityTabs, styles.resizeModes)} role="radiogroup" aria-label={t('settings.resizeMode')}>
                {(['percent', 'dimensions'] as const).map((mode) => <label key={mode} {...stylex.props(styles.qualityTab, settings.resizeMode === mode && styles.qualitySelected, (!settings.resizeEnabled || state.isProcessing) && styles.disabledSegment, (!settings.resizeEnabled || state.isProcessing) && settings.resizeMode === mode && styles.disabledSelected)}>
                  <input {...stylex.props(styles.qualityInput)} type="radio" name="resize-mode" value={mode} checked={settings.resizeMode === mode} onChange={() => patch({ resizeMode: mode })} />
                  <span>{t(mode === 'percent' ? 'settings.resizePercentMode' : 'settings.resizeDimensionsMode')}</span>
                </label>)}
              </div>
              {settings.resizeMode === 'percent' ? <NumericSetting value={settings.resizePercent} label={t('settings.resizePercent')} max={100} errorKey="error.resizePercent" change={(resizePercent) => patch({ resizePercent })} t={t} /> : <>
                <label {...stylex.props(controls.row)}><span>{t('settings.method')}</span><select {...stylex.props(controls.focus, controls.field)} value={settings.resizeMethod} onChange={(event) => patch({ resizeMethod: event.currentTarget.value as Preferences['resizeMethod'] })}>
                  {(['fit', 'cover', 'scale', 'thumb'] as const).map((method) => <option key={method} value={method}>{t(`settings.method.${method}`)}</option>)}</select></label>
                <div {...stylex.props(styles.dimensions)}><NumericSetting value={settings.width} label={t('settings.width')} change={(width) => patch({ width })} t={t} />
                  {settings.resizeMethod !== 'scale' && <NumericSetting value={settings.height} label={t('settings.height')} change={(height) => patch({ height })} t={t} />}</div>
              </>}
            </fieldset>
          </fieldset>
        </>}
        {category === 'automation' && <>
          <section {...stylex.props(controls.section)}>
            <Toggle label={t('notifications.enabled')} checked={settings.notificationsEnabled} change={(notificationsEnabled) => patch({ notificationsEnabled })} />
            <div {...stylex.props(styles.notificationActions)}>
              <button type="button" {...stylex.props(controls.focus, controls.button)} onClick={() => void run(() => window.tinyPNG.openNotificationSettings())}>{t('notifications.openSettings')}</button>
              <button type="button" {...stylex.props(controls.focus, controls.button)} disabled={!settings.notificationsEnabled || testingNotification} aria-busy={testingNotification} onClick={testNotification}>{t(testingNotification ? 'notifications.testing' : 'notifications.test')}</button>
            </div>
            <Diagnostics language={settings.language} run={run} t={t} />
          </section>
          <WatchControls state={state} run={run} t={t} />
          <section {...stylex.props(controls.section)}><h4 {...stylex.props(controls.heading)}>{t('corner.heading')}</h4>
            <Toggle label={t('corner.enabled')} checked={settings.cornerEnabled} change={(cornerEnabled) => patch({ cornerEnabled })} />
            <label {...stylex.props(controls.row)}><span>{t('corner.mode')}</span><select {...stylex.props(controls.focus, controls.field)} disabled={!settings.cornerEnabled} value={settings.cornerMode} onChange={(event) => patch({ cornerMode: event.currentTarget.value as Preferences['cornerMode'] })}>
              <option value="always">{t('corner.always')}</option><option value="nearby">{t('corner.nearby')}</option></select></label>
            <label {...stylex.props(controls.row)}><span>{t('corner.position')}</span><select {...stylex.props(controls.focus, controls.field)} disabled={!settings.cornerEnabled} value={settings.dropCorner} onChange={(event) => patch({ dropCorner: event.currentTarget.value as Preferences['dropCorner'] })}>
              {(['topCenter', 'topRight', 'bottomRight', 'topLeft', 'bottomLeft'] as const).map((corner) => <option key={corner} value={corner}>{t(`corner.${corner}`)}</option>)}</select></label>
          </section>
        </>}
        {category === 'general' && <section {...stylex.props(controls.section)}>
          <label {...stylex.props(controls.row)}><span>{t('settings.language')}</span><select {...stylex.props(controls.focus, controls.field)} value={settings.language} onChange={(event) => patch({ language: event.currentTarget.value as Preferences['language'] })}>
            {LOCALES.map((language) => <option key={language} value={language}>{({ en: 'English', vi: 'Tiếng Việt', ja: '日本語' })[language]}</option>)}</select></label>
          <div {...stylex.props(controls.row)}>
            <span>{t('settings.background')}</span>
            <div {...stylex.props(styles.qualityTabs, styles.backgroundTabs)} role="radiogroup" aria-label={t('settings.background')}>
              {(['gradient', 'solid'] as const).map((backgroundStyle) => <label key={backgroundStyle} {...stylex.props(styles.qualityTab, styles.backgroundTab, settings.backgroundStyle === backgroundStyle && styles.qualitySelected)}>
                <input {...stylex.props(styles.qualityInput)} type="radio" name="background-style" value={backgroundStyle} checked={settings.backgroundStyle === backgroundStyle} onChange={() => patch({ backgroundStyle })} />
                <span>{t(`settings.background.${backgroundStyle}`)}</span>
              </label>)}
            </div>
          </div>
          <Toggle label={t('settings.glass')} checked={settings.glassEnabled} change={(glassEnabled) => patch({ glassEnabled })} />
          <label {...stylex.props(controls.row)}><span>{t('settings.glassOpacity')}</span><span {...stylex.props(styles.opacityControl)}>
            <input {...stylex.props(controls.focus, styles.opacityRange)} type="range" min="20" max="100" step="1" value={settings.glassOpacity} disabled={!settings.glassEnabled} aria-valuetext={`${settings.glassOpacity}%`} onChange={(event) => patch({ glassOpacity: Number(event.currentTarget.value) })} />
            <output aria-hidden="true" {...stylex.props(styles.opacityValue)}>{settings.glassOpacity}%</output>
          </span></label>
        </section>}
        {category === 'cloud' && <S3Settings state={state} run={run} t={t} />}
        {category === 'history' && <History entries={state.history} language={settings.language} run={run} t={t} />}
      </div>
    </div>
  </main>;
}

const styles = stylex.create({
  window: { height: '100%', color: theme.text, backgroundColor: theme.canvas, fontSize: '.8125rem', lineHeight: '18px' },
  glass: { backgroundColor: { default: 'transparent', '@media (prefers-reduced-transparency: reduce)': theme.sidebar, '@media (prefers-contrast: more)': theme.sidebar } },
  glassSidebar: (color: string) => ({ backgroundColor: { default: color, '@media (prefers-reduced-transparency: reduce)': theme.sidebar, '@media (prefers-contrast: more)': theme.sidebar } }),
  opacityControl: { display: 'flex', alignItems: 'center', gap: 8, width: 224 },
  opacityRange: { appearance: 'auto', accentColor: theme.accent, height: 28, minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: 0, margin: 0 },
  opacityValue: { width: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: '.8125rem', color: theme.secondary },
  disabledText: { color: theme.disabledText },
  pathLabel: { fontSize: '.8125rem', lineHeight: '18px', fontWeight: 400 },
  backgroundTabs: { gridTemplateColumns: 'repeat(2,minmax(0,1fr))', width: 224, height: 28 },
  backgroundTab: { minHeight: 22, paddingBlock: 1, paddingInline: 8, borderRadius: 4, lineHeight: '18px' },
  pathGroup: { display: 'flex', flexDirection: 'column', gap: 8 },
  body: { display: 'flex', height: '100%', minHeight: 0 },
  sidebar: { display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, width: 156, paddingBlock: 16, paddingInline: 8, backgroundColor: theme.sidebar, borderRightWidth: 1, borderRightStyle: 'solid', borderRightColor: theme.separator, overflowY: 'auto' },
  navigation: { display: 'flex', flexShrink: 0, alignItems: 'center', gap: 8, width: '100%', minHeight: 32, paddingBlock: 7, paddingInline: 8, textAlign: 'left', fontSize: '.8125rem', fontWeight: 500, color: theme.text, borderWidth: 0, borderStyle: 'solid', borderColor: 'transparent', borderRadius: 6, backgroundColor: { default: 'transparent', ':hover': theme.controlHover, ':active': theme.controlPressed } },
  navigationSelected: { backgroundColor: theme.accentTint, color: theme.accent },
  panel: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, overflowY: 'auto', padding: 24, backgroundColor: theme.canvas },
  fieldset: { borderWidth: 0, borderStyle: 'solid', borderColor: 'transparent', margin: 0, minWidth: 0 },
  resize: { display: 'flex', flexDirection: 'column', gap: 12, padding: 0 },
  dimensions: { display: 'flex', flexDirection: 'column', gap: 12 }, dimension: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 224px', alignItems: 'center', gap: 16, fontSize: '.8125rem', color: { default: theme.text, ':has(:disabled)': theme.disabledText }, lineHeight: '18px' }, number: { width: 104, justifySelf: 'end', fontVariantNumeric: 'tabular-nums' },
  toggle: { appearance: 'none', position: 'relative', flexShrink: 0, width: 32, height: 18, borderRadius: 18, backgroundColor: theme.border, cursor: 'default', margin: 0, justifySelf: 'end', '::after': { content: '""', position: 'absolute', top: 2, left: 2, height: 14, width: 14, borderRadius: '50%', backgroundColor: '#ffffff', transform: 'translateX(0)' } },
  checked: { backgroundColor: theme.accent, '::after': { transform: 'translateX(14px)' } },
  qualityGroup: { paddingBlock: 0 }, qualityHeading: { fontSize: '.8125rem', fontWeight: 600, marginBottom: 16, padding: 0 },
  qualityTabs: { display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 2, padding: 2, borderWidth: 1, borderStyle: 'solid', borderColor: theme.separator, borderRadius: 6, backgroundColor: theme.segmentTrack },
  qualityTab: { position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 40, paddingBlock: 4, paddingInline: 8, borderRadius: 5, color: theme.secondary, fontSize: '.75rem', fontWeight: 500, lineHeight: 1.35, textAlign: 'center', cursor: 'default', backgroundColor: { default: 'transparent', ':hover': theme.controlHover, ':active': theme.controlPressed }, outlineStyle: { default: 'none', ':focus-within': 'solid' }, outlineWidth: 3, outlineColor: theme.focus, outlineOffset: 1 },
  resizeModes: { gridTemplateColumns: 'repeat(2,minmax(0,1fr))', minHeight: 32 }, qualitySelected: { color: theme.selectionText, backgroundColor: theme.selection, boxShadow: '0 1px 3px rgba(0,0,0,.12)' },
  disabledSegment: { color: theme.disabledText, cursor: 'default', boxShadow: 'none', backgroundColor: { default: 'transparent', ':hover': 'transparent', ':active': 'transparent' } },
  disabledSelected: { color: theme.disabledText, boxShadow: 'none', backgroundColor: { default: theme.disabledSelection, ':hover': theme.disabledSelection, ':active': theme.disabledSelection } },
  qualityInput: { position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', margin: 0, cursor: 'default' },
  note: { fontSize: '.75rem', color: theme.secondary, lineHeight: 1.5, margin: 0 }, credentialStatus: { fontSize: '.75rem', color: theme.secondary, marginTop: 4, marginBottom: 0 },
  notificationActions: { display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
  credentialField: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 224px', alignItems: 'center', gap: 16, fontSize: '.8125rem', color: { default: theme.text, ':has(:disabled)': theme.disabledText } }, credentialInput: { width: 224, maxWidth: '100%' }, saveS3: { alignSelf: 'flex-end' },
});
