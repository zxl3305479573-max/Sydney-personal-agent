-- Allow native desktop Slack workspace installation sessions alongside web and mobile.
ALTER TABLE "messaging_install_sessions"
  DROP CONSTRAINT IF EXISTS "messaging_install_sessions_returnTo_check";
ALTER TABLE "messaging_install_sessions"
  ADD CONSTRAINT "messaging_install_sessions_returnTo_check"
  CHECK ("returnTo" IS NULL OR "returnTo" IN ('web', 'mobile', 'native'));
