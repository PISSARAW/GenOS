'use strict';

const nosologyBridge = require('./morphogenesis/morphogenesisNosologyBridge');

const CANDIDATE_BY_FAMILY = Object.freeze({
  autoimmune: ['immune_recalibration'], degenerative: ['local_repair', 'cohort_replacement'],
  infectious: ['quarantine', 'contact_tracing'], genetic: ['inherited_source_repair'],
  cancer: ['circuit_breaker', 'roster_reduction'], metabolic: ['resource_reallocation'],
  cardiovascular: ['communication_rerouting'], psychiatric: ['causal_adjudication'],
  environmental: ['environment_isolation', 'recovery']
});

function candidatesFor(response) {
  const family = response.primaryFamily;
  return [{ id: 'no_change', family, action: 'observe_without_change', executionAuthorized: false },
    ...(CANDIDATE_BY_FAMILY[family] || []).map((action) => ({ id: action, family, action,
      scale: response.candidateScale || 'LOCAL_REPAIR', executionAuthorized: false }))];
}

function createHealingPlan(nosology) {
  const response = nosology.response;
  return { schema: 'genos.shev-morphogenesis-healing-plan/v1',
    nosologySchema: nosology.schema, primaryFamily: response.primaryFamily,
    recommendedControl: response.recommendedControl, candidateScale: response.candidateScale,
    candidates: candidatesFor(response), proofObligations: [...nosology.proofObligations,
      { id: 'post_transition_nosology_recheck', required: true,
        proof: 'nouvelle compilation nosologique après transition et preuves liées' }],
    requiresExplicitAuthorization: true, promotionEligible: false };
}

async function compileEpisodePlan(input) {
  if (!input?.db || !input.episodeId || typeof input.loadEvidence !== 'function') {
    throw new TypeError('SHEV nosology episode and evidence adapter are required.');
  }
  const episode = await input.db.get('SELECT * FROM shev_healing_episodes WHERE id = ?', [input.episodeId]);
  if (!episode) throw new Error('SHEV healing episode was not found.');
  const observation = await input.db.get(`SELECT * FROM shev_observations
    WHERE project_id = ? AND id = ?`, [episode.project_id, episode.source_observation_id]);
  if (!observation || !['degradation', 'capability_gap'].includes(observation.kind)) {
    throw new Error('SHEV episode source is not a supported lesion.');
  }
  const evidence = await input.loadEvidence({ episode, observation });
  const nosology = nosologyBridge.compileNosologyBridge({ evidence,
    orchestratorId: input.orchestratorId || observation.project_id,
    runtimeSignals: { failures: 0 }, state: { results: new Map() } });
  return { episode, observation, nosology, plan: createHealingPlan(nosology),
    requiresExplicitAuthorization: true, promotionEligible: false };
}

async function recordResolution(input) {
  const phase = input?.episode?.current_phase;
  if (!['healed', 'relapsed', 'scarred'].includes(phase)) {
    throw new Error('SHEV terminal healing phase is required for nosology resolution.');
  }
  if (!Array.isArray(input.evidenceRefs) || input.evidenceRefs.length === 0
      || typeof input.updateProfile !== 'function') {
    throw new Error('Nosology resolution requires evidence and a profile adapter.');
  }
  return input.updateProfile({ projectId: input.episode.project_id,
    sourceObservationId: input.episode.source_observation_id, resolution: phase,
    nosology: input.nosology, evidenceRefs: input.evidenceRefs,
    requiresExplicitAuthorization: true, promotionEligible: false });
}

module.exports = { compileEpisodePlan, createHealingPlan, recordResolution };
