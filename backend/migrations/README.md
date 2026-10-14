# Database migrations

Migrations are immutable numbered SQL files. The runner records their checksums in `schema_migrations`, obtains a PostgreSQL advisory lock, and wraps each pending migration in a transaction.

Files ending in `.notx.sql` are exceptional single-statement migrations for operations such as `CREATE INDEX CONCURRENTLY`. They must be idempotent because their schema change and ledger entry cannot be atomic.

- Preview: `npm run migrate:status`
- Apply: `npm run migrate`
- `DIRECT_DATABASE_URL` is required for hosted transaction-pooler endpoints;
  the runner rejects Neon `-pooler` URLs because its advisory lock is scoped to
  a physical PostgreSQL session. A direct local `DATABASE_URL` remains valid.
- Never edit an applied migration; add a new numbered file.
- Production execution requires an explicit checkpoint, verified backup, and rollback plan.

Migration `0008` sets 5-second statement and 10-second idle-transaction
defaults for the current application role/database. Rollback is operational and
must use the same direct connection:

```sql
DO $$
DECLARE
  application_role name := current_user;
  application_database name := current_database();
BEGIN
  EXECUTE format('ALTER ROLE %I IN DATABASE %I RESET statement_timeout', application_role, application_database);
  EXECUTE format('ALTER ROLE %I IN DATABASE %I RESET idle_in_transaction_session_timeout', application_role, application_database);
END;
$$;
```

The direct migration identity must be the same role used by the application.
If dedicated migration/application roles are introduced later, apply/reset these
defaults explicitly on the application role. Hosted pooler backends must be
recycled before verifying either the migration or its rollback.

Migration `0001` only expands the schema. It does not replace `horarios_operativos` or `reglas_entrega`.
