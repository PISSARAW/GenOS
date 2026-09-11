/**
 * O(log N) causal bisection search isolating the first failing snapshot.
 */
const {
  knownHealth,
  monotonicityViolation,
  findLastHealthyRef
} = require('./bisectionHistory');

function clampRetries(config) {
  return Math.max(1, Math.min(3, Number(config.predicateRetries) || 2));
}

function makeProbe(failurePredicate) {
  return async (snapshot) => {
    if (failurePredicate) return failurePredicate(snapshot);
    return knownHealth(snapshot);
  };
}

async function collectAttempts(probe, snapshot, retries) {
  const evaluations = [];
  for (let attempt = 0; attempt < retries; attempt += 1) {
    evaluations.push(await probe(snapshot));
  }
  return evaluations;
}

function stableEvaluation(evaluations) {
  if (evaluations.some((evaluation) => typeof evaluation !== 'boolean')) {
    return { stable: false, value: null, reason: 'Snapshot predicate did not produce a boolean health result.' };
  }
  if (!evaluations.every((evaluation) => evaluation === evaluations[0])) {
    return { stable: false, value: null, reason: 'Snapshot predicate was unstable across repeated evaluations.' };
  }
  return { stable: true, value: evaluations[0] };
}

async function evaluateWithRetries(probe, snapshot, retries) {
  const evaluations = await collectAttempts(probe, snapshot, retries);
  return stableEvaluation(evaluations);
}

function abortSearch(history, steps, reason) {
  return {
    bisectionComplete: false,
    anomalyFound: false,
    totalSnapshotsSearched: history.length,
    bisectionIterationsRequired: steps.length,
    bisectionAuditTrace: steps,
    reason
  };
}

async function verifyBaseline(history, evaluate) {
  const baseline = await evaluate(history[0]);
  if (!baseline.stable) return { ok: false, reason: baseline.reason };
  if (!baseline.value) {
    return { ok: false, reason: 'Causal bisection requires a healthy baseline snapshot before the first failing snapshot.' };
  }
  return { ok: true, reason: null };
}

function recordStep(steps, observation) {
  steps.push({
    iteration: steps.length + 1,
    testedIndex: observation.mid,
    stepNumber: observation.snap.step ?? observation.snap.step_number,
    snapshotHash: observation.snap.hash ?? observation.snap.snapshot_hash,
    evaluatedStatus: observation.isHealthy ? 'PASS (HEALTHY)' : 'FAIL (ANOMALY_PRESENT)'
  });
}

async function searchFirstFailure(history, evaluate, steps) {
  let low = 1;
  let high = history.length - 1;
  let culpritIdx = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const snap = history[mid];
    const evaluation = await evaluate(snap);
    if (!evaluation.stable) return { aborted: true, reason: evaluation.reason, culpritIdx: -1 };
    recordStep(steps, { snap, mid, isHealthy: evaluation.value });
    if (!evaluation.value) {
      culpritIdx = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return { aborted: false, reason: null, culpritIdx };
}

function complexityLabel(count) {
  return `O(log ${count}) = ${Math.ceil(Math.log2(count || 1))} steps`;
}

function noAnomalyResult(history, steps) {
  return {
    bisectionComplete: true,
    anomalyFound: false,
    evidenceLevel: 'regression_indicator',
    causalGuarantee: false,
    totalSnapshotsSearched: history.length,
    bisectionIterationsRequired: steps.length,
    bisectionSteps: steps.length,
    theoreticalComplexity: complexityLabel(history.length),
    bisectionAuditTrace: steps,
    reason: 'All available snapshots satisfy the invariant.'
  };
}

function executionOutcome(executionResults, snap) {
  if (!executionResults) return null;
  return executionResults.get(snap) || null;
}

function describeAction(search, culpritSnap) {
  const outcome = executionOutcome(search.executionResults, culpritSnap);
  if (!outcome) return culpritSnap.reason || culpritSnap.label;
  const detail = outcome.stderr || outcome.stdout || '';
  return `Invariant command exited with ${outcome.exitCode}.\n${detail}`.trim();
}

function describeCause(search, culpritSnap) {
  const outcome = executionOutcome(search.executionResults, culpritSnap);
  if (outcome && outcome.stderr) return outcome.stderr;
  return culpritSnap.reason || culpritSnap.label || `First snapshot failing the supplied invariant: ${culpritSnap.label}`;
}

function buildCulpritReport(search) {
  const culpritSnap = search.history[search.culpritIdx];
  if (search.sync) {
    return {
      stepNumber: culpritSnap.step,
      snapshotHash: culpritSnap.hash,
      lastHealthy: findLastHealthyRef(search.history, search.steps, search),
      culpritAgentId: culpritSnap.agent || 'worker_fast_coder',
      actionDescription: culpritSnap.desc,
      toolCall: 'isolated_test_runner',
      targetFile: null,
      rootCauseSummary: culpritSnap.reason || culpritSnap.label
    };
  }
  return {
    stepNumber: culpritSnap.step ?? culpritSnap.step_number,
    snapshotHash: culpritSnap.hash ?? culpritSnap.snapshot_hash,
    lastHealthy: findLastHealthyRef(search.history, search.steps, search),
    culpritAgentId: culpritSnap.agent || culpritSnap.author || 'worker_fast_coder',
    actionDescription: describeAction(search, culpritSnap),
    toolCall: 'isolated_test_runner',
    targetFile: null,
    rootCauseSummary: describeCause(search, culpritSnap)
  };
}

function completeResult(search) {
  return {
    bisectionComplete: true,
    anomalyFound: true,
    evidenceLevel: 'regression_indicator',
    causalGuarantee: false,
    totalSnapshotsSearched: search.history.length,
    bisectionIterationsRequired: search.steps.length,
    bisectionSteps: search.steps.length,
    theoreticalComplexity: complexityLabel(search.history.length),
    bisectionAuditTrace: search.steps,
    culpritReport: buildCulpritReport(search)
  };
}

// config is { executionResults, predicateRetries }. A Map/WeakMap passed
// directly as 3rd arg is treated as legacy executionResults (default retries).
function normalizeSearchConfig(config) {
  if (config && typeof config.get === 'function') {
    return { executionResults: config, predicateRetries: undefined };
  }
  if (!config) return { executionResults: null, predicateRetries: undefined };
  return { executionResults: config.executionResults || null, predicateRetries: config.predicateRetries };
}

async function bisectAnomalyAsync(snapshotHistory = [], failurePredicate = null, config = {}) {
  const history = snapshotHistory;
  if (history.length === 0) {
    return { bisectionComplete: false, anomalyFound: false, totalSnapshotsSearched: 0, bisectionIterationsRequired: 0, bisectionAuditTrace: [], reason: 'No snapshots available for this workspace.' };
  }
  if (monotonicityViolation(history)) {
    return abortSearch(history, [], 'Snapshot health history is non-monotonic; causal bisection requires a healthy-to-failing sequence.');
  }
  const settings = normalizeSearchConfig(config);
  const probe = makeProbe(failurePredicate);
  const retries = clampRetries(settings);
  const evaluate = (snapshot) => evaluateWithRetries(probe, snapshot, retries);
  const baseline = await verifyBaseline(history, evaluate);
  if (!baseline.ok) return abortSearch(history, [], baseline.reason);
  const steps = [];
  const search = await searchFirstFailure(history, evaluate, steps);
  if (search.aborted) return abortSearch(history, steps, search.reason);
  if (search.culpritIdx < 0) return noAnomalyResult(history, steps);
  return completeResult({
    history,
    steps,
    culpritIdx: search.culpritIdx,
    baselineHealthy: true,
    executionResults: settings.executionResults
  });
}

function syncStepStatus(healthy) {
  return healthy ? 'PASS (HEALTHY)' : 'FAIL (ANOMALY_PRESENT)';
}

function syncSearch(history, probe, steps) {
  let low = 0;
  let high = history.length - 1;
  let culpritIdx = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const snapshot = history[mid];
    const healthy = probe(snapshot);
    if (healthy && healthy.then) throw new Error('Use bisectAnomalyAsync for asynchronous predicates.');
    if (typeof healthy !== 'boolean') {
      return { failed: true, culpritIdx: -1, reason: 'Snapshot predicate did not produce a boolean health result.' };
    }
    steps.push({ iteration: steps.length + 1, testedIndex: mid, stepNumber: snapshot.step, snapshotHash: snapshot.hash, evaluatedStatus: syncStepStatus(healthy) });
    if (healthy) {
      low = mid + 1;
    } else {
      culpritIdx = mid;
      high = mid - 1;
    }
  }
  return { failed: false, culpritIdx, reason: null };
}

// Synchronous compatibility surface for in-process benchmark callers. HTTP
// bisection uses bisectAnomalyAsync because its predicate runs a real command.
function bisectAnomaly(snapshotHistory = [], failurePredicate = null) {
  if (snapshotHistory.length === 0) return { bisectionComplete: false, anomalyFound: false, totalSnapshotsSearched: 0, bisectionIterationsRequired: 0, bisectionSteps: 0, bisectionAuditTrace: [], reason: 'No snapshots available for this workspace.' };
  if (monotonicityViolation(snapshotHistory)) return { bisectionComplete: false, anomalyFound: false, totalSnapshotsSearched: snapshotHistory.length, bisectionIterationsRequired: 0, bisectionSteps: 0, bisectionAuditTrace: [], reason: 'Snapshot health history is non-monotonic; causal bisection requires a healthy-to-failing sequence.' };
  if (failurePredicate && failurePredicate.constructor && failurePredicate.constructor.name === 'AsyncFunction') throw new Error('Use bisectAnomalyAsync for asynchronous predicates.');
  const probe = (snapshot) => (failurePredicate ? failurePredicate(snapshot) : knownHealth(snapshot));
  const steps = [];
  const search = syncSearch(snapshotHistory, probe, steps);
  if (search.failed) return { bisectionComplete: false, anomalyFound: false, totalSnapshotsSearched: snapshotHistory.length, bisectionIterationsRequired: steps.length, bisectionSteps: steps.length, bisectionAuditTrace: steps, reason: search.reason };
  const base = { bisectionComplete: true, anomalyFound: search.culpritIdx >= 0, totalSnapshotsSearched: snapshotHistory.length, bisectionIterationsRequired: steps.length, bisectionSteps: steps.length, theoreticalComplexity: complexityLabel(snapshotHistory.length), bisectionAuditTrace: steps };
  const annotated = { ...base, evidenceLevel: 'regression_indicator', causalGuarantee: false };
  if (search.culpritIdx < 0) return { ...annotated, reason: 'All available snapshots satisfy the invariant.' };
  return { ...annotated, culpritReport: buildCulpritReport({ history: snapshotHistory, steps, culpritIdx: search.culpritIdx, baselineHealthy: false, executionResults: null, sync: true }) };
}

module.exports = {
  bisectAnomalyAsync,
  bisectAnomaly
};
