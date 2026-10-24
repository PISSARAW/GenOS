'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { validateReport } = require('./validate-report.cjs');

const SCENARIO = 'V2-02';
const POPULATION = 24;
const CYCLES = 1000;
const SCOPE = { organizationId: 'socialworld-v2-org', projectId: 'socialworld-v2-project' };
const REGISTERED_ARMS = Object.freeze(['genos-full', 'static-social-graph', 'llm-with-memory',
  'genos-without-relational-physiology']);
const EXECUTABLE_ARMS = Object.freeze(['genos-full']);

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function makeRandom(seed) {
  let state = Number.parseInt(digest(seed).slice(0, 8), 16) || 1;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function agentId(index) {
  return `socialworld-v2-${String(index).padStart(2, '0')}`;
}

function environmentEvents(seed) {
  const random = makeRandom(seed);
  const events = [];
  for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
    if (cycle % 100 === 0) events.push({ cycle, observer: Math.floor(random() * POPULATION),
      domain: Math.floor(random() * POPULATION) });
  }
  return events;
}

async function createWorld(db) {
  await db.run("INSERT INTO organizations (id, name) VALUES ('socialworld-v2-org', 'SocialWorld V2')");
  await db.run("INSERT INTO projects (id, organization_id, name) VALUES ('socialworld-v2-project', 'socialworld-v2-org', 'SocialWorld V2')");
  await db.run("INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES ('socialworld-v2-space', 'SocialWorld V2', 'socialworld-v2', 'socialworld-v2-org', 'socialworld-v2-project')");
  await require('../../../../backend/src/services/communication/transactiveMemoryService').ensureTables(db);
  for (let index = 0; index < POPULATION; index += 1) await createAgent(db, index);
  await createRelations(db);
}

async function createAgent(db, index) {
  const id = agentId(index);
  await db.run('INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES (?, ?, ?, ?, ?, ?)',
    [id, id, 'worker', 'idle', 'worker', 'socialworld-v2-space']);
  for (let domain = 0; domain < POPULATION; domain += 1) {
    const score = domain === index ? 0.95 : 0.2;
    await db.run('INSERT INTO agent_expertise (agent_id, domain, competence, reliability, calibration) VALUES (?, ?, ?, ?, ?)',
      [id, `domain-${domain}`, score, 0.9, 0.9]);
  }
}

async function createRelations(db) {
  const service = require('../../../../backend/src/services/crossAgentRelationalService');
  for (let index = 0; index < POPULATION; index += 1) {
    await service.createRelation({ db, id: `socialworld-edge-${index}`, sourceAgentId: agentId(index),
      targetAgentId: agentId((index + 1) % POPULATION), relationType: 'colleague',
      relationClass: 'organizational', ...SCOPE });
  }
}

async function observe(db, event) {
  const checkpoint = require('../../../../backend/src/services/communication/communicationCheckpointService');
  const ref = `world-event:${event.cycle}:domain-${event.domain}`;
  const receipt = await checkpoint.evaluateCheckpoint({ db, agentId: agentId(event.observer), checkpoint: 'NEW_EVIDENCE',
    evidence: { domain: `domain-${event.domain}`, urgency: 0.7, artifactId: ref,
      semanticRefs: [ref], publicSummary: `Shared environmental evidence for domain ${event.domain}.` },
    scope: SCOPE, communication: { cycleId: `v202-cycle-${event.cycle}` } });
  return { event, receipt };
}

async function recordMemory(db, item) {
  const signal = item.receipt.executed;
  const acked = signal?.deliveryAcknowledgements?.some((ack) =>
    ack.groundingLevel === 'semantic_ack' && ['seen', 'acked'].includes(ack.status));
  if (!acked || !signal.signalId) return false;
  await require('../../../../backend/src/services/autobiographicalMemory/episodeStore').recordEpisode({
    agentId: agentId(item.event.observer), missionId: `v202-cycle-${item.event.cycle}`,
    organizationId: SCOPE.organizationId, projectId: SCOPE.projectId, kind: 'social_interaction',
    salience: 0.8, situation: { goal: 'share environmental evidence with a capable peer', sourceEvent: item.event },
    action: { selectedAction: 'share verified environmental evidence' },
    outcome: { status: 'delivered', evidenceRefs: [signal.signalId] },
    lesson: { sourceRefs: [`world-event:${item.event.cycle}:domain-${item.event.domain}`] }
  }, db);
  return true;
}

async function runFullRuntime(seed) {
  const { getDatabase, closeDatabase } = require('../../../../backend/src/db');
  const policy = require('../../../../backend/src/services/communication/communicationPolicyEngine');
  const previousMode = policy.getMode();
  const db = await getDatabase(':memory:');
  try {
    policy.setMode('active');
    await createWorld(db);
    const events = environmentEvents(seed);
    const interactions = [];
    for (const event of events) {
      const item = await observe(db, event);
      item.memoryRecorded = await recordMemory(db, item);
      interactions.push(item);
    }
    return { events, interactions, outcome: evaluate(interactions) };
  } finally {
    policy.setMode(previousMode);
    await closeDatabase();
  }
}

function evaluate(interactions) {
  const initiated = interactions.filter((item) => item.receipt.decision.action === 'SIGNAL');
  const recipients = new Set(initiated.flatMap((item) => item.receipt.decision.recipients));
  const reciprocal = initiated.some((item) => item.receipt.executed?.deliveryAcknowledgements
    ?.some((ack) => ack.recipientAgentId === item.event.observer && ack.status === 'acked'));
  const memoryMutations = initiated.filter((item) => item.memoryRecorded).length;
  const acknowledged = initiated.every((item) => item.receipt.executed?.published === true
    && item.receipt.executed.deliveryAcknowledgements?.length === item.receipt.decision.recipients.length);
  return { initiatives: initiated.length, distinctRecipients: recipients.size, reciprocal,
    memoryMutations, acknowledged, cycles: CYCLES, population: POPULATION };
}

function unsupportedOutcome(arm) {
  return { initiatives: 0, distinctRecipients: 0, reciprocal: false, memoryMutations: 0,
    acknowledged: false, cycles: CYCLES, population: POPULATION, execution: 'unavailable', arm };
}

function makeEvidence(input, outcome, runtime) {
  return { scenario: SCENARIO, seed: input.seed, arm: input.arm, attempt: input.attempt,
    execution: runtime ? { executed: true, cycles: CYCLES, population: POPULATION }
      : { executed: false, reason: 'This comparison treatment is not available in the runtime.' },
    ...(runtime || {}), outcome };
}

function makeReport(input) {
  const { seed, arm, attempt, sourceCommit, startedAt, durationMs, evidenceFilename, outcome } = input;
  const unsupported = !EXECUTABLE_ARMS.includes(arm);
  const status = 'inconclusive';
  const limitation = unsupported ? `${arm} treatment is not independently executable.`
    : 'Checkpoint services ran, but autonomous agent cycles and verified causal treatments are not implemented.';
  return { campaignId: 'socialworld-v2', scenario: SCENARIO, arm, seed, attempt, sourceCommit,
    runtimeVersion: '3', model: null, configHash: digest(JSON.stringify({ scenario: SCENARIO, arm, seed, attempt })),
    status, startedAt, durationMs,
    inputs: { comparison: { eventsHash: digest(`v202-events:${seed}`), budgetHash: digest('v202-budget-v1'),
      permissionsHash: digest('v202-permissions-v1') }, cycleCount: CYCLES, population: POPULATION },
    observed: outcome, oracle: { recalculable: false, unsupportedArm: unsupported,
      thresholds: { initiatives: 3, distinctRecipients: 2, reciprocalInteractions: 1, mutations: 1 } },
    evidenceRefs: [evidenceFilename], violations: [], limitations: [limitation] };
}

function safeKey(value) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function validateInput(input) {
  if (!input || typeof input !== 'object') throw new Error('scenario input must be an object');
  validateArm(input.arm);
  validateSeed(input.seed);
  validateAttempt(input.attempt);
  validateOutput(input.outputDirectory);
  validateCommit(input.sourceCommit);
}

function validateArm(arm) {
  if (!REGISTERED_ARMS.includes(arm)) throw new Error('arm is not registered for V2-02');
}

function validateSeed(seed) {
  if (typeof seed !== 'string' || !seed.trim()) throw new Error('seed is required');
}

function validateAttempt(attempt) {
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error('attempt must be a positive integer');
}

function validateOutput(outputDirectory) {
  if (!path.isAbsolute(outputDirectory || '')) throw new Error('outputDirectory must be absolute');
}

function validateCommit(sourceCommit) {
  if (typeof sourceCommit !== 'string' || !sourceCommit.trim()) throw new Error('sourceCommit is required');
}

async function runScenario(input) {
  validateInput(input);
  const startedAt = new Date().toISOString();
  const start = Date.now();
  const executable = EXECUTABLE_ARMS.includes(input.arm);
  const runtime = executable ? await runFullRuntime(input.seed) : null;
  const outcome = runtime ? runtime.outcome : unsupportedOutcome(input.arm);
  const filename = `${SCENARIO}-${safeKey(input.seed)}-${safeKey(input.arm)}-a${input.attempt}.evidence.json`;
  const evidencePath = path.join(input.outputDirectory, filename);
  fs.mkdirSync(input.outputDirectory, { recursive: true });
  const evidence = makeEvidence(input, outcome, runtime);
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  const report = makeReport({ ...input, startedAt, durationMs: Date.now() - start,
    evidenceFilename: filename, outcome });
  const reportPath = path.join(input.outputDirectory, `${SCENARIO}-${safeKey(input.seed)}-${input.arm}-report.json`);
  const errors = validateReport(report, reportPath, path.resolve(__dirname, '../../../..'));
  if (errors.length) throw new Error(`generated V2-02 report failed validation: ${errors.join('; ')}`);
  return { report, evidence };
}

function main() {
  runScenario(JSON.parse(process.argv[2] || '{}')).then((result) => {
    process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
    if (result.report.status !== 'pass') process.exitCode = 2;
  }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
}

if (require.main === module) main();
module.exports = { runScenario, REGISTERED_ARMS, EXECUTABLE_ARMS, environmentEvents };
