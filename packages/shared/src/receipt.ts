import { z } from 'zod';

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
