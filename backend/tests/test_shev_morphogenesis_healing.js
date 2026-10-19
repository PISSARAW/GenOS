'use strict';

const assert = require('node:assert/strict');
const bridge = require('../src/services/shevMorphogenesisHealingBridge');

async function main() {
  const rows = new Map([
    ['SELECT * FROM shev_healing_episodes WHERE id = ?', { id: 'episode', project_id: 'project',
      source_observation_id: 'lesion', current_phase: 'inflammation' }],
    ['SELECT * FROM shev_observations\n    WHERE project_id = ? AND id = ?', { id: 'lesion', project_id: 'project',
      kind: 'degradation', epistemic_status: 'observed' }]
  ]);
  const result = await bridge.compileEpisodePlan({ db: { get: async (sql) => rows.get(sql) },
    episodeId: 'episode', loadEvidence: async () => ({ status: 'observed', errors: [],
      states: [{ agentId: 'agent', agentStatus: 'active' }],
      pathologies: [{ id: 'pathology', agentId: 'agent', pathologyType: 'mutation_drift',
        severity: 0.8, confidence: 0.9, status: 'active' }], rustApplications: [] }) });
  assert.equal(result.plan.primaryFamily, 'genetic');
  assert.equal(result.plan.recommendedControl, 'repair_inherited_source_before_recruitment');
  assert.equal(result.plan.promotionEligible, false);
  assert.ok(result.plan.proofObligations.some((item) => item.id === 'post_transition_nosology_recheck'));
  let updated;
  await bridge.recordResolution({ episode: { ...result.episode, current_phase: 'healed' },
    nosology: result.nosology, evidenceRefs: ['artifact:resolution'],
    updateProfile: async (record) => { updated = record; } });
  assert.equal(updated.resolution, 'healed');
  await assert.rejects(bridge.recordResolution({ episode: result.episode }), /terminal healing phase/);
  console.log('SHEV nosology and morphogenesis healing bridge checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
