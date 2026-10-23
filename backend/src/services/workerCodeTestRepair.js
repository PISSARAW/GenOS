'use strict';

const MAX_TEST_RETRIES = 2;
const MAX_FAILURE_TEXT = 20000;
const MAX_CANDIDATE_TEXT = 12000;

function isCodeWorker(mission) {
  return mission.localCodeWorker === true || mission.executionPolicy?.localCodeWorker === true;
}

function latencyBudget(mission) {
  const values = [mission.timeoutMs, mission.executionBudget?.latencyMs]
    .map(Number).filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.min(...values) : 30000;
}

function tokenBudget(mission) {
  const value = Number(mission.executionBudget?.tokens);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function consumedTokens(error) {
  const direct = Number(error.usage?.tokens);
  if (Number.isSafeInteger(direct) && direct >= 0) return direct;
  const input = Number(error.usage?.inputTokens);
  const output = Number(error.usage?.outputTokens);
  if (Number.isSafeInteger(input) && input >= 0 && Number.isSafeInteger(output) && output >= 0) {
    return input + output;
  }
  return null;
}

function failureFeedback(error) {
  const tests = error.proposal?.tests || [];
  const result = tests.map((test) => [
    `Command: ${test.command || 'unknown'}`,
    `Exit code: ${test.exitCode}`,
    test.stdout ? `stdout:\n${test.stdout}` : '',
    test.stderr ? `stderr:\n${test.stderr}` : ''
  ].filter(Boolean).join('\n')).join('\n\n');
  const patches = error.proposal?.failedPatchContents || [];
  const candidate = patches.map((patch) => `Rolled-back candidate ${patch.path}:\n${patch.content}`)
    .join('\n\n').slice(0, MAX_CANDIDATE_TEXT);
  const diagnostics = error.workerArtifactDiagnostics;
  const schemaFeedback = diagnostics ? [
    `Worker output contract rejected (${error.code || 'unknown'}): ${diagnostics.error || error.message}`,
    Array.isArray(diagnostics.violations) ? diagnostics.violations.join('\n') : '',
    diagnostics.outputExcerpt ? `Rejected output excerpt:\n${diagnostics.outputExcerpt}` : ''
  ].filter(Boolean).join('\n') : '';
  return [result, candidate, schemaFeedback].filter(Boolean).join('\n\n').slice(0, MAX_FAILURE_TEXT);
}

function repairPrompt(context) {
  const { mission, error, attempt } = context;
  const reason = error.code === 'WORKER_OUTPUT_SCHEMA_VIOLATION'
    ? 'The previous model output was rejected before application; the workspace is unchanged.'
    : 'The previous patch was rolled back after the independent test failed; the workspace is back to its pre-attempt state.';
  return `${mission.prompt}\n\nRepair attempt ${attempt} of ${MAX_TEST_RETRIES}. ${reason} Fix the specific failure below, keep the original requirements, and return a complete valid patch. Do not claim success without rerunning the allow-listed test.\n\n${failureFeedback(error)}`;
}

function canRetry(context) {
  if (!isCodeWorker(context.mission)
    || !['WORKER_TESTS_FAILED', 'WORKER_OUTPUT_SCHEMA_VIOLATION'].includes(context.error.code)) return false;
  if (context.attempt > MAX_TEST_RETRIES) return false;
  return latencyBudget(context.mission) - (Date.now() - context.startedAt) > 1000;
}

async function run(context) {
  const startedAt = Date.now();
  let mission = context.mission;
  let remainingTokens = tokenBudget(context.mission);
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await context.runAttempt(mission);
    } catch (error) {
      if (!canRetry({ mission: context.mission, error, attempt, startedAt })) throw error;
      if (remainingTokens > 0) {
        const consumed = consumedTokens(error);
        if (consumed === null || consumed >= remainingTokens) throw error;
        remainingTokens -= consumed;
      }
      const remainingMs = latencyBudget(context.mission) - (Date.now() - startedAt);
      await context.onRetry?.({ failedAttempt: attempt, error, remainingMs });
      mission = {
        ...context.mission,
        prompt: repairPrompt({ mission: context.mission, error, attempt }),
        timeoutMs: remainingMs,
        executionBudget: { ...context.mission.executionBudget, latencyMs: remainingMs,
          ...(remainingTokens > 0 ? { tokens: remainingTokens } : {}) }
      };
    }
  }
}

module.exports = { run, failureFeedback, repairPrompt, latencyBudget, tokenBudget, consumedTokens };
