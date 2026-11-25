import type { Me } from "@rakazo/contracts";
import { useQuery } from "@tanstack/react-query";
import { fetchAccountAvatar } from "./api";
import { accountRpcQuery, queryClient } from "./query";

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
