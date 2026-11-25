BEGIN;

ALTER TABLE public.artifacts DROP CONSTRAINT artifacts_project_scope_disabled;

CREATE FUNCTION public.enforce_project_artifact_target() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."projectWorkspaceId" IS NULL AND NEW."projectWorkspaceId" IS NULL THEN
      RETURN NEW;
    END IF;
    IF ROW(NEW."projectWorkspaceId", NEW."spaceId", NEW."userId", NEW."runId",
           NEW."groupId", NEW."rootArtifactId")
       IS DISTINCT FROM
       ROW(OLD."projectWorkspaceId", OLD."spaceId", OLD."userId", OLD."runId",
           OLD."groupId", OLD."rootArtifactId")
       OR (NEW."botId" IS NOT NULL AND NEW."botId" IS DISTINCT FROM OLD."botId") THEN
      RAISE EXCEPTION 'Project artifact target is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."projectWorkspaceId" IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.runs r
    JOIN public.threads t ON t."id" = r."threadId"
    WHERE r."id" = NEW."runId" AND r."botId" = NEW."botId"
      AND (r."projectWorkspaceId", r."spaceId", r."userId") =
          (NEW."projectWorkspaceId", NEW."spaceId", NEW."userId")
      AND t."groupId" IS NOT DISTINCT FROM NEW."groupId"
  ) THEN
    RAISE EXCEPTION 'Project artifact does not match its Run' USING ERRCODE = '23514';
  END IF;
  IF NEW."rootArtifactId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.artifacts a
    WHERE a."id" = NEW."rootArtifactId"
      AND (a."projectWorkspaceId", a."spaceId", a."userId", a."botId") =
          (NEW."projectWorkspaceId", NEW."spaceId", NEW."userId", NEW."botId")
      AND a."groupId" IS NOT DISTINCT FROM NEW."groupId"
      AND a."rootArtifactId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Project artifact does not match its version family' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER enforce_project_artifact_target
BEFORE INSERT OR UPDATE ON public.artifacts
FOR EACH ROW EXECUTE FUNCTION public.enforce_project_artifact_target();

COMMIT;
