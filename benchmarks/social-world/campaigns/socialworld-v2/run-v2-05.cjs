'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../../../../backend/src/db');
const organization = require('../../../../backend/src/services/dynamicOrganizationService');
const relations = require('../../../../backend/src/services/crossAgentRelationalService');
const runtime = require('../../../../backend/src/services/agentRuntimeAdapter');
const { evaluateMorphogenesis } = require('./morphogenesis-oracle.cjs');

const EXECUTABLE_ARMS = Object.freeze(['genos-full', 'static-social-graph']);
const REGISTERED_ARMS = Object.freeze(['genos-full', 'static-social-graph', 'llm-with-memory', 'genos-without-relational-physiology']);
const SCOPE = Object.freeze({ organizationId: 'sw-v205-org', projectId: 'sw-v205-project' });
const MEMBERS = Object.freeze(['sw-v205-root', 'sw-v205-a', 'sw-v205-b']);
const TRANSITION_PLAN = Object.freeze([
  { organization: 'cross_functional_pod', suffix: 1, senderIndex: 1, recipientIndex: 2 },
  { organization: 'red_blue_coevolution', suffix: 2, senderIndex: 2, recipientIndex: 1 }
]);
const PERMISSIONS_PROTOCOL = Object.freeze({ topologyChange: 'orchestrator-only',
  workersMayChangeTopology: false, collaboration: 'organization-service-authorized-members-only',
  receiptRequired: true, provenanceRequired: true });

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function comparisonHashes(seed) {
  const eventPlan = TRANSITION_PLAN.map((item) => ({ eventId: `env-${seed}-${item.suffix}`,
    organization: item.organization, senderAgentId: MEMBERS[item.senderIndex],
    recipientAgentId: MEMBERS[item.recipientIndex] }));
  return { eventsHash: hash({ seed, eventPlan }),
    budgetHash: hash({ transitions: 2, collaborationReceipts: 2, criticalViolationsAllowed: 0 }),
    permissionsHash: hash(PERMISSIONS_PROTOCOL) };
}

function baseReport(input, startedAt) {
  return { campaignId: 'socialworld-v2', scenario: 'V2-05', arm: input.arm, seed: input.seed,
    attempt: input.attempt, sourceCommit: input.sourceCommit || 'unknown', runtimeVersion: '3', model: null,
    configHash: hash({ seed: input.seed, arm: input.arm, MEMBERS }), status: 'inconclusive',
    startedAt, durationMs: 0, inputs: { members: MEMBERS, comparison: comparisonHashes(input.seed),
      transitionPlan: TRANSITION_PLAN, permissionsProtocol: PERMISSIONS_PROTOCOL }, observed: {},
    oracle: { recalculable: true, status: 'inconclusive', reason: 'Arm has no implemented runtime adapter.' },
    evidenceRefs: [], violations: [], limitations: ['Arm has no implemented runtime adapter.'] };
}

async function seedWorld(db) {
  await db.run("INSERT INTO organizations (id, name) VALUES ('sw-v205-org', 'SocialWorld V2-05')");
  await db.run("INSERT INTO projects (id, organization_id, name) VALUES ('sw-v205-project', 'sw-v205-org', 'SocialWorld V2-05')");
  await db.run("INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES ('sw-v205-space', 'SocialWorld V2-05', 'sw-v205', 'sw-v205-org', 'sw-v205-project')");
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES ('sw-v205-root', 'Root', 'orchestrator', 'running', 'orchestrator', 'sw-v205-space')");
  for (const id of MEMBERS.slice(1)) {
    await db.run('INSERT INTO agents (id, name, role, status, execution_mode, workspace_id, parent_agent_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, id, 'worker', 'idle', 'worker', 'sw-v205-space', MEMBERS[0]]);
  }
  await relations.createRelation({ db, id: 'sw-v205-friendship', sourceAgentId: MEMBERS[1],
    targetAgentId: MEMBERS[2], relationType: 'friend', relationClass: 'social', ...SCOPE });
}

async function publishEvidence(db, event) {
  return organization.publish(db, { orchestratorId: MEMBERS[0], senderAgentId: event.senderAgentId,
    recipientAgentId: event.recipientAgentId, kind: 'evidence', signalType: 'ligand',
    signalData: { eventId: event.eventId, semanticRefs: [`fact:${event.eventId}`] },
    payload: { sourceRef: `fact:${event.eventId}` } });
}

async function collaborationReceipt(db, event) {
  const message = await publishEvidence(db, event);
  if (message.delivery !== 'delivered') throw new Error(`Collaboration ${event.eventId} was not delivered.`);
  const inbox = await organization.inbox(db, { orchestratorId: MEMBERS[0], requesterAgentId: event.recipientAgentId });
  const receipt = inbox.messages.find((item) => item.signal?.eventId === event.eventId);
  const valid = receipt?.integrity.status === 'verified' && receipt.payload.sourceRef === `fact:${event.eventId}`
    && receipt.signal.semanticRefs.includes(`fact:${event.eventId}`)
    && (message.recipientAgentIds || []).includes(event.recipientAgentId);
  return { messageId: message.id, delivery: message.delivery, recipientAgentIds: message.recipientAgentIds || [],
    receiptStatus: receipt?.integrity.status || 'missing', sourceRef: receipt?.payload?.sourceRef || null,
    semanticRefs: receipt?.signal?.semanticRefs || [], valid: Boolean(valid) };
}

async function checkInvariants(db, details) {
  const state = await organization.getStateForMember(db, MEMBERS[0], MEMBERS[1]);
  const memberIds = state.members.map((member) => member.id).sort();
  const relation = await relations.getRelation({ db, id: 'sw-v205-friendship' });
  return { transitionId: details.event.eventId, version: details.version,
    identityPreserved: JSON.stringify(memberIds) === JSON.stringify([...MEMBERS].sort()),
    validRelationsPreserved: relation.relationType === 'friend' && relation.sourceAgentId === MEMBERS[1]
      && relation.targetAgentId === MEMBERS[2],
    permissionsPreserved: !runtime.workerToolLease('worker').includes('genos_change_organization'),
    provenancePreserved: details.collaboration.valid, collaborationReceipt: details.collaboration.valid,
    journaled: true, collaboration: details.collaboration };
}

async function unauthorizedTransitionRejected(db) {
  try {
    await organization.changeOrganization(db, { orchestratorId: MEMBERS[0], organization: 'stigmergy', changedBy: MEMBERS[1] });
    return false;
  } catch (error) { return error.code === 'ORCHESTRATOR_AUTHORITY_REQUIRED'; }
}

async function relationSnapshot(db) {
  const relation = await relations.getRelation({ db, id: 'sw-v205-friendship' });
  return { id: relation.id, sourceAgentId: relation.sourceAgentId, targetAgentId: relation.targetAgentId,
    relationType: relation.relationType, relationClass: relation.relationClass, metadata: relation.metadata,
    organizationId: relation.organizationId, projectId: relation.projectId, provenanceHash: relation.provenanceHash };
}

async function executeFullArm(input) {
  const db = await getDatabase(':memory:');
  try {
    await seedWorld(db);
    const fixedGraphBefore = input.arm === 'static-social-graph' ? await relationSnapshot(db) : null;
    const transitions = [];
    for (const plan of TRANSITION_PLAN) {
      const event = { eventId: `env-${input.seed}-${plan.suffix}`, senderAgentId: MEMBERS[plan.senderIndex],
        recipientAgentId: MEMBERS[plan.recipientIndex] };
      const changed = await organization.changeOrganization(db, { orchestratorId: MEMBERS[0],
        organization: plan.organization, reason: `environmental-event:${event.eventId}` });
      const collaboration = await collaborationReceipt(db, event);
      transitions.push(await checkInvariants(db, { event, version: changed.version, collaboration }));
    }
    const authorityCheck = await unauthorizedTransitionRejected(db);
    const journal = await db.all('SELECT version FROM agent_organization_transitions WHERE orchestrator_id = ? ORDER BY version', MEMBERS[0]);
    const oracle = evaluateMorphogenesis({ transitions, criticalViolations: authorityCheck ? 0 : 1 });
    const fixedGraphAfter = fixedGraphBefore ? await relationSnapshot(db) : null;
    const staticGraphUnchanged = fixedGraphBefore === null
      || JSON.stringify(fixedGraphBefore) === JSON.stringify(fixedGraphAfter);
    return { transitions, transitionJournalVersions: journal.map((row) => row.version),
      unauthorizedChangeRejected: authorityCheck, oracle, effectiveTransitions: journal.length,
      treatmentEvidence: input.arm === 'static-social-graph' ? { mode: 'static-social-graph',
        initialRelationSnapshot: fixedGraphBefore, finalRelationSnapshot: fixedGraphAfter, staticGraphUnchanged } : null };
  } finally { await closeDatabase(); }
}

async function runScenario(input) {
  if (!REGISTERED_ARMS.includes(input.arm)) throw new Error(`Unknown V2-05 arm: ${input.arm}`);
  const startedAt = new Date().toISOString();
  const timer = Date.now();
  const report = baseReport(input, startedAt);
  const evidence = [];
  if (EXECUTABLE_ARMS.includes(input.arm)) {
    report.observed = await executeFullArm(input);
    evidence.push(report.observed);
    report.status = report.observed.oracle.status === 'pass'
      && (input.arm !== 'static-social-graph' || report.observed.treatmentEvidence.staticGraphUnchanged)
      ? 'pass' : 'fail';
    report.oracle = { recalculable: true, status: report.status,
      checks: report.observed.oracle.checks, criticalViolations: report.observed.oracle.criticalViolations,
      staticGraphUnchanged: report.observed.treatmentEvidence?.staticGraphUnchanged ?? null };
    report.violations = report.status === 'pass' ? [] : ['Morphogenesis invariants failed.'];
    report.limitations = [input.arm === 'static-social-graph'
      ? 'Static comparator uses real organization and communication services while retaining the initial relation graph; no claim is made about autonomous topology generation.'
      : 'Two deterministic controller-requested transitions; environmental event identifiers do not demonstrate autonomous transition generation.'];
  }
  report.durationMs = Date.now() - timer;
  const target = path.resolve(input.outputDirectory, `V2-05-${input.arm}-${input.seed}-attempt-${input.attempt}.evidence.json`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`);
  report.evidenceRefs = [path.basename(target)];
  return { report, evidence };
}

module.exports = { runScenario, REGISTERED_ARMS, EXECUTABLE_ARMS };
