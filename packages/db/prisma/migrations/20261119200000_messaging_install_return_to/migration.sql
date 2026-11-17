-- Additive: old releases never read this column, and null keeps their in-flight sessions on the web callback.
ALTER TABLE "messaging_install_sessions" ADD COLUMN "returnTo" TEXT;
ALTER TABLE "messaging_install_sessions" ADD COLUMN "callbackReturnedAt" TIMESTAMP(3);
ALTER TABLE "messaging_install_sessions" ADD CONSTRAINT "messaging_install_sessions_returnTo_check"
  CHECK ("returnTo" IS NULL OR "returnTo" IN ('web', 'mobile'));
