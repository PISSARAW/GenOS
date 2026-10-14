'use strict';

const { kindDefinition } = require('./workerKindService');

function referenceList(allowed) {
  return { type: 'array', minItems: 1, items: { type: 'string', minLength: 1,
    ...(allowed.length ? { enum: allowed } : {}) } };
}

function claimSchema(refs) {
  return object({ statement: { type: 'string', minLength: 1 }, evidence: refs }, ['statement', 'evidence']);
}

function object(properties, required) {
  return { type: 'object', properties, required, additionalProperties: true };
}

function dossierProperties(kind, refs) {
  const fields = {
    bounded_worker: ['scopeCompletion', object({ scopeRef: { type: 'string', minLength: 1 }, completedRefs: refs }, ['scopeRef', 'completedRefs'])],
    specialist: ['specialtyAssessment', object({ niche: { type: 'string', minLength: 1 }, inScope: { const: true }, evidence: refs }, ['niche', 'inScope', 'evidence'])],
    adaptive_worker: ['strategyTrace', { type: 'array', minItems: 1, items: object({ strategy: { type: 'string', minLength: 1 }, decision: { enum: ['retained', 'changed'] }, reason: { type: 'string', minLength: 1 }, evidence: refs }, ['strategy', 'decision', 'reason', 'evidence']) }],
    recovery_worker: ['recoveryReceipt', object({ action: { type: 'string', minLength: 1 }, restoredState: { type: 'string', minLength: 1 }, receiptId: { type: 'string', minLength: 1 }, evidence: refs }, ['action', 'restoredState', 'receiptId', 'evidence'])],
    liaison_worker: ['handoff', object({ sourceGroup: { type: 'string', minLength: 1 }, targetGroup: { type: 'string', minLength: 1 }, deliveredRefs: refs }, ['sourceGroup', 'targetGroup', 'deliveredRefs'])],
    resident_daemon: ['territoryReport', object({ territoryId: { type: 'string', minLength: 1 }, observedAt: { type: 'string', format: 'date-time' }, sourceRefs: refs }, ['territoryId', 'observedAt', 'sourceRefs'])],
    symbiotic_worker: ['hostContribution', object({ hostContractId: { type: 'string', minLength: 1 }, capability: { type: 'string', minLength: 1 }, contractCompliant: { const: true }, evidence: refs }, ['hostContractId', 'capability', 'contractCompliant', 'evidence'])],
    sub_orchestrator: ['childSummaries', { type: 'array', items: object({ childId: { type: 'string', minLength: 1 }, outcome: { enum: ['success', 'failed', 'blocked'] }, evidence: refs }, ['childId', 'outcome', 'evidence']) }]
  };
  return fields[kind] ? { [fields[kind][0]]: fields[kind][1] } : {};
}

function verificationArtifact(kind, refs) {
  const content = {
    testedClaim: { type: 'string', minLength: 1 },
    verificationMethod: { type: 'string', minLength: 1 },
    verdict: { enum: ['accept', 'reject', 'unresolved'] },
    reproductionSteps: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
    evidence: refs,
    ...(kind === 'red_worker' ? { counterexamples: { type: 'array', items: object({
      claim: { type: 'string', minLength: 1 }, attack: { type: 'string', minLength: 1 },
      reproductionSteps: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } }, evidence: refs
    }, ['claim', 'attack', 'reproductionSteps', 'evidence']) } } : {})
  };
  return object(content, ['testedClaim', 'verificationMethod', 'verdict', 'reproductionSteps', 'evidence']);
}

function artifactSchema(kind, artifactType, refs) {
  if (artifactType === 'dossier') {
    return object({ type: { const: 'dossier' }, content: object({ claims: { type: 'array', minItems: 1, items: claimSchema(refs) }, ...dossierProperties(kind, refs) },
      ['claims', ...Object.keys(dossierProperties(kind, refs))]), provenance: object({ sourceRefs: refs }, ['sourceRefs']) }, ['type', 'content', 'provenance']);
  }
  if (artifactType === 'verification_report') {
    return object({ type: { const: artifactType }, content: verificationArtifact(kind, refs),
      provenance: object({ sourceRefs: refs }, ['sourceRefs']) }, ['type', 'content', 'provenance']);
  }
  return object({ type: { const: artifactType }, content: { type: 'object' }, provenance: object({ sourceRefs: refs }, ['sourceRefs']) },
    ['type', 'content', 'provenance']);
}

function workerArtifactResponseFormat(kind, allowedEvidenceRefs = []) {
  const resolved = require('./workerKindService').resolveWorkerKind(kind);
  const artifactType = kindDefinition(resolved).artifact;
  const refs = referenceList(allowedEvidenceRefs);
  const properties = {
    outcome: { enum: ['success', 'unresolved'] },
    claims: { type: 'array', items: claimSchema(refs) }
  };
  const required = ['outcome', 'claims'];
  if (artifactType === 'dossier') {
    properties.claims.minItems = 1;
    Object.assign(properties, dossierProperties(resolved, refs));
    required.push(...Object.keys(dossierProperties(resolved, refs)));
  } else {
    properties.workerArtifact = artifactSchema(resolved, artifactType, refs);
    required.push('workerArtifact');
  }
  return { name: 'genos_worker_artifact', schema: object(properties, required) };
}

module.exports = { workerArtifactResponseFormat };
