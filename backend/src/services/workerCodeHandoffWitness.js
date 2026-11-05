'use strict';

const { digest, hashBytes, failure } = require('./trinityProvenanceValues');

function authentic(artifact, handoff) {
  const producer = artifact.producerAgentId;
  const run = artifact.executionRunId;
  const hash = digest({ path: artifact.path, hash: artifact.hash });
  return typeof producer === 'string' && typeof run === 'string'
    && producer === handoff.producer?.agentId
    && artifact.uri === `genos://code-artifact/${encodeURIComponent(producer)}/${encodeURIComponent(run)}/${hash}`
    && artifact.sourceRef === `genos://code-file/${hash}`
    && typeof artifact.content === 'string'
    && hashBytes(Buffer.from(artifact.content)) === artifact.hash;
}

function inspect(artifact, input) {
  if (!authentic(artifact, input.handoff)) throw failure('WORKER_CODE_HANDOFF_SOURCE_INVALID');
  const tested = input.files.find(file => file.path === artifact.path);
  return { path: artifact.path, producerAgentId: artifact.producerAgentId,
    producerRunId: artifact.executionRunId, sourceRef: artifact.sourceRef,
    producerHash: artifact.hash, testedHash: tested?.hash || null,
    sameTestedContent: tested?.hash === artifact.hash, artifactAuthentic: true };
}

function witnesses(mission, files) {
  return (mission.handoffContext || []).map(handoff => ({
    handoffId: handoff.handoffId, digest: handoff.digest, version: handoff.version,
    source: 'host_content_hash_and_producer_identity', semanticAccepted: false,
    files: (handoff.artifactRefs || []).filter(a => String(a.uri || '').startsWith('genos://code-artifact/'))
      .map(artifact => inspect(artifact, { handoff, files }))
  }));
}

module.exports = { witnesses };
