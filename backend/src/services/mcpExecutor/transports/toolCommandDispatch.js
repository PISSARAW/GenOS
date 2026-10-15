'use strict';

const LOCAL_COMMAND_TOOLS = {
  genos_agent_world_capsule: (args) => `genos capsule create --snapshot ${args.snapshot_id}` + (args.seed ? ` --seed "${args.seed}"` : '') + (args.budget_steps ? ` --budget-steps ${args.budget_steps}` : ''),
  genos_world_sandbox_execute: (args) => `genos world run --provider directory --root .genos/world --world-id ${args.world_id} --command "${args.command}" --sandbox-backend ${args.backend}`,
  genos_world_hardlink_create: (args) => `genos world create --provider hardlink --root .genos/world --world-id ${args.world_id} --seed "${args.seed}"`,
  genos_biomimicry_sar_prime: (args) => `genos biomimicry bio-feature --feature sar --action prime --param incident_id=${args.incident_id} --param severity=${args.severity || 1.0}`,
  genos_advanced_budget_allocation: (args) => {
    const cmdParams = [`--param total_budget=${args.total_budget}`];
    if (args.entropy !== undefined) cmdParams.push(`--param entropy=${args.entropy}`);
    if (args.scenarios) args.scenarios.forEach((scenario) => cmdParams.push(`--param scenario="${scenario}"`));
    return `genos biomimicry bio-feature --feature bet-hedging --action allocate ${cmdParams.join(' ')}`;
  },
  genos_merge: (args) => `genos merge ${args.branch_id}` + (args.conditions ? ` --conditions "${args.conditions}"` : ''),
  genos_export_audit: (args) => `genos audit ${args.snapshot_id} --output "${args.output || `audit_${args.snapshot_id}.log`}"`,
  genos_cost_accounting: (args) => `genos cost-accounting ${args.agent_id} ${args.timeframe ? `--timeframe ${args.timeframe}` : ''}`
};

const SYNC_COMMAND_TOOLS = {
  genos_loop_detection_check: ({ history_file, exact_match = 3, stagnation = 5, similarity = 0.95 }) =>
    `genos loop-detection --history-file ${history_file} --exact-match ${exact_match} --stagnation ${stagnation} --similarity ${similarity}`,
  genos_causality_fork: ({ boundary_id, new_boundary_id }) =>
    `genos causality fork --boundary-id ${boundary_id} --new-boundary-id ${new_boundary_id}`,
  genos_incident_experiment: (args) => `genos experiment incident ${args.manifest}`,
  genos_bug_investigation: (args) => `genos experiment bug-investigation ${args.manifest}`,
  genos_phenotype_measure_divergence: ({ trait_name, expected, observed, tolerance }) =>
    `genos phenotype measure-divergence --trait-name "${trait_name}" --expected ${expected} --observed ${observed} --tolerance ${tolerance}`,
  genos_allele_frequency_analyzer: (args) => `genos swarm allele-analyzer --swarm-id ${args.swarm_id}`,
  genos_strategy_adaptation: (args) => `genos strategy adapt --agent-id ${args.agent_id} --constraint ${args.constraint} --target ${args.target_value}`,
  genos_rebase_compute_plan: ({ graph_file, injection_step, injected_keys }) => {
    const keysArgs = injected_keys.map((key) => `--injected-keys ${key}`).join(' ');
    return `genos rebase compute-plan --graph-file ${graph_file} --injection-step ${injection_step} ${keysArgs}`;
  },
  genos_guardrails_verify: ({ iteration, tokens, elapsed, uncertainty }) =>
    `genos guardrails verify --iteration ${iteration} --tokens ${tokens} --elapsed ${elapsed} --uncertainty ${uncertainty}`,
  genos_resilience_apoptosis: (args) => `genos resilience apoptosis --agent-id ${args.agent_id}`,
  genos_parasitic_pressure: (args) => `genos eval parasitic-pressure ${args.manifest}`,
  genos_bisect_agent: (args) => `genos dev bisect-agent --agent-id ${args.agent_id} --predicate "${args.predicate}"`,
  genos_hypothesis_evidence: (args) => {
    let command = `genos dev hypothesis-evidence ${args.diagnosis_id} ${args.hypothesis_id} --claim "${args.claim}" --source "${args.source}" --confidence ${args.confidence}`;
    if (args.artifact) command += ` --artifact "${args.artifact}"`;
    if (args.against) command += ' --against';
    return command;
  },
  genos_biomimicry_skill_proceduralize: (args) => {
    const cmdParams = [`--param skill=${args.skill}`];
    if (args.successes !== undefined) cmdParams.push(`--param successes=${args.successes}`);
    if (args.failures !== undefined) cmdParams.push(`--param failures=${args.failures}`);
    if (args.variance !== undefined) cmdParams.push(`--param variance=${args.variance}`);
    if (args.failure_rate !== undefined) cmdParams.push(`--param failure_rate=${args.failure_rate}`);
    if (args.steps) args.steps.forEach((step) => cmdParams.push(`--param step=${step}`));
    if (args.preconditions) args.preconditions.forEach((condition) => cmdParams.push(`--param precondition=${condition}`));
    return `genos biomimicry bio-feature --feature proceduralization --action ${args.action} ${cmdParams.join(' ')}`;
  }
};

function localCommandFor(toolName, args) {
  switch (toolName) {
    case 'genos_agent_world_capsule': return LOCAL_COMMAND_TOOLS.genos_agent_world_capsule(args);
    case 'genos_world_sandbox_execute': return LOCAL_COMMAND_TOOLS.genos_world_sandbox_execute(args);
    case 'genos_world_hardlink_create': return LOCAL_COMMAND_TOOLS.genos_world_hardlink_create(args);
    case 'genos_biomimicry_sar_prime': return LOCAL_COMMAND_TOOLS.genos_biomimicry_sar_prime(args);
    case 'genos_advanced_budget_allocation': return LOCAL_COMMAND_TOOLS.genos_advanced_budget_allocation(args);
    case 'genos_merge': return LOCAL_COMMAND_TOOLS.genos_merge(args);
    case 'genos_export_audit': return LOCAL_COMMAND_TOOLS.genos_export_audit(args);
    case 'genos_cost_accounting': return LOCAL_COMMAND_TOOLS.genos_cost_accounting(args);
    default: return null;
  }
}

function syncCommandFor(toolName, args) {
  switch (toolName) {
    case 'genos_loop_detection_check': return () => SYNC_COMMAND_TOOLS.genos_loop_detection_check(args);
    case 'genos_causality_fork': return () => SYNC_COMMAND_TOOLS.genos_causality_fork(args);
    case 'genos_incident_experiment': return () => SYNC_COMMAND_TOOLS.genos_incident_experiment(args);
    case 'genos_bug_investigation': return () => SYNC_COMMAND_TOOLS.genos_bug_investigation(args);
    case 'genos_phenotype_measure_divergence': return () => SYNC_COMMAND_TOOLS.genos_phenotype_measure_divergence(args);
    case 'genos_allele_frequency_analyzer': return () => SYNC_COMMAND_TOOLS.genos_allele_frequency_analyzer(args);
    case 'genos_strategy_adaptation': return () => SYNC_COMMAND_TOOLS.genos_strategy_adaptation(args);
    default: return syncCommandForDevelopmentTools(toolName, args);
  }
}

function syncCommandForDevelopmentTools(toolName, args) {
  switch (toolName) {
    case 'genos_rebase_compute_plan': return () => SYNC_COMMAND_TOOLS.genos_rebase_compute_plan(args);
    case 'genos_guardrails_verify': return () => SYNC_COMMAND_TOOLS.genos_guardrails_verify(args);
    case 'genos_resilience_apoptosis': return () => SYNC_COMMAND_TOOLS.genos_resilience_apoptosis(args);
    case 'genos_parasitic_pressure': return () => SYNC_COMMAND_TOOLS.genos_parasitic_pressure(args);
    case 'genos_bisect_agent': return () => SYNC_COMMAND_TOOLS.genos_bisect_agent(args);
    case 'genos_hypothesis_evidence': return () => SYNC_COMMAND_TOOLS.genos_hypothesis_evidence(args);
    case 'genos_biomimicry_skill_proceduralize': return () => SYNC_COMMAND_TOOLS.genos_biomimicry_skill_proceduralize(args);
    default: return null;
  }
}

module.exports = { localCommandFor, syncCommandFor };
