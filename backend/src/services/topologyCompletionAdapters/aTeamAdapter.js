'use strict';

const { baseDossier } = require('./dossier');
const stateReader = require('./aTeamStateReader');
const { digest } = require('../evidenceContractService');
const { evaluateQualityGate } = require('../aTeamQualityGateService');

function incomplete(base, reason) {
  return { ...base, lifecycleState: 'completed', topologyValidation: {
    status: 'partial', reasons: [reason] }, invariants: [], oracle: null };
}

function failed(base, reason, state = {}) {
  return { ...base, lifecycleState: 'completed', topologyValidation: {
    status: 'failed', reasons: [reason] }, invariants: [{ id: reason, passed: false,
    teamRunId: state.run?.teamRunId || null }], oracle: null };
}

function assessment(status, reason) {
  return { status, reason };
}

function completionAssessment(completion) {
  if (!completion) return assessment('partial', 'ateam_completion_receipt_missing');
  if (completion.verdict !== 'succeeded' || completion.success !== true) {
    return assessment('failed', 'ateam_completion_receipt_inconsistent');
  }
  const checks = Object.values(completion.closureChecks || {});
  return checks.length && checks.every((value) => value === true)
    ? assessment('verified') : assessment('failed', 'ateam_completion_checks_inconsistent');
}

function integrationAssessment(integration) {
  if (!integration) return assessment('partial', 'ateam_integration_review_missing');
  if (integration.accepted !== true) return assessment('failed', 'ateam_integration_rejected');
  return completionAssessment(integration.completion);
}

function terminalAssessment(state) {
  const { run } = state;
  if (['FAILED', 'CANCELLED'].includes(run.status)) return assessment('failed', 'ateam_run_failed');
  if (run.status !== 'COMPLETED') return assessment('partial', 'ateam_run_not_terminal');
  if (run.phase !== 'DEBRIEF') return assessment('partial', 'ateam_debrief_missing');
  return integrationAssessment(run.execution?.integration);
}

function memberNodes(state, member) {
  return state.graph.nodes.filter((node) => node.memberId === member.memberId);
}

function roleAssessment(members) {
  if (members.some((member) => !member.memberId || !member.workerId || !member.role)) {
    return assessment('partial', 'ateam_role_assignment_missing');
  }
  const identities = members.flatMap((member) => [member.memberId, member.workerId]);
  return new Set(identities).size === identities.length
    ? assessment('verified') : assessment('failed', 'ateam_role_identity_ambiguous');
}

function memberPlanAssessment(state, member) {
  const owned = memberNodes(state, member);
  if (!owned.length) return assessment('partial', 'ateam_planned_role_without_work');
  if (owned.some((node) => node.ownerAgentId !== member.workerId)) {
    return assessment('failed', 'ateam_work_owner_mismatch');
  }
  if (owned.some((node) => node.status !== 'SUCCEEDED')) {
    return assessment('failed', 'ateam_work_node_not_succeeded');
  }
  const missing = owned.some((node) => !Array.isArray(node.evidenceRefs) || !node.evidenceRefs.length);
  return missing ? assessment('partial', 'ateam_execution_evidence_missing') : assessment('verified');
}

function planAssessment(state) {
  const members = Array.isArray(state.run.members) ? state.run.members : [];
  const nodes = Array.isArray(state.graph.nodes) ? state.graph.nodes : [];
  if (members.length < 2 || !nodes.length) return assessment('partial', 'ateam_plan_missing');
  const roles = roleAssessment(members);
  if (roles.status !== 'verified') return roles;
  if (state.graph.status !== 'SUCCEEDED') return assessment('failed', 'ateam_work_graph_not_promoted');
  for (const member of members) {
    const check = memberPlanAssessment(state, member);
    if (check.status !== 'verified') return check;
  }
  return assessment('verified');
}

function sameSet(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function memberEvidenceRefs(state, member) {
  return [...new Set(memberNodes(state, member).flatMap((node) => node.evidenceRefs || []))].sort();
}

function auditByWorker(audit) {
  return new Map((audit.reports || []).map((report) => [report.workerId, report]));
}

function identityAssessment(state, audit) {
  if (!Array.isArray(audit.identities)) return assessment('partial', 'ateam_audit_identities_missing');
  for (const member of state.run.members) {
    const identity = audit.identities.find((item) => item.workerId === member.workerId);
    if (!identity) return assessment('partial', 'ateam_audit_identity_missing');
    if (identity.memberId !== member.memberId || identity.role !== member.role) {
      return assessment('failed', 'ateam_audit_identity_mismatch');
    }
  }
  return assessment('verified');
}

function reportAssessment(state, audit) {
  if (!Array.isArray(audit.reports)) return assessment('partial', 'ateam_review_reports_missing');
  const reports = auditByWorker(audit);
  if (reports.size !== state.run.members.length) return assessment('partial', 'ateam_review_report_missing');
  for (const member of state.run.members) {
    const report = reports.get(member.workerId);
    if (!report?.report) return assessment('partial', 'ateam_review_report_missing');
    if (report.promoted !== true) return assessment('failed', 'ateam_review_rejected');
    const reviewed = Array.isArray(report.evidenceRefs) ? [...new Set(report.evidenceRefs)].sort() : [];
    if (!sameSet(reviewed, memberEvidenceRefs(state, member))) {
      return assessment('failed', 'ateam_review_evidence_mismatch');
    }
  }
  return assessment('verified');
}

function reviewAssessment(state) {
  const integration = state.run.execution.integration;
  const { audit, gate, failures } = integration;
  if (!audit || !gate) return assessment('partial', 'ateam_integration_review_missing');
  if (audit.complete !== true) return assessment('failed', 'ateam_audit_incomplete');
  const identity = identityAssessment(state, audit);
  if (identity.status !== 'verified') return identity;
  const reports = reportAssessment(state, audit);
  if (reports.status !== 'verified') return reports;
  const observerReport = failures?.observerReport;
  if (!observerReport) return assessment('partial', 'ateam_independent_review_missing');
  const expected = evaluateQualityGate({ capabilityCoverage: state.run.execution.coverage }, observerReport);
  if (gate.passed !== true || expected.passed !== true) return assessment('failed', 'ateam_quality_gate_failed');
  return assessment('verified');
}

function proofRecord(base, state, member) {
  const report = auditByWorker(state.run.execution.integration.audit).get(member.workerId);
  const refs = memberEvidenceRefs(state, member);
  const content = { schema: 'genos.ateam-canonical-closure-proof/v1',
    missionId: base.missionId, teamRunId: state.run.teamRunId,
    workGraphId: state.graph.workGraphId, workerId: member.workerId,
    role: member.role,
    result: { status: 'completed', verified: true },
    reportHash: digest(report.report), sourceEvidenceRefs: refs };
  const proof = { reference: digest(content), content, source: 'a_team_canonical_runtime' };
  return { member: { memberId: member.workerId, status: 'completed', evidenceRefs: [proof.reference] }, proof };
}

function independentOracle(base, state, records) {
  const integration = state.run.execution.integration;
  const receipt = { schema: 'genos.ateam-canonical-observer/v1', missionId: base.missionId,
    teamRunId: state.run.teamRunId, workGraphId: state.graph.workGraphId,
    observerReportHash: digest(integration.failures.observerReport),
    qualityGateHash: digest(integration.gate), auditHash: digest(integration.audit) };
  return { status: 'verified', independent: true,
    verifierIds: ['a-team-integration-observer'],
    evidenceRefs: records.map((record) => record.proof.reference),
    receipt, receiptHash: digest(receipt) };
}

function verifiedDossier(base, state) {
  const records = state.run.members.map((member) => proofRecord(base, state, member));
  return { ...base, lifecycleState: 'completed', producerId: base.missionId,
    roster: { requiredMemberIds: records.map((record) => record.member.memberId),
      members: records.map((record) => record.member),
      evidenceProofs: records.map((record) => record.proof) },
    topologyValidation: { status: 'verified', reasons: [] }, barrierStatus: 'complete',
    invariants: [
      { id: 'ateam_mission_run_scope', passed: true, teamRunId: state.run.teamRunId },
      { id: 'ateam_roles_and_plan', passed: true, workGraphId: state.graph.workGraphId },
      { id: 'ateam_execution_promoted', passed: true },
      { id: 'ateam_independent_review', passed: true }
    ], oracle: independentOracle(base, state, records) };
}

async function build(input = {}) {
  const base = baseDossier(input);
  const state = await stateReader.read({ db: input.context?.db,
    missionId: base.missionId, context: input.context });
  if (state.status === 'failed') return failed(base, state.reason, state);
  if (state.status !== 'read') return incomplete(base, state.reason);
  for (const check of [terminalAssessment(state), planAssessment(state), reviewAssessment(state)]) {
    if (check.status === 'failed') return failed(base, check.reason, state);
    if (check.status !== 'verified') return incomplete(base, check.reason);
  }
  return verifiedDossier(base, state);
}

module.exports = Object.freeze({ id: 'a-team-completion-v1', topology: 'a_team',
  specialized: true, build });
