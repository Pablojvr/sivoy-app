require('dotenv').config();
const { Client } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const client = new Client({ connectionString: process.env.DATABASE_URL });

client.connect().then(async () => { 
  await client.query('BEGIN');
  try {
    const res = await client.query("SELECT * FROM reglas_entrega WHERE dia_entrega LIKE '% y %' OR dia_corte_maximo LIKE '% y %'");
    let count = 0;
    for (const row of res.rows) {
      const entregaParts = row.dia_entrega.split(' y ').map(value => value.trim());
      const corteParts = row.dia_corte_maximo.split(' y ').map(value => value.trim());

      if (corteParts.length !== 1 && corteParts.length !== entregaParts.length) {
        throw new Error(`Rule ${row.id} has incompatible delivery and cutoff ranges`);
      }

      for (let index = 0; index < entregaParts.length; index++) {
        const diaEntrega = entregaParts[index];
        const diaCorte = corteParts.length > 1 ? corteParts[index] : corteParts[0];
        await client.query(
          'INSERT INTO reglas_entrega (agencia_id, dia_entrega, dia_corte_maximo) VALUES ($1, $2, $3)',
          [row.agencia_id, diaEntrega, diaCorte]
        );
      }
      await client.query('DELETE FROM reglas_entrega WHERE id = $1', [row.id]);
      count++;
    }
    await client.query('COMMIT');
    console.log(`Done migrating ${count} rules.`);
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
