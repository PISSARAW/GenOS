// Registry for Chromosomal Inversions
const chromosomalInversionRegistry = new Map();

function getInversionRecord(id) {
  if (!chromosomalInversionRegistry.has(id)) {
    chromosomalInversionRegistry.set(id, {
      id,
      segments: ['STEP_HYPOTHESIZE', 'STEP_GATHER_EVIDENCE', 'STEP_DEDUCE', 'STEP_VALIDATE_POSTCOND'],
      isInverted: false,
      history: [],
      updatedAt: new Date().toISOString()
    });
  }
  return chromosomalInversionRegistry.get(id);
}

function applyInversion(record, params) {
  const { startIdx, endIdx } = params;
  const start = Math.max(0, startIdx || 0);
  const end = Math.min(record.segments.length - 1, endIdx !== undefined ? endIdx : record.segments.length - 1);
  
  if (start >= end) {
    return { success: false, msg: `Invalid inversion range: [${start}, ${end}].` };
  }

  const sub = record.segments.slice(start, end + 1);
  sub.reverse();
  record.segments.splice(start, sub.length, ...sub);
  record.isInverted = true;
  record.history.push({ start, end, invertedAt: new Date().toISOString() });
  record.updatedAt = new Date().toISOString();

  return { success: true, invertedRange: [start, end], msg: `Inverted segment range [${start}, ${end}] (180° rotation).` };
}

function handleInvertAction(record, invId, args) {
  const res = applyInversion(record, { startIdx: args.start_index, endIdx: args.end_index });
  return {
    configured: true,
    success: res.success,
    status: res.success ? 'segment_inverted' : 'invalid_range',
    transport: 'chromosomal_inversion_engine',
    inversion_id: invId,
    segments: record.segments,
    is_inverted: record.isInverted,
    output: res.msg
  };
}

function handleBackwardChainAction(record, invId) {
  const causalFlow = record.segments.map((s, idx) => `#${idx + 1}: ${s}`).join(' -> ');
  return {
    configured: true,
    success: true,
    status: 'backward_chain_executed',
    transport: 'chromosomal_inversion_engine',
    inversion_id: invId,
    mode: 'retrograde_backward_reasoning',
    flow: causalFlow,
    output: `Backward causal chain executed in reverse sequence: ${causalFlow}.`
  };
}

function handleChromosomalInversion(args = {}) {
  const action = args.action || 'status';
  const invId = args.id || `inv-${Date.now()}`;
  const record = getInversionRecord(invId);

  if (action === 'invert_chromosome_segment') {
    return handleInvertAction(record, invId, args);
  }
  if (action === 'execute_backward_chain') {
    return handleBackwardChainAction(record, invId);
  }

  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'chromosomal_inversion_engine',
    inversion_id: invId,
    segments: record.segments,
    is_inverted: record.isInverted,
    output: `Inversion engine '${invId}' active: order=[${record.segments.join(', ')}].`
  };
}

function handleChromosomalInversionError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'chromosomal_inversion_engine',
    output: e.message || 'Unknown chromosomal inversion error'
  };
}

module.exports = {
  handleChromosomalInversion,
  handleChromosomalInversionError,
  chromosomalInversionRegistry
};
