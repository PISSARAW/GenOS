/**
 * Model routing policy helpers — candidate ordering, strict prefer-local
 * gating, cost/score estimation and auto-model selection.
 *
 * Strict rule: when `preferLocal === true` and no local candidate is
 * available, routing fails with LOCAL_MODEL_REQUIRED instead of silently
 * falling back to cloud — unless the caller explicitly passes
 * `allowCloudFallback === true`.
 */

const LOCAL_URI_PATTERN = /^(ollama|lmstudio|vllm|openai-compatible):\/\//;

function isLocalUri(uri) {
  return LOCAL_URI_PATTERN.test(String(uri || ''));
}

function hasLocalCandidate(candidates) {
  for (const uri of candidates || []) {
    if (isLocalUri(uri)) return true;
  }
  return false;
}

function strictViolation(policy, options) {
  if (!policy || policy.preferLocal !== true) return false;
  if (options && options.allowCloudFallback === true) return false;
  return true;
}

function assertStrictPreferLocal(policy, candidates, options) {
  if (!strictViolation(policy, options)) return;
  if (hasLocalCandidate(candidates)) return;
  throw Object.assign(new Error('preferLocal routing requires a local model: no local candidate is available and cloud fallback was not explicitly allowed.'), { code: 'LOCAL_MODEL_REQUIRED' });
}

function estimateCostUsd(quote, inputTokens, outputTokens) {
  const costInput = Number((quote || {}).costInput || 0);
  const costOutput = Number((quote || {}).costOutput || 0);
  return Number(((costInput * inputTokens + costOutput * outputTokens) / 1000000).toFixed(8));
}

function scoreFromKeys(source) {
  const record = source || {};
  for (const key of ['score', 'qualityScore', 'confidence']) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function parseScorePayload(match) {
  if (!match) return {};
  try { return JSON.parse(match[0] || ''); } catch (_) { return {}; }
}

function responseScore(result) {
  const direct = scoreFromKeys(result);
  if (direct !== null) return direct;
  const match = String((result && result.text) || '').match(/\{[\s\S]*\}/);
  return scoreFromKeys(parseScorePayload(match));
}

function parseSize(name) {
  const match = String(name).match(/(\d+(?:\.\d+)?)\s*(k|m|b)/i);
  if (!match) return null;
  const multiplier = { k: 1e3, m: 1e6, b: 1e9 }[match[2].toLowerCase()];
  return Number(match[1]) * multiplier;
}

function sizeOf(model) {
  const explicit = Number(model.size);
  if (Number.isFinite(explicit)) return explicit;
  return parseSize(model.model);
}

function compareBySize(left, right) {
  const leftSize = sizeOf(left);
  const rightSize = sizeOf(right);
  if (leftSize === null) return rightSize === null ? 0 : 1;
  if (rightSize === null) return -1;
  return leftSize - rightSize;
}

function pickAutoCandidate(chatModels, complexity, variantIndex) {
  const sorted = [...chatModels].sort(compareBySize);
  if (variantIndex !== undefined) return sorted[variantIndex % sorted.length];
  if (complexity === 'low') return sorted[0];
  if (complexity === 'high') return sorted[sorted.length - 1];
  return sorted[Math.floor(sorted.length / 2)];
}

function computeDeadline(options) {
  const settings = options || {};
  const timeout = Number.isFinite(Number(settings.timeoutMs)) ? Math.max(1, Number(settings.timeoutMs)) : 30000;
  const explicit = Number.isFinite(Number(settings.deadlineMs)) ? Number(settings.deadlineMs) : timeout;
  const deadline = settings.deadlineAt != null ? Number(settings.deadlineAt) : Date.now() + Math.max(1, explicit);
  return { timeout, deadline };
}

module.exports = {
  isLocalUri,
  hasLocalCandidate,
  assertStrictPreferLocal,
  estimateCostUsd,
  responseScore,
  parseSize,
  pickAutoCandidate,
  computeDeadline
};
