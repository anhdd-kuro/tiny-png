import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { AppState, Settings as Preferences, SettingsPatch } from '../../../shared/contracts';
import { LOCALES } from '../../../shared/locales';
import type { ActionRunner } from '../application/useAppState';
import type { Translator } from '../localization/i18n';
import { WatchControls } from '../folder-watch/WatchControls';
import { controls } from '../../lib/controls.stylex';
import { theme } from '../../lib/theme.stylex';
import { Icon } from '../../lib/Icon';

interface Props { state: AppState; open: boolean; initialCategory?: SettingsCategory; close: () => void; run: ActionRunner; t: Translator }
function Toggle({ label, checked, disabled, change }: { label: string; checked: boolean; disabled?: boolean; change: (value: boolean) => void }) {
  return <label {...stylex.props(controls.row)}><span>{label}</span><input type="checkbox" role="switch" checked={checked} disabled={disabled}
    {...stylex.props(styles.toggle, checked && styles.checked)} onChange={(event) => change(event.currentTarget.checked)} /></label>;
}
function NumericSetting({ value, label, max = 32768, errorKey = 'error.dimensions', change, t }: { value: number; label: string; max?: number; errorKey?: string; change: (value: number) => void; t: Translator }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <label {...stylex.props(styles.dimension)}>{label}<input {...stylex.props(controls.field, styles.number)} type="number" min="1" max={max} step="1" required value={draft}
    onChange={(event) => { event.currentTarget.setCustomValidity(''); setDraft(event.currentTarget.value); }}
    onBlur={(event) => {
      const input = event.currentTarget;
      input.setCustomValidity('');
      if (!input.checkValidity() || !Number.isInteger(Number(input.value))) { input.setCustomValidity(t(errorKey)); input.reportValidity(); return; }
      if (Number(input.value) !== value) change(Number(input.value));
    }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>;
}
function Quality({ value, change, t }: { value: number; change: (value: number) => void; t: Translator }) {
  const selected = value >= 90 ? 95 : value <= 65 ? 60 : 80;
  return <fieldset {...stylex.props(styles.fieldset, styles.qualityGroup)}>
    <legend {...stylex.props(styles.qualityHeading)}>{t('settings.quality')}</legend>
    <div {...stylex.props(styles.qualityTabs)}>
      {([{ quality: 95, label: 'settings.qualityLight' }, { quality: 80, label: 'settings.qualityBalanced' }, { quality: 60, label: 'settings.qualityStrong' }] as const).map((preset) =>
        <label key={preset.quality} {...stylex.props(styles.qualityTab, selected === preset.quality && styles.qualitySelected)}>
          <input {...stylex.props(styles.qualityInput)} type="radio" name="quality" value={preset.quality} checked={selected === preset.quality}
            onChange={() => change(preset.quality)} />
          <span>{t(preset.label)}</span>
        </label>)}
    </div>
  </fieldset>;
}

function S3Settings({ state, open, run, t }: Pick<Props, 'state' | 'open' | 'run' | 't'>) {
  const settings = state.settings;
  const [region, setRegion] = useState(settings.s3Region);
  const [bucket, setBucket] = useState(settings.s3Bucket);
  const [prefix, setPrefix] = useState(settings.s3Prefix);
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => { setRegion(settings.s3Region); setBucket(settings.s3Bucket); setPrefix(settings.s3Prefix); }, [settings.s3Region, settings.s3Bucket, settings.s3Prefix]);
  useEffect(() => {
    if (!open) { setAccessKeyId(''); setSecretAccessKey(''); setSessionToken(''); setFailure(null); }
  }, [open]);
  const configured = state.hasS3Credentials && !!settings.s3Region.trim() && !!settings.s3Bucket.trim();
  const destinationChanged = region !== settings.s3Region || bucket !== settings.s3Bucket || prefix !== settings.s3Prefix;
  const saveDestination = () => void run(async () => {
    setSaving(true); setFailure(null);
    try { await window.tinyPNG.updateSettings({ s3Region: region.trim(), s3Bucket: bucket.trim(), s3Prefix: prefix }); }
    catch (error) { setFailure(error instanceof Error ? error.message : t('error.s3Config')); throw error; }
    finally { setSaving(false); }
  });
  const saveCredentials = () => void run(async () => {
    setSaving(true); setFailure(null);
    try {
      await window.tinyPNG.saveS3Credentials({ accessKeyId: accessKeyId.trim(), secretAccessKey: secretAccessKey.trim(), ...(sessionToken.trim() ? { sessionToken: sessionToken.trim() } : {}) });
      setAccessKeyId(''); setSecretAccessKey(''); setSessionToken('');
    } catch (error) { setFailure(error instanceof Error ? error.message : t('error.s3Credentials')); throw error; }
    finally { setSaving(false); }
  });

  return <fieldset {...stylex.props(styles.fieldset, controls.section)} disabled={state.isProcessing || saving}>
    <Toggle label={t('s3.enabled')} checked={settings.s3Enabled} disabled={!settings.s3Enabled && !configured}
      change={(s3Enabled) => void run(() => window.tinyPNG.updateSettings({ s3Enabled }))} />
    <p {...stylex.props(styles.note)}>{t('s3.disclosure')}</p>
    <label {...stylex.props(controls.row)}><span>{t('s3.region')}</span><input {...stylex.props(controls.field)} type="text" autoComplete="off" spellCheck={false} value={region} onChange={(event) => setRegion(event.currentTarget.value)} /></label>
    <label {...stylex.props(controls.row)}><span>{t('s3.bucket')}</span><input {...stylex.props(controls.field)} type="text" autoComplete="off" spellCheck={false} value={bucket} onChange={(event) => setBucket(event.currentTarget.value)} /></label>
    <label {...stylex.props(controls.row)}><span>{t('s3.prefix')}</span><input {...stylex.props(controls.field)} type="text" autoComplete="off" spellCheck={false} value={prefix} onChange={(event) => setPrefix(event.currentTarget.value)} /></label>
    <button type="button" {...stylex.props(controls.button, styles.saveS3)} disabled={!destinationChanged || !region.trim() || !bucket.trim()} onClick={saveDestination}>{t('s3.saveConfig')}</button>
    <p {...stylex.props(styles.credentialStatus)} role="status">{t(state.hasS3Credentials ? 's3.credentialsSaved' : 's3.notConfigured')}</p>
    <label {...stylex.props(styles.credentialField)}>{t('s3.accessKeyId')}<input {...stylex.props(controls.field, styles.credentialInput)} type="password" autoComplete="new-password" spellCheck={false} value={accessKeyId} onChange={(event) => setAccessKeyId(event.currentTarget.value)} /></label>
    <label {...stylex.props(styles.credentialField)}>{t('s3.secretAccessKey')}<input {...stylex.props(controls.field, styles.credentialInput)} type="password" autoComplete="new-password" spellCheck={false} value={secretAccessKey} onChange={(event) => setSecretAccessKey(event.currentTarget.value)} /></label>
    <label {...stylex.props(styles.credentialField)}>{t('s3.sessionToken')}<input {...stylex.props(controls.field, styles.credentialInput)} type="password" autoComplete="new-password" spellCheck={false} value={sessionToken} onChange={(event) => setSessionToken(event.currentTarget.value)} /></label>
    <button type="button" {...stylex.props(controls.button, styles.saveS3)} disabled={!accessKeyId.trim() || !secretAccessKey.trim()} onClick={saveCredentials}>{t(saving ? 's3.saving' : 's3.saveCredentials')}</button>
    {failure && <p {...stylex.props(styles.failure)} role="alert">{failure}</p>}
  </fieldset>;
}

export type SettingsCategory = 'images' | 'automation' | 'general' | 'cloud';
const categories = [
  { id: 'images', label: 'settings.images', icon: 'photo' },
  { id: 'automation', label: 'settings.automation', icon: 'automation' },
  { id: 'general', label: 'settings.general', icon: 'general' },
  { id: 'cloud', label: 's3.heading', icon: 'cloud' },
] as const;

export function Settings({ state, open, initialCategory = 'images', close, run, t }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [category, setCategory] = useState<SettingsCategory>('images');
  const settings = state.settings;
  const patch = (value: SettingsPatch) => void run(() => window.tinyPNG.updateSettings(value));
  useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      element.showModal();
    } else if (!open && element?.open) {
      element.close();
      if (previousFocus.current?.isConnected) previousFocus.current.focus();
    }
  }, [open]);
  useEffect(() => { if (open) setCategory(initialCategory); }, [open, initialCategory]);

  return <dialog ref={dialog} {...stylex.props(styles.dialog, !settings.glassEnabled && styles.solidDialog)} aria-labelledby="settings-title" onClose={close} onCancel={(event) => { event.preventDefault(); close(); }}>
    <header {...stylex.props(styles.header)}>
      <button type="button" {...stylex.props(controls.icon, styles.close)} aria-label={t('common.close')} onClick={close}><Icon name="close" size={15} /></button>
      <h2 id="settings-title" {...stylex.props(styles.title)}>{t('settings.heading')}</h2>
    </header>
    <div {...stylex.props(styles.body)}>
      <nav {...stylex.props(styles.sidebar)} aria-label={t('settings.heading')}>
        {categories.map((item) => <button type="button" key={item.id} {...stylex.props(styles.navigation, category === item.id && styles.navigationSelected)} aria-current={category === item.id ? 'page' : undefined} onClick={() => setCategory(item.id)}>
          <Icon name={item.icon} size={17} /><span>{t(item.label)}</span>
        </button>)}
      </nav>
      <div {...stylex.props(styles.panel)} aria-labelledby="settings-category">
        <h3 id="settings-category" {...stylex.props(styles.categoryTitle)}>{t(categories.find((item) => item.id === category)!.label)}</h3>
        {state.notice && category !== 'cloud' && <div {...stylex.props(styles.inlineNotice)} role="alert"><span>{state.notice}</span><button type="button" {...stylex.props(controls.icon)} aria-label={t('common.close')} onClick={() => void run(() => window.tinyPNG.dismissNotice())}><Icon name="close" size={14} /></button></div>}
        {category === 'images' && <>
          <fieldset {...stylex.props(styles.fieldset, controls.section)} disabled={state.isProcessing}>
            <Quality value={settings.quality} change={(quality) => patch({ quality })} t={t} />
          </fieldset>
          <fieldset {...stylex.props(styles.fieldset, controls.section)} disabled={state.isProcessing}>
            <h4 {...stylex.props(controls.heading)}>{t('settings.saveHeading')}</h4>
            <Toggle label={t('settings.overwrite')} checked={settings.overwrite} change={(overwrite) => {
              if (!overwrite || window.confirm(t('settings.overwriteConfirm'))) patch({ overwrite });
            }} />
            <label {...stylex.props(controls.row)}><span>{t('settings.format')}</span><select {...stylex.props(controls.field)} value={settings.format} onChange={(event) => patch({ format: event.currentTarget.value as Preferences['format'] })}>
              <option value="original">{t('settings.originalFormat')}</option>{(['webp', 'jpeg', 'png', 'avif'] as const).map((format) => <option key={format} value={format}>{format === 'jpeg' ? 'JPEG' : format === 'webp' ? 'WebP' : format.toUpperCase()}</option>)}</select></label>
            <div {...stylex.props(controls.pathRow)}><span {...stylex.props(controls.path)} title={settings.outputDirectory ?? ''}>{settings.outputDirectory || t('settings.sameFolder')}</span>
              <button type="button" {...stylex.props(controls.button)} onClick={() => void run(() => window.tinyPNG.chooseOutputFolder())}>{t('common.choose')}</button>
              {settings.outputDirectory && <button type="button" {...stylex.props(controls.button)} onClick={() => patch({ outputDirectory: null })}>{t('settings.reset')}</button>}</div>
          </fieldset>
          <fieldset {...stylex.props(styles.fieldset, controls.section)} disabled={state.isProcessing}>
            <Toggle label={t('settings.resize')} checked={settings.resizeEnabled} change={(resizeEnabled) => patch({ resizeEnabled })} />
            <fieldset {...stylex.props(styles.fieldset, styles.resize)} disabled={!settings.resizeEnabled}>
              <div {...stylex.props(styles.qualityTabs, styles.resizeModes)} role="radiogroup" aria-label={t('settings.resizeMode')}>
                {(['percent', 'dimensions'] as const).map((mode) => <label key={mode} {...stylex.props(styles.qualityTab, settings.resizeMode === mode && styles.qualitySelected)}>
                  <input {...stylex.props(styles.qualityInput)} type="radio" name="resize-mode" value={mode} checked={settings.resizeMode === mode} onChange={() => patch({ resizeMode: mode })} />
                  <span>{t(mode === 'percent' ? 'settings.resizePercentMode' : 'settings.resizeDimensionsMode')}</span>
                </label>)}
              </div>
              {settings.resizeMode === 'percent' ? <NumericSetting value={settings.resizePercent} label={t('settings.resizePercent')} max={100} errorKey="error.resizePercent" change={(resizePercent) => patch({ resizePercent })} t={t} /> : <>
                <label {...stylex.props(controls.row)}><span>{t('settings.method')}</span><select {...stylex.props(controls.field)} value={settings.resizeMethod} onChange={(event) => patch({ resizeMethod: event.currentTarget.value as Preferences['resizeMethod'] })}>
                  {(['fit', 'cover', 'scale', 'thumb'] as const).map((method) => <option key={method} value={method}>{method[0]!.toUpperCase() + method.slice(1)}</option>)}</select></label>
                <div {...stylex.props(styles.dimensions)}><NumericSetting value={settings.width} label={t('settings.width')} change={(width) => patch({ width })} t={t} />
                  {settings.resizeMethod !== 'scale' && <NumericSetting value={settings.height} label={t('settings.height')} change={(height) => patch({ height })} t={t} />}</div>
              </>}
            </fieldset>
          </fieldset>
        </>}
        {category === 'automation' && <>
          <section {...stylex.props(controls.section)}><Toggle label={t('notifications.enabled')} checked={settings.notificationsEnabled} change={(notificationsEnabled) => patch({ notificationsEnabled })} /></section>
          <WatchControls state={state} run={run} t={t} />
          <section {...stylex.props(controls.section)}><h4 {...stylex.props(controls.heading)}>{t('corner.heading')}</h4>
            <Toggle label={t('corner.enabled')} checked={settings.cornerEnabled} change={(cornerEnabled) => patch({ cornerEnabled })} />
            <label {...stylex.props(controls.row)}><span>{t('corner.mode')}</span><select {...stylex.props(controls.field)} disabled={!settings.cornerEnabled} value={settings.cornerMode} onChange={(event) => patch({ cornerMode: event.currentTarget.value as Preferences['cornerMode'] })}>
              <option value="always">{t('corner.always')}</option><option value="nearby">{t('corner.nearby')}</option></select></label>
            <label {...stylex.props(controls.row)}><span>{t('corner.position')}</span><select {...stylex.props(controls.field)} disabled={!settings.cornerEnabled} value={settings.dropCorner} onChange={(event) => patch({ dropCorner: event.currentTarget.value as Preferences['dropCorner'] })}>
              {(['topCenter', 'topRight', 'bottomRight', 'topLeft', 'bottomLeft'] as const).map((corner) => <option key={corner} value={corner}>{t(`corner.${corner}`)}</option>)}</select></label>
          </section>
        </>}
        {category === 'general' && <section {...stylex.props(controls.section)}>
          <label {...stylex.props(controls.row)}><span>{t('settings.language')}</span><select {...stylex.props(controls.field)} value={settings.language} onChange={(event) => patch({ language: event.currentTarget.value as Preferences['language'] })}>
            {LOCALES.map((language) => <option key={language} value={language}>{({ en: 'English', vi: 'Tiếng Việt', ja: '日本語' })[language]}</option>)}</select></label>
          <Toggle label={t('settings.glass')} checked={settings.glassEnabled} change={(glassEnabled) => patch({ glassEnabled })} />
        </section>}
        {category === 'cloud' && <S3Settings state={state} open={open} run={run} t={t} />}
      </div>
    </div>
  </dialog>;
}

const styles = stylex.create({
  dialog: { width: 760, height: 'min(620px,calc(100vh - 48px))', maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 48px)', padding: 0, color: theme.text, borderWidth: 1, borderStyle: 'solid', borderColor: theme.border, borderRadius: 12, backgroundColor: theme.material, backdropFilter: theme.blur, boxShadow: '0 22px 70px rgba(0,0,0,.28)', overflow: 'hidden', '::backdrop': { backgroundColor: 'rgba(0,0,0,.25)' } },
  solidDialog: { backgroundColor: theme.canvas, backdropFilter: 'none' },
  header: { height: 49, paddingInline: 13, display: 'flex', alignItems: 'center', gap: 11, backgroundColor: theme.toolbar },
  close: { width: 24, height: 24 }, title: { margin: 0, fontSize: '.875rem', fontWeight: 600, letterSpacing: '-.01em' },
  body: { display: 'flex', height: 'calc(100% - 49px)', minHeight: 0 },
  sidebar: { flexShrink: 0, width: { default: 164, '@media (max-width: 700px)': 148 }, paddingBlock: 12, paddingInline: 9, backgroundColor: theme.sidebar, overflowY: 'auto' },
  navigation: { display: 'flex', alignItems: 'center', gap: 9, width: '100%', minHeight: 36, paddingBlock: 8, paddingInline: 10, textAlign: 'left', fontSize: '.8125rem', fontWeight: 500, color: theme.text, borderWidth: 0, borderStyle: 'solid', borderColor: 'transparent', borderRadius: 6, backgroundColor: { default: 'transparent', ':hover': theme.controlHover, ':active': theme.controlPressed } },
  navigationSelected: { backgroundColor: theme.accentTint, color: theme.accent },
  panel: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, overflowY: 'auto', paddingBlock: 23, paddingInline: { default: 25, '@media (max-width: 700px)': 19 }, backgroundColor: theme.surface },
  categoryTitle: { fontSize: '1.125rem', fontWeight: 600, letterSpacing: '-.015em', lineHeight: 1.3, marginTop: 0, marginBottom: 3 },
  fieldset: { borderWidth: 0, borderStyle: 'solid', borderColor: 'transparent', paddingInline: 0, margin: 0, minWidth: 0, opacity: { default: 1, ':disabled': .5 } },
  resize: { display: 'flex', flexDirection: 'column', gap: 14, padding: 0 },
  dimensions: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }, dimension: { display: 'flex', flexDirection: 'column', gap: 7, fontSize: '.75rem', color: theme.secondary }, number: { width: '100%', maxWidth: '100%', fontVariantNumeric: 'tabular-nums' },
  toggle: { appearance: 'none', position: 'relative', flexShrink: 0, width: 32, height: 18, borderRadius: 18, backgroundColor: theme.border, cursor: 'pointer', margin: 0, '::after': { content: '""', position: 'absolute', top: 2, left: 2, height: 14, width: 14, borderRadius: '50%', backgroundColor: '#ffffff', transform: 'translateX(0)' } },
  checked: { backgroundColor: theme.accent, '::after': { transform: 'translateX(14px)' } },
  qualityGroup: { paddingBlock: 0 }, qualityHeading: { fontSize: '.8125rem', fontWeight: 600, marginBottom: 12, padding: 0 },
  qualityTabs: { display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 2, padding: 2, borderWidth: 1, borderStyle: 'solid', borderColor: theme.separator, borderRadius: 7, backgroundColor: theme.canvas },
  qualityTab: { position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 30, paddingBlock: 6, paddingInline: 7, borderRadius: 5, color: theme.secondary, fontSize: '.75rem', fontWeight: 500, lineHeight: 1.35, textAlign: 'center', cursor: 'pointer', backgroundColor: { default: 'transparent', ':hover': theme.controlHover, ':active': theme.controlPressed }, outlineStyle: { default: 'none', ':focus-within': 'solid' }, outlineWidth: 2, outlineColor: theme.accent, outlineOffset: 1 },
  resizeModes: { gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }, qualitySelected: { color: theme.selectionText, backgroundColor: theme.selection, boxShadow: '0 1px 3px rgba(0,0,0,.12)' },
  qualityInput: { position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', margin: 0, cursor: 'pointer' },
  note: { fontSize: '.75rem', color: theme.secondary, lineHeight: 1.5, margin: 0 }, credentialStatus: { fontSize: '.75rem', color: theme.secondary, marginTop: 4, marginBottom: 0 },
  credentialField: { display: 'flex', flexDirection: 'column', gap: 7, fontSize: '.75rem', color: theme.secondary }, credentialInput: { width: '100%', maxWidth: '100%' }, saveS3: { alignSelf: 'flex-end' },
  failure: { fontSize: '.75rem', color: theme.danger, lineHeight: 1.5, margin: 0, overflowWrap: 'anywhere' },
  inlineNotice: { display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', padding: 9, marginTop: 14, borderRadius: 6, color: theme.danger, backgroundColor: theme.dangerBackground, fontSize: '.75rem', lineHeight: 1.5 },
});
