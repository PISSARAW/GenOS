'use strict';
const assert = require('node:assert/strict');
const { fixture, closeFixture } = require('./helpers/daemonCompletionFixture');
const findings = require('../src/services/daemon/findings/findingService');
const repair = require('../src/services/daemon/repair/repairEpisodeService');
const lifecycle = require('../src/services/daemon/findings/findingLifecycleService');

async function main() {
  const value = await fixture();
  try {
    const created = await findings.createFinding(value.db, { id: 'finding.unproved',
      territoryId: value.context.territoryId, claim: 'A candidate without evidence cannot trigger repair',
      scope: { type: 'file', value: 'probe.js' }, headSha: 'a'.repeat(40),
      createdBy: value.context.daemonId, status: 'HYPOTHESIZED', limitations: ['unproved candidate'] });
    assert.equal(created.found, true);
    const denied = await findings.transitionFinding(value.db, { id: created.finding.id, toStatus: 'SUPPORTED' });
    assert.equal(denied.transitioned, false);
    assert.equal((await repair.openEpisode(value.db, { findingId: created.finding.id, createdBy: value.context.daemonId })).opened, false);
    assert.equal((await repair.listEpisodes(value.db, { territoryId: value.context.territoryId })).length, 0);
    assert.equal(await lifecycle.onPostTransition(value.db, created.finding, 'SUPPORTED'), null);
    assert.ok(require('../bin/genos-daemon.cjs').main);
    console.log('Daemon integration rejects repair without persisted evidence.');
  } finally { await closeFixture(value); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
