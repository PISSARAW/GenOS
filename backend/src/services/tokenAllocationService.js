function whole(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function boundedScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : null;
}

function splitPool(pool, workerCount) {
  const perWorkerTokens = workerCount ? Math.floor(pool / workerCount) : 0;
  return { perWorkerTokens, remainderTokens: pool - (perWorkerTokens * workerCount) };
}

// This is intentionally deterministic.  The runtime can persist and replay the
// allocation decision instead of asking a model to invent a budget split.
function buildAllocation({ totalTokens, workerShare, workerCount, minimumWorkerTokens, mode }) {
  const total = whole(totalTokens);
  const workers = whole(workerCount);
  const minimum = Math.max(1, whole(minimumWorkerTokens));
  const share = Number(workerShare);
  const workerPool = whole(total * (Number.isFinite(share) ? Math.max(0, Math.min(1, share)) : 0));
  if (!workers || workerPool < minimum * workers) {
    return { mode, workerPool, initial: { workerCount: 0, pool: 0, perWorkerTokens: 0, remainderTokens: 0 }, continuation: { survivorCount: 0, pool: workerPool, perWorkerTokens: 0, remainderTokens: workerPool } };
  }

  if (mode !== 'successive_halving_with_reallocation') {
    const initialSplit = splitPool(workerPool, workers);
    return {
      mode, workerPool,
      initial: { workerCount: workers, pool: workerPool, ...initialSplit },
      continuation: { survivorCount: 0, pool: 0, perWorkerTokens: 0, remainderTokens: 0 }
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
  const initialSplit = splitPool(effectiveInitialPool, workers);
  const continuationSplit = splitPool(continuationPool, effectiveSurvivorCount);
  return {
    mode, workerPool,
    initial: { workerCount: workers, pool: effectiveInitialPool, ...initialSplit },
    continuation: { survivorCount: effectiveSurvivorCount, pool: continuationPool, ...continuationSplit }
  };
}

function selectSurvivors(candidates = [], survivorCount = 1, preferredAgentIds = null) {
  const preferred = preferredAgentIds instanceof Set ? preferredAgentIds : new Set(preferredAgentIds || []);
  const ranked = [...candidates]
    .filter((candidate) => candidate && (candidate.status === 'completed' || candidate.status === 'idle'))
    .map((candidate) => ({ candidate, score: boundedScore(candidate.evidenceScore) }))
    .filter(({ candidate, score }) => candidate.agentId && Number.isFinite(score))
    .sort((left, right) => Number(preferred.has(right.candidate.agentId)) - Number(preferred.has(left.candidate.agentId))
      || right.score - left.score
      || String(left.candidate.agentId).localeCompare(String(right.candidate.agentId)));
  const seen = new Set();
  return ranked
    .filter(({ candidate }) => {
      if (seen.has(candidate.agentId)) return false;
      seen.add(candidate.agentId);
      return true;
    })
    .slice(0, Math.max(0, whole(survivorCount)))
    .map(({ candidate }) => candidate);
}

module.exports = { buildAllocation, selectSurvivors };
