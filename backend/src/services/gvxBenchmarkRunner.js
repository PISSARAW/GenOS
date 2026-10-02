'use strict';

const protocol = require('./gvxBenchmarkProtocol');
const verifier = require('./gvxVerifierRegistry');

function campaignJobs(manifest) {
  const jobs = [];
  for (const variant of manifest.variants) for (const cohort of manifest.cohorts) {
    for (const split of ['train', 'held_out']) for (let index = 0; index < manifest.requiredReplicates; index += 1) {
      jobs.push({ variant, cohort, split, seed: index + 1 });
    }
  }
  return jobs;
}

function validateManifest(manifest) {
  const valid = manifest?.schema === 'genos.gvx.benchmark/v1'
    && protocol.validateDesign(manifest).length === 0
    && manifest.datasets.trainHash !== manifest.datasets.heldOutHash;
  const expectedRuns = Math.max(manifest?.minSeeds || 0,
    protocol.requiredReplicates(manifest?.powerPlan || {}));
  if (!valid || !manifest.benchmarkId || !Number.isFinite(Date.parse(manifest.preregisteredAt))
      || manifest.requiredReplicates !== expectedRuns) {
    throw campaignError('GVX_CAMPAIGN_PREREGISTERED_MANIFEST_REQUIRED');
  }
}

function validateAdapters(options) {
  if (!options?.manifest || !options.runners || typeof options.datasetReader !== 'function'
      || typeof options.artifactWriter !== 'function' || typeof options.artifactReader !== 'function') {
    throw campaignError('GVX_CAMPAIGN_ADAPTERS_REQUIRED');
  }
  validateManifest(options.manifest);
  verifier.validateRegistry(options.verifierRegistry);
  if (!options.verifierRegistry.remote) throw campaignError('GVX_REMOTE_VERIFIER_REQUIRED');
}

function campaignError(code) { return Object.assign(new Error(code), { code }); }

async function readDataset(options, job) {
  const datasetHash = job.split === 'train' ? options.manifest.datasets.trainHash : options.manifest.datasets.heldOutHash;
  const bytes = await options.datasetReader({ datasetHash, split: job.split, cohort: job.cohort });
  if (!Buffer.isBuffer(bytes) || verifier.digest(bytes) !== datasetHash) throw campaignError('GVX_CAMPAIGN_DATASET_HASH_MISMATCH');
  return { datasetHash, bytes };
}

function validRunOutput(output, options, job) {
  return output && Number.isFinite(output.cost)
    && output.cost >= 0 && output.cost <= options.manifest.budgetPerRun
    && output.datasetHash === (job.split === 'train'
      ? options.manifest.datasets.trainHash : options.manifest.datasets.heldOutHash)
    && output.metrics && options.manifest.metrics.every((name) => Number.isFinite(output.metrics[name]));
}

function metricEvidence(output, metric) {
  return (output.evidence || []).find((item) => item.requirement === `gvx-benchmark-metric:${metric}`);
}

function matchesMetricDecision(receipt, options) {
  const decision = receipt?.signedReceipt?.businessDecision;
  const { job, datasetHash, output } = options;
  return receipt?.verified === true && decision?.metric === options.metric
    && decision.variant === job.variant && decision.cohort === job.cohort
    && decision.split === job.split && decision.seed === job.seed
    && decision.datasetHash === datasetHash && decision.value === output.metrics[options.metric]
    && JSON.stringify(decision.modelLock) === JSON.stringify(options.manifest.modelLock)
    && decision.toolsetHash === options.manifest.toolsetHash;
}

async function verifyRunMetrics(options) {
  const receipts = [];
  for (const metric of options.manifest.metrics) {
    const evidence = metricEvidence(options.output, metric);
    if (!evidence) throw campaignError(`GVX_CAMPAIGN_METRIC_EVIDENCE_MISSING:${metric}`);
    const receipt = await verifier.verifyEvidence({ registry: options.verifierRegistry,
      artifactReader: options.artifactReader, evidence, requirement: `gvx-benchmark-metric:${metric}` });
    if (!matchesMetricDecision(receipt, { ...options, metric })) {
      throw campaignError(`GVX_CAMPAIGN_METRIC_EVIDENCE_INVALID:${metric}`);
    }
    receipts.push(receipt.signedReceipt);
  }
  return receipts;
}

async function executeJob(options, job) {
  const dataset = await readDataset(options, job);
  const runner = options.runners[job.variant];
  if (typeof runner !== 'function') throw campaignError(`GVX_CAMPAIGN_RUNNER_MISSING:${job.variant}`);
  const output = await runner({ ...job, dataset: dataset.bytes, datasetHash: dataset.datasetHash,
    modelLock: options.manifest.modelLock, toolsetHash: options.manifest.toolsetHash,
    budget: options.manifest.budgetPerRun, signal: options.signal });
  if (!validRunOutput(output, options, job)) throw campaignError('GVX_CAMPAIGN_RUN_OUTPUT_INVALID');
  const evidenceReceipts = await verifyRunMetrics({ ...options, job, output, datasetHash: dataset.datasetHash });
  const record = { schema: 'genos.gvx.benchmark-run/v1', manifestId: options.manifest.benchmarkId,
    ...job, datasetHash: dataset.datasetHash, modelLock: options.manifest.modelLock,
    toolsetHash: options.manifest.toolsetHash, cost: output.cost, metrics: output.metrics, evidenceReceipts };
  const bytes = Buffer.from(JSON.stringify(record));
  const stored = await options.artifactWriter({ bytes, schema: record.schema, manifestId: record.manifestId, job });
  if (!stored?.artifactRef) throw campaignError('GVX_CAMPAIGN_RESULT_PERSISTENCE_INVALID');
  const saved = await options.artifactReader({ artifactRef: stored?.artifactRef });
  const artifactHash = verifier.digest(bytes);
  if (!Buffer.isBuffer(saved) || verifier.digest(saved) !== artifactHash) {
    throw campaignError('GVX_CAMPAIGN_RESULT_PERSISTENCE_INVALID');
  }
  return { ...job, datasetHash: dataset.datasetHash, cost: output.cost,
    metrics: output.metrics, artifactHash, artifactRef: stored.artifactRef };
}

function maxCampaignRuns(options) {
  const limit = Number(options.maxRuns ?? 10000);
  if (!Number.isInteger(limit) || limit < 1) throw campaignError('GVX_CAMPAIGN_RUN_LIMIT_INVALID');
  return limit;
}

async function persistCampaignSummary(options, result) {
  const bytes = Buffer.from(JSON.stringify({ schema: 'genos.gvx.benchmark-campaign/v1',
    manifest: result.manifest, runs: result.runs, summary: result.summary }));
  const stored = await options.artifactWriter({ bytes, schema: 'genos.gvx.benchmark-campaign/v1',
    manifestId: options.manifest.benchmarkId });
  if (!stored?.artifactRef) throw campaignError('GVX_CAMPAIGN_RESULT_PERSISTENCE_INVALID');
  const readback = await options.artifactReader({ artifactRef: stored.artifactRef });
  if (!Buffer.isBuffer(readback) || verifier.digest(readback) !== verifier.digest(bytes)) {
    throw campaignError('GVX_CAMPAIGN_RESULT_PERSISTENCE_INVALID');
  }
  return stored.artifactRef;
}

async function runCampaign(options) {
  validateAdapters(options);
  const jobs = campaignJobs(options.manifest);
  if (jobs.length > maxCampaignRuns(options)) throw campaignError('GVX_CAMPAIGN_RUN_LIMIT_EXCEEDED');
  const runs = [];
  for (const job of jobs) {
    if (options.signal?.aborted) throw campaignError('GVX_CAMPAIGN_ABORTED');
    runs.push(await executeJob(options, job));
  }
  const errors = protocol.validateRuns(options.manifest, runs);
  if (errors.length) throw Object.assign(campaignError('GVX_CAMPAIGN_INCOMPLETE'), { errors });
  const result = { status: 'measured', comparisonAuthority: 'none', manifest: options.manifest,
    runs, summary: protocol.scoreBenchmark(options.manifest, runs) };
  result.artifactRef = await persistCampaignSummary(options, result);
  return result;
}

module.exports = { campaignJobs, validateAdapters, runCampaign, validRunOutput,
  verifyRunMetrics, executeJob, maxCampaignRuns };
