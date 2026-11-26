import * as stylex from '@stylexjs/stylex';
import type { AppState } from '../../../shared/contracts';
import type { ActionRunner } from '../application/useAppState';
import type { Translator } from '../../../shared/localization';
import { controls } from '../../lib/controls.stylex';
import { theme } from '../../lib/theme.stylex';

interface Props { state: AppState; run: ActionRunner; t: Translator }
export function WatchStatus({ state, t, openSettings }: { state: AppState; t: Translator; openSettings: () => void }) {
  return state.watchRunning ? <button type="button" {...stylex.props(controls.focus, styles.status)} title={state.settings.watchPath ?? ''} onClick={openSettings}>{t('watch.active')}</button> : null;
}
export function WatchControls({ state, run, t }: Props) {
  return <section {...stylex.props(controls.section)}>
    <div {...stylex.props(controls.row)}><h3 {...stylex.props(controls.heading)}>{t('watch.heading')}</h3>
      <button type="button" {...stylex.props(controls.focus, controls.button)} onClick={() => void run(() => state.watchRunning ? window.tinyPNG.stopWatch() : window.tinyPNG.startWatch())}>{t(state.watchRunning ? 'watch.stop' : 'watch.start')}</button></div>
    <p {...stylex.props(styles.note)} role="status">{t(state.watchRunning ? 'watch.active' : 'watch.inactive')}</p>
    <div {...stylex.props(styles.pathGroup)} role="group" aria-label={t('watch.heading')}><div {...stylex.props(controls.pathRow)}><span {...stylex.props(controls.path)} title={state.settings.watchPath ?? ''}>{state.settings.watchPath || t('watch.unselected')}</span>
      <button type="button" {...stylex.props(controls.focus, controls.button)} aria-label={t('watch.chooseFolder')} onClick={() => void run(() => window.tinyPNG.chooseWatchFolder())}>{t('common.choose')}</button></div></div>
    <p {...stylex.props(styles.note)}>{t('watch.note')}</p>
  </section>;
}
const styles = stylex.create({
  status: { backgroundColor: { default: 'transparent', ':hover': theme.controlHover, ':active': theme.controlPressed }, borderWidth: 0, borderStyle: 'solid', borderColor: 'transparent', borderRadius: 6, paddingBlock: 6, paddingInline: 8, fontSize: '.75rem', fontWeight: 500, color: theme.secondary, maxWidth: 270, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
  pathGroup: { display: 'flex', flexDirection: 'column', gap: 8 },
  note: { fontSize: '.75rem', color: theme.secondary, lineHeight: 1.5, margin: 0 },
});
