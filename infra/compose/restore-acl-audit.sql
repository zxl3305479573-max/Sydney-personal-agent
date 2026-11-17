WITH objects AS (
  SELECT n.nspname, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
         r.rolname AS owner, coalesce(g.rolname, 'PUBLIC') AS grantee,
         coalesce(grantor.rolname, 'PUBLIC') AS grantor,
         a.privilege_type, a.is_grantable
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_roles r ON r.oid = c.relowner
  LEFT JOIN LATERAL aclexplode(coalesce(
    c.relacl,
    acldefault((CASE WHEN c.relkind = 'S' THEN 's' ELSE 'r' END)::"char", c.relowner)
  )) a ON true
  LEFT JOIN pg_roles g ON g.oid = a.grantee
  LEFT JOIN pg_roles grantor ON grantor.oid = a.grantor
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
), canonical AS (
  SELECT jsonb_build_array(nspname, relname, relkind, relrowsecurity, relforcerowsecurity,
                           owner, grantee, grantor, privilege_type, is_grantable)::text AS item
  FROM objects
)
SELECT 'object_acl', count(*), md5(coalesce(string_agg(item, E'\n' ORDER BY item), ''))
FROM canonical;

WITH policies AS (
  SELECT jsonb_build_array(
    n.nspname, c.relname, p.polname, p.polcmd, p.polpermissive,
    (SELECT string_agg(coalesce(r.rolname, 'PUBLIC'), ',' ORDER BY coalesce(r.rolname, 'PUBLIC'))
     FROM unnest(p.polroles) roleid LEFT JOIN pg_roles r ON r.oid = roleid),
    pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid)
  )::text AS item
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
)
SELECT 'rls_policies', count(*), md5(coalesce(string_agg(item, E'\n' ORDER BY item), ''))
FROM policies;
