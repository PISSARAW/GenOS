const crypto = require('crypto');

// Registry for point mutations
const pointMutationRegistry = new Map();

function getMutationRecord(id) {
  if (!pointMutationRegistry.has(id)) {
    pointMutationRegistry.set(id, {
      id,
      history: [],
      activeHalt: false,
      divergenceScore: 0.0,
      updatedAt: new Date().toISOString()
    });
  }
  return pointMutationRegistry.get(id);
}

function computeMutationEffect(record, params) {
  const { targetKey, replacementValue, mutationType } = params;
  if (mutationType === 'silent') {
    record.divergenceScore = Math.min(1.0, record.divergenceScore + 0.02);
    return { halted: false, msg: `Silent substitution on '${targetKey}': semantic invariance preserved.` };
  }
  if (mutationType === 'nonsense') {
    record.activeHalt = true;
    record.divergenceScore = 1.0;
    return { halted: true, msg: `Nonsense substitution on '${targetKey}': premature STOP codon induced.` };
  }
  record.divergenceScore = Math.min(1.0, record.divergenceScore + 0.35);
  return { halted: false, msg: `Missense substitution on '${targetKey}': behavioral alteration applied (${replacementValue}).` };
}

function applySubstitution(record, params) {
  const { mutationId, targetKey, replacementValue, mutationType } = params;
  const effect = computeMutationEffect(record, params);
  const entry = {
    targetKey,
    replacementValue,
    mutationType,
    appliedAt: new Date().toISOString(),
    checksum: crypto.createHash('sha256').update(`${targetKey}:${replacementValue}:${mutationType}`).digest('hex').slice(0, 8)
  };
  record.history.push(entry);
  record.updatedAt = new Date().toISOString();

  return {
    configured: true,
    success: true,
    status: 'substitution_applied',
    transport: 'point_mutation_engine',
    mutation_id: mutationId,
    mutation_type: mutationType,
    target_key: targetKey,
    replacement_value: replacementValue,
    execution_halted: effect.halted,
    divergence_score: Number(record.divergenceScore.toFixed(2)),
    history_length: record.history.length,
    output: effect.msg
  };
}

function handlePointMutation(args = {}) {
  const action = args.action || 'status';
  const mutationId = args.id || `mut-point-${Date.now()}`;
  const record = getMutationRecord(mutationId);

  if (action === 'apply_substitution') {
    const params = {
      mutationId,
      mutationType: args.mutation_type || 'missense',
      targetKey: args.target_key || 'prompt_instruction',
      replacementValue: args.replacement_value || 'adapted_heuristic'
    };
    return applySubstitution(record, params);
  }

  if (action === 'evaluate_impact') {
    return {
      configured: true,
      success: true,
      status: 'impact_evaluated',
      transport: 'point_mutation_engine',
      mutation_id: mutationId,
      history: record.history,
      active_halt: record.activeHalt,
      divergence_score: Number(record.divergenceScore.toFixed(2)),
      output: `Mutation '${mutationId}' evaluated: ${record.history.length} substitutions, halt=${record.activeHalt}.`
    };
  }

  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'point_mutation_engine',
    mutation_id: mutationId,
    active_halt: record.activeHalt,
    divergence_score: Number(record.divergenceScore.toFixed(2)),
    mutation_count: record.history.length,
    output: `Point mutation engine '${mutationId}' active (${record.history.length} mutations recorded).`
  };
}

function handlePointMutationError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'point_mutation_engine',
    output: e.message || 'Unknown point mutation error'
  };
}

module.exports = {
  handlePointMutation,
  handlePointMutationError,
  pointMutationRegistry
};
