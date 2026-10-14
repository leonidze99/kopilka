import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBody,
  type ApiBodyOptions,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { minutes, Throttle } from '@nestjs/throttler';
import {
  MAX_RECEIPT_BYTES,
  MAX_RECEIPTS,
  type Receipt,
  type ReceiptScan,
  receiptScanSchema,
  receiptSchema,
} from '@kopilka/shared';
import type { Request } from 'express';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ApiErrorResponses } from '../common/openapi/api-error-responses.decorator.js';
import { ReceiptsService, type ReceiptVariant } from './receipts.service.js';

/**
 * A receipt never changes (a new photo is a new id): the browser may keep
 * it as long as it likes — privately, as it is behind a token.
 */
const CACHE_FOREVER = 'private, max-age=31536000, immutable';

/** A multipart body with the photo in "file". */
const PHOTO_BODY: ApiBodyOptions = {
  schema: {
    type: 'object',
    required: ['file'],
    properties: { file: { type: 'string', format: 'binary' } },
  },
};

const imageResponse = {
  description: 'image/webp',
  content: { 'image/webp': { schema: { type: 'string', format: 'binary' } } },
} as const;

@ApiTags('receipts')
@ApiErrorResponses(401)
@Controller()
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Post('transactions/:id/receipts')
  // Each upload decodes a photo: a CPU second, not a cheap request.
  @Throttle({ default: { limit: 20, ttl: minutes(1) } })
  @ApiOperation({
    summary: 'Attach a photo of the receipt to a transaction',
    description: `JPEG, PNG, WebP or AVIF, up to ${MAX_RECEIPT_BYTES / 1024 / 1024} MB; stored resized as WebP, without its metadata. At most ${MAX_RECEIPTS} per transaction (CONFLICT).`,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody(PHOTO_BODY)
  @ApiCreatedResponse({ standardSchema: receiptSchema })
  @ApiErrorResponses(400, 404, 409, 413, 429)
  add(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) transactionId: string,
    @Req() req: Request,
  ): Promise<Receipt> {
    return this.receipts.add(user.id, transactionId, req);
  }

  @Post('receipts/scan')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: minutes(1) } })
  @ApiOperation({
    summary: 'Read the QR code of a receipt photo',
    description:
      'The time, the total and the kind of operation of a Russian cash receipt, to fill in a transaction before it is saved. Nothing is stored. `found: false` — no QR code on the photo; `receipt: null` with `found: true` — a code of something else.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody(PHOTO_BODY)
  @ApiOkResponse({ standardSchema: receiptScanSchema })
  @ApiErrorResponses(400, 413, 429)
  scan(@Req() req: Request): Promise<ReceiptScan> {
    return this.receipts.scan(req);
  }

  @Get('receipts/:id/image')
  @Header('Cache-Control', CACHE_FOREVER)
  @ApiOperation({ summary: 'The photo of a receipt' })
  @ApiOkResponse(imageResponse)
  @ApiErrorResponses(404)
  image(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    return this.send(user, id, 'image');
  }

  @Get('receipts/:id/thumbnail')
  @Header('Cache-Control', CACHE_FOREVER)
  @ApiOperation({ summary: 'A small copy of the photo of a receipt' })
  @ApiOkResponse(imageResponse)
  @ApiErrorResponses(404)
  thumbnail(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    return this.send(user, id, 'thumbnail');
  }

  @Delete('receipts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete the photo of a receipt' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.receipts.remove(user.id, id);
  }

  private async send(user: AuthUser, id: string, variant: ReceiptVariant) {
    const bytes = await this.receipts.read(user.id, id, variant);
    return new StreamableFile(bytes, {
      type: 'image/webp',
      length: bytes.length,
    });
  }
}
