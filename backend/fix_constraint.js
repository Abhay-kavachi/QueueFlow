require('dotenv').config();
const { query } = require('./src/utils/database');

async function fixConstraint() {
  try {
    await query(`ALTER TABLE live_queue DROP CONSTRAINT IF EXISTS live_queue_state_check;`);
    await query(`ALTER TABLE live_queue ADD CONSTRAINT live_queue_state_check CHECK (state IN ('pending', 'next', 'active', 'grace', 'skipped', 'appointment'));`);
    console.log('Constraint updated successfully.');
  } catch (err) {
    console.error('Error updating constraint:', err);
  } finally {
    process.exit();
  }
}

fixConstraint();
