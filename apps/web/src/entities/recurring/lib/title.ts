import type { RecurringRule } from '../api/recurring-api';

/** The categories a rule's payments count in: its own, or its parts'. */
export function ruleCategories(rule: RecurringRule) {
  if (rule.type === 'transfer') return [];
  return rule.category ? [rule.category] : rule.splits.map((s) => s.category);
}

/** "Жильё", "Свет, Вода" for a split rule, "Перевод". */
export function ruleTitle(rule: RecurringRule): string {
  if (rule.type === 'transfer') return 'Перевод';
  return ruleCategories(rule)
    .map((category) => category.name)
    .join(', ');
}
