'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, closeFixture } = require('./helpers/daemonCompletionFixture');
const cycle = require('../src/services/daemon/residentDaemonCycleService');
const bridge = require('../src/services/daemon/daemonEventBridgeService');

async function main() {
  const value = await fixture();
  try {
    await cycle.runCycle(value.context);
    const hash = () => value.db.get("SELECT hash FROM territory_graph_nodes WHERE territory_id = ? AND path = 'probe.js' AND kind = 'file'", value.context.territoryId);
    const before = await hash();
    fs.writeFileSync(path.join(value.root, 'probe.js'), 'module.exports = 7;\n');
    const result = await bridge.ingestEvent(bridge.createBridge({ db: value.db }), {
      type: 'TERRITORY_FILE_CHANGED', territoryId: value.context.territoryId, payload: { files: ['probe.js'] } });
    assert.equal(result.cheapUpdate.applied, true);
    assert.notEqual((await hash()).hash, before.hash);
    const unknown = await bridge.ingestEvent(bridge.createBridge({ db: value.db }), {
      type: 'TERRITORY_FILE_CHANGED', territoryId: value.context.territoryId });
    assert.equal(unknown.cheapUpdate.applied, false);
    const territory = await value.db.get('SELECT state, indexed_head_sha FROM daemon_territories WHERE id = ?', value.context.territoryId);
    assert.equal(territory.state, 'STALE');
    assert.equal(territory.indexed_head_sha, null);
  } finally { await closeFixture(value); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
