BEGIN;

CREATE TABLE public.user_feature_access (
  "userId" TEXT NOT NULL,
  "computer" BOOLEAN,
  "projects" BOOLEAN,
  "github" BOOLEAN,
  "integrations" BOOLEAN,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_feature_access_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "user_feature_access_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES public."user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE public.user_feature_access ENABLE ROW LEVEL SECURITY;

-- Users may only read their own feature override row; mutations require an audited system context.
CREATE POLICY user_feature_access_tenant_read ON public.user_feature_access
  FOR SELECT
  USING ("userId" = NULLIF(current_setting('app.user_id', true), ''));

CREATE POLICY user_feature_access_system ON public.user_feature_access
  USING ((SELECT app_rls_bypass()))
  WITH CHECK ((SELECT app_rls_bypass()));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rakazo_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_feature_access TO rakazo_app;
  END IF;
END $$;

COMMIT;
