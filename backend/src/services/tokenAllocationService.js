function whole(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

// This is intentionally deterministic.  The runtime can persist and replay the
// allocation decision instead of asking a model to invent a budget split.
function buildAllocation({ totalTokens, workerShare, workerCount, minimumWorkerTokens, mode }) {
  const total = whole(totalTokens);
  const workers = whole(workerCount);
  const minimum = Math.max(1, whole(minimumWorkerTokens));
  const workerPool = whole(total * Number(workerShare || 0));
  if (!workers || workerPool < minimum) {
    return { mode, workerPool, initial: { workerCount: 0, pool: 0, perWorkerTokens: 0 }, continuation: { survivorCount: 0, pool: workerPool, perWorkerTokens: 0 } };
  }

  if (mode !== 'successive_halving_with_reallocation') {
    return {
      mode, workerPool,
      initial: { workerCount: workers, pool: workerPool, perWorkerTokens: Math.floor(workerPool / workers) },
      continuation: { survivorCount: 0, pool: 0, perWorkerTokens: 0 }
    };
  }

  // Screen every hypothesis cheaply first.  Keep at least one minimum tranche
  // for each branch, but reserve the majority for evidence-selected survivors.
  const initialPool = Math.min(workerPool, Math.max(minimum * workers, Math.floor(workerPool / 3)));
  const survivorCount = Math.max(1, Math.ceil(workers / 2));
  let continuationPool = workerPool - initialPool;
  let effectiveInitialPool = initialPool;
  let effectiveSurvivorCount = survivorCount;
  // Do not label an unusably small remainder as a second round.  At this
  // budget a single complete initial pass is safer than pseudo-reallocation.
  if (continuationPool < minimum * survivorCount) {
    effectiveInitialPool = workerPool;
    continuationPool = 0;
    effectiveSurvivorCount = 0;
  }
  return {
    mode, workerPool,
    initial: { workerCount: workers, pool: effectiveInitialPool, perWorkerTokens: Math.floor(effectiveInitialPool / workers) },
    continuation: { survivorCount: effectiveSurvivorCount, pool: continuationPool, perWorkerTokens: effectiveSurvivorCount ? Math.floor(continuationPool / effectiveSurvivorCount) : 0 }
  };
}

function selectSurvivors(candidates = [], survivorCount = 1) {
  return [...candidates]
    .filter((candidate) => candidate.status === 'completed' || candidate.status === 'idle')
    .sort((left, right) => Number(right.evidenceScore || 0) - Number(left.evidenceScore || 0) || String(left.agentId).localeCompare(String(right.agentId)))
    .slice(0, Math.max(0, whole(survivorCount)));
}

module.exports = { buildAllocation, selectSurvivors };
