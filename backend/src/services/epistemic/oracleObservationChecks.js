'use strict';

const { isDeepStrictEqual } = require('node:util');
const formalChecks = require('./oracleFormalChecks');
const dossierChecks = require('./oracleObservationDossierChecks');
const coordinationChecks = require('./oracleCoordinationChecks');
const structuredChecks = require('./oracleStructuredWorkerChecks');

const VERSION = 'genos.native-observation-postconditions/v1';
const SCOUT = new Set(['scout_index', 'scout_character_scan']);
const MONITOR = new Set(['monitor_filter', 'monitor_count']);
const SYNTHESIS = new Set(['synthesis_group_map', 'synthesis_pairwise']);
const FORENSIC = new Set(['forensic_event_map', 'forensic_parent_scan']);
const EXPERIMENT = new Set(['lpt_greedy_scan', 'lpt_load_replay']);
const PROCEDURE_VERIFY = new Set(['verify_subset_bitset', 'verify_subset_enumeration']);
const PROCEDURE_RED = new Set(['red_subset_bitset', 'red_subset_enumeration']);
const TEACHING = new Set(['teaching_subset_bitset', 'teaching_subset_enumeration']);
const RECOVERY = dossierChecks.RECOVERY;
const HANDOFF = dossierChecks.HANDOFF;
const STRATEGIES = new Set([...SCOUT, ...MONITOR, ...SYNTHESIS, ...FORENSIC, ...EXPERIMENT,
  ...PROCEDURE_VERIFY, ...PROCEDURE_RED, ...TEACHING, ...RECOVERY, ...HANDOFF,
  ...coordinationChecks.STRATEGIES, ...formalChecks.STRATEGIES, ...structuredChecks.STRATEGIES]);
const DOMAIN_CHECKS = Object.freeze({
  literal_observation: { strategies: SCOUT, run: checkScout },
  monitor_window: { strategies: MONITOR, run: checkMonitor },
  claim_synthesis: { strategies: SYNTHESIS, run: checkSynthesis },
  declared_causality: { strategies: FORENSIC, run: checkForensic },
  lpt_experiment: { strategies: EXPERIMENT, run: checkExperiment },
  procedure_verification: { strategies: PROCEDURE_VERIFY, run: checkProcedureVerifier },
  procedure_falsification: { strategies: PROCEDURE_RED, run: checkProcedureRed },
  subset_sum_teaching: { strategies: TEACHING, run: checkTeaching },
  checkpoint_recovery: { strategies: RECOVERY, run: dossierChecks.checkRecovery },
  sourced_handoff: { strategies: HANDOFF, run: dossierChecks.checkHandoff },
  child_coordination: { strategies: coordinationChecks.STRATEGIES, run: coordinationChecks.check },
  adaptive_strategy: { strategies: structuredChecks.ADAPTIVE, run: structuredChecks.check },
  niche_procedure: { strategies: structuredChecks.NICHE, run: structuredChecks.check },
  host_procedure: { strategies: structuredChecks.HOST, run: structuredChecks.check },
  creative_combination: { strategies: structuredChecks.CREATIVE, run: structuredChecks.check },
  synthetic_case_review: { strategies: structuredChecks.MEDICAL, run: structuredChecks.check },
  formal_theorem: { strategies: formalChecks.STRATEGIES, run: formalChecks.checkFormal },
});

function outcome(status, reason, strategy) { return { schema: VERSION, status, reason, strategy }; }

function checkObservation(subject, strategy) {
  const entry = DOMAIN_CHECKS[subject?.domain];
  if (!entry || !entry.strategies.has(strategy)) return outcome('inconclusive', 'observation_oracle_domain_unavailable', strategy);
  return entry.run(subject, strategy);
}

function forDomain(domain) {
  const strategies = ({ literal_observation: SCOUT, monitor_window: MONITOR, claim_synthesis: SYNTHESIS,
    declared_causality: FORENSIC, lpt_experiment: EXPERIMENT, procedure_verification: PROCEDURE_VERIFY,
    procedure_falsification: PROCEDURE_RED, subset_sum_teaching: TEACHING,
    checkpoint_recovery: RECOVERY, sourced_handoff: HANDOFF,
    child_coordination: coordinationChecks.STRATEGIES,
    adaptive_strategy: structuredChecks.ADAPTIVE, niche_procedure: structuredChecks.NICHE,
    host_procedure: structuredChecks.HOST, creative_combination: structuredChecks.CREATIVE,
    synthetic_case_review: structuredChecks.MEDICAL,
    formal_theorem: formalChecks.STRATEGIES })[domain];
  if (!strategies) throw new Error(`Unsupported observation oracle domain '${domain}'.`);
  return { STRATEGIES: strategies, checkObservation };
}

function checkSynthesis(subject, strategy) {
  const sources = subject.method.parameters.sources;
  if (!Array.isArray(sources)) return outcome('inconclusive', 'synthesis_subject_invalid', strategy);
  const expected = strategy === 'synthesis_group_map' ? synthesisByMap(sources) : synthesisByPairs(sources);
  const result = subject.result;
  const valid = isDeepStrictEqual(result.disagreements, expected)
    && isDeepStrictEqual(result.sources, sources.map(item => item.sourceRef))
    && result.synthesis === `${sources.length} attributed positions retained; ${expected.length} exact-claim disagreements found.`
    && receiptShapeValid(result.synthesisReceipt?.id)
    && isDeepStrictEqual(result.synthesisReceipt?.sourceRefs, result.sources);
  return { ...outcome(valid ? 'verified' : 'refuted', 'synthesis_recomputed', strategy),
    expectedCount: expected.length, observedCount: result.disagreements?.length ?? -1 };
}

function synthesisByMap(sources) {
  const groups = new Map();
  for (const source of sources) groups.set(source.claim, [...(groups.get(source.claim) || []), position(source)]);
  return [...groups].filter(([, positions]) => new Set(positions.map(item => item.position)).size > 1)
    .map(([claim, positions]) => ({ claim, positions }));
}

function synthesisByPairs(sources) {
  const claims = [...new Set(sources.map(item => item.claim))];
  const disagreements = [];
  for (const claim of claims) {
    const positions = sources.filter(item => item.claim === claim).map(position);
    if (positions.some(item => item.position !== positions[0].position)) disagreements.push({ claim, positions });
  }
  return disagreements;
}

function position(source) { return { source: source.sourceRef, position: source.position }; }

function checkForensic(subject, strategy) {
  const events = subject.method.parameters.events;
  if (!Array.isArray(events)) return outcome('inconclusive', 'forensic_subject_invalid', strategy);
  const expected = strategy === 'forensic_event_map' ? forensicByMap(events) : forensicByScan(events);
  const result = subject.result;
  const valid = isDeepStrictEqual(result.causalChain, expected.causalChain)
    && isDeepStrictEqual(result.evidence, expected.evidence)
    && isDeepStrictEqual(result.unlinkedEvents, expected.unlinkedEvents)
    && result.interpretation === 'Links reproduce supplied causation receipts; independent causal truth is unverified.'
    && receiptShapeValid(result.forensicReceipt?.id);
  return { ...outcome(valid ? 'verified' : 'refuted', 'declared_causal_links_recomputed', strategy),
    expectedCount: expected.causalChain.length, observedCount: result.causalChain?.length ?? -1 };
}

function forensicByMap(events) {
  const byId = new Map(events.map(event => [event.id, event]));
  return forensicResult(events, event => byId.get(event.causedBy?.eventId));
}

function forensicByScan(events) {
  return forensicResult(events, event => events.find(candidate => candidate.id === event.causedBy?.eventId));
}

function forensicResult(events, parentOf) {
  const causalChain = events.filter(event => event.causedBy).map(event => ({
    from: parentOf(event).id, to: event.id, relation: 'declared_cause',
    evidence: [parentOf(event).sourceRef, event.sourceRef, event.causedBy.receiptRef] }));
  return { causalChain, evidence: [...new Set(causalChain.flatMap(link => link.evidence))],
    unlinkedEvents: events.filter(event => !event.causedBy).map(event => event.id) };
}

function checkExperiment(subject, strategy) {
  const parameters = subject.method.parameters;
  if (!validExperimentParameters(parameters)) {
    return outcome('inconclusive', 'experiment_subject_invalid', strategy);
  }
  const expected = strategy === 'lpt_greedy_scan' ? lptByScan(parameters) : lptByReplay(parameters);
  const result = subject.result;
  const measurement = result.measurements?.[0];
  const valid = experimentMeasurementMatches(measurement, expected)
    && experimentResultMatches(result, parameters, expected);
  return { ...outcome(valid ? 'verified' : 'refuted', 'lpt_measurement_recomputed', strategy),
    expectedMakespan: expected.makespan, observedMakespan: measurement?.value ?? null };
}

function validExperimentParameters(parameters) {
  return Array.isArray(parameters.jobs) && Number.isSafeInteger(parameters.machines)
    && Number.isSafeInteger(parameters.threshold);
}

function experimentMeasurementMatches(measurement, expected) {
  return measurement?.metric === 'makespan' && measurement.value === expected.makespan
    && measurement.unit === 'duration_units';
}

function experimentResultMatches(result, parameters, expected) {
  const conclusion = expected.makespan <= parameters.threshold ? 'supported_for_this_input' : 'refuted_for_this_input';
  return isDeepStrictEqual(result.procedureReceipt?.result, expected)
    && result.conclusion === conclusion
    && result.hypothesis === `LPT makespan is at most ${parameters.threshold} duration units.`
    && receiptShapeValid(result.procedureReceipt?.id);
}

function lptByScan(parameters) {
  const jobs = [...parameters.jobs].sort(compareJob);
  const assignments = Array.from({ length: parameters.machines }, (_, machine) => ({ machine, jobs: [], load: 0 }));
  for (const job of jobs) {
    let target = assignments[0];
    for (const assignment of assignments) if (assignment.load < target.load) target = assignment;
    target.jobs.push(job.id); target.load += job.duration;
  }
  return { assignments, makespan: Math.max(...assignments.map(item => item.load)) };
}

function lptByReplay(parameters) {
  const loads = Array(parameters.machines).fill(0);
  const assignments = Array.from({ length: parameters.machines }, (_, machine) => ({ machine, jobs: [], load: 0 }));
  for (const job of [...parameters.jobs].sort(compareJob)) {
    const target = loads.indexOf(Math.min(...loads));
    loads[target] += job.duration; assignments[target].jobs.push(job.id); assignments[target].load = loads[target];
  }
  return { assignments, makespan: Math.max(...loads) };
}

function compareJob(left, right) {
  return right.duration - left.duration || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

function checkProcedureVerifier(subject, strategy) {
  const parameters = subject.method.parameters;
  const procedureResult = subsetResult(parameters.procedure, subject.result.expectedReceipt?.result, strategy);
  if (procedureResult.status !== 'verified') return procedureResult;
  const matches = receiptMatches(parameters.candidateReceipt, subject.result.expectedReceipt);
  const expectedVerdict = matches ? 'accept' : 'reject';
  const valid = subject.result.verdict === expectedVerdict
    && subject.result.candidateReceiptId === parameters.candidateReceipt.id;
  return outcome(valid ? 'verified' : 'refuted', 'procedure_verdict_recomputed', strategy);
}

function checkProcedureRed(subject, strategy) {
  const parameters = subject.method.parameters;
  const result = subject.result;
  const procedureResult = subsetResult(parameters.procedure, result.expectedReceipt?.result, strategy);
  if (procedureResult.status !== 'verified') return procedureResult;
  const matches = receiptMatches(parameters.candidateReceipt, result.expectedReceipt);
  const counterexample = result.counterexample;
  const valid = !matches && result.verdict === 'reject'
    && result.candidateReceiptId === parameters.candidateReceipt.id
    && isDeepStrictEqual(counterexample?.input, parameters.procedure.parameters)
    && isDeepStrictEqual(counterexample?.submitted, parameters.candidateReceipt.result)
    && isDeepStrictEqual(counterexample?.recomputed, result.expectedReceipt.result)
    && result.counterexamples?.length > 0;
  return outcome(valid ? 'verified' : 'refuted', 'red_counterexample_recomputed', strategy);
}

function checkTeaching(subject, strategy) {
  const parameters = subject.method.parameters;
  const result = subject.result;
  const procedureResult = subsetResult(parameters.procedure, result.demonstration, strategy);
  if (procedureResult.status !== 'verified') return procedureResult;
  const witness = teachingWitness(parameters);
  const valid = witness.valid && teachingResultMatches(result, parameters, witness);
  return outcome(valid ? 'verified' : 'refuted', 'teaching_transfer_recomputed', strategy);
}

function teachingWitness(parameters) {
  const indices = parameters.learnerIndices;
  const values = parameters.procedure.parameters.values;
  const valid = Array.isArray(indices) && new Set(indices).size === indices.length
    && indices.every(index => Number.isSafeInteger(index) && index >= 0 && index < values.length);
  return { valid, indices, target: parameters.procedure.parameters.target,
    sum: valid ? indices.reduce((total, index) => total + values[index], 0) : null };
}

function teachingResultMatches(result, parameters, witness) {
  const transfer = result.transferCheck;
  return witness.sum === witness.target && transfer?.passed === true
    && transfer.validIndices === true && transfer.learnerSum === witness.target && transfer.target === witness.target
    && isDeepStrictEqual(transfer.learnerIndices, witness.indices)
    && isDeepStrictEqual(result.procedureReceipt?.result, result.demonstration)
    && receiptShapeValid(result.teachingReceipt?.id);
}

function subsetResult(procedure, result, strategy) {
  const checkStrategy = strategy.endsWith('enumeration') ? 'subset_enumeration' : 'subset_bitset';
  return require('./oracleSubsetChecks').checkSubset({ domain: 'subset_sum', method: procedure, result }, checkStrategy);
}

function receiptMatches(candidate, expected) {
  return candidate?.id === expected?.id && candidate?.inputDigest === expected?.inputDigest
    && isDeepStrictEqual(candidate?.result, expected?.result);
}

function checkScout(subject, strategy) {
  const { sources, terms } = subject.method.parameters;
  if (!Array.isArray(sources) || !Array.isArray(terms) || !Array.isArray(subject.result?.observations)) {
    return outcome('inconclusive', 'scout_subject_invalid', strategy);
  }
  const expected = strategy === 'scout_index' ? scoutByIndex(sources, terms) : scoutByCharacters(sources, terms);
  const result = subject.result;
  const valid = isDeepStrictEqual(result.observations, expected)
    && isDeepStrictEqual(result.scannedSources, sources.map(item => item.sourceRef))
    && result.termCount === terms.length
    && receiptShapeValid(result.scoutReceipt?.id);
  return { ...outcome(valid ? 'verified' : 'refuted', 'scout_literal_matches_recomputed', strategy),
    expectedCount: expected.length, observedCount: result.observations.length };
}

function scoutByIndex(sources, terms) {
  return sources.flatMap(source => terms.flatMap(term => {
    const offset = source.text.indexOf(term);
    return offset < 0 ? [] : [scoutObservation(source.sourceRef, term, offset)];
  }));
}

function scoutByCharacters(sources, terms) {
  const matches = [];
  for (const source of sources) for (const term of terms) {
    const offset = firstOffset(source.text, term);
    if (offset >= 0) matches.push(scoutObservation(source.sourceRef, term, offset));
  }
  return matches;
}

function firstOffset(text, term) {
  for (let start = 0; start <= text.length - term.length; start += 1) {
    if (text.slice(start, start + term.length) === term) return start;
  }
  return -1;
}

function scoutObservation(sourceRef, term, offset) {
  return { observation: `Literal '${term}' found at offset ${offset}.`, sourceRefs: [sourceRef],
    confidence: 1, uncertainties: ['No semantic interpretation or source authenticity check.'], term, offset };
}

function checkMonitor(subject, strategy) {
  const parameters = subject.method.parameters;
  const samples = parameters.samples;
  if (!Array.isArray(samples) || !samples.length || !Number.isFinite(parameters.threshold)
    || !subject.result || typeof subject.result !== 'object') {
    return outcome('inconclusive', 'monitor_subject_invalid', strategy);
  }
  const anomalies = strategy === 'monitor_filter' ? filterAnomalies(samples, parameters.threshold)
    : countAnomalies(samples, parameters.threshold);
  const territoryReport = { territoryId: parameters.territoryId,
    observedAt: new Date(Math.max(...samples.map(item => Date.parse(item.observedAt)))).toISOString(),
    sourceRefs: samples.map(item => item.sourceRef) };
  const valid = monitorMatches(subject, anomalies, territoryReport);
  return { ...outcome(valid ? 'verified' : 'refuted', 'monitor_threshold_recomputed', strategy),
    expectedCount: anomalies.length, observedCount: subject.result.anomalies?.length ?? -1 };
}

function monitorMatches(subject, anomalies, territoryReport) {
  const parameters = subject.method.parameters;
  const result = subject.result;
  const statement = `${anomalies.length} of ${parameters.samples.length} samples exceeded ${parameters.threshold}.`;
  return isDeepStrictEqual(result.anomalies, anomalies)
    && isDeepStrictEqual(result.territoryReport, territoryReport)
    && result.claims?.[0]?.statement === statement
    && isDeepStrictEqual(result.claims?.[0]?.evidence, territoryReport.sourceRefs)
    && receiptShapeValid(result.monitorReceipt?.id);
}

function filterAnomalies(samples, threshold) {
  return samples.filter(sample => sample.value > threshold).map(sample => ({ value: sample.value,
    observedAt: sample.observedAt, sourceRef: sample.sourceRef }));
}

function countAnomalies(samples, threshold) {
  const anomalies = [];
  for (const sample of samples) {
    if (sample.value > threshold) anomalies.push({ value: sample.value,
      observedAt: sample.observedAt, sourceRef: sample.sourceRef });
  }
  return anomalies;
}

function receiptShapeValid(receiptId) {
  return typeof receiptId === 'string' && /^solver:\/\/sha256:[a-f0-9]{64}$/u.test(receiptId);
}

module.exports = { VERSION, STRATEGIES, SCOUT, MONITOR, SYNTHESIS, FORENSIC, EXPERIMENT,
  checkObservation, forDomain };
