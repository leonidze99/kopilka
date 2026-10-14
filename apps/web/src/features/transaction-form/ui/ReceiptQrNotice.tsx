import { useEffect, useRef, useState } from 'react';
import type { ReceiptScan } from '@/entities/receipt';
import { formatMoney } from '@/shared/lib';
import type { ReceiptFiller } from './TransactionForm';
import styles from './TransactionForm.module.css';

/** Where the reading of a receipt's QR code is. */
export type QrScan =
  | { status: 'scanning' }
  | { status: 'done'; id: number; result: ReceiptScan }
  | { status: 'failed' };

const when = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

interface ReceiptQrNoticeProps {
  scan?: QrScan;
  filler: ReceiptFiller;
}

/**
 * What the QR code of the photo gave. Filled in by itself while the amount
 * is empty; offered with a button when the user typed one already — what
 * they typed is not overwritten unasked.
 */
export function ReceiptQrNotice({ scan, filler }: ReceiptQrNoticeProps) {
  const [applied, setApplied] = useState<number>();
  // The form's filler is a new object on every render; the effect runs per
  // scan, not per render.
  const latest = useRef(filler);
  useEffect(() => {
    latest.current = filler;
  });

  const done = scan?.status === 'done' ? scan : undefined;
  useEffect(() => {
    const receipt = done?.result.receipt;
    if (!done || !receipt || !latest.current.amountEmpty()) return;
    latest.current.apply(receipt);
    setApplied(done.id);
  }, [done]);

  if (!scan) return null;
  if (scan.status === 'scanning') {
    return (
      <p className={styles.hint} aria-live="polite">
        Читаем QR-код чека…
      </p>
    );
  }
  if (scan.status === 'failed') {
    return (
      <p className={styles.hint} aria-live="polite">
        Не удалось прочитать QR-код — заполните сумму и дату сами
      </p>
    );
  }

  const { receipt, found } = scan.result;
  if (!receipt) {
    return (
      <p className={styles.hint} aria-live="polite">
        {found
          ? 'QR-код на фото — не от кассового чека'
          : 'QR-код на фото не найден — заполните сумму и дату сами'}
      </p>
    );
  }

  const summary = `${formatMoney(receipt.amount)}, ${when.format(new Date(receipt.occurredAt))}${
    receipt.type === 'income' ? ', возврат' : ''
  }`;
  return (
    <p className={styles.hint} aria-live="polite">
      {applied === scan.id ? (
        <>Из QR-кода чека: {summary}</>
      ) : (
        <>
          В чеке: {summary} ·{' '}
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => {
              filler.apply(receipt);
              setApplied(scan.id);
            }}
          >
            подставить
          </button>
        </>
      )}
    </p>
  );
}
