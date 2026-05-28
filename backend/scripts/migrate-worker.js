require('dotenv').config({ path: __dirname + '/../.env' });
const { query } = require('../src/utils/database');

async function migrate() {
    try {
        console.log("Adding worker_invite_key to organizations table...");
        await query('ALTER TABLE organizations ADD COLUMN IF NOT EXISTS worker_invite_key VARCHAR(100) UNIQUE;');
        console.log("Migration successful.");
        process.exit(0);
    } catch (e) {
        console.error("Migration failed:", e.message);
        process.exit(1);
    }
}

migrate();
