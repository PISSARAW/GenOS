/**
 * Inference gateway: the CPU-side regulator between agent processes and the
 * GPU inference servers (vLLM, Ollama, LM Studio).
 *
 * The GPU stays blind — it only ever sees chat-completion requests arriving
 * over HTTP. This module makes that relationship deliberate on the CPU side:
 *
 * - a bounded queue per local provider, so 50 agents produce a growing queue
 *   instead of a VRAM-collapsing stampede;
 * - two priority lanes: `interactive` (orchestrator planning, plan review)
 *   jumps ahead of `bulk` (worker generation);
 * - a global cap across all local providers so several GPU servers share the
 *   machine's decode budget predictably;
 * - telemetry for every queue transition, which is the observability half of
 *   continuous batching: wait times and queue depths are the signal that the
 *   GPU is saturated and the fleet should slow down.
 *
 * Configuration:
 * - GENOS_INFERENCE_MAX_CONCURRENT   global in-flight cap (default 4)
 * - GENOS_INFERENCE_QUEUE_CAPACITY   max queued tasks before rejection (default 256)
 * - GENOS_INFERENCE_QUEUE_TIMEOUT_MS max time a task may wait in queue (default 120000)
 */
const telemetry = require('./telemetryObserver');

const LOCAL_PROVIDERS = new Set(['ollama', 'lmstudio', 'vllm', 'openai-compatible']);
const PRIORITIES = { interactive: 0, bulk: 1 };

const state = {
  running: 0,
  queues: {
    interactive: [],
    bulk: []
  },
  lastFairnessKey: {
    interactive: null,
    bulk: null
  },
  consecutiveInteractive: 0,
  perProvider: new Map()
};

function limit() {
  const configured = Number(process.env.GENOS_INFERENCE_MAX_CONCURRENT);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 4;
}

function queueCapacity() {
  const configured = Number(process.env.GENOS_INFERENCE_QUEUE_CAPACITY);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 256;
}

function queueTimeoutMs() {
  const configured = Number(process.env.GENOS_INFERENCE_QUEUE_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 0 ? Math.floor(configured) : 120000;
}

function queueDepth() {
  return state.queues.interactive.length + state.queues.bulk.length;
}

function maxInteractiveBurst() {
  const configured = Number(process.env.GENOS_INFERENCE_MAX_INTERACTIVE_BURST);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 3;
}

function providerDepth(provider) {
  return state.perProvider.get(provider)?.queued || 0;
}

function stats() {
  return {
    running: state.running,
    limit: limit(),
    queued: queueDepth(),
    capacity: queueCapacity(),
    providers: [...state.perProvider.entries()].map(([provider, entry]) => ({
      provider, queued: entry.queued, running: entry.running
    }))
  };
}

function emitTransition(eventType, task, extra = {}) {
  telemetry.emitEvent({
    eventType,
    agentId: task.agentId || 'inference-gateway',
    action: 'INFERENCE',
    detail: extra.detail || `${task.provider || 'local'} queue depth ${queueDepth()}`,
    payload: { provider: task.provider, priority: task.priority, ...stats(), ...extra },
    severity: extra.severity || 'info'
  });
}

function enqueue(task) {
  const lane = PRIORITIES[task.priority] === 0 ? 'interactive' : 'bulk';
  if (queueDepth() >= queueCapacity()) {
    const error = new Error(`Inference queue is full (${queueDepth()}/${queueCapacity()}); rejecting ${task.provider} task.`);
    error.code = 'INFERENCE_QUEUE_FULL';
    emitTransition('INFERENCE_REJECTED', task, { detail: error.message, severity: 'warning' });
    throw error;
  }
  state.queues[lane].push(task);
  const providerEntry = state.perProvider.get(task.provider) || { queued: 0, running: 0 };
  providerEntry.queued += 1;
  state.perProvider.set(task.provider, providerEntry);
  emitTransition('INFERENCE_QUEUED', task);
}

function dequeue() {
  const forceBulk = state.queues.bulk.length > 0 && state.consecutiveInteractive >= maxInteractiveBurst();
  const lane = state.queues.interactive.length && !forceBulk ? 'interactive' : 'bulk';
  const queue = state.queues[lane];
  const previousKey = state.lastFairnessKey[lane];
  const nextIndex = queue.findIndex((task) => task.fairnessKey !== previousKey);
  const task = queue.splice(nextIndex >= 0 ? nextIndex : 0, 1)[0];
  if (!task) return null;
  state.lastFairnessKey[lane] = task.fairnessKey;
  if (lane === 'interactive') state.consecutiveInteractive += 1;
  else state.consecutiveInteractive = 0;
  const providerEntry = state.perProvider.get(task.provider);
  if (providerEntry) providerEntry.queued -= 1;
  return task;
}

function pump() {
  while (state.running < limit()) {
    const task = dequeue();
    if (!task) break;
    state.running += 1;
    const providerEntry = state.perProvider.get(task.provider);
    if (providerEntry) providerEntry.running += 1;
    const startedAt = Date.now();
    emitTransition('INFERENCE_STARTED', task, { detail: `Started after ${startedAt - task.queuedAt}ms in queue.`, waitMs: startedAt - task.queuedAt });
    Promise.resolve()
      .then(task.run)
      .then((result) => {
        task.resolve(result);
        emitTransition('INFERENCE_COMPLETED', task, {
          detail: `Completed in ${Date.now() - startedAt}ms.`,
          durationMs: Date.now() - startedAt
        });
      })
      .catch((error) => {
        task.reject(error);
        emitTransition('INFERENCE_FAILED', task, { detail: error.message, severity: 'warning' });
      })
      .finally(() => {
        state.running -= 1;
        const providerEntry = state.perProvider.get(task.provider);
        if (providerEntry) providerEntry.running -= 1;
        pump();
      });
  }
}

/**
 * Run `fn` under the gateway's concurrency and priority rules. Resolves with
 * whatever `fn` resolves with; rejects with INFERENCE_QUEUE_FULL when the
 * queue is saturated or INFERENCE_QUEUE_TIMEOUT after waiting too long.
 */
function schedule(fn, { provider = 'local', priority = 'bulk', agentId, organizationId, projectId } = {}) {
  return new Promise((resolve, reject) => {
    let task;
    const timeout = queueTimeoutMs();
    const timer = timeout > 0 ? setTimeout(() => {
      if (!task.queued) return;
      task.queued = false;
      const lane = PRIORITIES[task.priority] === 0 ? 'interactive' : 'bulk';
      const index = state.queues[lane].indexOf(task);
      if (index >= 0) state.queues[lane].splice(index, 1);
      const providerEntry = state.perProvider.get(task.provider);
      if (providerEntry) providerEntry.queued -= 1;
      const error = new Error(`Inference task waited ${timeout}ms in queue; rejecting to bound latency.`);
      error.code = 'INFERENCE_QUEUE_TIMEOUT';
      emitTransition('INFERENCE_QUEUE_TIMEOUT', task, { detail: error.message, severity: 'warning' });
      reject(error);
    }, timeout) : null;

    task = {
      provider, priority: PRIORITIES[priority] === 0 ? 'interactive' : 'bulk', agentId,
      fairnessKey: organizationId && projectId ? `${organizationId}:${projectId}` : `agent:${agentId || 'anonymous'}`,
      queuedAt: Date.now(), queued: true,
      run: async () => {
        if (timer) clearTimeout(timer);
        return fn();
      },
      resolve, reject
    };
    try {
      enqueue(task);
    } catch (error) {
      if (timer) clearTimeout(timer);
      reject(error);
      return;
    }
    pump();
  });
}

/** Test hook: reset every queue and counter. */
function reset() {
  state.running = 0;
  state.queues.interactive = [];
  state.queues.bulk = [];
  state.lastFairnessKey.interactive = null;
  state.lastFairnessKey.bulk = null;
  state.consecutiveInteractive = 0;
  state.perProvider = new Map();
}

module.exports = {
  LOCAL_PROVIDERS,
  isLocalProvider: (provider) => LOCAL_PROVIDERS.has(provider),
  schedule,
  stats,
  reset
};
