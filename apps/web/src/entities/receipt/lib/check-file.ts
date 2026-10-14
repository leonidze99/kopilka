import { MAX_RECEIPT_BYTES, RECEIPT_TYPES } from '@kopilka/shared';

/**
 * Why the API would refuse this photo, said before it is sent: a 20 MB
 * upload on a phone's connection should not end in a 413. The API checks
 * the bytes themselves; this goes by what the browser says the file is.
 */
export function receiptFileProblem(file: File): string | undefined {
  if (file.size > MAX_RECEIPT_BYTES) {
    return `«${file.name}» больше ${MAX_RECEIPT_BYTES / 1024 / 1024} МБ`;
  }
  if (/\.hei[cf]$/i.test(file.name) || /heic|heif/.test(file.type)) {
    return `«${file.name}» в формате HEIC — сохраните фото как JPEG`;
  }
  if (!(RECEIPT_TYPES as readonly string[]).includes(file.type)) {
    return `«${file.name}» — не фото: подходят JPEG, PNG, WebP и AVIF`;
  }
  return undefined;
}

/** For <input type="file" accept>. */
export const RECEIPT_ACCEPT = RECEIPT_TYPES.join(',');
