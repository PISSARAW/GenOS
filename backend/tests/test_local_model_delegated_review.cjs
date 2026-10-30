'use strict';
process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'model-review-test-secret-at-least-32-bytes';
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../src/db');

async function execute(db, workspace) {
  const authority = require('../src/services/missionEnvelopeAuthority');
  const run = await db.get("SELECT id FROM strategy_execution_runs WHERE agent_id='delegation-sub' ORDER BY rowid DESC LIMIT 1");
  const saved = await authority.read(db, run.id);
  const scope = await require('../src/services/missionModelBudgetScope').bindTeamScope({ db,
    teamRunId: 'root-code-review', orchestratorAgentId: 'delegation-root', budget: { tokens: 30000, costUsd: 1 } });
  const metadata = JSON.parse((await db.get("SELECT metadata_json FROM agents WHERE id='delegation-sub'")).metadata_json);
  const mission = { agentId: 'delegation-sub', missionId: 'delegation-mission', workspaceRoot: workspace,
    toolLease: ['genos_delegate_worker'], workerKind: 'sub_orchestrator', workerContract: metadata.workerContract,
    timeoutMs: 120000, localModel: 'ollama://test-qwen', modelBudgetScope: scope,
    executionBudget: { tokens: 10000, costUsd: 1 },
    executionPolicy: { allowFileEdits: true, allowedWritePaths: ['parser.py'], allowedCommands: ['pytest'] },
    executionAuthorityRef: { hash: saved.hash, eventHash: saved.eventHash, signature: saved.signature } };
  const provider = require('../src/services/modelProvider');
  const discovery = require('../src/services/localModelDiscovery');
  const originals = { generate: provider.generate, discovery: discovery.discoverLocalModels };
  let calls = 0;
  provider.generate = async () => {
    const code = calls++ === 0;
    const patches = code ? [{ path: 'parser.py', content: 'def parse(lines):\n    return [int(x) for x in lines if x.strip()]\n' }] : [];
    return { text: JSON.stringify({ format: code ? 'genos.file-replacement/v1' : 'genos.test-only/v1', patches, tests: ['pytest'], evidence: 'mission' }), inputTokens: 20, outputTokens: 30, tokenUsageMeasured: true };
  };
  discovery.discoverLocalModels = async () => [{ uri: 'ollama://test-qwen', chatCapable: true }];
  let observed;
  try {
    await require('../src/services/localModelDelegation').generate({ db, mission, executionRun: run,
      promptText: 'Correct parser then independently test its candidate.', maxTokens: 4000 }, async ctx => {
      if (ctx.responseFormatOverride) return { text: JSON.stringify({ children: [
        { workerKind: 'bounded_worker', mission: 'Fix parser.py and run pytest.', mode: 'code', modelTokens: 4000, dependsOn: -1 },
        { workerKind: 'verifier_worker', mission: 'Review candidate and run pytest without edits.', mode: 'review', modelTokens: 4000, dependsOn: 0 }
      ] }), inputTokens: 20, outputTokens: 30, costUsd: 0 };
      observed = JSON.parse(ctx.promptText.split('PERSISTED CHILD EXECUTIONS:\n')[1].split('\nOnly these children ran.')[0]);
      return { text: '{"outcome":"unresolved","claims":[],"uncertainties":["No semantic oracle"]}', inputTokens: 20, outputTokens: 30, costUsd: 0 };
    });
    assert.equal(calls, 2);
    assert.equal(observed.length, 2);
    assert.deepEqual(observed.map(child => child.status), ['completed', 'completed'], JSON.stringify(observed));
    const rows = await db.all('SELECT agent_id,execution_run_id,receipt_json FROM local_code_test_execution_receipts ORDER BY rowid');
    assert.equal(rows.length, 2);
    assert.notEqual(rows[0].agent_id, rows[1].agent_id);
    assert.notEqual(rows[0].execution_run_id, rows[1].execution_run_id);
    assert.equal(JSON.parse(rows[1].receipt_json).changedFileHashes.length, 0);
    assert.equal(await fs.readFile(path.join(workspace, 'parser.py'), 'utf8'), 'def parse(lines):\n    return [int(x or 0) for x in lines]\n');
    const snapshot = require('../src/services/agents/delegatedWorkspaceSnapshot');
    const reviewRoot = await db.get('SELECT path FROM workspaces WHERE id=(SELECT workspace_id FROM agents WHERE id=?)', observed[1].childId);
    const input = { parentId: 'delegation-sub', missionId: 'delegation-mission', sourceChildId: observed[0].childId,
      childId: observed[1].childId, targetRoot: reviewRoot.path, allowedWritePaths: ['parser.py'] };
    await assert.rejects(() => snapshot.materialize(db, { ...input, parentId: 'delegation-root' }), { code: 'DELEGATION_REVIEW_SNAPSHOT_INVALID' });
    await assert.rejects(() => snapshot.materialize(db, { ...input, missionId: 'other-mission' }), { code: 'DELEGATION_REVIEW_SNAPSHOT_INVALID' });
    const sourceRoot = await db.get('SELECT path FROM workspaces WHERE id=(SELECT workspace_id FROM agents WHERE id=?)', observed[0].childId);
    await fs.appendFile(path.join(sourceRoot.path, 'parser.py'), '# changed after receipt\n');
    await assert.rejects(() => snapshot.materialize(db, input), { code: 'DELEGATION_REVIEW_SNAPSHOT_INVALID' });
  } finally { provider.generate = originals.generate; discovery.discoverLocalModels = originals.discovery; }
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-delegated-review-'));
  const workspace = path.join(root, 'workspace'); await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'parser.py'), 'def parse(lines):\n    return [int(x or 0) for x in lines]\n');
  await fs.writeFile(path.join(workspace, 'test_parser.py'), "from parser import parse\ndef test_missing():\n    assert parse(['10','','20']) == [10,20]\n");
  process.env.GENOS_DB_PATH = path.join(root, 'test.db'); process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  process.env.GENOS_CAPSULE_ROOT = path.join(root, 'capsules'); process.env.GENOS_WORKSPACES_ROOT = root;
  const db = await getDatabase();
  try { await require('./test_bounded_worker_delegation').seed(db, workspace); await execute(db, workspace); }
  finally { await require('../src/services/garageRuntimeService').stop(db); await require('./helpers/flushTelemetrySideEffects').flushTelemetrySideEffects(); await closeDatabase(); }
  console.log('Qwen-dispatched code candidate and independent test-only reviewer use separate receipts: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
