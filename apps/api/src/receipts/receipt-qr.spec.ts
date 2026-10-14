import QRCode from 'qrcode';
import sharp from 'sharp';
import { AppException } from '../common/errors/app.exception.js';
import { scanReceipt } from './receipt-qr.js';

const RECEIPT_QR =
  't=20261014T1630&s=1000.00&fn=7380440700076549&i=41406&fp=2671185794&n=1';

/**
 * A photo of a receipt, more or less: paper with a QR code near the bottom,
 * enlarged, turned a little, soft and saved as a JPEG.
 */
async function receiptPhoto(
  text: string | undefined,
  { qrSide = 240, angle = 6 } = {},
) {
  const paper = sharp({
    create: { width: 1200, height: 1800, channels: 3, background: '#f6f4ee' },
  });
  const page = text
    ? paper.composite([
        {
          input: await QRCode.toBuffer(text, { width: qrSide, margin: 2 }),
          left: 600 - qrSide / 2,
          top: 1400,
        },
      ])
    : paper;
  return sharp(await page.png().toBuffer())
    .resize(3000)
    .rotate(angle, { background: '#777' })
    .blur(1.2)
    .jpeg({ quality: 75 })
    .toBuffer();
}

describe('scanReceipt', () => {
  it('reads the QR code of a receipt from a photo', async () => {
    const result = await scanReceipt(await receiptPhoto(RECEIPT_QR));

    expect(result).toEqual({
      found: true,
      receipt: {
        occurredAt: '2026-10-14T16:30',
        amount: '1000.00',
        type: 'expense',
      },
    });
  });

  it('finds a small code that the first size misses', async () => {
    const result = await scanReceipt(
      await receiptPhoto(RECEIPT_QR, { qrSide: 110, angle: 2 }),
    );

    expect(result.receipt?.amount).toBe('1000.00');
  });

  it('tells a QR code of something else from no code at all', async () => {
    const link = await scanReceipt(await receiptPhoto('https://example.com'));
    const nothing = await scanReceipt(await receiptPhoto(undefined));

    expect(link).toEqual({ found: true, receipt: null });
    expect(nothing).toEqual({ found: false, receipt: null });
  });

  it('refuses a file that is not a photo', async () => {
    await expect(scanReceipt(Buffer.from('nope'))).rejects.toBeInstanceOf(
      AppException,
    );
  });
});
