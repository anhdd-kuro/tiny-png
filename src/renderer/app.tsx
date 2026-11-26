import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import * as stylex from '@stylexjs/stylex';
import { useAppState } from './features/application/useAppState';
import { DropZone } from './features/compression/DropZone';
import { Queue, QueueFooter } from './features/compression/Queue';
import { WatchStatus } from './features/folder-watch/WatchControls';
import { controls } from './lib/controls.stylex';
import { originalTheme, theme } from './lib/theme.stylex';
import { Icon } from './lib/Icon';
import './reset.css';
import { APP_NAME } from '../shared/app';
import dino from './assets/dino.png';

function App() {
  const { state, error, clearError, run, t } = useAppState();
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === 'o') { event.preventDefault(); void run(() => window.tinyPNG.chooseFiles()); }
      if (event.key === ',') { event.preventDefault(); void run(() => window.tinyPNG.openSettings()); }
    }
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [run]);
  useEffect(() => { document.title = APP_NAME; }, []);
  const notice = error || state?.notice;
  const populated = !!state?.jobs.length;
  const glass = state?.settings.glassEnabled ?? false;
  return <div {...stylex.props(styles.app, originalTheme)}>
    <header {...stylex.props(styles.titlebar, glass && styles.glassChrome)} data-window-drag>
      <div {...stylex.props(styles.brand)}>
        <img src={dino} alt={t('app.mascot')} {...stylex.props(styles.mascot)} draggable={false} />
        <h1 {...stylex.props(styles.heading)}>{APP_NAME}</h1>
      </div>
      <div {...stylex.props(styles.titleActions)}>
        {state && <WatchStatus state={state} t={t} openSettings={() => void run(() => window.tinyPNG.openSettings('automation'))} />}
        <button type="button" {...stylex.props(controls.icon)} aria-label={t('settings.heading')} title={`${t('settings.heading')} (⌘,)`} onClick={() => void run(() => window.tinyPNG.openSettings())}><Icon name="settings" size={16} /></button>
      </div>
    </header>
    <main {...stylex.props(styles.workspace, !populated && styles.empty)}>
      <DropZone run={run} t={t} compact={populated} />
      {state && <Queue state={state} run={run} t={t} />}
    </main>
    {notice && <div {...stylex.props(styles.notice)} role="alert"><span>{notice}</span><button type="button" {...stylex.props(controls.icon)} aria-label={t('common.close')}
      onClick={() => { clearError(); void run(() => window.tinyPNG.dismissNotice()); }}><Icon name="close" size={16} /></button></div>}
    {state && <QueueFooter state={state} run={run} t={t} glass={glass} />}
  </div>;
}

const styles = stylex.create({
  app: { height: '100%', display: 'flex', flexDirection: 'column', backgroundImage: { default: 'linear-gradient(35deg,#376eb8 0%,#3991ac 48%,#40ae8e 100%)', '@media (prefers-contrast: more)': 'none' }, backgroundColor: '#20556a', colorScheme: 'dark', color: theme.text, fontSize: '.8125rem', lineHeight: '18px' },
  titlebar: { height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16, paddingLeft: 82, paddingRight: 16, backgroundColor: 'rgba(12,12,12,.35)', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'rgba(255,255,255,.1)' },
  glassChrome: { boxShadow: 'inset 0 1px rgba(255,255,255,.12)', backgroundColor: { default: 'rgba(5,35,41,.45)', '@media (prefers-reduced-transparency: reduce)': '#316d87', '@media (prefers-contrast: more)': '#20556a' }, backdropFilter: { default: 'blur(24px) saturate(160%)', '@media (prefers-reduced-transparency: reduce)': 'none', '@media (prefers-contrast: more)': 'none' } },
  brand: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  mascot: { width: 28, height: 28, objectFit: 'contain' },
  heading: { fontSize: '1.0625rem', letterSpacing: '-.02em', fontWeight: 600, lineHeight: '22px', margin: 0, whiteSpace: 'nowrap' },
  titleActions: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 },
  workspace: { overflowY: 'auto', flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0, padding: 20, scrollbarGutter: 'stable' },
  empty: { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' },
  notice: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingBlock: 8, paddingInline: 20, backgroundColor: theme.dangerBackground, color: theme.danger, fontSize: '.8125rem', lineHeight: '18px', borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: theme.separator },
});

createRoot(document.getElementById('root')!).render(<App />);
