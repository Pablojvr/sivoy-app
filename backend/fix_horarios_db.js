require('dotenv').config();
const { Client } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const client = new Client({ connectionString: process.env.DATABASE_URL });

client.connect().then(async () => { 
  await client.query('BEGIN');
  try {
    const res = await client.query("SELECT * FROM horarios_operativos WHERE dia_semana LIKE '%a%'");
    let count = 0;
    for (const row of res.rows) {
      const normalize = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const normalizedDay = normalize(row.dia_semana);
      const dias = normalizedDay === 'lunes a viernes'
        ? ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
        : normalizedDay === 'lunes a sabado'
          ? ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
          : [];

      for (const dia of dias) {
        await client.query(
          'INSERT INTO horarios_operativos (agencia_id, dia_semana, hora_apertura, hora_cierre, tipo_accion) VALUES ($1, $2, $3, $4, $5)',
          [row.agencia_id, dia, row.hora_apertura, row.hora_cierre, row.tipo_accion || null]
        );
      }
      if (dias.length > 0) {
        await client.query('DELETE FROM horarios_operativos WHERE id = $1', [row.id]);
        count++;
      }
    }
    await client.query('COMMIT');
    console.log(`Done migrating ${count} ranges.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
