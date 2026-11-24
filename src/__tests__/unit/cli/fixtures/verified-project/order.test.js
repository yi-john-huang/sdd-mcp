// A real project test file for the verified-evidence e2e flow; run with `node --test order.test.js`.
const test = require('node:test');
const assert = require('node:assert');

test('creates exactly one order', () => {
  assert.strictEqual(require('./order.js'), 1);
});
