export type Translator = (key: string, params?: Record<string, string | number>) => string;

export function createTranslator(messages: Record<string, string>): Translator {
  return (key, params = {}) => (messages[key] ?? key)
    .replace(/\{(\w+)\}/g, (token, name: string) => String(params[name] ?? token));
}
