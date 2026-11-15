'use strict';

function missionAdapters(input, workerResults) {
  const executor = workerCapabilityExecutor(workerResults);
  return {
    executeCapability: input.executeCapability || executor,
    verifyCapability: input.verifyCapability || workerCapabilityVerifier(workerResults),
    trialCapabilityExecutor: input.trialCapabilityExecutor
      || (input.executeCapability ? undefined : executor)
  };
}

function workerCapabilityExecutor(results) {
  return async function executeFromWorkerReceipt() {
    const worker = results.find((item) => measuredCapability(item.evidenceReport));
    if (!worker) throw workerAdapterError('No worker result carries measured capability evidence.');
    const report = worker.evidenceReport;
    const measured = measuredCapability(report);
    return { result: report.workerArtifact.content, receiptId: worker.executionRunId,
      resourcesConsumed: measured.usage, contributionScore: measured.contributionScore,
      contractCompliant: measured.contractCompliant,
      unsafeBehavior: measured.unsafeBehavior, riskScore: measured.riskScore,
      benefitScore: measured.benefitScore, evidenceQuality: measured.evidenceQuality,
      costScore: measured.costScore,
      isolationProof: report.isolationProof || report.workerArtifact.provenance?.isolationProof };
  };
}

function workerCapabilityVerifier(results) {
  return async function verifyFromWorkerReceipt(invocation) {
    const producer = results.find((item) => measuredCapability(item.evidenceReport));
    const worker = results.find((item) => item.workerId !== producer?.workerId
      && verifiedResultHash(item.evidenceReport) === invocation.resultHash
      && evidenceRefs(item.evidenceReport).length > 0);
    if (!worker) throw workerAdapterError('No independent worker verification receipt is available.');
    return { status: 'VERIFIED', verifierId: worker.workerId,
      resultHash: invocation.resultHash, evidenceRefs: evidenceRefs(worker.evidenceReport) };
  };
}

function verifiedResultHash(report) {
  return report?.resultHash || report?.workerArtifact?.provenance?.resultHash
    || report?.workerArtifact?.content?.resultHash || null;
}

function measuredUsage(report) {
  const usage = report?.usage || report?.workerArtifact?.provenance?.usage;
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return null;
  const normalized = Object.fromEntries(Object.entries(usage)
    .filter(([, value]) => Number.isFinite(Number(value)) && Number(value) >= 0)
    .map(([key, value]) => [key, Number(value)]));
  return Object.keys(normalized).length ? normalized : null;
}

function measuredCapability(report) {
  const usage = measuredUsage(report);
  const metrics = report?.metrics || report?.workerArtifact?.provenance?.metrics;
  if (!usage || !metrics || typeof metrics !== 'object') return null;
  const contributionScore = Number(metrics.contributionScore);
  const riskScore = Number(metrics.riskScore);
  const benefitScore = Number(metrics.benefitScore);
  const evidenceQuality = Number(metrics.evidenceQuality);
  const costScore = Number(metrics.costScore);
  if ([contributionScore, riskScore, benefitScore, evidenceQuality, costScore]
    .some((value) => !Number.isFinite(value))
    || typeof metrics.contractCompliant !== 'boolean'
    || typeof metrics.unsafeBehavior !== 'boolean') return null;
  return { usage, contributionScore, riskScore, benefitScore, evidenceQuality, costScore,
    contractCompliant: metrics.contractCompliant,
    unsafeBehavior: metrics.unsafeBehavior };
}

function evidenceRefs(report) {
  const provenance = report?.workerArtifact?.provenance || {};
  const refs = provenance.evidenceRefs || provenance.sourceRefs || [];
  return refs.filter((item) => typeof item === 'string' && item.trim());
}

function contractBody(created, capability) {
  return {
    hostId: created.hostId, symbiontId: 'resident-mission', capabilitiesOffered: [capability],
    dependencyCeiling: 0.3, resourcesRequested: { tokens: 20 }, inputs: {}, outputs: {},
    authorityScope: { level: 'CAPABILITY', actions: [capability] }, toolLeases: [], dataAccess: [],
    privacyBoundary: {}, evidenceRequirements: [`${capability}-proof`], expectedBenefit: { quality: 'higher' },
    maxCost: { tokens: 20 }, immunePolicy: {}, adaptationPolicy: {},
    transmissionPolicy: 'NEVER_INHERIT', terminationConditions: ['mission-end']
  };
}

function workerAdapterError(message) {
  return Object.assign(new Error(message), { code: 'HOLOBIONT_WORKER_ADAPTER_REQUIRED' });
}

module.exports = { contractBody, evidenceRefs, measuredCapability, missionAdapters };
