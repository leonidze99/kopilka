import { Download } from 'lucide-react';
import {
  type ExportParams,
  useExportTransactionsMutation,
} from '@/entities/transaction';
import { errorMessage } from '@/shared/lib';
import { Button, toast } from '@/shared/ui';

interface ExportCsvButtonProps {
  /** The filters of the list, so the file holds exactly what is on screen. */
  params: Omit<ExportParams, 'timeZone'>;
  /** Without the .csv: what the saved file is called. */
  name: string;
}

/**
 * Downloads the current view as CSV. The file is built by the API and
 * arrives as a blob; the browser saves it through a link that lives for
 * one click, since there is no URL to point at (the request carries the
 * access token in a header).
 */
export function ExportCsvButton({ params, name }: ExportCsvButtonProps) {
  const [exportCsv, { isLoading }] = useExportTransactionsMutation();

  const download = async () => {
    const result = await exportCsv({
      ...params,
      // Dates in the file read as they do on screen.
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if ('error' in result) {
      toast(errorMessage(result.error));
      return;
    }
    const url = URL.createObjectURL(result.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      loading={isLoading}
      onClick={() => void download()}
      title="Скачать то, что показано, в CSV"
    >
      <Download size={16} aria-hidden />
      Экспорт
    </Button>
  );
}
