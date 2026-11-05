import type { ThreadMessage, ThreadSnapshot } from "@rakazo/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";

export type PendingMessage = {
  nonce: string;
  message: ThreadMessage;
  confirmedSeq?: number;
};

export function mergePendingMessages(
  snapshot: ThreadSnapshot | null,
  pending: readonly PendingMessage[],
): ThreadMessage[] {
  if (!snapshot) return [];
  const visible = pending.filter((entry) => {
    if (entry.message.threadId !== snapshot.threadId) return false;
    return !snapshot.messages.some(
      (message) =>
        message.role === "user" &&
        (message.clientNonce === entry.nonce ||
          (entry.confirmedSeq !== undefined &&
            (message.persistedSeq ?? message.seq) === entry.confirmedSeq)),
    );
  });
  return [...snapshot.messages, ...visible.map((entry) => entry.message)];
}

export function useOptimisticMessages(snapshot: ThreadSnapshot | null) {
  const [pending, setPending] = useState<PendingMessage[]>([]);
  useEffect(() => {
    if (!snapshot) return;
    setPending((current) => {
      const next = current.filter(
        (entry) =>
          entry.message.threadId !== snapshot.threadId ||
          !snapshot.messages.some(
            (message) =>
              message.role === "user" &&
              (message.clientNonce === entry.nonce ||
                (entry.confirmedSeq !== undefined &&
                  (message.persistedSeq ?? message.seq) === entry.confirmedSeq)),
          ),
      );
      return next.length === current.length ? current : next;
    });
  }, [snapshot]);
  const begin = useCallback((entry: PendingMessage) => {
    setPending((current) => [...current.filter((item) => item.nonce !== entry.nonce), entry]);
  }, []);
  const confirm = useCallback((nonce: string, seq: number) => {
    setPending((current) =>
      current.map((entry) =>
        entry.nonce === nonce
          ? {
              ...entry,
              confirmedSeq: seq,
              message: { ...entry.message, id: `pending:confirmed:${nonce}` },
            }
          : entry,
      ),
    );
  }, []);
  const fail = useCallback((nonce: string) => {
    setPending((current) => current.filter((entry) => entry.nonce !== nonce));
  }, []);
  const messages = useMemo(() => mergePendingMessages(snapshot, pending), [snapshot, pending]);
  return { messages, begin, confirm, fail };
}
