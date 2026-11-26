import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as stylex from '@stylexjs/stylex';
import type { SettingsCategory } from '../shared/contracts';
import { useAppState } from './features/application/useAppState';
import { Settings } from './features/settings/Settings';
import { controls } from './lib/controls.stylex';
import { Icon } from './lib/Icon';
import { theme } from './lib/theme.stylex';
import './reset.css';

const validCategories = ['images', 'automation', 'general', 'cloud', 'history'] as const;
function initialCategory(): SettingsCategory {
  const value = new URLSearchParams(location.search).get('category');
  return validCategories.find((category) => category === value) ?? 'images';
}
function SettingsWindow() {
  const { state, error, clearError, run, t } = useAppState();
  const [category, setCategory] = useState<SettingsCategory>(initialCategory);
  useEffect(() => window.tinyPNG?.onOpenSettings((next) => { if (next) setCategory(next); }), []);
  useEffect(() => { void run(() => window.tinyPNG.setSettingsCategory(category)); }, [category, run]);
  const notice = error || state?.notice;
  return <div {...stylex.props(styles.window, state?.settings.glassEnabled && styles.glass)}>
    {notice && <div {...stylex.props(styles.error)} role="alert"><span>{notice}</span><button type="button" {...stylex.props(controls.focus, controls.icon)} aria-label={t('common.close')} onClick={() => { clearError(); void run(() => window.tinyPNG.dismissNotice()); }}><Icon name="close" size={16} /></button></div>}
    {state && <div {...stylex.props(styles.content)}><Settings state={state} category={category} setCategory={setCategory} run={run} t={t} /></div>}
  </div>;
}
const styles = stylex.create({
  window: { height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: theme.canvas, color: theme.text },
  glass: { backgroundColor: { default: 'transparent', '@media (prefers-reduced-transparency: reduce)': theme.canvas, '@media (prefers-contrast: more)': theme.canvas } },
  content: { minHeight: 0, flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  error: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingBlock: 8, paddingInline: 16, backgroundColor: theme.dangerBackground, color: theme.danger, fontSize: '.8125rem', lineHeight: '18px' },
});
createRoot(document.getElementById('root')!).render(<SettingsWindow />);
