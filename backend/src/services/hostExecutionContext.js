'use strict';

const PROVENANCE = new Set(['declared', 'observed', 'verified', 'unknown']);

function identityText(value, fallback = 'unknown') {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  return normalized && normalized.toLowerCase() !== 'unknown' ? normalized.slice(0, 128) : fallback;
}

function normalizeHostExecutionContext(context, options = {}) {
  const environment = options.environment || process.env;
  const source = isRecord(context) ? context : fallbackContext(options, environment);
  return {
    schemaVersion: 1,
    harnessId: identityText(source.harnessId, 'mcp-host'),
    harnessVersion: identityText(source.harnessVersion, null),
    providerId: identityText(source.providerId),
    modelId: identityText(source.modelId),
    samplingAvailable: hasSamplingEndpoint(source, environment),
    toolsAvailable: availableTools(source.toolsAvailable, options.toolLease),
    structuredOutput: false,
    checkpoint: false,
    restore: false,
    cancellation: false,
    streaming: false,
    humanInput: false,
    provenanceConfidence: confidence(source.provenanceConfidence),
  };
}

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function hasSamplingEndpoint(source, environment) {
  const endpoint = String(environment.GENOS_MCP_SAMPLING_URL || '').trim();
  return source.samplingAvailable === true && Boolean(endpoint);
}

function availableTools(offered, toolLease) {
  const tools = Array.isArray(offered) ? offered : [];
  const lease = Array.isArray(toolLease) ? new Set(toolLease) : null;
  return [...new Set(tools.filter((tool) => typeof tool === 'string' && tool.trim()))]
    .filter((tool) => !lease || lease.has(tool));
}

function confidence(value) {
  return PROVENANCE.has(value) ? value : 'unknown';
}

function fallbackContext(options, environment) {
  const providerId = identityText(options.provider || environment.GENOS_MCP_PROVIDER);
  const modelId = identityText(options.modelId || environment.GENOS_MCP_MODEL_ID);
  const samplingAvailable = Boolean(String(environment.GENOS_MCP_SAMPLING_URL || '').trim());
  return {
    harnessId: 'mcp-host',
    providerId,
    modelId,
    samplingAvailable,
    toolsAvailable: [],
    provenanceConfidence: providerId !== 'unknown' && modelId !== 'unknown' ? 'declared' : (samplingAvailable ? 'observed' : 'unknown'),
  };
}

function bindHostToolLease(context, toolLease) {
  if (!context) return null;
  const lease = Array.isArray(toolLease) ? toolLease : [];
  const declared = Array.isArray(context.toolsAvailable) ? context.toolsAvailable : [];
  const bounded = declared.length ? lease.filter((tool) => declared.includes(tool)) : lease;
  return { ...context, toolsAvailable: [...new Set(bounded)] };
}

module.exports = { normalizeHostExecutionContext, bindHostToolLease };
