# Database migrations

Migrations are immutable numbered SQL files. The runner records their checksums in `schema_migrations`, obtains a PostgreSQL advisory lock, and wraps each pending migration in a transaction.

- Preview: `npm run migrate:status`
- Apply: `npm run migrate`
- Never edit an applied migration; add a new numbered file.
- Production execution requires an explicit checkpoint, verified backup, and rollback plan.

Migration `0001` only expands the schema. It does not replace `horarios_operativos` or `reglas_entrega`.
