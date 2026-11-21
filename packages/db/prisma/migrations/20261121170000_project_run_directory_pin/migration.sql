BEGIN;

ALTER TABLE public.runs ADD COLUMN "projectDirectoryPin" JSONB;

CREATE FUNCTION public.pin_project_run_directory() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."projectDirectoryPin" IS DISTINCT FROM OLD."projectDirectoryPin" THEN
      RAISE EXCEPTION 'The project run directory pin cannot be changed';
    END IF;
    RETURN NEW;
  END IF;

  NEW."projectDirectoryPin" := NULL;
  IF NEW."projectWorkspaceId" IS NULL OR NEW."trigger" NOT IN ('user', 'follow_up') THEN
    RETURN NEW;
  END IF;

  SELECT CASE WHEN count(*) = 1 THEN jsonb_agg(pin)->0 END INTO NEW."projectDirectoryPin"
  FROM (
    SELECT jsonb_build_object(
      'kind', 'windows', 'targetId', b."deviceId", 'grantId', b."grantId", 'intent', b."intent"
    ) AS pin
    FROM public.project_directory_bindings b
    WHERE (b."projectId", b."spaceId", b."userId") =
      (NEW."projectWorkspaceId", NEW."spaceId", NEW."userId")
    UNION ALL
    SELECT jsonb_build_object(
      'kind', 'cloud', 'targetId', b."computerId", 'grantId', b."grantId", 'intent', b."intent"
    ) AS pin
    FROM public.project_cloud_directory_bindings b
    WHERE (b."projectId", b."spaceId", b."userId") =
      (NEW."projectWorkspaceId", NEW."spaceId", NEW."userId")
  ) bindings;

  RETURN NEW;
END;
$$;

CREATE TRIGGER runs_pin_project_directory
BEFORE INSERT OR UPDATE OF "projectDirectoryPin" ON public.runs
FOR EACH ROW EXECUTE FUNCTION public.pin_project_run_directory();

COMMIT;
