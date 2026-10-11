import { createSelector } from '@reduxjs/toolkit';
import { useSelector } from 'react-redux';
import { type Category, categoryApi } from '../api/category-api';

/** Hues in the palette (--series-1..8 in the global styles). */
const SLOTS = 8;

/**
 * Slot of each category: its place among the categories of its kind in
 * the order they were created (ids are UUIDv7, sorted by time). So the
 * first eight expense categories get eight different colors, and a
 * category keeps its color however its total ranks this month. Past the
 * eighth there is no slot: more hues could not be told apart.
 */
const selectSlots = createSelector(
  categoryApi.endpoints.listCategories.select(),
  ({ data = [] }) => {
    const slots = new Map<string, number>();
    for (const kind of ['expense', 'income'] as const) {
      data
        .filter((category) => category.kind === kind)
        .map((category) => category.id)
        .sort()
        .slice(0, SLOTS)
        .forEach((id, index) => slots.set(id, index + 1));
    }
    return slots;
  },
);

/**
 * The CSS color of a category: `var(--series-3)`, or the neutral one.
 * Reads the category list the app has already loaded; it requests nothing.
 */
export function useCategoryColor(category: Pick<Category, 'id'>): string {
  const slot = useSelector(selectSlots).get(category.id);
  return slot ? `var(--series-${slot})` : 'var(--series-none)';
}
