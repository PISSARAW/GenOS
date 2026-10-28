'use strict';

const PROTOCOLS = Object.freeze({
  'ETT-01': [
    { id: 'inspect_stream', type: 'inspect_sensor_stream', fields: { candidateId: 'candidate' } },
    { id: 'form_question', type: 'form_research_question', fields: { question: 'text' } },
    { id: 'test_anomaly', type: 'test_anomaly_hypothesis', fields: { candidateId: 'candidate', method: 'text' } }
  ],
  'ETT-02': [
    { id: 'research_cycle', type: 'research_cycle', fields: {
      question: 'text', hypothesis: 'text', evidenceCandidateId: 'candidate' } }
  ],
  'ETT-03': [
    { id: 'state_hypothesis', type: 'state_falsifiable_hypothesis', fields: { hypothesis: 'text', falsifier: 'text' } },
    { id: 'choose_intervention', type: 'choose_intervention', fields: { candidateId: 'candidate' } },
    { id: 'run_discriminator', type: 'run_discriminating_test', fields: { candidateId: 'candidate', predictedOutcome: 'number_vector' } }
  ],
  'ETT-04': [
    { id: 'training', type: 'apply_training_procedure', fields: { candidateId: 'candidate', procedure: 'text' } },
    { id: 'transfer', type: 'measure_heldout_transfer', fields: { candidateId: 'candidate', prediction: 'number' } },
    { id: 'retention', type: 'check_prior_task_retention', fields: { candidateId: 'candidate', prediction: 'number' } },
    { id: 'store_skill', type: 'store_verified_skill', fields: { skillName: 'text', evidenceCandidateId: 'candidate' } }
  ],
  'ETT-05': [
    { id: 'audit', type: 'audit_claim_provenance', fields: { candidateId: 'candidate' } },
    { id: 'rerun', type: 'rerun_result_independently', fields: { candidateId: 'candidate', method: 'text' } },
    { id: 'correct', type: 'submit_corrected_conclusion', fields: { candidateId: 'candidate', acceptReportedResult: 'boolean' } }
  ],
  'ETT-06': [
    { id: 'inspect_evidence', type: 'inspect_new_evidence', fields: { candidateId: 'candidate' } },
    { id: 'update_belief', type: 'update_belief_probability', fields: { candidateId: 'candidate', probability: 'probability', rationale: 'text' } },
    { id: 'record_revision', type: 'record_belief_revision', fields: { conclusion: 'text' } }
  ],
  'ETT-07': [
    { id: 'load_checkpoint', type: 'load_checkpoint', fields: { candidateId: 'candidate' } },
    { id: 'verify_checkpoint', type: 'verify_checkpoint_integrity', fields: { candidateId: 'candidate', checksumValid: 'boolean' } },
    { id: 'resume', type: 'resume_investigation', fields: { candidateId: 'candidate',
      restoredItems: 'number', resume: 'boolean', nextQuestion: 'text' } }
  ],
  'ETT-08': [
    { id: 'estimate_value', type: 'estimate_information_value', fields: { candidateId: 'candidate', expectedValue: 'number' } },
    { id: 'compare_cost', type: 'compare_expected_value_and_cost', fields: { candidateId: 'candidate', continue: 'boolean', rationale: 'text' } }
  ],
  'ETT-09': [
    { id: 'sample', type: 'sample_world_state', fields: { candidateId: 'candidate' } },
    { id: 'infer_rule', type: 'state_latent_rule', fields: { rule: 'text', falsifier: 'text' } },
    { id: 'predict', type: 'predict_fresh_state', fields: { candidateId: 'candidate', prediction: 'boolean_vector' } },
    { id: 'verify_prediction', type: 'verify_fresh_prediction', fields: { candidateId: 'candidate', prediction: 'boolean_vector' } }
  ],
  'ETT-10': [
    { id: 'propose_patch', type: 'propose_bounded_patch', fields: { candidateId: 'candidate', change: 'text' } },
    { id: 'sandbox', type: 'run_patch_in_sandbox', fields: { candidateId: 'candidate' } },
    { id: 'decision', type: 'accept_or_rollback_patch', fields: { candidateId: 'candidate', acceptPatch: 'boolean', rationale: 'text' } }
  ],
  'ETT-11': [
    { id: 'collect_sources', type: 'collect_independent_sources', fields: { candidateId: 'candidate', sourceIds: 'text' } },
    { id: 'synthesize', type: 'synthesize_supported_claims', fields: { supportedClaimCount: 'number', citations: 'text' } },
    { id: 'resolve', type: 'resolve_source_conflict', fields: { candidateId: 'candidate', conflictsResolved: 'boolean' } }
  ],
  'ETT-12': [
    { id: 'research_cycle', type: 'advance_research_cycle', fields: { question: 'text', phase: 'text', evidenceCandidateId: 'candidate' } }
  ]
});

function repeatCount(scenarioId, difficulty) {
  if (scenarioId === 'ETT-02') return ({ simple: 5, difficult: 12, open: 20 })[difficulty];
  if (scenarioId === 'ETT-12') return ({ simple: 10, difficult: 50, open: 100 })[difficulty];
  return 1;
}

function stepsFor(scenarioId, difficulty) {
  const definitions = PROTOCOLS[scenarioId];
  if (!definitions) throw new TypeError(`Unknown scenario protocol: ${scenarioId}`);
  const count = repeatCount(scenarioId, difficulty);
  return definitions.flatMap((definition) => Array.from({ length: count }, (_, index) => ({
    ...definition, index: index + 1,
    ref: `ett-action:${scenarioId}:${definition.id}:${index + 1}`
  })));
}

function budgetFor(scenarioId, difficulty) {
  return stepsFor(scenarioId, difficulty).length + 2;
}

module.exports = { PROTOCOLS, stepsFor, budgetFor };
