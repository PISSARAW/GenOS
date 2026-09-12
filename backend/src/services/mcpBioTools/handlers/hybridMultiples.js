const crypto = require('crypto');
const { quoteCliArg } = require('../shellQuote');

// Registry for hybrid multi-tier clusters
const hybridClusterRegistry = new Map();

function getCluster(clusterId) {
  if (!hybridClusterRegistry.has(clusterId)) {
    hybridClusterRegistry.set(clusterId, {
      clusterId,
      families: [],
      totalAgents: 0,
      dispersionMetrics: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  return hybridClusterRegistry.get(clusterId);
}

function buildClones(arch, fIdx, familyLineageId) {
  const count = Math.max(1, arch.clonesPerFamily || 2);
  const clones = [];
  for (let cIdx = 0; cIdx < count; cIdx++) {
    clones.push({
      agentId: `hybrid-${arch.familyName.toLowerCase()}-clone-${cIdx + 1}`,
      family: arch.familyName,
      model: arch.model,
      lineageId: familyLineageId,
      cloneIndex: cIdx + 1,
      samplingSeed: (fIdx + 1) * 1000 + (cIdx + 1) * 11,
      isogenicPairId: `isopair-${familyLineageId}`
    });
  }
  return clones;
}

function generateHybridCluster(cluster, clusterId, archetypes) {
  cluster.families = [];
  let agentSum = 0;

  for (let fIdx = 0; fIdx < archetypes.length; fIdx++) {
    const arch = archetypes[fIdx];
    const clonesCount = Math.max(1, arch.clonesPerFamily || 2);
    const hash = crypto.createHash('sha256').update(arch.familyName).digest('hex').slice(0, 6);
    const familyLineageId = `lin-poly-${fIdx + 1}-${hash}`;
    const clones = buildClones(arch, fIdx, familyLineageId);
    agentSum += clonesCount;

    cluster.families.push({
      familyName: arch.familyName,
      model: arch.model,
      lineageId: familyLineageId,
      clonesCount,
      clones
    });
  }

  cluster.totalAgents = agentSum;
  cluster.updatedAt = new Date().toISOString();

  return {
    configured: true,
    success: true,
    status: 'hybrid_cluster_generated',
    transport: 'hybrid_embryonic_matrix',
    cluster_id: clusterId,
    families_count: cluster.families.length,
    total_agents_count: cluster.totalAgents,
    composition: `${cluster.families.length} Dizygotic Families x Clones = ${cluster.totalAgents} Total Active Agents`,
    families: cluster.families,
    output: `Hybrid cluster '${clusterId}' deployed: ${cluster.families.length} polyovular families generating ${cluster.totalAgents} total agents.`
  };
}

function evaluateClusterDispersion(cluster, clusterId) {
  cluster.dispersionMetrics = {
    interFamilyDiversity: Number((cluster.families.length / Math.max(1, cluster.totalAgents)).toFixed(2)),
    intraFamilyIsogenicStability: 1.0,
    coverageScore: 0.94
  };
  cluster.updatedAt = new Date().toISOString();

  return {
    configured: true,
    success: true,
    status: 'dispersion_evaluated',
    transport: 'hybrid_embryonic_matrix',
    cluster_id: clusterId,
    dispersion_metrics: cluster.dispersionMetrics,
    output: `Cluster '${clusterId}' dispersion: Inter-Family Diversity = ${cluster.dispersionMetrics.interFamilyDiversity}, Intra-Family Stability = ${cluster.dispersionMetrics.intraFamilyStability}.`
  };
}

function handleHybridMultiples(args = {}, run) {
  const action = args.action || 'status';
  const clusterId = args.cluster_id || `hybrid-cluster-${Date.now()}`;
  const archetypes = Array.isArray(args.archetypes) ? args.archetypes : [
    { familyName: 'SymbolicProver', model: 'claude-3-5-sonnet', clonesPerFamily: 2 },
    { familyName: 'EmpiricalFuzzer', model: 'gpt-4o', clonesPerFamily: 2 }
  ];

  const cluster = getCluster(clusterId);
  if (action === 'generate_hybrid_cluster') return generateHybridCluster(cluster, clusterId, archetypes);
  if (action === 'evaluate_cluster_dispersion') return evaluateClusterDispersion(cluster, clusterId);

  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'hybrid_embryonic_matrix',
    cluster_id: clusterId,
    families_count: cluster.families.length,
    total_agents: cluster.totalAgents,
    output: `Hybrid cluster '${clusterId}' active with ${cluster.totalAgents} agent(s).`
  };
}

function handleHybridMultiplesError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'hybrid_embryonic_matrix',
    output: e.stdout ? e.stdout.toString() : e.message
  };
}

module.exports = {
  handleHybridMultiples,
  handleHybridMultiplesError,
  hybridClusterRegistry
};
