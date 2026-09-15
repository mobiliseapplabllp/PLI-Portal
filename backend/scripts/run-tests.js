#!/usr/bin/env node
/**
 * Sequential test runner.
 *
 * Node 18's `node --test` runs test FILES concurrently and has no
 * --test-concurrency flag. Our DB tests pick "free" users and insert
 * allocations, so concurrent files race each other (a user free when file A
 * looked is busy by the time file B asserts). Running files one at a time
 * removes the race without changing any test.
 *
 *   node scripts/run-tests.js            # all files in test/
 *   node scripts/run-tests.js alloc      # only files whose name contains "alloc"
 */
const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const testDir = path.join(__dirname, '..', 'test');
const filter  = process.argv[2] || '';
const files = fs.readdirSync(testDir)
  .filter(f => f.endsWith('.test.js') && f.includes(filter))
  .sort();   // zz_residue.test.js naturally runs last

if (!files.length) { console.error('No test files matched.'); process.exit(1); }

let pass = 0, fail = 0;
const failed = [];
const started = Date.now();

for (const f of files) {
  const t0 = Date.now();
  process.stdout.write(`\n▶ ${f}\n`);
  const r = spawnSync(process.execPath, ['--test', path.join(testDir, f)], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    env: process.env,
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.status === 0) { pass++; console.log(`  ✓ ${f} (${secs}s)`); }
  else { fail++; failed.push(f); console.log(`  ✗ ${f} (${secs}s) exit ${r.status}`); }
}

console.log(`\n═══ ${pass} passed · ${fail} failed · ${files.length} files · ${((Date.now() - started) / 1000).toFixed(1)}s`);
if (failed.length) { console.log('Failed: ' + failed.join(', ')); process.exit(1); }
