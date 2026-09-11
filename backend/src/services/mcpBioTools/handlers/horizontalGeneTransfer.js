// Registry for Horizontal Gene Transfer (Plasmids & Bdelloid Xeno-Absorption)
const horizontalTransferRegistry = new Map();

function getTransferRecord(agentId) {
  if (!horizontalTransferRegistry.has(agentId)) {
    horizontalTransferRegistry.set(agentId, {
      agentId,
      plasmids: ['pBASE_AGENT_CORE'],
      xenoGenes: [],
      conjugationHistory: [],
      updatedAt: new Date().toISOString()
    });
  }
  return horizontalTransferRegistry.get(agentId);
}

function handleBacterialConjugation(sourceRecord, targetRecord, plasmidName) {
  const plasmid = plasmidName || 'pRESISTANCE_RATE_LIMIT_BYPASS';
  if (!sourceRecord.plasmids.includes(plasmid)) {
    sourceRecord.plasmids.push(plasmid);
  }
  if (!targetRecord.plasmids.includes(plasmid)) {
    targetRecord.plasmids.push(plasmid);
  }
  const entry = { plasmid, from: sourceRecord.agentId, to: targetRecord.agentId, at: new Date().toISOString() };
  targetRecord.conjugationHistory.push(entry);
  targetRecord.updatedAt = new Date().toISOString();

  return {
    configured: true,
    success: true,
    status: 'plasmid_conjugated',
    transport: 'horizontal_transfer_engine',
    source_agent_id: sourceRecord.agentId,
    target_agent_id: targetRecord.agentId,
    plasmid_transferred: plasmid,
    target_plasmids: targetRecord.plasmids,
    output: `Conjugation bridge transferred plasmid '${plasmid}' from '${sourceRecord.agentId}' to '${targetRecord.agentId}'.`
  };
}

function handleBdelloidAbsorption(record, envSnippets) {
  const snippets = Array.isArray(envSnippets) && envSnippets.length > 0 
    ? envSnippets 
    : ['GENE_BACTERIAL_DESICCATION_RESIST', 'GENE_FUNGAL_CELLULASE'];

  for (const s of snippets) {
    if (!record.xenoGenes.includes(s)) {
      record.xenoGenes.push(s);
    }
  }
  record.updatedAt = new Date().toISOString();

  return {
    configured: true,
    success: true,
    status: 'environmental_dna_absorbed',
    transport: 'horizontal_transfer_engine',
    agent_id: record.agentId,
    absorbed_genes_count: snippets.length,
    xeno_genes: record.xenoGenes,
    total_xeno_genes: record.xenoGenes.length,
    output: `Bdelloid rotifer mode: absorbed ${snippets.length} environmental DNA snippet(s) into '${record.agentId}'.`
  };
}

function handleHorizontalGeneTransfer(args = {}) {
  const action = args.action || 'status';
  const targetId = args.target_agent_id || 'agent-recipient-1';
  const targetRecord = getTransferRecord(targetId);

  if (action === 'conjugate_bacterial_plasmid') {
    const sourceId = args.source_agent_id || 'agent-donor-1';
    const sourceRecord = getTransferRecord(sourceId);
    return handleBacterialConjugation(sourceRecord, targetRecord, args.plasmid_name);
  }
  if (action === 'absorb_bdelloid_environmental_dna') {
    return handleBdelloidAbsorption(targetRecord, args.environmental_snippets);
  }

  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'horizontal_transfer_engine',
    agent_id: targetId,
    plasmids: targetRecord.plasmids,
    xeno_genes: targetRecord.xenoGenes,
    conjugations_count: targetRecord.conjugationHistory.length,
    output: `Horizontal transfer engine active for '${targetId}': ${targetRecord.plasmids.length} plasmid(s), ${targetRecord.xenoGenes.length} xeno-gene(s).`
  };
}

function handleHorizontalGeneTransferError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'horizontal_transfer_engine',
    output: e.message || 'Unknown horizontal transfer error'
  };
}

module.exports = {
  handleHorizontalGeneTransfer,
  handleHorizontalGeneTransferError,
  horizontalTransferRegistry
};
