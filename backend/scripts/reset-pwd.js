const bcrypt = require('bcryptjs');
const { query } = require('../src/utils/database');
require('dotenv').config({ path: '../.env' }); // Make sure we hit the .env

async function resetPasswords() {
  try {
    const hash = await bcrypt.hash('admin123', 10);
    const result = await query('UPDATE workers SET password_hash = $1 RETURNING username', [hash]);
    console.log(`Successfully reset passwords to "admin123" for ${result.rowCount} workers.`);
    console.table(result.rows);
  } catch (error) {
    console.error('Error resetting passwords:', error);
  } finally {
    process.exit(0);
  }
}

resetPasswords();
