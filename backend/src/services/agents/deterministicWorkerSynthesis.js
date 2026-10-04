'use strict';

const { createHash } = require('node:crypto');

function synthesisError(message) {
  return Object.assign(new Error(message), { code: 'WORKER_SYNTHESIS_INPUT_INVALID' });
}

function validSource(item) {
  return typeof item?.sourceRef === 'string' && item.sourceRef.trim().length > 0
    && item.sourceRef.length <= 256 && typeof item.claim === 'string'
    && item.claim.trim().length > 0 && item.claim.length <= 512
    && typeof item.position === 'string' && item.position.trim().length > 0
    && item.position.length <= 512;
}

function assertSynthesisInput(methodContract) {
  const sources = methodContract?.parameters?.sources;
  if (methodContract?.version !== 1 || methodContract.methodId !== 'synthesize_claims'
    || !Array.isArray(sources) || sources.length < 2 || sources.length > 100
    || sources.some((item) => !validSource(item))) {
    throw synthesisError('Synthesis requires 2-100 structured and referenced positions.');
  }
  if (new Set(sources.map((item) => item.sourceRef)).size !== sources.length) {
    throw synthesisError('Synthesis source references must be unique.');
  }
  return true;
}

function collectDisagreements(sources) {
  const claims = new Map();
  for (const item of sources) {
    const positions = claims.get(item.claim) || [];
    positions.push({ source: item.sourceRef, position: item.position });
    claims.set(item.claim, positions);
  }
  return [...claims].filter(([, positions]) => new Set(positions.map((item) => item.position)).size > 1)
    .map(([claim, positions]) => ({ claim, positions }));
}

function runSynthesis(methodContract) {
  assertSynthesisInput(methodContract);
  const sources = methodContract.parameters.sources;
  const disagreements = collectDisagreements(sources);
  const content = {
    synthesis: `${sources.length} attributed positions retained; ${disagreements.length} exact-claim disagreements found.`,
    sources: sources.map((item) => item.sourceRef), disagreements
  };
  const digest = createHash('sha256').update(JSON.stringify({ methodContract, content })).digest('hex');
  return { ...content, synthesisReceipt: { id: `solver://sha256:${digest}`,
    sourceRefs: content.sources } };
}

module.exports = { assertSynthesisInput, runSynthesis };
