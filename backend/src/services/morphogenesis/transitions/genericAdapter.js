'use strict';

const { createTransferBundle, createStateCapsule, createProvenance } = require('./morphologyTransferBundle');

function createGenericAdapter(topologyImpl) {
  return { topology: topologyImpl.topology, exportTransferBundle, importTransferBundle };

  async function exportTransferBundle(node, context) {
    const output = await topologyImpl.exportState?.(node, context) || context.output;
    const state = topologyImpl.captureState?.(node, context) || context.state;
    return buildBundle({ node, context, impl: topologyImpl, output, state });
  }

  async function importTransferBundle(bundle, targetNode, context) {
    if (bundle.topologyId && topologyImpl.topology && bundle.topologyId !== topologyImpl.topology) console.warn(`Importing bundle from ${bundle.topologyId} into ${topologyImpl.topology}`);
    const newContext = buildImportContext({ bundle, targetNode, context });
    const result = await topologyImpl.run({ variant: targetNode.variant, workers: targetNode.workers || [] }, newContext);
    return { context: newContext, output: result, imported: true };
  }
}

function buildBundle(opts) {
  const { node, context, impl, output, state } = opts;
  const extracted = extractAll(output, context);
  return createTransferBundle({ mission: context.missionId, scope: node.scope || 'mission', ...extracted, stateCapsules: [createStateCapsule(node.nodeId, state, node.inputPorts || [])].filter(Boolean), resources: context.budget || {}, provenance: createProvenance(impl.topology, node.variant, context.executionId), sourceReceipt: context.receipts?.[context.receipts.length - 1] || null, topologyId: impl.topology, variant: node.variant });
}

function buildImportContext(opts) {
  const { bundle, targetNode, context } = opts;
  const input = { artifacts: bundle.artifacts, claims: bundle.claims, evidence: bundle.evidence, uncertainties: bundle.uncertainties, decisions: bundle.decisions, unresolvedQuestions: bundle.unresolvedQuestions };
  const initialState = bundle.stateCapsules?.reduce((s, c) => (c.nodeId === targetNode.nodeId || !targetNode.nodeId) ? { ...s, ...c.state } : s, {}) || {};
  return { ...context, input, state: { ...context.state, ...initialState }, budget: bundle.resources || context.budget };
}

function extractAll(output, context) {
  return { artifacts: extractArtifacts(output), claims: extractClaims(output), evidence: extractEvidence(output, context), uncertainties: extractUncertainties(output), decisions: extractDecisions(output), unresolvedQuestions: extractUnresolvedQuestions(output), workerCapabilities: extractWorkerCapabilities(context) };
}

function extractArtifacts(output) { if (!output) return []; if (Array.isArray(output.artifacts)) return output.artifacts; if (output.artifact) return [output.artifact]; return []; }
function extractClaims(output) { if (!output) return []; if (Array.isArray(output.claims)) return output.claims; if (output.claim) return [output.claim]; return []; }
function extractEvidence(output, context) { const e = []; if (output?.evidence) e.push(...output.evidence); if (context?.evidence) e.push(...context.evidence); return e; }
function extractUncertainties(output) { if (!output) return []; if (Array.isArray(output.uncertainties)) return output.uncertainties; if (output.uncertainty) return [output.uncertainty]; return []; }
function extractDecisions(output) { if (!output) return []; if (Array.isArray(output.decisions)) return output.decisions; if (output.decision) return [output.decision]; return []; }
function extractUnresolvedQuestions(output) { if (!output) return []; if (Array.isArray(output.unresolvedQuestions)) return output.unresolvedQuestions; if (output.unresolvedQuestion) return [output.unresolvedQuestion]; return []; }
function extractWorkerCapabilities(context) { return context?.node?.workers?.flatMap(w => w.capabilities || []) || []; }

module.exports = { createGenericAdapter };