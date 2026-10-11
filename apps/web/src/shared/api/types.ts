import type { components, paths } from './schema';

/**
 * Types of the API contract, generated from apps/api/openapi.json
 * (`pnpm api:generate`). If the backend renames a path or changes a body,
 * the frontend stops compiling instead of failing at runtime.
 */
export type Schemas = components['schemas'];

export type ApiPath = keyof paths;

type JsonContent<T> = T extends { content: { 'application/json': infer B } }
  ? B
  : never;

export type RequestBody<
  P extends ApiPath,
  M extends keyof paths[P],
> = paths[P][M] extends { requestBody?: infer R } ? JsonContent<R> : never;

export type ResponseBody<
  P extends ApiPath,
  M extends keyof paths[P],
  S extends number,
> = paths[P][M] extends { responses: infer R }
  ? S extends keyof R
    ? JsonContent<R[S]>
    : never
  : never;
