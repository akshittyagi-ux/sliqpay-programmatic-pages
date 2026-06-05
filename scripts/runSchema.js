const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const sql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  const pool = new Pool({ connectionString });
  try {
    await pool.query(sql);
    console.log('Schema applied successfully');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
