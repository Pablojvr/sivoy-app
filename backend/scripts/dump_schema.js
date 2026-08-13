const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('a:/SiVoyApp/data/sivoyapp.sqlite');
db.all("SELECT name, sql FROM sqlite_master WHERE type='table'", (err, rows) => {
    if (err) console.error(err);
    else rows.forEach(r => console.log(r.sql));
    db.close();
});
