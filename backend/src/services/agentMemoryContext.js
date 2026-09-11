/**
 * GenOS Agent Memory Context Provider
 * Thin facade over agentMemoryTelemetry / agentMemoryVesicles /
 * agentMemoryStore / agentMemoryPrompt (N11). Every function here delegates
 * so the quality gate stays green; the behavioral contract is unchanged.
 *
 * Caller-shape decisions (N11, no more silent nulls):
 * - retrieveAgentMemories: sole caller is formatCognitiveMemoryPrompt, which
 *   destructures the result. Shape kept ({experiences, pitfalls,
 *   goldenPaths, episodes}); failures yield empty collections + a
 *   MEMORY_READ_FAILED telemetry event.
 * - formatCognitiveMemoryPrompt: callers (agentRuntimeAdapter,
 *   memory tests) expect a string and treat falsy as "no memory". Shape
 *   kept ('' on failure) + MEMORY_READ_FAILED telemetry. No [MEMORY_ERROR]
 *   prefix: a truthy error marker would be injected verbatim into mission
 *   prompts; the telemetry record is the traceable marker instead.
 * - compileExecutionMemory: callers (strategyPromotionGate ignores the
 *   return; tests assert null for invalid input) already handle null. Shape
 *   kept (memId or null) + MEMORY_STORE_FAILED telemetry on every failure.
 * - Vesicles: peek first, consume destructively only after the prompt block
 *   was assembled; the facade signature is untouched so no caller changes.
 */

const prompt = require('./agentMemoryPrompt');
const store = require('./agentMemoryStore');

async function retrieveAgentMemories(agentId, task, options) {
  return prompt.retrieveAgentMemories(agentId, task, options);
}

async function formatCognitiveMemoryPrompt(agentId, task, options) {
  return prompt.formatCognitiveMemoryPrompt(agentId, task, options);
}

async function compileExecutionMemory(..._args) {
  return store.compileExecutionMemory(..._args);
}

function formatGoldenPath(g) {
  return prompt.formatGoldenPath(g);
}

module.exports = {
  retrieveAgentMemories,
  formatCognitiveMemoryPrompt,
  compileExecutionMemory,
  formatGoldenPath
};
