import { nativeImage, type NativeImage } from 'electron';
import path from 'node:path';

export function createTrayImage(): NativeImage {
  const file = path.join(__dirname, '../assets/tray.png');
  const image = nativeImage.createFromPath(file);
  if (image.isEmpty()) throw new Error(`Missing or invalid dinosaur menu bar PNG: ${file}`);
  image.setTemplateImage(false);
  return image;
}
