// Registry for Transposons (Jumping Genes)
const transposonRegistry = new Map();

function getTransposonRecord(id) {
  if (!transposonRegistry.has(id)) {
    transposonRegistry.set(id, {
      id,
      loci: {
        LOCUS_A: 'PROMPT_PARSER',
        LOCUS_B: 'HEURISTIC_SEARCH',
        LOCUS_C: 'EMPTY',
        LOCUS_D: 'SECURITY_GATE'
      },
      transposons: [
        { name: 'Tn_ALU_1', currentLocus: 'LOCUS_B', type: 'retrotransposon', jumpsCount: 0 }
      ],
      disruptedLoci: [],
      updatedAt: new Date().toISOString()
    });
  }
  return transposonRegistry.get(id);
}

function executeCutAndPaste(record, params) {
  const { transposonName, targetLocus } = params;
  const tn = record.transposons.find(t => t.name === transposonName);
  if (!tn) {
    return { success: false, msg: `Transposon '${transposonName}' not found.` };
  }
  const oldLocus = tn.currentLocus;
  tn.currentLocus = targetLocus;
  tn.jumpsCount += 1;

  const previousTargetContent = record.loci[targetLocus] || 'EMPTY';
  if (previousTargetContent !== 'EMPTY') {
    record.disruptedLoci.push({ locus: targetLocus, disruptedContent: previousTargetContent });
  }
  record.loci[targetLocus] = `TRANSPOSED_${transposonName}`;
  if (oldLocus && oldLocus !== targetLocus) {
    record.loci[oldLocus] = 'EMPTY';
  }
  record.updatedAt = new Date().toISOString();
  return { success: true, oldLocus, targetLocus, previousTargetContent, msg: `Transposon '${transposonName}' jumped (Cut-and-Paste) from '${oldLocus}' to '${targetLocus}'.` };
}

function executeCopyAndPaste(record, params) {
  const { transposonName, targetLocus } = params;
  const tn = record.transposons.find(t => t.name === transposonName);
  if (!tn) {
    return { success: false, msg: `Source transposon '${transposonName}' not found.` };
  }
  const newCopyName = `${transposonName}_copy_${record.transposons.length + 1}`;
  const newTn = { name: newCopyName, currentLocus: targetLocus, type: 'retrotransposon', jumpsCount: 1 };
  record.transposons.push(newTn);

  const previousTargetContent = record.loci[targetLocus] || 'EMPTY';
  if (previousTargetContent !== 'EMPTY') {
    record.disruptedLoci.push({ locus: targetLocus, disruptedContent: previousTargetContent });
  }
  record.loci[targetLocus] = `RETROTRANSPOSED_${newCopyName}`;
  record.updatedAt = new Date().toISOString();
  return { success: true, newCopyName, targetLocus, msg: `Retrotransposition (Copy-and-Paste) created '${newCopyName}' at '${targetLocus}'.` };
}

function handleCutAction(record, transId, args) {
  const res = executeCutAndPaste(record, {
    transposonName: args.transposon_name || 'Tn_ALU_1',
    targetLocus: args.target_locus || 'LOCUS_C'
  });
  return {
    configured: true,
    success: res.success,
    status: res.success ? 'cut_and_paste_completed' : 'transposon_not_found',
    transport: 'transposon_engine',
    transposon_id: transId,
    loci_state: record.loci,
    disrupted_loci: record.disruptedLoci,
    output: res.msg
  };
}

function handleCopyAction(record, transId, args) {
  const res = executeCopyAndPaste(record, {
    transposonName: args.transposon_name || 'Tn_ALU_1',
    targetLocus: args.target_locus || 'LOCUS_D'
  });
  return {
    configured: true,
    success: res.success,
    status: res.success ? 'retrojump_completed' : 'source_not_found',
    transport: 'transposon_engine',
    transposon_id: transId,
    total_transposons: record.transposons.length,
    loci_state: record.loci,
    disrupted_loci: record.disruptedLoci,
    output: res.msg
  };
}

function handleTransposonJump(args = {}) {
  const action = args.action || 'status';
  const transId = args.id || `tn-${Date.now()}`;
  const record = getTransposonRecord(transId);

  if (action === 'cut_and_paste_jump') {
    return handleCutAction(record, transId, args);
  }
  if (action === 'copy_and_paste_retrojump') {
    return handleCopyAction(record, transId, args);
  }
  if (action === 'inspect_insertion_impact') {
    return {
      configured: true,
      success: true,
      status: 'impact_inspected',
      transport: 'transposon_engine',
      transposon_id: transId,
      disrupted_count: record.disruptedLoci.length,
      disrupted_loci: record.disruptedLoci,
      loci_state: record.loci,
      output: `Transposon engine evaluated: ${record.transposons.length} active mobile element(s), ${record.disruptedLoci.length} disrupted locus/loci.`
    };
  }

  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'transposon_engine',
    transposon_id: transId,
    transposons_count: record.transposons.length,
    loci_state: record.loci,
    output: `Transposon engine '${transId}' active with ${record.transposons.length} mobile element(s).`
  };
}

function handleTransposonJumpError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'transposon_engine',
    output: e.message || 'Unknown transposon jump error'
  };
}

module.exports = {
  handleTransposonJump,
  handleTransposonJumpError,
  transposonRegistry
};
