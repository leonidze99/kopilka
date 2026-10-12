import { ArrowLeft, CircleCheck, FileQuestion } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  IMPORT_STATUS_LABELS,
  type Import,
  ImportProgress,
  isImportBusy,
  OPERATIONS,
  ROWS,
  useImport,
} from '@/entities/import';
import { ImportCategoriesForm } from '@/features/import-commit';
import { DiscardImportButton } from '@/features/import-discard';
import { ImportColumnsForm } from '@/features/import-mapping';
import { errorMessage, pluralize } from '@/shared/lib';
import {
  Button,
  ButtonLink,
  EmptyState,
  FormError,
  Panel,
  Skeleton,
} from '@/shared/ui';
import styles from '../../page.module.css';
import own from './ImportPage.module.css';

const STEPS = ['Колонки', 'Проверка', 'Готово'] as const;

const stepOf = (status: Import['status']) =>
  status === 'uploaded' || status === 'parsing' || status === 'failed'
    ? 0
    : status === 'done'
      ? 2
      : 1;

function Steps({ status }: { status: Import['status'] }) {
  const current = stepOf(status);
  return (
    <ol className={own.steps} aria-label="Шаги импорта">
      {STEPS.map((step, index) => (
        <li
          key={step}
          className={[own.step, index < current && own.passed]
            .filter(Boolean)
            .join(' ')}
          aria-current={index === current ? 'step' : undefined}
        >
          {step}
        </li>
      ))}
    </ol>
  );
}

function Counts({ imported }: { imported: Import }) {
  const { counts, errors } = imported;
  const items = [
    ['Новых', counts.new],
    ['Уже есть на счёте', counts.duplicate],
    ['Пропущено', counts.skipped],
    ['С ошибками', counts.invalid],
  ] as const;
  return (
    <>
      <dl className={own.counts}>
        {items.map(([label, value]) => (
          <div key={label} className={own.count}>
            <dt>{label}</dt>
            <dd>{value.toLocaleString('ru-RU')}</dd>
          </div>
        ))}
      </dl>
      {errors.length > 0 && (
        <details className={own.errors}>
          <summary>Какие строки не удалось прочитать</summary>
          <ul>
            {errors.map((error) => (
              <li key={error.line}>
                Строка {error.line}: {error.message}
              </li>
            ))}
            {counts.invalid > errors.length && (
              <li>…и ещё {pluralize(counts.invalid - errors.length, ROWS)}</li>
            )}
          </ul>
        </details>
      )}
      {counts.skipped > 0 && (
        <p className={own.hint}>
          Пропущены строки, которые не стали операциями: отклонённые платежи и
          нулевые суммы.
        </p>
      )}
    </>
  );
}

function Done({ imported }: { imported: Import }) {
  const { counts, account } = imported;
  return (
    <Panel>
      <div className={own.done}>
        <p className={own.doneTitle}>
          <CircleCheck className={own.doneIcon} size={24} aria-hidden />
          {counts.imported > 0
            ? `Добавлено ${pluralize(counts.imported, OPERATIONS)}`
            : 'Новых операций не было'}
        </p>
        <p className={own.doneText}>
          {counts.duplicate > 0
            ? `${pluralize(counts.duplicate, OPERATIONS)} уже были на счёте и не задвоились. `
            : ''}
          {account && `Счёт: ${account.name}.`}
        </p>
        <div className={own.actions}>
          <ButtonLink
            variant="primary"
            to={account ? `/?account=${account.id}` : '/'}
          >
            К операциям
          </ButtonLink>
          <ButtonLink to="/import">Загрузить ещё</ButtonLink>
        </div>
      </div>
    </Panel>
  );
}

export function ImportDetailsPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [editingColumns, setEditingColumns] = useState(false);
  const { data: imported, error, isLoading } = useImport(id);

  const back = (
    <ButtonLink to="/import" variant="ghost" size="sm" className={own.back}>
      <ArrowLeft size={16} aria-hidden />
      Все импорты
    </ButtonLink>
  );

  if (isLoading) {
    return (
      <div
        className={`${styles.stack} ${own.narrow}`}
        role="status"
        aria-label="Загрузка"
      >
        <Skeleton width={240} height={28} />
        <Skeleton height={200} />
      </div>
    );
  }
  if (!imported) {
    return (
      <div className={`${styles.stack} ${own.narrow}`}>
        {back}
        <Panel>
          <EmptyState
            icon={<FileQuestion size={22} />}
            title="Импорт не найден"
          >
            {error ? errorMessage(error) : null}
          </EmptyState>
        </Panel>
      </div>
    );
  }

  const { status } = imported;
  const discardable = status !== 'importing' && status !== 'done';

  return (
    <div className={`${styles.stack} ${own.narrow}`}>
      {back}
      <div className={own.toolbar}>
        <div className={own.titleBlock}>
          <h1 className={styles.title}>{imported.fileName}</h1>
          <p className={styles.subtitle}>
            {IMPORT_STATUS_LABELS[status]}
            {imported.account && ` · ${imported.account.name}`}
          </p>
        </div>
        {discardable && (
          <DiscardImportButton
            importId={imported.id}
            fileName={imported.fileName}
            onDiscarded={() => navigate('/import')}
          />
        )}
      </div>
      <Steps status={status} />

      {isImportBusy(status) && (
        <Panel>
          <ImportProgress imported={imported} />
        </Panel>
      )}

      {(status === 'uploaded' || status === 'failed') && (
        <Panel title="Что в каких колонках">
          {status === 'failed' && (
            <FormError message={imported.error ?? undefined} />
          )}
          <ImportColumnsForm imported={imported} />
        </Panel>
      )}

      {status === 'ready' && (
        <>
          <Panel
            title="Что в файле"
            actions={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={editingColumns}
                onClick={() => setEditingColumns((open) => !open)}
              >
                {editingColumns ? 'Скрыть колонки' : 'Изменить колонки'}
              </Button>
            }
          >
            <Counts imported={imported} />
          </Panel>
          {editingColumns && (
            <Panel title="Что в каких колонках">
              <ImportColumnsForm
                imported={imported}
                onSaved={() => setEditingColumns(false)}
              />
            </Panel>
          )}
          {!editingColumns && (
            <Panel title="Категории">
              <ImportCategoriesForm
                // Fresh defaults after the rows were parsed again.
                key={imported.counts.new}
                imported={imported}
              />
            </Panel>
          )}
        </>
      )}

      {status === 'done' && <Done imported={imported} />}
    </div>
  );
}
