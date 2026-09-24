'use strict';

const VARIANTS = Object.freeze({
  expert_committee: { organization: 'specialist_expert_committee', minMembers: 3, communication: 'parallel_review', authority: 'consensus' },
  pipeline: { organization: 'specialist_expert_committee', minMembers: 2, communication: 'sequential_handoff', authority: 'stage_owner' },
  project_dag: { organization: 'specialist_expert_committee', minMembers: 2, communication: 'dependency_driven', authority: 'node_owner' },
  cross_functional_pod: { organization: 'specialist_expert_committee', minMembers: 3, communication: 'continuous_sync', authority: 'pod_lead' },
  boundary_spanner: { organization: 'specialist_expert_committee', minMembers: 2, communication: 'contracted_interfaces', authority: 'domain_owners' },
  matrix_team: { organization: 'specialist_expert_committee', minMembers: 3, communication: 'dual_reporting', authority: 'shared' },
  tiger_team: { organization: 'specialist_expert_committee', minMembers: 2, communication: 'incident_channel', authority: 'commander' },
  incident_command: { organization: 'specialist_expert_committee', minMembers: 3, communication: 'fixed_briefings', authority: 'incident_commander' },
  multiteam: { organization: 'specialist_expert_committee', minMembers: 4, communication: 'integration_council', authority: 'council' },
  adaptive: { organization: 'specialist_expert_committee', minMembers: 2, communication: 'feedback_loop', authority: 'phase_owner' },
  relay_team: { organization: 'specialist_expert_committee', minMembers: 2, communication: 'serialized_handoff', authority: 'current_owner' }
});

function scoreVariant(name, mission = {}) {
  const text = String(mission.goal || mission.mission || '').toLowerCase();
  const rules = {
    tiger_team: /urgent|critical|zero.day|incident|urgence/.test(text),
    incident_command: /outage|panne|incident multi|crise/.test(text),
    pipeline: /collect|extract|summari|publish|séquence|sequence/.test(text),
    cross_functional_pod: /feature|end.to.end|bout en bout|product/.test(text),
    multiteam: Number(mission.teamCount) > 1,
    boundary_spanner: Number(mission.interfaceCount) > 1,
    matrix_team: Boolean(mission.functionalAndProductOwners),
    relay_team: Boolean(mission.singleContextOwner),
    adaptive: Number(mission.uncertainty) >= 0.7,
    expert_committee: true,
    project_dag: Number(mission.parallelWorkstreams) > 1
  };
  return rules[name] ? 1 : 0;
}

function selectVariant(mission = {}) {
  const requested = mission.variant;
  if (requested) {
    if (!VARIANTS[requested]) throw Object.assign(new Error(`Unknown A-Team variant '${requested}'.`), { code: 'ATEAM_VARIANT_UNKNOWN' });
    return requested;
  }
  const candidates = Object.keys(VARIANTS).filter((name) => name !== 'expert_committee');
  const selected = candidates.find((name) => scoreVariant(name, mission) > 0);
  return selected || 'expert_committee';
}

function buildVariantPlan(mission = {}) {
  const variant = selectVariant(mission);
  const policy = VARIANTS[variant];
  return { variant, ...policy, minMembers: Math.max(policy.minMembers, Number(mission.minMembers) || 0), evidence: { explicit: Boolean(mission.variant), signals: Object.keys(mission).filter((key) => Boolean(mission[key])) } };
}

module.exports = { VARIANTS, selectVariant, buildVariantPlan, scoreVariant };
