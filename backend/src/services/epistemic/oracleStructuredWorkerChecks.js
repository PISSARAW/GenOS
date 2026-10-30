'use strict';

const { isDeepStrictEqual } = require('node:util');
const { createHash } = require('node:crypto');

const ADAPTIVE = new Set(['adaptive_trial_map', 'adaptive_trial_replay']);
const NICHE = new Set(['niche_receipt_recompute', 'niche_contract_scan']);
const HOST = new Set(['host_receipt_recompute', 'host_contract_scan']);
const CREATIVE = new Set(['creative_cartesian_map', 'creative_nested_scan']);
const MEDICAL = new Set(['medical_consideration_map', 'medical_index_scan']);
const STRATEGIES = new Set([...ADAPTIVE, ...NICHE, ...HOST, ...CREATIVE, ...MEDICAL]);

function check(subject, strategy) {
  const handlers = { adaptive_strategy: checkAdaptive, niche_procedure: checkNiche,
    host_procedure: checkHost, creative_combination: checkCreative, synthetic_case_review: checkMedical };
  const handler = handlers[subject?.domain];
  return handler ? handler(subject, strategy) : outcome(false, 'structured_worker_domain_invalid', strategy);
}

function checkAdaptive(subject, strategy) {
  const { trials } = subject.method.parameters;
  if (!boundedAdaptiveTrials(trials)) return outcome(false, 'adaptive_fixture_out_of_bounds', strategy);
  const calculate = strategy === 'adaptive_trial_map' ? lptMap : lptReplay;
  const expected = trials.map((trial) => calculate(trial.procedure.parameters));
  const receipts = subject.result.trialReceipts || [];
  const best = expected.reduce((selected, value) => value.makespan < selected.makespan ? value : selected);
  const trace = trials.map((trial, index) => ({ strategy: trial.strategy,
    decision: 'retained',
    reason: `Controlled probe ${index + 1}; the declared strategy is unchanged and observed makespan is ${expected[index].makespan}.`,
    evidence: [receipts[index]?.id] }));
  const validReceipts = receipts.length === trials.length && receipts.every((receipt, index) =>
    receiptMatches(receipt, 'lpt', expected[index]));
  const valid = validReceipts && isDeepStrictEqual(subject.result.strategyTrace, trace)
    && isDeepStrictEqual(subject.result.result, best);
  return outcome(valid, 'adaptive_trials_recomputed', strategy);
}

function boundedAdaptiveTrials(trials) {
  return Array.isArray(trials) && trials.length <= 12 && trials.every((trial) =>
    trial.procedure?.methodId === 'lpt' && trial.procedure.parameters?.jobs?.length <= 16);
}

function checkNiche(subject, strategy) {
  const input = subject.method.parameters;
  const contract = subject.workerContract;
  const result = subject.result;
  const validScope = input.niche === contract.specialtyNiche && result.specialtyAssessment?.niche === input.niche
    && result.specialtyAssessment?.inScope === true;
  const validEvidence = result.specialtyAssessment?.evidence?.[0] === result.procedureReceipt?.id;
  const procedureCheck = procedureDiagnosis(subject, strategy, result);
  const validProcedure = procedureCheck.valid;
  return outcome(validScope && validEvidence && validProcedure, 'niche_scope_and_procedure_recomputed', strategy);
}

function checkHost(subject, strategy) {
  const input = subject.method.parameters;
  const contract = subject.workerContract;
  const result = subject.result;
  const host = result.hostContribution;
  const validHost = input.capability === 'deterministic_procedure'
    && contract.hostCapabilities?.includes(input.capability) && host?.contractCompliant === true
    && host.hostContractId === contract.hostContractId && host.capability === input.capability;
  const validEvidence = host.evidence?.[0] === result.procedureReceipt?.id;
  const validProcedure = procedureMatches(subject, strategy, result);
  return outcome(validHost && validEvidence && validProcedure, 'host_capability_and_procedure_recomputed', strategy);
}

function checkCreative(subject, strategy) {
  const input = subject.method.parameters;
  if (!boundedCreativeInput(input)) return outcome(false, 'creative_fixture_out_of_bounds', strategy);
  const combinations = strategy === 'creative_cartesian_map'
    ? creativeByFold(input.dimensions) : creativeByScan(input.dimensions);
  const candidates = rankCreative(input, combinations);
  const result = subject.result;
  const valid = creativeSelectionMatches(input, result, candidates)
    && creativeProvenanceMatches(subject, input);
  return outcome(valid, 'creative_combinations_recomputed_quality_unverified', strategy);
}

function creativeSelectionMatches(input, result, candidates) {
  return result.candidate === candidates[0]?.candidate
    && isDeepStrictEqual(result.alternatives, candidates.slice(1).map((item) => item.candidate))
    && isDeepStrictEqual(result.candidateScores, candidates)
    && isDeepStrictEqual(result.selectedEvidence, candidates[0]?.evidence)
    && isDeepStrictEqual(result.assumptions, input.assumptions)
    && result.falsificationTest === input.falsificationTest
    && result.selectionRule === 'Goal-aligned evidence ranking';
}

function creativeProvenanceMatches(subject, input) {
  return typeof input.goal === 'string' && Array.isArray(input.evidence)
    && input.sourceRefs.every((ref) => subject.artifactRefs.includes(ref));
}

function rankCreative(input, combinations) {
  return combinations.map((candidate) => {
    const selected = new Set(candidate.split('; '));
    const evidence = input.evidence.filter((item) => input.goal.toLocaleLowerCase()
      .includes(item.goalCue.toLocaleLowerCase())
      && selected.has(`${item.dimension}: ${item.option}`));
    return { candidate, score: evidence.length,
      evidence: [...new Set(evidence.map((item) => item.sourceRef))] };
  }).sort((left, right) => right.score - left.score || left.candidate.localeCompare(right.candidate, 'en'));
}

function boundedCreativeInput(input) {
  return Array.isArray(input.dimensions) && input.dimensions.length <= 4
    && input.dimensions.reduce((total, item) => total * (item.options?.length || 0), 1) <= 100;
}

function creativeByFold(dimensions) {
  return [...new Set(dimensions.reduce((all, dimension) => all.flatMap((prefix) => dimension.options.map((option) =>
    `${prefix}${prefix ? '; ' : ''}${dimension.name}: ${option}`)), ['']))];
}

function creativeByScan(dimensions) {
  const output = [];
  const visit = (index, prefix) => {
    if (index === dimensions.length) { output.push(prefix); return; }
    for (const option of dimensions[index].options) {
      visit(index + 1, `${prefix}${prefix ? '; ' : ''}${dimensions[index].name}: ${option}`);
    }
  };
  visit(0, '');
  return [...new Set(output)];
}

function checkMedical(subject, strategy) {
  const input = subject.method.parameters;
  const considerations = strategy === 'medical_consideration_map'
    ? input.considerations.map((item) => item.consideration) : scanConsiderations(input.considerations);
  const refs = strategy === 'medical_consideration_map'
    ? input.considerations.map((item) => item.sourceRef) : scanRefs(input.considerations);
  const result = subject.result;
  const valid = input.caseScope === 'synthetic_educational' && result.caseScope === input.caseScope
    && isDeepStrictEqual(result.differentialConsiderations, considerations) && result.uncertainty === input.uncertainty
    && result.safetyNote === 'Synthetic educational material only. No individual diagnosis or treatment advice.'
    && isDeepStrictEqual(result.evidence, refs) && refs.every((ref) => subject.artifactRefs.includes(ref));
  return outcome(valid, 'synthetic_considerations_and_sources_recomputed_no_clinical_validation', strategy);
}

function scanConsiderations(items) { const values = []; for (const item of items) values.push(item.consideration); return values; }
function scanRefs(items) { const values = []; for (const item of items) values.push(item.sourceRef); return values; }

function procedureMatches(subject, strategy, result) {
  return procedureDiagnosis(subject, strategy, result).valid;
}

function procedureDiagnosis(subject, strategy, result) {
  const procedure = subject.method.parameters.procedure;
  if (procedure?.version === 1 && procedure.methodId === 'lpt') {
    return nicheLptDiagnosis(procedure, strategy, result);
  }
  const oracle = require('./oracleSubsetChecks').checkSubset({ method: procedure, result: result.result },
    strategy.endsWith('recompute') ? 'subset_bitset' : 'subset_enumeration');
  const receiptValid = receiptMatches(result.procedureReceipt, 'subset_sum', result.result);
  return { valid: oracle.status === 'verified' && receiptValid, oracleStatus: oracle.status,
    receiptValid, procedureMethod: procedure?.methodId };
}

function nicheLptDiagnosis(procedure, strategy, result) {
  const parameters = procedure.parameters;
  if (!validLptInput(parameters)) return { valid: false, oracleStatus: 'inconclusive',
    receiptValid: false, procedureMethod: 'lpt' };
  const expected = strategy.endsWith('recompute') ? lptMap(parameters) : lptReplay(parameters);
  const receipt = result.procedureReceipt;
  const inputDigest = receipt?.inputDigest?.replace(/^sha256:/, '');
  const receiptDigest = /^[a-f0-9]{64}$/.test(inputDigest || '')
    ? createHash('sha256').update(JSON.stringify({ methodId: 'lpt', inputDigest, output: expected })).digest('hex') : null;
  const receiptValid = receipt?.methodId === 'lpt' && receiptDigest !== null
    && receipt.id === `solver://sha256:${receiptDigest}` && isDeepStrictEqual(receipt.result, expected);  return { valid: isDeepStrictEqual(result.result, expected) && receiptValid,
    oracleStatus: isDeepStrictEqual(result.result, expected) ? 'verified' : 'refuted',
    receiptValid, procedureMethod: 'lpt' };
}

function validLptInput(parameters) {
  if (!validLptParameters(parameters)) return false;
  const ids = new Set();
  let total = 0;
  for (const job of parameters.jobs) {
    if (!validLptJob(job, ids)) return false;
    ids.add(job.id);
    total += job.duration;
    if (!Number.isSafeInteger(total)) return false;
  }
  return true;
}
function validLptParameters(parameters) {
  return Array.isArray(parameters?.jobs) && parameters.jobs.length >= 1 && parameters.jobs.length <= 10000
    && Number.isSafeInteger(parameters.machines) && parameters.machines >= 1 && parameters.machines <= 64;
}
function validLptJob(job, ids) {
  return typeof job?.id === 'string' && Boolean(job.id.trim()) && !ids.has(job.id)
    && Number.isSafeInteger(job.duration) && job.duration > 0;
}
function receiptMatches(receipt, methodId, output) {
  const inputDigest = receipt?.inputDigest?.replace(/^sha256:/, '');
  if (receipt?.methodId !== methodId || !/^[a-f0-9]{64}$/.test(inputDigest || '')
    || !isDeepStrictEqual(receipt.result, output)) return false;
  return /^solver:\/\/sha256:[a-f0-9]{64}$/.test(receipt.id || '');
}

function lptMap(parameters) {
  const bins = Array.from({ length: parameters.machines }, (_, machine) => ({ machine, jobs: [], load: 0 }));
  for (const job of [...parameters.jobs].sort(compareJob)) {
    const target = bins.reduce((best, item) => item.load < best.load ? item : best);
    target.jobs.push(job.id); target.load += job.duration;
  }
  return { assignments: bins, makespan: Math.max(...bins.map((item) => item.load)) };
}

function lptReplay(parameters) {
  const loads = Array(parameters.machines).fill(0);
  const assignments = loads.map((_, machine) => ({ machine, jobs: [], load: 0 }));
  for (const job of [...parameters.jobs].sort(compareJob)) {
    const target = loads.indexOf(Math.min(...loads));
    loads[target] += job.duration; assignments[target].jobs.push(job.id); assignments[target].load = loads[target];
  }
  return { assignments, makespan: Math.max(...loads) };
}

function compareJob(left, right) { return right.duration - left.duration || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0); }
function outcome(valid, reason, strategy) { return { schema: 'genos.native-observation-postconditions/v1',
  status: valid ? 'verified' : 'refuted', reason, strategy }; }

module.exports = { ADAPTIVE, NICHE, HOST, CREATIVE, MEDICAL, STRATEGIES, check };
