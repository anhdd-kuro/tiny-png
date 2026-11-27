import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { backgroundPaint, backgroundStyles } from '../appearance/background.stylex';
import { useAppState } from '../application/useAppState';
import { APP_NAME } from '../../../shared/app';
import { controls } from '../../lib/controls.stylex';
import { theme, originalTheme } from '../../lib/theme.stylex';
import dino from '../../assets/dino.png';

export function CornerDrop() {
  const { state, error, clearError, run, t } = useAppState();
  const [dragging, setDragging] = useState(false);
  const [presented, setPresented] = useState(false);
  const [animate, setAnimate] = useState(true);
  const presentedRef = useRef(false);
  const hasState = state !== null;
  const depth = useRef(0);
  const suppressDropClick = useRef(false);
  useEffect(() => {
    if (!hasState) return;
    let frame = 0;
    let nextFrame = 0;
    const cancelReveal = () => { cancelAnimationFrame(frame); cancelAnimationFrame(nextFrame); };
    const unsubscribe = window.tinyPNG.onCornerPresentation(({ visible, animated }) => {
      cancelReveal();
      presentedRef.current = visible;
      setAnimate(animated);
      if (visible && animated && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setPresented(false);
        frame = requestAnimationFrame(() => { nextFrame = requestAnimationFrame(() => setPresented(true)); });
      } else setPresented(visible);
      if (!visible) { depth.current = 0; setDragging(false); }
    });
    return () => { cancelReveal(); unsubscribe(); };
  }, [hasState]);
  useEffect(() => {
    function enter(event: DragEvent) {
      event.preventDefault();
      if (presentedRef.current && [...(event.dataTransfer?.types ?? [])].includes('Files')) { depth.current++; setDragging(true); }
    }
    function over(event: DragEvent) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; }
    function leave(event: DragEvent) { event.preventDefault(); depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); }
    function drop(event: DragEvent) {
      event.preventDefault(); event.stopPropagation(); depth.current = 0; setDragging(false); suppressDropClick.current = true; clearError();
      if (presentedRef.current && event.dataTransfer?.files.length) void run(() => window.tinyPNG.enqueueFiles([...event.dataTransfer!.files]));
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
  const paint = backgroundPaint(state?.settings, true);
  const shade = glass ? .45 : .35;
  const hudImage = [`linear-gradient(rgba(12,12,12,${shade}),rgba(12,12,12,${shade}))`, ...(paint.image === 'none' ? [] : [paint.image])].join(',');
  const islandColor = `rgba(16,17,20,${paint.hudAlpha})`;
  const island = state?.settings.dropCorner === 'topCenter';
  const warning = !dragging && !state?.isProcessing && (!!failure || failed > 0);
  const status = dragging ? t('corner.active') : state?.isProcessing ? t('app.processing') : failed ? t('app.errorCount', { count: failed }) : failure ? t('corner.attention') : pending ? t('corner.pending', { count: pending }) : done ? t('corner.completed', { count: done }) : t('corner.drop');
  const overwriteWarning = state?.settings.overwrite ? t('settings.overwriteWarning') : '';
  const description = [failure, overwriteWarning].filter(Boolean).join(' ');
  useEffect(() => { document.title = `${APP_NAME} — ${t('corner.drop')}`; }, [t]);

  return <div {...stylex.props(styles.window, originalTheme, !island && !presented && styles.hidden)} inert={!presented} aria-hidden={!presented} data-corner-presentation={presented ? 'visible' : 'hidden'}><button type="button" {...stylex.props(controls.focus, styles.target, styles.original, backgroundStyles.paint(hudImage, paint.color), glass && styles.glassChrome, island && styles.island(islandColor), island && styles.motion, island && presented && styles.presented, !animate && styles.instant, dragging && (island ? styles.islandTargeted : styles.targeted), warning && styles.warning, warning && island && styles.islandWarning)}
    aria-label={[t('corner.accessible', { status }), overwriteWarning].filter(Boolean).join(' ')} aria-description={description || undefined} title={[failure ? `${failure} ${t('corner.attentionHelp')}` : warning ? t('corner.errorHelp', { count: failed }) : t('corner.help'), overwriteWarning].filter(Boolean).join(' ')}
    onPointerDown={() => { suppressDropClick.current = false; }}
    onClick={(event) => { if (!suppressDropClick.current || event.detail === 0) void run(() => window.tinyPNG.openMain()); }}>
    {warning ? <span {...stylex.props(styles.warningIcon, island && styles.islandWarningIcon)} aria-hidden="true">!</span> : <img src={dino} {...stylex.props(styles.icon, island && styles.islandIcon)} alt="" aria-hidden="true" draggable={false} />}
    <span {...stylex.props(styles.label, island && styles.islandLabel)} role="status" aria-live="polite">{status}</span>
  </button></div>;
}

const styles = stylex.create({
  window: { height: '100%', padding: 3, userSelect: 'none' },
  hidden: { opacity: 0 },
  target: { height: '100%', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderStyle: 'solid', borderColor: theme.border, borderRadius: 17, paddingBlock: 9, paddingInline: 5, color: theme.text, backgroundColor: { default: theme.material, ':hover': theme.controlHover, ':active': theme.controlPressed }, backdropFilter: theme.blur },
  original: { colorScheme: 'dark' },
  glassChrome: { boxShadow: 'inset 0 1px rgba(255,255,255,.2)', backdropFilter: { default: 'blur(24px) saturate(160%)', '@media (prefers-reduced-transparency: reduce)': 'none', '@media (prefers-contrast: more)': 'none' } },
  targeted: { borderColor: theme.accent, backgroundColor: theme.accentTint }, warning: { color: theme.danger },
  island: (color: string) => ({ flexDirection: 'row', gap: 16, paddingBlock: 10, paddingInline: 20, borderRadius: 26, backgroundImage: 'none', color: '#ffffff', backgroundColor: { default: color, '@media (prefers-reduced-transparency: reduce)': '#111215', '@media (prefers-contrast: more)': '#000000', ':hover': 'rgba(28,29,33,.96)', ':active': '#292a2f' }, borderColor: { default: 'rgba(255,255,255,.2)', '@media (prefers-contrast: more)': '#ffffff' } }),
  motion: {
    opacity: 0,
    filter: { default: 'blur(6px)', '@media (prefers-reduced-motion: reduce)': 'none', '@media (prefers-reduced-transparency: reduce)': 'none', '@media (prefers-contrast: more)': 'none' },
    transform: { default: 'translateY(-6px) scale(.96)', '@media (prefers-reduced-motion: reduce)': 'none', '@media (prefers-reduced-transparency: reduce)': 'none', '@media (prefers-contrast: more)': 'none' },
    transformOrigin: 'top center', transitionProperty: { default: 'opacity, filter, transform', '@media (prefers-reduced-motion: reduce)': 'none' },
    transitionDuration: { default: '180ms', '@media (prefers-reduced-motion: reduce)': '0s' },
    transitionTimingFunction: 'cubic-bezier(.2,.7,.2,1)',
  },
  presented: { opacity: 1, filter: 'none', transform: 'none', transitionDuration: { default: '240ms', '@media (prefers-reduced-motion: reduce)': '0s' } },
  instant: { transitionProperty: 'none', transitionDuration: '0s' },
  islandTargeted: { borderColor: '#a9f0cb', backgroundColor: '#18342c' }, islandWarning: { color: '#ffd28a' },
  islandIcon: { width: 44, height: 44 }, islandWarningIcon: { width: 40, height: 40, fontSize: 26 }, islandLabel: { flexGrow: 1, flexShrink: 1, flexBasis: 0, textAlign: 'center', fontSize: '.9375rem', lineHeight: '20px' },
  icon: { width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }, label: { fontSize: '.8125rem', fontWeight: 550, letterSpacing: '.005em', whiteSpace: 'nowrap', maxWidth: '100%', textOverflow: 'ellipsis', overflow: 'hidden' },
  warningIcon: { display: 'grid', placeItems: 'center', width: 28, height: 28, borderWidth: 1.5, borderStyle: 'solid', borderColor: 'currentColor', borderRadius: '50%', fontSize: 20, fontWeight: 600, lineHeight: 1 },
});
