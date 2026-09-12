/**
 * StrategyExecutionAdapter — Dispatcher principal des primitives de stratégie.
 *
 * Chaque lot de primitives est implémenté dans un handler dédié sous primitiveHandlers/.
 * Ce fichier reste un thin dispatcher + la boucle de rétroaction (feedback loop).
 */
const telemetry = require('./telemetryObserver');
const { getDatabase } = require('../db');

function getAdaptationService() {
  return require('./strategyAdaptationService');
}

const { HANDLERS } = require('./primitiveHandlers/handlersRegistry');
const HANDLERS_MAP = new Map(Object.entries(HANDLERS));

/**
 * Log primitive execution for audit trail: records which primitives were actually
 * called during strategy execution, enabling post-mortem analysis and coherence
 * verification between contracted and executed primitives.
 */
async function logPrimitiveExecutionAudit(agentId, primitives = [], context = {}) {
  try {
    const db = await getDatabase();
    if (!db) return;
    const timestamp = new Date().toISOString();
    const executionKey = `audit_${agentId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const details = {
      executionKey,
      agentId,
      primitives: primitives.map((p) => String(p).toLowerCase()),
      contextAgentId: context.agentId,
      contextOrchestrator: context.orchestratorId,
      timestamp
    };
    await db.run(
      `INSERT OR IGNORE INTO orchestration_action_receipts (receipt_key, orchestrator_id, source_event_id, tool, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      executionKey, context.orchestratorId || agentId, `exec_${Date.now()}`, `primitives: ${primitives.join(',')}`, 'completed', timestamp
    );
  } catch (err) {
    telemetry.emitEvent({
      eventType: 'STRATEGY_PRIMITIVE_AUDIT_FAILED',
      action: 'AUDIT_WRITE',
      detail: `Could not persist primitive execution audit: ${err.message}`,
      severity: 'warning',
      payload: { agentId, primitives, context }
    });
  }
}

class StrategyExecutionAdapter {
  constructor() {}

  async executePrimitive(primitive, context = {}) {
    telemetry.emitEvent({
      eventType: 'STRATEGY_PRIMITIVE_EXEC',
      action: primitive,
      severity: 'info',
      detail: 'Executing primitive ' + primitive,
      payload: context
    });

    const handler = typeof primitive === 'string' ? HANDLERS_MAP.get(primitive) : null;
    if (typeof handler === 'function') {
      return handler(context);
    }

    const error = new Error(`Strategy primitive '${primitive}' has no registered handler.`);
    error.code = 'STRATEGY_PRIMITIVE_UNIMPLEMENTED';
    telemetry.emitEvent({
      eventType: 'STRATEGY_PRIMITIVE_UNIMPLEMENTED',
      action: primitive,
      severity: 'error',
      detail: error.message,
      payload: { primitive, agentId: context.agentId || null }
    });
    return { success: false, error: error.message, code: error.code };
  }

  async executePipeline(primitives, context = {}) {
    const pipelineContext = {
      ...context,
      orchestratorId: context.orchestratorId || context.agentId || 'system',
      agentId: context.agentId || context.orchestratorId || 'system'
    };
    await logPrimitiveExecutionAudit(pipelineContext.agentId, primitives, pipelineContext);
    const results = [];
    let pipelineSuccess = true;
    for (const p of primitives) {
      const res = await this.executePrimitive(p, pipelineContext);
      results.push({ primitive: p, result: res });

      if (res.success && p === 'brier_scores' && res.scores) {
        pipelineContext.calibrationScores = { ...(pipelineContext.calibrationScores || {}), ...res.scores };
      }

      if (!res.success) {
        pipelineSuccess = false;
        telemetry.emitEvent({
          eventType: 'STRATEGY_FEEDBACK_LOOP_TRIGGERED',
          action: 'ADAPT_STRATEGY',
          severity: 'warning',
          detail: 'Primitive ' + p + ' failed. Triggering strategy adaptation feedback loop.',
          payload: { primitive: p, result: res }
        });

        const targetId = context.orchestratorId || context.agentId;
        if (targetId) {
          try {
            const db = await getDatabase();
            const agent = await db.get('SELECT id, parent_agent_id, execution_mode FROM agents WHERE id = ?', targetId);
            const orchestratorId = (agent && agent.execution_mode === 'worker' && agent.parent_agent_id)
              ? agent.parent_agent_id
              : targetId;
            const adaptation = await getAdaptationService().changeStrategy(db, {
              orchestratorId,
              need: context.need || context.mission || `Adaptive strategy adaptation following ${p} feedback`,
              reason: context.reason || `Automated feedback loop triggered by primitive ${p} result: ${res.error || res.status || 'evaluation incomplete'}`,
              executionBudget: context.budget || null
            });
            results.push({
              primitive: 'adaptation_feedback',
              result: { success: true, adaptation }
            });
          } catch (adaptErr) {
            results.push({
              primitive: 'adaptation_feedback',
              result: { success: false, error: adaptErr.message }
            });
          }
        }
        break;
      }
    }
    return { success: pipelineSuccess, results };
  }

  async executePipelineWithFeedback(primitives, context = {}) {
    return this.executePipeline(primitives, context);
  }

  getHandlers() {
    return HANDLERS;
  }
}

module.exports = new StrategyExecutionAdapter();
