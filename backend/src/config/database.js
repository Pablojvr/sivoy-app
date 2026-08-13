const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

let dbInstance = null;

async function getDB() {
    if (dbInstance) {
        return dbInstance;
    }
    
    const defaultDbPath = path.join(__dirname, '..', '..', '..', 'data', 'sivoyapp.sqlite');
    const dbPath = process.env.DB_PATH || defaultDbPath;
    dbInstance = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });
    
    console.log('[INIT] Connected to SQLite database.');
    return dbInstance;
}

module.exports = {
    getDB
};
