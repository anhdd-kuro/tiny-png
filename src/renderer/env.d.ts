import type { TinyPNG } from '../shared/contracts';

declare global {
  interface Window { tinyPNG: TinyPNG }
}
