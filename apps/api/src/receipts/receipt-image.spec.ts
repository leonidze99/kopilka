import sharp from 'sharp';
import { AppException } from '../common/errors/app.exception.js';
import {
  IMAGE_SIDE,
  processReceiptImage,
  THUMBNAIL_SIDE,
} from './receipt-image.js';

/** A plain gray picture of the size, in the format. */
const picture = (width: number, height: number) =>
  sharp({
    create: { width, height, channels: 3, background: '#888' },
  });

describe('processReceiptImage', () => {
  it('shrinks a large photo to the long side, keeping its proportions', async () => {
    const input = await picture(4000, 3000).jpeg().toBuffer();

    const result = await processReceiptImage(input);

    expect(result).toMatchObject({ width: IMAGE_SIDE, height: 1500 });
    const stored = await sharp(result.image).metadata();
    expect(stored).toMatchObject({ format: 'webp', width: 2000, height: 1500 });
    const thumbnail = await sharp(result.thumbnail).metadata();
    expect(thumbnail).toMatchObject({
      format: 'webp',
      width: THUMBNAIL_SIDE,
      height: 180,
    });
  });

  it('does not blow up a small picture', async () => {
    const input = await picture(100, 50).png().toBuffer();

    const result = await processReceiptImage(input);

    expect(result).toMatchObject({ width: 100, height: 50 });
  });

  it('turns a photo upright and drops its metadata', async () => {
    // Orientation 6: the camera was held sideways; the viewer rotates 90°.
    const input = await picture(400, 300)
      .withMetadata({ orientation: 6 })
      .withExif({ IFD0: { Artist: 'Phone owner', Make: 'Phone' } })
      .jpeg()
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const result = await processReceiptImage(input);

    const stored = await sharp(result.image).metadata();
    expect(stored).toMatchObject({ width: 300, height: 400 });
    expect(stored.exif).toBeUndefined();
    expect(stored.orientation).toBeUndefined();
  });

  it.each([
    ['text', async () => Buffer.from('not a picture at all')],
    ['a GIF', () => picture(10, 10).gif().toBuffer()],
    [
      'an SVG',
      async () =>
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
        ),
    ],
    [
      'a cut-off JPEG',
      async () => (await picture(400, 300).jpeg().toBuffer()).subarray(0, 300),
    ],
  ])('refuses %s', async (_, make) => {
    const input = await make();

    const error = await processReceiptImage(input).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('VALIDATION_FAILED');
  });
});
