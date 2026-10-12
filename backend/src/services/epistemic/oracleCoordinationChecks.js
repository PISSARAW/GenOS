'use strict';

const { isDeepStrictEqual } = require('node:util');
const { createHash } = require('node:crypto');

const STRATEGIES = new Set(['delegation_manifest_map', 'delegation_child_scan']);

function check(subject, strategy) {
  const valid = strategy === 'delegation_manifest_map'
    ? checkByManifestMap(subject) : checkByChildScan(subject);
  return { schema: 'genos.native-observation-postconditions/v1',
    status: valid ? 'verified' : 'refuted',
    reason: valid ? 'persisted_child_runs_and_evidence_recomputed' : failureReason(subject, strategy), strategy };
}

function checkByManifestMap(subject) {
  if (!validSubject(subject)) return false;
  const evidence = subject.result.coordinationEvidence.children;
  const byId = new Map(evidence.map((child) => [child.summary?.childId, child]));
  const expectedIds = subject.result.childSummaries.map((summary) => summary.childId);
  return expectedIds.length === evidence.length && new Set(expectedIds).size === expectedIds.length
    && subject.method.parameters.children.every((expected, index) => {
      const observed = byId.get(expectedIds[index]);
      return validChild({ expected, summary: subject.result.childSummaries[index], observed,
        parentId: subject.result.coordinationEvidence.parentId,
        parentMissionId: subject.result.coordinationEvidence.missionId });
    }) && validParentReceipt(subject);
}

function checkByChildScan(subject) {
  if (!validSubject(subject)) return false;
  const manifest = subject.method.parameters.children;
  const summaries = subject.result.childSummaries;
  const observed = subject.result.coordinationEvidence.children;
  if (summaries.length !== manifest.length || observed.length !== manifest.length) return false;
  for (let index = 0; index < manifest.length; index += 1) {
    let match = null;
    for (const child of observed) if (child.summary?.childId === summaries[index].childId) match = child;
    if (!validChild({ expected: manifest[index], summary: summaries[index], observed: match,
      parentId: subject.result.coordinationEvidence.parentId,
      parentMissionId: subject.result.coordinationEvidence.missionId })) return false;
  }
  return validParentReceipt(subject);
}

function validSubject(subject) {
  const manifest = subject?.method?.parameters?.children;
  const summaries = subject?.result?.childSummaries;
  const evidence = subject?.result?.coordinationEvidence?.children;
  return subject?.method?.methodId === 'coordinate_children' && Array.isArray(manifest)
    && manifest.length > 0 && Array.isArray(summaries) && Array.isArray(evidence);
}

function validChild(input) {
  return failureReasonForChild(input) === null;
}

function failureReasonForChild(input) {
  const { expected, summary, observed, parentId, parentMissionId } = input;
  const checks = [checkChildSummary(summary, observed), checkChildParent(observed, parentId, parentMissionId),
    checkChildMission(observed, parentMissionId), checkChildRun(observed), checkChildContract(observed, expected),
    checkChildArtifact(observed), checkChildReferences(summary, observed)];
  return checks.find(Boolean) || null;
}

function checkChildSummary(summary, observed) {
  if (!observed) return 'child_run_snapshot_missing';
  return !summary?.childId || summary.childId !== observed.summary?.childId
    || summary.outcome !== 'success' || !isDeepStrictEqual(summary, observed.summary) ? 'child_summary_not_bound' : null;
}

function checkChildParent(observed, parentId, missionId) {
  return observed.agentParentId !== parentId || observed.parentWorkerId !== parentId
    || observed.parentId !== parentId || observed.parentMissionId !== missionId ? 'child_parent_binding_mismatch' : null;
}

function checkChildMission(observed, missionId) {
  return observed.missionId !== missionId ? 'child_mission_binding_mismatch' : null;
}

function checkChildRun(observed) {
  return !observed.runId || observed.runId !== observed.terminalRunId
    || observed.runId !== observed.evidenceRunId || observed.runStatus !== 'completed' ? 'child_terminal_run_mismatch' : null;
}

function checkChildContract(observed, expected) {
  return observed.workerKind !== expected.workerKind
    || !isDeepStrictEqual(observed.methodContract, expected.methodContract) ? 'child_contract_mismatch' : null;
}

function checkChildArtifact(observed) {
  return observed.outcome !== 'success' || observed.artifactType !== observed.requiredArtifact ? 'child_artifact_invalid' : null;
}

function checkChildReferences(summary, observed) {
  return !Array.isArray(observed.sourceRefs) || !observed.sourceRefs.length
    || !isDeepStrictEqual(summary.evidence, observed.sourceRefs) ? 'child_evidence_references_mismatch' : null;
}

function failureReason(subject, strategy) {
  if (!validSubject(subject)) return 'coordination_subject_invalid';
  const summaries = subject.result.childSummaries;
  const observed = subject.result.coordinationEvidence.children;
  const parentId = subject.result.coordinationEvidence.parentId;
  const parentMissionId = subject.result.coordinationEvidence.missionId;
  for (let index = 0; index < subject.method.parameters.children.length; index += 1) {
    const summary = summaries[index];
    const child = strategy === 'delegation_manifest_map'
      ? observed.find((entry) => entry.summary?.childId === summary?.childId)
      : scanChild(observed, summary?.childId);
    const reason = failureReasonForChild({ expected: subject.method.parameters.children[index],
      summary, observed: child, parentId, parentMissionId });
    if (reason) return reason;
  }
  return parentClaimFailure(subject) || 'coordination_evidence_verified';
}

function scanChild(children, childId) {
  let match = null;
  for (const child of children) if (child.summary?.childId === childId) match = child;
  return match;
}

function validParentReceipt(subject) {
  return parentClaimFailure(subject) === null;
}

function parentClaimFailure(subject) {
  const summaries = subject.result.childSummaries;
  const receipt = subject.result.coordinationReceipt;
  if (!isDeepStrictEqual(receipt?.methodContract, subject.method)) return 'parent_execution_receipt_contract_mismatch';
  const receiptError = validateReceiptPayload(receipt, summaries);
  if (receiptError) return receiptError;
  return validateParentClaim(subject, receipt, summaries);
}

function validateReceiptPayload(receipt, summaries) {
  const serializedMethod = parseJson(receipt.methodContractJson);
  if (!serializedMethod) return 'parent_execution_receipt_serialization_invalid';
  if (!isDeepStrictEqual(serializedMethod, receipt.methodContract)) return 'parent_execution_receipt_serialization_mismatch';
  const inputDigest = hash(receipt.methodContractJson);
  const payload = parseJson(receipt.payloadJson);
  if (!payload) return 'parent_execution_receipt_payload_invalid';
  if (payload.inputDigest !== inputDigest || !isDeepStrictEqual(payload.output, { childSummaries: summaries })) {
    return 'parent_execution_receipt_payload_mismatch';
  }
  if (receipt.inputDigest !== `sha256:${inputDigest}`) return 'parent_execution_receipt_input_mismatch';
  return receipt.id === `solver://sha256:${hash(receipt.payloadJson)}` ? null : 'parent_execution_receipt_id_mismatch';
}

function validateParentClaim(subject, receipt, summaries) {
  const claim = subject.result.claims?.[0];
  if (claim?.statement !== `${summaries.length} persisted children completed with validated evidence.`) return 'parent_claim_statement_mismatch';
  if (!isDeepStrictEqual(receipt.result, { childSummaries: summaries })) return 'parent_execution_receipt_output_mismatch';
  const expected = [...new Set([receipt.id, ...summaries.flatMap((item) => item.evidence)])];
  return isDeepStrictEqual(claim.evidence, expected) ? null : 'parent_claim_evidence_mismatch';
}

function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function parseJson(value) { try { return JSON.parse(value); } catch (_) { return null; } }

module.exports = { STRATEGIES, check };
