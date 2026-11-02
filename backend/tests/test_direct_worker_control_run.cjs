'use strict';

const assert = require('node:assert/strict');
const fixture = require('./helpers/realWorkerFixture.cjs');
const control = require('../bin/directWorkerControlRun.cjs');

async function main() {
  const value = await fixture.fixture({ 'input.txt': 'Compute a witnessed subset sum.' });
  try {
    const output = await fixture.dispatch(value, { payload: { methodContract: {
      version: 1, methodId: 'scoped_procedure', parameters: { procedure: {
        version: 1, methodId: 'subset_sum', parameters: { values: [2, 3, 7], target: 5 }
      } }
    } } });
    assert.equal(output.code, 0, output.stdout + output.stderr);
    const parent = await value.db.get(`SELECT * FROM strategy_execution_runs
      WHERE agent_id='mcp_orchestrator_real_test' ORDER BY rowid DESC LIMIT 1`);
    assert.ok(parent); assert.equal(parent.status, 'cancelled');
    assert.match(parent.guardrail_reason, /no parent decision asserted/);
    const binding = await require('../src/services/missionProtocols/context').load(value.db, parent.id);
    assert.equal(binding.mission.protocolProfile, 'direct-worker-control');
    const sealed = await require('../src/services/missionEnvelopeAuthority').read(value.db, parent.id);
    assert.equal(sealed.envelope.missionId, binding.missionId);
    assert.equal(sealed.envelope.identity.agentId, parent.agent_id);
    assert.equal(sealed.envelope.identity.workspaceId, 'proof-ws');
    assert.deepEqual(sealed.envelope.limits, JSON.parse(parent.budget_json));
    const child = await value.db.get('SELECT run_id FROM biological_worker_bindings ORDER BY rowid DESC LIMIT 1');
    const receipt = await require('../src/services/biologicalWorkerStore').receipt(value.db, child.run_id);
    assert.equal(receipt.semanticVerification.accepted, true);
    const count = (await value.db.get('SELECT COUNT(*) count FROM strategy_execution_runs')).count;
    await assert.rejects(control.prepare({ db: value.db, context: { missionId: binding.missionId },
      parent: { id: 'foreign-parent' }, mission: {}, contractRecord: {}, budget: {} }),
    { code: 'DIRECT_WORKER_CONTROL_SCOPE_REQUIRED' });
    assert.equal((await value.db.get('SELECT COUNT(*) count FROM strategy_execution_runs')).count, count);
    console.log('Direct CLI worker: genuine parent control run, signed scope/budget, independent child proof, no parent promotion and foreign-parent refusal passed.');
  } finally { await fixture.close(value); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
