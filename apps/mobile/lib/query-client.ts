import { QueryClient } from "@tanstack/react-query";

/**
 * Screens paint what they last saw and refresh it in the background, so reopening a settings
 * screen does not wait on the network again. Kept in memory only; saved chats own the disk.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});
