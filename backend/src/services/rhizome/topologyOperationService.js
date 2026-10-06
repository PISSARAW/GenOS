'use strict';

const rhizome = require('../rhizomeCoordinationService');

function configuredIds(name) {
  return String(process.env[name] || '').split(',').map(value => value.trim()).filter(Boolean);
}

function trust(db) {
  return { db, trustedVerifierDigests: configuredIds('GENOS_RHIZOME_TRUSTED_VERIFIER_DIGESTS'),
    admissionPolicy: { trustedVerifierDigests: configuredIds('GENOS_RHIZOME_TRUSTED_VERIFIER_DIGESTS'),
      trustedProviderIds: configuredIds('GENOS_RHIZOME_TRUSTED_PROVIDER_IDS') } };
}

const OPERATIONS = {
  mission_metrics: (db, id, args) => rhizome.missionMetrics(id, { ...trust(db), needs: args.needs,
    policy: args.convergence_policy, expectedGraphVersion: args.expected_graph_version }),
  maintain: (db, id, args) => rhizome.maintainTick(id, { db, now: args.now }),
  set_variant: (db, id, args) => rhizome.setVariant(id, args.variant_name, { db }),
  prune_apply: (db, id, args) => rhizome.applyPruningPlan(id, args.pruning_plan, { db, now: args.now }),
  admit_growth: (db, id, args) => rhizome.admitGrowthCandidate(id, {
    candidateId: args.growth_plan?.candidate?.candidateId, growthPlan: args.growth_plan,
    expectedGraphVersion: args.expected_graph_version, node: args.node, edges: args.edges, proof: args.proof
  }, trust(db))
};

module.exports = { OPERATIONS };
