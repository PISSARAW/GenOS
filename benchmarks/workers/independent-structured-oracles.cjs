'use strict';

const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

function verify(testCase, execution) {
  if (testCase.id === 'subgraph-delegation') return verifySubgraph(testCase, execution);
  if (!receiptBindsResult(execution)) return false;
  const method = execution.methodContract;
  const handlers = { adaptive_worker: verifyAdaptive, specialist: verifyNiche,
    symbiotic_worker: verifyHost, creative_worker: verifyCreative,
    medical_worker: verifyMedical, recovery_worker: verifyRecovery,
    liaison_worker: verifyHandoff, bounded_worker: verifyBounded };
  const handler = handlers[testCase.workerKind];
  if (testCase.id === 'code-postconditions') return verifyCode(testCase, method, execution);
  return Boolean(handler && handler(testCase, method, execution));
}

function verifySubgraph(testCase, execution) {
  const output = execution.result;
  const mission = output?.mission;
  const content = output?.workerArtifactContent;
  const children = testCase.methodContract?.parameters?.children;
  const receipt = content?.coordinationReceipt;
  const postconditions = mission?.oracle?.postconditions || [];
  return subgraphManifestMatches(output, mission)
    && subgraphContractMatches(testCase, execution, children)
    && subgraphMissionMatches(mission, testCase.oracle.equals)
    && subgraphOracleMatches(mission, postconditions)
    && verifiedChildEvidence({ content, children, receipt, executionReceipt: execution.receipt });
}

function subgraphManifestMatches(output, mission) {
  const expected = require('../../backend/tests/workerQualificationInventory.cjs').inventory().benchmarkDigest;
  return output?.benchmarkDigest === output?.manifest?.benchmarkDigest
    && output?.manifest?.benchmarkDigest === expected && output.manifest.runId === mission?.runId;
}

function subgraphContractMatches(testCase, execution, children) {
  return Array.isArray(children) && children.length === 2
    && execution.methodContract?.methodId === 'coordinate_children'
    && isDeepStrictEqual(execution.methodContract, testCase.methodContract);
}

function subgraphMissionMatches(mission, outcome) {
  return mission.kind === 'sub_orchestrator' && mission.passed === true
    && mission.status === 'completed' && mission.outcome === outcome
    && mission.artifact === 'dossier' && mission.artifactValidated === true
    && subgraphMissionBindings(mission);
}

function subgraphMissionBindings(mission) {
  return mission.parentBound === true && mission.executionRunBound === true
    && mission.oracleAccepted === true && mission.sourceEvidenceValidated === true
    && mission.refusalsValidated === true;
}

function subgraphOracleMatches(mission, postconditions) {
  return mission.oracle?.processes === 2 && mission.oracle.complete === true
    && mission.oracle.decisionStatus === 'completed'
    && verifiedCoordinationStrategies(postconditions, ['delegation_manifest_map', 'delegation_child_scan']);
}

function verifiedCoordinationStrategies(postconditions, expected) {
  return postconditions.length === expected.length && expected.every((strategy) =>
    postconditions.some((item) => item.strategy === strategy && item.status === 'verified'
      && item.reason === 'persisted_child_runs_and_evidence_recomputed'));
}

function verifiedChildEvidence(input) {
  const summaries = input.content?.childSummaries;
  return Array.isArray(summaries) && summaries.length === input.children.length
    && validChildRoster(input, summaries) && validChildReferences(input, summaries)
    && validParentReceipt(input, summaries);
}

function validChildRoster(input, summaries) {
  const ids = summaries.map((item) => item.childId);
  return validSubgraphChildren(input.children) && new Set(ids).size === input.children.length
    && summaries.every((item) => item.outcome === 'success'
      && Array.isArray(item.evidence) && item.evidence.length > 0);
}

function validChildReferences(input, summaries) {
  const evidence = summaries.flatMap((item) => item.evidence || []);
  return evidence.includes('corpus://delegation/fixture')
    && evidence.some((ref) => /^solver:\/\/sha256:[a-f0-9]{64}$/.test(ref))
    && isDeepStrictEqual(input.receipt.result, { childSummaries: summaries });
}

function validParentReceipt(input, summaries) {
  const { content, children, receipt, executionReceipt } = input;
  const evidence = summaries.flatMap((item) => item.evidence || []);
  return receipt?.id === executionReceipt?.id
    && isDeepStrictEqual(receipt.methodContract, { version: 1, methodId: 'coordinate_children', parameters: { children } })
    && validCoordinationReceipt(receipt, summaries)
    && content.claims?.[0]?.statement === `${summaries.length} persisted children completed with validated evidence.`
    && isDeepStrictEqual(content.claims[0].evidence, [...new Set([receipt.id, ...evidence])]);
}

function validSubgraphChildren(children) {
  return children.length === 2
    && children[0].workerKind === 'bounded_worker'
    && children[0].methodContract?.methodId === 'scoped_procedure'
    && children[1].workerKind === 'scout_cell'
    && children[1].methodContract?.methodId === 'scan_literal';
}

function validCoordinationReceipt(receipt, summaries) {
  const methodJson = JSON.stringify(receipt.methodContract);
  const inputDigest = `sha256:${digest(methodJson)}`;
  const payloadJson = JSON.stringify({ inputDigest: inputDigest.slice(7), output: { childSummaries: summaries } });
  return receipt.methodId === 'coordinate_children' && receipt.methodContractJson === methodJson
    && receipt.inputDigest === inputDigest && receipt.payloadJson === payloadJson
    && receipt.id === `solver://sha256:${digest(payloadJson)}`;
}

function verifyArithmetic(testCase, execution) {
  const result = execution.result;
  return testCase.methodContract.parameters.claim === '2 + 2 * 3 = 8'
    && result.result === testCase.oracle.equals
    && result.derivation.left.value === '8' && result.derivation.right.value === '8'
    && result.derivation.comparator === '=' && execution.receipt.methodId === 'check_arithmetic'
    && validSolverReceipt(execution.receipt.id);
}

function verifyCode(testCase, method, execution) {
  const source = execution.observedSource;
  if (source !== require('./cases.cjs').CODE_EXPRESSION
    || digest(source) !== method.parameters.expectedContentHash
    || execution.result.verdict !== testCase.oracle.equals
    || execution.result.contractId !== method.parameters.contractId
    || execution.result.artifactContentHash !== method.parameters.expectedContentHash) return false;
  for (let a = -16; a <= 16; a += 1) {
    for (let b = 1; b <= 8; b += 1) if (((a % b) + b) % b !== a - Math.floor(a / b) * b) return false;
  }
  return true;
}

function verifyBounded(_testCase, method, execution) {
  const procedure = method.parameters.procedure;
  const output = execution.result;
  return output.scopeCompletion?.scopeRef === 'benchmark://bounded-worker-scope'
    && output.scopeCompletion.completedRefs?.[0] === output.procedureReceipt?.id
    && subsetExists(procedure.parameters.values, procedure.parameters.target)
    && output.result.found === true && isDeepStrictEqual(output.procedureReceipt.result, output.result);
}

function receiptBindsResult(execution) {
  return execution.receipt?.methodId === execution.methodContract?.methodId
    && isDeepStrictEqual(execution.receipt.result, execution.result)
    && /^solver:\/\/sha256:[a-f0-9]{64}$/.test(execution.receipt.id || '');
}

function verifyAdaptive(testCase, method, execution) {
  const trials = method.parameters.trials;
  const outputs = trials.map((trial) => schedule(trial.procedure.parameters));
  const best = outputs.reduce((current, item) => item.makespan < current.makespan ? item : current);
  const receipts = execution.result.trialReceipts || [];
  const trace = execution.result.strategyTrace || [];
  return execution.result.result?.makespan === testCase.oracle.equals
    && isDeepStrictEqual(execution.result.result, best)
    && adaptiveReceiptsMatch(receipts, outputs, trials)
    && adaptiveTraceMatches(trace, trials, receipts);
}

function adaptiveReceiptsMatch(receipts, outputs, trials) {
  return receipts.length === trials.length && receipts.every((receipt, index) => receipt.methodId === 'lpt'
    && isDeepStrictEqual(receipt.result, outputs[index]) && validSolverReceipt(receipt.id));
}

function adaptiveTraceMatches(trace, trials, receipts) {
  return trace.length === trials.length && trace.every((step, index) =>
    step.strategy === trials[index].strategy && step.evidence?.[0] === receipts[index].id);
}

function schedule(parameters) {
  const machines = Array.from({ length: parameters.machines }, (_, machine) => ({ machine, jobs: [], load: 0 }));
  const jobs = [...parameters.jobs].sort((left, right) => right.duration - left.duration
    || left.id.localeCompare(right.id));
  for (const job of jobs) {
    let selected = machines[0];
    for (const candidate of machines) if (candidate.load < selected.load) selected = candidate;
    selected.jobs.push(job.id);
    selected.load += job.duration;
  }
  return { assignments: machines, makespan: Math.max(...machines.map((item) => item.load)) };
}

function verifyNiche(_testCase, method, execution) {
  const { niche, procedure } = method.parameters;
  const result = execution.result;
  return result.specialtyAssessment?.niche === niche && result.specialtyAssessment?.inScope === true
    && result.specialtyAssessment.evidence?.[0] === result.procedureReceipt?.id
    && subsetExists(procedure.parameters.values, procedure.parameters.target)
    && result.procedureReceipt?.methodId === procedure.methodId
    && isDeepStrictEqual(result.procedureReceipt.result, result.result);
}

function verifyHost(_testCase, method, execution) {
  const result = execution.result;
  const contribution = result.hostContribution;
  const grant = execution.workerContract?.mission;
  const procedure = method.parameters.procedure;
  return method.parameters.capability === 'deterministic_procedure'
    && grant?.hostCapabilities?.includes(method.parameters.capability)
    && contribution?.hostContractId === grant.hostContractId
    && contribution?.capability === method.parameters.capability && contribution.contractCompliant === true
    && contribution.evidence?.[0] === result.procedureReceipt?.id
    && subsetExists(procedure.parameters.values, procedure.parameters.target)
    && isDeepStrictEqual(result.procedureReceipt.result, result.result);
}

function subsetExists(values, target) {
  let totals = [0];
  for (const value of values) totals = [...totals, ...totals.map((total) => total + value)];
  return totals.includes(target) === true && values.length <= 16;
}

function verifyCreative(testCase, method, execution) {
  const ranked = rankCandidates(method.parameters);
  const result = execution.result;
  return result.candidate === ranked[0]?.candidate
    && isDeepStrictEqual(result.alternatives, ranked.slice(1).map((item) => item.candidate))
    && isDeepStrictEqual(result.candidateScores, ranked)
    && isDeepStrictEqual(result.selectedEvidence, ranked[0]?.evidence)
    && result.candidate === testCase.oracle.equals
    && isDeepStrictEqual(result.assumptions, method.parameters.assumptions)
    && result.falsificationTest === method.parameters.falsificationTest
    && result.selectionRule === 'Goal-aligned evidence ranking';
}

function rankCandidates(input) {
  const combinations = candidateRows(input.dimensions);
  return combinations.map((parts) => {
    const matches = input.evidence.filter((item) => input.goal.toLocaleLowerCase()
      .includes(item.goalCue.toLocaleLowerCase())
      && parts.some((part) => part.dimension === item.dimension && part.option === item.option));
    return { candidate: parts.map((part) => `${part.dimension}: ${part.option}`).join('; '),
      score: matches.length, evidence: [...new Set(matches.map((item) => item.sourceRef))] };
  }).sort((left, right) => right.score - left.score || left.candidate.localeCompare(right.candidate, 'en'));
}

function candidateRows(dimensions) {
  const rows = [];
  const visit = (index, current) => {
    if (index === dimensions.length) { rows.push(current); return; }
    const dimension = dimensions[index];
    for (const option of dimension.options) visit(index + 1,
      [...current, { dimension: dimension.name, option }]);
  };
  visit(0, []);
  return rows;
}

function verifyMedical(testCase, method, execution) {
  const input = method.parameters;
  const result = execution.result;
  return result.caseScope === testCase.oracle.equals && input.caseScope === 'synthetic_educational'
    && isDeepStrictEqual(result.differentialConsiderations, input.considerations.map((item) => item.consideration))
    && isDeepStrictEqual(result.evidence, input.considerations.map((item) => item.sourceRef))
    && result.uncertainty === input.uncertainty
    && result.safetyNote === 'Synthetic educational material only. No individual diagnosis or treatment advice.';
}

function verifyRecovery(testCase, method, execution) {
  const input = method.parameters;
  const restored = digest(execution.observedRestoredContent || '');
  const receipt = execution.result.checkpointReceipt;
  return execution.observedRestoredContent === input.content && restored === input.checkpointDigest
    && execution.result.recoveryReceipt?.action === 'restore_checkpoint'
    && execution.result.recoveryReceipt.restoredState === testCase.oracle.equals
    && receipt?.result?.path === input.path && receipt.result.restoredDigest === restored
    && receipt.result.priorDigest === input.expectedCurrentDigest;
}

function verifyHandoff(_testCase, method, execution) {
  const input = method.parameters;
  const handoff = execution.result.handoff;
  const expected = [];
  for (const item of input.items) if (!expected.includes(item.sourceRef)) expected.push(item.sourceRef);
  return handoff?.sourceGroup === input.sourceGroup && handoff.targetGroup === input.targetGroup
    && handoff.delivery === 'parent_dossier' && handoff.recipientAcknowledged === false
    && isDeepStrictEqual(handoff.deliveredRefs, expected)
    && isDeepStrictEqual(handoff.items, input.items);
}

function subsetExists(values, target) {
  let totals = [0];
  for (const value of values) totals = [...totals, ...totals.map((total) => total + value)];
  return totals.includes(target) === true && values.length <= 16;
}

function validSolverReceipt(id) { return /^solver:\/\/sha256:[a-f0-9]{64}$/.test(id || ''); }
function digest(value) { return createHash('sha256').update(value).digest('hex'); }

module.exports = { verify, verifyArithmetic };
