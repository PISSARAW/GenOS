'use strict';

const { LeanIncrementalGate } = require('../epistemicScheduler/leanIncrementalGate');
const { MathematicalDependencyGraph } = require('../epistemicScheduler/mathematicalDependencyGraph');
const { createScientificReceiptAuthority } = require('../scientificReceiptAuthority');
const { createScientificReferenceStore } = require('../scientificReferences');
const { createScientificWorkflow } = require('../scientificWorkflowService');
const { createScientificReferenceProducer } = require('./scientificReferenceProducer');
const { createMathematicalOrganismRuntime } = require('./mathematicalOrganismRuntime');

const SHA256 = /^sha256:[a-f0-9]{64}$/;

function createScientificMathematicalRuntime(options = {}) {
  if (!options.db || typeof options.executor !== 'function' ||
      typeof options.toolchainVersion !== 'string' || !options.toolchainVersion.trim() ||
      !SHA256.test(options.environmentDigest || '')) {
    throw new Error('Scientific mathematical runtime requires a database, Lean executor and pinned toolchain/environment.');
  }
  const gate = new LeanIncrementalGate({ graph: new MathematicalDependencyGraph(),
    executor: options.executor, toolchainVersion: options.toolchainVersion,
    environmentDigest: options.environmentDigest,
    allowedAxioms: options.allowedAxioms || [] });
  const authority = createScientificReceiptAuthority({ db: options.db,
    executor: options.executor, toolchainVersion: options.toolchainVersion,
    environmentDigest: options.environmentDigest,
    allowedAxioms: options.allowedAxioms || [] });
  const referenceStore = createScientificReferenceStore({
    verifyReceipt: authority.verifyReceipt,
    verifyRetractionReceipt: options.verifyRetractionReceipt,
  });
  const workflow = createScientificWorkflow({ db: options.db, referenceStore });
  const producer = createScientificReferenceProducer({ workflow, authority,
    organizationId: options.organizationId, projectId: options.projectId,
    workspaceId: options.workspaceId, senderAgentId: options.senderAgentId });
  const runtime = createMathematicalOrganismRuntime({ ...options.runtimeOptions,
    leanGate: gate, scientificProducer: producer });
  return Object.freeze({ runtime, gate, authority, referenceStore, workflow, producer });
}

module.exports = { createScientificMathematicalRuntime };
