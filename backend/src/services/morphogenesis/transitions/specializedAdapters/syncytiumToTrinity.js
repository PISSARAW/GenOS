'use strict';

const { createTransferBundle, createClaim, createArtifact, createDecision } = require('../morphologyTransferBundle');

const ADAPTER_NAME = 'syncytium_to_trinity';
const LOSS_ESTIMATE = 0.15;

function createSyncytiumToTrinityAdapter() {
  return { name: ADAPTER_NAME, fromTopology: 'syncytium', toTopology: 'trinity', lossEstimate: LOSS_ESTIMATE, exportTransferBundle, importTransferBundle, transform };
}

async function exportTransferBundle(node, context) {
  const s = context.output || context.state;
  const crdt = s?.crdt || s?.sharedState || {};
  const converged = !!s?.converged;
  return buildExportBundle({ node, context, crdt, converged, source: s });
}

async function importTransferBundle(bundle, targetNode, context) {
  return { context: { ...context, input: buildTrinityInput(bundle), state: { ...context.state, syncytiumImport: bundle.stateCapsules } }, output: null, imported: true, trinityInput: buildTrinityInput(bundle) };
}

async function transform(bundle) {
  const hypotheses = bundle.claims.filter(c => c.confidence > 0.5).map(c => ({ statement: c.statement, confidence: c.confidence }));
  return { trinityInput: { hypotheses, evidence: bundle.evidence, initialConvergence: bundle.provenance?.specialNote?.includes('converged') || false }, lossWarnings: bundle.uncertainties.length ? ['CRDT uncertainties not mapped to Trinity'] : [], preserved: { claims: hypotheses.length, evidence: bundle.evidence.length } };
}

function buildExportBundle(opts) {
  const { node, context, crdt, converged, source } = opts;
  const data = extractExportData(source, converged);
  const stateCapsules = node.nodeId && crdt ? [{ capsuleId: node.nodeId + '_crdt', nodeId: node.nodeId, state: { crdt, converged }, ports: [], timestamp: new Date().toISOString() }] : [];
  return createTransferBundle({ mission: context.missionId, scope: node.scope || 'mission', artifacts: data.artifacts, claims: data.claims, evidence: data.evidence, uncertainties: data.uncertainties, decisions: data.decisions, unresolvedQuestions: converged ? [] : ['Full convergence not achieved'], stateCapsules, workerCapabilities: node.workers?.flatMap(w => w.capabilities || []) || [], resources: context.budget || {}, provenance: { topology: 'syncytium', variant: node.variant, executionId: context.executionId, specialNote: 'CRDT state exported with convergence status' }, sourceReceipt: context.receipts?.[context.receipts.length - 1] || null, topologyId: 'syncytium', variant: node.variant });
}

function extractExportData(source, converged) {
  const artifacts = source?.mergedDocument ? [createArtifact('merged_document', source.mergedDocument, { converged })] : [];
  artifacts.push(...(source?.proposals || []).map(p => createArtifact('proposal', p.content, { author: p.author, timestamp: p.timestamp })));
  const claims = [];
  if (source?.consensus) for (const [k, v] of Object.entries(source.consensus)) claims.push(createClaim(`${k}: ${v}`, 0.9, ['syncytium_convergence']));
  if (converged) claims.push(createClaim('CRDT state converged', 0.95, ['crdt_convergence']));
  return { artifacts, claims, evidence: source?.evidence || [], uncertainties: converged ? [] : ['CRDT may not have converged'], decisions: (source?.decisions || []).map(d => createDecision(d, 'syncytium_consensus')) };
}

function buildTrinityInput(bundle) {
  return { hypotheses: bundle.claims.map(c => ({ statement: c.statement, confidence: c.confidence, evidence: c.evidence })), evidence: bundle.evidence, constraints: bundle.artifacts.filter(a => a.type === 'constraint').map(a => a.content), initialConvergence: bundle.provenance?.specialNote?.includes('converged') || false };
}

module.exports = { createSyncytiumToTrinityAdapter };