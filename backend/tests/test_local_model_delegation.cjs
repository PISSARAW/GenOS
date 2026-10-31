'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'local-delegation-test-secret-32-bytes';
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const kinds = require('../src/services/agents/workerKindService');
const plans = require('../src/services/localModelDelegation');
const { getDatabase, closeDatabase } = require('../src/db');

async function dispatch(db, workspace) {
  const saved = await require('../src/services/missionEnvelopeAuthority').read(db,
    (await db.get("SELECT id FROM strategy_execution_runs WHERE agent_id='delegation-sub' ORDER BY rowid DESC LIMIT 1")).id);
  const scope = await require('../src/services/missionModelBudgetScope').bindTeamScope({ db,
    teamRunId: 'root-model-run', orchestratorAgentId: 'delegation-root', budget: { costUsd: 1, tokens: 20000 } });
  const mission = { agentId: 'delegation-sub', missionId: 'delegation-mission', workspaceRoot: workspace,
    toolLease: ['genos_delegate_worker'], timeoutMs: 60000, localModel: 'ollama://test-qwen',
    modelBudgetScope: scope, executionBudget: { costUsd: 1, tokens: 10000 },
    executionAuthorityRef: { hash: saved.hash, eventHash: saved.eventHash, signature: saved.signature } };
  const provider = require('../src/services/modelProvider');
  const discovery = require('../src/services/localModelDiscovery');
  const originalDiscovery = discovery.discoverLocalModels;
  discovery.discoverLocalModels = async () => [{ uri: 'ollama://test-qwen', chatCapable: true }];
  const original = provider.generate;
  let calls = 0;
  provider.generate = async options => { calls++; if (calls === 3) assert.match(options.prompt, /BOUND SIBLING DEPENDENCY/); return { text: JSON.stringify({ outcome: 'success',
    claims: [{ statement: 'Fixture observed.', evidence: ['mission'] }], uncertainties: [],
    scopeCompletion: { scopeRef: 'mission', completedRefs: ['mission'] } }),
    inputTokens: 20, outputTokens: 30, tokenUsageMeasured: true }; };
  try {
    const result = await require('../src/services/agents/subOrchestratorDispatchService').dispatchLocalModelChild(db,
      { mission, executionRun: { id: saved.envelope.runId } },
      { workerKind: 'bounded_worker', mission: 'Observe the supplied fixture and cite mission.', modelTokens: 3000, mode: 'analysis' });
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(calls, 1);
    const child = await db.get('SELECT parent_agent_id FROM agents WHERE id=?', result.childAgentId);
    assert.equal(child.parent_agent_id, 'delegation-sub');
    const runs = await db.all('SELECT id,status FROM strategy_execution_runs WHERE agent_id=?', result.childAgentId);
    assert.equal(runs.at(-1).status, 'completed');
    const reservations = await db.all("SELECT scope_id,actual_tokens FROM model_budget_reservations WHERE status='settled'");
    assert.equal(reservations.length, 1);
    assert.match(reservations[0].scope_id, /root-model-run/);
    assert.equal(reservations[0].actual_tokens, 50);
    await assert.rejects(() => require('../src/services/missionModelBudgetScope').routeBudget({ ...mission,
      agentId: 'delegation-root', orchestratorAgentId: 'delegation-sub' }, db));
    await assert.rejects(() => require('../src/services/missionModelBudgetScope').routeBudget({ ...mission,
      agentId: result.childAgentId, orchestratorAgentId: 'delegation-sub', missionId: 'other-mission' }, db));
    const metadata = JSON.parse((await db.get("SELECT metadata_json FROM agents WHERE id='delegation-sub'")).metadata_json);
    let generations = 0;
    const composed = await plans.generate({ db, mission: { ...mission, workerKind: 'sub_orchestrator',
      workerContract: metadata.workerContract }, executionRun: { id: saved.envelope.runId },
      promptText: 'Observe the fixture through a child.', maxTokens: 4000 }, async context => {
      generations++;
      if (generations === 1) return { text: JSON.stringify({ children: [{ workerKind: 'bounded_worker',
        mission: 'Observe fixture and cite mission.', modelTokens: 3000, mode: 'analysis', dependsOn: -1 },
        { workerKind: 'bounded_worker', mission: 'Use the predecessor report.', modelTokens: 4000, mode: 'analysis', dependsOn: 0 }] }),
      inputTokens: 20, outputTokens: 30, costUsd: 0 };
      assert.match(context.promptText, /genos:\/\/worker-receipt\//);
      assert.match(context.promptText, /verified.*false/);
      return { text: '{"outcome":"unresolved"}', inputTokens: 30, outputTokens: 40, costUsd: 0 };
    });
    assert.equal(generations, 2);
    assert.equal(calls, 3);
    assert.equal(composed.inputTokens + composed.outputTokens, 120);
  } finally { provider.generate = original; discovery.discoverLocalModels = originalDiscovery; }
}

function planBounds() {
  const contract = kinds.grantBoundedDelegation(kinds.buildWorkerContract('sub_orchestrator', { workerTokenLimit: 10000 }));
  const child = { workerKind: 'bounded_worker', mission: 'Observe', modelTokens: 4000, mode: 'analysis', dependsOn: -1 };
  assert.equal(plans.checkPlan({ children: [child] }, contract).length, 1);
  assert.throws(() => plans.checkPlan({ children: [{ ...child, workerKind: 'sub_orchestrator' }] }, contract));
  assert.throws(() => plans.checkPlan({ children: [{ ...child, modelTokens: 10001 }] }, contract));
  assert.throws(() => plans.checkPlan({ children: [{ ...child, dependsOn: 0 }] }, contract));
  const disabled = kinds.grantBoundedDelegation(kinds.buildWorkerContract('sub_orchestrator', { workerTokenLimit: 10000 }), 0);
  assert.equal(disabled.spawnBudget, 0);
  assert.equal(plans.enabled({ workerKind: 'sub_orchestrator', workerContract: disabled }), false);
}

async function main() {
  planBounds();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-model-delegation-'));
  const workspace = path.join(root, 'workspace'); await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'fixture.txt'), 'Observed fixture');
  process.env.GENOS_DB_PATH = path.join(root, 'test.db'); process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  process.env.GENOS_CAPSULE_ROOT = path.join(root, 'capsules'); process.env.GENOS_WORKSPACES_ROOT = root;
  const db = await getDatabase();
  try { await require('./test_bounded_worker_delegation').seed(db, workspace); await dispatch(db, workspace); }
  finally { await require('../src/services/garageRuntimeService').stop(db); await require('./helpers/flushTelemetrySideEffects').flushTelemetrySideEffects(); await closeDatabase(); }
  console.log('Local-model delegation persists children and shares root budget: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
