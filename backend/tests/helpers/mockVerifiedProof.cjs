'use strict';

const { createFormalResult } = require('../../src/services/formalResultService');
const { createProofArtifact } = require('../../src/services/mathematical/proofArtifact');
const { MathematicalDependencyGraph, LeanIncrementalGate } = require('../../src/services/epistemicScheduler');

async function mockVerifiedProof() {
  const statement = '0 = 0';
  const artifact = createProofArtifact({ type: 'lemma', statement });
  artifact.attachFormalResult(createFormalResult({ canonicalStatement: statement, status: 'formalized',
    evidence: { kind: 'proof', content: 'theorem test_proof : 0 = 0 := by rfl' },
    assumptions: [], validityDomain: { statement: 'test fixture', constraints: [] }, dependencies: [],
    provenance: { createdAt: new Date().toISOString(), actor: 'test',
      source: { type: 'test', uri: 'fixture', digest: `sha256:${'a'.repeat(64)}` }, inputs: [], transformations: [] },
    producer: { model: 'trusted-mock-executor', version: '1' } }));
  const toolchainVersion = 'trusted-mock-executor';
  const gate = new LeanIncrementalGate({ graph: new MathematicalDependencyGraph(), toolchainVersion,
    environmentDigest: `sha256:${'e'.repeat(64)}`,
    executor: async () => ({ exitCode: 0, toolchainVersion, axioms: [] }) });
  await artifact.verifyThroughLean(gate, 'theorem test_proof : 0 = 0 := by rfl');
  return artifact;
}

module.exports = { mockVerifiedProof };
