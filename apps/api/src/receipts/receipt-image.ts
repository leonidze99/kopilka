import sharp, { type Sharp } from 'sharp';
import { invalidFile } from '../common/upload/receive-upload.js';

/** Long side of the stored image: a receipt stays readable, not 12 MP. */
export const IMAGE_SIDE = 2000;
/** Long side of the thumbnail in the form (shown at about 80 px, 3x). */
export const THUMBNAIL_SIDE = 240;

/**
 * Decoding stops past this many pixels: a small file that unpacks into
 * gigapixels (a decompression bomb) is refused before it takes the memory.
 * A 50 MP phone photo is 50 million.
 */
const MAX_INPUT_PIXELS = 60_000_000;

/** What sharp reports for the formats taken in (AVIF is "heif"). */
const ACCEPTED = new Set(['jpeg', 'png', 'webp', 'heif']);

export interface ReceiptImage {
  image: Buffer;
  thumbnail: Buffer;
  width: number;
  height: number;
}

export const unreadable = () =>
  invalidFile(
    'Not an image of a supported format',
    'Не удалось прочитать фото: подходят JPEG, PNG, WebP и AVIF',
  );

/**
 * A photo of one of the accepted formats, as a factory of sharp pipelines
 * over it. The format is read from the bytes, never from the Content-Type
 * or the name; decoding stops at MAX_INPUT_PIXELS.
 */
export async function openReceiptImage(input: Buffer): Promise<() => Sharp> {
  const source = () =>
    sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });

  let format: string | undefined;
  try {
    ({ format } = await source().metadata());
  } catch {
    throw unreadable();
  }
  if (!format || !ACCEPTED.has(format)) throw unreadable();
  return source;
}

/**
 * The upload re-encoded as WebP: turned upright by its EXIF orientation,
 * no larger than IMAGE_SIDE, with all metadata dropped — sharp writes none
 * unless asked, and a phone photo's EXIF has the place it was taken.
 */
export async function processReceiptImage(
  input: Buffer,
): Promise<ReceiptImage> {
  const source = await openReceiptImage(input);

  try {
    const { data: image, info } = await source()
      .rotate()
      .resize(IMAGE_SIDE, IMAGE_SIDE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    const thumbnail = await sharp(image)
      .resize(THUMBNAIL_SIDE, THUMBNAIL_SIDE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 70 })
      .toBuffer();
    return { image, thumbnail, width: info.width, height: info.height };
  } catch {
    // A header sharp could read over a body it cannot: HEIC (HEVC) reports
    // as heif and only fails here, a truncated JPEG too.
    throw unreadable();
  }
}
