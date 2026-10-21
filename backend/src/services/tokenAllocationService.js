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
  const remainderTokens = pool - (perWorkerTokens * workerCount);
  return {
    perWorkerTokens,
    remainderTokens,
    workerTokens: Array.from({ length: workerCount }, (_, index) => perWorkerTokens + (index < remainderTokens ? 1 : 0))
  };
}

function profiledRound(workerTokens) {
  const pool = workerTokens.reduce((sum, tokens) => sum + tokens, 0);
  const perWorkerTokens = workerTokens.length ? Math.floor(pool / workerTokens.length) : 0;
  return { workerCount: workerTokens.length, pool, perWorkerTokens,
    remainderTokens: pool - (perWorkerTokens * workerTokens.length), workerTokens };
}

function fillToward(workerTokens, limits, available) {
  const funded = [...workerTokens];
  let remaining = Math.max(0, available - funded.reduce((sum, value) => sum + value, 0));
  while (remaining > 0) {
    const active = funded.map((tokens, index) => limits[index] > tokens ? index : -1).filter(index => index >= 0);
    if (!active.length) break;
    const share = Math.max(1, Math.floor(remaining / active.length));
    for (const index of active) {
      const grant = Math.min(share, limits[index] - funded[index], remaining);
      funded[index] += grant;
      remaining -= grant;
      if (!remaining) break;
    }
  }
  return { funded, remaining };
}

function profileValues(profiles, field) {
  return profiles.map(profile => whole(profile?.[field]));
}

function profiledAllocation(workerPool, profiles, mode) {
  if (!profiles.length) {
    return { mode, workerPool, recoveryPool: workerPool,
      initial: { workerCount: 0, pool: 0, perWorkerTokens: 0, remainderTokens: 0, workerTokens: [] },
      continuation: { survivorCount: 0, pool: 0, perWorkerTokens: 0, remainderTokens: workerPool, workerTokens: [] } };
  }
  const minimums = profileValues(profiles, 'minimumStartTokens');
  const minimumTotal = minimums.reduce((sum, value) => sum + value, 0);
  if (workerPool < minimumTotal) {
    return { mode, workerPool, recoveryPool: workerPool,
      initial: { workerCount: 0, pool: 0, perWorkerTokens: 0, remainderTokens: 0, workerTokens: [] },
      continuation: { survivorCount: 0, pool: 0, perWorkerTokens: 0, remainderTokens: workerPool, workerTokens: [] } };
  }
  if (mode !== 'successive_halving_with_reallocation' && mode !== 'trinity_adaptive_all_worlds') {
    const targets = profileValues(profiles, 'targetTokens');
    const allocation = fillToward(minimums, targets, workerPool);
    return { mode, workerPool, recoveryPool: allocation.remaining,
      initial: profiledRound(allocation.funded),
      continuation: { survivorCount: 0, pool: 0, perWorkerTokens: 0, remainderTokens: 0, workerTokens: [] } };
  }
  const survivorCount = mode === 'trinity_adaptive_all_worlds'
    ? profiles.length : Math.max(1, Math.ceil(profiles.length / 2));
  const capacities = profiles.map((profile, index) => Math.max(0,
    whole(profile.maximumTokens) - minimums[index]));
  const safePerSurvivor = capacities.length ? Math.min(...capacities) : 0;
  const continuationPool = Math.min(workerPool - minimumTotal, safePerSurvivor * survivorCount);
  const continuation = splitPool(continuationPool, survivorCount);
  return { mode, workerPool, recoveryPool: workerPool - minimumTotal - continuationPool,
    initial: profiledRound(minimums),
    continuation: { survivorCount, pool: continuationPool, ...continuation } };
}

function adaptiveAllWorldsAllocation({ workerPool, workers, minimum, mode }) {
  const minimumPass = minimum * workers;
  if (workerPool < minimumPass * 2) {
    return { mode, workerPool, initial: { workerCount: workers, pool: workerPool, ...splitPool(workerPool, workers) },
      continuation: { survivorCount: 0, pool: 0, perWorkerTokens: 0, remainderTokens: 0, workerTokens: [] } };
  }
  const initialPool = Math.max(minimumPass, Math.floor(workerPool / 2));
  const continuationPool = workerPool - initialPool;
  return {
    mode, workerPool,
    initial: { workerCount: workers, pool: initialPool, ...splitPool(initialPool, workers) },
    continuation: { survivorCount: workers, pool: continuationPool, ...splitPool(continuationPool, workers) }
  };
}

// This is intentionally deterministic.  The runtime can persist and replay the
// allocation decision instead of asking a model to invent a budget split.
function buildAllocation({ totalTokens, workerShare, workerCount, minimumWorkerTokens, workerBudgets, mode }) {
  const total = whole(totalTokens);
  const workers = whole(workerCount);
  const minimum = Math.max(1, whole(minimumWorkerTokens));
  const share = Number(workerShare);
  const workerPool = whole(total * (Number.isFinite(share) ? Math.max(0, Math.min(1, share)) : 0));
  if (Array.isArray(workerBudgets) && workerBudgets.length === workers) {
    return profiledAllocation(workerPool, workerBudgets, mode);
  }
  if (!workers || workerPool < minimum * workers) {
    return { mode, workerPool, initial: { workerCount: 0, pool: 0, perWorkerTokens: 0, remainderTokens: 0 }, continuation: { survivorCount: 0, pool: workerPool, perWorkerTokens: 0, remainderTokens: workerPool } };
  }

  if (mode === 'trinity_adaptive_all_worlds') return adaptiveAllWorldsAllocation({ workerPool, workers, minimum, mode });

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
