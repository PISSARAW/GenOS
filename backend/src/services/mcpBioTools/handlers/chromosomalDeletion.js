// Registry for Chromosomal Deletions
const chromosomalDeletionRegistry = new Map();

const ESSENTIAL_LOCI = new Set(['LOCUS_KERNEL_INTEGRITY', 'LOCUS_AUTH_INVARIANTS', 'LOCUS_ROUTING']);

function getChromosomeRecord(id) {
  if (!chromosomalDeletionRegistry.has(id)) {
    chromosomalDeletionRegistry.set(id, {
      id,
      segments: [
        { locus: 'LOCUS_KERNEL_INTEGRITY', essential: true, weightKb: 120 },
        { locus: 'LOCUS_AUTH_INVARIANTS', essential: true, weightKb: 80 },
        { locus: 'LOCUS_LEGACY_PARSER', essential: false, weightKb: 450 },
        { locus: 'LOCUS_EXPERIMENTAL_FUZZER', essential: false, weightKb: 310 },
        { locus: 'LOCUS_ROUTING', essential: true, weightKb: 90 }
      ],
      deletedSegments: [],
      prunedFootprintKb: 0,
      updatedAt: new Date().toISOString()
    });
  }
  return chromosomalDeletionRegistry.get(id);
}

function executeDeletion(record, targetLocus) {
  const index = record.segments.findIndex(s => s.locus === targetLocus);
  if (index === -1) {
    return { success: false, msg: `Segment '${targetLocus}' not found on chromosome.` };
  }
  const [deleted] = record.segments.splice(index, 1);
  record.deletedSegments.push(deleted);
  record.prunedFootprintKb += deleted.weightKb;
  record.updatedAt = new Date().toISOString();
  return { success: true, deleted, msg: `Segment '${targetLocus}' deleted (-${deleted.weightKb} KB).` };
}

function checkViability(record) {
  const activeLoci = new Set(record.segments.map(s => s.locus));
  const missingEssentials = Array.from(ESSENTIAL_LOCI).filter(l => !activeLoci.has(l));
  const isViable = missingEssentials.length === 0;
  return {
    isViable,
    missingEssentials,
    activeCount: record.segments.length,
    deletedCount: record.deletedSegments.length,
    prunedFootprintKb: record.prunedFootprintKb
  };
}

function handleChromosomalDeletion(args = {}) {
  const action = args.action || 'status';
  const chromId = args.id || `chrom-${Date.now()}`;
  const record = getChromosomeRecord(chromId);

  if (action === 'delete_chromosome_segment') {
    const targetLocus = args.target_locus || 'LOCUS_LEGACY_PARSER';
    const delRes = executeDeletion(record, targetLocus);
    const viability = checkViability(record);

    return {
      configured: true,
      success: delRes.success,
      status: delRes.success ? 'segment_deleted' : 'locus_not_found',
      transport: 'chromosomal_deletion_engine',
      chromosome_id: chromId,
      target_locus: targetLocus,
      pruned_kb: record.prunedFootprintKb,
      is_viable: viability.isViable,
      output: `${delRes.msg} Pipeline viable: ${viability.isViable}.`
    };
  }

  if (action === 'verify_pipeline_viability') {
    const viability = checkViability(record);
    return {
      configured: true,
      success: true,
      status: 'viability_checked',
      transport: 'chromosomal_deletion_engine',
      chromosome_id: chromId,
      is_viable: viability.isViable,
      missing_essentials: viability.missingEssentials,
      active_segments_count: viability.activeCount,
      deleted_segments_count: viability.deletedCount,
      pruned_footprint_kb: viability.prunedFootprintKb,
      output: `Chromosome '${chromId}': viable=${viability.isViable}, ${viability.deletedCount} segments pruned (${viability.prunedFootprintKb} KB saved).`
    };
  }

  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'chromosomal_deletion_engine',
    chromosome_id: chromId,
    active_segments: record.segments.map(s => s.locus),
    deleted_segments_count: record.deletedSegments.length,
    pruned_footprint_kb: record.prunedFootprintKb,
    output: `Chromosome '${chromId}' active with ${record.segments.length} segment(s).`
  };
}

function handleChromosomalDeletionError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'chromosomal_deletion_engine',
    output: e.message || 'Unknown chromosomal deletion error'
  };
}

module.exports = {
  handleChromosomalDeletion,
  handleChromosomalDeletionError,
  chromosomalDeletionRegistry
};
