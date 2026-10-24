#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateReport } = require('./validate-report.cjs');
const contract = require('./v2-02-pilot-contract.cjs');
const worldHelpers = require('./v2-02-pilot-world.cjs');
const outputHelpers = require('./v2-02-pilot-output.cjs');
const { MODEL, AGENT_COUNT, SIMULATED_DAYS, CYCLES, ROOT_ARMS,
  MAX_MODEL_CALLS_PER_DAY, MAX_MESSAGES_PER_DAY, SCOPE, digest,
  dayForCycle, eventSchedule, comparisonHashes, validReceipt, metricsOf,
  evaluatePilot, reportFor, validateDecision } = contract;

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 2) {
    result[args[index].replace(/^--/, '')] = args[index + 1];
  }
  return result;
}

function directories(outputDir) {
  return { outputDir: path.resolve(outputDir), databaseDir: path.join(path.resolve(outputDir), 'db'),
    armDir: path.join(path.resolve(outputDir), 'arms'), reportDir: path.join(path.resolve(outputDir), 'reports'),
    evidenceDir: path.join(path.resolve(outputDir), 'reports', 'evidence') };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function safeJsonLine(output) {
  const lines = output.trim().split(/\r?\n/);
  return JSON.parse(lines[lines.length - 1]);
}

function childResult(args, env) {
  const result = spawnSync(process.execPath, [__filename, '--phase', 'arm', '--arm', args.arm,
    '--database', args.database, '--events', args.events, '--evidence', args.evidence,
    '--seed', args.seed], { cwd: path.resolve(__dirname, '../../../..'), encoding: 'utf8',
    timeout: 60 * 60 * 1000, env: { ...process.env, ...env } });
  if (result.error || result.status !== 0) {
    const message = `${result.error?.message || ''} ${result.stderr || ''} ${result.stdout || ''}`;
    return { arm: args.arm, completed: false, error: safeError(message),
      integrityEvents: /gvx-ledger-chain-invalid/i.test(message) ? [{ source: 'child-output' }] : [] };
  }
  return safeJsonLine(result.stdout);
}

function childWarmup(args, env) {
  const result = spawnSync(process.execPath, [__filename, '--phase', 'warmup',
    '--database', args.database, '--seed', args.seed], { cwd: path.resolve(__dirname, '../../../..'),
    encoding: 'utf8', timeout: 10 * 60 * 1000, env: { ...process.env, ...env } });
  if (result.error || result.status !== 0) {
    return { completed: false, model: MODEL, error: safeError(result.error?.message || result.stderr),
      integrityEvents: /gvx-ledger-chain-invalid/i.test(`${result.stderr || ''} ${result.stdout || ''}`)
        ? [{ source: 'child-output' }] : [] };
  }
  return safeJsonLine(result.stdout);
}

function safeError(value) {
  return String(value || 'unknown-runner-error').replace(/\s+/g, ' ').slice(0, 400);
}

function sourceCommit() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

async function ledgerIntegrityEvents(db, since) {
  return db.all(`SELECT id, event_type AS eventType, action, detail, payload_json AS payload
    FROM telemetry_events WHERE created_at >= ? AND lower(
      COALESCE(event_type, '') || ' ' || COALESCE(action, '') || ' ' || COALESCE(detail, '') || ' '
      || COALESCE(payload_json, '')) LIKE '%gvx-ledger-chain-invalid%' ORDER BY id LIMIT 100`, [since]);
}

async function runCampaign(args) {
  if (!args['output-dir'] || !args.seed) throw new Error('Usage: node run-v2-02-pilot.cjs --output-dir <D:\\GenOS-runs\\new-run-directory> --seed <pilot-seed>');
  if (!/^[a-zA-Z0-9_-]+$/.test(args.seed)) throw new Error('seed must contain only letters, digits, underscores, and hyphens');
  const paths = directories(outputHelpers.createFreshRunDirectory(args['output-dir']));
  fs.mkdirSync(paths.databaseDir);
  fs.mkdirSync(paths.armDir);
  fs.mkdirSync(paths.reportDir);
  fs.mkdirSync(paths.evidenceDir);
  const startedAt = new Date().toISOString();
  const events = eventSchedule(args.seed);
  const comparison = comparisonHashes(args.seed, events);
  const configHash = digest({ model: MODEL, seed: args.seed, comparison,
    agents: AGENT_COUNT, days: SIMULATED_DAYS, cycles: CYCLES });
  const eventsPath = path.join(paths.outputDir, 'environment-events.json');
  writeJson(eventsPath, { seed: args.seed, comparison, events });
  const warmup = childWarmup({ database: path.join(paths.databaseDir, 'qwen-warmup.sqlite'), seed: args.seed },
    { GENOS_DB_PATH: path.join(paths.databaseDir, 'qwen-warmup.sqlite'),
      GENOS_INFERENCE_MAX_CONCURRENT: '1' });
  const arms = [];
  for (const arm of warmup.completed === true ? ROOT_ARMS : []) {
    const database = path.join(paths.databaseDir, `${arm}.sqlite`);
    const evidence = path.join(paths.armDir, `${arm}.json`);
    const result = childResult({ arm, database, evidence, events: eventsPath, seed: args.seed },
      { GENOS_DB_PATH: database, GENOS_AGOW_MODE: 'bounded', GENOS_INFERENCE_MAX_CONCURRENT: '1' });
    result.comparison = comparison;
    arms.push(result);
    if (result.completed !== true) break;
  }
  const evidence = { campaignId: 'socialworld-v2', scenario: 'V2-02', seed: args.seed,
    sourceCommit: sourceCommit(), comparison, events, warmup, arms };
  const evidenceName = `evidence/${args.seed}.evidence.json`;
  const evidencePath = path.join(paths.reportDir, evidenceName);
  writeJson(evidencePath, evidence);
  const report = reportFor({ evidence, evidenceName, seed: args.seed, comparison, configHash,
    sourceCommit: evidence.sourceCommit, startedAt, durationMs: Date.now() - Date.parse(startedAt) });
  const reportPath = path.join(paths.reportDir, `${args.seed}.report.json`);
  writeJson(reportPath, report);
  const errors = validateReport(report, reportPath);
  if (errors.length) throw new Error(`pilot report failed validation: ${errors.join('; ')}`);
  if (report.status !== 'pass') process.exitCode = 1;
}

async function loadSocialMemories(db, event) {
  const store = require('../../../../backend/src/services/autobiographicalMemory/episodeStore');
  const rows = await store.getRecentEpisodes({ agentId: event.agentId, ...SCOPE, limit: 100 }, db);
  return rows.filter((episode) => ['social_interaction', 'social_dialogue'].includes(episode.kind))
    .slice(0, 8).map((episode) => ({ id: episode.id,
      action: episode.action?.selectedAction || null, outcome: episode.outcome?.status || 'unknown',
      evidenceRefs: episode.outcome?.evidenceRefs || episode.lesson?.sourceRefs || [] }));
}

function usageRecord(response) {
  const usage = response.usage || {};
  return { servedModel: response.servedModel || null,
    inputTokens: usage.input_tokens ?? usage.prompt_tokens ?? null,
    outputTokens: usage.output_tokens ?? usage.completion_tokens ?? null };
}

function decisionRequest(loop, input, seed) {
  return { model: MODEL, prompt: loop.promptFor(input), seed, temperature: 0,
    timeoutMs: 120000, maxTokens: 200, stream: false,
    responseFormat: { name: 'social_development_action', schema: loop.DECISION_SCHEMA } };
}

async function runWarmup(input) {
  const { getDatabase, closeDatabase } = require('../../../../backend/src/db');
  process.env.GENOS_DB_PATH = input.database;
  const db = await getDatabase(input.database);
  const since = new Date().toISOString();
  try {
    const loop = require('../../../../backend/src/services/socialDevelopmentLoopService');
    const observation = { id: 'qwen-warmup', summary: 'Choose a bounded social action for a schema warm-up.',
      domain: 'navigation-warmup', evidenceRefs: ['warmup:source'], urgency: 0.5 };
    const candidates = [{ agentId: 'warmup-candidate', role: 'worker', relationType: 'colleague',
      relationClass: 'organizational', competence: 0.8 }];
    const proposalInput = { observation, agentId: 'warmup-agent', candidates, memories: [], topology: 'mycelial' };
    const response = await require('../../../../backend/src/services/modelProvider')
      .generate(decisionRequest(loop, proposalInput, 0));
    validateDecision(response, candidates, []);
    const servedModel = String(response.servedModel || '').replace(/^ollama[:/]/, '');
    const integrityEvents = await ledgerIntegrityEvents(db, since);
    const result = { completed: servedModel === 'qwen2.5:14b' && integrityEvents.length === 0,
      model: MODEL, servedModel, schemaValid: true, modelCalls: 1, integrityEvents };
    if (!result.completed) result.error = integrityEvents.length ? 'gvx-ledger-chain-invalid' : 'served-model-mismatch';
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally { await closeDatabase(); }
}

function seedFor(event, seed) {
  const digestValue = crypto.createHash('sha256')
    .update(`${seed}:${event.agentId}:${event.eventId}`).digest();
  return digestValue.readUInt32LE(0);
}

function episodeInput(input) {
  const { event, decision, communication, usage, memoryIds, missionId } = input;
  const receipt = communication?.receipt;
  const refs = [...new Set([...event.evidenceRefs, ...(receipt?.executed?.signalId ? [receipt.executed.signalId] : [])])];
  const recipient = decision.recipientAgentId || null;
  const delivered = communication?.delivered === true;
  return { id: `socialworld-v2-pilot:${event.agentId}:${event.eventId}`,
    agentId: event.agentId, missionId, organizationId: SCOPE.organizationId, projectId: SCOPE.projectId,
    kind: 'social_interaction', salience: 0.7,
    situation: { goal: event.summary, domain: event.domain },
    decision: { selectedStrategy: decision.action, reasonCode: decision.reasonCode,
      memoryReferences: decision.memoryReferences },
    action: { selectedAction: decision.action === 'contact' ? `${decision.purpose}:${recipient}` : 'silence' },
    outcome: { status: delivered ? 'delivered_unverified' : 'not_delivered', verified: false,
      recipientAgentId: recipient, evidenceRefs: refs },
    lesson: { sourceRefs: event.evidenceRefs, modelUsage: usage } };
}

function resultRecord(input) {
  return { event: input.event, decision: input.decision, recipientAgentId: input.recipientAgentId || null,
    receipt: input.receipt, memoryIds: input.memoryIds, modelUsage: input.modelUsage || null,
    status: input.status || 'processed' };
}

async function baselineEvent(input) {
  const loop = require('../../../../backend/src/services/socialDevelopmentLoopService');
  const candidates = await loop.recipientCandidates({ db: input.db, agentId: input.event.agentId,
    scope: SCOPE, observation: input.event });
  const memories = await loadSocialMemories(input.db, input.event);
  const proposalInput = { observation: input.event, agentId: input.event.agentId,
    candidates, memories, topology: 'mycelial' };
  const provider = require('../../../../backend/src/services/modelProvider');
  const response = await provider.generate(decisionRequest(loop, proposalInput, seedFor(input.event, input.seed)));
  const decision = validateDecision(response, candidates, memories);
  const communication = await baselineCheckpoint({ ...input, decision });
  const usage = usageRecord(response);
  const memory = await require('../../../../backend/src/services/autobiographicalMemory/episodeStore')
    .recordEpisode(episodeInput({ event: input.event, decision, communication, usage,
      memoryIds: decision.memoryReferences, missionId: 'socialworld-v2-pilot' }), input.db);
  return resultRecord({ event: input.event, decision, recipientAgentId: decision.recipientAgentId,
    receipt: communication.receipt ? validReceipt(communication.receipt, decision.recipientAgentId) : null,
    memoryIds: decision.memoryReferences, modelUsage: usage,
    status: memory ? 'processed' : 'memory-write-failed' });
}

async function baselineCheckpoint(input) {
  const { evaluateCheckpoint } = require('../../../../backend/src/services/communication/communicationCheckpointService');
  if (input.decision.action === 'silence') return { delivered: false, receipt: null };
  const receipt = await evaluateCheckpoint({ db: input.db, agentId: input.event.agentId,
    checkpoint: 'NEW_EVIDENCE', scope: SCOPE, topology: { selectedTopology: 'mycelial' },
    evidence: { domain: input.event.domain, artifactId: input.event.eventId,
      semanticRefs: input.event.evidenceRefs, evidenceRefs: input.event.evidenceRefs,
      requestedAudience: [input.decision.recipientAgentId], urgency: 0.7,
      purpose: input.decision.purpose, publicSummary: input.event.summary },
    communication: { cycleId: `pilot:${input.arm}:${input.event.eventId}`,
      transport: input.transport } });
  return { delivered: validReceipt(receipt, input.decision.recipientAgentId).delivered, receipt };
}

async function integratedEvent(input) {
  const workspace = require('../../../../backend/src/services/globalWorkspaceService');
  const policy = require('../../../../backend/src/services/communication/communicationPolicyEngine');
  const loop = require('../../../../backend/src/services/socialDevelopmentLoopService');
  const release = workspace.configureRuntime({ agentId: input.event.agentId, db: input.db,
    mode: 'bounded', ignitionThreshold: 0.1, primaryCapacity: 1, secondaryCapacity: 2,
    skipTransport: true, modeCosts: { ACT: 0, OBSERVE: 100, RECALL: 100, ABSTAIN: 100, VERIFY: 100 } });
  policy.setMode('active');
  try {
    const result = await loop.process({ db: input.db, agentId: input.event.agentId,
      event: worldHelpers.eventInput(input.event), normalizedMission: { missionId: 'socialworld-v2-pilot', ...SCOPE,
        socialDevelopment: { enabled: true, model: MODEL, useSocialMemory: true } },
      autonomyPlan: { executionStatus: 'ready', controlRegulation: { arbitration: { actionMode: 'act' } } },
      morphogenesisPlan: { selectedTopology: 'mycelial' }, seed: input.seed,
      communication: { cycleId: `pilot:${input.arm}:${input.event.eventId}`, transport: input.transport } });
    const receipt = result.communication?.receipt || null;
    const receiptResult = receipt && result.action === 'contact'
      ? validReceipt(receipt, result.recipientAgentId) : null;
    return resultRecord({ event: input.event, decision: result.decision || { action: 'silence' },
      recipientAgentId: result.recipientAgentId,
      receipt: receiptResult, memoryIds: result.decision?.memoryReferences || [], modelUsage: result.modelUsage,
      status: result.processed ? 'processed' : result.reason || 'social-loop-not-processed' });
  } finally { release(); }
}

async function processWorldEvent(input) {
  const { event, world, usageByDay, records, connection, arm, seed, transport } = input;
  world.currentEvent = event;
  world.events.add(event.eventId);
  const usage = usageByDay.get(event.day) || { modelCalls: 0, messages: 0 };
  if (usage.modelCalls >= MAX_MODEL_CALLS_PER_DAY) throw new Error('daily-model-budget-exceeded');
  usage.modelCalls += 1;
  usageByDay.set(event.day, usage);
  const context = { db: connection, arm, seed, event, transport };
  const result = arm === ROOT_ARMS[0] ? await baselineEvent(context) : await integratedEvent(context);
  if (result.status !== 'processed') throw new Error(`${arm}:${result.status}`);
  if (result.receipt?.valid === false) throw new Error(`${arm}:delivery-receipt-invalid`);
  if (result.receipt?.delivered) {
    usage.messages += 1;
    if (usage.messages > MAX_MESSAGES_PER_DAY) throw new Error('daily-message-budget-exceeded');
  }
  records.push(result);
}

async function runArm(arm, input) {
  const { getDatabase, closeDatabase } = require('../../../../backend/src/db');
  process.env.GENOS_DB_PATH = input.database;
  const connection = await getDatabase(input.database);
  const relations = require('../../../../backend/src/services/crossAgentRelationalService');
  const communicationPolicy = require('../../../../backend/src/services/communication/communicationPolicyEngine');
  await worldHelpers.createWorld(connection);
  await worldHelpers.ensureTransportTables(connection);
  communicationPolicy.setMode('active');
  const world = worldHelpers.worldState(connection, input.events);
  const transport = worldHelpers.worldTransport({ db: connection, world });
  const records = [];
  const usageByDay = new Map();
  const startedAt = new Date().toISOString();
  try {
    for (let cycle = 0; cycle < CYCLES; cycle++) {
      const currentEvents = world.pending.get(cycle) || [];
      world.pending.delete(cycle);
      for (const event of currentEvents) await processWorldEvent({ event, world, usageByDay,
        records, connection, arm, seed: input.seed, transport });
    }
    const memoryCount = await connection.get(`SELECT COUNT(*) AS count FROM autobiographical_episodes
      WHERE organization_id = ? AND project_id = ?`, [SCOPE.organizationId, SCOPE.projectId]);
    const integrityEvents = await ledgerIntegrityEvents(connection, startedAt);
    const result = { arm, completed: true, comparison: input.comparison, records,
      integrityEvents,
      metrics: metricsOf({ records, cycles: CYCLES, modelCalls: records.length,
        memoryEpisodeCount: memoryCount?.count || 0 }),
      dailyUsage: [...usageByDay.entries()].map(([day, usage]) => ({ day, ...usage })) };
    writeJson(input.evidencePath, result);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally { await closeDatabase(); }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.phase === 'arm') {
    const eventFile = JSON.parse(fs.readFileSync(args.events, 'utf8'));
    return runArm(args.arm, { seed: args.seed, database: path.resolve(args.database),
      evidencePath: path.resolve(args.evidence), events: eventFile.events, comparison: eventFile.comparison });
  }
  if (args.phase === 'warmup') return runWarmup({ database: path.resolve(args.database), seed: args.seed });
  return runCampaign(args);
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${safeError(error.message)}\n`);
  process.exitCode = 1;
});

module.exports = { ...contract, parseArgs, directories, validateReport };
