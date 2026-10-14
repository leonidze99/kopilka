import { HttpStatus, Injectable } from '@nestjs/common';
import {
  MAX_RECEIPT_BYTES,
  MAX_RECEIPTS,
  type Receipt,
  type ReceiptScan,
} from '@kopilka/shared';
import type { Request } from 'express';
import type { Readable } from 'node:stream';
import { AppException } from '../common/errors/app.exception.js';
import { receiveUpload } from '../common/upload/receive-upload.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { processReceiptImage } from './receipt-image.js';
import { scanReceipt } from './receipt-qr.js';

/** What a transaction lists of its receipts: never the bytes. */
export const receiptSelect = {
  id: true,
  width: true,
  height: true,
  size: true,
  createdAt: true,
} as const;

export type ReceiptVariant = 'image' | 'thumbnail';

const notFound = (what = 'Receipt') =>
  new AppException('NOT_FOUND', `${what} not found`, HttpStatus.NOT_FOUND);

const tooMany = () =>
  new AppException(
    'CONFLICT',
    `A transaction has at most ${MAX_RECEIPTS} receipts`,
    HttpStatus.CONFLICT,
    [{ field: 'file', message: `Не больше ${MAX_RECEIPTS} фото на операцию` }],
  );

/** The whole upload in memory: at most MAX_RECEIPT_BYTES, cut off past it. */
async function readAll(content: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of content) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/**
 * Receipt photos, kept in Postgres (see the Receipt model). Everything
 * that knows where the bytes are is here: object storage would replace
 * the reads and writes of `image`/`thumbnail`, not the callers.
 */
@Injectable()
export class ReceiptsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Checked before the upload is read and again under a lock after: the
   * first spares decoding a photo for a transaction that is not there or
   * full; the second keeps two uploads at once from making a sixth.
   * The decoding happens between the two, outside any transaction: it
   * takes a CPU second, and a lock held through it would hold up edits.
   */
  async add(userId: string, transactionId: string, req: Request) {
    await this.assertRoom(this.prisma, userId, transactionId);

    const processed = await this.withUpload(req, processReceiptImage);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM transactions
        WHERE id = ${transactionId}::uuid AND user_id = ${userId}::uuid
        FOR UPDATE
      `;
      await this.assertRoom(tx, userId, transactionId);
      return tx.receipt.create({
        data: {
          userId,
          transactionId,
          width: processed.width,
          height: processed.height,
          size: processed.image.length,
          // Prisma's Bytes want a plain ArrayBuffer behind them; a Buffer
          // may sit on a shared pool.
          image: new Uint8Array(processed.image),
          thumbnail: new Uint8Array(processed.thumbnail),
        },
        select: receiptSelect,
      }) satisfies Promise<Receipt>;
    });
  }

  /**
   * What the QR code on a photo says, to fill in a transaction before it is
   * saved. Nothing is stored: the photo is attached (and kept) once the
   * transaction exists.
   */
  scan(req: Request): Promise<ReceiptScan> {
    return this.withUpload(req, scanReceipt);
  }

  /** The uploaded photo, whole, handed to `work`. */
  private async withUpload<T>(
    req: Request,
    work: (photo: Buffer) => Promise<T>,
  ): Promise<T> {
    const file = await receiveUpload(req, {
      maxBytes: MAX_RECEIPT_BYTES,
      defaultName: 'receipt',
    });
    try {
      return await work(await readAll(file.content));
    } catch (error) {
      // An early error (too large, not a photo) still has to answer.
      file.discard();
      throw error;
    }
  }

  /** The stored WebP, or its thumbnail. */
  async read(
    userId: string,
    id: string,
    variant: ReceiptVariant,
  ): Promise<Uint8Array> {
    // Only the column asked for: the other one is megabytes or a waste.
    const where = { id, userId };
    const bytes =
      variant === 'image'
        ? (
            await this.prisma.receipt.findFirst({
              where,
              select: { image: true },
            })
          )?.image
        : (
            await this.prisma.receipt.findFirst({
              where,
              select: { thumbnail: true },
            })
          )?.thumbnail;
    if (!bytes) throw notFound();
    return bytes;
  }

  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.receipt.deleteMany({
      where: { id, userId },
    });
    if (count === 0) throw notFound();
  }

  private async assertRoom(
    db: Pick<PrismaService, 'transaction' | 'receipt'>,
    userId: string,
    transactionId: string,
  ) {
    const transaction = await db.transaction.findFirst({
      where: { id: transactionId, userId },
      select: { _count: { select: { receipts: true } } },
    });
    if (!transaction) throw notFound('Transaction');
    if (transaction._count.receipts >= MAX_RECEIPTS) throw tooMany();
  }
}
