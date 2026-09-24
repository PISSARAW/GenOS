'use strict';

/**
 * AutoReevaluationHook — branche la morphogenèse sur le runtime (ADR 0040).
 *
 * Appelé après un `change_organization` appliqué : évalue le regret via
 * `adaptiveReevaluationService` (seuil + rate-limit), puis enchaîne le
 * lifecycle contrefactuel, le plan et la validation via
 * `dynamicReevaluationExecutorService.executeReevaluation`.
 *
 * Garanties :
 * - best-effort : ne lève jamais, ne fait jamais échouer l'action appelante ;
 * - non-mutant par défaut (`autoApprove: false` → `pending_approval`) ;
 * - désactivable via `GENOS_MORPHOGENESIS_AUTO_REEVAL=0`.
 */

const { executeReevaluation } = require('./dynamicReevaluationExecutorService');
const { getState } = require('../collectiveStateService');

const KILL_SWITCH_ENV = 'GENOS_MORPHOGENESIS_AUTO_REEVAL';

function isDisabled() {
  return /^(0|false|off|no)$/i.test(String(process.env[KILL_SWITCH_ENV] || ''));
}

function buildEvidence(transition) {
  if (!transition || typeof transition !== 'object') return [];
  return [{
    status: 'completed',
    outcome: 'completed',
    kind: 'organization_transition',
    previous: transition.previous || null,
    organization: transition.organization || null,
    reason: transition.reason || null,
  }];
}

async function runEvaluation(ctx, agentId) {
  const result = await executeReevaluation({
    agentId,
    evidence: buildEvidence(ctx.transition),
    collectiveState: getState(),
    db: ctx.db,
  });
  const executed = Boolean(result && result.executed);
  return { evaluated: executed, reason: (result && result.reason) || 'unknown', receipt: result };
}

async function maybeAutoReevaluate(ctx) {
  const agentId = ctx && ctx.orchestratorId;
  if (isDisabled()) return { evaluated: false, reason: 'disabled' };
  if (!agentId || !ctx.db) return { evaluated: false, reason: 'invalid_context' };
  try {
    return await runEvaluation(ctx, agentId);
  } catch (err) {
    return { evaluated: false, reason: 'hook_failed', error: err && err.message };
  }
}

module.exports = { maybeAutoReevaluate, KILL_SWITCH_ENV };
