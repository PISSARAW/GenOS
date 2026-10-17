'use strict';

class TopologyController {
  constructor(node, runtime) {
    this.node = node;
    this.runtime = runtime;
    this.state = 'initialized';
    this.metrics = {};
    this.adaptationHistory = [];
  }

  async compose(config = {}) {
    throw new Error('compose() must be implemented by subclass');
  }

  async start(input = {}) {
    assertValidatedWorkerPolicy(this.node.topology, input);
    this.state = 'running';
    this.startedAt = new Date().toISOString();
    try {
      const output = await this.execute(input);
      this.state = 'completed';
      this.completedAt = new Date().toISOString();
      return output;
    } catch (error) {
      this.state = 'failed';
      this.completedAt = new Date().toISOString();
      throw error;
    }
  }

  async execute(input) {
    throw new Error('execute() must be implemented by subclass');
  }

  async observe() {
    return {
      nodeId: this.node.nodeId,
      topology: this.node.topology,
      variant: this.node.variant,
      state: this.state,
      metrics: this.metrics,
      health: this.node.health
    };
  }

  async step(input) {
    return this.execute(input);
  }

  async evaluate() {
    return { score: 1.0, metrics: this.metrics };
  }

  async proposeAdaptation() {
    return null;
  }

  async exportState() {
    return {
      nodeId: this.node.nodeId,
      state: this.node.state || {},
      metrics: this.metrics,
      adaptationHistory: this.adaptationHistory
    };
  }

  async importState(state) {
    if (state.state) this.node.state = { ...this.node.state, ...state.state };
    if (state.metrics) this.metrics = { ...this.metrics, ...state.metrics };
    if (state.adaptationHistory) this.adaptationHistory = [...state.adaptationHistory];
  }

  async quiesce() {
    this.state = 'quiesced';
    this.quiescedAt = new Date().toISOString();
  }

  async resume() {
    if (this.state === 'quiesced') {
      this.state = 'running';
      this.resumedAt = new Date().toISOString();
    }
  }

  async terminate() {
    this.state = 'terminated';
    this.terminatedAt = new Date().toISOString();
  }

  recordAdaptation(adaptation) {
    this.adaptationHistory.push({ ...adaptation, timestamp: new Date().toISOString() });
  }

  updateMetrics(metrics) {
    this.metrics = { ...this.metrics, ...metrics };
  }
}

function executionModeFor(input = {}) {
  return validatedWorkerResults(input).length > 0
    ? 'worker_backed_controller' : 'simulated_controller';
}

function executionProofFor(input = {}) {
  const workerResults = validatedWorkerResults(input);
  const runtimeWorkers = runtimeExecutedWorkerResults(input);
  if (!workerResults.length) {
    return { kind: 'local_simulation', workerCount: 0, simulationOnly: true,
      promotionEligible: false, reason: 'validated_workers_unavailable' };
  }
  return {
    kind: 'validated_worker_receipts',
    simulationOnly: false,
    promotionEligible: runtimeWorkers.length === workerResults.length,
    runtimeExecutionVerified: runtimeWorkers.length === workerResults.length,
    runtimeExecutionWorkerCount: runtimeWorkers.length,
    promotionReason: runtimeWorkers.length === workerResults.length
      ? 'terminal_worker_receipts_bound_to_execution_runs'
      : 'runtime_execution_receipts_missing',
    workerCount: workerResults.length,
    workerIds: workerResults.map((result) => result.workerId).filter(Boolean),
    evidenceRefs: [...new Set(workerResults.flatMap((result) => {
      const report = result.evidenceReport || {};
      const artifact = report.workerArtifact || {};
      return artifact.provenance?.evidenceRefs || artifact.provenance?.sourceRefs || [];
    }))]
  };
}

function validatedWorkerResults(input = {}) {
  return (Array.isArray(input.workerResults) ? input.workerResults : [])
    .filter(isValidatedWorkerResult);
}

function runtimeExecutedWorkerResults(input = {}) {
  return validatedWorkerResults(input).filter(hasRuntimeExecutionProof);
}

function isValidatedWorkerResult(result) {
  const report = result?.evidenceReport || result?.report;
  const artifact = report?.workerArtifact;
  const refs = artifact?.provenance?.evidenceRefs || artifact?.provenance?.sourceRefs;
  return report?.outcome === 'success' && typeof artifact?.type === 'string'
    && artifact.content !== undefined && artifact.content !== null
    && Array.isArray(refs) && refs.length > 0
    && refs.every((ref) => typeof ref === 'string' && ref.trim());
}

function hasRuntimeExecutionProof(result) {
  return result?.workerResultSource === 'worker_evidence_barrier'
    && hasExecutionRun(result) && hasTerminalCompletion(result)
    && hasOptionalOracleRef(result);
}

function hasExecutionRun(result) {
  const runId = result?.executionRunId || result?.runtimeProof?.executionRunId;
  return typeof runId === 'string' && runId.trim().length > 0;
}

function hasTerminalCompletion(result) {
  return (result?.terminalEvent || result?.runtimeProof?.terminalEvent) === 'AGENT_COMPLETED';
}

function hasOptionalOracleRef(result) {
  const ref = result?.nativeOracleRef || result?.runtimeProof?.nativeOracleRef;
  return ref === undefined || ref === null || validOracleRef(ref);
}

function validOracleRef(ref) {
  return typeof ref === 'object' && typeof ref.eventId === 'string' && typeof ref.hash === 'string';
}

function assertValidatedWorkerPolicy(topology, input = {}) {
  if (!['trinity', 'a_team'].includes(topology) || !requiresValidatedWorkers(input)) return;
  const expected = Array.isArray(input.workers) && input.workers.length
    ? input.workers.length : 1;
  if (runtimeExecutedWorkerResults(input).length >= expected) return;
  const error = new Error(`${topology} requires validated workers for production execution.`);
  error.code = 'TOPOLOGY_VALIDATED_WORKER_REQUIRED';
  throw error;
}

function requiresValidatedWorkers(input = {}) {
  const policy = input.executionPolicy || {};
  return policy.requireValidatedWorkers === true
    || policy.environment === 'production'
    || input.environment === 'production'
    || input.executionMode === 'production';
}

module.exports = {
  TopologyController, executionModeFor, executionProofFor, validatedWorkerResults,
  runtimeExecutedWorkerResults, hasRuntimeExecutionProof,
  assertValidatedWorkerPolicy
};
