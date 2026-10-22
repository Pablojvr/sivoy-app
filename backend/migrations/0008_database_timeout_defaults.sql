-- PgBouncer transaction pooling does not preserve per-client startup GUCs.
-- Persist bounded defaults for every new physical PostgreSQL session used by
-- the application role, without hardcoding environment-specific identities.
DO $$
DECLARE
  application_role name := current_user;
  application_database name := current_database();
BEGIN
  EXECUTE format(
    'ALTER ROLE %I IN DATABASE %I SET statement_timeout TO %L',
    application_role,
    application_database,
    '5s'
  );
  EXECUTE format(
    'ALTER ROLE %I IN DATABASE %I SET idle_in_transaction_session_timeout TO %L',
    application_role,
    application_database,
    '10s'
  );
END;
$$;
