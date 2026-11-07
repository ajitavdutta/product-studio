import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from './client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiRequest', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('returns parsed JSON on 200', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { status: 'ok' }));

    await expect(apiRequest('GET', '/health')).resolves.toEqual({ status: 'ok' });
  });

  it('throws ApiError with the server detail on 422', async () => {
    fetchMock.mockResolvedValue(jsonResponse(422, { detail: 'Name is required' }));

    await expect(apiRequest('POST', '/roadmaps', {})).rejects.toMatchObject({
      name: 'ApiError',
      status: 422,
      detail: 'Name is required',
    });
  });

  it('falls back to "Request failed (<status>)" when the body has no string detail', async () => {
    fetchMock.mockResolvedValue(new Response('oops', { status: 500 }));

    await expect(apiRequest('GET', '/health')).rejects.toMatchObject({
      status: 500,
      detail: 'Request failed (500)',
    });
  });

  it('throws ApiError status 0 when the network fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const error: unknown = await apiRequest('GET', '/health').catch((caught: unknown) => caught);

    expect(error).toEqual(new ApiError(0, "Couldn't reach the server"));
  });

  it('returns undefined on 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(apiRequest('DELETE', '/roadmaps/1')).resolves.toBeUndefined();
  });

  it('prefixes paths with /api', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiRequest('GET', '/health');

    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.anything());
  });

  it('sends the body as JSON', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiRequest('PATCH', '/roadmaps/1', { name: 'Payments' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/roadmaps/1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Payments' }),
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }) as unknown,
      }),
    );
  });
});
