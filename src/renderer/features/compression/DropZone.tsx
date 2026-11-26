import * as stylex from '@stylexjs/stylex';
import type { ActionRunner } from '../application/useAppState';
import type { Translator } from '../../../shared/localization';
import { Icon } from '../../lib/Icon';
import { controls } from '../../lib/controls.stylex';
import { theme } from '../../lib/theme.stylex';

export function DropZone({ run, t, targeted, overwrite }: { run: ActionRunner; t: Translator; targeted: boolean; overwrite: boolean }) {
  return <section {...stylex.props(styles.zone)} aria-label={t('drop.accessible')}>
    {overwrite && <p {...stylex.props(styles.overwrite)}><Icon name="warning" size={16} />{t('settings.overwriteWarning')}</p>}
    <svg {...stylex.props(styles.icon)} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M24 5v24m-8-8 8 8 8-8M9 28v10a4 4 0 0 0 4 4h22a4 4 0 0 0 4-4V28" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <span {...stylex.props(styles.title)}>{t(targeted ? 'drop.active' : 'drop.prompt')}</span>
    <button type="button" {...stylex.props(controls.focus, controls.button, styles.choose)} onClick={() => void run(() => window.tinyPNG.chooseFiles())}>
      {t('app.addImages')}<kbd {...stylex.props(styles.shortcut)}>⌘O</kbd>
    </button>
  </section>;
}

const styles = stylex.create({
  zone: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, width: '100%', maxWidth: 440, minHeight: 240, padding: 24, color: theme.text },
  icon: { height: 32, width: 32, color: theme.accent },
  title: { fontSize: '1.0625rem', fontWeight: 600, lineHeight: '22px' },
  choose: { color: theme.primaryText, borderColor: 'transparent', backgroundColor: { default: theme.accent, ':hover': theme.accentHover, ':active': theme.accentPressed } },
  overwrite: { display: 'flex', alignItems: 'center', gap: 8, margin: 0, color: theme.danger, fontSize: '.8125rem', lineHeight: '18px' },
  shortcut: { marginLeft: 12, fontSize: '.75rem', fontFamily: 'inherit', fontWeight: 400, opacity: .7 },
});
