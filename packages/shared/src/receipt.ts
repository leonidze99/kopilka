import { z } from 'zod';
import { transactionKindSchema } from './category.js';

/** Photos of receipts on one transaction: a long receipt takes a few. */
export const MAX_RECEIPTS = 5;

/**
 * Of the upload, before it is resized: a phone photo is 2–8 MB. The
 * client checks it too, so a too large photo is refused before it is sent.
 */
export const MAX_RECEIPT_BYTES = 15 * 1024 * 1024;

/** What a photo may be uploaded as. HEIC is not read: see ReceiptsService. */
export const RECEIPT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;

/** A receipt photo as listed; the image itself is a separate request. */
export const receiptSchema = z
  .object({
    id: z.uuid(),
    /** Of the stored image, after the resize. */
    width: z.number().int(),
    height: z.number().int(),
    /** Bytes of the stored image. */
    size: z.number().int(),
    createdAt: z.coerce.date(),
  })
  .meta({ id: 'Receipt' });

export type Receipt = z.infer<typeof receiptSchema>;

/**
 * What the QR code of a Russian cash receipt says: enough to fill in a
 * transaction before it is saved.
 */
export const receiptQrSchema = z
  .object({
    /**
     * The time printed on the receipt, "2026-10-14T16:30": the store's
     * local time, without a zone (the code has none).
     */
    occurredAt: z.string(),
    /** The total, with 2 fraction digits. */
    amount: z.string(),
    /** A purchase is an expense; a refund of one is an income. */
    type: transactionKindSchema,
  })
  .meta({ id: 'ReceiptQr' });

export const receiptScanSchema = z
  .object({
    /** A QR code was found on the photo at all. */
    found: z.boolean(),
    /** What it says, if it is the code of a cash receipt. */
    receipt: receiptQrSchema.nullable(),
  })
  .meta({ id: 'ReceiptScan' });

export type ReceiptQr = z.infer<typeof receiptQrSchema>;
export type ReceiptScan = z.infer<typeof receiptScanSchema>;
