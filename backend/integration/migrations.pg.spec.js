const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { Pool } = require('pg');

const { discoverMigrations, runMigrations } = require('../migration-runner');

function assertSafeDatabaseUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (error) {
    throw new Error(`Invalid DATABASE_URL format: ${error.message}`);
  }

  const allowedProtocols = new Set(['postgres:', 'postgresql:']);
  if (!allowedProtocols.has(parsed.protocol)) {
    throw new Error(
      `Refusing execution: DATABASE_URL protocol must be postgres: or postgresql:, got: ${parsed.protocol}`
    );
  }

  const normalizedHostname = parsed.hostname.replace(/^\[|\]$/g, '');
  const allowedHostnames = new Set(['localhost', '127.0.0.1', '::1']);
  if (!allowedHostnames.has(normalizedHostname)) {
    throw new Error(
      `Refusing execution: DATABASE_URL hostname must be localhost, 127.0.0.1, or ::1, got: ${parsed.hostname}`
    );
  }

  if ([...parsed.searchParams].length > 0) {
    throw new Error('Refusing execution: DATABASE_URL must not contain connection parameters');
  }

  if (decodeURIComponent(parsed.username) !== 'sivoy_ci_user') {
    throw new Error('Refusing execution: DATABASE_URL must use the ephemeral CI role');
  }
}

test('ephemeral postgres migrations: apply 0001-0011, verify ledger idempotency and schema integrity', async () => {
  const sentinel = process.env.MIGRATION_TEST_SENTINEL;
  if (sentinel !== 'allow_ephemeral_migration_test') {
    throw new Error(
      'Refusing to run migration integration tests without explicit sentinel: MIGRATION_TEST_SENTINEL=allow_ephemeral_migration_test'
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required for ephemeral migration integration tests');
  }

  // Reject unsafe/remote targets without performing any network call
  assertSafeDatabaseUrl(databaseUrl);

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: 1
  });

  try {
    // 1. Verify exact target ephemeral database before any schema modification
    const guardClient = await pool.connect();
    let dbRes;
    try {
      const remoteAddress = guardClient.connection?.stream?.remoteAddress;
      assert.ok(
        new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']).has(remoteAddress),
        `Refusing execution: PostgreSQL socket must terminate on loopback, got: ${remoteAddress}`
      );
      dbRes = await guardClient.query(`
        SELECT current_database() AS current_db, current_user AS current_user_name
      `);
    } finally {
      guardClient.release();
    }
    const currentDb = dbRes.rows[0]?.current_db;
    assert.equal(
      currentDb,
      'sivoy_migrations_ci',
      `Refusing execution: expected current_database() to be sivoy_migrations_ci, got: ${currentDb}`
    );
    assert.equal(
      dbRes.rows[0]?.current_user_name,
      'sivoy_ci_user',
      'Refusing execution: expected the ephemeral CI database role'
    );

    // 2. Apply baseline schema (fails immediately if database is not clean; no IF EXISTS)
    const baselinePath = path.join(__dirname, '../test/fixtures/legacy-schema.sql');
    const baselineSql = fs.readFileSync(baselinePath, 'utf8');
    await pool.query(baselineSql);

    // 3. First run: apply exactly 0001-0011
    const migrationsDir = path.join(__dirname, '../migrations');
    const diskMigrations = discoverMigrations(migrationsDir);
    assert.equal(diskMigrations.length, 11, 'Expected exactly 11 migrations on disk');
    assert.deepEqual(
      diskMigrations.map((m) => m.version),
      ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011'],
      'Disk migrations must match versions 0001 through 0011'
    );

    const publicCompanyProfilesMigration = diskMigrations.find(({ version }) => version === '0011');
    assert.equal(publicCompanyProfilesMigration.name, 'public_company_profiles');
    assert.doesNotMatch(
      publicCompanyProfilesMigration.sql,
      /(?:DROP|CREATE)\s+TRIGGER\s+empresas_catalog_revision_trigger/i,
      'Migration 0011 must preserve the existing empresas catalog revision trigger'
    );

    const firstRun = await runMigrations(pool, { directory: migrationsDir });
    assert.equal(firstRun.length, 11, 'First run must apply exactly 11 migrations');
    assert.deepEqual(
      firstRun.map((m) => m.version),
      ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011'],
      'First run must apply versions 0001 through 0011 in order'
    );

    // 4. Verify exact ledger matching discoverMigrations()
    const ledgerRes1 = await pool.query(
      'SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version'
    );
    assert.equal(ledgerRes1.rows.length, 11, 'Ledger must contain exactly 11 applied versions');
    for (let i = 0; i < 11; i++) {
      const row = ledgerRes1.rows[i];
      const disk = diskMigrations[i];
      assert.equal(row.version, disk.version, `Ledger version mismatch at index ${i}`);
      assert.equal(row.name, disk.name, `Ledger name mismatch at index ${i}`);
      assert.equal(row.checksum.trim(), disk.checksum, `Ledger checksum mismatch for migration ${disk.version}`);
      assert.ok(row.applied_at instanceof Date || typeof row.applied_at === 'string', 'applied_at must be populated');
    }

    // 5. Capture full relevant ledger snapshot and verify idempotency on second run
    const ledgerSnapshot = ledgerRes1.rows.map((r) => ({
      version: r.version,
      name: r.name,
      checksum: r.checksum.trim(),
      applied_at: new Date(r.applied_at).toISOString()
    }));

    const secondRun = await runMigrations(pool, { directory: migrationsDir });
    assert.deepEqual(secondRun, [], 'Second run must return 0 applied migrations (idempotent)');

    const ledgerRes2 = await pool.query(
      'SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version'
    );
    const ledgerSnapshot2 = ledgerRes2.rows.map((r) => ({
      version: r.version,
      name: r.name,
      checksum: r.checksum.trim(),
      applied_at: new Date(r.applied_at).toISOString()
    }));
    assert.deepEqual(ledgerSnapshot2, ledgerSnapshot, 'Ledger snapshot must be strictly identical after second run');

    // 6. Verify concurrent indexes exist in public schema and are valid (indisvalid = true)
    const expectedIndexes = [
      'agencias_empresa_id_idx',
      'agencias_id_destino_uidx',
      'horarios_operativos_agencia_id_idx',
      'reglas_entrega_agencia_id_idx',
      'agencias_catalog_location_idx',
      'agencias_catalog_name_idx',
      'agencias_catalog_name_trgm_idx'
    ];
    const indexRes = await pool.query(
      `SELECT c.relname AS index_name, i.indisvalid
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indexrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = ANY($1::text[])
       ORDER BY c.relname`,
      [expectedIndexes]
    );
    const actualIndexes = Object.fromEntries(
      indexRes.rows.map((row) => [row.index_name, row.indisvalid])
    );
    assert.deepEqual(actualIndexes, {
      agencias_catalog_location_idx: true,
      agencias_catalog_name_idx: true,
      agencias_catalog_name_trgm_idx: true,
      agencias_empresa_id_idx: true,
      agencias_id_destino_uidx: true,
      horarios_operativos_agencia_id_idx: true,
      reglas_entrega_agencia_id_idx: true
    });

    const trigramExtension = await pool.query(`
      SELECT extname, n.nspname AS schema_name
      FROM pg_extension e
      JOIN pg_namespace n ON n.oid = e.extnamespace
      WHERE extname = 'pg_trgm'
    `);
    assert.deepEqual(trigramExtension.rows, [{ extname: 'pg_trgm', schema_name: 'public' }]);

    const trigramDefinition = await pool.query(`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'agencias_catalog_name_trgm_idx'
    `);
    assert.equal(trigramDefinition.rows.length, 1);
    assert.match(trigramDefinition.rows[0].indexdef, /USING gin/i);
    assert.match(trigramDefinition.rows[0].indexdef, /gin_trgm_ops/i);
    assert.match(trigramDefinition.rows[0].indexdef, /translate\(lower\(nombre_destino\)/i);
    assert.match(trigramDefinition.rows[0].indexdef, /id_destino IS NOT NULL/i);
    assert.match(trigramDefinition.rows[0].indexdef, /btrim\(id_destino\) <> ''/i);

    // 7. Verify NOT NULL columns on legacy relations (attnotnull = true)
    const notNullRes = await pool.query(`
      SELECT c.relname AS table_name, a.attname AS column_name, a.attnotnull
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND ((c.relname = 'agencias' AND a.attname = 'empresa_id')
          OR (c.relname = 'horarios_operativos' AND a.attname = 'agencia_id')
          OR (c.relname = 'reglas_entrega' AND a.attname = 'agencia_id'))
      ORDER BY c.relname, a.attname
    `);
    const actualNotNulls = notNullRes.rows.map((row) => ({
      table: row.table_name,
      column: row.column_name,
      notNull: row.attnotnull
    }));
    assert.deepEqual(actualNotNulls, [
      { table: 'agencias', column: 'empresa_id', notNull: true },
      { table: 'horarios_operativos', column: 'agencia_id', notNull: true },
      { table: 'reglas_entrega', column: 'agencia_id', notNull: true }
    ]);

    // 8. Verify baseline FK constraints in public schema: mapping, contype='f', convalidated=true
    const expectedFks = {
      agencias_empresa_id_fkey: {
        sourceTable: 'agencias',
        targetTable: 'empresas',
        contype: 'f',
        convalidated: true
      },
      horarios_operativos_agencia_id_fkey: {
        sourceTable: 'horarios_operativos',
        targetTable: 'agencias',
        contype: 'f',
        convalidated: true
      },
      reglas_entrega_agencia_id_fkey: {
        sourceTable: 'reglas_entrega',
        targetTable: 'agencias',
        contype: 'f',
        convalidated: true
      }
    };
    const fkRes = await pool.query(
      `SELECT
         con.conname AS constraint_name,
         src_tbl.relname AS source_table,
         ref_tbl.relname AS target_table,
         con.contype,
         con.convalidated
       FROM pg_constraint con
       JOIN pg_class src_tbl ON src_tbl.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = src_tbl.relnamespace
       JOIN pg_class ref_tbl ON ref_tbl.oid = con.confrelid
       WHERE n.nspname = 'public'
         AND con.conname = ANY($1::text[])
       ORDER BY con.conname`,
      [Object.keys(expectedFks)]
    );
    const actualFks = Object.fromEntries(
      fkRes.rows.map((row) => [
        row.constraint_name,
        {
          sourceTable: row.source_table,
          targetTable: row.target_table,
          contype: row.contype,
          convalidated: row.convalidated
        }
      ])
    );
    assert.deepEqual(actualFks, expectedFks);

    // 9. Verify migration 0008 persisted timeout defaults for new sessions.
    const roleSettings = await pool.query(`
      SELECT setconfig
      FROM pg_db_role_setting
      WHERE setrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
        AND setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database())
    `);
    assert.equal(roleSettings.rows.length, 1);
    assert.ok(roleSettings.rows[0].setconfig.includes('statement_timeout=5s'));
    assert.ok(roleSettings.rows[0].setconfig.includes('idle_in_transaction_session_timeout=10s'));

    // 10. Verify public company profile columns preserve the explicit legacy contract.
    const companyColumns = await pool.query(`
      SELECT
        a.attname AS column_name,
        format_type(a.atttypid, a.atttypmod) AS column_type,
        a.attnotnull
      FROM pg_attribute a
      WHERE a.attrelid = 'public.empresas'::regclass
        AND a.attname = ANY($1::text[])
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY a.attname
    `, [['descripcion', 'logo_url', 'nombre', 'website_url']]);
    assert.deepEqual(companyColumns.rows, [
      { column_name: 'descripcion', column_type: 'character varying(500)', attnotnull: false },
      { column_name: 'logo_url', column_type: 'text', attnotnull: false },
      { column_name: 'nombre', column_type: 'text', attnotnull: true },
      { column_name: 'website_url', column_type: 'character varying(2048)', attnotnull: false }
    ]);

    // 11. Verify the normalized social-link table, constraints, and defaults.
    const socialTable = await pool.query(
      "SELECT to_regclass('public.empresa_redes_sociales')::text AS table_name"
    );
    assert.equal(socialTable.rows[0].table_name, 'empresa_redes_sociales');

    const socialConstraints = await pool.query(`
      SELECT contype, confdeltype, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'public.empresa_redes_sociales'::regclass
      ORDER BY contype, conname
    `);
    const socialConstraintDefinitions = socialConstraints.rows.map((row) => row.definition);
    const socialForeignKey = socialConstraints.rows.find((row) => row.contype === 'f');
    assert.ok(socialForeignKey, 'empresa_redes_sociales must reference empresas');
    assert.equal(socialForeignKey.confdeltype, 'c', 'empresa social links must cascade on company deletion');
    assert.match(socialForeignKey.definition, /FOREIGN KEY \(empresa_id\) REFERENCES empresas\(id\) ON DELETE CASCADE/i);
    assert.ok(
      socialConstraintDefinitions.some((definition) => /UNIQUE \(empresa_id, plataforma\)/i.test(definition)),
      'empresa_redes_sociales must be unique by company and platform'
    );
    const platformCheck = socialConstraintDefinitions.find((definition) => /CHECK.*plataforma/i.test(definition));
    assert.ok(platformCheck, 'empresa_redes_sociales must restrict supported platforms');
    for (const platform of ['FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'TIKTOK', 'YOUTUBE', 'LINKEDIN']) {
      assert.match(platformCheck, new RegExp(`'${platform}'`, 'i'));
    }

    const socialDefaults = await pool.query(`
      SELECT column_name, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'empresa_redes_sociales'
        AND column_name = ANY($1::text[])
      ORDER BY column_name
    `, [['orden', 'visible']]);
    assert.equal(socialDefaults.rows.length, 2);
    const orderColumn = socialDefaults.rows.find((row) => row.column_name === 'orden');
    const visibleColumn = socialDefaults.rows.find((row) => row.column_name === 'visible');
    assert.equal(orderColumn.is_nullable, 'NO');
    assert.match(orderColumn.column_default, /^0(?:::\w+)?$/);
    assert.equal(visibleColumn.is_nullable, 'NO');
    assert.match(visibleColumn.column_default, /^true$/i);

    // 12. Preserve the company trigger and install one statement-level social trigger.
    const revisionTriggers = await pool.query(`
      SELECT c.relname AS table_name, t.tgname, pg_get_triggerdef(t.oid) AS definition
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND NOT t.tgisinternal
        AND t.tgname = ANY($1::text[])
      ORDER BY c.relname, t.tgname
    `, [[
      'empresas_catalog_revision_trigger',
      'empresa_redes_sociales_catalog_revision_trigger'
    ]]);
    assert.equal(revisionTriggers.rows.length, 2);
    const companyTrigger = revisionTriggers.rows.find((row) => row.table_name === 'empresas');
    const socialTrigger = revisionTriggers.rows.find((row) => row.table_name === 'empresa_redes_sociales');
    assert.equal(companyTrigger.tgname, 'empresas_catalog_revision_trigger');
    assert.match(companyTrigger.definition, /AFTER INSERT OR DELETE OR UPDATE ON public\.empresas FOR EACH STATEMENT/i);
    assert.equal(socialTrigger.tgname, 'empresa_redes_sociales_catalog_revision_trigger');
    assert.match(
      socialTrigger.definition,
      /AFTER INSERT OR DELETE OR UPDATE ON public\.empresa_redes_sociales FOR EACH STATEMENT/i
    );

    // 13. Exercise mutation and compensation behavior without leaving fixtures
    // or revision changes in the shared ephemeral database.
    const behaviorClient = await pool.connect();
    try {
      await behaviorClient.query('BEGIN');

      async function readCatalogRevision() {
        const revisionResult = await behaviorClient.query(
          'SELECT revision FROM catalog_revision_state WHERE singleton = true'
        );
        return BigInt(revisionResult.rows[0].revision);
      }

      const revisionBeforeCompanyInsert = await readCatalogRevision();
      const companies = await behaviorClient.query(`
        INSERT INTO empresas (nombre, logo_url)
        VALUES ('PCD-01 Alpha', '/uploads/alpha.webp'),
               ('PCD-01 Beta', '/uploads/beta.webp')
        RETURNING id
      `);
      const revisionAfterCompanyInsert = await readCatalogRevision();
      assert.equal(revisionAfterCompanyInsert - revisionBeforeCompanyInsert, 1n);

      const companyIds = companies.rows.map((row) => row.id);
      const revisionBeforeSocialInsert = await readCatalogRevision();
      await behaviorClient.query(`
        INSERT INTO empresa_redes_sociales (empresa_id, plataforma, url)
        VALUES ($1, 'FACEBOOK', 'https://facebook.com/pcd-01-alpha'),
               ($2, 'INSTAGRAM', 'https://instagram.com/pcd-01-beta')
      `, companyIds);
      const revisionAfterSocialInsert = await readCatalogRevision();
      assert.equal(revisionAfterSocialInsert - revisionBeforeSocialInsert, 1n);

      // Cascades may touch both observed tables; only monotonicity is required.
      const revisionBeforeCascade = await readCatalogRevision();
      await behaviorClient.query('DELETE FROM empresas WHERE id = $1', [companyIds[0]]);
      const revisionAfterCascade = await readCatalogRevision();
      assert.ok(revisionAfterCascade > revisionBeforeCascade);

      const socialTriggerSql = `
        CREATE TRIGGER empresa_redes_sociales_catalog_revision_trigger
        AFTER INSERT OR UPDATE OR DELETE ON empresa_redes_sociales
        FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_revision()
      `;
      await behaviorClient.query(
        'DROP TRIGGER empresa_redes_sociales_catalog_revision_trigger ON empresa_redes_sociales'
      );
      const revisionWithTriggerRemoved = await readCatalogRevision();
      await behaviorClient.query(`
        INSERT INTO empresa_redes_sociales (empresa_id, plataforma, url)
        VALUES ($1, 'YOUTUBE', 'https://youtube.com/@pcd-01-beta'),
               ($1, 'LINKEDIN', 'https://linkedin.com/company/pcd-01-beta')
      `, [companyIds[1]]);
      assert.equal(await readCatalogRevision(), revisionWithTriggerRemoved);

      await behaviorClient.query(socialTriggerSql);
      const revisionBeforeMultirowUpdate = await readCatalogRevision();
      await behaviorClient.query(
        'UPDATE empresa_redes_sociales SET visible = NOT visible WHERE empresa_id = $1',
        [companyIds[1]]
      );
      const revisionAfterMultirowUpdate = await readCatalogRevision();
      assert.equal(revisionAfterMultirowUpdate - revisionBeforeMultirowUpdate, 1n);
    } finally {
      await behaviorClient.query('ROLLBACK').catch(() => {});
      behaviorClient.release();
    }
  } finally {
    await pool.end();
  }
});
