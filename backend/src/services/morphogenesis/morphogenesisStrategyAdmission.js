'use strict';

const { createTopologyRegistry } = require('./registry/topologyRegistry');
const { MAX_COHORT_WORKERS } = require('./replacementCohortComposer');

const DEFAULT_REGISTRY = createTopologyRegistry();
const MAX_QUIESCENCE_AGE_MS = 30000;

function deny(reason, details = {}) {
  return { status: 'denied', executionAuthorized: false, reason, details };
}

function proposedSelection(policy) {
  const ranking = policy?.portfolio?.ranking;
  const selected = policy?.decision?.recipe;
  if (!selected || !ranking || ranking.decision?.decision !== 'PROPOSE') return null;
  if (ranking.decision.selectedId !== selected.candidateId) return null;
  return { ranking, selected };
}

function candidateFor(policy) {
  const proposal = proposedSelection(policy);
  if (!proposal) return null;
  const { ranking, selected } = proposal;
  const scored = matchingCandidate(ranking.candidates, selected.candidateId);
  const source = matchingCandidate(policy.portfolio.candidates, selected.candidateId);
  return scored && source ? { ...source, ...scored } : null;
}

function matchingCandidate(candidates, candidateId) {
  return (candidates || []).find((candidate) =>
    candidate.id === candidateId || candidate.candidateId === candidateId) || null;
}

function candidateFailure(policy, candidate) {
  if (!candidate.eligible || !candidate.proposalEligible) return 'recipe_not_advisory_eligible';
  if (!['TOPOLOGY', 'VARIANT'].includes(candidate.kind)) return 'recipe_kind_not_runtime_supported';
  if (!candidate.topology || candidate.topology !== policy.decision.recipe.topology
    || (candidate.variant || null) !== (policy.decision.recipe.variant || null)) return 'recipe_identity_mismatch';
  return null;
}

function validatePolicy(policy) {
  if (!policy || policy.kind !== 'conditional_morphogenesis_policy' || policy.status !== 'proposed') return deny('policy_not_proposed');
  const candidate = candidateFor(policy);
  if (!candidate) return deny('recipe_not_proposed_by_policy_portfolio');
  const failure = candidateFailure(policy, candidate);
  if (failure) return deny(failure);
  return { status: 'candidate_valid', candidate };
}

function validateQuiescence(gate, now) {
  if (!gate || gate.confirmed !== true || !Number.isFinite(gate.observedAt)) {
    return deny('quiescence_evidence_missing');
  }
  const age = now - gate.observedAt;
  if (age < 0 || age > MAX_QUIESCENCE_AGE_MS) return deny('quiescence_evidence_stale');
  if ([gate.activeProcesses, gate.databaseRunningWorkers, gate.activeLeases]
    .some((count) => !Number.isSafeInteger(count) || count !== 0)) {
    return deny('runtime_not_quiescent');
  }
  return null;
}

function validateRecipeRegistration(candidate, registry) {
  const topology = registry.get(candidate.topology);
  if (!topology) return deny('topology_not_registered');
  const variantId = candidate.variant || 'default';
  const variant = registry.variants.listEntries(candidate.topology)
    .find((entry) => entry.variantId === variantId);
  if (!variant) return deny('variant_not_registered');
  if (!['implemented', 'stable'].includes(variant.maturity)) return deny('variant_not_mature');
  if (candidate.validation?.valid !== true) return deny('typed_topology_validation_missing');
  if (candidate.admissibility === 'rejected' || candidate.missingCapabilities?.length) {
    return deny('candidate_has_capability_veto');
  }
  return { topology, variant, variantId };
}

function validateCapabilities(candidate, registration, inventory) {
  if (!Array.isArray(inventory)) return deny('topology_capability_inventory_unknown');
  const required = [...new Set([...(registration.topology.requiredCapabilities || []),
    ...(registration.variant.requiredCapabilities || []), ...(candidate.requiredCapabilities || [])])];
  const available = new Set(inventory.map((item) => String(item).toUpperCase()));
  const missing = required.filter((item) => !available.has(String(item).toUpperCase()));
  return missing.length ? deny('topology_capabilities_missing', { missing }) : null;
}

function assignmentDenial(input) {
  const { assignment, kinds } = input;
  if (!assignment?.workerKind || !kinds.has(assignment.workerKind)) {
    return deny('worker_kind_unavailable', { workerKind: assignment?.workerKind || null });
  }
  return null;
}

function workerCapabilityDenial(input) {
  const { topology, assignments, requiredCapabilities } = input;
  const matching = assignments.filter((item) => (item.morphologyTopology || item.topology || topology) === topology);
  if (!matching.length) return deny('topology_has_no_worker_assignment', { topology });
  const available = new Set(matching.flatMap((item) => item.capabilities || [])
    .map((item) => String(item).toUpperCase()));
  const missing = requiredCapabilities.filter((capability) => !available.has(String(capability).toUpperCase()));
  return missing.length ? deny('worker_capabilities_missing', { topology, missing }) : null;
}

function validateWorkers(input) {
  const { plan, availableKinds, candidate } = input;
  const assignments = plan?.workerAssignments;
  if (!Array.isArray(assignments) || !assignments.length || assignments.length > MAX_COHORT_WORKERS) return deny('worker_assignments_invalid');
  if (!Array.isArray(availableKinds)) return deny('worker_kind_inventory_unknown');
  const kinds = new Set(availableKinds);
  const kindDenial = assignments.map((assignment) => assignmentDenial({ assignment, kinds })).find(Boolean);
  if (kindDenial) return kindDenial;
  const requirements = candidate.topologyRequirements || [{ topology: candidate.topology,
    requiredCapabilities: candidate.requiredCapabilities || [] }];
  return requirements.map((requirement) => workerCapabilityDenial({ ...requirement, assignments }))
    .find(Boolean) || null;
}

function validateBudget(plan, budget) {
  const available = Number(budget?.availableTokens);
  const allocated = Number(plan?.allocatedTokens);
  const assigned = Array.isArray(plan?.workerAssignments)
    ? plan.workerAssignments.reduce((sum, item) => sum + Number(item.tokenBudget), 0) : NaN;
  if (!Number.isSafeInteger(available) || available < 0 || !Number.isSafeInteger(allocated) || allocated < 0) {
    return deny('token_budget_evidence_missing');
  }
  if (!Number.isSafeInteger(assigned) || assigned < 0 || assigned !== allocated) return deny('worker_budget_allocation_mismatch');
  if (allocated > available) return deny('token_budget_exceeded', { allocated, available });
  return null;
}

function validateLease(candidate, plan, lease) {
  const ceiling = lease?.allowedTools;
  const operation = candidate.kind === 'VARIANT' ? 'genos_change_strategy' : 'genos_change_organization';
  if (!Array.isArray(ceiling) || !ceiling.includes(operation)) {
    return deny('morphogenesis_lease_missing');
  }
  const allowed = new Set(ceiling.map(String));
  const requested = Array.isArray(plan?.requestedTools) ? plan.requestedTools : [];
  if (!requested.includes(operation)) return deny('morphogenesis_operation_not_requested', { operation });
  const excess = requested.filter((tool) => !allowed.has(String(tool)));
  return excess.length ? deny('requested_tools_exceed_parent_lease', { excess }) : null;
}

function validateConcretePlan(candidate, plan) {
  const variant = candidate.variant || 'default';
  if (plan?.selectedTopology !== candidate.topology || (plan.selectedVariant || 'default') !== variant) {
    return deny('actual_plan_recipe_mismatch');
  }
  const nodeCount = (plan.morphologyPatch?.graph?.nodes || []).filter((node) => node.kind === 'TOPOLOGY').length;
  if (candidate.selectionBasis !== 'planner_heuristic_unvalidated' && nodeCount !== 1) {
    return deny('actual_plan_graph_mismatch');
  }
  return graphMatchesPlannerSelection(plan.morphologyPatch?.graph, candidate.topology, variant)
    ? null : deny('actual_plan_graph_mismatch');
}

function bind(candidate, plan, registration) {
  return { ...plan, selectedTopology: candidate.topology,
    selectedVariant: registration.variantId, strategyRecipeId: candidate.id || candidate.candidateId,
    workerAssignments: plan.workerAssignments.map((assignment) => ({ ...assignment,
      topology: assignment.morphologyTopology || assignment.topology || candidate.topology,
      variant: assignment.morphologyVariant || assignment.variant || registration.variantId })) };
}

function graphMatchesPlannerSelection(graph, topology, variant) {
  const nodes = (graph?.nodes || []).filter((node) => node.kind === 'TOPOLOGY');
  return nodes.length > 0 && nodes.some((node) => node.topology === topology
    && (node.variant || 'default') === variant);
}

function plannerCandidateCapabilities(registry, topology, variant) {
  const topologyCapabilities = registry.get(topology)?.requiredCapabilities || [];
  const variantCapabilities = registry.variants.listEntries(topology)
    .find((entry) => entry.variantId === variant)?.requiredCapabilities || [];
  return [...new Set([...topologyCapabilities, ...variantCapabilities])];
}

function topologyRequirements(graph, registry) {
  const nodes = (graph?.nodes || []).filter((node) => node.kind === 'TOPOLOGY');
  const requirements = [];
  for (const node of nodes) {
    const topology = registry.get(node.topology);
    const variantId = node.variant || 'default';
    const variant = registry.variants.listEntries(node.topology).find((entry) => entry.variantId === variantId);
    if (!topology || !variant || !['implemented', 'stable'].includes(variant.maturity)) return null;
    requirements.push({ topology: node.topology, variant: variantId,
      requiredCapabilities: [...new Set([...(topology.requiredCapabilities || []), ...(variant.requiredCapabilities || [])])] });
  }
  return requirements;
}

function plannerRecipe(input, registry) {
  const plan = input.actualPlan;
  const topology = plan?.selectedTopology;
  const variant = plan?.selectedVariant || 'default';
  if (!topology || !plan?.morphologyPatch?.graph) return deny('planner_transition_plan_missing');
  if (!graphMatchesPlannerSelection(plan.morphologyPatch.graph, topology, variant)) return deny('planner_transition_graph_mismatch');
  const requirements = topologyRequirements(plan.morphologyPatch.graph, registry);
  if (!requirements) return deny('planner_transition_topology_not_mature');
  const contracts = Object.fromEntries(registry.list().map((id) => [id, registry.get(id)]));
  const validation = require('./typing/morphologyTypeChecker')
    .checkMorphologyTypes(plan.morphologyPatch.graph, contracts);
  const candidate = { id: `planner:${topology}:${variant}`, candidateId: `planner:${topology}:${variant}`,
    kind: variant === 'default' ? 'TOPOLOGY' : 'VARIANT', topology,
    variant: variant === 'default' ? null : variant, validation,
    topologyRequirements: requirements,
    requiredCapabilities: [...new Set(requirements.flatMap((item) => item.requiredCapabilities))],
    selectionBasis: 'planner_heuristic_unvalidated' };
  return { status: 'candidate_valid', candidate };
}

function validatePlannerPolicy(policy) {
  return policy?.kind === 'conditional_morphogenesis_policy'
    && policy.status === 'proposed' && policy.diagnosis?.signals
    ? null : deny('planner_policy_signals_missing');
}

function admittedResult(input, candidate, registration) {
  const plannerSelection = candidate.selectionBasis === 'planner_heuristic_unvalidated';
  return { status: 'admitted', executionAuthorized: true,
    selectionBasis: plannerSelection ? candidate.selectionBasis : 'calibrated_policy_proposal',
    comparativeQuality: 'unknown',
    recipe: { id: candidate.id || candidate.candidateId, topology: candidate.topology,
      variant: registration.variantId },
    actualPlan: bind(candidate, input.actualPlan, registration),
    gates: { policyProposal: !plannerSelection, topologyRegistration: true,
      maturity: registration.variant.maturity, typedValidation: true, topologyCapabilities: true,
      workerKinds: true, workerCapabilities: true, budget: true, parentLease: true, quiescence: true } };
}

function validateAdmissionGates(input) {
  const registry = input.registry || DEFAULT_REGISTRY;
  const registration = validateRecipeRegistration(input.candidate, registry);
  if (registration.status === 'denied') return registration;
  const denials = [validateConcretePlan(input.candidate, input.actualPlan),
    validateCapabilities(input.candidate, registration, input.topologyCapabilities),
    validateWorkers({ plan: input.actualPlan,
      availableKinds: input.availableWorkerKinds, candidate: input.candidate }),
    validateBudget(input.actualPlan, input.budget),
    validateLease(input.candidate, input.actualPlan, input.parentLease)];
  const denial = denials.find(Boolean);
  return denial || { status: 'admission_gates_passed', registration };
}

function admitCandidate(input, candidate) {
  const now = Number.isFinite(input.now) ? input.now : Date.now();
  const quiescenceDenied = validateQuiescence(input.quiescence, now);
  if (quiescenceDenied) return quiescenceDenied;
  const gates = validateAdmissionGates({ ...input, candidate });
  if (gates.status !== 'admission_gates_passed') return gates;
  return admittedResult(input, candidate, gates.registration);
}

function admitMorphogenesisStrategy(input = {}) {
  const policyCheck = validatePolicy(input.policy);
  if (policyCheck.status !== 'candidate_valid') return policyCheck;
  return admitCandidate(input, policyCheck.candidate);
}

function admitPlannerTransition(input = {}) {
  const policyDenied = validatePlannerPolicy(input.policy);
  if (policyDenied) return policyDenied;
  const registry = input.registry || DEFAULT_REGISTRY;
  const recipe = plannerRecipe(input, registry);
  if (recipe.status !== 'candidate_valid') return recipe;
  return admitCandidate({ ...input, registry }, recipe.candidate);
}

module.exports = { MAX_QUIESCENCE_AGE_MS, admitMorphogenesisStrategy, admitPlannerTransition };
