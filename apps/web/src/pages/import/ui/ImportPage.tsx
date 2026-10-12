import { useNavigate } from 'react-router';
import { UploadStatementForm } from '@/features/import-upload';
import { Panel } from '@/shared/ui';
import { ImportHistory } from '@/widgets/import-history';
import styles from '../../page.module.css';
import own from './ImportPage.module.css';

export function ImportPage() {
  const navigate = useNavigate();

  return (
    <div className={`${styles.stack} ${own.narrow}`}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Импорт выписки</h1>
        <p className={styles.subtitle}>
          Операции из банка — без ручного ввода. Повторно загруженные строки не
          задвоятся.
        </p>
      </div>
      <Panel title="Новый импорт">
        <UploadStatementForm
          onUploaded={(imported) => navigate(`/import/${imported.id}`)}
        />
        <p className={own.hint}>
          Выгрузите операции из интернет-банка в формате CSV. Выписку Т-Банка
          Копилка узнаёт сама, в файле другого банка колонки можно выбрать
          вручную.
        </p>
      </Panel>
      <ImportHistory />
    </div>
  );
}
