/**
 * Residue guard: after the suite, no `__TEST__` rows may remain in any table
 * the tests write to.
 *
 * `node --test` (Node 18) runs files concurrently, so "runs last" cannot be
 * guaranteed by name. This test therefore waits for the other files to get
 * going, then polls until it observes zero residue on two consecutive reads.
 * A leak from THIS run clears as soon as its file finishes cleanup; a leak from
 * a PREVIOUS run never clears and fails the test after the deadline.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_helpers');

const INITIAL_WAIT_MS = 8000;    // let concurrently-started DB tests insert their rows first
const POLL_MS         = 2000;
const DEADLINE_MS     = 180000;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

test('no __TEST__ rows remain after the suite', async () => {
  try {
    await sleep(INITIAL_WAIT_MS);
    const started = Date.now();
    let zeroStreak = 0, last;
    while (Date.now() - started < DEADLINE_MS) {
      last = await H.countTestRows();
      zeroStreak = last.total === 0 ? zeroStreak + 1 : 0;
      if (zeroStreak >= 2) break;
      await sleep(POLL_MS);
    }
    assert.equal(last.total, 0, `__TEST__ residue left in the DB: ${JSON.stringify(last)}`);
  } finally {
    await H.closeDb();
  }
});
