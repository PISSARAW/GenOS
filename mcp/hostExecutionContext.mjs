function optionalIdentity(value) {
  if (typeof value !== 'string') return 'unknown';
  const normalized = value.trim();
  return normalized && normalized.toLowerCase() !== 'unknown' ? normalized.slice(0, 128) : 'unknown';
}

export function createHostExecutionContext(input = {}) {
  const { payload = {}, clientVersion, clientCapabilities } = input;
  const harnessId = optionalIdentity(clientVersion?.name);
  const declaredProvider = optionalIdentity(payload.provider || process.env.GENOS_MCP_PROVIDER);
  const declaredModel = optionalIdentity(payload.modelId || process.env.GENOS_MCP_MODEL_ID);
  const samplingAvailable = Boolean(clientCapabilities?.sampling);
  return {
    schemaVersion: 1,
    harnessId: harnessId === 'unknown' ? 'mcp-host' : harnessId,
    harnessVersion: optionalIdentity(clientVersion?.version) === 'unknown' ? null : clientVersion.version,
    providerId: declaredProvider,
    modelId: declaredModel,
    samplingAvailable,
    toolsAvailable: [],
    structuredOutput: false,
    checkpoint: false,
    restore: false,
    cancellation: false,
    streaming: false,
    humanInput: false,
    provenanceConfidence: harnessId !== 'unknown' ? 'declared' : (samplingAvailable ? 'observed' : 'unknown'),
  };
}
