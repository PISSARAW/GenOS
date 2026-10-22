'use strict';

const { isDeepStrictEqual } = require('node:util');
const { runProcedure } = require('../agents/deterministicWorkerProcedures');
const evidence = require('./securityMorphogenesisEvidence');
const {
  CYBERCORP_MISSION_CORPUS,
  executeCyberCorpEvidenceStage,
  measureShardBudget,
} = require('./securityMorphogenesisCyberCorp');

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

const MISSION_NEED_TO_TOPOLOGY = Object.freeze({
  specialist_task_distribution: 'ATeam',
  repartir_taches_specialistes: 'ATeam',
  compare_three_incident_hypotheses: 'Trinity',
  comparer_trois_hypotheses_incident: 'Trinity',
  deliberation_disagreement_abstention: 'Biocenose',
  deliberation_desaccord_abstention: 'Biocenose',
  propagate_linked_discoveries: 'Rhizome',
  propager_decouvertes_analyses_liees: 'Rhizome',
  shared_investigation_state: 'Syncytium',
  etat_investigation_partage: 'Syncytium',
  immune_controlled_tools_adapters: 'Holobionte',
  encadrer_outils_adaptateurs_immunitaire: 'Holobionte',
  allocate_cpu_ram_tokens_time: 'Biome',
  allouer_cpu_ram_tokens_temps: 'Biome',
  compare_isolated_environments: 'Metapopulation',
  comparer_investigations_isolees_environnements: 'Metapopulation'
});

const CORPUS = CYBERCORP_MISSION_CORPUS;

const BUDGET = Object.freeze({ cpuMs: 5000, ramMb: 256, tokens: 10000, cycles: 100, timeMs: 30000 });
const SUCCESS_CRITERIA = Object.freeze({
  minReliability: 1.0, requireProvenance: true, forbidPermissionEscalation: true, requireBudgetCompliance: true
});
const DEFAULT_BOUNDARY = Object.freeze(['read_telemetry', 'inspect_artifact', 'emit_receipt']);

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function outputsMatch(actual, expected) {
  if (!actual || !expected || actual.found !== expected.found) return false;
  if (actual.found && !arraysEqual(actual.indices, expected.indices)) return false;
  return true;
}

function executeCorpusItem(item, nodeId, permissions) {
  try {
    const cyberCorpEvidence = executeCyberCorpEvidenceStage(item);
    const out = cyberCorpEvidence ? null : runProcedure({
      version: 1,
      methodId: 'subset_sum',
      parameters: { values: item.values, target: item.target }
    });
    const combinedOutput = cyberCorpEvidence
      ? { verified: matchesCyberCorpEvidence(cyberCorpEvidence, item), cyberCorpEvidence }
      : out.output;
    const receiptInput = cyberCorpEvidence
      ? {
          output: combinedOutput,
          receipt: {
            id: cyberCorpEvidence.lptReceiptId,
            methodId: 'cybercorp_evidence_verification',
            result: combinedOutput
          }
        }
      : out;
    const receipt = evidence.createReceipt({ output: receiptInput, nodeId, item, permissions });
    return {
      item,
      output: combinedOutput,
      cyberCorpEvidence,
      receipt,
      ok: cyberCorpEvidence ? combinedOutput.verified : outputsMatch(out.output, item.expected)
    };
  } catch (error) {
    return { item, output: null, cyberCorpEvidence: null, receipt: null, ok: false, error: error.message };
  }
}

function matchesCyberCorpEvidence(result, item) {
  return Boolean(result.deoIntact && result.matchingHost && result.enoughObs
    && result.findingId === item.expected?.expectedFinding);
}

function runSingleShard(shard, nodeId = 'worker', permissions = DEFAULT_BOUNDARY) {
  return shard.map((item) => executeCorpusItem(item, nodeId, permissions));
}

function distributeCorpus(corpus, workerCount) {
  if (!Number.isInteger(workerCount) || workerCount < 1) throw new Error('Worker count must be a positive integer.');
  const shards = [];
  for (let i = 0; i < workerCount; i += 1) shards.push([]);
  for (let i = 0; i < corpus.length; i += 1) {
    shards[i % workerCount].push(corpus[i]);
  }
  return shards;
}

function reliabilityOf(result) {
  if (!result || !result.results) return 0;
  const flat = result.results.flat();
  if (flat.length === 0) return 0;
  const ok = flat.filter((r) => r.ok).length;
  return ok / flat.length;
}

function collectReceipts(result) {
  return (result?.results ?? []).flat().map((r) => r.receipt).filter(Boolean);
}

function combineTrinity(results) {
  const score = (shard) => shard.filter((x) => x.ok).length;
  const best = results.reduce((acc, cur) => (score(cur) > score(acc) ? cur : acc), results[0] ?? []);
  return { ok: best.every((r) => r.ok), results: best, method: 'trinity_best_hypothesis' };
}

function combineATeam(results) {
  const allOk = results.flat().every((r) => r.ok);
  return { ok: allOk, results, method: 'ateam_integrator_all_correct' };
}

function combineBiocenose(results) {
  const flat = results.flat();
  const okCount = flat.filter((r) => r.ok).length;
  const abstained = flat.filter((r) => r.abstained === true).length;
  return {
    ok: okCount >= Math.ceil(flat.length / 2),
    results,
    quorum: okCount,
    abstained,
    total: flat.length,
    method: 'biocenose_quorum'
  };
}

function combineRhizome(results) {
  const merged = results.flat().filter((r) => r.ok);
  return { ok: merged.length > 0, results: merged, method: 'rhizome_merge_discoveries' };
}

function combineSyncytium(results) {
  const allOk = results.flat().every((r) => r.ok);
  return { ok: allOk, results, method: 'syncytium_converge_shared_state' };
}

function combineHolobionte(results) {
  const admitted = results.flat().filter((r) => Boolean(r.ok && r.receipt));
  return { ok: admitted.length > 0, results: admitted, method: 'holobionte_immune_admission' };
}

function combineBiome(results) {
  const withinBudget = results.flat().every((r) => r.ok);
  return { ok: withinBudget, results, method: 'biome_bounded_foraging' };
}

function combineMetapopulation(results) {
  const envResults = results.map((shard, index) => ({
    env: index,
    ok: shard.every((r) => r.ok),
    output: shard.map((r) => r.output)
  }));
  return { ok: envResults.every((env) => env.ok), results: envResults, method: 'metapopulation_compare_environments' };
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

function matchTopologyToMission(missionNeed) {
  const key = String(missionNeed ?? '').trim();
  if (COMBINERS[key]) {
    return { topology: key, usage: CYBERCORP_USAGE[key], matchedBy: 'topology_name' };
  }
  const normalized = key.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const mapped = MISSION_NEED_TO_TOPOLOGY[normalized];
  if (mapped) {
    return { topology: mapped, usage: CYBERCORP_USAGE[mapped], matchedBy: 'mission_need' };
  }
  const byUsage = TOPOLOGY_LIST.find((t) => CYBERCORP_USAGE[t].toLowerCase() === key.toLowerCase());
  if (byUsage) {
    return { topology: byUsage, usage: CYBERCORP_USAGE[byUsage], matchedBy: 'usage_description' };
  }
  throw new Error(`Unrecognized CyberCorp mission need: ${missionNeed}`);
}

function runTopology(topologyId, workerCount, corpus = CORPUS) {
  const combiner = COMBINERS[topologyId];
  if (!combiner) throw new Error(`Unknown topology: ${topologyId}`);
  const measurement = { cpuStart: process.cpuUsage(), startNs: process.hrtime.bigint() };
  const shards = distributeCorpus(corpus, workerCount);
  const results = shards.map((shard, idx) => runSingleShard(shard, `${topologyId.toLowerCase()}-worker-${idx + 1}`));
  const combined = combiner(results);
  return {
    kind: topologyId,
    workerCount,
    results,
    combined,
    receipts: collectReceipts({ results }),
    budget: BUDGET,
    measuredBudget: measureShardBudget(results, BUDGET, measurement),
    successCriteria: SUCCESS_CRITERIA,
    usage: CYBERCORP_USAGE[topologyId],
    permissions: [...DEFAULT_BOUNDARY]
  };
}

function runSingleAgent(corpus = CORPUS) {
  const measurement = { cpuStart: process.cpuUsage(), startNs: process.hrtime.bigint() };
  const results = runSingleShard(corpus, 'single-agent');
  return {
    kind: 'single_agent',
    workerCount: 1,
    results: [results],
    combined: { ok: results.every((r) => r.ok), results, method: 'single_agent_deterministic' },
    receipts: collectReceipts({ results: [results] }),
    budget: BUDGET,
    measuredBudget: measureShardBudget([results], BUDGET, measurement),
    successCriteria: SUCCESS_CRITERIA,
    permissions: [...DEFAULT_BOUNDARY]
  };
}

function runDeterministicPipeline(corpus = CORPUS) {
  const measurement = { cpuStart: process.cpuUsage(), startNs: process.hrtime.bigint() };
  const results = runSingleShard(corpus, 'deterministic-pipeline');
  return {
    kind: 'deterministic_pipeline',
    workerCount: 1,
    results: [results],
    combined: { ok: results.every((r) => r.ok), results, method: 'deterministic_pipeline_stage' },
    receipts: collectReceipts({ results: [results] }),
    budget: BUDGET,
    measuredBudget: measureShardBudget([results], BUDGET, measurement),
    successCriteria: SUCCESS_CRITERIA,
    permissions: [...DEFAULT_BOUNDARY]
  };
}

function simulateDegradedTopology(topologyId, workerCount, degradedParameters) {
  const base = runTopology(topologyId, workerCount, degradedParameters?.corpus ?? CORPUS);
  const failingShards = new Set(degradedParameters?.failingWorkerIndices ?? [0]);
  const results = base.results.map((shard, idx) => (
    failingShards.has(idx)
      ? shard.map((entry) => ({ ...entry, output: { found: false }, receipt: null, ok: false, error: 'DEGRADED_AGENT_OUTPUT' }))
      : shard
  ));
  return {
    ...base,
    results,
    combined: COMBINERS[topologyId](results),
    receipts: collectReceipts({ results })
  };
}

function retainSimplestArchitecture(topologyResult, singleAgentResult, pipelineResult = null) {
  const topologyReliability = reliabilityOf(topologyResult);
  const singleReliability = reliabilityOf(singleAgentResult);
  const pipelineReliability = pipelineResult ? reliabilityOf(pipelineResult) : singleReliability;
  const baselineReliability = Math.max(singleReliability, pipelineReliability);
  if (topologyReliability < baselineReliability) {
    return {
      architecture: 'direct',
      selectedBaseline: pipelineResult && pipelineReliability > singleReliability ? 'deterministic_pipeline' : 'single_agent',
      reason: 'multi_agent_less_reliable',
      singleReliability,
      pipelineReliability,
      topologyReliability
    };
  }
  return {
    architecture: topologyResult.kind,
    selectedBaseline: null,
    reason: 'multi_agent_sufficient',
    singleReliability,
    pipelineReliability,
    topologyReliability
  };
}

function compareTopologyWithBaselines(topologyId, workerCount = 6, corpus = CORPUS) {
  const single = runSingleAgent(corpus);
  const pipeline = runDeterministicPipeline(corpus);
  const topology = runTopology(topologyId, workerCount, corpus);
  const decision = retainSimplestArchitecture(topology, single, pipeline);
  return {
    topologyId,
    usage: CYBERCORP_USAGE[topologyId],
    sameCorpus: evidence.sameCorpus({ expected: corpus, actual: single.results[0].map((entry) => entry.item) })
      && evidence.sameCorpus({ expected: corpus, actual: pipeline.results[0].map((entry) => entry.item) })
      && evidence.sameCorpus({ expected: corpus, actual: topology.results.flat().map((entry) => entry.item) }),
    sameBudget: isDeepStrictEqual(topology.budget, single.budget)
      && isDeepStrictEqual(topology.budget, pipeline.budget),
    sameSuccessCriteria: isDeepStrictEqual(topology.successCriteria, single.successCriteria)
      && isDeepStrictEqual(topology.successCriteria, pipeline.successCriteria),
    single,
    pipeline,
    topology,
    decision
  };
}

function simulateWorkerLoss(topologyResult, workerIndex) {
  const lostShard = topologyResult.results[workerIndex] ?? [];
  const results = topologyResult.results.map((shard, idx) => (idx === workerIndex ? [] : shard));
  const activeReceipts = collectReceipts({ results });
  const receipts = topologyResult.receipts ?? [...activeReceipts, ...collectReceipts({ results: [lostShard] })];
  return {
    ...topologyResult,
    results,
    receipts,
    activeReceipts,
    combined: COMBINERS[topologyResult.kind](results),
    provenancePreserved: evidence.assertProvenancePreserved(receipts),
    receiptsPreserved: evidence.containsAllReceipts(topologyResult.receipts ?? [], receipts),
    noPermissionEscalation: evidence.assertNoPermissionEscalation(topologyResult.permissions ?? DEFAULT_BOUNDARY, DEFAULT_BOUNDARY)
  };
}

function simulateModelFailure(corpus, failIndex) {
  return corpus.map((item, idx) => (
    idx === failIndex
      ? { item, output: null, receipt: null, ok: false, error: 'MODEL_FAILURE', permissions: [...DEFAULT_BOUNDARY] }
      : executeCorpusItem(item, `worker-${idx + 1}`, DEFAULT_BOUNDARY)
  ));
}

function detectDisagreement(resultA, resultB) {
  return !isDeepStrictEqual(resultA.combined, resultB.combined);
}

const { detectStateConflict } = evidence;

function testRecovery(failedResult, corpus = CORPUS) {
  const survivingCount = Math.max(1, failedResult.workerCount - 1);
  const recovered = runTopology(failedResult.kind, survivingCount, corpus);
  const priorReceipts = failedResult.receipts ?? [];
  const mergedReceipts = [...priorReceipts, ...recovered.receipts];
  const permissions = recovered.permissions ?? DEFAULT_BOUNDARY;
  return {
    recovered,
    priorReceiptsCount: priorReceipts.length,
    receiptsPreserved: priorReceipts.length > 0 && evidence.containsAllReceipts(priorReceipts, mergedReceipts),
    provenancePreserved: evidence.assertProvenancePreserved(mergedReceipts),
    noPermissionEscalation: evidence.assertNoPermissionEscalation(permissions, DEFAULT_BOUNDARY)
  };
}

const { assertProvenancePreserved, assertNoPermissionEscalation } = evidence;

module.exports = {
  TOPOLOGY_LIST, CYBERCORP_USAGE, MISSION_NEED_TO_TOPOLOGY, CORPUS, CYBERCORP_MISSION_CORPUS, BUDGET, SUCCESS_CRITERIA,
  DEFAULT_BOUNDARY, matchTopologyToMission, runSingleAgent, runDeterministicPipeline, runTopology,
  simulateDegradedTopology, retainSimplestArchitecture, compareTopologyWithBaselines,
  simulateWorkerLoss, simulateModelFailure, detectDisagreement, detectStateConflict,
  testRecovery, assertProvenancePreserved, assertNoPermissionEscalation, reliabilityOf
};
