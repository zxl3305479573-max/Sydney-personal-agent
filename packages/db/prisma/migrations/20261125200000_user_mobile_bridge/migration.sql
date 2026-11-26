BEGIN;

CREATE TABLE public.user_mobile_bridges (
  "userId" TEXT NOT NULL,
  "permissions" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "snapshot" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "pendingActions" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_mobile_bridges_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "user_mobile_bridges_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES public."user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE public.user_mobile_bridges ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_mobile_bridges_tenant ON public.user_mobile_bridges
  USING ("userId" = NULLIF(current_setting('app.user_id', true), ''))
  WITH CHECK ("userId" = NULLIF(current_setting('app.user_id', true), ''));

CREATE POLICY user_mobile_bridges_system ON public.user_mobile_bridges
  USING ((SELECT app_rls_bypass()))
  WITH CHECK ((SELECT app_rls_bypass()));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rakazo_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_mobile_bridges TO rakazo_app;
  END IF;
END $$;

COMMIT;
