'use strict';
process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'dossier-transport-test-secret-at-least-32';
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../src/db');
const transport = require('../src/services/workerDossierHandoffService');

async function worker(db, input) {
  const record = await require('../src/services/strategyContractService').getLatestContract(db, 'delegation-root');
  const mission = { prompt: input.prompt, missionId: 'delegation-mission', workspaceRoot: input.workspace,
    executor: 'local', localRuntime: true, localModel: 'ollama://handoff-test', modelBudgetScope: input.scope,
    executionBudget: { tokens: 4000, costUsd: 1, latencyMs: 60000 }, timeoutMs: 60000,
    executionPolicy: { allowFileEdits: false } };
  const [created] = await require('../src/services/agentFleetWorkers').createAutonomousWorkers(db,
    { id: 'delegation-root', agent_type: 'GenOS' }, { mission,
      plan: { dispatchWorkers: [{ workerKind: 'bounded_worker', role: 'bounded_worker', label: input.label }],
        strategyContract: { primary: record.contract.selected_strategy.primary },
        tokenPolicy: { total: 4000, workerShare: 1, orchestratorReserve: 0 } } });
  await require('../src/services/missionIdentityService').attachAgent(db, {
    missionId: mission.missionId, agentId: created.agentId, role: created.role });
  return { ...mission, agentId: created.agentId, role: created.role, workerKind: created.workerKind,
    workspaceRoot: created.workspaceRoot, workspaceId: created.workspaceId,
    workspaceProvisioned: true, orchestratorAgentId: 'delegation-root', toolLease: created.toolLease || [] };
}

async function preparedReceiver(db, input) {
  const mission = await worker(db, { ...input, label: 'receiver', prompt: 'Receive a dossier as data.' });
  const record = await require('../src/services/strategyContractService').getLatestContract(db, 'delegation-root');
  const executionRun = await require('../src/services/strategyExecutionService').createExecutionRun(db,
    { agentId: mission.agentId, missionId: mission.missionId, contractRecord: record,
      budget: { tokens: 4000, costUsd: 1, latencyMs: 60000, events: 100 } });
  await require('../src/services/missionEnvelopeAuthority').seal({ db, agentId: mission.agentId,
    normalizedMission: mission, executionRun, contractRecord: record, autonomyPlan: {}, executable: process.execPath });
  return { mission, executionRun };
}

async function scenario(db, workspace) {
  const scope = await require('../src/services/missionModelBudgetScope').bindTeamScope({ db,
    teamRunId: 'dossier-test-budget', orchestratorAgentId: 'delegation-root', budget: { tokens: 20000, costUsd: 1 } });
  const sourceMission = await worker(db, { workspace, scope, label: 'producer', prompt: 'Observe fixture and cite mission.' });
  const provider = require('../src/services/modelProvider');
  const discovery = require('../src/services/localModelDiscovery');
  const originals = { generate: provider.generate, discovery: discovery.discoverLocalModels };
  discovery.discoverLocalModels = async () => [{ uri: 'ollama://handoff-test', chatCapable: true }];
  provider.generate = async () => ({ text: JSON.stringify({ outcome: 'success',
    claims: [{ statement: 'The fixture contains a bounded observation.', evidence: ['mission'] }], uncertainties: [],
    scopeCompletion: { scopeRef: 'mission', completedRefs: ['mission'] } }), inputTokens: 20, outputTokens: 30, tokenUsageMeasured: true });
  let source;
  try { source = await require('../src/services/agentRuntimeAdapter').startMission(sourceMission); }
  finally { provider.generate = originals.generate; discovery.discoverLocalModels = originals.discovery; }
  const sourceRunId = source.executionRun.id;
  const receiver = await preparedReceiver(db, { workspace, scope });
  const delivery = await transport.relay(db, { ...receiver, sourceRunId });
  const admitted = await transport.receive(db, { ...receiver, delivery });
  assert.equal(admitted.receipt.recipientRunId, receiver.executionRun.id);
  assert.equal(admitted.receipt.semanticAccepted, false);
  assert.equal(admitted.receipt.usageAtAdmission.providerCalls, 1);
  const state = await db.get('SELECT state FROM agent_organization_message_receipts WHERE message_id=? AND recipient_agent_id=?', delivery.messageId, receiver.mission.agentId);
  assert.equal(state.state, 'acknowledged');
  const downstream = await worker(db, { workspace, scope, label: 'downstream', prompt: 'Use the delivered dossier.' });
  provider.generate = async options => {
    assert.match(options.prompt, /DELIVERED DOSSIER DATA/);
    assert.match(options.prompt, new RegExp(sourceRunId));
    return { text: JSON.stringify({ outcome: 'success', claims: [{ statement: 'Dossier admitted.', evidence: ['mission'] }],
      uncertainties: [], transportHandoffs: [{ acknowledgment: 'forged-model-ack' }],
      scopeCompletion: { scopeRef: 'mission', completedRefs: ['mission'] } }), inputTokens: 20, outputTokens: 30, tokenUsageMeasured: true };
  };
  discovery.discoverLocalModels = async () => [{ uri: 'ollama://handoff-test', chatCapable: true }];
  let consumed;
  try { consumed = await require('../src/services/agentRuntimeAdapter').startMission({ ...downstream, handoffFromRunIds: [sourceRunId] }); }
  finally { provider.generate = originals.generate; discovery.discoverLocalModels = originals.discovery; }
  const actual = await require('../src/services/workerDossierHandoffValidation').source(db,
    { ...receiver, sourceRunId: consumed.executionRun.id });
  assert.equal(actual.report.transportHandoffs[0].acknowledgment, 'runtime_admission');
  assert.equal(actual.report.transportHandoffs[0].sourceRunId, sourceRunId);
  assert.equal((await transport.usage(db, scope.id)).providerCalls, 2);
  await assert.rejects(() => require('../src/services/workerDossierHandoffValidation').source(db,
    { mission: { ...receiver.mission, missionId: 'wrong-mission' }, sourceRunId }));
  await db.run('UPDATE agents SET parent_agent_id=? WHERE id=?', 'delegation-sub', receiver.mission.agentId);
  await assert.rejects(() => require('../src/services/workerDossierHandoffValidation').source(db, { ...receiver, sourceRunId }));
  await db.run('UPDATE agents SET parent_agent_id=? WHERE id=?', 'delegation-root', receiver.mission.agentId);
  await assert.rejects(() => require('../src/services/workerDossierHandoffValidation').source(db,
    { ...receiver, mission: { ...receiver.mission, modelBudgetScope: { ...scope, tokens: scope.tokens + 1 } }, sourceRunId }));
  const forgedReceiver = await preparedReceiver(db, { workspace, scope });
  const forged = await transport.relay(db, { ...forgedReceiver, sourceRunId });
  const row = await db.get('SELECT payload_json FROM agent_organization_messages WHERE id=?', forged.messageId);
  const payload = JSON.parse(row.payload_json); payload.dossierHandoff.reportHash = '0'.repeat(64);
  await db.run('UPDATE agent_organization_messages SET payload_json=? WHERE id=?', JSON.stringify(payload), forged.messageId);
  await assert.rejects(() => transport.receive(db, { ...forgedReceiver, delivery: forged }));
  const unacked = await db.get('SELECT state FROM agent_organization_message_receipts WHERE message_id=?', forged.messageId);
  assert.notEqual(unacked.state, 'acknowledged');
  const revokedReceiver = await preparedReceiver(db, { workspace, scope });
  const revoked = await transport.relay(db, { ...revokedReceiver, sourceRunId });
  await require('../src/services/missionIdentityService').setStatus(db, 'delegation-mission', 'cancelled');
  await assert.rejects(() => transport.receive(db, { ...revokedReceiver, delivery: revoked }));
  const last = await db.get('SELECT state FROM agent_organization_message_receipts WHERE message_id=?', revoked.messageId);
  assert.notEqual(last.state, 'acknowledged');
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-dossier-transport-'));
  const workspace = path.join(root, 'workspace'); await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'fixture.txt'), 'bounded evidence');
  process.env.GENOS_DB_PATH = path.join(root, 'test.db'); process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  process.env.GENOS_CAPSULE_ROOT = path.join(root, 'capsules'); process.env.GENOS_WORKSPACES_ROOT = root;
  const db = await getDatabase();
  try { await require('./test_bounded_worker_delegation').seed(db, workspace); await scenario(db, workspace); }
  finally { await require('../src/services/garageRuntimeService').stop(db); await require('./helpers/flushTelemetrySideEffects').flushTelemetrySideEffects(); await closeDatabase(); }
  console.log('Dossier relay, recipient admission, tamper and revocation refusal: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
