import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppState } from '../../../shared/contracts';
import { translations } from '../../../shared/locales';
import { APP_NAME } from '../../../shared/app';
import { createTranslator } from '../localization/i18n';

export type ActionRunner = (action: () => unknown) => Promise<void>;

export function useAppState() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useMemo(() => createTranslator(state?.translations ?? translations.vi), [state?.translations]);
  const clearError = useCallback(() => setError(null), []);
  const run: ActionRunner = useCallback(async (action) => {
    try { await action(); setError(null); }
    catch (failure) {
      console.error(`${APP_NAME} action failed`, failure);
      setError(failure instanceof Error ? failure.message : t('error.operationFailed'));
    }
  }, [t]);

  useEffect(() => {
    if (!window.tinyPNG) { setError(translations.vi['error.bridge']!); return; }
    let active = true;
    let receivedUpdate = false;
    const unsubscribe = window.tinyPNG.onState((snapshot) => {
      receivedUpdate = true;
      if (active) setState(snapshot);
    });
    void window.tinyPNG.getState().then((snapshot) => {
      if (active && !receivedUpdate) setState(snapshot);
    }).catch((failure: unknown) => {
      console.error(`${APP_NAME} could not load state`, failure);
      if (active) setError(translations.vi['error.bridge']!);
    });
    return () => { active = false; unsubscribe?.(); };
  }, []);

  useEffect(() => { document.documentElement.lang = state?.settings.language ?? 'vi'; }, [state?.settings.language]);

  return { state, error, clearError, run, t };
}
