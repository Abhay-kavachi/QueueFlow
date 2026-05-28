require('dotenv').config({ path: __dirname + '/../.env' });
const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
const bcrypt = require('bcryptjs');
const { query } = require('../src/utils/database');

const question = (q) => new Promise(resolve => readline.question(q, resolve));

async function run() {
  console.log("\n=== QueueFlow Master Admin Provisioning ===\n");
  try {
    const orgName = await question("Organization Name: ");
    const type = await question("Organization Type (govt/private/institution): ");
    const authMode = await question("Auth Mode (aadhaar/mobile/student_id): ");
    const adminUsername = await question("Admin Username: ");
    const adminPassword = await question("Admin Password: ");

    console.log("\n⚙️  Provisioning Domain...");
    
    // 1. Create Organization
    const orgRes = await query(
      "INSERT INTO organizations (name, type, auth_mode) VALUES ($1, $2, $3) RETURNING id",
      [orgName, type, authMode]
    );
    const orgId = orgRes.rows[0].id;
    
    // 2. Create Default Service Block (Required to bind Admin)
    const svcRes = await query(
      "INSERT INTO services (organization_id, name, description, capacity) VALUES ($1, $2, $3, $4) RETURNING id",
      [orgId, 'Main Service Counter', 'Default platform queue entry', 1]
    );
    const serviceId = svcRes.rows[0].id;
    
    // 3. Bind Admin credentials to domain
    const hash = await bcrypt.hash(adminPassword, 10);
    await query(
      "INSERT INTO workers (organization_id, service_id, name, username, password_hash, role) VALUES ($1, $2, $3, $4, $5, $6)",
      [orgId, serviceId, 'Domain Administrator', adminUsername, hash, 'admin']
    );

    console.log("\n✅ DOMAIN SUCCESSFULLY CREATED!");
    console.log("--------------------------------------------------");
    console.log(`[Domain]      ${orgName} (${type})`);
    console.log(`[Org ID]      ${orgId}`);
    console.log(`[Access Mode] ${authMode}`);
    console.log(`[Admin]       ${adminUsername}`);
    console.log("--------------------------------------------------");

  } catch (error) {
    console.error("\n❌ Error provisioning organization:", error.message);
  } finally {
    readline.close();
    process.exit(0);
  }
}

run();
