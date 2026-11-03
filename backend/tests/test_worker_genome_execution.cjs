'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-genome-execution-'));
process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.GENOS_DB_PATH = path.join(root, 'test.db');
process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'genome-execution-test-only';
process.env.GENOS_AGENT_DNA = '0';
process.env.NODE_ENV = 'test';

const database = require('../src/db');
const expression = require('../src/services/workerGenomeExpression');
const hydration = require('../src/services/workerGenomeHydration');
const { mutate } = require('../src/services/primitiveHandlers/evolutionMutate');
const parentGenes = { role: 'worker', strategy: 'tree-search', tools: ['genos_search_failures', 'genos_snapshot'], temp: 0.2, topP: 0.9 };
let modelBudgetScope;

async function prepare(db) {
  const record = await require('./test_bounded_worker_delegation').seed(db, root);
  await db.run(`INSERT INTO agents (id,name,role,status,execution_mode,parent_agent_id,workspace_id)
    VALUES ('genome-parent','Genome parent','worker','idle','worker','delegation-root','delegation-ws')`);
  const stored = await require('../src/services/agentEvolutionService').recordWorkerLineage(db,
    { agentId: 'genome-parent', workspaceId: 'delegation-ws' }, { genes: parentGenes });
  assert.equal(stored.success, true);
  await db.run("INSERT INTO mission_agents (mission_id,agent_id,role) VALUES ('delegation-mission','genome-parent','worker')");
  const parentRun = await db.get("SELECT id FROM strategy_execution_runs WHERE agent_id='delegation-root' ORDER BY rowid DESC LIMIT 1");
  const context = { db, agentId: 'delegation-root', executionRun: parentRun,
    dispatchedAgent: { execution_mode: 'orchestrator', workspace_id: 'delegation-ws' },
    normalizedMission: { executionBudget: { costUsd: 1, tokens: 100000 } },
    normalizedExecutionBudget: { costUsd: 1, tokens: 100000 } };
  await require('../src/services/missionModelBudgetScope').bindParent(context);
  modelBudgetScope = context.normalizedMission.modelBudgetScope;
  return record;
}

function fixtureServer(received) {
  return http.createServer((request, response) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks));
      received.push(body);
      const strategy = body.messages[0].content.includes('invariant-verification') ? 'verify-first' : 'explore-first';
      const content = JSON.stringify({ strategy, sampling: body.options.temperature, nucleus: body.options.top_p });
      response.setHeader('Content-Type', 'application/x-ndjson');
      response.end(JSON.stringify({ model: 'genome-fixture', message: { content }, done: true,
        prompt_eval_count: 100, eval_count: 20 }) + '\n');
    });
  });
}

async function initialize(agentId) {
  return require('../src/services/agentRuntimeAdapter/missionBootstrap').initializeMissionContext({
    agentId, orchestratorAgentId: 'delegation-root', role: 'worker', workerKind: 'bounded_worker',
    executor: 'local', prompt: 'Choose a concrete problem solving procedure.', missionId: 'delegation-mission', modelBudgetScope,
    toolLease: ['genos_search_failures', 'genos_snapshot', 'genos_record_experience'],
    localModel: 'ollama://genome-fixture', executionBudget: { tokens: 10000, costUsd: 0.1, latencyMs: 10000 }
  });
}

async function generate(ctx, record) {
  const mission = ctx.normalizedMission;
  const run = await require('../src/services/strategyExecutionService').createExecutionRun(ctx.db, {
    agentId: ctx.agentId, missionId: 'delegation-mission', contractRecord: record, budget: mission.executionBudget
  });
  mission.workspaceRoot = root;
  mission.timeoutMs = 10000;
  await require('../src/services/agentRuntimeAdapter/missionLease').enforceMissionToolLease(ctx);
  await require('../src/services/missionEnvelopeAuthority').seal({ ...ctx,
    executionRun: run, autonomyPlan: {}, authorityExecutable: process.execPath });
  const altered = { ...mission, genome: { ...mission.genome, temp: 0.99 } };
  await assert.rejects(require('../src/services/missionEnvelopeAuthority').assertRun(ctx.db, {
    agentId: ctx.agentId, runId: run.id, mission: altered
  }), { code: 'EXECUTION_AUTHORITY_CONTEXT_CHANGED' });
  verifySubprocessTransport({ ...ctx, executionRun: run });
  return require('../src/services/workerEvidenceBarrierLocal').generateWorkerResult({
    db: ctx.db, mission, executionRun: run, workerModel: mission.localModel,
    promptText: mission.prompt, maxTokens: 128, latencyMs: 10000, stageTimings: {},
    policy: { primary: mission.localModel, preferLocal: true }
  });
}

function verifySubprocessTransport(ctx) {
  const mission = ctx.normalizedMission;
  const envelope = require('../src/services/agentMissionEnvelopeService').build(ctx,
    { agentId: ctx.agentId, prompt: mission.prompt }, {});
  const encoded = require('../src/services/runtimeProtocol').encodeMission(envelope);
  const child = spawnSync(process.execPath, [path.join(__dirname, 'fixtures/workerGenomeWireProbe.cjs')],
    { input: encoded, timeout: 10000, windowsHide: true });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr.toString());
  const decoded = JSON.parse(child.stdout);
  assert.deepEqual(decoded.genome, mission.genome);
  assert.deepEqual(decoded.sampling, { temperature: mission.genome.temp, topP: mission.genome.topP });
}

async function compareExecutions(db, record, received) {
  const original = JSON.parse((await db.get("SELECT metadata FROM lineage_nodes WHERE id='genome-parent'")).metadata);
  const mutant = await mutate({ agentId: 'genome-parent', mutationRate: 0,
    mutations: ['role=auditor', 'strategy=invariant-verification', 'tools=genos_snapshot,genos_orchestrate', 'temp=0.75', 'topP=0.55'] });
  assert.equal(mutant.success, true, mutant.error);
  await db.run("INSERT INTO mission_agents (mission_id,agent_id,role) VALUES ('delegation-mission',?,'worker')", mutant.mutantId);
  const row = await db.get('SELECT parent_agent_id FROM agents WHERE id=?', mutant.mutantId);
  assert.equal(row.parent_agent_id, 'delegation-root', 'Genetic parentage must not grant worker delegation authority');
  const parent = await initialize('genome-parent');
  const child = await initialize(mutant.mutantId);
  assert.match(child.normalizedMission.prompt, /auditor/);
  assert.match(child.normalizedMission.prompt, /invariant-verification/);
  assert.deepEqual(child.normalizedMission.toolLease, ['genos_snapshot']);
  assert.deepEqual(parent.normalizedMission.toolLease, parentGenes.tools);
  const before = await generate(parent, record);
  const after = await generate(child, record);
  assert.equal(JSON.parse(before.text).strategy, 'explore-first');
  assert.deepEqual(JSON.parse(after.text), { strategy: 'verify-first', sampling: 0.75, nucleus: 0.55 });
  assert.equal(received[0].options.temperature, 0.2);
  assert.equal(received[1].options.temperature, 0.75);
  assert.equal(received[1].options.top_p, 0.55);
  const turn = await db.get("SELECT request_json FROM organism_model_turns WHERE agent_id=? AND status='completed' ORDER BY rowid DESC LIMIT 1", mutant.mutantId);
  const request = JSON.parse(turn.request_json);
  assert.equal(request.temperature, 0.75);
  assert.equal(request.topP, 0.55);
  assert.notEqual(parent.normalizedMission.genomeExpression.contentHash, child.normalizedMission.genomeExpression.contentHash);
  assert.deepEqual(JSON.parse((await db.get("SELECT metadata FROM lineage_nodes WHERE id='genome-parent'")).metadata), original);
  const replay = await initialize(mutant.mutantId);
  assert.deepEqual(replay.normalizedMission.genomeExpression, child.normalizedMission.genomeExpression);
  const prompt = replay.normalizedMission.prompt;
  await hydration.hydrate(db, { mission: replay.normalizedMission, agent: replay.dispatchedAgent });
  assert.equal(replay.normalizedMission.prompt, prompt, 'Expression must be idempotent');
  return mutant.mutantId;
}

async function refusals(db, mutantId) {
  const child = await initialize(mutantId);
  const empty = { prompt: 'No tools', toolLease: [] };
  expression.apply(empty, { ...parentGenes, tools: [] });
  assert.deepEqual(empty.toolLease, []);
  await require('../src/services/agentRuntimeAdapter/missionLease').enforceMissionToolLease({
    db, agentId: mutantId, dispatchedAgent: child.dispatchedAgent, normalizedMission: empty
  });
  assert.deepEqual(empty.toolLease, [], 'Policy enforcement must not restore silenced tools');
  assert.throws(() => expression.apply({}, { ...parentGenes, temp: NaN }), { code: 'INVALID_WORKER_GENOME' });
  assert.throws(() => expression.apply({}, { ...parentGenes, topP: 1.1 }), { code: 'INVALID_WORKER_GENOME' });
  await assert.rejects(hydration.hydrate(db, { mission: {},
    agent: { id: mutantId, execution_mode: 'worker', workspace_id: 'another-workspace' } }),
  { code: 'WORKER_GENOME_SCOPE_MISMATCH' });
  await db.run('UPDATE lineage_nodes SET metadata=? WHERE id=?', '{"genes":null}', mutantId);
  await assert.rejects(initialize(mutantId), { code: 'INVALID_WORKER_GENOME' });
  await db.run('UPDATE lineage_nodes SET metadata=? WHERE id=?', '{broken', mutantId);
  await assert.rejects(initialize(mutantId), { code: 'INVALID_WORKER_GENOME' });
}

async function fallbackIncarnation(db) {
  const parent = await db.get("SELECT * FROM agents WHERE id='delegation-root'");
  parent.genes = { ...parentGenes, tools: ['genos_snapshot'] };
  const descriptor = await require('../src/services/agents/agentIncarnationService').incarnateAgent({
    ctx: { db, parent }, request: { agentId: 'genome-parent', parentAgentId: parent.id,
      role: 'worker', workerKind: 'bounded_worker',
      workspace: { root, organizationId: 'delegation-org', projectId: 'delegation-project' },
      capabilityManifest: { owned: [] }, providedLease: ['genos_snapshot', 'genos_record_experience'],
      mission: { prompt: 'Check inherited fallback instructions.', executor: 'local', vfsWorkspace: true },
      budget: { tokens: 1000, cognitiveShare: 0.1 } }
  });
  assert.equal(descriptor.dnaAuthority, false);
  assert.ok(descriptor.prompt.includes(`strategy: ${descriptor.genome.strategy}`), 'Fallback genes must reach the worker prompt');
  assert.equal(descriptor.expressionContext.phenotype.strategy, descriptor.genome.strategy,
    'Introspection and execution must express the same selected genome');
  assert.ok(descriptor.toolLease.every(tool => descriptor.genome.tools.includes(tool)), 'Fallback tools must restrict the lease');
}

async function nativeContract(db) {
  const mission = { workerKind: 'sub_orchestrator',
    methodContract: { methodId: 'coordinate_children' }, prompt: 'Native contract',
    genome: parentGenes, toolLease: ['genos_delegate_worker'] };
  await hydration.hydrate(db, { mission, agent: {
    id: 'genome-parent', workspace_id: 'delegation-ws', execution_mode: 'worker' } });
  assert.equal(mission.prompt, 'Native contract');
  assert.deepEqual(mission.toolLease, ['genos_delegate_worker']);
  assert.deepEqual(expression.samplingOptions(mission), {});
  assert.equal(expression.selectionFor({ mission, evolution: { genes: parentGenes } }), null);
  const compliance = require('./test_worker_compliance_native_missions');
  compliance.assertPromoted(compliance.runIsolated('sub_orchestrator'));
}

async function main() {
  const received = [];
  const server = fixtureServer(received);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const db = await database.getDatabase();
    const record = await prepare(db);
    await db.run(`INSERT INTO provider_configs (provider,model,endpoint,enabled,cost_input,cost_output)
      VALUES ('ollama','genome-fixture',?,1,0,0)`, `http://127.0.0.1:${server.address().port}/api/chat`);
    await fallbackIncarnation(db);
    await nativeContract(db);
    const mutantId = await compareExecutions(db, record, received);
    await refusals(db, mutantId);
    assert.equal(received.length, 2, 'Refused genomes must not trigger inference');
    console.log('Mutation -> persisted lineage -> authorized bootstrap -> expression -> worker generation -> HTTP: PASS');
    console.log('Parent preservation, governing authority, tool confinement, sampling, replay, invalid genome and scope refusal: PASS');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await database.closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
