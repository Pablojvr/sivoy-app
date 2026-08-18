const { Client } = require('pg'); 
const client = new Client({ connectionString: 'postgresql://neondb_owner:npg_8FhdTIzBoW0C@ep-winter-credit-axmghliw-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require' }); 

client.connect().then(async () => { 
  const res = await client.query("SELECT * FROM horarios_operativos WHERE dia_semana LIKE '%a%'"); 
  let count = 0;
  for (const row of res.rows) { 
    const normalize = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); 
    if (normalize(row.dia_semana) === 'lunes a viernes') { 
      const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']; 
      for (const d of dias) { 
        await client.query('INSERT INTO horarios_operativos (agencia_id, dia_semana, hora_apertura, hora_cierre, tipo_accion) VALUES ($1, $2, $3, $4, $5)', [row.agencia_id, d, row.hora_apertura, row.hora_cierre, row.tipo_accion || null]); 
      } 
      await client.query('DELETE FROM horarios_operativos WHERE id = $1', [row.id]); 
      count++;
    } else if (normalize(row.dia_semana) === 'lunes a sabado') { 
      const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']; 
      for (const d of dias) { 
        await client.query('INSERT INTO horarios_operativos (agencia_id, dia_semana, hora_apertura, hora_cierre, tipo_accion) VALUES ($1, $2, $3, $4, $5)', [row.agencia_id, d, row.hora_apertura, row.hora_cierre, row.tipo_accion || null]); 
      } 
      await client.query('DELETE FROM horarios_operativos WHERE id = $1', [row.id]); 
      count++;
    } 
  } 
  console.log('Done migrating ' + count + ' ranges.'); 
  client.end(); 
}).catch(e => { console.error(e); client.end(); });
