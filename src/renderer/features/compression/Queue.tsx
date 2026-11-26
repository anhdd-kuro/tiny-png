import * as stylex from '@stylexjs/stylex';
import type { AppState, Job, Language } from '../../../shared/contracts';
import type { ActionRunner } from '../application/useAppState';
import type { Translator } from '../localization/i18n';
import { controls } from '../../lib/controls.stylex';
import { theme } from '../../lib/theme.stylex';
import { Icon } from '../../lib/Icon';

interface QueueProps { state: AppState; run: ActionRunner; t: Translator }
function bytes(value: number, language: Language) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), 3);
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: unit ? 1 : 0 }).format(value / 1024 ** unit)} ${['B', 'KB', 'MB', 'GB'][unit]}`;
}
function stats(jobs: Job[]) {
  const completed = jobs.filter((job) => job.state === 'completed');
  return {
    completed, failed: jobs.filter((job) => job.state === 'failed').length, pending: jobs.filter((job) => job.state === 'queued').length,
    saved: completed.reduce((sum, job) => sum + Math.max(0, job.result?.savedBytes ?? 0), 0),
    original: completed.reduce((sum, job) => sum + (job.result?.originalBytes || job.originalBytes), 0),
  };
}

export function Queue({ state, run, t }: QueueProps) {
  const summary = stats(state.jobs);
  return <>
    {state.jobs.length > 0 && <section {...stylex.props(styles.section)} aria-labelledby="queue-heading">
      <div {...stylex.props(styles.heading)}>
        <h2 id="queue-heading" {...stylex.props(styles.title)}>{t('queue.heading')} <span {...stylex.props(styles.count)}>{state.jobs.length}</span></h2>
        <div {...stylex.props(styles.actions)}>
          {summary.failed > 0 && <button type="button" {...stylex.props(styles.textButton)} onClick={() => void run(async () => {
            for (const job of state.jobs.filter((item) => item.state === 'failed')) await window.tinyPNG.retry(job.id);
          })}>{t('queue.retryAll')}</button>}
          <button type="button" {...stylex.props(styles.textButton)} disabled={!state.jobs.some((job) => job.state === 'completed' || job.state === 'failed')}
            onClick={() => void run(() => window.tinyPNG.clearFinished())}>{t('queue.clear')}</button>
        </div>
      </div>
      <ul {...stylex.props(styles.list)} aria-label={t('queue.list')}>
        {state.jobs.map((job) => <li key={job.id} {...stylex.props(styles.row)}>
          <span {...stylex.props(styles.fileIcon, job.state === 'failed' && styles.errorColor)}><Icon name="photo" size={16} /></span>
          <div {...stylex.props(styles.info)}>
            <div {...stylex.props(styles.nameLine)}><span {...stylex.props(styles.name)} title={job.source}>{job.name}</span>
              {job.result?.remoteLocation && <span {...stylex.props(styles.s3)} title={`${t('s3.uploaded')}: ${job.result.remoteLocation}`} aria-label={t('s3.uploaded')}>S3</span>}</div>
            {job.error && <p {...stylex.props(styles.error)}>{job.error}</p>}
          </div>
          <div {...stylex.props(styles.meta)}><span {...stylex.props(job.state === 'completed' && styles.strike)}>{bytes(job.originalBytes, state.settings.language)}</span>
            {job.result && <span {...stylex.props(styles.output)}>{bytes(job.result.outputBytes, state.settings.language)}</span>}</div>
          <div {...stylex.props(styles.result)}>
            {job.state === 'processing' ? <span {...stylex.props(styles.spinner)} role="status" aria-label={t(job.phase === 'uploading' ? 's3.uploading' : 'app.processing')} title={t(job.phase === 'uploading' ? 's3.uploading' : 'app.processing')} /> : job.result ?
              <span {...stylex.props(styles.saved)} title={job.result.skipped ? t('queue.noReduction') : undefined}>{job.result.skipped ? '—' : `−${Math.max(0, Math.round((1 - job.result.outputBytes / Math.max(1, job.result.originalBytes)) * 100))}%`}</span> :
              job.state === 'queued' ? <span {...stylex.props(styles.state)}>{t('queue.queued')}</span> : null}
          </div>
          <div {...stylex.props(styles.rowActions)}>
            {job.result && <button type="button" {...stylex.props(controls.icon, styles.action)} aria-label={t('queue.reveal', { name: job.name })} title={t('queue.revealShort')}
              onClick={() => void run(() => window.tinyPNG.reveal(job.result!.outputPath))}><Icon name="folder" size={16} /></button>}
            {job.state === 'failed' && <button type="button" {...stylex.props(controls.icon, styles.action)} aria-label={t('queue.retry', { name: job.name })} title={t('queue.retry', { name: job.name })}
              onClick={() => void run(() => window.tinyPNG.retry(job.id))}><Icon name="retry" size={16} /></button>}
            {job.state !== 'processing' && <button type="button" {...stylex.props(controls.icon, styles.action)} aria-label={t('queue.remove', { name: job.name })} title={t('queue.remove', { name: job.name })}
              onClick={() => void run(() => window.tinyPNG.remove(job.id))}><Icon name="close" size={15} /></button>}
          </div>
        </li>)}
      </ul>
    </section>}
    <div {...stylex.props(controls.hidden)} role="status" aria-live="polite" aria-atomic="true">{t('queue.announcement', { done: summary.completed.length, failed: summary.failed, pending: summary.pending })}</div>
  </>;
}

export function QueueFooter({ state, run, t, glass = false }: QueueProps & { glass?: boolean }) {
  const summary = stats(state.jobs);
  const hasCompleted = summary.completed.length > 0;
  const primary = state.jobs.some((job) => job.state === 'processing' && job.phase === 'uploading') ? t('s3.uploading') : hasCompleted ? t('queue.saved', { size: bytes(summary.saved, state.settings.language) }) : state.isProcessing ? t('app.processing') : summary.failed ? t('app.errorCount', { count: summary.failed }) : t('queue.ready');
  const button = state.isProcessing ? t(state.paused ? 'queue.pausing' : 'queue.pause') : summary.pending ? t('queue.compress', { count: summary.pending }) : t('queue.add');
  if (!state.jobs.length) return null;
  return <footer {...stylex.props(styles.footer, glass && styles.glassChrome)}>
    <div {...stylex.props(styles.summary)}><strong {...stylex.props(styles.summaryTitle)}>{primary}</strong>
      {hasCompleted && <span {...stylex.props(styles.summaryMeta)}>{t('queue.completed', { count: summary.completed.length, percent: summary.original ? Math.round(summary.saved / summary.original * 100) : 0 })}</span>}</div>
    <button type="button" {...stylex.props(controls.button, styles.primary)} disabled={state.isProcessing && state.paused} onClick={() => void run(() => state.isProcessing ? window.tinyPNG.pause() : summary.pending ? window.tinyPNG.resume() : window.tinyPNG.chooseFiles())}>{button}</button>
  </footer>;
}

const spin = stylex.keyframes({ to: { transform: 'rotate(360deg)' } });
const styles = stylex.create({
  section: { marginTop: 24, paddingTop: 8, paddingInline: 12, borderRadius: 8, backgroundColor: { default: 'rgba(12,12,12,.35)', '@media (prefers-reduced-transparency: reduce)': '#264a58' } }, heading: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  title: { fontSize: '.8125rem', fontWeight: 600, margin: 0, color: theme.secondary }, count: { fontWeight: 400, marginLeft: 5, fontVariantNumeric: 'tabular-nums' },
  actions: { display: 'flex', gap: 16 }, textButton: { borderWidth: 0, borderStyle: 'solid', borderColor: 'transparent', paddingBlock: 5, paddingInline: 2, backgroundColor: { default: 'transparent', ':active': theme.controlPressed }, borderRadius: 4, fontSize: '.75rem', color: { default: theme.secondary, ':hover': theme.text } },
  list: { listStyle: 'none', padding: 0, margin: 0, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: theme.separator },
  row: { display: 'grid', gridTemplateColumns: { default: '16px minmax(0,1fr) 144px 56px 84px', '@media (max-width: 740px)': '16px minmax(0,1fr) 124px 48px 84px' }, alignItems: 'center', gap: 8, paddingBlock: 8, paddingInline: 0, minHeight: 44, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: theme.separator },
  fileIcon: { display: 'flex', alignItems: 'center', color: theme.secondary }, errorColor: { color: theme.danger },
  info: { minWidth: 0 }, nameLine: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }, name: { display: 'block', fontSize: '.8125rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '18px' },
  meta: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, fontSize: '.75rem', color: theme.secondary, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }, strike: { textDecoration: 'line-through' }, output: { color: theme.text },
  error: { fontSize: '.75rem', lineHeight: 1.4, color: theme.danger, overflowWrap: 'anywhere', marginTop: 4, marginBottom: 0 },
  result: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minWidth: 0 }, saved: { fontSize: '.8125rem', fontWeight: 550, fontVariantNumeric: 'tabular-nums' },
  s3: { fontSize: '.6875rem', color: theme.secondary, fontWeight: 500, flexShrink: 0 }, rowActions: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0 }, action: { width: 28, height: 28 },
  state: { fontSize: '.75rem', color: theme.secondary }, spinner: { width: 14, height: 14, borderWidth: 1.5, borderStyle: 'solid', borderColor: theme.border, borderTopColor: theme.secondary, borderRadius: '50%', animationName: { default: spin, '@media (prefers-reduced-motion: reduce)': 'none' }, animationDuration: '.8s', animationTimingFunction: 'linear', animationIterationCount: 'infinite' },
  footer: { display: 'flex', alignItems: 'center', gap: 16, minHeight: 56, paddingBlock: 8, paddingInline: 20, backgroundColor: theme.toolbar, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: theme.separator, flexShrink: 0 },
  glassChrome: { boxShadow: 'inset 0 1px rgba(255,255,255,.12)', backgroundColor: { default: 'rgba(5,35,41,.45)', '@media (prefers-reduced-transparency: reduce)': '#316d87', '@media (prefers-contrast: more)': '#20556a' }, backdropFilter: { default: 'blur(24px) saturate(160%)', '@media (prefers-reduced-transparency: reduce)': 'none', '@media (prefers-contrast: more)': 'none' } },
  summary: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }, summaryTitle: { fontSize: '.8125rem', fontWeight: 550 }, summaryMeta: { fontSize: '.75rem', color: theme.secondary },
  primary: { marginLeft: 'auto', paddingBlock: 4, paddingInline: 12, fontWeight: 550, minHeight: 28, whiteSpace: 'nowrap', color: theme.primaryText, borderColor: 'transparent', backgroundColor: { default: theme.accent, ':hover': theme.accentHover, ':active': theme.accentPressed } },
});
