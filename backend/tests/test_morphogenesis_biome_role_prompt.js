'use strict';

const assert = require('node:assert/strict');
const workers = require('../src/services/agentFleetWorkers');
const rolePrompt = require('../src/services/morphogenesisRolePrompt');
const localPrompt = require('../src/services/workerEvidenceLocalPrompt');
const workerRecovery = require('../src/services/workerFailureRecoveryService');

function promptFor(role, workerKind, specialtyNiche) {
  return workers.buildWorkerPrompt({
    identity: { introduction: 'You are a GenOS worker.' },
    conscience: { dissonanceLevel: 0 },
    assignment: {
      label: role,
      role,
      hypothesis: 'Use the assigned Biome function.',
      workerKind,
      specialtyNiche,
      workerAssignment: { topology: 'biome', topologyRole: role,
        nicheDomain: specialtyNiche }
    },
    context: {
      mission: { prompt: 'Repartis item1=1, item2=3, item3=2 en 3 groupes, plafond de 8.' },
      parent: { current_task: 'Repartis item1=1, item2=3, item3=2 en 3 groupes, plafond de 8.' },
      plan: { tokenPolicy: { allocation: 'uniform' } },
      perWorkerTokens: 1500
    }
  });
}

const observer = promptFor('environment_mapper', 'scout_cell');
assert.match(observer, /Observe the entities, values, units, and constraints/);
assert.match(observer, /required scout_observation artifact/);
assert.match(observer, /do not produce or claim the final solution/);
assert.match(observer, /If the available evidence is insufficient/);
assert.match(observer, /item1=1,item2=3,item3=2;count=3;groups=3;max=8/);

const observerMission = rolePrompt.morphogenesisMissionPrompt({ workerAssignment: {
  topology: 'biome', topologyRole: 'environment_mapper' } },
'Phase 1: répartis item1=2, item2=3. Contrainte: chaque groupe ne doit pas dépasser un total de 8; répartis en 3 groupes.\nRéponds au schéma de preuve GenOS complet: outcome=success.');
assert.match(observerMission, /items=item1=2,item2=3;count=2;groups=3;max=8/);
assert.match(observerMission, /"observation":"item1=2,item2=3"/);
assert.match(observerMission, /they are sufficient, so do not return unresolved/);
assert.match(observerMission, /\"observations\"/);
assert.doesNotMatch(observerMission, /Phase 1|sans concertation|Contrainte revelee/);
assert.doesNotMatch(observerMission, /Réponds au schéma de preuve GenOS complet/);
const realPrompt = 'Phase 1: répartis item1=1, item2=3, item3=2 en 3 groupes sans concertation. Contrainte révélée: aucun groupe ne doit dépasser un total de 8, et chaque élément doit appartenir à exactement un groupe.';
const realObserverMission = rolePrompt.morphogenesisMissionPrompt({ workerAssignment: {
  topology: 'biome', topologyRole: 'environment_mapper' } }, realPrompt);
assert.match(realObserverMission, /items=item1=1,item2=3,item3=2;count=3;groups=3;max=8/);
const normalizedPrompt = 'Phase 1: item1=1, item2=3, item3=2 en 3 groupes. Aucun groupe ne doit depasser un total de 8.';
assert.equal(rolePrompt.morphogenesisWorkerAssignments({}, 'biome', normalizedPrompt)
  .environment_mapper.methodContract.methodId, 'scan_literal',
'Accent-normalized French capacity constraints still bind the native scout method.');
const nativeMapperAssignments = rolePrompt.morphogenesisWorkerAssignments({}, 'biome', realPrompt);
assert.equal(nativeMapperAssignments.environment_mapper.methodContract.methodId, 'scan_literal');
assert.deepEqual(nativeMapperAssignments.environment_mapper.methodContract.parameters.terms.slice(0, 3),
  ['item1=1', 'item2=3', 'item3=2']);
assert.equal(nativeMapperAssignments.environment_mapper.methodContract.parameters.sources[0].sourceRef, 'mission');
const arrayAssignments = rolePrompt.morphogenesisWorkerAssignments([
  { role: 'environment_mapper', topology: 'biome', methodContract: { version: 1, methodId: 'prompt_defined' } }
], 'parallel_forks', realPrompt);
assert.equal(arrayAssignments[0].methodContract.methodId, 'scan_literal',
  'Array-based Biome assignments also replace the generic method.');
const dispatchedMapper = rolePrompt.bindBiomeMapperAssignment({ role: 'environment_mapper',
  workerAssignment: { topology: 'biome', topologyRole: 'environment_mapper', methodContract: { version: 1, methodId: 'prompt_defined' } } }, realPrompt);
assert.equal(dispatchedMapper.methodContract.methodId, 'scan_literal');
const roleOnlyMapper = rolePrompt.bindBiomeMapperAssignment({ role: 'environment_mapper',
  methodContract: { version: 1, methodId: 'prompt_defined' } }, realPrompt);
assert.equal(roleOnlyMapper.methodContract.methodId, 'scan_literal',
  'Fleet dispatch binds Biome mapper contracts even when morphology metadata was omitted.');
const topologyKinds = require('../src/services/topologyWorkerKindService');
const composedMapper = topologyKinds.applyTopologyWorkerKinds('biome', [{ role: 'environment_mapper',
  mission: realPrompt }])[0];
assert.equal(composedMapper.methodContract.methodId, 'scan_literal',
  'Biome composition binds literal evidence collection before worker dispatch.');
assert.equal(composedMapper.workerAssignment.methodContract.methodId, 'scan_literal');
const requestedBiomeMapper = topologyKinds.applyTopologyWorkerKinds('parallel_forks', [{ role: 'environment_mapper',
  mission: realPrompt, workerAssignment: { topology: 'biome', selectionSource: 'capability_match' } }])[0];
assert.equal(requestedBiomeMapper.methodContract.methodId, 'scan_literal',
  'Biome roles retain their native evidence method across a composite topology graph.');

const stewardMission = rolePrompt.morphogenesisMissionPrompt({ workerAssignment: {
  topology: 'biome', topologyRole: 'resource_steward' } },
'Repartis item1=1, item2=3, item3=2, item4=4, item5=1, item6=3, item7=5, item8=4, item9=1 en 3 groupes, plafond de 8.');
assert.match(stewardMission, /Total=24; combined capacity=3\*8=24, so each bin must total exactly 8/);
assert.match(stewardMission, /Compare each bin with 8, never the combined total with one bin/);
assert.match(stewardMission, /item1=1,item2=3,item3=2/);
assert.match(stewardMission, /Use each item once/);
assert.match(stewardMission, /Recalculate each bin/);
assert.match(stewardMission, /Search weights descending with backtracking/);
assert.match(stewardMission, /Claim impossibility only after exhaustive search/);
assert.match(stewardMission, /one GenOS dossier.*exactly one claim/);
assert.doesNotMatch(stewardMission, /Return a complete GenOS dossier: \{"outcome":"success"/);
assert.match(stewardMission, /only \{"bins":\[\[item IDs\],\[item IDs\],\.\.\.\]\} with exactly 3 inner arrays, never strings/);
assert.ok(stewardMission.length < 900, 'resource steward prompts stay small enough for bounded workers');
assert.doesNotMatch(stewardMission, /Deterministically verified assignment|Copy this exact candidate|"bins":\[\["item7"/);

const underfilledStewardMission = rolePrompt.morphogenesisMissionPrompt({ workerAssignment: {
  topology: 'biome', topologyRole: 'resource_steward' } },
'Repartis item1=2, item2=6, item3=6, item4=5, item5=2, item6=6, item7=4, item8=6 en 3 groupes, plafond de 13.');
assert.match(underfilledStewardMission, /Total=37; combined capacity=3\*13=39; each bin must total at most 13/);
assert.match(stewardMission, /Recalculate each bin/);
assert.doesNotMatch(stewardMission, /Phase 1|Contrainte revelee|N'utilise aucun outil/);

const smallAllocation = 'Repartis item1=2, item2=2, item3=1 en 2 groupes, plafond de 3.';
const biomeSteward = { topology: 'biome', topologyRole: 'resource_steward' };
assert.deepEqual(rolePrompt.validateBiomeAllocation({ bins: [['item1'], ['item2', 'item3']] }, smallAllocation, biomeSteward),
  { passed: true, issues: [] });
const normalizedStewardMission = rolePrompt.morphogenesisMissionPrompt(biomeSteward, smallAllocation);
assert.deepEqual(rolePrompt.validateBiomeAllocation({ bins: [['item1', 'item2'], ['item3']] },
  normalizedStewardMission, biomeSteward),
{ passed: false, issues: ['candidate.bin_1_over_capacity:4'] },
'The semantic guard also parses the compact groups/max prompt passed to local workers.');
assert.deepEqual(rolePrompt.validateBiomeAllocation({ bins: [['item1', 'item2', 'item2'], ['item3']] },
  normalizedStewardMission, biomeSteward),
{ passed: false, issues: ['candidate.bin_1_over_capacity:6', 'candidate.item_coverage'] });
assert.deepEqual(rolePrompt.validateBiomeAllocation({ bins: [['item1', 'item2'], ['item3']] }, smallAllocation, biomeSteward),
  { passed: false, issues: ['candidate.bin_1_over_capacity:4'] });
assert.deepEqual(rolePrompt.validateBiomeAllocation({ bins: [['item1'], 'item2', ['item3']] }, smallAllocation, biomeSteward),
  { passed: false, issues: ['candidate.bin_count'] });
const rejectedCandidate = JSON.stringify({ bins: [['item1', 'item2'], ['item3']] });
const rejectedFailure = workerRecovery.failureReport({ eventType: 'AGENT_FAILED',
  detail: 'Biome mutated output violates allocation constraints: candidate.bin_1_over_capacity:4.',
  payload: { workerArtifactDiagnostics: { code: 'BIOME_ALLOCATION_INVALID', candidate: rejectedCandidate,
    issues: ['candidate.bin_1_over_capacity:4'] } } },
{ agentId: 'qwen-worker', prompt: smallAllocation, recoveryAttempt: 0 });
assert.equal(rejectedFailure.category, 'mutated_output');
const repairedPrompt = rolePrompt.morphogenesisMissionPrompt(biomeSteward,
  workerRecovery.recoveryPrompt(rejectedFailure, workerRecovery.decideRecovery(rejectedFailure)));
assert.match(repairedPrompt, /Repair the previous candidate using this runtime feedback/);
assert.match(repairedPrompt, /\{"bins":\[\["item1","item2"\],\["item3"\]\]\}/);
assert.match(repairedPrompt, /candidate\.bin_1_over_capacity:4/);
const unresolvedFailure = workerRecovery.failureReport({ eventType: 'AGENT_FAILED',
  detail: 'Local worker reported that the supplied evidence cannot substantiate the requested outcome.',
  payload: { evidenceReport: { outcome: 'unresolved', claims: [],
    uncertainties: ['The partitioning task is impossible with these constraints.'] } } },
{ agentId: 'qwen-worker', prompt: smallAllocation, recoveryAttempt: 0 });
const reconsideredPrompt = rolePrompt.morphogenesisMissionPrompt(biomeSteward,
  workerRecovery.recoveryPrompt(unresolvedFailure, workerRecovery.decideRecovery(unresolvedFailure)));
assert.match(reconsideredPrompt, /Previous impossibility claim was unverified/);
assert.match(reconsideredPrompt, /exhaustive search/);
assert.match(reconsideredPrompt, /Retry the exhaustive search above/);
const baselineStewardPrompt = rolePrompt.morphogenesisMissionPrompt(biomeSteward, smallAllocation);
assert.ok(reconsideredPrompt.length - baselineStewardPrompt.length < 250,
  'unresolved recovery adds only compact feedback to the bounded worker prompt');
assert.equal(rolePrompt.morphogenesisUseMemoryContext({ workerAssignment: {
  topology: 'biome', topologyRole: 'resource_steward' } }), false,
'The resource steward should not receive unrelated memory context that consumes its solve budget.');
assert.equal(rolePrompt.validateBiomeAllocation({ bins: [['item1'], ['item2', 'item3']] }, smallAllocation,
  { topology: 'biome', topologyRole: 'environment_mapper' }), null);
assert.deepEqual(rolePrompt.validateBiomeAllocation({ bins: [['item1'], ['item2', 'item3']] }, smallAllocation,
  { role: 'resource_steward' }), { passed: true, issues: [] });


const steward = promptFor('resource_steward', 'specialist', 'biome:resource_steward');
assert.ok(steward.startsWith('items='), 'the concrete Biome allocation task leads the bounded worker prompt');
assert.doesNotMatch(steward, /\[WORKER SELF|Confiance calibrée|État de conscience/,
  'irrelevant identity and conscience context does not bury the allocation facts');
assert.ok(steward.length < 3000, 'the compact resource steward prompt leaves room for Qwen to reason and answer');
assert.match(steward, /Solve the assigned allocation task/);
assert.match(steward, /Verify every item appears exactly once/);
assert.match(steward, /all capacities before claiming success/);
assert.match(steward, /This niche includes exact resource allocation, partitioning, and capacity verification/);
assert.match(steward, /complete machine-verifiable candidate JSON object in claims\[0\]\.statement/);
assert.match(steward, /never replace it with a generic success sentence/);
assert.match(steward, /\"outcome\":\"unresolved\",\"claims\":\[\],\"uncertainties\"/);
assert.match(steward, /exact item identifiers \(item1, item2, etc\.\)/);

const retryPrompt = localPrompt.buildAnalysisPrompt({
  assignment: { role: 'resource_steward', workerAssignment: { topology: 'biome', topologyRole: 'resource_steward' } },
  prompt: `${smallAllocation}\nPrevious failure: Rejected Biome candidate: {"bins":[]}. Validator issues: candidate.bin_count.`,
  workerInstruction: 'Use only the supplied evidence reference: ["mission"].', evidenceRule: 'Return one evidence-backed GenOS dossier.'
});
assert.ok(retryPrompt.startsWith('items=item1=2,item2=2,item3=1;count=3;groups=2;max=3'),
  'direct local recovery keeps the allocation facts at the start of the Qwen prompt');
assert.match(retryPrompt, /Repair the previous candidate using this runtime feedback/);
assert.match(retryPrompt, /exactly 2 inner arrays, never strings/);

assert.equal(rolePrompt.morphogenesisRoleInstruction({ role: 'environment_mapper',
  morphologyTopology: 'rhizome' }), null,
'Biome role guidance must not leak into other topology prompts');

console.log('Biome morphogenesis role prompts match worker artifact contracts: PASS');
