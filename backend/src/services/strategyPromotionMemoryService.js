'use strict';

function summary(report, fallback) {
  const claims = Array.isArray(report?.claims) ? report.claims : [];
  return claims.map(claim => claim?.statement).filter(value => typeof value === 'string' && value).join('\n') || fallback;
}

async function memoryScope(db, promotion) {
  const row = await db.get(`SELECT w.id, w.organization_id, w.project_id FROM agents a
    JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?`, promotion.agentId);
  if (!row) throw new Error('Promotion memory workspace not found');
  if (Boolean(row.organization_id) !== Boolean(row.project_id)) throw new Error('Incomplete promotion memory scope');
  return { organizationId: row.organization_id || null, projectId: row.project_id || null, workspaceId: row.id };
}

async function provenanceParent(db, promotion, scope) {
  const id = promotion.aeisAssemblyId;
  if (!id) throw new Error('Promotion memory requires its persisted assurance assembly');
  const stored = await require('./aeisAssemblyStore').readAssembly(db, id);
  if (stored.evaluation.allAccepted !== true || stored.evaluation.evaluation?.eligible !== true) {
    throw new Error('Promotion memory requires an accepted assurance evaluation');
  }
  const expectedScope = [scope.organizationId || 'local', scope.projectId || 'local', scope.workspaceId].join(':');
  if (stored.runId !== promotion.runId || stored.scopeId !== expectedScope) {
    throw new Error('Promotion memory assembly ownership mismatch');
  }
  const payload = { runId: promotion.runId, contractId: promotion.contractId, agentId: promotion.agentId,
    assemblyId: id, verifierResultIds: stored.evaluation.assembly.verifications.map(receipt => receipt.resultId) };
  return require('./evaluationObservabilityService').recordProvenance('strategy_promotion', promotion.runId, payload, null, scope);
}

async function recordPromotionMemory(db, promotion, options) {
  try {
    const scope = await memoryScope(db, promotion);
    const parent = await provenanceParent(db, promotion, scope);
    return await require('./agentMemoryContext').compileExecutionMemory(promotion.agentId, promotion.task,
      summary(promotion.report, options.summary || `Strategy promotion completed for run ${promotion.runId}.`), {
        ...scope, outcome: promotion.report?.outcome || 'unknown', approvedBy: options.approvedBy || 'human_gate',
        evidenceReport: promotion.report, philosophy: promotion.contract.philosophy,
        epistemicContext: promotion.contract.epistemic_context, provenanceHash: parent.payloadHash,
        ethicalComparison: promotion.contract.ethical_comparison
      });
  } catch (error) {
    require('./agentMemoryTelemetry').storeFailed(promotion.agentId, error, 'promotion-memory-provenance');
    return null;
  }
}

module.exports = { recordPromotionMemory };
