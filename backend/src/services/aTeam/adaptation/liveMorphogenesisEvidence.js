'use strict';

const crypto = require('node:crypto');
const { digest } = require('../../evidenceProtocol/canonical');
const ledger = require('../../gvxLedgerIntegrity');
const qualityStore = require('../../qualityElevation/qualityReceiptStore');
const { fail } = require('./liveMorphogenesisPolicy');

function sign(body) {
  ledger.assertSigningKeyConfigured();
  const recordDigest = digest(body);
  return { ...body, recordDigest, controlPlaneMac: ledger.macEvent(recordDigest) };
}

function authentic(record) {
  if (!record || !/^[a-f0-9]{64}$/.test(record.controlPlaneMac || '')) return false;
  const { recordDigest, controlPlaneMac, ...body } = record;
  const expected = ledger.macEvent(digest(body));
  return recordDigest === digest(body) && typeof expected === 'string'
    && crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(controlPlaneMac, 'hex'));
}

async function sourceQuality(db, run, member) {
  const binding = await require('../../biologicalWorkerStore').latestBindingForMission(db, {
    missionId: run.execution.runtimeMissionId, workerId: member.workerId });
  if (!binding) return null;
  const execution = await db.get('SELECT id,status FROM strategy_execution_runs WHERE id=? AND agent_id=?',
    binding.runId, member.workerId);
  if (execution?.status !== 'completed') return null;
  const found = await qualityStore.get(db, { runId: execution.id,
    contractDigest: member.qualityElevation?.digest });
  if (!found) return null;
  assertSourceIdentity({ run, member, found });
  await assertSourceReport(db, member, found.receipt);
  return observedQuality(run, found);
}

function observedQuality(run, found) {
  const receipt = found.receipt;
  const automatic = require('./liveMorphogenesisAutomaticPolicy').enabled(run.adaptiveMorphogenesis);
  const configured = run.adaptiveMorphogenesis.defectCodes || (automatic ? null : ['DELIVERABLE_INCOMPLETE']);
  const codes = configured && new Set(configured);
  const failures = found.session.versions.filter(version => !version.passed)
    .flatMap(version => version.defects || []).filter(defect => !codes || codes.has(defect.code));
  return { runId: receipt.runId, receiptId: receipt.receiptId, receiptDigest: digest(receipt),
    sessionDigest: receipt.sessionDigest, artifactDigest: receipt.artifactDigest,
    ...(automatic ? { signals: budgetSignal(run, found.session) } : {}),
    defects: failures.map(defect => ({ code: defect.code, message: defect.message || '' })) };
}

function budgetSignal(run, session) {
  const threshold = run.adaptiveMorphogenesis.budgetPressureRatio;
  if (threshold === undefined) return [];
  const measuredTokens = session.budget.tokens, limit = session.contract.budgetMaxTokens;
  if (session.budget.usageComplete !== true || !Number.isSafeInteger(measuredTokens) || measuredTokens <= 0
    || !Number.isSafeInteger(limit) || limit <= 0 || measuredTokens > limit) {
    throw fail('ATEAM_AUTO_MORPH_USAGE_UNVERIFIED', 'Resource signals need complete authenticated quality usage within budget.');
  }
  const ratio = measuredTokens / limit;
  return ratio >= threshold ? [{ code: 'GQEL_BUDGET_PRESSURE', measuredTokens, limit, ratio, threshold }] : [];
}

function triggered(source) { return Boolean(source?.defects.length || source?.signals?.length); }

async function assertSourceReport(db, member, receipt) {
  const dossier = await require('../../aTeamHandoffEvidenceService').telemetryDossier(db, member.workerId);
  const checked = require('../execution/teamEvidenceService').validateMemberEvidence({ ...member,
    executionRunId: receipt.runId }, dossier);
  if (!checked.promoted || checked.report.qualityElevationReceipt?.receiptId !== receipt.receiptId) {
    throw fail('ATEAM_LIVE_MORPH_SOURCE_INVALID', 'The exact source report must still pass its quality and handoff gates.');
  }
}

function assertSourceIdentity(scope) {
  const { run, member, found } = scope, receipt = found.receipt;
  if (receipt.agentId !== member.workerId || receipt.missionId !== run.execution.runtimeMissionId
    || !receipt.qualityAccepted || found.session.status !== 'promoted') {
    throw fail('ATEAM_LIVE_MORPH_SOURCE_INVALID', 'The trigger must be a completed, authenticated quality execution in this mission.');
  }
}

function rosterHash(members) { return digest(members); }
function graphShape(graph) {
  const nodes = graph.nodes.map(node => ({ nodeId: node.nodeId, memberId: node.memberId,
    ownerAgentId: node.ownerAgentId, responsibility: node.responsibility, domain: node.domain,
    requiredCapabilities: node.requiredCapabilities, inputs: node.inputs, outputs: node.outputs }));
  const edges = graph.edges.map(edge => ({ fromNode: edge.fromNode, toNode: edge.toNode,
    blocking: edge.blocking, contractType: edge.contractType }));
  return digest({ nodes, edges });
}

module.exports = { sign, authentic, sourceQuality, rosterHash, graphShape, digest, triggered };
