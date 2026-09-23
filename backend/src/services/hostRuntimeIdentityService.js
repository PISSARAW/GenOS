'use strict';

function defineHostRuntime(input) {
  return {
    host: String(input.host || 'unknown'),
    nativeModel: input.nativeModel || null,
    nativeAgentRuntime: String(input.nativeAgentRuntime || 'unknown'),
    availableNativeTools: Array.isArray(input.availableNativeTools) ? input.availableNativeTools : [],
    delegatedInferenceAllowed: input.delegatedInferenceAllowed !== false,
    localInferenceAllowed: input.localInferenceAllowed !== false,
    remoteInferenceAllowed: input.remoteInferenceAllowed !== false,
    userPreferences: input.userPreferences || {},
    identityEvidence: input.identityEvidence || null,
    detectedAt: new Date().toISOString()
  };
}

function fromEnv() {
  return defineHostRuntime({
    host: process.env.GENOS_HOST_RUNTIME || 'opencode',
    nativeModel: process.env.GENOS_NATIVE_MODEL || null,
    nativeAgentRuntime: process.env.GENOS_NATIVE_RUNTIME || 'opencode',
    delegatedInferenceAllowed: process.env.GENOS_DELEGATED_INFERENCE !== '0',
    localInferenceAllowed: process.env.GENOS_LOCAL_INFERENCE !== '0',
    remoteInferenceAllowed: process.env.GENOS_REMOTE_INFERENCE !== '0'
  });
}

function nativeFirstAllowed(input) {
  const host = (input || {}).host || {};
  const policy = (input || {}).policy || {};
  if (policy.forceDelegated === true) return false;
  if (host.delegatedInferenceAllowed === false) return true;
  if (policy.preferNative === false) return false;
  return true;
}

module.exports = {
  defineHostRuntime,
  fromEnv,
  nativeFirstAllowed
};
