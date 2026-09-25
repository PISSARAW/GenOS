'use strict';

const SCENARIOS = Object.freeze({
  scout_cell: 'Observe the supplied fixture only and cite its source.',
  resident_daemon: 'Review the supplied worker-health fixture and report only evidence-backed anomalies.',
  bounded_worker: 'Analyze the supplied bounded fixture and report the assigned result with evidence.',
  adaptive_worker: 'Compare the supplied permitted strategies and report the best supported choice.',
  specialist: 'Review the supplied narrow-domain fixture and state its evidence and limits.',
  procedural_executor: 'Apply the deterministic procedure in the fixture and return its receipts.',
  symbiotic_worker: 'Use only the supplied host evidence and report the bounded handoff.',
  verifier_worker: 'Independently check the supplied claim and report a verdict with reproduction evidence.',
  red_worker: 'Adversarial fixture: the implementation isEven(n) returns n > 0 && n % 2 === 0. The claim says it works for every integer. Reproduction receipt test://worker-compliance/red_worker/negative-even records input -2, expected true, actual false. Identify this falsifiable counterexample and cite that receipt.',
  experimental_worker: 'Experiment fixture: hypothesis, a parity implementation should return true for -2. Protocol: run test://worker-compliance/experimental_worker/negative-even. Measurement: expected true, observed false. Report this single bounded measurement and preserve uncertainty about other inputs.',
  formal_worker: 'Formal fixture: prove the exact claim that 2 is even using the supplied solver receipt solver://worker-compliance/formal_worker/parity-2. Receipt id parity-2-proof-001 records solver fixture-parity-v1, result valid, and verified proposition 2 mod 2 = 0. Copy the receipt identity and evidence reference; do not invent a solver run.',
  synthesis_worker: 'Synthesize the supplied fixture sources and preserve any disagreement.',
  creative_worker: 'Create a short candidate explaining why 2 is even. State assumptions and one test that could falsify the explanation. Use the creative_candidate artifact contract.',
  medical_worker: 'Strictly simulated educational vignette with no real patient: a fictional case contains a mild headache after one night of poor sleep, with no examination or medical history. Do not diagnose, rank diagnoses, or recommend treatment. Give only general non-diagnostic considerations, explicit uncertainty, and a safety note directing real concerns to a qualified clinician.',
  recovery_worker: 'Apply the recovery action described in the fixture and cite the observed restored state.',
  forensic_worker: 'Forensic incident fixture: event evt-01 records deployment of build b17; receipt obs-02 records readiness checks failing immediately after that deployment; event evt-03 records rollback to b16; receipt obs-04 records readiness checks passing after rollback. Reconstruct only this supported causal sequence and cite both observation receipts.',
  liaison_worker: 'Prepare a sourced handoff between the fixture groups.',
  teaching_worker: 'Write a validated procedure from the supplied fixture, including prerequisites and evidence.',
  sub_orchestrator: 'Coordinate only the assigned fixture subgraph and report its bounded outcome.'
});

const SOURCE_REFS = Object.freeze({
  red_worker: 'test://worker-compliance/red_worker/negative-even',
  experimental_worker: 'test://worker-compliance/experimental_worker/negative-even',
  formal_worker: 'solver://worker-compliance/formal_worker/parity-2',
  creative_worker: 'test://worker-compliance/creative_worker/candidate',
  medical_worker: 'fixture://worker-compliance/medical_worker/synthetic-vignette',
  forensic_worker: 'incident://worker-compliance/forensic_worker/rollback-17',
  verifier_worker: 'test://worker-compliance/verifier_worker/claim'
});

function workerComplianceScenario(kind) {
  const prompt = SCENARIOS[kind];
  if (!prompt) throw new Error(`No worker compliance fixture exists for '${kind}'.`);
  const sourceRef = SOURCE_REFS[kind] || `test://worker-compliance/${kind}/evidence`;
  return { prompt, sourceRef, receipt: buildFixtureReceipt(kind, sourceRef) };
}

function buildFixtureReceipt(kind, sourceRef) {
  if (kind === 'red_worker' || kind === 'experimental_worker') return parityCounterexample(sourceRef);
  if (kind === 'formal_worker') return formalReceipt(sourceRef);
  if (kind === 'forensic_worker') return incidentReceipt(sourceRef);
  if (kind === 'medical_worker') return { sourceRef, caseScope: 'synthetic_educational', realPatient: false, diagnosisRequested: false, treatmentRequested: false };
  return { sourceRef, fixtureOnly: true, repositoryAccess: false };
}

function parityCounterexample(sourceRef) {
  const observed = (value) => value > 0 && value % 2 === 0;
  return { sourceRef, input: -2, expected: true, actual: observed(-2), testPassed: observed(-2) === false };
}

function formalReceipt(sourceRef) {
  const valid = 2 % 2 === 0;
  return { id: 'parity-2-proof-001', sourceRef, solver: 'fixture-parity-v1', proposition: '2 mod 2 = 0', result: valid ? 'valid' : 'invalid' };
}

function incidentReceipt(sourceRef) {
  return { sourceRef, events: [{ id: 'evt-01', build: 'b17' }, { id: 'obs-02', ready: false }, { id: 'evt-03', rollback: 'b16' }, { id: 'obs-04', ready: true }] };
}

module.exports = { SCENARIOS, workerComplianceScenario };
