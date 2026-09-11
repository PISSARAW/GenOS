// Registry for Chromosomal Translocations
const chromosomalTranslocationRegistry = new Map();

function getAgentChromosome(agentId, defaultLoci = []) {
  if (!chromosomalTranslocationRegistry.has(agentId)) {
    chromosomalTranslocationRegistry.set(agentId, {
      agentId,
      loci: defaultLoci.length > 0 ? defaultLoci : ['LOCUS_BASE_PROMPT', 'LOCUS_ROLE_CORE'],
      translocatedIn: [],
      updatedAt: new Date().toISOString()
    });
  }
  return chromosomalTranslocationRegistry.get(agentId);
}

function executeTranslocation(sourceChrom, targetChrom, locus) {
  const idx = sourceChrom.loci.indexOf(locus);
  if (idx === -1) {
    return { success: false, msg: `Locus '${locus}' not found on source agent '${sourceChrom.agentId}'.` };
  }
  sourceChrom.loci.splice(idx, 1);
  targetChrom.loci.push(locus);
  targetChrom.translocatedIn.push({ locus, from: sourceChrom.agentId, at: new Date().toISOString() });
  
  sourceChrom.updatedAt = new Date().toISOString();
  targetChrom.updatedAt = new Date().toISOString();
  return { success: true, locus, msg: `Translocated '${locus}' from '${sourceChrom.agentId}' to '${targetChrom.agentId}'.` };
}

function handleTranslocateAction(args) {
  const sourceId = args.source_agent_id || 'agent-prover';
  const targetId = args.target_agent_id || 'agent-researcher';
  const locus = args.locus || 'LOCUS_COQ_FORMAL_PROVER';

  const sourceChrom = getAgentChromosome(sourceId, [locus, 'LOCUS_LEMMA_CACHE']);
  const targetChrom = getAgentChromosome(targetId, ['LOCUS_WEB_SEARCH', 'LOCUS_SYNTHESIS']);

  const res = executeTranslocation(sourceChrom, targetChrom, locus);
  return {
    configured: true,
    success: res.success,
    status: res.success ? 'translocation_completed' : 'locus_not_found',
    transport: 'chromosomal_translocation_engine',
    source_agent_id: sourceId,
    target_agent_id: targetId,
    translocated_locus: locus,
    target_loci: targetChrom.loci,
    output: res.msg
  };
}

function handleFuseAction(args) {
  const targetId = args.target_agent_id || 'agent-chimeric';
  const hybridPackage = args.hybrid_package || ['LOCUS_AST_MUTATOR', 'LOCUS_SECURITY_GUARD'];
  const targetChrom = getAgentChromosome(targetId);

  targetChrom.loci.push(...hybridPackage);
  targetChrom.updatedAt = new Date().toISOString();

  return {
    configured: true,
    success: true,
    status: 'heterologous_fusion_completed',
    transport: 'chromosomal_translocation_engine',
    target_agent_id: targetId,
    fused_loci: hybridPackage,
    total_loci: targetChrom.loci,
    output: `Fused ${hybridPackage.length} heterologous loci into '${targetId}'. Total loci: ${targetChrom.loci.length}.`
  };
}

function handleChromosomalTranslocation(args = {}) {
  const action = args.action || 'status';
  const targetId = args.target_agent_id || 'agent-researcher';

  if (action === 'translocate_segment') {
    return handleTranslocateAction(args);
  }
  if (action === 'fuse_heterologous_chromosomes') {
    return handleFuseAction(args);
  }

  const chrom = getAgentChromosome(targetId);
  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'chromosomal_translocation_engine',
    agent_id: targetId,
    active_loci: chrom.loci,
    translocations_count: chrom.translocatedIn.length,
    output: `Translocation engine active for '${targetId}': ${chrom.loci.length} active loci.`
  };
}

function handleChromosomalTranslocationError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'chromosomal_translocation_engine',
    output: e.message || 'Unknown chromosomal translocation error'
  };
}

module.exports = {
  handleChromosomalTranslocation,
  handleChromosomalTranslocationError,
  chromosomalTranslocationRegistry
};
