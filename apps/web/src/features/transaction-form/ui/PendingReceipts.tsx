import { MAX_RECEIPTS } from '@kopilka/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReceiptGallery,
  receiptFileProblem,
  useScanReceiptMutation,
  useUploadReceiptMutation,
} from '@/entities/receipt';
import { errorMessage, toApiError } from '@/shared/lib';
import { type QrScan, ReceiptQrNotice } from './ReceiptQrNotice';
import type { ReceiptFiller } from './TransactionForm';

interface PendingPhoto {
  key: string;
  file: File;
  /** A local preview: the photo has not been sent yet. */
  url: string;
}

/**
 * Photos picked for a transaction that does not exist yet: shown from the
 * files themselves, sent once the transaction is saved and has an id. The
 * first photo is also read for its QR code, to fill the form in.
 */
export function usePendingReceipts() {
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState<string>();
  const [scan, setScan] = useState<QrScan>();
  const [upload] = useUploadReceiptMutation();
  const [scanReceipt] = useScanReceiptMutation();
  const scans = useRef(0);

  // Previews of photos still listed when the form goes away.
  const current = useRef(photos);
  useEffect(() => {
    current.current = photos;
  }, [photos]);
  useEffect(
    () => () =>
      current.current.forEach((photo) => URL.revokeObjectURL(photo.url)),
    [],
  );

  /**
   * Reads the QR code of a photo, unless one is being read or a receipt
   * was found already: one receipt per transaction, and the second photo
   * of a long receipt is usually its top, without the code.
   */
  const read = async (file: File) => {
    if (scan?.status === 'scanning') return;
    if (scan?.status === 'done' && scan.result.receipt) return;
    setScan({ status: 'scanning' });
    const result = await scanReceipt(file);
    setScan(
      result.data
        ? { status: 'done', id: ++scans.current, result: result.data }
        : { status: 'failed' },
    );
  };

  const add = (files: File[]) => {
    const room = MAX_RECEIPTS - photos.length;
    const fitting = files.filter((file) => !receiptFileProblem(file));
    setError(
      files.map(receiptFileProblem).find(Boolean) ??
        (fitting.length > room
          ? `Не больше ${MAX_RECEIPTS} фото на операцию`
          : undefined),
    );
    const added = fitting.slice(0, room);
    setPhotos([
      ...photos,
      ...added.map((file) => ({
        key: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
      })),
    ]);
    if (added[0]) void read(added[0]);
  };

  const remove = (key: string) => {
    const photo = photos.find((candidate) => candidate.key === key);
    if (photo) URL.revokeObjectURL(photo.url);
    setPhotos(photos.filter((candidate) => candidate !== photo));
  };

  /**
   * Sends the photos to the saved transaction and empties the list either
   * way: kept, they would go with the next transaction. A failure says so
   * — the transaction is there, the photo can be added to it again.
   */
  const send = useCallback(
    async (transactionId: string) => {
      const sending = current.current;
      setPhotos([]);
      setScan(undefined);
      for (const photo of sending) {
        const result = await upload({ transactionId, file: photo.file });
        if (result.error) {
          const reason =
            toApiError(result.error)?.details?.[0]?.message ??
            errorMessage(result.error);
          setError(
            `Операция сохранена, но фото «${photo.file.name}» не загрузилось: ${reason}. Добавьте его в операции.`,
          );
          break;
        }
      }
      sending.forEach((photo) => URL.revokeObjectURL(photo.url));
    },
    [upload],
  );

  /** The photos, and what their QR code gave: may fill the form in. */
  const render = (filler: ReceiptFiller) => (
    <>
      <ReceiptGallery
        items={photos.map((photo, index) => ({
          key: photo.key,
          label: `Фото чека ${index + 1}`,
          picture: <img src={photo.url} alt="" />,
          onRemove: () => remove(photo.key),
        }))}
        canAdd={photos.length < MAX_RECEIPTS}
        onAdd={add}
        error={error}
      />
      <ReceiptQrNotice scan={scan} filler={filler} />
    </>
  );

  return { render, send, clearError: () => setError(undefined) };
}
