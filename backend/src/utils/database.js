const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}
async function initializeDatabase() {
  try {
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('Cannot connect to database');
    }
    const client = await pool.connect();
    try {
      const result = await client.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'services');");
      const tablesExist = result.rows[0].exists;
      if (!tablesExist) {
        const schemaPath = path.join(__dirname, '../../sql/schema.sql');
        const schemaSQL = await fs.readFile(schemaPath, 'utf8');
        await client.query('BEGIN');
        await client.query(schemaSQL);
        await client.query('COMMIT');
        console.log('✅ Database schema initialized successfully');
      } else {
        console.log('✅ Database schema already exists');
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Query error:', { text, error: error.message });
    throw error;
  }
}
async function transaction(queries) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const results = [];
    for (const { text, params } of queries) {
      const result = await client.query(text, params);
      results.push(result);
    }
    await client.query('COMMIT');
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
async function closePool() {
  await pool.end();
}
module.exports = {
  pool,
  query,
  transaction,
  initializeDatabase,
  closePool
};