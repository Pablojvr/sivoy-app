const sqlite3 = require('sqlite3'); 
const db = new sqlite3.Database('../data/sivoyapp.sqlite'); 
db.all('SELECT * FROM agencias WHERE municipio="Soyapango"', [], (err, rows) => { 
  console.log(JSON.stringify(rows, null, 2)); 
  db.close(); 
});
