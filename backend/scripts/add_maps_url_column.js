const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

open({
    filename: path.join(__dirname, '..', '..', 'data', 'sivoyapp.sqlite'),
    driver: sqlite3.Database
}).then(async db => {
    try {
        await db.run('ALTER TABLE agencias ADD COLUMN maps_url TEXT');
        console.log('✅ Column maps_url added to agencias table.');
    } catch (e) {
        if (e.message.includes('duplicate column')) {
            console.log('ℹ️ Column maps_url already exists, skipping.');
        } else {
            console.error('❌ Error:', e.message);
        }
    } finally {
        await db.close();
        console.log('Done.');
    }
});
