const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

async function main() {
    const db = await open({
        filename: path.join(__dirname, '..', 'data', 'sivoyapp.sqlite'),
        driver: sqlite3.Database
    });
    
    const empresas = await db.all("SELECT id, nombre FROM empresas");
    console.log(empresas);
}
main();
