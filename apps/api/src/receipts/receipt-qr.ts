import jsQRModule from 'jsqr';
import type { ReceiptScan } from '@kopilka/shared';
import { parseFiscalQr } from './fiscal-qr.js';
import { openReceiptImage } from './receipt-image.js';

// A CommonJS bundle typed with `export default`: under NodeNext the default
// import is typed as the module object, while at runtime it is the function.
const jsQR = jsQRModule as unknown as typeof jsQRModule.default;

/**
 * Sizes (long side) the photo is searched at, small first: most codes are
 * found at the first, in tens of milliseconds; a small code on a photo of
 * a long receipt needs more pixels. The last try also looks for light
 * modules on dark (some printers, some screenshots).
 */
const ATTEMPTS = [
  { side: 1200, inversion: 'dontInvert' },
  { side: 2000, inversion: 'dontInvert' },
  { side: 3000, inversion: 'attemptBoth' },
] as const;

/**
 * The QR code of a receipt photo, read on the server (jsQR over sharp's
 * pixels): no third-party service sees the user's receipts, and it works
 * the same in every browser. An unreadable file is refused as on upload.
 */
export async function scanReceipt(input: Buffer): Promise<ReceiptScan> {
  const source = await openReceiptImage(input);

  for (const { side, inversion } of ATTEMPTS) {
    const { data, info } = await source()
      // Upright by EXIF, so a photo taken sideways is searched as seen.
      .rotate()
      .resize(side, side, { fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const code = jsQR(new Uint8ClampedArray(data), info.width, info.height, {
      inversionAttempts: inversion,
    });
    if (code) return { found: true, receipt: parseFiscalQr(code.data) ?? null };
    // A photo smaller than the next size gives nothing new.
    if (Math.max(info.width, info.height) < side) break;
  }
  return { found: false, receipt: null };
}
