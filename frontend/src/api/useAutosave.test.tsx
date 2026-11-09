import { act, renderHook, screen } from '@testing-library/react';
import type { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSaveStateStore } from '../app/saveState';
import { createTestQueryClient, providersFor } from '../test/providers';
import { ApiError, apiRequest, type HttpMethod } from './client';
import { TEXT_DEBOUNCE_MS, useAutosave } from './useAutosave';
import { roadmapKeys, type RoadmapRead } from './useRoadmap';

vi.mock('./client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./client')>()),
  apiRequest: vi.fn(),
}));

const apiRequestMock = vi.mocked(apiRequest);

const ROADMAP_ID = '0d3c9a52-6f0b-4b7e-8a51-2f1e9c7d6b31';
const PATCH_PATH = `/roadmaps/${ROADMAP_ID}`;
const FILE_NAME = 'payments-platform-h1-2027.json';

function roadmapRead(
  revision: number,
  document: Record<string, unknown> = {},
  fileName = FILE_NAME,
): RoadmapRead {
  return {
    id: ROADMAP_ID,
    name: 'Plan',
    fileName,
    revision,
    createdAt: '2026-11-01T09:00:00Z',
    updatedAt: '2026-11-06T09:00:00Z',
    document: {
      name: 'Plan',
      items: [{ id: 'it-1', title: 'Checkout' }],
      ...document,
    } as unknown as RoadmapRead['document'],
  };
}

type Handler = (body: unknown) => Promise<unknown>;

/** Answer each PATCH with the next handler, and every GET with `fresh`. */
function mockServer(patches: Handler[], fresh: RoadmapRead = roadmapRead(7, { name: 'Server' })) {
  const remaining = [...patches];
  apiRequestMock.mockImplementation((method: HttpMethod, _path: string, body?: unknown) => {
    if (method === 'GET') return Promise.resolve(fresh);
    const next = remaining.shift();
    return next ? next(body) : Promise.reject(new Error('Unexpected PATCH'));
  });
}

const saved =
  (revision: number, fileName = FILE_NAME): Handler =>
  () =>
    Promise.resolve({ revision, fileName });
const conflict: Handler = () =>
  Promise.reject(new ApiError(409, 'This roadmap changed somewhere else.'));
const serverError: Handler = () => Promise.reject(new ApiError(500, 'Boom'));

function patchCalls() {
  return apiRequestMock.mock.calls.filter(([method]) => method === 'PATCH');
}

function cachedRoadmap(queryClient: QueryClient) {
  return queryClient.getQueryData<RoadmapRead>(roadmapKeys.detail(ROADMAP_ID));
}

function renderAutosave() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(roadmapKeys.detail(ROADMAP_ID), roadmapRead(3));
  const rendered = renderHook(() => useAutosave('roadmap', ROADMAP_ID), {
    wrapper: providersFor(queryClient),
  });
  return { queryClient, ...rendered };
}

async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const rename = (value: string) => [{ op: 'set' as const, path: '/name', value }];
const retitle = (value: string) => [{ op: 'set' as const, path: '/items/it-1/title', value }];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
  useSaveStateStore.getState().set(null);
});

describe('useAutosave', () => {
  it('G-2 debounces text edits by 500 ms into one PATCH', async () => {
    mockServer([saved(4)]);
    const { result } = renderAutosave();

    act(() => {
      result.current.save(rename('P'), 'text');
      result.current.save(rename('Pa'), 'text');
      result.current.save(rename('Pay'), 'text');
    });
    await settle(TEXT_DEBOUNCE_MS - 1);
    const callsBeforeQuiet = patchCalls().length;
    await settle(1);

    expect({ callsBeforeQuiet, calls: patchCalls() }).toEqual({
      callsBeforeQuiet: 0,
      calls: [['PATCH', PATCH_PATH, { baseVersion: 3, ops: rename('Pay') }]],
    });
  });

  it('G-2 applies an edit to the cached document at once', () => {
    mockServer([saved(4)]);
    const { result, queryClient } = renderAutosave();

    act(() => {
      result.current.save(rename('Payments'), 'text');
    });

    expect(cachedRoadmap(queryClient)?.document.name).toBe('Payments');
  });

  it('G-2 saves an immediate edit without waiting', async () => {
    mockServer([saved(4)]);
    const { result } = renderAutosave();

    act(() => {
      result.current.save(retitle('Wallet'), 'immediate');
    });
    await settle();

    expect(patchCalls()).toEqual([
      ['PATCH', PATCH_PATH, { baseVersion: 3, ops: retitle('Wallet') }],
    ]);
  });

  it('G-2 sends pending text ops before an immediate op', async () => {
    mockServer([saved(4)]);
    const { result } = renderAutosave();

    act(() => {
      result.current.save(rename('Payments'), 'text');
      result.current.save(retitle('Wallet'), 'immediate');
    });
    await settle();

    expect(patchCalls()[0]?.[2]).toEqual({
      baseVersion: 3,
      ops: [...rename('Payments'), ...retitle('Wallet')],
    });
  });

  it('G-2 keeps one request in flight and queues later edits for the next', async () => {
    let finishFirst: (value: unknown) => void = () => undefined;
    mockServer([
      () =>
        new Promise((resolve) => {
          finishFirst = resolve;
        }),
      saved(5),
    ]);
    const { result } = renderAutosave();

    act(() => {
      result.current.save(retitle('Wallet'), 'immediate');
      result.current.save(retitle('Wallet 2'), 'immediate');
    });
    await settle();
    const callsWhileInFlight = patchCalls().length;
    finishFirst({ revision: 4, fileName: FILE_NAME });
    await settle();

    expect({ callsWhileInFlight, second: patchCalls()[1]?.[2] }).toEqual({
      callsWhileInFlight: 1,
      second: { baseVersion: 4, ops: retitle('Wallet 2') },
    });
  });

  it('G-2 on 409 refetches, re-applies pending ops and retries once', async () => {
    mockServer(
      [conflict, saved(8)],
      roadmapRead(7, { name: 'Server', items: [{ id: 'it-1', title: 'Theirs' }] }),
    );
    const { result, queryClient } = renderAutosave();

    act(() => {
      result.current.save(rename('Mine'), 'immediate');
    });
    await settle();

    expect({
      retry: patchCalls()[1]?.[2],
      revision: cachedRoadmap(queryClient)?.revision,
      document: cachedRoadmap(queryClient)?.document,
    }).toEqual({
      retry: { baseVersion: 7, ops: rename('Mine') },
      revision: 8,
      document: { name: 'Mine', items: [{ id: 'it-1', title: 'Theirs' }] },
    });
  });

  it('G-2 after a second 409 reloads and says "Couldn\'t save — reloaded the latest version"', async () => {
    mockServer([conflict, conflict], roadmapRead(7, { name: 'Server' }));
    const { result, queryClient } = renderAutosave();

    act(() => {
      result.current.save(rename('Mine'), 'immediate');
    });
    await settle();

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't save — reloaded the latest version",
    );
    expect(cachedRoadmap(queryClient)?.document.name).toBe('Server');
  });

  it('G-2 still saves the next edit after one typed during the reload that follows a second 409', async () => {
    const fresh = roadmapRead(7, { name: 'Server' });
    let finishReload: (value: unknown) => void = () => undefined;
    const gets: Array<() => Promise<unknown>> = [
      () => Promise.resolve(fresh),
      () =>
        new Promise((resolve) => {
          finishReload = resolve;
        }),
    ];
    const patches: Handler[] = [conflict, conflict, saved(8)];
    apiRequestMock.mockImplementation((method: HttpMethod, _path: string, body?: unknown) => {
      const next = method === 'GET' ? gets.shift() : patches.shift()?.bind(null, body);
      return next ? next() : Promise.reject(new Error(`Unexpected ${method}`));
    });
    const { result } = renderAutosave();

    act(() => {
      result.current.save(rename('Mine'), 'immediate');
    });
    await settle();
    act(() => {
      result.current.save(retitle('Typed during reload'), 'immediate');
    });
    finishReload(fresh);
    await settle();
    act(() => {
      result.current.save(retitle('Wallet'), 'immediate');
    });
    await settle();

    expect(patchCalls()[2]?.[2]).toEqual({ baseVersion: 7, ops: retitle('Wallet') });
  });

  it('G-2 rolls back and tells the user when a save fails', async () => {
    mockServer([serverError]);
    const { result, queryClient } = renderAutosave();

    act(() => {
      result.current.save(rename('Mine'), 'immediate');
    });
    await settle();

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save that change");
    expect(cachedRoadmap(queryClient)).toEqual(roadmapRead(3));
  });

  it('RM-4 rolls back and shows the server reason when a save is rejected as invalid', async () => {
    const invalid: Handler = () =>
      Promise.reject(new ApiError(422, 'PI 1 · 2027 starts before PI 4 · 2026 ends'));
    mockServer([invalid]);
    const { result, queryClient } = renderAutosave();

    act(() => {
      result.current.save(rename('Mine'), 'immediate');
    });
    await settle();

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't save that change: PI 1 · 2027 starts before PI 4 · 2026 ends",
    );
    expect(cachedRoadmap(queryClient)).toEqual(roadmapRead(3));
  });

  it('G-2 rejects an op that cannot apply without sending anything', async () => {
    mockServer([saved(4)]);
    const { result } = renderAutosave();

    act(() => {
      result.current.save([{ op: 'remove', path: '/items/missing' }], 'immediate');
    });
    await settle();

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save that change");
    expect(patchCalls()).toEqual([]);
  });

  it('G-2 flushes pending text edits on unmount', async () => {
    mockServer([saved(4)]);
    const { result, unmount } = renderAutosave();

    act(() => {
      result.current.save(rename('Payments'), 'text');
    });
    unmount();
    await settle();

    expect(patchCalls()).toHaveLength(1);
  });

  it('G-1 shows Unsaved changes while saving and Saved to <file> after', async () => {
    mockServer([saved(4, 'payments.json')]);
    const { result } = renderAutosave();
    const indicator = () => {
      const { state, fileName } = useSaveStateStore.getState();
      return { state, fileName };
    };

    act(() => {
      result.current.save(rename('Payments'), 'text');
    });
    const whilePending = indicator();
    await settle(TEXT_DEBOUNCE_MS);

    expect({ whilePending, after: indicator() }).toEqual({
      whilePending: { state: 'unsaved', fileName: FILE_NAME },
      after: { state: 'saved', fileName: 'payments.json' },
    });
  });

  it('G-1 clears the indicator on unmount', () => {
    mockServer([]);
    const { unmount } = renderAutosave();

    unmount();

    expect(useSaveStateStore.getState().state).toBeNull();
  });

  it('RM-15 replace swaps in the server copy, drops pending text and remounts fields', async () => {
    mockServer([saved(10)]);
    const { result, queryClient } = renderAutosave();
    const synced = roadmapRead(9, { name: 'Synced' });

    act(() => {
      result.current.save(rename('Typing'), 'text');
    });
    act(() => {
      result.current.replace(synced);
    });
    await settle(TEXT_DEBOUNCE_MS);

    expect({
      cached: cachedRoadmap(queryClient),
      patches: patchCalls().length,
      state: result.current.state,
      reloads: result.current.reloads,
    }).toEqual({ cached: synced, patches: 0, state: 'saved', reloads: 1 });
  });

  it('RM-15 the next edit after replace uses the replaced revision', async () => {
    mockServer([saved(10)]);
    const { result } = renderAutosave();

    act(() => {
      result.current.replace(roadmapRead(9));
    });
    act(() => {
      result.current.save(rename('After'), 'immediate');
    });
    await settle();

    expect(patchCalls()[0]?.[2]).toEqual({ baseVersion: 9, ops: rename('After') });
  });
});
