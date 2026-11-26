import type { Language } from './contracts';
import { translations } from './locales';

export type TranslationParams = Record<string, string | number>;
export type Translator = (key: string, params?: TranslationParams) => string;

export function createTranslator(language: Language, messages: Record<string, string> = translations[language]): Translator {
  const plurals = new Intl.PluralRules(language);
  return (key, params = {}) => {
    const pluralKey = typeof params.count === 'number' ? `${key}_${plurals.select(params.count)}` : key;
    return (messages[pluralKey] ?? messages[key] ?? key)
      .replace(/\{(\w+)\}/g, (token, name: string) => String(params[name] ?? token));
  };
}
