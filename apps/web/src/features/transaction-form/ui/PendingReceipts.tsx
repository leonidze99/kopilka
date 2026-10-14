import { MAX_RECEIPTS } from '@kopilka/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReceiptGallery,
  receiptFileProblem,
  useUploadReceiptMutation,
} from '@/entities/receipt';
import { errorMessage, toApiError } from '@/shared/lib';

interface PendingPhoto {
  key: string;
  file: File;
  /** A local preview: the photo has not been sent yet. */
  url: string;
}

/**
 * Photos picked for a transaction that does not exist yet: shown from the
 * files themselves, sent once the transaction is saved and has an id.
 */
export function usePendingReceipts() {
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState<string>();
  const [upload] = useUploadReceiptMutation();

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

  const add = (files: File[]) => {
    const room = MAX_RECEIPTS - photos.length;
    const fitting = files.filter((file) => !receiptFileProblem(file));
    setError(
      files.map(receiptFileProblem).find(Boolean) ??
        (fitting.length > room
          ? `Не больше ${MAX_RECEIPTS} фото на операцию`
          : undefined),
    );
    setPhotos([
      ...photos,
      ...fitting.slice(0, room).map((file) => ({
        key: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
      })),
    ]);
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

  const gallery = (
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
  );

  return { gallery, send, clearError: () => setError(undefined) };
}
