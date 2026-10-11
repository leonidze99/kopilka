import type { CSSProperties } from 'react';
import styles from './CategoryAvatar.module.css';

// Hues far enough apart to tell neighbours in a list apart.
const HUES = [152, 211, 262, 330, 22, 42, 186, 0, 96, 288];

/** The same category always gets the same color, on every device. */
function hueOf(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return HUES[Math.abs(hash) % HUES.length] ?? 0;
}

interface CategoryAvatarProps {
  category: { id: string; name: string };
  size?: 'md' | 'sm';
}

/** A colored circle with the first letter of the category name. */
export function CategoryAvatar({ category, size = 'md' }: CategoryAvatarProps) {
  return (
    <span
      className={`${styles.avatar} ${styles[size]}`}
      style={{ '--hue': hueOf(category.id) } as CSSProperties}
      aria-hidden
    >
      {category.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
