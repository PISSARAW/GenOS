'use strict';
const assert = require('node:assert/strict');
const pareto = require('../src/services/trinityParetoService');
const service = require('../src/services/trinityService');
const adapters = require('../src/services/trinityAdapters');
const runtime = require('../src/services/trinityComparisonRuntime');
const design = require('../src/services/trinityWorldDesign');
function world(worldNumber) {
  const receipt = { status: 'verified', independent: true, evidenceDigest: 'sha256:fixture', verifierDigest: 'fixture', independenceDescriptor: { actorId: 'fixture-checker', workspaceId: 'fixture-verifier' } };
  const vector = { correctness: 0.9, coverage: 0.9, robustness: 0.9, reproducibility: 0.9, risk: 0.1, uncertainty: 0.1, constraintCoverage: 1 };
  return { worldNumber, agentId: 'fixture-world-' + worldNumber, report: { outcome: 'success', claims: [], tests: [],
    evidence: [{ id: 'fixture-evidence', verificationReceipt: receipt }], evidenceVector: vector,
    evidenceVectorEvidence: Object.fromEntries(Object.keys(vector).map(key => [key, ['fixture-evidence']])),
    hardConstraintsPassed: true, budgetStatus: 'within' } };
}
async function main() {
  const reports = Array.from({ length: 16 }, (_, index) => world(index + 1));
  assert.notEqual(pareto.compare(reports, { expectedWorlds: 16 }).outcome, 'ESCALATE_EXPERIMENT');
  assert.equal(pareto.compare([...reports, world(17)], { expectedWorlds: 16 }).reason, 'expected_world_count_required');
  assert.equal(pareto.compare(reports.map(() => world(1)), { expectedWorlds: 16 }).reason, 'distinct_world_numbers_required');
  const failed = [world(1), world(2), world(3)];
  failed[2].report.outcome = 'failed';
  assert.equal((await runtime.compareMission(null, {}, failed)).reason, 'initial_world_execution_incomplete');
  delete failed[2].report.outcome;
  assert.equal((await runtime.compareMission(null, {}, failed)).canMerge, false);
  const members = service.compose('Run a factorial experiment', { variantId: 'factorial', availableAdapters: adapters.installedAdapterNames() });
  assert.equal(members.length, 16);
  assert.equal(new Set(members.map(member => member.label)).size, 16);
  assert.equal(new Set(members.map(member => member.factorialCell.cellId)).size, 16);
  assert.equal(design.expectedWorlds(members[0].variantSelection), 16);
  const workerResolver = require('../src/services/topologyWorkerKindService');
  for (const member of workerResolver.applyTopologyWorkerKinds('trinity', members)) assert.ok(member.workerKind);
  const assigned = design.assignFactorialModels(members, ['standard-model', 'frontier-model']);
  const treatments = assigned.map(member => ({ worldNumber: member.worldNumber,
    report: { factorialCell: member.factorialCell },
    runtimeProvenance: { source: 'runtime_completion_event', model: member.localModel } }));
  const factorialProof = require('../src/services/trinityFactorialProvenance');
  assert.equal(factorialProof.evaluate(treatments, design.modelAssignments(assigned)).valid, true);
  treatments[0].runtimeProvenance.model = 'unexpected-model';
  assert.equal(factorialProof.evaluate(treatments, design.modelAssignments(assigned)).valid, false);
  assert.equal((await runtime.compareMission(null, {}, [world(1), world(1), world(3)])).canMerge, false);
  const route = design.workerRoute({ localModel: 'ollama://distinct-family:7b' });
  assert.equal(route.selectedModel, 'ollama://distinct-family:7b');
  assert.deepEqual(route.policy.fallbacks, []);
  const observed = require('../src/services/trinityObservedDiversity');
  assert.equal(observed.evaluate([world(1), world(2), world(3)], { experimentalDesign: { diversityPolicy: 'heterogeneous' } }).valid, false);
  assert.equal(observed.provenance([{ eventType: 'EVIDENCE_REPORT', payload: { model: 'claimed', provider: 'claimed' } }]), null);
  const budget = require('../src/services/trinityBudgetPolicy');
  const selection = { experimentalDesign: { replicationPolicy: 'quality_diversity_replicas' }, qdConfig: { replicaBudget: 2, tokensPerReplica: 100 } };
  const allocation = budget.allocate({ executionBudget: { tokens: 500 } }, 3, selection);
  assert.equal(allocation.reservedTokens, 200);
  assert.equal(allocation.perChamberTokens.reduce((sum, value) => sum + value, 0) + allocation.reservedTokens, 500);
  assert.throws(() => budget.allocate({ executionBudget: { tokens: 200 } }, 3, selection), { code: 'TRINITY_BUDGET_REQUIRED' });
  console.log('Trinity world counts, failed-world refusal, factorial identities and pinned routes: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
