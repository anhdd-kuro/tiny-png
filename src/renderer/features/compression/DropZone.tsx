import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { ActionRunner } from '../application/useAppState';
import type { Translator } from '../localization/i18n';
import { theme } from '../../lib/theme.stylex';

export function DropZone({ run, t }: { run: ActionRunner; t: Translator }) {
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

  return <button type="button" {...stylex.props(styles.zone, targeted && styles.targeted)}
    aria-label={t('drop.accessible')} onClick={() => void run(() => window.tinyPNG.chooseFiles())}>
    <svg {...stylex.props(styles.icon)} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M24 5v24m-8-8 8 8 8-8M9 28v10a4 4 0 0 0 4 4h22a4 4 0 0 0 4-4V28" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <span {...stylex.props(styles.title)}>{t(targeted ? 'drop.active' : 'drop.prompt')}</span>
    <span {...stylex.props(styles.choose)}>{t('drop.choose')}</span>
  </button>;
}

const styles = stylex.create({
  zone: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, width: '100%', minHeight: 190, padding: 20, color: theme.text, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.border, borderRadius: 17, backgroundColor: { default: 'transparent', ':hover': theme.accentTint, ':active': theme.actionSurface } },
  targeted: { backgroundColor: theme.accentTint, borderColor: theme.accent, borderStyle: 'solid' },
  icon: { height: 32, width: 32, color: theme.accent, marginBottom: 2 },
  title: { fontSize: '1.25rem', letterSpacing: '-.015em', fontWeight: 600, lineHeight: 1.4 },
  choose: { fontSize: '.8125rem', color: theme.text, fontWeight: 550, paddingBlock: 7, paddingInline: 18, borderWidth: 1, borderStyle: 'solid', borderColor: theme.separator, borderRadius: 22, backgroundColor: theme.actionSurface },
});
