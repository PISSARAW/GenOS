'use strict';

const assert = require('node:assert/strict');
const heartbeat = require('../src/services/identity/leaseHeartbeat');

async function run() {
  let renewals = 0;
  const active = heartbeat.start({ intervalMs: 25, renew: async () => { renewals += 1; } });
  await active.pulse();
  await new Promise(resolve => setTimeout(resolve, 70));
  await active.stop();
  active.assertHealthy();
  assert.ok(renewals >= 2, `expected repeated lease renewal, got ${renewals}`);

  const failure = Object.assign(new Error('identity lease was fenced'), { code: 'IDENTITY_SESSION_STALE' });
  const stale = heartbeat.start({ renew: async () => { throw failure; } });
  await stale.pulse();
  assert.throws(() => stale.assertHealthy(), { code: 'IDENTITY_SESSION_STALE' });
  await stale.stop();
  console.log('Identity lease heartbeat renews while work is pending and fails closed on a fenced session.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
