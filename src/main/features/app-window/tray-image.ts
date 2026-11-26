import { nativeImage, type NativeImage } from 'electron';

export function createTrayImage(): NativeImage {
  const image = nativeImage.createEmpty();
  for (const scaleFactor of [1, 2]) {
    const size = 18 * scaleFactor;
    const symbol = nativeImage.createFromNamedImage('photo', { pointSize: size, weight: 'regular' });
    image.addRepresentation({ scaleFactor, dataURL: symbol.resize({ width: size, height: size }).toDataURL() });
  }
  image.setTemplateImage(true);
  return image;
}
