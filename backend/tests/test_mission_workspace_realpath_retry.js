'use strict';

const assert = require('node:assert/strict');
const authority = require('../src/services/missionEnvelopeAuthority');

async function run() {
  let attempts = 0;
  const resolved = await authority.realWorkspaceRoot('workspace', async (root) => {
    attempts += 1;
    if (attempts < 3) throw Object.assign(new Error('transient lock'), { code: 'EPERM' });
    return `resolved:${root}`;
  });
  assert.equal(resolved, 'resolved:workspace');
  assert.equal(attempts, 3);
  await assert.rejects(() => authority.realWorkspaceRoot('missing', async () => {
    throw Object.assign(new Error('missing'), { code: 'ENOENT' });
  }), { code: 'ENOENT' });
  console.log('Mission workspace realpath retry checks passed.');
}

run().catch((failure) => { console.error(failure); process.exitCode = 1; });
