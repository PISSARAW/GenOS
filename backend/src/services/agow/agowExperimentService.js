'use strict';

const { createHash, randomUUID } = require('node:crypto');
const persistence = require('./agowStatePersistenceService');

const SCOPE = 'agow_experiment_receipts';
const CONDITIONS = Object.freeze(['full', 'workspace_ablated', 'broadcast_ablated', 'memory_ablated',
  'self_ablated', 'interoception_ablated', 'regret_ablated', 'allostasis_ablated',
  'counterfactual_ablated', 'active_query_ablated', 'fast_plasticity_ablated',
  'direct_pathway_ablated', 'proceduralization_ablated', 'decompilation_ablated',
  'distributed_market_ablated', 'provenance_ablated']);

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validateRequired(options) {
  if (options.agentId && options.snapshot && options.environment && Array.isArray(options.cases) && options.cases.length) return;
  throw new TypeError('AGOW experiment requires agentId, snapshot, environment and non-empty cases.');
}

function validateManifest(environment) {
  if (environment.dependencies && environment.model && environment.toolLease) return;
  throw new TypeError('AGOW experiment requires model, dependency and tool lease manifests.');
}

function validateProtocol(protocol) {
  if (protocol?.hypothesis && protocol?.primaryMetric && protocol?.analysisPlan) return;
  throw new TypeError('AGOW experiment requires a preregistered hypothesis, primary metric and analysis plan.');
}

function validateCases(cases) {
  if (!cases.some((item) => !item.caseId || item.input === undefined)) return;
  throw new TypeError('Each holdout case requires caseId and input.');
}

function validateConditions(conditions) {
  if (Array.isArray(conditions) && conditions.length > 0 && conditions.every((item) => typeof item === 'string')
    && new Set(conditions).size === conditions.length) return;
  throw new TypeError('AGOW experiment conditions must be a non-empty unique list.');
}

function validate(options) {
  validateRequired(options);
  if (typeof options.execute !== 'function') throw new TypeError('AGOW experiment requires an execution adapter.');
  validateManifest(options.environment);
  validateProtocol(options.protocol);
  if (options.holdout !== true) throw new TypeError('AGOW experiment corpus must be explicitly marked holdout.');
  validateCases(options.cases);
  validateConditions(options.conditions || CONDITIONS);
}

function seededOrder(items, seed) {
  let state = Number.parseInt(digest(seed).slice(0, 8), 16) || 1;
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (1664525 * state + 1013904223) >>> 0;
    const target = state % (index + 1);
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function summarize(results) {
  const groups = {};
  for (const result of results) {
    const group = groups[result.condition] || { runs: 0, successes: 0, errors: 0, cost: 0, latencyMs: 0 };
    group.runs += 1;
    group.successes += result.outcome?.success === true ? 1 : 0;
    group.errors += Math.max(0, Number(result.outcome?.errors) || 0);
    group.cost += Math.max(0, Number(result.outcome?.cost) || 0);
    group.latencyMs += Math.max(0, Number(result.outcome?.latencyMs) || 0);
    groups[result.condition] = group;
  }
  return Object.fromEntries(Object.entries(groups).map(([key, value]) => [key, {
    ...value, successRate: value.successes / value.runs, meanErrors: value.errors / value.runs,
    meanCost: value.cost / value.runs, meanLatencyMs: value.latencyMs / value.runs
  }]));
}

async function executeCase(options) {
  const { item, condition, seed } = options;
  const snapshot = structuredClone(options.snapshot);
  const initialSnapshotHash = digest(snapshot);
  const outcome = await options.execute({ caseId: item.caseId, input: structuredClone(item.input), condition, seed, snapshot });
  if (!outcome || typeof outcome !== 'object' || typeof outcome.success !== 'boolean') {
    throw new TypeError(`Experiment adapter returned an invalid outcome for ${item.caseId}/${condition}.`);
  }
  return { caseId: item.caseId, condition, seed, outcome, initialSnapshotHash };
}

async function persist(options, receipt) {
  const loaded = await persistence.load({ scope: SCOPE, agentId: options.agentId, db: options.db });
  const receipts = Array.isArray(loaded.state.receipts) ? loaded.state.receipts : [];
  receipts.push(receipt);
  await persistence.save({ scope: SCOPE, agentId: options.agentId, db: loaded.db,
    state: { receipts: receipts.slice(-1000) }, version: receipts.length });
}

async function run(options) {
  validate(options);
  const seed = String(options.seed || randomUUID());
  const environmentHash = digest(options.environment);
  const corpusHash = digest(options.cases.map(({ caseId, input }) => ({ caseId, input })));
  const snapshotHash = digest(options.snapshot);
  const protocolHash = digest(options.protocol);
  const results = [];
  for (const item of options.cases) {
    for (const condition of seededOrder(options.conditions || CONDITIONS, `${seed}:${item.caseId}`)) {
      results.push(await executeCase({ ...options, item, condition, seed: `${seed}:${item.caseId}` }));
    }
  }
  const receipt = {
    experimentId: randomUUID(), kind: options.kind || 'agow_ablation', createdAt: Date.now(), seed,
    holdout: true, caseCount: options.cases.length, conditions: [...new Set(results.map((entry) => entry.condition))],
    snapshotHash, environmentHash, corpusHash, protocol: options.protocol, protocolHash, manifest: options.environment,
    results, summary: summarize(results), promotionDecision: null,
    evidenceStatus: 'replication_required', caveat: 'One sealed holdout run is descriptive. No causal promotion or significance claim is emitted.'
  };
  await persist(options, receipt);
  return receipt;
}

async function runControlledMediation(options) {
  return run({ ...options, kind: 'agow_controlled_mediation', conditions: ['broadcast_delivered', 'broadcast_suppressed'] });
}

async function runReplicationCampaign(options) {
  const replications = options.replications;
  if (!Array.isArray(replications) || replications.length < 3) throw new TypeError('AGOW holdout replication requires at least three independent runs.');
  if (!compatibleReplications(replications)) {
    throw new TypeError('Replications require one protocol and environment, disjoint holdout cases and distinct explicit seeds.');
  }
  const receipts = [];
  for (const replication of replications) receipts.push(await run({ ...replication, kind: 'agow_holdout_replication' }));
  return { campaignId: randomUUID(), replications: receipts.map((item) => item.experimentId), count: receipts.length,
    environmentHash: receipts[0].environmentHash, corpusHashes: receipts.map((item) => item.corpusHash),
    status: 'descriptive_replication_complete', promotionDecision: null };
}

function compatibleReplications(replications) {
  return sameValue(replications, (entry) => digest(entry.environment))
    && sameValue(replications, (entry) => digest(entry.protocol))
    && sameValue(replications, (entry) => digest(entry.snapshot))
    && sameValue(replications, (entry) => digest([...(entry.conditions || CONDITIONS)].sort()))
    && uniqueValue(replications, (entry) => digest(entry.cases.map(({ caseId, input }) => ({ caseId, input }))))
    && uniqueValue(replications, (entry) => String(entry.seed || '')) && disjointCorpora(replications);
}

function sameValue(items, select) {
  return new Set(items.map(select)).size === 1;
}

function uniqueValue(items, select) {
  return new Set(items.map(select)).size === items.length;
}

function disjointCorpora(replications) {
  const seen = new Set();
  for (const runOptions of replications) {
    for (const item of runOptions.cases || []) {
      const inputHash = digest(item.input);
      if (seen.has(item.caseId) || seen.has(inputHash)) return false;
      seen.add(item.caseId);
      seen.add(inputHash);
    }
  }
  return true;
}

async function list(options) {
  const loaded = await persistence.load({ scope: SCOPE, agentId: options.agentId, db: options.db });
  return Array.isArray(loaded.state.receipts) ? loaded.state.receipts : [];
}

module.exports = { CONDITIONS, run, runControlledMediation, runReplicationCampaign, list, summarize };
