/**
 * The only place in the app that calls `fetch`. Feature code goes through the
 * per-resource hooks in `src/api/`, which are typed from the generated `types.ts`.
 */

export const API_BASE = '/api';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const NO_CONTENT = 204;
const NETWORK_FAILURE_STATUS = 0;
const NETWORK_FAILURE_DETAIL = "Couldn't reach the server";

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function readErrorDetail(response: Response): Promise<string> {
  const fallback = `Request failed (${String(response.status)})`;
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'detail' in body) {
      const { detail } = body;
      if (typeof detail === 'string' && detail.length > 0) return detail;
    }
  } catch {
    // The body was empty or not JSON; the status code is all we have.
  }
  return fallback;
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

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(NETWORK_FAILURE_STATUS, NETWORK_FAILURE_DETAIL);
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorDetail(response));
  }
  if (response.status === NO_CONTENT) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
