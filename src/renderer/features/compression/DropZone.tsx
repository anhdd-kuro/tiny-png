import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { ActionRunner } from '../application/useAppState';
import type { Translator } from '../localization/i18n';
import { controls } from '../../lib/controls.stylex';
import { theme } from '../../lib/theme.stylex';

export function DropZone({ run, t, compact = false }: { run: ActionRunner; t: Translator; compact?: boolean }) {
  const [targeted, setTargeted] = useState(false);
  const depth = useRef(0);
  useEffect(() => {
    function enter(event: DragEvent) {
      event.preventDefault();
      if ([...(event.dataTransfer?.types ?? [])].includes('Files')) { depth.current++; setTargeted(true); }
    }
    function over(event: DragEvent) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; }
    function leave(event: DragEvent) { event.preventDefault(); depth.current = Math.max(0, depth.current - 1); if (!depth.current) setTargeted(false); }
    function drop(event: DragEvent) {
      event.preventDefault(); event.stopPropagation(); depth.current = 0; setTargeted(false);
      if (event.dataTransfer?.files.length) void run(() => window.tinyPNG.enqueueFiles([...event.dataTransfer!.files]));
    }
    window.addEventListener('dragenter', enter); window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave); window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter); window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop);
    };
  }, [run]);

  return <section {...stylex.props(styles.zone, compact && styles.compact, targeted && styles.targeted)} aria-label={t('drop.accessible')}>
    <svg {...stylex.props(styles.icon, compact && styles.compactIcon)} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M24 5v24m-8-8 8 8 8-8M9 28v10a4 4 0 0 0 4 4h22a4 4 0 0 0 4-4V28" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <span {...stylex.props(styles.title, compact && styles.compactTitle)}>{t(targeted ? 'drop.active' : 'drop.prompt')}</span>
    <button type="button" {...stylex.props(controls.button, !compact && styles.choose)} onClick={() => void run(() => window.tinyPNG.chooseFiles())}>
      {t('drop.choose')}<kbd {...stylex.props(styles.shortcut)}>⌘O</kbd>
    </button>
  </section>;
}

const styles = stylex.create({
  zone: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, width: '100%', maxWidth: 440, minHeight: 240, padding: 24, color: theme.text, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.border, borderRadius: 8, backgroundColor: { default: 'rgba(12,12,12,.35)', '@media (prefers-reduced-transparency: reduce)': '#264a58' } },
  compact: { maxWidth: '100%', minHeight: 64, paddingBlock: 16, paddingInline: 16, flexDirection: 'row', gap: 12 },
  targeted: { backgroundColor: 'rgba(12,12,12,.44)', borderColor: theme.accent, borderStyle: 'solid' },
  icon: { height: 32, width: 32, color: theme.accent }, compactIcon: { width: 24, height: 24, flexShrink: 0 },
  title: { fontSize: '1.0625rem', fontWeight: 600, lineHeight: '22px' }, compactTitle: { marginRight: 'auto', fontSize: '.8125rem', fontWeight: 500, lineHeight: '18px' },
  choose: { color: theme.primaryText, borderColor: 'transparent', backgroundColor: { default: theme.accent, ':hover': theme.accentHover, ':active': theme.accentPressed } },
  shortcut: { marginLeft: 12, fontSize: '.75rem', fontFamily: 'inherit', fontWeight: 400, opacity: .7 },
});
