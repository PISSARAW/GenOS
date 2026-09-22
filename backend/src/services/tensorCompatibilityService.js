/**
 * Tensor Compatibility Contract Service
 *
 * Tensors are NOT universal. Two agents using different embedding models
 * (OpenAI, Mistral, local) may not share the same latent space.
 */

const TENSOR_CONTRACT_SCHEMA = {
  type: 'object',
  required: ['family', 'model', 'dimensions', 'normalization'],
  properties: {
    family: { type: 'string' },
    model: { type: 'string' },
    revision: { type: 'string' },
    dimensions: { type: 'integer' },
    normalization: { type: 'string', enum: ['l2', 'cosine', 'dot', 'none'] },
    metric: { type: 'string', enum: ['euclidean', 'cosine', 'dot'] },
    semantic_schema: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
};

const DEFAULTS = {
  family: 'unknown',
  model: 'unknown',
  revision: 'unversioned',
  dimensions: 1536,
  normalization: 'cosine',
  metric: 'cosine',
  semantic_schema: 'generic',
};

function validateTensorContract(contract) {
  const errors = [];
  for (const field of TENSOR_CONTRACT_SCHEMA.required) {
    if (contract[field] === undefined || contract[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  if (contract.dimensions !== undefined && (!Number.isInteger(contract.dimensions) || contract.dimensions <= 0)) {
    errors.push('dimensions must be a positive integer');
  }
  if (contract.normalization !== undefined && !TENSOR_CONTRACT_SCHEMA.properties.normalization.enum.includes(contract.normalization)) {
    errors.push(`normalization must be one of: ${TENSOR_CONTRACT_SCHEMA.properties.normalization.enum.join(', ')}`);
  }
  return { valid: errors.length === 0, errors };
}

function normalizeTensorContract(contract) {
  return { ...DEFAULTS, ...contract };
}

function areContractsCompatible(contractA, contractB) {
  const normA = normalizeTensorContract(contractA);
  const normB = normalizeTensorContract(contractB);
  return (
    normA.family === normB.family &&
    normA.model === normB.model &&
    normA.dimensions === normB.dimensions &&
    normA.normalization === normB.normalization &&
    normA.metric === normB.metric
  );
}

function computeCosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) return null;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function wrapTensorSignal(tensorData, contract) {
  const validation = validateTensorContract(contract);
  if (!validation.valid) {
    throw new Error(`Invalid tensor contract: ${validation.errors.join(', ')}`);
  }
  const normalized = normalizeTensorContract(contract);
  return {
    tensor: tensorData,
    contract: normalized,
    signalType: 'tensor',
    wrappedAt: new Date().toISOString(),
  };
}

module.exports = {
  validateTensorContract,
  normalizeTensorContract,
  areContractsCompatible,
  computeCosineSimilarity,
  wrapTensorSignal,
  TENSOR_CONTRACT_SCHEMA,
  DEFAULTS,
};
