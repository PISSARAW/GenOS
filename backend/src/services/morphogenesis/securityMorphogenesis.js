'use strict';

const { runProcedure } = require('../agents/deterministicWorkerProcedures');

const TOPOLOGY_LIST = Object.freeze([
  'Trinity', 'ATeam', 'Biocenose', 'Rhizome', 'Syncytium',
  'Holobionte', 'Biome', 'Metapopulation'
]);

const CYBERCORP_USAGE = Object.freeze({
  Trinity: 'Comparer trois hypotheses d incident',
  ATeam: 'Repartir les taches entre specialistes',
  Biocenose: 'Deliberation, desaccord et abstention',
  Rhizome: 'Propager les decouvertes entre analyses liees',
  Syncytium: 'Construire un etat d investigation partage',
  Holobionte: 'Encadrer les outils et adaptateurs sous controle immunitaire',
  Biome: 'Allouer CPU, RAM, tokens et temps',
  Metapopulation: 'Comparer des investigations isolees sur plusieurs environnements'
});

const CORPUS = Object.freeze([
  { values: [3, 5, 7], target: 10, expected: { found: true, indices: [0, 2] } },
  { values: [4, 6], target: 5, expected: { found: false } },
  { values: [1, 2, 3, 4, 5], target: 9, expected: { found: true, indices: [1, 2, 3] } },
  { values: [10, 20, 30], target: 60, expected: { found: true, indices: [0, 1, 2] } },
  { values: [1, 1, 1, 1], target: 4, expected: { found: true, indices: [0, 1, 2, 3] } }
]);

const BUDGET = Object.freeze({ tokens: 10000, cycles: 100, timeMs: 30000 });

function outputsMatch(actual, expected) {
  if (!actual || !expected) return false;
  if (actual.found !== expected.found) return false;
  if (actual.found && !arraysEqual(actual.indices, expected.indices)) return false;
  return true;
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function runSingleShard(shard) {
  return shard.map((item) => {
    try {
      const out = runProcedure({
        version: 1,
        methodId: 'subset_sum',
        parameters: { values: item.values, target: item.target }
      });
      const receipt = { receiptId: out.receipt.id, nodeId: 'worker', methodId: out.receipt.methodId, result: out.receipt.result };
      return { item, output: out.output, receipt, ok: outputsMatch(out.output, item.expected) };
    } catch (error) {
      return { item, output: null, receipt: null, ok: false, error: error.message };
    }
  });
}

function distributeCorpus(corpus, workerCount) {
  const shards = [];
  for (let i = 0; i < workerCount; i += 1) shards.push([]);
  for (let i = 0; i < corpus.length; i += 1) {
    shards[i % workerCount].push(corpus[i]);
  }
  return shards.filter((s) => s.length > 0);
}

function reliabilityOf(result) {
  if (!result || !result.results) return 0;
  let ok = 0;
  let total = 0;
  for (const shard of result.results) {
    for (const r of shard) {
      total += 1;
      if (r.ok) ok += 1;
    }
  }
  return total === 0 ? 0 : ok / total;
}

function collectReceipts(result) {
  const receipts = [];
  for (const shard of result.results) {
    for (const r of shard) {
      if (r.receipt) receipts.push(r.receipt);
    }
  }
  return receipts;
}

function combineTrinity(results) {
  let best = results[0];
  for (let i = 1; i < results.length; i += 1) {
    const okCount = (r) => r.filter((x) => x.ok).length;
    if (okCount(results[i]) > okCount(best)) best = results[i];
  }
  return { ok: best.every((r) => r.ok), results: best, method: 'trinity_best_hypothesis' };
}

function combineATeam(results) {
  let allOk = true;
  for (const shard of results) {
    for (const r of shard) {
      if (!r.ok) allOk = false;
    }
  }
  return { ok: allOk, results, method: 'ateam_integrator_all_correct' };
}

function combineBiocenose(results) {
  let okCount = 0;
  let total = 0;
  for (const shard of results) {
    for (const r of shard) {
      total += 1;
      if (r.ok) okCount += 1;
    }
  }
  return { ok: okCount >= Math.ceil(total / 2), results, quorum: okCount, total, method: 'biocenose_quorum' };
}

function combineRhizome(results) {
  const merged = [];
  for (const shard of results) {
    for (const r of shard) {
      if (r.ok) merged.push(r);
    }
  }
  return { ok: merged.length > 0, results: merged, method: 'rhizome_merge_discoveries' };
}

function combineSyncytium(results) {
  let allOk = true;
  for (const shard of results) {
    for (const r of shard) {
      if (!r.ok) allOk = false;
    }
  }
  return { ok: allOk, results, method: 'syncytium_converge_shared_state' };
}

function combineHolobionte(results) {
  const admitted = [];
  for (const shard of results) {
    for (const r of shard) {
      if (r.ok && r.receipt) admitted.push(r);
    }
  }
  return { ok: admitted.length > 0, results: admitted, method: 'holobionte_immune_admission' };
}

function combineBiome(results) {
  let withinBudget = true;
  for (const shard of results) {
    for (const r of shard) {
      if (!r.ok) withinBudget = false;
    }
  }
  return { ok: withinBudget, results, method: 'biome_bounded_foraging' };
}

function combineMetapopulation(results) {
  const envResults = results.map((shard, index) => ({
    env: index,
    ok: shard.every((r) => r.ok),
    output: shard.map((r) => r.output)
  }));
  let consistent = true;
  for (const env of envResults) {
    if (!env.ok) consistent = false;
  }
  return { ok: consistent, results: envResults, method: 'metapopulation_compare_environments' };
}

const COMBINERS = Object.freeze({
  Trinity: combineTrinity,
  ATeam: combineATeam,
  Biocenose: combineBiocenose,
  Rhizome: combineRhizome,
  Syncytium: combineSyncytium,
  Holobionte: combineHolobionte,
  Biome: combineBiome,
  Metapopulation: combineMetapopulation
});

function runTopology(topologyId, workerCount, corpus) {
  const shards = distributeCorpus(corpus, workerCount);
  const results = shards.map((shard) => runSingleShard(shard));
  const combiner = COMBINERS[topologyId];
  if (!combiner) throw new Error(`Unknown topology: ${topologyId}`);
  const combined = combiner(results);
  return {
    kind: topologyId,
    workerCount,
    results,
    combined,
    receipts: collectReceipts({ results }),
    budget: BUDGET,
    usage: CYBERCORP_USAGE[topologyId]
  };
}

function runSingleAgent(corpus) {
  const results = runSingleShard(corpus);
  return {
    kind: 'single_agent',
    workerCount: 1,
    results: [results],
    combined: { ok: results.every((r) => r.ok), results, method: 'single_agent_deterministic' },
    receipts: collectReceipts({ results: [results] }),
    budget: BUDGET
  };
}

function retainSimplestArchitecture(topologyResult, singleAgentResult) {
  const topologyReliability = reliabilityOf(topologyResult);
  const singleReliability = reliabilityOf(singleAgentResult);
  if (topologyReliability < singleReliability) {
    return { architecture: 'direct', reason: 'multi_agent_less_reliable', singleReliability, topologyReliability };
  }
  return {
    architecture: topologyResult.kind,
    reason: 'multi_agent_sufficient',
    singleReliability,
    topologyReliability
  };
}

function simulateWorkerLoss(topologyResult, workerIndex) {
  const results = [];
  for (let i = 0; i < topologyResult.results.length; i += 1) {
    if (i === workerIndex) results.push([]);
    else results.push(topologyResult.results[i]);
  }
  return { ...topologyResult, results, receipts: collectReceipts({ results }) };
}

function simulateModelFailure(corpus, failIndex) {
  const failing = [];
  for (let i = 0; i < corpus.length; i += 1) {
    if (i === failIndex) failing.push({ item: corpus[i], output: null, receipt: null, ok: false, error: 'MODEL_FAILURE' });
    else {
      try {
        const out = runProcedure({
          version: 1,
          methodId: 'subset_sum',
          parameters: { values: corpus[i].values, target: corpus[i].target }
        });
        const receipt = { receiptId: out.receipt.id, nodeId: 'worker', methodId: out.receipt.methodId, result: out.receipt.result };
        failing.push({ item: corpus[i], output: out.output, receipt, ok: outputsMatch(out.output, corpus[i].expected) });
      } catch (error) {
        failing.push({ item: corpus[i], output: null, receipt: null, ok: false, error: error.message });
      }
    }
  }
  return failing;
}

function detectDisagreement(resultA, resultB) {
  return JSON.stringify(resultA.combined) !== JSON.stringify(resultB.combined);
}

function detectStateConflict(stateA, stateB) {
  const keysA = Object.keys(stateA || {});
  const keysB = Object.keys(stateB || {});
  for (const key of keysA) {
    if (keysB.includes(key)) return { conflict: true, key };
  }
  return { conflict: false };
}

function testRecovery(failedResult, corpus) {
  const recovered = runTopology(failedResult.kind, Math.max(1, failedResult.workerCount - 1), corpus);
  return { recovered, receiptsPreserved: recovered.receipts.length > 0 };
}

function assertProvenancePreserved(receipts) {
  if (!Array.isArray(receipts) || receipts.length === 0) return false;
  for (const receipt of receipts) {
    if (!receipt || !receipt.receiptId || !receipt.nodeId) return false;
  }
  return true;
}

function assertNoPermissionEscalation(authority, boundary) {
  if (!Array.isArray(authority) || !Array.isArray(boundary)) return false;
  if (authority.includes('*')) return false;
  for (const a of authority) {
    if (!boundary.includes(a)) return false;
  }
  return true;
}

module.exports = {
  TOPOLOGY_LIST,
  CYBERCORP_USAGE,
  CORPUS,
  BUDGET,
  runSingleAgent,
  runTopology,
  retainSimplestArchitecture,
  simulateWorkerLoss,
  simulateModelFailure,
  detectDisagreement,
  detectStateConflict,
  testRecovery,
  assertProvenancePreserved,
  assertNoPermissionEscalation,
  reliabilityOf
};
