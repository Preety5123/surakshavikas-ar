const fs = require('fs');
const path = require('path');
const DB = path.join(__dirname, 'db.json');
function load() { try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return { workers: [], results: [], certificates: [] }; } }
function save(db) { fs.writeFileSync(DB, JSON.stringify(db, null, 2)); }
module.exports = { load, save };
