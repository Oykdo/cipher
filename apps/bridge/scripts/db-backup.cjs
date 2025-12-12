require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is missing');
  process.exit(1);
}

function safeNow() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  const backupsDir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });

  const outPath =
    process.argv[2] || path.join(backupsDir, `backup-${safeNow()}.json`);

  const ssl = DATABASE_URL.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined;

  const pool = new Pool({ connectionString: DATABASE_URL, ssl });

  try {
    const tablesRes = await pool.query(
      "select tablename from pg_tables where schemaname='public' order by tablename"
    );
    const tables = tablesRes.rows.map(r => r.tablename);

    const dump = {
      version: 1,
      createdAt: new Date().toISOString(),
      database: {
        host: (() => {
          try {
            return new URL(DATABASE_URL).hostname;
          } catch {
            return 'unknown';
          }
        })(),
      },
      tables: {},
    };

    for (const table of tables) {
      const res = await pool.query(`select * from "${table}"`);
      dump.tables[table] = {
        columns: res.fields.map(f => f.name),
        rows: res.rows,
      };
      console.log(`✅ Backed up ${table} (${res.rowCount} rows)`);
    }

    fs.writeFileSync(outPath, JSON.stringify(dump, null, 2), 'utf8');
    console.log(`\n🎉 Backup written to: ${outPath}`);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('❌ Backup failed:', err?.message || err);
  process.exit(2);
});
