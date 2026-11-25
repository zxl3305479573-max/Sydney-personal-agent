/** The focused inbox needs to notice new messages, not mirror every server write. */
export const INBOX_POLL_INTERVAL_MS = 15_000;

/** While any visible conversation has an active run, poll faster so status stays live after exiting chat. */
export const ACTIVE_INBOX_POLL_INTERVAL_MS = 3_000;

/** Activity is a secondary surface; a minute keeps it useful without polling constantly. */
export const ACTIVITY_POLL_INTERVAL_MS = 60_000;
