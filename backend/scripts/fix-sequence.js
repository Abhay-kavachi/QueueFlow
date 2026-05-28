require('dotenv').config({ path: __dirname + '/../.env' });
const { query } = require('../src/utils/database');

async function fix() {
    try {
        console.log("Fixing sequences...");
        await query("SELECT setval('services_id_seq', COALESCE((SELECT MAX(id) + 1 FROM services), 1), false);");
        await query("SELECT setval('service_configurations_id_seq', COALESCE((SELECT MAX(id) + 1 FROM service_configurations), 1), false);");
        console.log("Sequences fixed successfully.");
        process.exit(0);
    } catch (e) {
        console.error("Failed:", e);
        process.exit(1);
    }
}

fix();
