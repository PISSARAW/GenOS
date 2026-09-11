// Registry for Chromosomal Duplications
const chromosomalDuplicationRegistry = new Map();

function getDuplicationRecord(id) {
  if (!chromosomalDuplicationRegistry.has(id)) {
    chromosomalDuplicationRegistry.set(id, {
      id,
      segments: [
        { locus: 'LOCUS_REASONING_ENGINE', copyIndex: 1, heuristic: 'strict_deductive', isNeoFunctionalized: false }
      ],
      updatedAt: new Date().toISOString()
    });
  }
  return chromosomalDuplicationRegistry.get(id);
}

function duplicateSegment(record, targetLocus) {
  const existing = record.segments.filter(s => s.locus === targetLocus);
  if (existing.length === 0) {
    return { success: false, msg: `Locus '${targetLocus}' not found.` };
  }
  const nextCopyIndex = existing.length + 1;
  const newSegment = {
    locus: targetLocus,
    copyIndex: nextCopyIndex,
    heuristic: existing[0].heuristic,
    isNeoFunctionalized: false
  };
  record.segments.push(newSegment);
  record.updatedAt = new Date().toISOString();
  return { success: true, newSegment, totalCopies: nextCopyIndex, msg: `Duplicated '${targetLocus}' in tandem (Copy #${nextCopyIndex}).` };
}

function neofunctionalizeSegment(record, params) {
  const { targetLocus, copyIndex, newHeuristic } = params;
  const target = record.segments.find(s => s.locus === targetLocus && s.copyIndex === (copyIndex || 2));
  if (!target) {
    return { success: false, msg: `Duplicated copy of '${targetLocus}' not found.` };
  }
  target.heuristic = newHeuristic || 'creative_divergent';
  target.isNeoFunctionalized = true;
  record.updatedAt = new Date().toISOString();
  return { success: true, target, msg: `Copy #${target.copyIndex} neo-functionalized to '${target.heuristic}'.` };
}

function handleDuplicateAction(record, dupId, args) {
  const targetLocus = args.target_locus || 'LOCUS_REASONING_ENGINE';
  const res = duplicateSegment(record, targetLocus);
  return {
    configured: true,
    success: res.success,
    status: res.success ? 'segment_duplicated' : 'locus_not_found',
    transport: 'chromosomal_duplication_engine',
    duplication_id: dupId,
    target_locus: targetLocus,
    total_copies: res.totalCopies || 1,
    segments: record.segments,
    output: res.msg
  };
}

function handleDivergeAction(record, dupId, args) {
  const params = {
    targetLocus: args.target_locus || 'LOCUS_REASONING_ENGINE',
    copyIndex: args.copy_index || 2,
    newHeuristic: args.new_heuristic || 'creative_divergent'
  };
  const res = neofunctionalizeSegment(record, params);
  return {
    configured: true,
    success: res.success,
    status: res.success ? 'copy_diverged' : 'copy_not_found',
    transport: 'chromosomal_duplication_engine',
    duplication_id: dupId,
    target_locus: params.targetLocus,
    segments: record.segments,
    output: res.msg
  };
}

function handleChromosomalDuplication(args = {}) {
  const action = args.action || 'status';
  const dupId = args.id || `dup-${Date.now()}`;
  const record = getDuplicationRecord(dupId);

  if (action === 'duplicate_chromosome_segment') {
    return handleDuplicateAction(record, dupId, args);
  }
  if (action === 'diverge_duplicated_branch') {
    return handleDivergeAction(record, dupId, args);
  }

  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'chromosomal_duplication_engine',
    duplication_id: dupId,
    total_segments: record.segments.length,
    segments: record.segments,
    output: `Duplication engine '${dupId}' active with ${record.segments.length} segment copy(ies).`
  };
}

function handleChromosomalDuplicationError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'chromosomal_duplication_engine',
    output: e.message || 'Unknown chromosomal duplication error'
  };
}

module.exports = {
  handleChromosomalDuplication,
  handleChromosomalDuplicationError,
  chromosomalDuplicationRegistry
};
