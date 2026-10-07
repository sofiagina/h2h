import { useCallback, useEffect, useRef, useState } from 'react';

/** Загрузка данных с повтором: { data, error, loading, reload }. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const call = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  const reload = useCallback(
    (silent = false) => {
      const n = ++call.current;
      if (!silent) setLoading(true);
      return run()
        .then((d) => {
          if (n === call.current) {
            setData(d);
            setError(null);
          }
        })
        .catch((e: Error) => n === call.current && setError(e))
        .finally(() => n === call.current && setLoading(false));
    },
    [run],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, loading, reload };
}
