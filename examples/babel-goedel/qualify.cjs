'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const repository = path.resolve(__dirname, '../..');
process.loadEnvFile(path.join(repository, '.env'));
const database = require('../../backend/src/db');
const dna = require('../../backend/src/services/agentDnaStore');
const equation = require('../../backend/src/services/productPowerDifference/contract');
const roles = ['environment_mapper', 'resource_steward', 'population_specialist', 'ecosystem_observer'];
const premises = { A: 8, B: 20, C: 22, D: 3, E: 3 };

function assignments(objective) {
  return Object.fromEntries(roles.map(role => [role, role.endsWith('mapper') || role.endsWith('observer')
    ? { workerKind: 'scout_cell', methodContract: { version: 1, methodId: 'scan_literal',
      parameters: { sources: [{ sourceRef: 'mission', text: objective }], terms: ['Babel', '10805'] } } }
    : { workerKind: 'specialist', methodContract: { version: 1, methodId: 'prompt_defined',
      evaluator: { domain: equation.DOMAIN, version: 1 }, parameters: { premises } } }]));
}

function sourceFile(workspace, objective) {
  const filename = path.join(workspace, 'babel-goedel-premises.json');
  const content = JSON.stringify({ schema: 'genos.babel-goedel-premises/v1', objective, premises,
    formula: 'N=(A*B)+C^D-E', validationScope: 'Arithmetic from supplied historical axioms' }, null, 2) + '\n';
  if (fs.existsSync(filename)) assert.equal(fs.readFileSync(filename, 'utf8'), content, 'Historical premise file changed.');
  else fs.writeFileSync(filename, content, { flag: 'wx' });
}

async function prepare(workspace) {
  assert.equal(process.env.GENOS_AGENT_DNA, '1', 'Enable GENOS_AGENT_DNA=1 in local configuration.');
  const db = await database.getDatabase();
  try {
    const historical = await db.get('SELECT objective FROM missions WHERE mission_id=?',
      'mission_bbdd0399-d215-44b8-a858-f358b6e3f5bf');
    assert.ok(historical?.objective, 'The original Babel-Goedel mission is required.');
    await dna.ensureImported(db);
    const genomes = await db.get('SELECT count(*) count FROM agent_genomes');
    assert.ok(genomes.count > 0, 'DNA catalog must be genuinely persisted.');
    fs.mkdirSync(workspace, { recursive: true });
    sourceFile(workspace, historical.objective);
    return { objective: historical.objective, importedGenomeCount: genomes.count };
  } finally { await database.closeDatabase(); }
}

function requestFor(input) {
  return { action: 'dispatch_biological', mode: 'biome', strategy: 'biome', variant: 'resource',
    missionId: input.missionId, orchestratorId: `babel_validator_${randomUUID().replaceAll('-', '')}`,
    mission: input.objective + '\nReturn the exact arithmetic candidate and independently checkable evidence.',
    workspaceRoot: input.workspace, workspaceScopeId: 'ws-babel-goedel', workspaceId: 'ws-babel-goedel',
    executor: 'local', localModel: 'ollama://llama3.1:8b',
    localRoutingPolicy: { primary: 'ollama://llama3.1:8b', fallbacks: [], parallelReview: [], mode: 'fallback', preferLocal: true },
    readOnlyWorkspaceEvidence: true, awaitWorkers: true, background: false, timeoutMs: 300000,
    executionBudget: { tokens: 60000, costUsd: 1, latencyMs: 300000, events: 200 },
    workerAssignments: assignments(input.objective) };
}

function execute(input) {
  const request = requestFor(input);
  fs.writeFileSync(path.join(input.directory, 'request.json'), JSON.stringify(request, null, 2));
  const stdout = path.join(input.directory, 'stdout.log');
  const stderr = path.join(input.directory, 'stderr.log');
  const outputFd = fs.openSync(stdout, 'w');
  const errorFd = fs.openSync(stderr, 'w');
  let child;
  console.log(JSON.stringify({ event: 'mission_started', missionId: input.missionId, directory: input.directory }));
  try {
    child = spawnSync(process.execPath, [path.join(repository, 'backend/bin/genos-orchestrate.cjs'), JSON.stringify(request)],
      { cwd: repository, env: process.env, windowsHide: true, stdio: ['ignore', outputFd, errorFd], timeout: 750000 });
  } finally { fs.closeSync(outputFd); fs.closeSync(errorFd); }
  if (child.error) throw child.error;
  const lines = fs.readFileSync(stdout, 'utf8').trim().split(/\r?\n/);
  const serialized = lines.findLast(line => line.startsWith('{"schema":"genos.biological-dispatch-result/v1"'));
  assert.ok(serialized, `Missing envelope; inspect ${stdout} and ${stderr}`);
  const envelope = JSON.parse(serialized);
  fs.writeFileSync(path.join(input.directory, 'envelope.json'), JSON.stringify(envelope, null, 2));
  assert.equal(child.status, 0, `Mission refused: ${JSON.stringify(envelope.error || envelope)}; ${stderr}`);
  assert.equal(envelope.success, true);
  return envelope;
}

async function verifiedSpecialist(db, record) {
  assert.equal(record.receipt.semanticVerification.domain, equation.DOMAIN);
  assert.equal(record.receipt.oracleExecution.costs.processes, 2);
  const candidate = equation.parse(record.receipt.evidence.report);
  const expected = BigInt(premises.A) * BigInt(premises.B) + BigInt(premises.C) ** BigInt(premises.D) - BigInt(premises.E);
  assert.equal(BigInt(candidate.N), expected);
  const inherited = record.binding.genome.dna;
  assert.ok(inherited?.genomeRef, 'Model worker must be bound to a persisted cognitive genome.');
  await require('../../backend/src/services/workerDnaIncarnation').validateSource(db,
    { record: inherited, scope: record.binding.tenant });
  const model = await dna.loadGenome(db, inherited.genomeRef, record.binding.tenant);
  assert.equal(model.contentHash, inherited.contentHash);
  const calls = await db.all(`SELECT id,model,input_tokens,output_tokens,token_usage_source,provider_called,status
    FROM model_attempt_ledger WHERE mission_id=? AND agent_id=? AND status='completed'`,
  record.binding.runId, record.binding.workerId);
  assert.ok(calls.length > 0);
  assert.ok(calls.every(call => call.model === 'ollama://llama3.1:8b' && call.provider_called === 1
    && call.token_usage_source === 'provider' && call.input_tokens > 0 && call.output_tokens > 0));
  return { workerId: record.binding.workerId, runId: record.binding.runId, N: candidate.N,
    genomeRef: inherited.genomeRef, genomeContentHash: inherited.contentHash,
    oracleDomain: record.receipt.semanticVerification.domain,
    oracleAcceptanceHash: record.receipt.semanticVerification.acceptanceHash,
    oracleProcessCount: record.receipt.oracleExecution.costs.processes, modelAttempts: calls };
}

async function verify(input, envelope) {
  const db = await database.getDatabase();
  try {
    const output = envelope.result.biologicalMode;
    assert.equal(output.completionContract.verdict, 'succeeded');
    assert.equal(output.members.length, 4);
    const evidence = await require('../../backend/src/services/missionCompletionEvidenceService').collect({
      db, missionId: envelope.missionId, members: output.members });
    const dossier = await require('../../backend/src/services/topologyCompletionAdapters/biomeAdapter').build({
      context: { db, mode: 'biome', missionId: envelope.missionId, sessionId: output.sessionId, output }, evidence });
    assert.equal(dossier.topologyValidation.status, 'verified');
    assert.equal(dossier.oracle.independent, true);
    const records = await require('./archived-evidence.cjs').load(db,
      { missionId: envelope.missionId, sessionId: output.sessionId, members: output.members });
    assert.equal(records?.length, 4);
    const specialists = [];
    for (const record of records) {
      if (record.binding.genome.workerContract.identity.workerKind === 'specialist') {
        specialists.push(await verifiedSpecialist(db, record));
      }
    }
    assert.equal(specialists.length, 2);
    const mission = await db.get('SELECT status FROM missions WHERE mission_id=?', envelope.missionId);
    assert.equal(mission.status, 'completed');
    await require('../../backend/src/services/homeostasisClosureService').assertClosure(db, envelope.missionId);
    const episode = await db.get('SELECT mission_id,status FROM mission_episodes WHERE episode_id=?', output.lifecycle.episodeId);
    assert.equal(episode.mission_id, envelope.missionId);
    assert.equal(episode.status, 'completed');
    const cells = await db.all('SELECT worker_id,status FROM cell_threads WHERE episode_id=?', output.lifecycle.episodeId);
    assert.equal(cells.length, 5);
    assert.ok(cells.every(cell => cell.status === 'completed_execution'));
    const report = { schema: 'genos.babel-goedel-qualification/v1', verified: true,
      missionId: envelope.missionId, workspace: input.workspace, sessionId: output.sessionId,
      premises, N: specialists[0].N, model: 'ollama://llama3.1:8b', specialists,
      cognitiveGenomeCount: (await db.get('SELECT count(*) count FROM agent_genomes')).count,
      completionContract: output.completionContract, oracle: dossier.oracle, invariants: dossier.invariants,
      lifecycle: output.lifecycle, cellThreads: cells,
      scope: 'Historical supplied axioms; independently verified arithmetic and persisted Biome runtime',
      verifiedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(input.directory, 'qualification.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await database.closeDatabase(); }
}

async function main() {
  const replay = process.argv.indexOf('--verify-run');
  if (replay >= 0) return verifySaved(process.argv[replay + 1]);
  const workspace = path.resolve(process.argv[2] || 'D:/genos-babel-goedel');
  const missionId = `mission_babel_qualified_${randomUUID()}`;
  const directory = path.join(repository, '.genos-agent-worlds/babel-live', missionId);
  fs.mkdirSync(directory, { recursive: true });
  const prepared = await prepare(workspace);
  const input = { ...prepared, missionId, directory, workspace };
  const envelope = execute(input);
  await verify(input, envelope);
}

async function verifySaved(missionId) {
  assert.match(missionId, /^mission_babel_qualified_[a-f0-9-]{36}$/);
  const directory = path.join(repository, '.genos-agent-worlds/babel-live', missionId);
  const request = JSON.parse(fs.readFileSync(path.join(directory, 'request.json'), 'utf8'));
  const envelope = JSON.parse(fs.readFileSync(path.join(directory, 'envelope.json'), 'utf8'));
  assert.equal(envelope.missionId, missionId);
  return verify({ missionId, directory, workspace: request.workspaceRoot }, envelope);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
