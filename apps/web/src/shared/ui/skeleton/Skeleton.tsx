import type { CSSProperties } from 'react';
import styles from './Skeleton.module.css';

interface SkeletonProps {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  /** A circle or a rounded square, e.g. in place of an avatar. */
  radius?: CSSProperties['borderRadius'];
  className?: string;
}

/** A placeholder of what is loading. Decorative: announce loading elsewhere. */
export function Skeleton({
  width = '100%',
  height = 14,
  radius,
  className,
}: SkeletonProps) {
  return (
    <span
      className={[styles.skeleton, className].filter(Boolean).join(' ')}
      style={{ width, height, borderRadius: radius }}
      aria-hidden
    />
  );
}
