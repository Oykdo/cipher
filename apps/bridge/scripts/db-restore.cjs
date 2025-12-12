require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is missing');
  process.exit(1);
}

const backupPath = process.argv[2];
if (!backupPath) {
  console.error('Usage: node scripts/db-restore.cjs <backup.json>');
  process.exit(1);
}

function topoSortTables(tables, fkEdges) {
  // edges: parent -> child
  const inDeg = new Map(tables.map(t => [t, 0]));
  const adj = new Map(tables.map(t => [t, new Set()]));

  for (const { parent, child } of fkEdges) {
    if (!inDeg.has(parent) || !inDeg.has(child)) continue;
    if (!adj.get(parent).has(child)) {
      adj.get(parent).add(child);
      inDeg.set(child, (inDeg.get(child) || 0) + 1);
    }
  }

  const queue = [];
  for (const [t, d] of inDeg.entries()) {
    if (d === 0) queue.push(t);
  }

  const out = [];
  while (queue.length) {
    const t = queue.shift();
    out.push(t);
    for (const child of adj.get(t)) {
      inDeg.set(child, inDeg.get(child) - 1);
      if (inDeg.get(child) === 0) queue.push(child);
    }
  }

  // If there is a cycle, append remaining tables in original order
  if (out.length !== tables.length) {
    const seen = new Set(out);
    for (const t of tables) {
      if (!seen.has(t)) out.push(t);
    }
  }

  return out;
}

async function main() {
  const fullPath = path.isAbsolute(backupPath)
    ? backupPath
    : path.join(process.cwd(), backupPath);

  const dump = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  const tables = Object.keys(dump.tables || {});
  if (tables.length === 0) {
    console.error('❌ No tables found in backup');
    process.exit(1);
  }

  const ssl = DATABASE_URL.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined;

  const pool = new Pool({ connectionString: DATABASE_URL, ssl });

  try {
    // Read FK dependencies to restore in parent->child order
    const fkRes = await pool.query(
      `
      select
        ccu.table_name as parent,
        kcu.table_name as child
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
       and tc.table_schema = kcu.table_schema
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name
       and ccu.table_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_schema = 'public'
      `
    );

    const orderedTables = topoSortTables(
      tables,
      fkRes.rows.map(r => ({ parent: r.parent, child: r.child }))
    );

    console.warn(
      '⚠️  RESTORE WILL OVERWRITE CURRENT DATA (TRUNCATE ... CASCADE). Proceeding...'
    );

    await pool.query('begin');

    // TRUNCATE all backed up tables
    const truncateSql = `truncate ${orderedTables
      .map(t => `"${t}"`)
      .join(', ')} restart identity cascade`;
    await pool.query(truncateSql);

    // Insert data
    for (const table of orderedTables) {
      const entry = dump.tables[table];
      if (!entry || !Array.isArray(entry.rows) || entry.rows.length === 0) {
        continue;
      }

      const cols = entry.columns;
      const rows = entry.rows;

      // batch inserts to avoid huge queries
      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const chunk = rows.slice(i, i + batchSize);
        const values = [];
        const placeholders = [];

        let p = 1;
        for (const row of chunk) {
          const ph = [];
          for (const col of cols) {
            values.push(row[col]);
            ph.push(`$${p++}`);
          }
          placeholders.push(`(${ph.join(',')})`);
        }

        const sql = `insert into "${table}" (${cols
          .map(c => `"${c}"`)
          .join(',')}) values ${placeholders.join(',')}`;
        await pool.query(sql, values);
      }

      console.log(`✅ Restored ${table} (${rows.length} rows)`);
    }

    await pool.query('commit');
    console.log('🎉 Restore completed');
  } catch (err) {
    try {
      await pool.query('rollback');
    } catch {
      // ignore
    }
    console.error('❌ Restore failed:', err?.message || err);
    process.exit(2);
  } finally {
    await pool.end();
  }
}

main();
