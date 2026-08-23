const { listStrategies } = require('../strategies/strategyRegistry');
const { buildAllocation } = require('./tokenAllocationService');
const { ORGANIZATIONS } = require('./dynamicOrganizationService');

const MAX_WORKERS = 3;

function selected(contract, id) {
  return (contract.strategy_portfolio || []).some((strategy) => strategy.id === id);
}

function hasTrait(contract, trait) {
  const registry = new Map(listStrategies().map((strategy) => [strategy.id, strategy]));
  return (contract.strategy_portfolio || []).some((strategy) => registry.get(strategy.id)?.traits.includes(trait));
}

function phase(key, requiredTools, purpose, required = true) {
  return { key, requiredTools, purpose, required };
}

function workerRole(label, hypothesis, role, modelTier) {
  return { label, hypothesis, role, modelTier };
}

function buildAutonomyPlan(contract, budget = {}) {
  const profile = contract.problem_profile || {};
  const highRisk = profile.risk === 'high';
  const complex = Number(profile.complexity || 0) >= 0.65;
  const uncertain = Number(profile.uncertainty || 0) >= 0.6;
  const security = profile.type === 'security';
  const competition = selected(contract, 'strategy_arena') || selected(contract, 'genetic_strategy_algorithm') || hasTrait(contract, 'multi_objective');
  const evolution = selected(contract, 'genetic_strategy_algorithm') || hasTrait(contract, 'mutation');
  const branchCount = security || complex || uncertain ? MAX_WORKERS : 1;

  const phases = [
    phase('retrieve_and_diagnose', ['genos_search_failures', 'genos_diagnose'], 'Retrieve negative knowledge and establish falsifiable hypotheses.'),
    phase('snapshot_before_mutation', ['genos_snapshot'], 'Create a recoverable baseline before any risky mutation.'),
  ];
  if (branchCount > 1) phases.push(phase('counterfactual_forks', ['genos_fork', 'genos_solve'], 'Explore independent hypotheses in isolated branches.'));
  phases.push(phase('evidence_and_evaluation', ['genos_hypothesis_evidence', 'genos_evaluate_trajectories'], 'Score evidence and suspend dominated trajectories.'));
  if (evolution) phases.push(phase('controlled_mutation', ['genos_resilience_hypermutation'], 'Use bounded mutation only after a baseline and evidence exist.'));
  if (competition) phases.push(phase('competition_and_selection', ['genos_adversarial_review'], 'Run adversarial comparison and select a Pareto-safe winner.'));
  if (security) phases.push(phase('red_queen', ['genos_security_coevolution'], 'Run Red/Blue/neutral-observer coevolution in isolated worlds.'));
  phases.push(phase('replay_and_promote', ['genos_replay', 'genos_record_decision'], 'Replay the selected result and preserve the rationale before promotion.'));

  const branches = (contract.branches || []).slice(0, branchCount);
  const workers = security
    ? [
      workerRole('red', 'Find adversarial failure modes.', 'red_team', 'frontier'),
      workerRole('blue', 'Defend against the red-team findings.', 'blue_team', 'frontier'),
      workerRole('observer', 'Independently verify claims and veto unsupported conclusions.', 'neutral_observer', 'standard')
    ]
    : branches.map((branch, index) => workerRole(branch.label, branch.hypothesis, index === 0 ? 'implementation' : 'independent_reviewer', index === 0 ? 'frontier' : 'standard'));

  const requiredTools = [...new Set(phases.flatMap((entry) => entry.requiredTools))];
  const totalTokens = Number(budget.tokens || 500000);
  const minimumWorkerTokens = Number(budget.minimumWorkerTokens || 8000);
  const affordableWorkers = Math.max(0, Math.floor((totalTokens * 0.6) / minimumWorkerTokens));
  const dispatchWorkers = workers.slice(0, Math.min(workers.length, affordableWorkers));
  const allocation = complex || uncertain ? 'successive_halving_with_reallocation' : 'equal_minimum_then_score_weighted';
  const rounds = buildAllocation({
    totalTokens, workerShare: dispatchWorkers.length ? 0.6 : 0, workerCount: dispatchWorkers.length,
    minimumWorkerTokens, mode: allocation
  });

  return {
    schema: 'genos.autonomous-orchestration/v1alpha1',
    registry: { total: listStrategies().length, selected: (contract.strategy_portfolio || []).map((strategy) => strategy.id) },
    profile,
    organization: security ? 'red_blue_coevolution' : (contract.strategy_portfolio || []).find((strategy) => strategy.family === 'collective')?.id || 'network_silence',
    organizationPolicy: {
      initial: security ? 'red_blue_coevolution' : (contract.strategy_portfolio || []).find((strategy) => strategy.family === 'collective')?.id || 'network_silence',
      authority: 'orchestrator_may_change_at_any_decision_gate',
      availableOrganizations: Object.keys(ORGANIZATIONS),
      communicationModes: [...new Set(Object.values(ORGANIZATIONS).map((entry) => entry.exchange))],
      transitions: [
        { when: 'independent branches converge with reproducible evidence', to: 'hierarchical_merge', action: 'merge only the evidence, not an unchecked workspace' },
        { when: 'branches remain materially divergent after minimum evidence', to: 'competitive_arena', action: 'retain isolation and allocate the next token tranche to the strongest two' },
        { when: 'a hard invariant, exploit, or parasite branch succeeds', to: 'red_blue_coevolution', action: 'snapshot, quarantine the branch, and open an adversarial counter-branch' },
        { when: 'budget reserve reaches its stop threshold', to: 'network_silence', action: 'stop new branches and replay the best verified capsule' }
      ]
    },
    // These are not a fixed script. They are authority gates: the orchestrator
    // evaluates evidence from its own work and its workers, then elects the
    // smallest safe action. Every elected action has a concrete GenOS tool.
    decisionGates: [
      {
        id: 'reselect_strategy', scope: 'orchestrator',
        when: 'the mission scope, risk, uncertainty, evaluability, or observed failure mode materially differs from the active problem profile',
        actions: ['genos_change_strategy'],
        decide: 'state the changed need and evidence; keep the current contract when the complete 77-strategy evaluation finds no better portfolio'
      },
      {
        id: 'retrieve_relevant_memory', scope: 'orchestrator_and_workers',
        when: 'before retrying an approach or accepting a diagnosis',
        actions: ['genos_search_failures', 'genos_compile_memory'],
        decide: 'retrieve prior failures and relevant experience; skip only when no query can be made specific'
      },
      {
        id: 'iterate_diagnosis', scope: 'orchestrator_and_workers',
        when: 'a test, invariant, worker claim, or evidence item contradicts the current hypothesis',
        actions: ['genos_diagnose', 'genos_hypothesis_evidence'],
        decide: 'diagnose again with the new evidence; do not reuse a contradicted diagnosis'
      },
      {
        id: 'fork_or_delegate', scope: 'orchestrator',
        when: 'two hypotheses remain viable, a specialist is needed, or independent verification has value',
        actions: ['genos_snapshot', 'genos_fork', 'genos_create'],
        decide: 'snapshot first, then create only the minimum independent branches or GenOS workers justified by the remaining budget'
      },
      {
        id: 'select_or_merge_hypotheses', scope: 'orchestrator',
        when: 'branches return evidence or a branch is dominated',
        actions: ['genos_evaluate_trajectories', 'genos_merge', 'genos_record_decision'],
        decide: 'discard dominated branches; merge only evidence-backed compatible hypotheses, never unchecked workspaces'
      },
      {
        id: 'replay_or_escalate', scope: 'orchestrator',
        when: 'an error needs isolation, a mutation changed behaviour, or before promotion',
        actions: ['genos_replay', 'genos_snapshot', 'genos_security_coevolution'],
        decide: 'replay the smallest relevant capsule; escalate to an adversarial Red/Blue loop for security or recurring failures'
      }
    ],
    phases,
    requiredTools,
    workers,
    dispatchWorkers,
    competition: competition ? { enabled: true, mode: selected(contract, 'strategy_arena') ? 'strategy_arena' : 'pareto_selection' } : { enabled: false },
    evolution: evolution ? { enabled: true, mode: selected(contract, 'genetic_strategy_algorithm') ? 'genetic_strategy_algorithm' : 'bounded_hypermutation' } : { enabled: false },
    parasitism: { enabled: highRisk || security, mode: 'adversarial_parasite_branch', action: 'isolate_and_score_parasitic_trajectories' },
    tokenPolicy: {
      total: totalTokens,
      workerShare: dispatchWorkers.length ? 0.6 : 0,
      orchestratorReserve: dispatchWorkers.length ? 0.4 : 1,
      allocation,
      minimumWorkerTokens,
      stopConditions: contract.stop_conditions || [],
      rounds
    }
  };
}

module.exports = { buildAutonomyPlan };
