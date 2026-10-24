'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../../../../backend/src/db');
const relations = require('../../../../backend/src/services/crossAgentRelationalService');
const learning = require('../../../../backend/src/services/relationOutcomeLearningService');
const routing = require('../../../../backend/src/services/communication/relationshipCommunicationRoutingService');
const { canonicalPayload, verifyReceipt } = require('./event-receipt-verifier.cjs');

const EXECUTABLE_ARMS = Object.freeze(['genos-full']);
const REGISTERED_ARMS = Object.freeze(['genos-full', 'static-social-graph', 'llm-with-memory']);
const DOMAIN = 'navigation';
const SCOPE = Object.freeze({ organizationId: 'sw-v204-org', projectId: 'sw-v204-project' });

function reportBase(values) {
  const { input, startedAt, status, reason } = values;
  return { campaignId: 'socialworld-v2', scenario: 'V2-04', arm: input.arm, seed: input.seed,
    attempt: input.attempt, sourceCommit: input.sourceCommit || 'unknown', runtimeVersion: '3', model: null,
    configHash: crypto.createHash('sha256').update(JSON.stringify({ seed: input.seed, arm: input.arm, DOMAIN })).digest('hex'),
    status, startedAt, durationMs: 0, inputs: { domain: DOMAIN, comparison: comparisonHashes(input) }, observed: {},
    oracle: { recalculable: status === 'inconclusive', status, reason },
    evidenceRefs: [], violations: [], limitations: reason ? [reason] : [] };
}

function comparisonHashes(input) {
  const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const eventPlan = [
    { eventId: `event-${input.seed}-b`, verifierId: `independent-verifier-${input.seed}`,
      recipientId: 'sw-v204-b', domain: DOMAIN, score: 0 },
    { eventId: `event-${input.seed}-c`, verifierId: `independent-verifier-${input.seed}`,
      recipientId: 'sw-v204-c', domain: DOMAIN, score: 1 }
  ];
  const permissionsProtocol = { scope: SCOPE, verifier: 'independent-key-allowlist',
    duplicateEventIds: 'reject', invalidSignatures: 'reject', unauthorizedActors: 'reject' };
  return { eventsHash: hash({ seed: input.seed, eventPlan }),
    budgetHash: hash({ acceptedOutcomes: 2, rejectedProbes: 3, maxSignedEvents: 5 }),
    permissionsHash: hash(permissionsProtocol) };
}

function sign(keys, event) {
  return { ...event, signature: crypto.sign(null, Buffer.from(canonicalPayload(event)), keys.privateKey).toString('base64') };
}

async function seedWorld(db) {
  await db.run("INSERT INTO organizations (id, name) VALUES ('sw-v204-org', 'SocialWorld V2-04')");
  await db.run("INSERT INTO projects (id, organization_id, name) VALUES ('sw-v204-project', 'sw-v204-org', 'SocialWorld V2-04')");
  await db.run("INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES ('sw-v204-space', 'SocialWorld V2-04', 'sw-v204', 'sw-v204-org', 'sw-v204-project')");
  for (const id of ['sw-v204-a', 'sw-v204-b', 'sw-v204-c', 'sw-v204-verifier']) {
    await db.run('INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES (?, ?, ?, ?, ?, ?)',
      [id, id, 'worker', 'idle', 'worker', 'sw-v204-space']);
  }
  for (const id of ['sw-v204-b', 'sw-v204-c']) {
    await relations.createRelation({ db, id: `rel-${id}`, sourceAgentId: 'sw-v204-a', targetAgentId: id,
      relationType: 'colleague', relationClass: 'organizational', ...SCOPE });
  }
}

async function route(db) {
  const items = await routing.profileAudience({ db,
    intent: { senderAgentId: 'sw-v204-a', risk: 'low', domain: DOMAIN },
    candidates: [{ agentId: 'sw-v204-b' }, { agentId: 'sw-v204-c' }], ...SCOPE });
  return items.map((item) => ({ agentId: item.agentId, trust: item.communicationProfile.trustForDomain }));
}

async function acceptReceipt(db, input) {
  const result = await db.run(`INSERT INTO evaluation_runs
    (id, benchmark, model_version, prompt_hash, config_hash, score, result_json, agent_id, organization_id, project_id)
    VALUES (?, ?, 'v2-04-independent-verifier', ?, ?, ?, ?, ?, ?, ?)`,
  [input.id, `SocialWorld:${DOMAIN}`, `prompt:${input.id}`, `config:${input.id}`, input.event.score,
    JSON.stringify({ verified: true, oracleRef: `receipt:${input.event.eventId}` }), input.event.recipientId,
    SCOPE.organizationId, SCOPE.projectId]);
  const learned = await learning.recordEvaluationOutcome({ db, relationId: `rel-${input.event.recipientId}`,
    evaluationRunId: input.id, domain: DOMAIN, ...SCOPE });
  return { evaluationId: input.id, eventId: input.event.eventId, accepted: true, trustAfter: learned.trust };
}

async function runFullArm(input, evidence) {
  const db = await getDatabase(':memory:');
  try {
    await seedWorld(db);
    const before = await route(db);
    const verifierKeys = crypto.generateKeyPairSync('ed25519');
    const unauthorizedKeys = crypto.generateKeyPairSync('ed25519');
    const verifierActorId = `independent-verifier-${input.seed}`;
    const authorizedActors = new Set([verifierActorId]);
    const seen = new Set();
    const verified = await persistedTrustedOutcomes({ db, input, verifierKeys, verifierActorId, authorizedActors, seen });
    const rejected = rejectedEvents({ input, verifierKeys, unauthorizedKeys, verifierActorId, authorizedActors,
      seen, verifierEvent: verified.verifierEvent });
    const after = await route(db);
    const rows = await db.all('SELECT id FROM evaluation_runs WHERE benchmark = ?', `SocialWorld:${DOMAIN}`);
    evidence.push({ verifierId: verifierActorId, verifierPublicKeyFingerprint: crypto.createHash('sha256')
      .update(verifierKeys.publicKey.export({ type: 'spki', format: 'der' })).digest('hex'),
    before, accepted: verified.persisted, duplicate: { accepted: rejected.duplicate.accepted, reason: rejected.duplicate.reason },
    invalid: { accepted: rejected.invalid.accepted, reason: rejected.invalid.reason },
    unauthorized: { accepted: rejected.denied.accepted, reason: rejected.denied.reason }, after,
    persistedEvaluationIds: rows.map((row) => row.id) });
    const checks = rejectionChecks(rejected);
    const onlyAcceptedPersisted = hasOnlyAcceptedRows(rows, verified.persisted);
    const routeChanged = hasChangedRoute(after);
    return { status: Object.values(checks).every(Boolean) && onlyAcceptedPersisted && routeChanged ? 'pass' : 'fail',
      before, after, ...checks,
      onlyAcceptedPersisted,
      subsequentDecisionChanged: routeChanged,
      trustBefore: before.find((item) => item.agentId === 'sw-v204-b').trust,
      trustAfter: after.find((item) => item.agentId === 'sw-v204-b').trust };
  } finally { await closeDatabase(); }
}

async function persistedTrustedOutcomes(context) {
  const { db, input, verifierKeys, verifierActorId, authorizedActors, seen } = context;
  const verifierEvent = sign(verifierKeys, { eventId: `event-${input.seed}-b`, actorId: verifierActorId,
    recipientId: 'sw-v204-b', domain: DOMAIN, score: 0 });
  const accepted = verifyReceipt({ event: verifierEvent, publicKey: verifierKeys.publicKey, authorizedActors, seenEventIds: seen });
  if (!accepted.accepted) throw new Error(`trusted receipt rejected: ${accepted.reason}`);
  const first = await acceptReceipt(db, { id: `eval-${input.seed}-b`, event: verifierEvent });
  const successEvent = sign(verifierKeys, { eventId: `event-${input.seed}-c`, actorId: verifierActorId,
    recipientId: 'sw-v204-c', domain: DOMAIN, score: 1 });
  const acceptedSuccess = verifyReceipt({ event: successEvent, publicKey: verifierKeys.publicKey, authorizedActors, seenEventIds: seen });
  if (!acceptedSuccess.accepted) throw new Error(`trusted success receipt rejected: ${acceptedSuccess.reason}`);
  const second = await acceptReceipt(db, { id: `eval-${input.seed}-c`, event: successEvent });
  return { verifierEvent, persisted: [first, second] };
}

function rejectedEvents(context) {
  const { input, verifierKeys, unauthorizedKeys, verifierActorId, authorizedActors, seen, verifierEvent } = context;
  const duplicate = verifyReceipt({ event: verifierEvent, publicKey: verifierKeys.publicKey, authorizedActors, seenEventIds: seen });
  const forgedBase = { eventId: `forged-${input.seed}`, actorId: verifierActorId,
    recipientId: 'sw-v204-c', domain: DOMAIN, score: 1 };
  const forged = { ...sign(verifierKeys, forgedBase), score: 0 };
  const invalid = verifyReceipt({ event: forged, publicKey: verifierKeys.publicKey, authorizedActors, seenEventIds: seen });
  const unauthorized = sign(unauthorizedKeys, { ...forgedBase, eventId: `unauthorized-${input.seed}`,
    actorId: 'evaluated-engine' });
  const denied = verifyReceipt({ event: unauthorized, publicKey: verifierKeys.publicKey, authorizedActors, seenEventIds: seen });
  return { duplicate, invalid, denied };
}

function rejectionChecks(rejected) {
  return { duplicateRejected: rejected.duplicate.reason === 'duplicate-event',
    invalidRejected: rejected.invalid.reason === 'invalid-signature',
    unauthorizedRejected: rejected.denied.reason === 'unauthorized-actor' };
}

function hasOnlyAcceptedRows(rows, accepted) {
  return rows.length === 2 && accepted.every((entry) => rows.some((row) => row.id === entry.evaluationId));
}

function hasChangedRoute(after) {
  return after[0].agentId === 'sw-v204-c' && after[1].agentId === 'sw-v204-b';
}

async function runScenario(input) {
  if (!REGISTERED_ARMS.includes(input.arm)) throw new Error(`Unknown V2-04 arm: ${input.arm}`);
  const startedAt = new Date().toISOString();
  const durationStarted = Date.now();
  const evidence = [];
  const report = reportBase({ input, startedAt, status: 'inconclusive', reason: 'Arm has no implemented runtime adapter.' });
  if (EXECUTABLE_ARMS.includes(input.arm)) {
    report.observed = await runFullArm(input, evidence);
    report.status = report.observed.status;
    report.oracle = { recalculable: true, status: report.status, checks: {
      duplicateRejected: report.observed.duplicateRejected, invalidRejected: report.observed.invalidRejected,
      unauthorizedRejected: report.observed.unauthorizedRejected, onlyAcceptedPersisted: report.observed.onlyAcceptedPersisted,
      subsequentDecisionChanged: report.observed.subsequentDecisionChanged } };
    report.violations = report.status === 'pass' ? [] : ['V2-04 oracle conditions were not met.'];
    report.limitations = ['Deterministic runtime probe; verifier key is generated for this benchmark invocation, not a production trust registry.'];
  }
  report.startedAt = startedAt;
  report.durationMs = Date.now() - durationStarted;
  const target = path.resolve(input.outputDirectory, `V2-04-${input.arm}-${input.seed}-attempt-${input.attempt}.evidence.json`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`);
  report.evidenceRefs = [path.basename(target)];
  return { report, evidence };
}

module.exports = { runScenario, REGISTERED_ARMS, EXECUTABLE_ARMS };
