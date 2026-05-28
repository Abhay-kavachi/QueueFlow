require('dotenv').config();
const { pool } = require('./src/utils/database');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    await client.query(`
      ALTER TABLE workers DROP CONSTRAINT IF EXISTS workers_role_check;
      ALTER TABLE workers ADD CONSTRAINT workers_role_check CHECK (role IN ('admin', 'manager', 'worker'));
    `);
    
    console.log('Migrated workers constraint to include manager');
    
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed', err);
  } finally {
    client.release();
    pool.end();
  }
}
migrate();
