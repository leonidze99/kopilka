import type { CSSProperties } from 'react';
import { useCategoryColor } from '../lib/color';
import styles from './CategoryAvatar.module.css';

interface CategoryAvatarProps {
  category: { id: string; name: string };
  size?: 'md' | 'sm';
  className?: string;
}

/**
 * A tinted square with the first letter of the category name, in the same
 * color as the category in charts.
 */
export function CategoryAvatar({
  category,
  size = 'md',
  className,
}: CategoryAvatarProps) {
  const color = useCategoryColor(category);
  return (
    <span
      className={[styles.avatar, styles[size], className]
        .filter(Boolean)
        .join(' ')}
      style={{ '--avatar-color': color } as CSSProperties}
      aria-hidden
    >
      {category.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
