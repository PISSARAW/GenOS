const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fundamentals = require('../src/services/primitiveHandlers/fundamentals');

async function main() {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/primitiveHandlers/fundamentals/index.js'), 'utf8');
  assert.equal(source.includes("status: 'evaluation_failed'"), true);
  assert.equal(source.includes("brierScore: 0.15, note"), false);
  const bisect = await fundamentals.bisectAgent({ workspaceId: 'missing', snapshotHistory: [] });
  assert.equal(bisect.success, false);
}

main().then(() => console.log('Evaluation failures remain failures.'));
