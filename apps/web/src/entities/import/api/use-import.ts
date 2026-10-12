import { importApi, isImportBusy, useGetImportQuery } from './import-api';

/** Often enough to see the bar move, rare enough to cost nothing. */
const POLL_MS = 1000;

/**
 * An import, polled while the server works on it. The interval comes from
 * what is already cached: once a poll brings "ready" or "done", the next
 * render passes 0 and polling stops by itself.
 */
export function useImport(id: string) {
  const { data } = importApi.endpoints.getImport.useQueryState(id);
  const busy = data !== undefined && isImportBusy(data.status);
  return useGetImportQuery(id, { pollingInterval: busy ? POLL_MS : 0 });
}
