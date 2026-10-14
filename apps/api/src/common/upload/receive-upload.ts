import { HttpStatus } from '@nestjs/common';
import busboy from 'busboy';
import type { Request } from 'express';
import type { Readable } from 'node:stream';
import { AppException } from '../errors/app.exception.js';

/** A problem with the uploaded file, on the form's "file" field. */
export const invalidFile = (
  message: string,
  detail: string,
  status = HttpStatus.BAD_REQUEST,
) =>
  new AppException('VALIDATION_FAILED', message, status, [
    { field: 'file', message: detail },
  ]);

export const fileTooLarge = (maxBytes: number) =>
  invalidFile(
    'File too large',
    `Файл больше ${maxBytes / 1024 / 1024} МБ`,
    HttpStatus.PAYLOAD_TOO_LARGE,
  );

export interface UploadedFile {
  name: string;
  /** Errors with fileTooLarge() as soon as the limit is crossed. */
  content: Readable;
  /** Reads the rest of the request into nowhere: lets an early error respond. */
  discard(): void;
}

interface UploadOptions {
  maxBytes: number;
  /** When the client sends no file name. */
  defaultName: string;
}

/**
 * The "file" part of a multipart/form-data request, as a stream: nothing
 * is buffered whole, in memory or on disk. The size limit cuts the stream
 * off as it is crossed, not after the whole upload has arrived.
 */
export function receiveUpload(
  req: Request,
  { maxBytes, defaultName }: UploadOptions,
): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    let parser: busboy.Busboy;
    try {
      parser = busboy({
        headers: req.headers,
        limits: { files: 1, fileSize: maxBytes, fields: 10, parts: 11 },
      });
    } catch {
      // Not multipart/form-data at all.
      reject(invalidFile('Expected multipart/form-data', 'Выберите файл'));
      return;
    }
    const discard = () => {
      req.unpipe(parser);
      req.resume();
    };

    parser.on('file', (field, stream, info) => {
      if (field !== 'file') {
        stream.resume();
        return;
      }
      stream.once('limit', () => stream.destroy(fileTooLarge(maxBytes)));
      resolve({
        name: info.filename || defaultName,
        content: stream,
        discard,
      });
    });
    // No file part in the whole request (after resolve() this is a no-op).
    parser.once('close', () =>
      reject(invalidFile('No file in the request', 'Выберите файл')),
    );
    parser.once('error', (error) => {
      discard();
      reject(
        invalidFile(
          `Malformed multipart body: ${(error as Error).message}`,
          'Не удалось получить файл',
        ),
      );
    });
    req.pipe(parser);
  });
}
