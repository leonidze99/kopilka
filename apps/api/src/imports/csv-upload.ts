import { CsvError, parse } from 'csv-parse';
import type { Request } from 'express';
import { pipeline, Readable } from 'node:stream';
import {
  invalidFile,
  receiveUpload,
  type UploadedFile,
} from '../common/upload/receive-upload.js';

/** A statement is kilobytes; ten years of one are a few megabytes. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Enough to tell the encoding and see the header line. */
const SNIFF_BYTES = 64 * 1024;

/** The statement of a multipart upload, as a stream (see receiveUpload). */
export const receiveFile = (req: Request): Promise<UploadedFile> =>
  receiveUpload(req, {
    maxBytes: MAX_FILE_BYTES,
    defaultName: 'statement.csv',
  });

/**
 * Russian banks export Windows-1251 as often as UTF-8. Valid UTF-8 is
 * almost never accidental in Cyrillic 1251 text, so: UTF-8 if the start
 * decodes as such, 1251 otherwise. `stream: true` lets a character cut in
 * half at the end of the sample pass.
 */
function detectEncoding(head: Buffer, complete: boolean): string {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(head, {
      stream: !complete,
    });
    return 'utf-8';
  } catch {
    return 'windows-1251';
  }
}

/** The most frequent of ; , tab | in the header line, outside quotes. */
function detectDelimiter(text: string): string {
  const counts = new Map<string, number>();
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && ';,\t|'.includes(char)) {
      counts.set(char, (counts.get(char) ?? 0) + 1);
    }
  }
  let best = ',';
  for (const [char, count] of counts) {
    if (count > (counts.get(best) ?? 0)) best = char;
  }
  return best;
}

export interface CsvRecord {
  cells: string[];
  /** The line the record ends on, the first line being 1. */
  line: number;
}

/**
 * Bytes in, records out, chunk by chunk: memory stays flat whatever the
 * file size. Back-pressure comes for free: while the consumer awaits a
 * database insert, the parser stops pulling, the socket buffer fills up
 * and TCP slows the client down.
 */
export async function* readCsv(
  content: AsyncIterable<Buffer>,
): AsyncGenerator<CsvRecord> {
  const chunks = content[Symbol.asyncIterator]();
  const head: Buffer[] = [];
  let size = 0;
  let complete = false;
  while (size < SNIFF_BYTES) {
    const next = await chunks.next();
    if (next.done) {
      complete = true;
      break;
    }
    head.push(next.value);
    size += next.value.length;
  }

  const sample = Buffer.concat(head);
  const encoding = detectEncoding(sample, complete);
  const delimiter = detectDelimiter(new TextDecoder(encoding).decode(sample));

  async function* text(): AsyncGenerator<string> {
    // Drops a UTF-8 byte order mark; keeps a character split across chunks.
    const decoder = new TextDecoder(encoding);
    yield decoder.decode(sample, { stream: true });
    if (!complete) {
      for await (const chunk of { [Symbol.asyncIterator]: () => chunks }) {
        yield decoder.decode(chunk, { stream: true });
      }
    }
    yield decoder.decode();
  }

  const parser = parse({
    delimiter,
    info: true,
    // Banks add a trailing ";" or a summary line with fewer cells.
    relax_column_count: true,
    skip_empty_lines: true,
    // One record is a line of a statement, not megabytes.
    max_record_size: 64 * 1024,
  });
  // pipeline(), not pipe(): an error of the source (the size limit)
  // destroys the parser too, and iterating it rethrows the error.
  pipeline(Readable.from(text()), parser, () => {});

  try {
    for await (const { record, info } of parser as AsyncIterable<{
      record: string[];
      info: { lines: number };
    }>) {
      yield { cells: record, line: info.lines };
    }
  } catch (error) {
    if (error instanceof CsvError) {
      const line = (error as { lines?: number }).lines;
      throw invalidFile(
        `Malformed CSV: ${error.message}`,
        `Не удалось прочитать CSV${line ? ` (строка ${line})` : ''}`,
      );
    }
    throw error;
  }
}
