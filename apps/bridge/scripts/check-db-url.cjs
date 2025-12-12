require('dotenv').config();

const url = process.env.DATABASE_URL || '';

if (!url) {
  console.log(JSON.stringify({ ok: false, reason: 'MISSING_DATABASE_URL' }));
  process.exit(1);
}

let parsed;
try {
  parsed = new (require('url').URL)(url);
} catch (e) {
  console.log(JSON.stringify({ ok: false, reason: 'INVALID_DATABASE_URL', message: e.message }));
  process.exit(1);
}

const sslmode = parsed.searchParams.get('sslmode');
const protocolOk = /^postgres(ql)?:$/.test(parsed.protocol);
const sslOk = sslmode === 'require' || url.includes('sslmode=require');
const hostLooksLikeNeon = /(^|\.)neon\.tech$/i.test(parsed.hostname);

console.log(
  JSON.stringify({
    ok: true,
    protocolOk,
    sslOk,
    hostLooksLikeNeon,
    hasUsername: Boolean(parsed.username),
    hasPassword: Boolean(parsed.password),
  })
);

async function main() {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: url,
    ssl: sslOk ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await pool.query('select 1 as ok');
    const r = await pool.query(
      "select column_name from information_schema.columns where table_schema='public' and table_name='messages' and column_name='sender_plaintext'"
    );
    console.log(
      JSON.stringify({ connected: true, sender_plaintext_column_present: r.rows.length > 0 })
    );
  } catch (e) {
    console.log(JSON.stringify({ connected: false, error: e.message }));
    process.exitCode = 2;
  } finally {
    await pool.end();
  }
}

main();
