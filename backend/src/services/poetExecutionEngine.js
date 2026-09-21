'use strict';

/**
 * @file poetExecutionEngine.js
 * @description Exécution réelle des environnements POET.
 *
 * Contrairement à evaluateAgentOnEnvironment() qui compare simplement
 * des capacités, ce service exécute réellement l'agent sur l'environnement
 * et mesure le résultat.
 */

const { runInSnapshot } = require('./workspaceSnapshotRun');

// ─── Exécution d'un agent sur un environnement ─────────────────────

/**
 * Exécute un agent sur un environnement donné.
 * L'agent doit produire une solution qui satisfait les contraintes.
 */
async function executeAgentOnEnvironment(agent, environment, options) {
  options = options || {};
  const timeoutMs = options.timeoutMs || 60000;
  const maxSteps = options.maxSteps || 10;

  const results = {
    agentId: agent.id,
    environmentId: environment.id,
    steps: [],
    success: false,
    score: 0,
    startedAt: new Date().toISOString(),
    endedAt: null,
  };

  try {
    // Prépare le contexte d'exécution
    const executionContext = buildExecutionContext(agent, environment);

    // Exécute les étapes de l'agent
    for (let step = 0; step < maxSteps; step++) {
      const stepResult = await executeStep({ agent, environment, executionContext }, { timeoutMs });
      results.steps.push(stepResult);

      if (stepResult.isFinal) {
        results.success = stepResult.success;
        break;
      }

      // Vérifie si l'environnement a atteint un état terminal
      if (environmentIsTerminal(environment, executionContext)) {
        results.success = evaluateEnvironmentGoal(environment, executionContext);
        break;
      }
    }

    // Calcule le score final
    results.score = computeExecutionScore(results, environment);
  } catch (err) {
    results.error = err.message;
    results.success = false;
  }

  results.endedAt = new Date().toISOString();
  return results;
}

function buildExecutionContext(agent, environment) {
  return {
    agent,
    environment,
    memory: [],
    variables: {},
    stepCount: 0,
    constraints: environment.constraints || {},
    goals: environment.goals || [],
  };
}

async function executeStep(ctx, opts) {
  ctx.executionCtx.stepCount++;
  const prompt = buildStepPrompt(ctx.agent, ctx.environment, ctx.executionCtx);

  try {
    const result = await runInSnapshot({
      snapshot: { path: ctx.environment.snapshotPath },
      command: prompt,
      timeoutMs: opts.timeoutMs,
      workspacePath: ctx.environment.workspacePath,
    });

    const output = result.stdout || '';
    const success = result.exitCode === 0;

    ctx.executionCtx.memory.push({ step: ctx.executionCtx.stepCount, prompt, output, success });

    return {
      step: ctx.executionCtx.stepCount,
      success,
      output,
      exitCode: result.exitCode,
      isFinal: success && environmentGoalMet(ctx.environment, ctx.executionCtx),
    };
  } catch (err) {
    return {
      step: ctx.executionCtx.stepCount,
      success: false,
      output: err.message,
      exitCode: -1,
      isFinal: true,
    };
  }
}

function buildStepPrompt(agent, environment, ctx) {
  const goal = environment.goals?.[0] || 'Solve the problem';
  const ctxInfo = ctx.memory.length > 0 ? `\nPrevious output: ${ctx.memory[ctx.memory.length - 1].output.slice(0, 200)}` : '';
  return `${agent.role}: ${goal}${ctxInfo}\nEnvironment constraints: ${JSON.stringify(environment.constraints)}`;
}

function environmentIsTerminal(environment, ctx) {
  return ctx.stepCount >= (environment.maxSteps || 10);
}

function environmentGoalMet(environment, ctx) {
  return ctx.memory.length > 0 && ctx.memory[ctx.memory.length - 1].success;
}

function evaluateEnvironmentGoal(environment, ctx) {
  const successRate = ctx.memory.filter(m => m.success).length / Math.max(1, ctx.memory.length);
  return successRate >= (environment.successThreshold || 0.7);
}

function computeExecutionScore(results, environment) {
  if (results.success) return 1;
  const stepSuccess = results.steps.filter(s => s.success).length;
  return stepSuccess / Math.max(1, results.steps.length);
}

module.exports = {
  executeAgentOnEnvironment,
  buildExecutionContext,
  executeStep,
};
