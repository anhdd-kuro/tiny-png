import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as stylex from '@stylexjs/stylex';
import { useAppState } from './features/application/useAppState';
import { DropZone } from './features/compression/DropZone';
import { Queue, QueueFooter } from './features/compression/Queue';
import { Settings, type SettingsCategory } from './features/settings/Settings';
import { WatchStatus } from './features/folder-watch/WatchControls';
import { controls } from './lib/controls.stylex';
import { originalTheme, theme } from './lib/theme.stylex';
import { Icon } from './lib/Icon';
import './reset.css';
import { APP_NAME } from '../shared/app';
import dino from './assets/dino.png';

function App() {
  const { state, error, clearError, run, t } = useAppState();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>('images');
  const openSettings = useCallback((category: SettingsCategory = 'images') => { setSettingsCategory(category); setSettingsOpen(true); }, []);
  useEffect(() => window.tinyPNG?.onOpenSettings(() => openSettings()), [openSettings]);
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === 'o') { event.preventDefault(); void run(() => window.tinyPNG.chooseFiles()); }
      if (event.key === ',') { event.preventDefault(); openSettings(); }
    }
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [run, openSettings]);
  useEffect(() => { document.title = APP_NAME; }, []);
  const notice = error || state?.notice;

  const glass = state?.settings.glassEnabled ?? false;
  return <div {...stylex.props(styles.app, !glass && originalTheme, !glass && styles.original)}>
    <header {...stylex.props(styles.titlebar)} data-window-drag>
      <div {...stylex.props(styles.titleActions)}>
        {state && <WatchStatus state={state} t={t} openSettings={() => openSettings('automation')} />}
        <button type="button" {...stylex.props(controls.icon)} aria-label={t('settings.heading')} title={t('settings.heading')} onClick={() => openSettings()}><Icon name="settings" /></button>
      </div>
    </header>
    <main {...stylex.props(styles.workspace)}>
      <section {...stylex.props(styles.brand)} aria-label={APP_NAME}>
        <img src={dino} alt={t('app.mascot')} {...stylex.props(styles.mascot)} draggable={false} />
        <h1 {...stylex.props(styles.heading)}>{APP_NAME}</h1>
      </section>
      <DropZone run={run} t={t} />
      {state && <Queue state={state} run={run} t={t} />}
    </main>
    {notice && <div {...stylex.props(styles.notice)} role="alert"><span>{notice}</span><button type="button" {...stylex.props(controls.icon)} aria-label={t('common.close')}
      onClick={() => { clearError(); void run(() => window.tinyPNG.dismissNotice()); }}>×</button></div>}
    {state && <><QueueFooter state={state} run={run} t={t} /><Settings state={state} open={settingsOpen} initialCategory={settingsCategory} close={() => setSettingsOpen(false)} run={run} t={t} /></>}
  </div>;
}

const styles = stylex.create({
  app: { height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: theme.material, color: theme.text, fontSize: '.8125rem' },
  original: { backgroundImage: { default: 'linear-gradient(35deg,#376eb8 0%,#3991ac 48%,#40ae8e 100%)', '@media (prefers-contrast: more)': 'none' }, backgroundColor: { default: 'transparent', '@media (prefers-contrast: more)': '#20556a' }, colorScheme: 'dark' },
  titlebar: { height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', paddingLeft: 82, paddingRight: 16, backgroundColor: theme.toolbar, backdropFilter: theme.blur },
  titleActions: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 },
  workspace: { overflowY: 'auto', flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0, paddingTop: 23, paddingBottom: 24, paddingInline: { default: 28, '@media (max-width: 740px)': 22 }, scrollbarGutter: 'stable' },
  brand: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 23 },
  mascot: { width: 48, height: 48, objectFit: 'contain' },
  heading: { fontSize: '1.5rem', letterSpacing: '-.025em', fontWeight: 650, lineHeight: 1.2, margin: 0 },
  notice: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBlock: 9, paddingInline: 24, backgroundColor: theme.dangerBackground, color: theme.danger, fontSize: '.8125rem', lineHeight: 1.5, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: theme.separator },
});

createRoot(document.getElementById('root')!).render(<App />);
