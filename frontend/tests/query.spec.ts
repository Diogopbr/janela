import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useQuery } from '../src/useQuery';
import { apiFetch } from '../src/api';
vi.mock('../src/api', async () => {
  const actual = await vi.importActual('../src/api');
  return { ...actual, apiFetch: vi.fn() };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
test('changing resource clears old availability while refreshing the same query retains its data', async () => {
  vi.mocked(apiFetch)
    .mockResolvedValueOnce({ resource: 'A' })
    .mockImplementation(() => new Promise(() => {}));
  const hook = renderHook(({ path }) => useQuery<{ resource: string }>(path, 'generation'), {
    initialProps: { path: '/availability?resourceId=A' },
  });
  await waitFor(() => expect(hook.result.current.data?.resource).toBe('A'));
  act(() => hook.result.current.reload());
  expect(hook.result.current.data?.resource).toBe('A');
  hook.rerender({ path: '/availability?resourceId=B' });
  expect(hook.result.current.data).toBeNull();
});
test('a late response cannot replace the newest resource query', async () => {
  let first: (value: unknown) => void = () => {},
    second: (value: unknown) => void = () => {};
  vi.mocked(apiFetch)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          first = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          second = resolve;
        }),
    );
  const hook = renderHook(({ path }) => useQuery<{ resource: string }>(path, 'generation'), {
    initialProps: { path: '/A' },
  });
  hook.rerender({ path: '/B' });
  await act(async () => {
    second({ resource: 'B' });
  });
  await act(async () => {
    first({ resource: 'A' });
  });
  expect(hook.result.current.data?.resource).toBe('B');
});
