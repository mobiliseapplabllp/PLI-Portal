/**
 * Diagnostic: check for orphaned MySQL temp tables from failed ALTER TABLE,
 * and show row counts for every table in the database.
 *
 * Usage: node scripts/check-temp-tables.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
  const db = process.env.MYSQL_DATABASE;
  const conn = await mysql.createConnection({
    host:     process.env.MYSQL_HOST     || '127.0.0.1',
    port:     Number(process.env.MYSQL_PORT || 3306),
    user:     process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: db,
  });

  console.log('\n=========================================');
  console.log(' DATABASE:', db, '@', process.env.MYSQL_HOST);
  console.log('=========================================');

  // ── 1. All tables (information_schema knows about #sql temp tables) ──────────
  const [tables] = await conn.query(
    'SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH, CREATE_TIME ' +
    'FROM information_schema.TABLES ' +
    'WHERE TABLE_SCHEMA = ? ' +
    'ORDER BY TABLE_NAME',
    [db]
  );

  console.log('\n--- ALL TABLES IN SCHEMA ---');
  const orphans = [];
  tables.forEach(t => {
    const name = t.TABLE_NAME;
    // MySQL names orphaned ALTER TABLE temp files as #sql-XXXX_XX
    const isOrphan = name.includes('#sql') || name.startsWith('#');
    if (isOrphan) orphans.push(t);
    const tag = isOrphan ? '  <-- ORPHANED TEMP (failed ALTER)' : '';
    console.log('  ' + name.padEnd(48) + 'rows=' + String(t.TABLE_ROWS || 0).padStart(7) + tag);
  });

  // ── 2. Orphan summary ────────────────────────────────────────────────────────
  console.log('\n--- ORPHANED ALTER TABLE TEMP FILES ---');
  if (orphans.length === 0) {
    console.log('  None found. No failed ALTER TABLE operations detected.');
  } else {
    console.log('  FOUND ' + orphans.length + ' orphan(s):');
    orphans.forEach(t => {
      console.log('  !! ' + t.TABLE_NAME + '  (created: ' + t.CREATE_TIME + ')');
      console.log('     To remove: DROP TABLE `' + t.TABLE_NAME + '`;');
    });
  }

  // ── 3. Exact row counts (COUNT(*) is accurate, TABLE_ROWS is estimate) ───────
  console.log('\n--- EXACT ROW COUNTS ---');
  const realTables = tables.filter(t => !t.TABLE_NAME.includes('#'));
  for (const t of realTables) {
    try {
      const [[row]] = await conn.query('SELECT COUNT(*) AS c FROM `' + t.TABLE_NAME + '`');
      const warn = row.c === 0 ? '  <-- EMPTY' : '';
      console.log('  ' + t.TABLE_NAME.padEnd(48) + String(row.c).padStart(7) + ' rows' + warn);
    } catch (e) {
      console.log('  ' + t.TABLE_NAME.padEnd(48) + ' ERROR: ' + e.message);
    }
  }

  // ── 4. Check InnoDB status for any active/recent ALTER operations ─────────────
  console.log('\n--- INNODB ENGINE STATUS (last ~1000 chars) ---');
  try {
    const [[status]] = await conn.query("SHOW ENGINE INNODB STATUS");
    const text = status['Status'] || '';
    // Print last section which shows recent operations
    const lines = text.split('\n');
    const relevant = lines.filter(l =>
      l.includes('ALTER') || l.includes('TRANSACTION') || l.includes('LOCK') ||
      l.includes('ROW OPERATIONS') || l.includes('FILE I/O')
    );
    if (relevant.length > 0) {
      relevant.slice(0, 20).forEach(l => console.log('  ' + l));
    } else {
      console.log('  No ALTER/LOCK activity found in InnoDB status.');
    }
  } catch (e) {
    console.log('  Could not read InnoDB status:', e.message);
  }

  // ── 5. Check MySQL data directory for .frm / .ibd orphan files ──────────────
  console.log('\n--- MYSQL VARIABLES (data directory location) ---');
  try {
    const [[row]] = await conn.query("SHOW VARIABLES LIKE 'datadir'");
    console.log('  datadir =', row.Value);
    console.log('  Check this folder for files named  #sql*.ibd  — those are orphaned temp files.');
    console.log('  They can be removed safely if the table appears in the orphan list above.');
  } catch (e) {
    console.log('  ' + e.message);
  }

  console.log('\n=========================================\n');
  await conn.end();
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
