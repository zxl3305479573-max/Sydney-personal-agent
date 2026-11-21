import type { Dispatch, SetStateAction } from "react";
import { useCallback, useMemo, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { queryClient } from "./query-client";

export function pageStateKey(scope: string, path: readonly unknown[]) {
  return ["mobile-page-state", scope, ...path];
}

export function clearPageState(scope: string, path: readonly unknown[]) {
  queryClient.removeQueries({ queryKey: pageStateKey(scope, path) });
}

export function usePageScroll(scope: string, path: readonly unknown[]) {
  const key = JSON.stringify(pageStateKey(scope, [...path, "scroll"]));
  return useMemo(() => {
    const queryKey = JSON.parse(key);
    return {
      contentOffset: queryClient.getQueryData<{ x: number; y: number }>(queryKey) ?? { x: 0, y: 0 },
      scrollEventThrottle: 160,
      onScroll: ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { x, y } = nativeEvent.contentOffset;
        queryClient.setQueryData(queryKey, { x, y });
      },
    };
  }, [key]);
}

export function usePageState<Value>(
  scope: string,
  path: readonly unknown[],
  initial: Value,
  keepPrevious = false,
): [Value, Dispatch<SetStateAction<Value>>] {
  const key = JSON.stringify(pageStateKey(scope, path));
  const read = () => queryClient.getQueryData<Value>(JSON.parse(key));
  const [state, setState] = useState(() => ({ scope, key, value: read() ?? initial }));
  let value = state.value;
  if (state.key !== key) {
    value = read() ?? (keepPrevious && state.scope === scope ? state.value : initial);
    setState({ scope, key, value });
  }
  const update = useCallback<Dispatch<SetStateAction<Value>>>(
    (next) => {
      setState((previous) => {
        const current = previous.key === key ? previous.value : initial;
        const value =
          typeof next === "function" ? (next as (value: Value) => Value)(current) : next;
        if (value === undefined)
          queryClient.removeQueries({ queryKey: JSON.parse(key), exact: true });
        else queryClient.setQueryData(JSON.parse(key), value);
        return { scope, key, value };
      });
    },
    [scope, key],
  );
  return [value, update];
}
