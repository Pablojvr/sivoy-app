const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const test = require('node:test');
const { Pool } = require('pg');

const EXPECTED_DATABASE = 'sivoy_migrations_ci';
const EXPECTED_SENTINEL = 'allow_ephemeral_company_catalog_test';
const EXPECTED_PLATFORMS = [
  'FACEBOOK',
  'INSTAGRAM',
  'LINKEDIN',
  'TIKTOK',
  'WHATSAPP',
  'YOUTUBE'
];

function assertSafeDatabaseUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (error) {
    throw new Error(`Invalid DATABASE_URL format: ${error.message}`);
  }

  assert.ok(
    parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:',
    `Refusing execution: DATABASE_URL protocol must be postgres: or postgresql:, got: ${parsed.protocol}`
  );

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  assert.ok(
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1',
    `Refusing execution: DATABASE_URL hostname must be localhost, 127.0.0.1, or ::1, got: ${parsed.hostname}`
  );

  assert.equal(
    [...parsed.searchParams].length,
    0,
    'Refusing execution: DATABASE_URL must not contain connection parameters'
  );
  assert.equal(
    decodeURIComponent(parsed.username),
    'sivoy_ci_user',
    'Refusing execution: DATABASE_URL must use the ephemeral CI role'
  );
}

async function readCatalogRevision(client) {
  const result = await client.query(
    'SELECT revision FROM catalog_revision_state WHERE singleton = true'
  );
  assert.equal(result.rows.length, 1, 'catalog_revision_state must contain its singleton row');
  return BigInt(result.rows[0].revision);
}

async function expectConstraintViolation(client, savepoint, query, expectedCode) {
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    await assert.rejects(client.query(query.text, query.values), (error) => {
      assert.equal(error.code, expectedCode);
      return true;
    });
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  }
}

async function assertSafeConnectedClient(client) {
  const remoteAddress = client.connection?.stream?.remoteAddress;
  assert.ok(
    new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']).has(remoteAddress),
    `Refusing execution: PostgreSQL socket must terminate on loopback, got: ${remoteAddress}`
  );
  const databaseResult = await client.query(`
    SELECT current_database() AS current_db, current_user AS current_user_name
  `);
  assert.equal(
    databaseResult.rows[0]?.current_db,
    EXPECTED_DATABASE,
    `Refusing execution: expected current_database() to be ${EXPECTED_DATABASE}, got: ${databaseResult.rows[0]?.current_db}`
  );
  assert.equal(
    databaseResult.rows[0]?.current_user_name,
    'sivoy_ci_user',
    'Refusing execution: expected the ephemeral CI database role'
  );
}

function collectPlanNodes(node, result = []) {
  if (!node || typeof node !== 'object') return result;
  result.push(node);
  for (const child of node.Plans || []) collectPlanNodes(child, result);
  return result;
}

test('company catalog schema 0011 enforces constraints and revision invalidation', async () => {
  assert.equal(
    process.env.COMPANY_CATALOG_TEST_SENTINEL,
    EXPECTED_SENTINEL,
    `Refusing execution without explicit sentinel: COMPANY_CATALOG_TEST_SENTINEL=${EXPECTED_SENTINEL}`
  );

  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL is required for the ephemeral company catalog test');
  assertSafeDatabaseUrl(databaseUrl);

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
  });
  let client;
  let inTransaction = false;

  try {
    client = await pool.connect();

    // This read-only guard must succeed before the test performs any mutation.
    const remoteAddress = client.connection?.stream?.remoteAddress;
    assert.ok(
      new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']).has(remoteAddress),
      `Refusing execution: PostgreSQL socket must terminate on loopback, got: ${remoteAddress}`
    );
    const databaseResult = await client.query(`
      SELECT current_database() AS current_db, current_user AS current_user_name
    `);
    assert.equal(
      databaseResult.rows[0]?.current_db,
      EXPECTED_DATABASE,
      `Refusing execution: expected current_database() to be ${EXPECTED_DATABASE}, got: ${databaseResult.rows[0]?.current_db}`
    );
    assert.equal(
      databaseResult.rows[0]?.current_user_name,
      'sivoy_ci_user',
      'Refusing execution: expected the ephemeral CI database role'
    );

    const companyColumns = await client.query(`
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
    `, [['descripcion', 'website_url']]);
    assert.deepEqual(companyColumns.rows, [
      { column_name: 'descripcion', column_type: 'character varying(500)', attnotnull: false },
      { column_name: 'website_url', column_type: 'character varying(2048)', attnotnull: false }
    ]);

    const socialColumns = await client.query(`
      SELECT
        column_name,
        data_type,
        character_maximum_length,
        is_nullable,
        column_default,
        is_identity
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'empresa_redes_sociales'
        AND column_name = ANY($1::text[])
      ORDER BY column_name
    `, [['empresa_id', 'id', 'orden', 'plataforma', 'url', 'visible']]);
    assert.equal(socialColumns.rows.length, 6, 'migration 0011 social columns must exist');
    const columnsByName = Object.fromEntries(
      socialColumns.rows.map((column) => [column.column_name, column])
    );
    assert.equal(columnsByName.id.data_type, 'bigint');
    assert.equal(columnsByName.id.is_identity, 'YES');
    assert.equal(columnsByName.empresa_id.data_type, 'integer');
    assert.equal(columnsByName.empresa_id.is_nullable, 'NO');
    assert.equal(columnsByName.plataforma.data_type, 'text');
    assert.equal(columnsByName.plataforma.is_nullable, 'NO');
    assert.equal(columnsByName.url.data_type, 'character varying');
    assert.equal(columnsByName.url.character_maximum_length, 2048);
    assert.equal(columnsByName.url.is_nullable, 'NO');
    assert.equal(columnsByName.visible.data_type, 'boolean');
    assert.equal(columnsByName.visible.is_nullable, 'NO');
    assert.match(columnsByName.visible.column_default, /^true$/i);
    assert.equal(columnsByName.orden.data_type, 'smallint');
    assert.equal(columnsByName.orden.is_nullable, 'NO');
    assert.match(columnsByName.orden.column_default, /^0(?:::\w+)?$/);

    const constraints = await client.query(`
      SELECT conname, contype, confdeltype, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'public.empresa_redes_sociales'::regclass
      ORDER BY conname
    `);
    const foreignKey = constraints.rows.find((constraint) => constraint.contype === 'f');
    assert.ok(foreignKey, 'empresa_redes_sociales must have a foreign key');
    assert.equal(foreignKey.confdeltype, 'c', 'the company foreign key must cascade on delete');
    assert.match(
      foreignKey.definition,
      /FOREIGN KEY \(empresa_id\) REFERENCES empresas\(id\) ON DELETE CASCADE/i
    );

    const companyPlatformUnique = constraints.rows.find(
      (constraint) => constraint.conname === 'empresa_redes_sociales_empresa_plataforma_key'
    );
    assert.equal(companyPlatformUnique?.contype, 'u');
    assert.match(companyPlatformUnique.definition, /UNIQUE \(empresa_id, plataforma\)/i);

    const platformCheck = constraints.rows.find(
      (constraint) => constraint.conname === 'empresa_redes_sociales_plataforma_check'
    );
    assert.equal(platformCheck?.contype, 'c');
    const allowedPlatforms = [...platformCheck.definition.matchAll(/'([A-Z]+)'/g)]
      .map((match) => match[1])
      .sort();
    assert.deepEqual(allowedPlatforms, EXPECTED_PLATFORMS);
    const orderCheck = constraints.rows.find(
      (constraint) => constraint.conname === 'empresa_redes_sociales_orden_check'
    );
    assert.equal(orderCheck?.contype, 'c');

    const triggers = await client.query(`
      SELECT c.relname AS table_name, t.tgname, pg_get_triggerdef(t.oid) AS definition
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND NOT t.tgisinternal
        AND t.tgname = ANY($1::text[])
      ORDER BY c.relname
    `, [[
      'empresas_catalog_revision_trigger',
      'empresa_redes_sociales_catalog_revision_trigger'
    ]]);
    assert.equal(triggers.rows.length, 2);
    const companyTrigger = triggers.rows.find((trigger) => trigger.table_name === 'empresas');
    const socialTrigger = triggers.rows.find(
      (trigger) => trigger.table_name === 'empresa_redes_sociales'
    );
    assert.equal(companyTrigger?.tgname, 'empresas_catalog_revision_trigger');
    assert.match(
      companyTrigger.definition,
      /AFTER INSERT OR DELETE OR UPDATE ON public\.empresas FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_revision\(\)/i
    );
    assert.equal(socialTrigger?.tgname, 'empresa_redes_sociales_catalog_revision_trigger');
    assert.match(
      socialTrigger.definition,
      /AFTER INSERT OR DELETE OR UPDATE ON public\.empresa_redes_sociales FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_revision\(\)/i
    );

    await client.query('BEGIN');
    inTransaction = true;

    const revisionBeforeCompanyInsert = await readCatalogRevision(client);
    const companies = await client.query(`
      INSERT INTO empresas (nombre, logo_url)
      VALUES ('PCD-01B Alpha', '/uploads/pcd-01b-alpha.webp'),
             ('PCD-01B Beta', '/uploads/pcd-01b-beta.webp')
      RETURNING id
    `);
    const revisionAfterCompanyInsert = await readCatalogRevision(client);
    assert.equal(revisionAfterCompanyInsert - revisionBeforeCompanyInsert, 1n);
    const [alphaId, betaId] = companies.rows.map((row) => row.id);

    const revisionBeforeSocialInsert = await readCatalogRevision(client);
    const socialLinks = await client.query(`
      INSERT INTO empresa_redes_sociales (empresa_id, plataforma, url)
      VALUES ($1, 'FACEBOOK', 'https://facebook.com/pcd-01b-alpha'),
             ($2, 'INSTAGRAM', 'https://instagram.com/pcd-01b-beta')
      RETURNING empresa_id, plataforma, visible, orden
    `, [alphaId, betaId]);
    assert.deepEqual(
      socialLinks.rows.map((row) => ({
        empresa_id: row.empresa_id,
        plataforma: row.plataforma,
        visible: row.visible,
        orden: row.orden
      })),
      [
        { empresa_id: alphaId, plataforma: 'FACEBOOK', visible: true, orden: 0 },
        { empresa_id: betaId, plataforma: 'INSTAGRAM', visible: true, orden: 0 }
      ]
    );
    const revisionAfterSocialInsert = await readCatalogRevision(client);
    assert.equal(revisionAfterSocialInsert - revisionBeforeSocialInsert, 1n);

    await expectConstraintViolation(client, 'fk_violation', {
      text: `INSERT INTO empresa_redes_sociales (empresa_id, plataforma, url)
             VALUES ($1, 'YOUTUBE', 'https://youtube.com/@missing-company')`,
      values: [-2147483648]
    }, '23503');
    await expectConstraintViolation(client, 'unique_violation', {
      text: `INSERT INTO empresa_redes_sociales (empresa_id, plataforma, url)
             VALUES ($1, 'FACEBOOK', 'https://facebook.com/duplicate')`,
      values: [alphaId]
    }, '23505');
    await expectConstraintViolation(client, 'platform_violation', {
      text: `INSERT INTO empresa_redes_sociales (empresa_id, plataforma, url)
             VALUES ($1, 'X', 'https://example.com/not-supported')`,
      values: [alphaId]
    }, '23514');
    await expectConstraintViolation(client, 'order_violation', {
      text: `INSERT INTO empresa_redes_sociales (empresa_id, plataforma, url, orden)
             VALUES ($1, 'YOUTUBE', 'https://youtube.com/@invalid-order', -1)`,
      values: [alphaId]
    }, '23514');

    const revisionBeforeCascade = await readCatalogRevision(client);
    await client.query('DELETE FROM empresas WHERE id = $1', [alphaId]);
    const revisionAfterCascade = await readCatalogRevision(client);
    assert.ok(revisionAfterCascade > revisionBeforeCascade);
    const remainingAlphaLinks = await client.query(
      'SELECT count(*)::integer AS count FROM empresa_redes_sociales WHERE empresa_id = $1',
      [alphaId]
    );
    assert.equal(remainingAlphaLinks.rows[0].count, 0);

    await client.query(
      'DROP TRIGGER empresa_redes_sociales_catalog_revision_trigger ON empresa_redes_sociales'
    );
    const revisionWithoutSocialTrigger = await readCatalogRevision(client);
    await client.query(
      'UPDATE empresa_redes_sociales SET visible = false WHERE empresa_id = $1',
      [betaId]
    );
    assert.equal(await readCatalogRevision(client), revisionWithoutSocialTrigger);

    await client.query(`
      CREATE TRIGGER empresa_redes_sociales_catalog_revision_trigger
      AFTER INSERT OR UPDATE OR DELETE ON empresa_redes_sociales
      FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_revision()
    `);
    const revisionBeforeRestoredMutation = await readCatalogRevision(client);
    await client.query(
      'UPDATE empresa_redes_sociales SET visible = true WHERE empresa_id = $1',
      [betaId]
    );
    const revisionAfterRestoredMutation = await readCatalogRevision(client);
    assert.equal(revisionAfterRestoredMutation - revisionBeforeRestoredMutation, 1n);
  } finally {
    if (client && inTransaction) {
      await client.query('ROLLBACK');
    }
    client?.release();
    await pool.end();
  }
});

test('public company repository keeps counts, keyset pagination, literals, and scale bounded', {
  timeout: 45_000
}, async (t) => {
  assert.equal(
    process.env.COMPANY_CATALOG_TEST_SENTINEL,
    EXPECTED_SENTINEL,
    `Refusing execution without explicit sentinel: COMPANY_CATALOG_TEST_SENTINEL=${EXPECTED_SENTINEL}`
  );

  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL is required for the ephemeral company catalog test');
  assertSafeDatabaseUrl(databaseUrl);

  // Deliberately RED until PCD-03 provides the runtime repository.
  const {
    createCompanyCatalogRepository
  } = require('../src/infrastructure/postgres/company-catalog.repository');
  assert.equal(typeof createCompanyCatalogRepository, 'function');

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
  });
  let client;
  let inTransaction = false;

  try {
    client = await pool.connect();
    await assertSafeConnectedClient(client);
    await client.query('BEGIN');
    inTransaction = true;

    const fixture = await client.query(`
      WITH inserted AS (
        INSERT INTO empresas (nombre, logo_url, descripcion, website_url)
        SELECT
          'PCD03 Company ' || lpad(series_id::text, 5, '0'),
          '/uploads/pcd03-' || lpad(series_id::text, 5, '0') || '.webp',
          NULL,
          NULL
        FROM generate_series(1, 10000) AS fixture(series_id)
        RETURNING id
      )
      SELECT
        count(*)::integer AS fixture_count,
        min(id)::integer AS min_id,
        max(id)::integer AS max_id
      FROM inserted
    `);
    assert.equal(fixture.rows[0].fixture_count, 10_000);
    assert.equal(fixture.rows[0].max_id - fixture.rows[0].min_id + 1, 10_000);

    const firstId = fixture.rows[0].min_id;
    const fixtureIds = {
      zeroPoints: firstId,
      profile: firstId + 1,
      tieUpper: firstId + 2,
      tieTitle: firstId + 3,
      tieLower: firstId + 4,
      literal: firstId + 5,
      legacyLong: firstId + 6
    };
    const literalCompanyName = 'PCD03 Literal %_\\ Marker';
    const legacyLongName = `PCD03 Legacy ${'Á'.repeat(600)}`;

    await client.query(`
      UPDATE empresas
      SET
        nombre = CASE id
          WHEN $1 THEN 'PCD03 Zero Points'
          WHEN $2 THEN 'PCD03 Public Profile'
          WHEN $3 THEN 'PCD03 PAGE TIE'
          WHEN $4 THEN 'Pcd03 Page Tie'
          WHEN $5 THEN 'pcd03 page tie'
          WHEN $6 THEN $8
          WHEN $7 THEN $9
        END,
        descripcion = CASE WHEN id = $2 THEN 'Perfil público de prueba' ELSE descripcion END,
        website_url = CASE WHEN id = $2 THEN 'https://company.example.test' ELSE website_url END
      WHERE id = ANY($10::integer[])
    `, [
      fixtureIds.zeroPoints,
      fixtureIds.profile,
      fixtureIds.tieUpper,
      fixtureIds.tieTitle,
      fixtureIds.tieLower,
      fixtureIds.literal,
      fixtureIds.legacyLong,
      literalCompanyName,
      legacyLongName,
      Object.values(fixtureIds)
    ]);

    await client.query(`
      INSERT INTO agencias (
        empresa_id,
        id_destino,
        nombre_destino,
        tipo,
        departamento,
        municipio
      )
      VALUES
        ($1, 'PCD03_PUBLIC_1', 'PCD03 Public 1', 'AGENCIA', 'San Salvador', 'Soyapango'),
        ($1, 'PCD03_PUBLIC_2', 'PCD03 Public 2', 'AGENCIA', ' san salvador ', ' soyapango '),
        ($1, 'PCD03_PUBLIC_BLANK_LOCATION', 'PCD03 Public Blank', 'AGENCIA', '   ', 'Soyapango'),
        ($1, '   ', 'PCD03 Private Blank', 'AGENCIA', 'San Salvador', 'Otra'),
        ($1, NULL, 'PCD03 Private Null', 'AGENCIA', 'San Salvador', 'Otra')
    `, [fixtureIds.profile]);

    const rawVisibleUrl = 'https://unresolvable.invalid/raw-token?do-not-fetch=1';
    await client.query(`
      INSERT INTO empresa_redes_sociales (empresa_id, plataforma, url, visible, orden)
      VALUES
        ($1, 'FACEBOOK', $2, true, 2),
        ($1, 'INSTAGRAM', 'https://instagram.com/pcd03-profile', true, 1),
        ($1, 'TIKTOK', 'https://tiktok.com/@hidden-pcd03', false, 0)
    `, [fixtureIds.profile, rawVisibleUrl]);

    let repositoryCalls = [];
    const tracedDatabase = {
      async query(text, values = []) {
        assert.equal(typeof text, 'string', 'repository queries must expose parameterized SQL text');
        const result = await client.query(text, values);
        repositoryCalls.push({ text, values, rowCount: result.rowCount });
        return result;
      }
    };
    const repository = createCompanyCatalogRepository({
      getDB: async () => tracedDatabase
    });

    repositoryCalls = [];
    const zeroPointPage = await repository.listCompanies({
      q: 'pcd03 zero points',
      limit: 20,
      position: null
    });
    assert.equal(repositoryCalls.length, 1, 'the company list must use one database query');
    assert.equal(zeroPointPage.companies.length, 1);
    assert.equal(zeroPointPage.companies[0].companyId, String(fixtureIds.zeroPoints));
    assert.equal(zeroPointPage.companies[0].pointCount, 0);
    assert.equal(zeroPointPage.companies[0].municipalityCount, 0);

    repositoryCalls = [];
    const profileListPage = await repository.listCompanies({
      q: 'pcd03 public profile',
      limit: 20,
      position: null
    });
    assert.equal(repositoryCalls.length, 1, 'company counts must be projected by the list query');
    assert.equal(profileListPage.companies.length, 1);
    assert.equal(profileListPage.companies[0].pointCount, 3);
    assert.equal(profileListPage.companies[0].municipalityCount, 1);

    const profile = await repository.getCompanyProfile(String(fixtureIds.profile));
    assert.equal(profile.companyId, String(fixtureIds.profile));
    assert.deepEqual(profile.coverage, {
      pointCount: 3,
      municipalityCount: 1,
      departmentCount: 1
    });
    assert.deepEqual(profile.socialLinks, [
      {
        platform: 'INSTAGRAM',
        url: 'https://instagram.com/pcd03-profile',
        order: 1
      },
      {
        platform: 'FACEBOOK',
        url: rawVisibleUrl,
        order: 2
      }
    ]);

    const pagedTieIds = [];
    let position = null;
    for (let pageNumber = 0; pageNumber < 3; pageNumber += 1) {
      const page = await repository.listCompanies({
        q: 'pcd03 page tie',
        limit: 1,
        position
      });
      assert.equal(page.companies.length, 1);
      const company = page.companies[0];
      pagedTieIds.push(company.companyId);
      assert.equal(page.hasMore, pageNumber < 2);
      position = {
        matchRank: company.matchRank,
        normalizedName: company.normalizedName,
        companyId: company.companyId
      };
    }
    assert.deepEqual(
      pagedTieIds,
      [fixtureIds.tieUpper, fixtureIds.tieTitle, fixtureIds.tieLower]
        .sort((left, right) => left - right)
        .map(String),
      'companyId must break normalized-name ties without omissions or duplicates'
    );
    assert.equal(new Set(pagedTieIds).size, 3);

    for (const literalQuery of ['%', '_', '\\']) {
      const literalPage = await repository.listCompanies({
        q: literalQuery,
        limit: 20,
        position: null
      });
      assert.deepEqual(
        literalPage.companies.map((company) => company.companyId),
        [String(fixtureIds.literal)],
        `the search token ${JSON.stringify(literalQuery)} must remain literal`
      );
    }

    const legacyPage = await repository.listCompanies({
      q: 'pcd03 legacy',
      limit: 20,
      position: null
    });
    assert.equal(legacyPage.companies.length, 1);
    assert.equal(legacyPage.companies[0].companyId, String(fixtureIds.legacyLong));
    assert.ok([...legacyPage.companies[0].normalizedName].length <= 250);
    assert.ok(Buffer.byteLength(legacyPage.companies[0].normalizedName, 'utf8') <= 1024);

    repositoryCalls = [];
    const startedAt = performance.now();
    const scalePage = await repository.listCompanies({
      q: null,
      limit: 20,
      position: null
    });
    const elapsedMs = performance.now() - startedAt;
    assert.equal(repositoryCalls.length, 1, 'the 10,000-company page must use one query');
    assert.ok(repositoryCalls[0].rowCount <= 21, 'limit 20 may read at most one look-ahead row');
    assert.ok(scalePage.companies.length <= 20);
    assert.equal(scalePage.hasMore, true);
    const payloadBytes = Buffer.byteLength(JSON.stringify(scalePage), 'utf8');
    assert.ok(payloadBytes <= 32 * 1024, `company page payload must stay bounded, got ${payloadBytes} bytes`);
    assert.ok(elapsedMs <= 1_500, `company list exceeded 1500 ms: ${elapsedMs.toFixed(2)} ms`);

    const explain = await client.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${repositoryCalls[0].text}`,
      repositoryCalls[0].values
    );
    const planDocument = explain.rows[0]?.['QUERY PLAN']?.[0];
    assert.ok(planDocument?.Plan, 'EXPLAIN must return a JSON execution plan');
    const planNodes = collectPlanNodes(planDocument.Plan);
    assert.ok(planNodes.length > 0);
    assert.ok(
      planNodes.some((node) => Object.keys(node).some((key) => key.endsWith('Blocks'))),
      'BUFFERS evidence must be present in the execution plan'
    );
    assert.ok(planDocument.Plan['Actual Rows'] <= 21, 'the plan must emit at most the look-ahead page');
    assert.ok(
      planDocument['Execution Time'] <= 1_500,
      `EXPLAIN execution exceeded 1500 ms: ${planDocument['Execution Time']} ms`
    );
    t.diagnostic(JSON.stringify({
      fixtureCompanies: fixture.rows[0].fixture_count,
      queryElapsedMs: Number(elapsedMs.toFixed(2)),
      explainExecutionMs: planDocument['Execution Time'],
      rows: repositoryCalls[0].rowCount,
      payloadBytes,
      planNodes: planNodes.map((node) => node['Node Type'])
    }));
  } finally {
    if (client && inTransaction) {
      await client.query('ROLLBACK');
    }
    client?.release();
    await pool.end();
  }
});
