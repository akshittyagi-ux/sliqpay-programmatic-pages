import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is missing from .env');
    process.exit(1);
  }

  let parsed: URL;
  try {
    parsed = new URL(url.replace(/^postgresql:/, 'postgres:'));
  } catch {
    console.error('DATABASE_URL is not a valid URL');
    process.exit(1);
  }

  console.log('Testing connection...');
  console.log(`  Host: ${parsed.hostname}:${parsed.port || '5432'}`);
  console.log(`  User: ${parsed.username}`);
  console.log(`  Database: ${parsed.pathname.slice(1) || '(default)'}`);

  const pool = new Pool({ connectionString: url });
  try {
    const result = await pool.query('SELECT current_database() AS db, current_user AS user');
    console.log('\nConnected successfully.');
    console.log(`  Logged in as: ${result.rows[0].user}`);
    console.log(`  Database: ${result.rows[0].db}`);
  } catch (err: unknown) {
    const pg = err as { code?: string; message?: string };
    console.error('\nConnection failed:', pg.message ?? err);

    if (pg.code === '28P01') {
      console.error(`
Wrong password for PostgreSQL user "${parsed.username}".

Fix DATABASE_URL in .env, for example:
  postgresql://postgres:YOUR_PASSWORD@localhost:5432/sliqpay_pages

Find or reset your password:
  - Password you chose when installing PostgreSQL 14
  - Or open pgAdmin / SQL Shell (psql) and sign in with the password you use there
  - Reset (Windows, run as admin): alter user postgres password 'newpassword';
`);
    } else if (pg.code === '3D000') {
      console.error(`
Database "${parsed.pathname.slice(1)}" does not exist.

Create it in psql or pgAdmin:
  CREATE DATABASE "sliqpay_pages";

Then run:
  npm run db:schema
  npm run seed
`);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
