'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REGISTERED_ARMS = Object.freeze([
  'genos-full', 'static-social-graph', 'llm-with-memory', 'genos-without-relational-physiology'
]);
const EXECUTABLE_ARMS = Object.freeze([]);
const DIAGNOSTIC_ARM = 'genos-full';
const ROOT = path.resolve(__dirname, '../../../..');

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function commitOf(sourceCommit) {
  if (/^[a-f0-9]{7,40}$/i.test(String(sourceCommit || ''))) return sourceCommit;
  return spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
}

function validateInput(input) {
  for (const check of [validateArm, validateSeed, validateAttempt, validateOutput, validateConfiguration]) {
    const reason = check(input);
    if (reason) return reason;
  }
  return undefined;
}

function validateArm(input) {
  return !input || !REGISTERED_ARMS.includes(input.arm) ? 'arm is not registered for V2-01' : null;
}

function validateSeed(input) {
  return !(typeof input?.seed === 'string' && input.seed.trim()) && !Number.isSafeInteger(input?.seed)
    ? 'seed is invalid' : null;
}

function validateAttempt(input) {
  return !Number.isSafeInteger(input?.attempt) || input.attempt < 1 ? 'attempt must be a positive integer' : null;
}

function validateOutput(input) {
  return typeof input?.outputDirectory !== 'string' || !input.outputDirectory.trim()
    ? 'outputDirectory is required' : null;
}

function validateConfiguration(input) {
  return input?.model || input?.config ? 'custom model or configuration is unsupported by this runner' : null;
}

function dialogueTurns(seed) {
  return [
    { speaker: 'agent-a', utterance: `Can you share the verified route map for ${seed}?` },
    { speaker: 'agent-b', utterance: 'I can share the map and include its source reference.' },
    { speaker: 'agent-a', utterance: 'Please keep the reference with the map.' },
    { speaker: 'agent-b', utterance: 'Agreed; I will attach the source reference.' }
  ];
}

async function executeServices(input, db) {
  const verbal = require('../../../../backend/src/services/communication/verbalEscalationService');
  const dialogue = require('../../../../backend/src/services/communication/dialogueSessionService');
  const episodes = require('../../../../backend/src/services/autobiographicalMemory/episodeStore');
  const recall = require('../../../../backend/src/services/autobiographicalMemory/recallService');
  const scope = { organizationId: `v201-${input.seed}-org`, projectId: `v201-${input.seed}-project` };
  const before = {};
  for (const agentId of ['agent-a', 'agent-b']) before[agentId] = await readMemory({ episodes, db, agentId, scope });
  const escalation = await verbal.requestEscalation({ db, trigger: 'AMBIGUOUS_INTENT',
    participants: ['agent-a', 'agent-b'], domain: 'navigation',
    unresolvedQuestion: `How should friends share the verified route map for ${input.seed}?` });
  await verbal.markMicroExhausted({ db, escalationId: escalation.id, outcome: 'failed' });
  const session = await dialogue.openDialogue({ db, escalationId: escalation.id, tokenBudget: 500,
    maxTurns: 4, requiredArtifact: 'Commitment' });
  for (const turn of dialogueTurns(input.seed)) {
    await dialogue.appendTurn({ db, escalationId: session.id, ...turn, tokensUsed: 20 });
  }
  const sourceRef = `fixture-source:${input.seed}:${session.id}`;
  const resolved = await dialogue.closeSession({ db, escalationId: session.id, artifactKind: 'Commitment',
    artifact: { summary: 'The participants agree to share the route map with its source reference.', evidenceRefs: [sourceRef] }, ...scope });
  const after = {};
  const recalls = {};
  for (const agentId of ['agent-a', 'agent-b']) {
    after[agentId] = await readMemory({ episodes, db, agentId, scope });
    recalls[agentId] = await recall.recallForSituation({ agentId, ...scope, missionId: `future-${input.seed}`,
      kind: 'social_dialogue', goal: `share verified route map ${input.seed}` }, {}, db);
  }
  const sourceReferencePersisted = Object.values(after).every((entries) => entries.some((episode) =>
    episode.outcome?.evidenceRefs?.includes(sourceRef)));
  const sourceReferenceRecalled = Object.values(recalls).every((result) => result.episodes.some((episode) =>
    episode.outcome?.evidenceRefs?.includes(sourceRef)));
  return { escalation, session: resolved, sourceRef, sourceReferencePersisted, sourceReferenceRecalled, before, after, recalls };
}

async function readMemory(input) {
  return input.episodes.getRecentEpisodes({ agentId: input.agentId, ...input.scope, kind: 'social_dialogue', limit: 20 }, input.db);
}

function armLimitations(arm) {
  const common = ['Existing dialogue service has no independently verifiable delivery-receipt path.',
    'The bounded session is manually triggered; autonomous world-event initiation is not implemented by this probe.'];
  if (arm === 'llm-with-memory') common.push('No model/provider configuration was supplied; no LLM call was made.');
  if (arm !== DIAGNOSTIC_ARM) common.push(`The ${arm} comparator has no implemented V2-01 service path and was not mapped to another arm.`);
  if (arm === DIAGNOSTIC_ARM) common.push('This service diagnostic does not implement the complete GenOS-full arm semantics.');
  return common;
}

function reportFor({ input, observation, evidenceRef, configHash, durationMs, limitations, startedAt }) {
  const comparison = { eventsHash: digest({ seed: input.seed, turns: dialogueTurns(input.seed) }),
    budgetHash: digest({ tokenBudget: 500, maxTurns: 4 }), permissionsHash: digest({ participants: ['agent-a', 'agent-b'], consent: 'explicit-fixture' }) };
  return {
    campaignId: 'socialworld-v2', scenario: 'V2-01', arm: input.arm,
    seed: input.seed, attempt: input.attempt, sourceCommit: commitOf(input.sourceCommit), runtimeVersion: '3', model: null,
    configHash, status: 'inconclusive', startedAt, durationMs,
    inputs: { processBoundaries: input.arm === DIAGNOSTIC_ARM ? 1 : 0,
      requestedArm: input.arm, databaseMode: input.arm === DIAGNOSTIC_ARM ? 'isolated-memory' : 'not-run', comparison },
    observed: observation,
    oracle: { recalculable: false, status: 'inconclusive', checks: observation.checks,
      reason: 'Memory mutation and recall were observed, but required delivery receipts and arm isolation are unavailable.' },
    evidenceRefs: [evidenceRef], violations: [], limitations
  };
}

function summarize(observation) {
  const memories = observation?.service?.after || {};
  const recall = observation?.service?.recalls || {};
  const participants = ['agent-a', 'agent-b'];
  const mutatedForBoth = participants.every((id) => (memories[id]?.length || 0) > (observation.service.before[id]?.length || 0));
  const recalledForBoth = participants.every((id) => (recall[id]?.episodes?.length || 0) > 0);
  const turns = observation.service.session?.turns || [];
  const alternating = turns.length >= 4 && turns.slice(0, 4).every((turn, index) => turn.speaker === (index % 2 ? 'agent-b' : 'agent-a'));
  const checked = { fourAlternatingTurns: alternating, memoryMutatedForBoth: mutatedForBoth,
    sourceReferencePersisted: observation.service.sourceReferencePersisted === true
      && observation.service.sourceReferenceRecalled === true,
    recalledForBoth: recalledForBoth, verifiedDeliveryReceipts: false, armIsolationVerified: false };
  return { checks: checked, turnCount: turns.length, memoryCountsBefore: countEpisodes(observation.service.before),
    memoryCountsAfter: countEpisodes(memories), recallCounts: countRecalls(recall), servicesExecuted: observation.servicesExecuted };
}

function countEpisodes(entries) {
  return Object.fromEntries(Object.entries(entries || {}).map(([id, list]) => [id, list.length]));
}

function countRecalls(entries) {
  return Object.fromEntries(Object.entries(entries || {}).map(([id, result]) => [id, result.episodes?.length || 0]));
}

async function runScenario(input) {
  const invalidReason = validateInput(input);
  if (invalidReason) return unsupportedResult(input || {}, invalidReason);
  if (!EXECUTABLE_ARMS.includes(input.arm) && input.arm !== DIAGNOSTIC_ARM) {
    return persistUnsupportedArm(input);
  }
  const startedAt = new Date().toISOString();
  const started = Date.now();
  let db;
  try {
    const { getDatabase } = require('../../../../backend/src/db');
    db = await getDatabase(':memory:');
    const service = await executeServices(input, db);
    const evidence = { scenario: 'V2-01', arm: input.arm, seed: input.seed, attempt: input.attempt,
      execution: { executed: true }, service,
      interpretation: 'Bounded service diagnostic; sourceRef is a test fixture, not a delivery receipt.' };
    const observation = summarize({ service,
      servicesExecuted: ['requestEscalation', 'markMicroExhausted', 'openDialogue', 'appendTurn', 'closeSession', 'recordEpisode', 'recallForSituation'] });
    const result = await persistResult({ input, evidence, observation, startedAt, started });
    return result;
  } catch (error) {
    return persistResult({ input, evidence: { scenario: 'V2-01', arm: input.arm, execution: { executed: false },
      error: error.message }, observation: { checks: { serviceExecuted: false, verifiedDeliveryReceipts: false,
      armIsolationVerified: false }, servicesExecuted: [] }, startedAt, started });
  } finally {
    if (db) await require('../../../../backend/src/db').closeDatabase();
  }
}

async function persistUnsupportedArm(input) {
  const observation = { checks: { serviceExecuted: false, verifiedDeliveryReceipts: false, armIsolationVerified: false },
    servicesExecuted: [], unsupportedArm: input.arm };
  return persistResult({ input, evidence: { scenario: 'V2-01', arm: input.arm, unsupported: true,
    reason: `No V2-01 runtime implementation exists for ${input.arm}; no other arm was substituted.` },
    observation, startedAt: new Date().toISOString(), started: Date.now() });
}

async function persistResult(values) {
  const { input, evidence, observation, startedAt, started } = values;
  const fsPath = path.resolve(input.outputDirectory);
  fs.mkdirSync(fsPath, { recursive: true });
  const runDirectory = path.join(fsPath, `v2-01-${crypto.randomUUID()}`);
  fs.mkdirSync(runDirectory, { recursive: false });
  const evidencePath = path.join(runDirectory, 'evidence.json');
  const reportPath = path.join(runDirectory, 'report.json');
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  const hash = digest({ scenario: 'V2-01', seed: input.seed, arm: input.arm, attempt: input.attempt });
  const report = reportFor({ input, observation, evidenceRef: path.relative(fsPath, evidencePath), configHash: hash,
    durationMs: Date.now() - started, limitations: armLimitations(input.arm), startedAt });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  return { report, evidence, reportPath, evidencePath };
}

function unsupportedResult(input, reason) {
  return { report: { campaignId: 'socialworld-v2', scenario: 'V2-01', arm: String(input.arm || 'unknown'),
    seed: input.seed || 'unknown', attempt: Number.isSafeInteger(input.attempt) && input.attempt > 0 ? input.attempt : 1,
    sourceCommit: commitOf(input.sourceCommit), runtimeVersion: '3', model: null,
    configHash: digest({ scenario: 'V2-01', unsupported: reason }), status: 'inconclusive', startedAt: new Date().toISOString(),
    durationMs: 0, inputs: {}, observed: {}, oracle: { recalculable: false, status: 'inconclusive', reason },
    evidenceRefs: [], violations: [], limitations: [reason] }, evidence: { unsupported: true, reason } };
}

module.exports = { REGISTERED_ARMS, EXECUTABLE_ARMS, SUPPORTED_ARMS: REGISTERED_ARMS, runScenario, validateInput, dialogueTurns };
