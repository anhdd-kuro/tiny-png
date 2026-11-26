import * as stylex from '@stylexjs/stylex';
import type { Settings } from '../../../shared/contracts';

type BackgroundSettings = Pick<Settings, 'backgroundStyle' | 'glassEnabled' | 'glassOpacity'>;
export function backgroundPaint(settings: BackgroundSettings | undefined, hud = false) {
  const requested = settings?.glassEnabled ? settings.glassOpacity / 100 : 1;
  const alpha = hud && settings?.glassEnabled ? .78 + .22 * requested : requested;
  return {
    image: settings?.backgroundStyle === 'solid' ? 'none' : `linear-gradient(35deg,rgba(55,110,184,${alpha}) 0%,rgba(57,145,172,${alpha}) 48%,rgba(64,174,142,${alpha}) 100%)`,
    color: settings?.backgroundStyle === 'solid' ? `rgba(32,85,106,${alpha})` : 'transparent',
    hudAlpha: alpha,
    chromeAlpha: .35 + .47 * (1 - requested) / .8,
    surfaceAlpha: .35 + .53 * (1 - requested) / .8,
  };
}

export const backgroundStyles = stylex.create({
  paint: (image: string, color: string) => ({
    backgroundImage: { default: image, '@media (prefers-reduced-transparency: reduce)': 'none', '@media (prefers-contrast: more)': 'none' },
    backgroundColor: { default: color, '@media (prefers-reduced-transparency: reduce)': '#20556a', '@media (prefers-contrast: more)': '#20556a' },
  }),
});
