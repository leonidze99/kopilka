import { MAX_RECEIPTS } from '@kopilka/shared';
import { useState } from 'react';
import {
  type Receipt,
  ReceiptGallery,
  ReceiptPicture,
  receiptFileProblem,
  useDeleteReceiptMutation,
  useUploadReceiptMutation,
} from '@/entities/receipt';
import { errorMessage, toApiError } from '@/shared/lib';
import { ConfirmButton, Dialog, FormError, toast } from '@/shared/ui';
import styles from './TransactionReceipts.module.css';

/** What to tell the user about a failed upload: the field's own words first. */
const uploadError = (error: unknown) =>
  toApiError(error)?.details?.[0]?.message ?? errorMessage(error);

interface TransactionReceiptsProps {
  transactionId: string;
  receipts: Receipt[];
}

/**
 * The receipt photos of a saved transaction. A photo goes up as soon as it
 * is picked, apart from the form's "Сохранить": it is its own record, and
 * a lost form should not lose the photo.
 */
export function TransactionReceipts({
  transactionId,
  receipts,
}: TransactionReceiptsProps) {
  const [upload] = useUploadReceiptMutation();
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string>();
  const [viewing, setViewing] = useState<Receipt>();

  const add = async (files: File[]) => {
    const room = MAX_RECEIPTS - receipts.length;
    const problem = files.map(receiptFileProblem).find(Boolean);
    const fitting = files.filter((file) => !receiptFileProblem(file));
    const sent = fitting.slice(0, room);
    setError(
      problem ??
        (fitting.length > room
          ? `Не больше ${MAX_RECEIPTS} фото на операцию`
          : undefined),
    );
    // One at a time: each is a photo decoded on the server, and their
    // order is the order they were picked in.
    for (const [index, file] of sent.entries()) {
      setPending(sent.length - index);
      const result = await upload({ transactionId, file });
      if (result.error) {
        setError(uploadError(result.error));
        break;
      }
    }
    setPending(0);
  };

  return (
    <>
      <ReceiptGallery
        items={receipts.map((receipt, index) => ({
          key: receipt.id,
          label: `Фото чека ${index + 1}`,
          picture: (
            <ReceiptPicture id={receipt.id} variant="thumbnail" alt="" />
          ),
          onOpen: () => setViewing(receipt),
        }))}
        pending={pending}
        canAdd={receipts.length + pending < MAX_RECEIPTS}
        onAdd={(files) => void add(files)}
        error={error}
      />
      <Dialog
        open={!!viewing}
        onClose={() => setViewing(undefined)}
        title="Фото чека"
      >
        {viewing && (
          <ReceiptViewer
            receipt={viewing}
            onDeleted={() => setViewing(undefined)}
          />
        )}
      </Dialog>
    </>
  );
}

function ReceiptViewer({
  receipt,
  onDeleted,
}: {
  receipt: Receipt;
  onDeleted: () => void;
}) {
  const [remove, { isLoading, error }] = useDeleteReceiptMutation();
  return (
    <div className={styles.viewer}>
      <div
        className={styles.frame}
        // Keeps the place while the photo loads, at its own proportions.
        style={{ aspectRatio: `${receipt.width} / ${receipt.height}` }}
      >
        <ReceiptPicture
          id={receipt.id}
          variant="image"
          alt="Фото чека"
          className={styles.photo}
        />
      </div>
      <ConfirmButton
        look="text"
        label="Удалить фото чека"
        loading={isLoading}
        onConfirm={async () => {
          const result = await remove(receipt.id);
          if (result.error) return;
          toast('Фото удалено');
          onDeleted();
        }}
      />
      <FormError message={error && errorMessage(error)} />
    </div>
  );
}
