'use strict';

const COUNTERFACTUAL_TYPES = Object.freeze([
  'strategy', 'capability', 'dna', 'plasmid',
  'communication_policy', 'relationship', 'worker_allocation',
]);

function genStrategy(ctx) {
  const alts = ctx.strategyAlternatives || [
    'n_way_counterfactual_fork', 'falsification_forks',
    'causal_replay_intervention', 'deterministic_replay',
  ];
  return { type: 'strategy', field: 'primary_strategy', alternatives: alts,
    hypothesis: 'Switch primary strategy improves outcome',
    rollback: 'restore_strategy' };
}

function genCapability(ctx) {
  const caps = ctx.capabilityTargets || ['analytical', 'adversarial', 'creative'];
  return { type: 'capability', field: 'capabilities', add: caps,
    hypothesis: 'Adding capabilities closes gap',
    rollback: 'remove_capabilities' };
}

function genDna(ctx) {
  return { type: 'dna', field: 'genome_action',
    action: ctx.dnaAction || 'mutate',
    targetTraits: ctx.targetTraits || ['adversarial', 'efficient'],
    hypothesis: 'DNA mutation strengthens traits',
    rollback: 'revert_genome' };
}

function genPlasmid(ctx) {
  return { type: 'plasmid', field: 'plasmid_acquisition',
    plasmidIds: ctx.plasmidIds || [], fromAgentIds: ctx.donorAgentIds || [],
    hypothesis: 'Acquiring plasmids enables missing capabilities',
    rollback: 'revoke_plasmids' };
}

function genCommPolicy(ctx) {
  return { type: 'communication_policy', field: 'channel_policy',
    policy: ctx.policy || { topology: 'broadcast', quorum: 0.66 },
    hypothesis: 'Communication topology improves consensus',
    rollback: 'restore_policy' };
}

function genRelationship(ctx) {
  return { type: 'relationship', field: 'relation_type',
    targetRelations: ctx.relations || [],
    hypothesis: 'Reconfiguring relationships reduces error correlation',
    rollback: 'restore_relations' };
}

function genWorkerAlloc(ctx) {
  return { type: 'worker_allocation', field: 'worker_distribution',
    allocation: ctx.allocation || { specialist_ratio: 0.6, generalist_ratio: 0.4 },
    hypothesis: 'Rebalancing worker allocation improves throughput',
    rollback: 'restore_allocation' };
}

const GENERATORS = Object.freeze({
  strategy: genStrategy, capability: genCapability, dna: genDna,
  plasmid: genPlasmid, communication_policy: genCommPolicy,
  relationship: genRelationship, worker_allocation: genWorkerAlloc,
});

function generateIntervention(type, ctx) {
  const gen = GENERATORS[type];
  return gen ? gen(ctx || {}) : null;
}

function calculateBlastRadius(intervention) {
  if (!intervention) return 0;
  let s = 5;
  if (intervention.type === 'strategy') s += 20;
  if (intervention.type === 'dna') s += 30;
  if (intervention.type === 'plasmid') s += 15;
  return Math.min(100, s);
}

module.exports = {
  COUNTERFACTUAL_TYPES, generateIntervention, calculateBlastRadius,
};
