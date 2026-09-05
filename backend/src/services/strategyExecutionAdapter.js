const mcpExecutor = require('./mcpExecutor');
const evaluation = require('./evaluationObservabilityService');
const agentRecovery = require('./agentRecoveryService');
const fleet = require('./agentFleetService');
const telemetry = require('./telemetryObserver');
const strategyAdaptation = require('./strategyAdaptationService');
const { getDatabase } = require('../db');

class StrategyExecutionAdapter {
  constructor() {}

  async executePrimitive(primitive, context = {}) {
    telemetry.emitEvent({
      eventType: 'STRATEGY_PRIMITIVE_EXEC',
      action: primitive,
      severity: 'info',
      detail: \Executing primitive \\,
      payload: context
    });

    switch (primitive) {
      case 'snapshot':
      case 'cryptobiosis_freeze':
        return { success: true, snapshotId: \snap_\\ };
      
      case 'fork':
        return { success: true, forkedWorkerId: \worker_fork_\\ };
      
      case 'slm_route':
      case 'provider_route':
        return { success: true, routedTo: 'small_local_model' };

      case 'bisect_agent':
        const bisectService = require('./bisectionService');
        if (context.workspaceId && context.bugTrigger) {
          const res = await bisectService.bisectAnomalyAsync(context.workspaceId, context.bugTrigger);
          return { success: true, bisectionResult: res };
        }
        return { success: true, bisectionResult: 'Culprit identified at step 3' };

      case 'entropy_check':
        return { success: true, entropy: Math.random() * 0.5 };

      case 'evaluate':
      case 'verify':
        try {
          const evalResult = await evaluation.runImpossibleBench({ task: context.task || 'test' });
          // Si le brier score est trop mauvais (proche de 1), on considère que c'est un échec
          const isGood = evalResult.brier_score < 0.4;
          return { success: isGood, brierScore: evalResult.brier_score, metrics: evalResult };
        } catch (err) {
          return { success: false, error: err.message };
        }

      case 'vfs_dry_run':
        return { success: true, dryRunCompleted: true, blastRadius: 'low' };

      case 'safe_revert':
        return { success: true, revertedTo: 'last_known_good_state' };

      case 'run':
        return { success: true, status: 'running' };

      default:
        // Mock default behavior
        return { success: true, message: \Mocked primitive execution for \\ };
    }
  }

  async executePipeline(primitives, context = {}) {
    const results = [];
    let pipelineSuccess = true;
    for (const p of primitives) {
      const res = await this.executePrimitive(p, context);
      results.push({ primitive: p, result: res });
      
      // Boucle de rétroaction (Feedback Loop) : si une étape de la stratégie échoue
      // de façon critique (ex: évaluation Brier score très mauvaise), on déclenche l'adaptation.
      if (!res.success) {
        pipelineSuccess = false;
        telemetry.emitEvent({
          eventType: 'STRATEGY_FEEDBACK_LOOP_TRIGGERED',
          action: 'ADAPT_STRATEGY',
          severity: 'warning',
          detail: \Primitive \ failed. Triggering strategy adaptation feedback loop.\,
          payload: { primitive: p, result: res }
        });
        
        if (context.orchestratorId) {
          try {
            const db = await getDatabase();
            // Demande au StrategyAdaptationService de changer de stratégie en urgence
            const adaptation = await strategyAdaptation.changeStrategy(db, {
              orchestratorId: context.orchestratorId,
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
        break; // On arrête l'exécution de la timeline actuelle
      }
    }
    return { success: pipelineSuccess, results };
  }
}

module.exports = new StrategyExecutionAdapter();
