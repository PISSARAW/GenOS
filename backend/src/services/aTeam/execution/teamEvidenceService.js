'use strict';

const { latestReport } = require('../../trinityComparativeBarrier');
const { reportIsUsable, usableEvidenceReferences } = require('../../aTeamHandoffEvidenceService');
const { validateArtifact } = require('../variants/variantExecutionService');

function validateMemberEvidence(member, dossier) {
  const report = latestReport(dossier);
  const required = member.requiredArtifacts?.length ? member.requiredArtifacts : member.outputs;
  if (!reportIsUsable(report, required || [])) return rejected('evidence_or_artifact_missing');
  const invalid = invalidReport(member, report);
  if (invalid) return invalid;
  const refs = usableEvidenceReferences(report);
  const missing = missingCriteria(member.acceptanceCriteria || [], report.acceptanceEvaluations, refs);
  if (missing.length) return rejected('acceptance_criteria_unverified', missing);
  return { promoted: true, report, evidenceRefs: refs, reason: null };
}

function invalidReport(member, report) {
  const tests = Array.isArray(report.tests) ? report.tests : [];
  if (tests.some((test) => test.passed !== true)) return rejected('test_not_passed');
  const payload = report.output ?? report.result ?? report;
  const errors = member.outputSchema ? validateArtifact(payload, member.outputSchema) : [];
  return errors.length ? rejected('output_schema_invalid', errors) : null;
}

function missingCriteria(criteria, evaluations, refs) {
  const observed = Array.isArray(evaluations) ? evaluations : [];
  const available = new Set(refs);
  return criteria.filter((criterion) => !observed.some((item) =>
    (item.criterion === criterion || item.criterionId === criterion)
    && item.passed === true && Array.isArray(item.evidenceRefs)
    && item.evidenceRefs.length > 0 && item.evidenceRefs.every((ref) => available.has(ref))));
}

function rejected(reason, details = []) {
  return { promoted: false, report: null, evidenceRefs: [], reason, details };
}

function runtimeCoverage(input) {
  const requirements = input.run.requiredCapabilities;
  const members = input.plan.members;
  const verified = members.filter((member) => input.verdicts.get(member.workerId)?.promoted === true);
  const required = requirements.map((item) => String(item.capability || item.name));
  const staffed = new Set(members.flatMap((member) => member.capabilities || []));
  const proven = new Set(verified.flatMap((member) => member.capabilities || []));
  const assigned = input.graph.nodes.filter((node) => members.some((member) => member.memberId === node.memberId && member.workerId));
  const source = 'persisted_work_graph_and_worker_evidence';
  const dimensions = {
    missionCoverage: metric(required.filter((name) => staffed.has(name)).length, required.length, source),
    staffedCoverage: metric(assigned.length, input.graph.nodes.length, source),
    runtimeToolCoverage: metric(members.filter((member) => input.statuses.get(member.workerId) === 'completed').length, members.length, source),
    verifiedCoverage: metric(required.filter((name) => proven.has(name)).length, required.length, source)
  };
  const values = Object.values(dimensions).map((value) => value.ratio);
  return { ...dimensions, ratio: values.includes(null) ? null : values.reduce((product, ratio) => product * ratio, 1),
    covered: required.filter((name) => proven.has(name)), uncovered: required.filter((name) => !proven.has(name)) };
}

function metric(numerator, denominator, source) {
  return { numerator, denominator, ratio: denominator > 0 ? numerator / denominator : null, source };
}

function executionMission(member, successCriteria = []) {
  const contract = { inputArtifacts: member.inputArtifacts || [], outputs: member.outputs || [],
    requiredArtifacts: member.requiredArtifacts || [], outputSchema: member.outputSchema || null,
    acceptanceCriteria: member.acceptanceCriteria || [], missionCriteria: successCriteria };
  return (member.mission || '') + '\n\nTEAM EXECUTION CONTRACT\n' + JSON.stringify(contract)
    + '\nReturn an evidence report with outcome, output, artifacts, tests, integrationConstraints, acceptanceEvaluations and handoffEvaluations. For each received handoff, evaluate its exact handoffId, digest and version, with passed and evidenceRefs. Each evaluated criterion must name its criterion, passed result and evidenceRefs from actual observations. Leave untested criteria unresolved; a dispatch or a policy is not proof of success.';
}

module.exports = { validateMemberEvidence, runtimeCoverage, missingCriteria, executionMission };
