import type { Language } from '../../../shared/contracts';

export function formatReduction(originalBytes: number, outputBytes: number, language: Language): string {
  let percent = 0;
  if (Number.isFinite(originalBytes) && Number.isFinite(outputBytes) && originalBytes > 0 && outputBytes >= 0) {
    const tenths = Math.floor(Math.max(0, (originalBytes - outputBytes) * 1_000 / originalBytes));
    percent = Math.min(tenths / 10, outputBytes > 0 ? 99.9 : 100);
  }
  return new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(percent);
}
