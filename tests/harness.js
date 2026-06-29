// Tiny zero-dependency test harness. Node's built-in `node:test` isn't
// available on the Node 16 baseline this project targets, so we roll our own:
// collect tests, run them, print a summary, exit non-zero on any failure.
'use strict';
const assert = require('assert');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function run() {
  let passed = 0;
  const failures = [];
  for (const t of tests) {
    try {
      t.fn();
      passed++;
      console.log(`  ✓ ${t.name}`);
    } catch (err) {
      failures.push({ name: t.name, err });
      console.log(`  ✗ ${t.name}`);
    }
  }
  console.log('');
  for (const f of failures) {
    console.log(`FAILED: ${f.name}`);
    console.log(`  ${f.err && f.err.message ? f.err.message : f.err}`);
  }
  console.log(`\n${passed}/${tests.length} passed`);
  if (failures.length) process.exit(1);
}

module.exports = { test, run, assert };
