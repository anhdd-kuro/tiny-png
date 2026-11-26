import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { HistoryEntry, Language } from '../../../shared/contracts';
import type { Translator } from '../../../shared/localization';
import type { ActionRunner } from '../application/useAppState';
import { controls } from '../../lib/controls.stylex';
import { theme } from '../../lib/theme.stylex';

interface Props { entries: HistoryEntry[]; language: Language; run: ActionRunner; t: Translator }

function bytes(value: number, language: Language) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), 3);
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: unit ? 1 : 0 }).format(value / 1024 ** unit)} ${['B', 'KB', 'MB', 'GB'][unit]}`;
}

function HistoryTime({ timestamp, language }: { timestamp: string; language: Language }) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.valueOf())) return <span {...stylex.props(styles.time)}>{timestamp}</span>;
  return <time dateTime={timestamp} title={new Intl.DateTimeFormat(language, { dateStyle: 'full', timeStyle: 'long' }).format(date)} {...stylex.props(styles.time)}>
    <span>{new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(date)}</span>
    <span>{new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date)}</span>
  </time>;
}

function HistoryRow({ entry, language, t }: { entry: HistoryEntry; language: Language; t: Translator }) {
  const name = entry.file?.split(/[\\/]/).filter(Boolean).at(-1) ?? entry.file;
  const translatedError = entry.error ? t(entry.error) : null;
  const error = translatedError && /^error\./.test(translatedError) ? t('error.operationFailed') : translatedError;
  const failed = entry.action === 'failed' || entry.action === 'uploadFailed' || entry.action === 'watchFailed' || entry.action === 'notificationFailed';
  return <li {...stylex.props(styles.row)}>
    <HistoryTime timestamp={entry.timestamp} language={language} />
    <div {...stylex.props(styles.content)}>
      {entry.file && <details {...stylex.props(styles.details)}>
        <summary {...stylex.props(controls.focus, styles.file)} title={entry.file}>{name}</summary>
        <p {...stylex.props(styles.path)}>{entry.file}</p>
        {entry.outputPath && entry.outputPath !== entry.file && <p {...stylex.props(styles.path)}>{t('history.output')}: {entry.outputPath}</p>}
      </details>}
      <div {...stylex.props(styles.result)}>
        <span {...stylex.props(styles.action, failed && styles.failed)}>{t(`history.action.${entry.action}`)}</span>
        {typeof entry.originalBytes === 'number' && typeof entry.outputBytes === 'number' && <span {...stylex.props(styles.sizes)}>{bytes(entry.originalBytes, language)} → {bytes(entry.outputBytes, language)}</span>}
      </div>
      {error && <p {...stylex.props(styles.error, failed && styles.failed)}>{error}</p>}
    </div>
  </li>;
}

export function History({ entries, language, run, t }: Props) {
  const [clearing, setClearing] = useState(false);
  const clear = () => void run(async () => {
    setClearing(true);
    try { await window.tinyPNG.clearHistory(); }
    finally { setClearing(false); }
  });
  return <section {...stylex.props(styles.section)} aria-label={t('history.heading')}>
    <div {...stylex.props(styles.toolbar)}>
      <span {...stylex.props(styles.count)} role="status">{entries.length ? t('history.count', { count: entries.length }) : ''}</span>
      <button type="button" {...stylex.props(controls.focus, controls.button)} disabled={!entries.length || clearing} aria-busy={clearing} onClick={clear}>{t('history.clearAction')}</button>
    </div>
    {entries.length ? <ol {...stylex.props(styles.list)} aria-label={t('history.heading')}>
      {entries.map(entry => <HistoryRow key={entry.id} entry={entry} language={language} t={t} />)}
    </ol> : <div {...stylex.props(styles.empty)}>{t('history.empty')}</div>}
  </section>;
}

const styles = stylex.create({
  section: { display: 'flex', flexDirection: 'column', gap: 12, height: '100%', minHeight: 240 },
  toolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 28, flexShrink: 0 },
  count: { color: theme.secondary, fontSize: '.75rem', lineHeight: '16px', fontVariantNumeric: 'tabular-nums' },
  list: { overflowY: 'auto', minHeight: 0, flexGrow: 1, flexShrink: 1, flexBasis: 0, listStyle: 'none', padding: 0, margin: 0, backgroundColor: theme.surface, borderWidth: 1, borderStyle: 'solid', borderColor: theme.separator, borderRadius: 8 },
  row: { display: 'grid', gridTemplateColumns: '112px minmax(0,1fr)', gap: 12, paddingBlock: 12, paddingInline: 12, borderBottomWidth: { default: 1, ':last-child': 0 }, borderBottomStyle: 'solid', borderBottomColor: theme.separator },
  time: { display: 'flex', flexDirection: 'column', gap: 4, color: theme.secondary, fontSize: '.75rem', lineHeight: '16px', fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' },
  content: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  details: { minWidth: 0 },
  file: { fontSize: '.8125rem', lineHeight: '18px', fontWeight: 500, overflowWrap: 'anywhere', cursor: 'default', borderRadius: 4 },
  path: { marginBlock: 8, fontSize: '.75rem', lineHeight: '16px', color: theme.secondary, overflowWrap: 'anywhere', userSelect: 'text' },
  result: { display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 12, rowGap: 4 },
  action: { color: theme.secondary, fontSize: '.75rem', lineHeight: '16px' },
  sizes: { color: theme.secondary, fontSize: '.75rem', lineHeight: '16px', fontVariantNumeric: 'tabular-nums' },
  error: { margin: 0, color: theme.secondary, fontSize: '.75rem', lineHeight: '16px', overflowWrap: 'anywhere', userSelect: 'text' },
  failed: { color: theme.danger },
  empty: { display: 'grid', placeItems: 'center', minHeight: 0, flexGrow: 1, flexShrink: 1, flexBasis: 0, fontSize: '.8125rem', lineHeight: '18px', color: theme.secondary },
});
