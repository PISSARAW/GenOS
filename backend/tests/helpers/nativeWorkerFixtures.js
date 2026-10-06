'use strict';

const { createHash } = require('node:crypto');
const { runProcedure } = require('../../src/services/agents/deterministicWorkerProcedures');

const hash = (value) => createHash('sha256').update(value).digest('hex');
const method = (methodId, parameters) => ({ version: 1, methodId, parameters });
const subset = method('subset_sum', { values: [3, 5, 7], target: 10 });
const lpt = method('lpt', { jobs: [{ id: 'A', duration: 5 }, { id: 'B', duration: 4 },
  { id: 'C', duration: 3 }], machines: 2 });
const scoped = method('scoped_procedure', { procedure: subset });

function fixtures(root) {
  const candidateReceipt = runProcedure(subset).receipt;
  const incidentEvents = [
    { id: 'deploy', occurredAt: '2026-10-06T10:00:00Z', sourceRef: 'incident://native/deploy' },
    { id: 'alert', occurredAt: '2026-10-06T10:01:00Z', sourceRef: 'incident://native/alert',
      causedBy: { eventId: 'deploy', receiptRef: 'incident://native/cause' } }
  ];
  return {
    scout_cell: method('scan_literal', { sources: [{ sourceRef: 'corpus://native/1', text: 'timeout=30' }], terms: ['timeout'] }),
    resident_daemon: method('monitor_samples', { territoryId: 'territory-native', threshold: 2,
      samples: [{ value: 3, sourceRef: 'samples://native/1', observedAt: '2026-10-06T10:00:00Z' }] }),
    bounded_worker: scoped,
    adaptive_worker: method('adapt_procedure', { trials: [
      { strategy: 'controlled_probe', procedure: lpt }, { strategy: 'causal_bisection', procedure: lpt }
    ] }),
    specialist: method('niche_procedure', { niche: 'scheduling', procedure: lpt }),
    procedural_executor: subset,
    symbiotic_worker: method('host_procedure', { capability: 'deterministic_procedure', procedure: subset }),
    verifier_worker: method('verify_procedure', { procedure: subset, candidateReceipt }),
    red_worker: method('falsify_procedure', { procedure: subset, candidateReceipt: { ...candidateReceipt, result: { found: false } } }),
    experimental_worker: method('measure_lpt', { ...lpt.parameters, threshold: 7 }),
    formal_worker: method('check_arithmetic', { claim: '2 + 2 * 3 = 8' }),
    synthesis_worker: method('synthesize_claims', { sources: [
      { sourceRef: 'source://native/a', claim: 'Deploy', position: 'yes' },
      { sourceRef: 'source://native/b', claim: 'Deploy', position: 'no' }
    ] }),
    creative_worker: method('combine_candidates', { dimensions: [{ name: 'color', options: ['blue', 'green'] },
      { name: 'layout', options: ['grid', 'list'] }], assumptions: ['Users can distinguish the colors.'],
    falsificationTest: 'Reject a candidate if task completion falls below the baseline.', sourceRefs: ['design://native/brief'] }),
    medical_worker: method('review_synthetic_case', { caseScope: 'synthetic_educational', vignette: 'Fictional classroom vignette.',
      considerations: [{ consideration: 'Incomplete information limits interpretation.', sourceRef: 'education://native/1' }],
      uncertainty: 'The supplied vignette cannot establish a clinical conclusion.' }),
    recovery_worker: method('restore_checkpoint', { path: 'state.txt', content: 'checkpoint',
      checkpointDigest: hash('checkpoint'), expectedCurrentDigest: hash('damaged') }),
    forensic_worker: method('trace_declared_causes', { events: incidentEvents }),
    liaison_worker: method('prepare_handoff', { sourceGroup: 'producers', targetGroup: 'reviewers',
      items: [{ sourceRef: 'design://native/brief', summary: 'Review the design alternatives.' }] }),
    teaching_worker: method('teach_subset_sum', { procedure: subset, learnerIndices: [0, 2], prerequisites: ['Addition of natural numbers.'] }),
    sub_orchestrator: method('coordinate_children', { children: [{ workerKind: 'bounded_worker', mission: 'Compute the scoped subset sum.',
      methodContract: scoped }] })
  };
}

function missionFor(kind, methodContract, root) {
  const kinds = require('../../src/services/agents/workerKindService');
  const mission = { agentId: `native-${kind}`, workerKind: kind, methodContract,
    prompt: 'Execute the assigned structured method.', scope: root, workspaceRoot: root,
    orchestratorAgentId: 'native-parent', specialtyNiche: 'scheduling', hostContractId: 'host-native',
    hostCapabilities: ['deterministic_procedure'], recoveryLease: { action: 'restore_checkpoint', path: 'state.txt' } };
  mission.workerContract = kinds.buildWorkerContract(kind, mission);
  if (kind === 'sub_orchestrator') kinds.grantBoundedDelegation(mission.workerContract);
  return mission;
}

module.exports = { fixtures, missionFor, method, hash, subset, lpt, scoped };
