import { useEffect, useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { Language } from '../../../shared/contracts';
import type { NotificationDiagnostics } from '../../../shared/notifications';
import type { Translator } from '../../../shared/localization';
import type { ActionRunner } from '../application/useAppState';
import { controls } from '../../lib/controls.stylex';
import { theme } from '../../lib/theme.stylex';

interface Props { language: Language; run: ActionRunner; t: Translator }

export function Diagnostics({ language, run, t }: Props) {
  const [diagnostics, setDiagnostics] = useState<NotificationDiagnostics | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const active = useRef(false);
  const revision = useRef(0);
  const runRef = useRef(run);
  useEffect(() => { runRef.current = run; }, [run]);
  useEffect(() => {
    let current = true;
    active.current = true;
    const before = revision.current;
    const unsubscribe = window.tinyPNG.onNotificationDiagnostics(snapshot => {
      revision.current++;
      if (current) { setDiagnostics(snapshot); setPhase('ready'); }
    });
    void runRef.current(async () => {
      try {
        const snapshot = await window.tinyPNG.getNotificationDiagnostics();
        if (current && revision.current === before) { setDiagnostics(snapshot); setPhase('ready'); }
      } catch (error) {
        if (current) setPhase('error');
        throw error;
      }
    });
    return () => { current = false; active.current = false; unsubscribe(); };
  }, []);

  const formatter = useMemo(() => new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'medium' }), [language]);
  const timestamp = (value: string) => Number.isFinite(Date.parse(value)) ? formatter.format(new Date(value)) : value;
  const refresh = () => void run(async () => {
    setPhase('loading');
    const before = revision.current;
    try {
      const snapshot = await window.tinyPNG.refreshNotificationDiagnostics();
      if (active.current && revision.current === before) setDiagnostics(snapshot);
      if (active.current) setPhase('ready');
    } catch (error) {
      if (active.current) setPhase('error');
      throw error;
    }
  });
  const settings = diagnostics?.settings;
  const status = phase !== 'ready' ? t(`notificationDiagnostics.${phase}`) : t(`notificationDiagnostics.authorization.${settings?.authorization ?? 'unknown'}`);
  const events = diagnostics?.events.slice(0, 20) ?? [];
  const rows = [
    ['authorization', t(`notificationDiagnostics.authorization.${settings?.authorization ?? 'unknown'}`)],
    ['alerts', t(`notificationDiagnostics.value.${settings?.alert ?? 'unknown'}`)],
    ['alertStyle', t(`notificationDiagnostics.style.${settings?.alertStyle ?? 'unknown'}`)],
    ['sound', t(`notificationDiagnostics.value.${settings?.sound ?? 'unknown'}`)],
    ['notificationCenter', t(`notificationDiagnostics.value.${settings?.notificationCenter ?? 'unknown'}`)],
    ['signing', t(`notificationDiagnostics.signing.${diagnostics?.identity.mode ?? 'unknown'}`)],
  ];

  return <details {...stylex.props(styles.details)}>
    <summary {...stylex.props(controls.focus, styles.summary)}>
      <span {...stylex.props(styles.summaryContent)}><span>{t('notificationDiagnostics.heading')}</span><span {...stylex.props(styles.status)} role="status">{status}</span></span>
    </summary>
    <div {...stylex.props(styles.body)}>
      <dl {...stylex.props(styles.fields)}>
        {rows.map(([key, value]) => <div key={key} {...stylex.props(styles.field)}><dt>{t(`notificationDiagnostics.${key}`)}</dt><dd {...stylex.props(styles.value)}>{value}</dd></div>)}
        {diagnostics?.checkedAt && <div {...stylex.props(styles.field)}><dt>{t('notificationDiagnostics.checkedAt')}</dt><dd {...stylex.props(styles.value)}><time dateTime={diagnostics.checkedAt}>{timestamp(diagnostics.checkedAt)}</time></dd></div>}
      </dl>
      {diagnostics?.identity.changedSinceLastRun === true && <p {...stylex.props(styles.warning)}>{t('notificationDiagnostics.identityChanged')}</p>}
      <p {...stylex.props(styles.note)}>{t('notificationDiagnostics.bannerLimit')}</p>
      <div {...stylex.props(styles.actions)}>
        <button type="button" {...stylex.props(controls.focus, controls.button)} disabled={phase === 'loading'} aria-busy={phase === 'loading'} onClick={refresh}>{t('notificationDiagnostics.refresh')}</button>
        <button type="button" {...stylex.props(controls.focus, controls.button)} onClick={() => void run(() => window.tinyPNG.revealNotificationLogs())}>{t('notificationDiagnostics.logs')}</button>
      </div>
      <details {...stylex.props(styles.events)}>
        <summary {...stylex.props(controls.focus, styles.summary)}>{t('notificationDiagnostics.events')}</summary>
        {events.length ? <ol {...stylex.props(controls.focus, styles.eventList)} tabIndex={0} aria-label={t('notificationDiagnostics.events')}>
          {events.map(event => <li key={event.id} {...stylex.props(styles.event)}>
            <time dateTime={event.timestamp} {...stylex.props(styles.eventTime)}>{timestamp(event.timestamp)}</time>
            <span>{t(`notificationDiagnostics.action.${event.action}`)}</span>
            {event.detail && <p {...stylex.props(styles.detail)}>{t(event.detail)}</p>}
          </li>)}
        </ol> : <p {...stylex.props(styles.note)}>{t('notificationDiagnostics.eventsEmpty')}</p>}
      </details>
    </div>
  </details>;
}

const styles = stylex.create({
  details: { borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: theme.separator, paddingTop: 12 },
  summary: { fontSize: '.8125rem', lineHeight: '18px', cursor: 'default', borderRadius: 4 },
  summaryContent: { display: 'inline-flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, width: 'calc(100% - 16px)', verticalAlign: 'middle' },
  status: { color: theme.secondary, fontSize: '.75rem', lineHeight: '16px' },
  body: { display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 16 },
  fields: { margin: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  field: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, alignItems: 'baseline', fontSize: '.75rem', lineHeight: '16px' },
  value: { margin: 0, textAlign: 'right', color: theme.secondary, overflowWrap: 'anywhere', userSelect: 'text' },
  note: { margin: 0, color: theme.secondary, fontSize: '.75rem', lineHeight: '16px' },
  warning: { margin: 0, color: theme.danger, fontSize: '.75rem', lineHeight: '16px' },
  actions: { display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
  events: { minWidth: 0 },
  eventList: { listStyle: 'none', padding: 0, marginTop: 8, marginBottom: 0, maxHeight: 240, overflowY: 'auto' },
  event: { display: 'flex', flexDirection: 'column', gap: 4, paddingBlock: 8, borderBottomWidth: { default: 1, ':last-child': 0 }, borderBottomStyle: 'solid', borderBottomColor: theme.separator, fontSize: '.75rem', lineHeight: '16px' },
  eventTime: { color: theme.secondary, fontVariantNumeric: 'tabular-nums' },
  detail: { margin: 0, color: theme.secondary, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', userSelect: 'text' },
});
