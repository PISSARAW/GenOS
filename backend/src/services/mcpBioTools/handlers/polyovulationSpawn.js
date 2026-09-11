const crypto = require('crypto');
const { quoteCliArg } = require('../shellQuote');

// Registry for active polyovulation spawned fleets
const dizygoticFleetRegistry = new Map();

function getFleet(fleetId) {
  if (!dizygoticFleetRegistry.has(fleetId)) {
    dizygoticFleetRegistry.set(fleetId, {
      fleetId,
      workspaceId: 'ws-default',
      mission: 'Default mission',
      embryos: [], // array of distinct agent configurations
      diversityIndex: 1.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  return dizygoticFleetRegistry.get(fleetId);
}

function handlePolyovulationSpawn(args = {}, run) {
  const action = args.action || 'status';
  const fleetId = args.fleet_id || `dizygotic-fleet-${Date.now()}`;
  const workspaceId = args.workspace_id || 'ws-shared-uterine';
  const mission = args.mission || 'Solve collective task under diverse perspectives';
  const profiles = Array.isArray(args.profiles) ? args.profiles : [
    { role: 'FormalProver', model: 'claude-3-5-sonnet', heuristic: 'strict_invariants' },
    { role: 'HeuristicExplorer', model: 'gpt-4o', heuristic: 'broad_search' },
    { role: 'EmpiricalAuditor', model: 'qwen2.5-coder', heuristic: 'test_driven' }
  ];

  let cliOutput = null;
  if (typeof run === 'function') {
    try {
      const out = run(`genos biomimicry bio-feature --feature polyovulation --action ${quoteCliArg(action)} --param fleet_id=${quoteCliArg(fleetId)}`);
      cliOutput = out ? out.toString() : null;
    } catch (_) {}
  }

  const fleet = getFleet(fleetId);

  if (action === 'spawn_dizygotic_fleet') {
    fleet.workspaceId = workspaceId;
    fleet.mission = mission;

    fleet.embryos = profiles.map((p, idx) => {
      const genomeSeed = `${fleetId}::${p.role}::${p.model}::${idx}`;
      const genomeId = `gen-dizygote-${crypto.createHash('sha256').update(genomeSeed).digest('hex').slice(0, 8)}`;
      const agentId = `agent-${p.role.toLowerCase()}-${idx + 1}`;
      return {
        agentId,
        genomeId,
        lineageId: `lin-${crypto.createHash('md5').update(genomeSeed).digest('hex').slice(0, 6)}`, // distinct lineage per ovum
        generation: 1,
        profile: p,
        zygoteType: 'dizygotic_heterogeneous',
        status: 'gestating_active'
      };
    });

    // Compute genetic diversity index (distinct models / total count)
    const uniqueModels = new Set(profiles.map(p => p.model));
    fleet.diversityIndex = Number((uniqueModels.size / Math.max(1, profiles.length)).toFixed(2));
    fleet.updatedAt = new Date().toISOString();

    return {
      configured: true,
      success: true,
      status: 'dizygotic_fleet_spawned',
      transport: 'polyovulation_uterine_plane',
      fleet_id: fleetId,
      workspace_id: workspaceId,
      spawned_embryos_count: fleet.embryos.length,
      embryos: fleet.embryos,
      diversity_index: fleet.diversityIndex,
      output: `Polyovulation spawned ${fleet.embryos.length} dizygotic embryos in shared workspace '${workspaceId}'. Diversity index: ${fleet.diversityIndex}.`
    };
  }

  if (action === 'inspect_fleet_diversity') {
    return {
      configured: true,
      success: true,
      status: 'diversity_inspected',
      transport: 'polyovulation_uterine_plane',
      fleet_id: fleetId,
      embryos: fleet.embryos,
      diversity_index: fleet.diversityIndex,
      unique_lineages_count: new Set(fleet.embryos.map(e => e.lineageId)).size,
      output: `Fleet '${fleetId}' carries ${fleet.embryos.length} dizygotic agents across ${new Set(fleet.embryos.map(e => e.lineageId)).size} distinct genetic lineages.`
    };
  }

  // Default: status
  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'polyovulation_uterine_plane',
    fleet_id: fleetId,
    embryo_count: fleet.embryos.length,
    diversity_index: fleet.diversityIndex,
    output: `Polyovulation fleet '${fleetId}' active with ${fleet.embryos.length} dizygotic agent(s).`
  };
}

function handlePolyovulationSpawnError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'polyovulation_uterine_plane',
    output: e.stdout ? e.stdout.toString() : e.message
  };
}

module.exports = {
  handlePolyovulationSpawn,
  handlePolyovulationSpawnError,
  dizygoticFleetRegistry
};
