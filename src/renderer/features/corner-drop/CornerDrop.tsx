import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useAppState } from '../application/useAppState';
import { APP_NAME } from '../../../shared/app';
import { theme, originalTheme } from '../../lib/theme.stylex';
import dino from '../../assets/dino.png';

export function CornerDrop() {
  const { state, error, clearError, run, t } = useAppState();
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const suppressDropClick = useRef(false);
  useEffect(() => {
    function enter(event: DragEvent) {
      event.preventDefault();
      if ([...(event.dataTransfer?.types ?? [])].includes('Files')) { depth.current++; setDragging(true); }
    }
    function over(event: DragEvent) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; }
    function leave(event: DragEvent) { event.preventDefault(); depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); }
    function drop(event: DragEvent) {
      event.preventDefault(); event.stopPropagation(); depth.current = 0; setDragging(false); suppressDropClick.current = true; clearError();
      if (event.dataTransfer?.files.length) void run(() => window.tinyPNG.enqueueFiles([...event.dataTransfer!.files]));
    }
    window.addEventListener('dragenter', enter); window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave); window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter); window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop);
    };
  }, [run, clearError]);
  const failed = state?.jobs.filter((job) => job.state === 'failed').length ?? 0;
  const pending = state?.jobs.filter((job) => job.state === 'queued').length ?? 0;
  const done = state?.jobs.filter((job) => job.state === 'completed').length ?? 0;
  const failure = error || state?.notice;
  const glass = state?.settings.glassEnabled ?? false;
  const island = state?.settings.dropCorner === 'topCenter';
  const warning = !dragging && !state?.isProcessing && (!!failure || failed > 0);
  const status = dragging ? t('corner.active') : state?.isProcessing ? t('app.processing') : failure ? t('corner.failed') : failed ? t('app.errorCount', { count: failed }) : pending ? t('corner.pending', { count: pending }) : done ? t('corner.completed', { count: done }) : t('corner.drop');
  useEffect(() => { document.title = `${APP_NAME} — ${t('corner.drop')}`; }, [t]);

  return <div {...stylex.props(styles.window, originalTheme)}><button type="button" {...stylex.props(styles.target, styles.original, glass && styles.glassChrome, island && styles.island, dragging && (island ? styles.islandTargeted : styles.targeted), warning && styles.warning, warning && island && styles.islandWarning)}
    aria-label={t('corner.accessible', { status })} aria-description={failure || undefined} title={failure ? `${failure} ${t('corner.failedHelp')}` : warning ? t('corner.errorHelp', { count: failed }) : t('corner.help')}
    onPointerDown={() => { suppressDropClick.current = false; }}
    onClick={(event) => { if (!suppressDropClick.current || event.detail === 0) void run(() => window.tinyPNG.openMain()); }}>
    {warning ? <span {...stylex.props(styles.warningIcon)} aria-hidden="true">!</span> : <img src={dino} {...stylex.props(styles.icon, island && styles.islandIcon)} alt="" aria-hidden="true" draggable={false} />}
    <span {...stylex.props(styles.label, island && styles.islandLabel)} role="status" aria-live="polite">{status}</span>
  </button></div>;
}

const styles = stylex.create({
  window: { height: '100%', padding: 3, userSelect: 'none' },
  target: { height: '100%', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderStyle: 'solid', borderColor: theme.border, borderRadius: 17, paddingBlock: 9, paddingInline: 5, color: theme.text, backgroundColor: { default: theme.material, ':hover': theme.controlHover, ':active': theme.controlPressed }, backdropFilter: theme.blur, boxShadow: '0 3px 12px rgba(0,0,0,.12)', outlineOffset: -5 },
  original: { backgroundImage: 'linear-gradient(rgba(12,12,12,.35),rgba(12,12,12,.35)),linear-gradient(35deg,#376eb8,#40ad8e)', colorScheme: 'dark' },
  glassChrome: { backgroundImage: 'linear-gradient(rgba(5,35,41,.45),rgba(5,35,41,.45)),linear-gradient(35deg,#376eb8,#40ad8e)', boxShadow: 'inset 0 1px rgba(255,255,255,.2),0 3px 12px rgba(0,0,0,.12)', backgroundColor: { default: 'rgba(12,12,12,.35)', '@media (prefers-reduced-transparency: reduce)': '#316d87', '@media (prefers-contrast: more)': '#20556a' }, backdropFilter: { default: 'blur(24px) saturate(160%)', '@media (prefers-reduced-transparency: reduce)': 'none', '@media (prefers-contrast: more)': 'none' } },
  targeted: { borderColor: theme.accent, backgroundColor: theme.accentTint }, warning: { color: theme.danger },
  island: { flexDirection: 'row', gap: 10, paddingBlock: 8, paddingInline: 12, borderRadius: 18, backgroundImage: 'none', color: '#ffffff', backgroundColor: { default: theme.island, ':hover': 'rgba(28,29,33,.96)', ':active': '#292a2f' }, borderColor: { default: 'rgba(255,255,255,.2)', '@media (prefers-contrast: more)': '#ffffff' } },
  islandTargeted: { borderColor: '#a9f0cb', backgroundColor: '#18342c' }, islandWarning: { color: '#ffd28a' },
  islandIcon: { width: 36, height: 36 }, islandLabel: { flexGrow: 1, flexShrink: 1, flexBasis: 0, textAlign: 'center' },
  icon: { width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }, label: { fontSize: '.8125rem', fontWeight: 550, letterSpacing: '.005em', whiteSpace: 'nowrap', maxWidth: '100%', textOverflow: 'ellipsis', overflow: 'hidden' },
  warningIcon: { display: 'grid', placeItems: 'center', width: 28, height: 28, borderWidth: 1.5, borderStyle: 'solid', borderColor: 'currentColor', borderRadius: '50%', fontSize: 20, fontWeight: 600, lineHeight: 1 },
});
