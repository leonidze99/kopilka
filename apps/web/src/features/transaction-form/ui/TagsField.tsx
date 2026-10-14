import { MAX_TAGS } from '@kopilka/shared';
import { type KeyboardEvent, useId, useState } from 'react';
import { useListTagsQuery } from '@/entities/tag';
import { Chip } from '@/shared/ui';
import styles from './TagsField.module.css';

interface TagsFieldProps {
  value: string[];
  onChange: (names: string[]) => void;
  error?: string;
}

/**
 * As the API tells tags apart: case and ё/е aside. Only to keep the field
 * from showing one tag twice — the server decides what is the same tag.
 */
const sameTag = (a: string, b: string) =>
  a.trim().toLowerCase().replaceAll('ё', 'е') ===
  b.trim().toLowerCase().replaceAll('ё', 'е');

/**
 * Tags by name: Enter, a comma or leaving the field adds what is typed;
 * the user's tags are offered as it is typed. A new name becomes a new
 * tag when the transaction is saved.
 */
export function TagsField({ value, onChange, error }: TagsFieldProps) {
  const { data: tags = [] } = useListTagsQuery();
  const [draft, setDraft] = useState('');
  const inputId = useId();
  const listId = `${inputId}-tags`;
  const errorId = `${inputId}-error`;
  const full = value.length >= MAX_TAGS;

  const add = (...typed: string[]) => {
    setDraft('');
    const next = [...value];
    for (const raw of typed) {
      const name = raw.trim().replace(/\s+/g, ' ');
      if (!name || next.length >= MAX_TAGS) continue;
      if (next.some((tag) => sameTag(tag, name))) continue;
      // An existing tag keeps its spelling: "отпуск" adds "Отпуск".
      next.push(tags.find((tag) => sameTag(tag.name, name))?.name ?? name);
    }
    if (next.length > value.length) onChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      // Enter would submit the whole form.
      event.preventDefault();
      add(draft);
    } else if (event.key === 'Backspace' && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const offered = tags.filter(
    (tag) => !value.some((name) => sameTag(name, tag.name)),
  );

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        Теги
      </label>
      <div className={styles.box} data-invalid={error ? '' : undefined}>
        {value.length > 0 && (
          <ul className={styles.chips} aria-label="Выбранные теги">
            {value.map((name) => (
              <li key={name}>
                <Chip
                  removeLabel={`Убрать тег «${name}»`}
                  onRemove={() =>
                    onChange(value.filter((other) => other !== name))
                  }
                >
                  {name}
                </Chip>
              </li>
            ))}
          </ul>
        )}
        {!full && (
          <input
            id={inputId}
            className={styles.input}
            list={listId}
            value={draft}
            placeholder={value.length ? '' : 'Отпуск, ремонт…'}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              const next = event.target.value;
              // Pasted "Отпуск, Сочи" (or typed without a keydown for the
              // comma, as an IME does): everything before the last comma
              // becomes tags, the rest stays to be typed on.
              if (next.includes(',')) {
                const parts = next.split(',');
                const rest = parts.pop() ?? '';
                add(...parts);
                setDraft(rest.trimStart());
                return;
              }
              // Picked from the suggestions: no key was pressed for it.
              const picked =
                !(event.nativeEvent instanceof InputEvent) ||
                event.nativeEvent.inputType === 'insertReplacementText';
              if (picked && offered.some((tag) => tag.name === next)) add(next);
              else setDraft(next);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => add(draft)}
          />
        )}
      </div>
      <datalist id={listId}>
        {offered.map((tag) => (
          <option key={tag.id} value={tag.name} />
        ))}
      </datalist>
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
