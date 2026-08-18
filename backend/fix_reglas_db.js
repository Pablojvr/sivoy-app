const { Client } = require('pg'); 
const client = new Client({ connectionString: 'postgresql://neondb_owner:npg_8FhdTIzBoW0C@ep-winter-credit-axmghliw-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require' }); 

client.connect().then(async () => { 
  const res = await client.query("SELECT * FROM reglas_entrega WHERE dia_entrega LIKE '% y %' OR dia_corte_maximo LIKE '% y %'"); 
  let count = 0;
  for (const row of res.rows) { 
    const entregaParts = row.dia_entrega.split(' y ').map(s => s.trim());
    const corteParts = row.dia_corte_maximo.split(' y ').map(s => s.trim());
    
    // Si dia_entrega tiene N partes y dia_corte_maximo tiene N partes, se asocian 1 a 1.
    // Si dia_corte_maximo tiene 1 parte (ej. "Día anterior"), se usa para todos.
    for (let i = 0; i < entregaParts.length; i++) {
        const d_entrega = entregaParts[i];
        const d_corte = corteParts.length > 1 ? corteParts[i] : corteParts[0];
        
        await client.query('INSERT INTO reglas_entrega (agencia_id, dia_entrega, dia_corte_maximo) VALUES ($1, $2, $3)', [row.agencia_id, d_entrega, d_corte]);
    }
    await client.query('DELETE FROM reglas_entrega WHERE id = $1', [row.id]); 
    count++;
  } 
  console.log('Done migrating ' + count + ' reglas.'); 
  client.end(); 
}).catch(e => { console.error(e); client.end(); });
