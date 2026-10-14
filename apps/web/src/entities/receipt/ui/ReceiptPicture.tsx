import { ImageOff } from 'lucide-react';
import { Skeleton } from '@/shared/ui';
import { type ReceiptVariant, useReceiptImageQuery } from '../api/receipt-api';
import styles from './ReceiptPicture.module.css';

interface ReceiptPictureProps {
  id: string;
  variant: ReceiptVariant;
  /** What the picture is, for a screen reader. */
  alt: string;
  className?: string;
}

/** A stored receipt photo, loaded with the user's token. */
export function ReceiptPicture({
  id,
  variant,
  alt,
  className,
}: ReceiptPictureProps) {
  const { data: src, isError } = useReceiptImageQuery({ id, variant });
  if (isError) {
    return (
      <span
        className={`${styles.missing} ${className ?? ''}`}
        role="img"
        aria-label={alt}
      >
        <ImageOff size={18} aria-hidden />
      </span>
    );
  }
  if (!src) return <Skeleton width="100%" height="100%" radius={8} />;
  return <img className={className} src={src} alt={alt} />;
}
