require('dotenv').config();
const { pool } = require('./database');
const fs = require('fs');
const path = require('path');

async function run() {
  console.log("Dropping and recreating database schema...");
  const sql = fs.readFileSync(path.join(__dirname, '../../sql/schema.sql'), 'utf-8');
  await pool.query(sql);
  console.log("Migration complete!");
  process.exit(0);
}
run();
