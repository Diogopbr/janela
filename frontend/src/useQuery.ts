import { useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from './api';
export function useQuery<T>(path: string | null, workspaceId?: string) {
  const [revision, setRevision] = useState(0),
    [state, setState] = useState<{ data: T | null; loading: boolean; error: ApiError | null }>({
      data: null,
      loading: true,
      error: null,
    });
  const sequence = useRef(0);
  const key = JSON.stringify([path, workspaceId]);
  const activeKey = useRef(key);
  useEffect(() => {
    const request = ++sequence.current;
    const controller = new AbortController();
    if (!path) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const sameKey = activeKey.current === key;
    activeKey.current = key;
    setState((previous) => ({ data: sameKey ? previous.data : null, loading: true, error: null }));
    void apiFetch<T>(path, { signal: controller.signal }, workspaceId)
      .then((data) => {
        if (request === sequence.current && !controller.signal.aborted)
          setState({ data, loading: false, error: null });
      })
      .catch((error) => {
        if (request === sequence.current && !controller.signal.aborted)
          setState({ data: null, loading: false, error });
      });
    return () => controller.abort();
  }, [path, workspaceId, revision, key]);
  return {
    ...state,
    data: activeKey.current === key ? state.data : null,
    reload: () => setRevision((value) => value + 1),
  };
}
