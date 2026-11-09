import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, apiUpload, documentDownloadUrl } from './client';

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

describe('ApiError errors list', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('RM-16 exposes the server errors list on 422', async () => {
    const errors = [
      { path: '/items/0/end', message: 'Item PAY-142 has an end date before its start date' },
    ];
    fetchMock.mockResolvedValue(jsonResponse(422, { detail: errors[0]?.message, errors }));

    await expect(apiRequest('POST', '/roadmaps/import-json')).rejects.toMatchObject({
      status: 422,
      errors,
    });
  });

  it('leaves errors empty when the body has no well-formed errors list', async () => {
    fetchMock.mockResolvedValue(jsonResponse(422, { detail: 'Bad', errors: [{ path: 3 }] }));

    await expect(apiRequest('POST', '/roadmaps')).rejects.toMatchObject({ errors: [] });
  });
});

describe('apiUpload', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('uploads a file as multipart with field "file"', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 'r1' }));
    const file = new Blob(['{"kind":"roadmap"}'], { type: 'application/json' });

    await apiUpload('/roadmaps/import-json', file, 'plan.json');

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const body = init?.body;
    expect({
      url,
      method: init?.method,
      fileName: body instanceof FormData ? (body.get('file') as File | null)?.name : undefined,
    }).toEqual({ url: '/api/roadmaps/import-json', method: 'POST', fileName: 'plan.json' });
  });

  it('RM-15 sends extra fields as form fields beside the file', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 'r1' }));

    await apiUpload('/roadmaps/r1/resync', new Blob(['Key']), 'export.csv', {
      templateId: 'tpl-1',
    });

    const body = fetchMock.mock.calls[0]?.[1]?.body;
    expect(body instanceof FormData ? body.get('templateId') : undefined).toBe('tpl-1');
  });

  it('apiUpload throws ApiError status 0 on network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const error: unknown = await apiUpload('/assets', new Blob(['x']), 'logo.png').catch(
      (caught: unknown) => caught,
    );

    expect(error).toEqual(new ApiError(0, "Couldn't reach the server"));
  });

  it('throws ApiError with the server detail on 413', async () => {
    fetchMock.mockResolvedValue(jsonResponse(413, { detail: 'This file is larger than 20 MB' }));

    await expect(
      apiUpload('/roadmaps/import-json', new Blob(['x']), 'big.json'),
    ).rejects.toMatchObject({ status: 413, detail: 'This file is larger than 20 MB' });
  });
});

describe('documentDownloadUrl', () => {
  it('points at the backend document file for a roadmap', () => {
    expect(documentDownloadUrl('roadmap', 'abc')).toBe('/api/roadmaps/abc/document');
  });

  it('points at the backend document file for a diagram', () => {
    expect(documentDownloadUrl('diagram', 'abc')).toBe('/api/diagrams/abc/document');
  });
});
