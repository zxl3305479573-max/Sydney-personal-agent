import type { Me } from "@rakazo/contracts";
import { useQuery } from "@tanstack/react-query";
import { fetchAccountAvatar } from "./api";
import { retainInboxValue } from "./inbox-retention";
import { accountRpcQuery, queryClient } from "./query";

export type AccountMeCacheSnapshot = {
  queryKey: ReturnType<typeof accountRpcQuery<"me">>["queryKey"];
  previous: Me | undefined;
};

export function captureAccountMeSnapshot(): AccountMeCacheSnapshot {
  const { queryKey } = accountRpcQuery("me");
  return { queryKey, previous: queryClient.getQueryData<Me>(queryKey) };
}

export function syncAccountMeCache(snapshot: AccountMeCacheSnapshot, nextMe: Me): void {
  queryClient.setQueryData<Me>(snapshot.queryKey, (current) => {
    if (current !== snapshot.previous) return current;
    return current ? retainInboxValue(current, nextMe) : nextMe;
  });
}

export function useCachedAccountMe(): Me | undefined {
  const { data } = useQuery({ ...accountRpcQuery("me"), enabled: false }, queryClient);
  return data;
}

export function useAccountAvatar(me: Pick<Me, "userId" | "image"> | undefined, enabled = true) {
  const userId = me?.userId;
  const queryKey = [...accountRpcQuery("me").queryKey, "avatar", userId];
  const { data } = useQuery(
    {
      queryKey,
      queryFn: () => fetchAccountAvatar(userId!),
      enabled: enabled && Boolean(userId) && me?.image === undefined,
    },
    queryClient,
  );
  return { image: me?.image === undefined ? data : me.image, queryKey };
}
