'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, closeFixture } = require('./helpers/daemonCompletionFixture');
const cycle = require('../src/services/daemon/residentDaemonCycleService');
const findings = require('../src/services/daemon/findings/findingService');
const verifier = require('../src/services/daemon/verification/verifierService');

async function main() {
  const value = await fixture();
  try {
    fs.writeFileSync(path.join(value.root, 'large.js'), 'x'.repeat(201 * 1024));
    await cycle.runCycle(value.context);
    await findings.createFinding(value.db, { id: 'finding.large-file',
      territoryId: value.context.territoryId, headSha: 'a'.repeat(40),
      claim: 'The large file has an unresolved diagnostic finding',
      scope: { type: 'file', value: 'large.js' }, createdBy: value.context.daemonId,
      limitations: ['fixture'] });
    const result = await verifier.verifyFinding(value.db, {
      findingId: 'finding.large-file', daemonId: value.context.daemonId });
    assert.ok(result.checks.includes('scope-unindexed'));
    assert.notEqual(result.transition, 'EXPIRED');
  } finally {
    await closeFixture(value);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
