'use strict';
const values = require('../trinityProvenanceValues');
const { createHash } = require('node:crypto');
const { checkSubset } = require('./oracleSubsetChecks');
const STRATEGIES = new Set(['worker_reference', 'worker_integrity']);
const VERSION = 'genos.native-worker-postconditions/v1';
function digest(value) { return values.digest(value); }
function same(left, right) { return values.encode(left) === values.encode(right); }
function outcome(strategy, status, reason) { return { schema: VERSION, strategy, status, reason }; }

function scoutReference(method, artifact) {
  const { sources, terms } = method.parameters;
  const expected = [];
  for (const source of sources) {
    for (const term of terms) {
      const offset = source.text.indexOf(term);
      if (offset < 0) continue;
      expected.push({ observation: `Literal '${term}' found at offset ${offset}.`,
        sourceRefs: [source.sourceRef], confidence: 1,
        uncertainties: ['No semantic interpretation or source authenticity check.'], term, offset });
    }
  }
  const refs = sources.map(item => item.sourceRef);
  const fallback = [{ observation: 'No supplied literal term was found in the scanned sources.',
    sourceRefs: refs, confidence: 1,
    uncertainties: ['No semantic interpretation or source authenticity check.'] }];
  return artifact.type === 'scout_observation'
    && same(artifact.content.observations, expected.length ? expected : fallback)
    && same(artifact.content.scannedSources, refs)
    && artifact.content.termCount === terms.length;
}

function scoutIntegrity(method, artifact) {
  const content = artifact.content;
  const core = { observations: content.observations.length === 1 && !content.observations[0].term
    ? [] : content.observations, scannedSources: content.scannedSources, termCount: content.termCount };
  const expected = `solver://sha256:${digest({ methodContract: method, content: core })}`;
  return artifact.type === 'scout_observation' && content.scoutReceipt?.id === expected
    && same(artifact.provenance?.sourceRefs, core.scannedSources);
}

function monitorReference(method, artifact) {
  const { territoryId, threshold, samples } = method.parameters;
  const anomalies = samples.filter(item => item.value > threshold)
    .map(item => ({ value: item.value, observedAt: item.observedAt, sourceRef: item.sourceRef }));
  const territoryReport = { territoryId,
    observedAt: new Date(Math.max(...samples.map(item => Date.parse(item.observedAt)))).toISOString(),
    sourceRefs: samples.map(item => item.sourceRef) };
  const content = artifact.content;
  return artifact.type === 'dossier' && same(content.anomalies, anomalies)
    && same(content.territoryReport, territoryReport)
    && same(artifact.provenance?.sourceRefs, territoryReport.sourceRefs);
}

function monitorIntegrity(method, artifact) {
  const { anomalies, territoryReport, monitorReceipt } = artifact.content;
  const expected = `solver://sha256:${digest({ methodContract: method, anomalies, territoryReport })}`;
  return artifact.type === 'dossier' && monitorReceipt?.id === expected
    && artifact.content.claims?.[0]?.evidence?.length === method.parameters.samples.length;
}

function synthesisReference(method, artifact) {
  const sources = method.parameters.sources;
  const claims = new Map();
  for (const item of sources) {
    const positions = claims.get(item.claim) || [];
    positions.push({ source: item.sourceRef, position: item.position });
    claims.set(item.claim, positions);
  }
  const disagreements = [...claims].filter(([, positions]) =>
    new Set(positions.map(item => item.position)).size > 1)
    .map(([claim, positions]) => ({ claim, positions }));
  const content = artifact.content;
  return artifact.type === 'synthesis_dossier'
    && same(content.disagreements, disagreements)
    && same(content.sources, sources.map(item => item.sourceRef))
    && content.synthesis === `${sources.length} attributed positions retained; ${disagreements.length} exact-claim disagreements found.`;
}

function synthesisIntegrity(method, artifact) {
  const content = artifact.content;
  const core = { synthesis: content.synthesis, sources: content.sources,
    disagreements: content.disagreements };
  return artifact.type === 'synthesis_dossier'
    && content.synthesisReceipt?.id === `solver://sha256:${digest({ methodContract: method, content: core })}`
    && same(content.synthesisReceipt?.sourceRefs, content.sources)
    && same(artifact.provenance?.sourceRefs, content.sources);
}

function forensicReference(method, artifact) {
  const events = method.parameters.events;
  const byId = new Map(events.map(item => [item.id, item]));
  const causalChain = events.filter(item => item.causedBy).map(item => {
    const parent = byId.get(item.causedBy.eventId);
    return { from: parent.id, to: item.id, relation: 'declared_cause',
      evidence: [parent.sourceRef, item.sourceRef, item.causedBy.receiptRef] };
  });
  const evidence = [...new Set(causalChain.flatMap(item => item.evidence))];
  const unlinkedEvents = events.filter(item => !item.causedBy).map(item => item.id);
  const content = artifact.content;
  return artifact.type === 'causal_dossier' && same(content.causalChain, causalChain)
    && same(content.evidence, evidence) && same(content.unlinkedEvents, unlinkedEvents)
    && content.interpretation === 'Links reproduce supplied causation receipts; independent causal truth is unverified.';
}

function forensicIntegrity(method, artifact) {
  const content = artifact.content;
  const core = { causalChain: content.causalChain, evidence: content.evidence,
    unlinkedEvents: content.unlinkedEvents, interpretation: content.interpretation };
  return artifact.type === 'causal_dossier'
    && content.forensicReceipt?.id === `solver://sha256:${digest({ methodContract: method, content: core })}`
    && same(artifact.provenance?.sourceRefs, content.evidence);
}

function liaisonReference(method, artifact) {
  const input = method.parameters;
  const deliveredRefs = [...new Set(input.items.map(item => item.sourceRef))];
  const handoff = { sourceGroup: input.sourceGroup, targetGroup: input.targetGroup,
    deliveredRefs, items: input.items, delivery: 'parent_dossier', recipientAcknowledged: false };
  return artifact.type === 'dossier' && same(artifact.content.handoff, handoff);
}

function liaisonIntegrity(method, artifact) {
  const handoff = artifact.content.handoff;
  const inputDigest = digest(method);
  const receiptId = `solver://sha256:${digest({ inputDigest, output: { handoff } })}`;
  const refs = [receiptId, ...new Set(method.parameters.items.map(item => item.sourceRef))];
  const statement = `Recipient-bound handoff prepared for '${method.parameters.targetGroup}'; delivered in the parent dossier; recipient acknowledgement pending.`;
  return artifact.type === 'dossier'
    && artifact.content.claims?.[0]?.statement === statement
    && same(artifact.content.claims?.[0]?.evidence, refs)
    && same(artifact.provenance?.sourceRefs, refs);
}

function clinicalReference(method, artifact) {
  const input = method.parameters;
  const expected = { caseScope: 'synthetic_educational',
    differentialConsiderations: input.considerations.map(item => item.consideration),
    uncertainty: input.uncertainty,
    safetyNote: 'Synthetic educational material only. No individual diagnosis or treatment advice.',
    evidence: input.considerations.map(item => item.sourceRef) };
  return artifact.type === 'clinical_report' && input.caseScope === 'synthetic_educational'
    && same(artifact.content, expected);
}

function clinicalIntegrity(method, artifact) {
  const output = artifact.content;
  const inputDigest = digest(method);
  const receiptId = `solver://sha256:${digest({ inputDigest, output })}`;
  const refs = [receiptId, ...new Set(output.evidence || [])];
  return artifact.type === 'clinical_report'
    && same(artifact.provenance?.sourceRefs, refs);
}

function procedureReceiptId(procedure, result) {
  const methodId = procedure.methodId;
  const parameters = methodId === 'lpt'
    ? { jobs: procedure.parameters.jobs.map((job) => ({ id: job.id, duration: job.duration })),
      machines: procedure.parameters.machines }
    : { values: procedure.parameters.values, target: procedure.parameters.target };
  const output = methodId === 'lpt'
    ? { assignments: result.assignments.map((item) => ({ machine: item.machine,
      jobs: item.jobs, load: item.load })), makespan: result.makespan }
    : { found: result.found, indices: result.indices,
      sum: result.sum, reachableCount: result.reachableCount };
  const inputDigest = createHash('sha256').update(JSON.stringify({ methodId, parameters })).digest('hex');
  return { id: `solver://sha256:${createHash('sha256')
    .update(JSON.stringify({ methodId, inputDigest, output })).digest('hex')}`,
  inputDigest: `sha256:${inputDigest}` };
}

function expectedVerdict(methodId, candidateReceipt, expected) {
  const accepted = candidateReceipt.id === expected.id
    && candidateReceipt.inputDigest === expected.inputDigest
    && same(candidateReceipt.result, expected.result);
  return methodId === 'verify_procedure'
    ? (accepted ? 'accept' : 'reject') : (accepted ? 'unresolved' : 'reject');
}

function verificationReference(method, artifact) {
  const { procedure, candidateReceipt } = method.parameters;
  if (procedure?.methodId !== 'subset_sum') return false;
  const content = artifact.content;
  const expected = content.expectedReceipt;
  const checked = checkSubset({ method: procedure, result: expected?.result }, 'subset_bitset');
  if (checked.status !== 'verified') return false;
  const identity = procedureReceiptId(procedure, expected.result);
  return content.verdict === expectedVerdict(method.methodId, candidateReceipt, expected)
    && expected.id === identity.id
    && expected.inputDigest === identity.inputDigest
    && content.candidateReceiptId === candidateReceipt.id;
}

function verificationIntegrity(method, artifact) {
  const content = artifact.content;
  const expected = content.expectedReceipt;
  const identity = procedureReceiptId(method.parameters.procedure, expected.result);
  return artifact.type === 'verification_report' && expected.id === identity.id
    && expected.inputDigest === identity.inputDigest
    && same(artifact.provenance?.sourceRefs, [expected.id])
    && same(content.evidence, [expected.id]);
}

function creativeReference(method, artifact) {
  const input = method.parameters;
  const selected = artifact.content;
  const goal = input.goal.toLocaleLowerCase();
  const combinations = input.dimensions.reduce((rows, dimension) => rows.flatMap((row) =>
    dimension.options.map((option) => [...row, { dimension: dimension.name, option }])), [[]]);
  const ranked = combinations.map((parts) => {
    const evidence = input.evidence.filter((item) => goal.includes(item.goalCue.toLocaleLowerCase())
      && parts.some((part) => part.dimension === item.dimension && part.option === item.option));
    return { candidate: parts.map((part) => `${part.dimension}: ${part.option}`).join('; '),
      score: evidence.length, evidence: [...new Set(evidence.map((item) => item.sourceRef))] };
  }).sort((a, b) => b.score - a.score || a.candidate.localeCompare(b.candidate, 'en'));
  return artifact.type === 'creative_candidate' && selected.candidate === ranked[0].candidate
    && same(selected.alternatives, ranked.slice(1).map((item) => item.candidate))
    && same(selected.candidateScores, ranked) && same(selected.selectedEvidence, ranked[0].evidence)
    && selected.selectionRule === 'Goal-aligned evidence ranking';
}

function creativeIntegrity(method, artifact) {
  const output = artifact.content;
  const receiptId = `solver://sha256:${digest({ inputDigest: digest(method), output })}`;
  return artifact.type === 'creative_candidate'
    && same(artifact.provenance?.sourceRefs, [receiptId, ...method.parameters.sourceRefs]);
}

function lptExpected(jobs, machineCount) {
  const ordered = [...jobs].sort((a, b) => b.duration - a.duration
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const assignments = Array.from({ length: machineCount }, (_, machine) => ({ machine, jobs: [], load: 0 }));
  for (const job of ordered) {
    const target = assignments.reduce((best, item) => item.load < best.load ? item : best);
    target.jobs.push(job.id);
    target.load += job.duration;
  }
  return { assignments, makespan: Math.max(...assignments.map((item) => item.load)) };
}

function experimentReference(method, artifact) {
  const { jobs, machines, threshold } = method.parameters;
  const expected = lptExpected(jobs, machines);
  const content = artifact.content;
  const measured = content.measurements?.[0];
  return artifact.type === 'experiment_record'
    && same(content.procedureReceipt?.result, expected)
    && measured?.metric === 'makespan' && measured.value === expected.makespan
    && content.conclusion === (expected.makespan <= threshold
      ? 'supported_for_this_input' : 'refuted_for_this_input');
}

function experimentIntegrity(method, artifact) {
  const { jobs, machines } = method.parameters;
  const receipt = artifact.content.procedureReceipt;
  const identity = procedureReceiptId({ methodId: 'lpt', parameters: { jobs, machines } }, receipt.result);
  return artifact.type === 'experiment_record' && receipt.id === identity.id
    && receipt.inputDigest === identity.inputDigest
    && same(artifact.provenance?.sourceRefs, [receipt.id]);
}

function checkWorker(subject, strategy) {
  if (!STRATEGIES.has(strategy) || subject?.method?.version !== 1 || !subject.artifact?.content) {
    return outcome(strategy, 'inconclusive', 'worker_domain_unavailable');
  }
  const checks = {
    scan_literal: [scoutReference, scoutIntegrity],
    monitor_samples: [monitorReference, monitorIntegrity],
    synthesize_claims: [synthesisReference, synthesisIntegrity],
    trace_declared_causes: [forensicReference, forensicIntegrity],
    prepare_handoff: [liaisonReference, liaisonIntegrity],
    review_synthetic_case: [clinicalReference, clinicalIntegrity],
    verify_procedure: [verificationReference, verificationIntegrity],
    falsify_procedure: [verificationReference, verificationIntegrity],
    combine_candidates: [creativeReference, creativeIntegrity],
    measure_lpt: [experimentReference, experimentIntegrity]
  };
  const pair = checks[subject.method.methodId];
  if (!pair) return outcome(strategy, 'inconclusive', 'worker_method_unavailable');
  try {
    const passed = pair[strategy === 'worker_reference' ? 0 : 1](subject.method, subject.artifact);
    return outcome(strategy, passed ? 'verified' : 'refuted',
      passed ? 'worker_postconditions_checked' : 'worker_postconditions_false');
  } catch (_) { return outcome(strategy, 'inconclusive', 'worker_input_outside_domain'); }
}

module.exports = { STRATEGIES, VERSION, checkWorker };
