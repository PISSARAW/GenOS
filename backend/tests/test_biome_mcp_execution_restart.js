'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const biome = require('../src/services/biomeCoordinationService');
const tools = require('../src/services/topologySessionTools');
const registry = require('../src/services/biome/runtime/executionAdapterRegistry');

async function main() {
  const filename = path.join(os.tmpdir(), `genos-biome-execution-${process.pid}-${Date.now()}.db`);
  let db = await open({ filename, driver: sqlite3.Database });
  let calls = 0;
  const unregister = registry.registerProvider('biome-local-test', {
    authorize: async ({ request }) => request.capability === 'calculate',
    execute: async request => { calls += 1; return { output: request.input.value * 2, consumed: { tokens: 2 } }; },
    verify: async proof => ({ sessionId: proof.sessionId, executionId: proof.executionId,
      outputDigest: proof.outputDigest, verified: proof.output === 4, evidenceRefs: ['test:double'] })
  });
  try {
    const runtime = await biome.BiomeRuntime.create('MCP authorized execution', { db, variant: 'resource', maxTicks: 5,
      environment: { opportunities: [{ id: 'compute', descriptor: 'Compute',
        opportunityScore: 1, evidenceRefs: ['test:task'], requiredCapabilities: ['calculate'],
        resourceProfile: { tokens: { minimum: 1, preferred: 20, maximum: 100 } } }] } });
    await runtime.step({ totalBudget: 100, resources: { tokens: 100 },
      individuals: [{ individualId: 'worker', capabilities: ['calculate'] }] });
    const request = { executionId: 'durable-execution', populationId: 'population:niche-compute',
      individualId: 'worker', providerId: 'biome-local-test', capability: 'calculate',
      input: { value: 2 }, resources: { tokens: 5 } };
    const cycle = await tools.applyTopologyOperation(db, { session_id: runtime.sessionId,
      operation: 'cycle', expected_revision: 1, variant_input: { executions: [request] } });
    assert.equal(cycle.executions[0].execution.status, 'verified');
    assert.equal(cycle.measurements.resources.budgetUsed, 2);
    assert.equal(cycle.tick, 2);
    assert.equal(cycle.cycleRevision, 2);
    assert.equal(cycle.revision, 4);
    assert.equal(calls, 1);
    const before = await biome.sessionSnapshot(runtime.sessionId, { db });
    await assert.rejects(() => tools.applyTopologyOperation(db, { session_id: runtime.sessionId,
      operation: 'cycle', expected_revision: 0, variant_input: { executions: [request] } }), { code: 'BIOME_SESSION_CONFLICT' });
    assert.deepEqual(await biome.sessionSnapshot(runtime.sessionId, { db }), before);
    await db.close();
    db = await open({ filename, driver: sqlite3.Database });
    const replayed = await biome.executeSessionWork(runtime.sessionId, request, { db });
    assert.equal(replayed.status, 'verified');
    assert.equal(calls, 1);
    const restored = await biome.BiomeRuntime.restore(runtime.sessionId, 'resource', db);
    assert.equal(restored.state.budgetUsed, 2);
    assert.equal(restored.ecology.archive[0].artifact, 4);
    console.log('Biome MCP executes authorized work; SQLite receipts prevent execution replay: PASS');
  } finally {
    unregister();
    await db.close();
    await fs.rm(filename, { force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
