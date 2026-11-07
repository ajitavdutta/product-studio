/**
 * The only place in the app that calls `fetch`. Feature code goes through the
 * per-resource hooks in `src/api/`, which are typed from the generated `types.ts`.
 */

import type { components } from './types';

export const API_BASE = '/api';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const NO_CONTENT = 204;
const NETWORK_FAILURE_STATUS = 0;
const NETWORK_FAILURE_DETAIL = "Couldn't reach the server";

/** One problem from a `ProblemRead` body: a JSON pointer and a plain sentence. */
export type ErrorItem = components['schemas']['ErrorItem'];

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;
  /** Per-field problems from a 422 `ProblemRead` body; empty when the server sent none. */
  readonly errors: readonly ErrorItem[];

  constructor(status: number, detail: string, errors: readonly ErrorItem[] = []) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.errors = errors;
  }
}

function isErrorItem(value: unknown): value is ErrorItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    'path' in value &&
    'message' in value &&
    typeof value.path === 'string' &&
    typeof value.message === 'string'
  );
}

async function toApiError(response: Response): Promise<ApiError> {
  const fallback = `Request failed (${String(response.status)})`;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // The body was empty or not JSON; the status code is all we have.
    return new ApiError(response.status, fallback);
  }
  if (typeof body !== 'object' || body === null) return new ApiError(response.status, fallback);

  const detail =
    'detail' in body && typeof body.detail === 'string' && body.detail.length > 0
      ? body.detail
      : fallback;
  const errors =
    'errors' in body && Array.isArray(body.errors) && body.errors.every(isErrorItem)
      ? body.errors
      : [];
  return new ApiError(response.status, detail, errors);
}

async function send<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(NETWORK_FAILURE_STATUS, NETWORK_FAILURE_DETAIL);
  }

  if (!response.ok) {
    throw await toApiError(response);
  }
  if (response.status === NO_CONTENT) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/**
 * Send a JSON request to `/api<path>` and return the parsed JSON body.
 * Throws `ApiError` with the server's `detail` on a non-2xx response, or with
 * status 0 when the server can't be reached. A 204 resolves to `undefined`.
 */
export async function apiRequest<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return send<T>(path, init);
}

/**
 * POST `file` to `/api<path>` as multipart form data in the field `file`, and
 * return the parsed JSON body. Errors behave exactly as in `apiRequest`.
 */
export async function apiUpload<T>(path: string, file: Blob, fileName: string): Promise<T> {
  const form = new FormData();
  form.append('file', file, fileName);
  // No Content-Type header: the browser sets the multipart boundary itself.
  return send<T>(path, { method: 'POST', headers: { Accept: 'application/json' }, body: form });
}
