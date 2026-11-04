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
  const receipt = found.receipt;
  const codes = new Set(run.adaptiveMorphogenesis.defectCodes || ['DELIVERABLE_INCOMPLETE']);
  const failures = found.session.versions.filter(version => !version.passed)
    .flatMap(version => version.defects || []).filter(defect => codes.has(defect.code));
  return { runId: execution.id, receiptId: receipt.receiptId, receiptDigest: digest(receipt),
    sessionDigest: receipt.sessionDigest, artifactDigest: receipt.artifactDigest,
    defects: failures.map(defect => ({ code: defect.code, message: defect.message || '' })) };
}

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

module.exports = { sign, authentic, sourceQuality, rosterHash, graphShape, digest };
