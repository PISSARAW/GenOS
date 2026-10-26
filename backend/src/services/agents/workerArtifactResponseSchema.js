'use strict';

const { kindDefinition } = require('./workerKindService');

function referenceList(allowed) {
  return { type: 'array', minItems: 1, items: { type: 'string', minLength: 1,
    ...(allowed.length ? { enum: allowed } : {}) } };
}

function claimSchema(refs) {
  return object({ statement: { type: 'string', minLength: 1 }, evidence: refs }, ['statement', 'evidence']);
}

function object(properties, required) {
  return { type: 'object', properties, required, additionalProperties: true };
}

function artifactTextSchema() {
  return { type: 'string', minLength: 1,
    pattern: '(?:<ARTIFACT:\\s*[^>]+>[\\s\\S]+?</ARTIFACT>|\\[ARTIFACT:\\s*[^\\]]+\\][\\s\\S]+?\\[/ARTIFACT\\])' };
}

function dossierProperties(kind, refs, diagnosis) {
  const fields = {
    bounded_worker: ['scopeCompletion', object({ scopeRef: { type: 'string', minLength: 1 }, completedRefs: refs }, ['scopeRef', 'completedRefs'])],
    specialist: ['specialtyAssessment', object({ niche: { type: 'string', minLength: 1 }, inScope: { const: true }, evidence: refs }, ['niche', 'inScope', 'evidence'])],
    adaptive_worker: ['strategyTrace', { type: 'array', minItems: 1, items: object({ strategy: { type: 'string', minLength: 1 }, decision: { enum: ['retained', 'changed'] }, reason: { type: 'string', minLength: 1 }, evidence: refs }, ['strategy', 'decision', 'reason', 'evidence']) }],
    recovery_worker: ['recoveryReceipt', object({ action: { type: 'string', minLength: 1 }, restoredState: { type: 'string', minLength: 1 }, receiptId: { type: 'string', minLength: 1 }, evidence: refs }, ['action', 'restoredState', 'receiptId', 'evidence'])],
    liaison_worker: ['handoff', object({ sourceGroup: { type: 'string', minLength: 1 }, targetGroup: { type: 'string', minLength: 1 }, deliveredRefs: refs }, ['sourceGroup', 'targetGroup', 'deliveredRefs'])],
    resident_daemon: ['territoryReport', object({ territoryId: { type: 'string', minLength: 1 }, observedAt: { type: 'string', format: 'date-time' }, sourceRefs: refs }, ['territoryId', 'observedAt', 'sourceRefs'])],
    symbiotic_worker: ['hostContribution', object({ hostContractId: { type: 'string', minLength: 1 }, capability: { type: 'string', minLength: 1 }, contractCompliant: { const: true }, evidence: refs }, ['hostContractId', 'capability', 'contractCompliant', 'evidence'])],
    sub_orchestrator: ['childSummaries', { type: 'array', items: object({ childId: { type: 'string', minLength: 1 }, outcome: { enum: ['success', 'failed', 'blocked'] }, evidence: refs }, ['childId', 'outcome', 'evidence']) }]
  };
  const dossier = fields[kind] ? { [fields[kind][0]]: fields[kind][1] } : {};
  return diagnosis ? { ...dossier, ...diagnosticProperties(refs) } : dossier;
}

function verificationArtifact(kind, refs) {
  const content = {
    testedClaim: { type: 'string', minLength: 1 },
    verificationMethod: { type: 'string', minLength: 1 },
    verdict: { enum: ['accept', 'reject', 'unresolved'] },
    reproductionSteps: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
    evidence: refs,
    ...(kind === 'red_worker' ? { counterexamples: { type: 'array', items: object({
      claim: { type: 'string', minLength: 1 }, attack: { type: 'string', minLength: 1 },
      reproductionSteps: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } }, evidence: refs
    }, ['claim', 'attack', 'reproductionSteps', 'evidence']) } } : {})
  };
  const required = ['testedClaim', 'verificationMethod', 'verdict', 'reproductionSteps', 'evidence'];
  if (kind === 'red_worker') required.push('counterexamples');
  return object(content, required);
}

function diagnosticProperties(refs) {
  const row = object({
    assessment: { enum: ['plausible_unverified', 'weakened_unverified', 'unresolved'] },
    predictedSignals: { type: 'string', minLength: 1 },
    contradictoryObservations: { type: 'string', minLength: 1 },
    discriminatingMeasurement: { type: 'string', minLength: 1 },
    evidence: refs
  }, ['assessment', 'predictedSignals', 'contradictoryObservations', 'discriminatingMeasurement', 'evidence']);
  const matrix = object(Object.fromEntries([
    'coldStartOrJit', 'sleepingConnectionPool', 'coldApplicationCacheOrDns',
    'swapOrPageCache', 'autoscalingOrSleep', 'tlsSessionResumption'
  ].map((key) => [key, row])), [
    'coldStartOrJit', 'sleepingConnectionPool', 'coldApplicationCacheOrDns',
    'swapOrPageCache', 'autoscalingOrSleep', 'tlsSessionResumption'
  ]);
  matrix.additionalProperties = false;
  return { diagnosticMatrix: matrix,
    conditionalVerdict: { type: 'string', minLength: 1 },
    uncertainties: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } } };
}

function artifactSchema(input) {
  const { kind, artifactType, refs, diagnosis } = input;
  if (artifactType === 'dossier') {
    const details = dossierProperties(kind, refs, diagnosis);
    return object({ type: { const: 'dossier' }, content: object({ claims: { type: 'array', minItems: 1, items: claimSchema(refs) }, ...details },
      ['claims', ...Object.keys(details)]), provenance: object({ sourceRefs: refs }, ['sourceRefs']) }, ['type', 'content', 'provenance']);
  }
  if (artifactType === 'verification_report') {
    const content = verificationArtifact(kind, refs);
    if (diagnosis) { const details = diagnosticProperties(refs); Object.assign(content.properties, details); content.required.push(...Object.keys(details)); }
    return object({ type: { const: artifactType }, content,
      provenance: object({ sourceRefs: refs }, ['sourceRefs']) }, ['type', 'content', 'provenance']);
  }
  return object({ type: { const: artifactType }, content: { type: 'object' }, provenance: object({ sourceRefs: refs }, ['sourceRefs']) },
    ['type', 'content', 'provenance']);
}

function acceptanceEvaluationSchema(criteria, refs) {
  return { type: 'array', minItems: criteria.length, items: object({
    criterion: { type: 'string', enum: criteria },
    passed: { enum: [true, false, null] },
    localPassed: { type: 'boolean' },
    evidenceRefs: refs
  }, ['criterion', 'passed', 'evidenceRefs']) };
}

function handoffEvaluationSchema(handoffs, refs) {
  const ids = handoffs.map((handoff) => handoff.handoffId);
  const digests = handoffs.map((handoff) => handoff.digest);
  const versions = [...new Set(handoffs.map((handoff) => handoff.version))];
  return { type: 'array', minItems: handoffs.length, maxItems: handoffs.length, items: object({
    handoffId: { type: 'string', enum: ids },
    digest: { type: 'string', enum: digests },
    version: { type: 'integer', enum: versions },
    passed: { type: 'boolean' },
    evidenceRefs: refs
  }, ['handoffId', 'digest', 'version', 'passed', 'evidenceRefs']) };
}

function responseOptions(options) {
  if (typeof options !== 'object') return { diagnosis: options === true, missionCriteria: [], handoffs: [] };
  return { diagnosis: options.diagnosis === true,
    missionCriteria: Array.isArray(options.missionCriteria) ? options.missionCriteria : [],
    identityExperimentScenario: ['A', 'B', 'C'].includes(options.identityExperimentScenario)
      ? options.identityExperimentScenario : null,
    specialtyNiche: typeof options.specialtyNiche === 'string' ? options.specialtyNiche : null,
    handoffs: Array.isArray(options.handoffs)
      ? options.handoffs.filter((handoff) => handoff?.handoffId && handoff?.digest) : [] };
}

function identityExperimentResponseFormat(refs, specialtyNiche) {
  const assessment = dossierProperties('specialist', refs, false).specialtyAssessment;
  if (specialtyNiche) assessment.properties.niche.const = specialtyNiche;
  const schema = object({
    outcome: { enum: ['success', 'unresolved'] },
    claims: { type: 'array', items: claimSchema(refs) },
    uncertainties: { type: 'array', items: { type: 'string', minLength: 1 } },
    artifactText: artifactTextSchema(),
    specialtyAssessment: assessment
  }, ['outcome', 'claims', 'uncertainties', 'specialtyAssessment']);
  schema.allOf = [{
    if: { properties: { outcome: { const: 'success' } }, required: ['outcome'] },
    then: { required: ['artifactText'] }
  }];
  return { name: 'genos_identity_experiment_response', schema };
}

function attachMissionRequirements(target, opts, refs) {
  if (opts.missionCriteria.length) {
    target.properties.acceptanceEvaluations = acceptanceEvaluationSchema(opts.missionCriteria, refs);
    target.required.push('acceptanceEvaluations');
  }
  if (!opts.handoffs.length) return;
  target.properties.integrationConstraints = { type: 'array', minItems: 1,
    items: { type: 'string', minLength: 1 } };
  target.properties.handoffEvaluations = handoffEvaluationSchema(opts.handoffs, refs);
  target.required.push('integrationConstraints', 'handoffEvaluations');
}

function workerArtifactResponseFormat(kind, allowedEvidenceRefs = [], options = false) {
  const opts = responseOptions(options);
  const resolved = require('./workerKindService').resolveWorkerKind(kind);
  const artifactType = kindDefinition(resolved).artifact;
  const refs = referenceList(allowedEvidenceRefs);
  if (opts.identityExperimentScenario && resolved === 'specialist') {
    return identityExperimentResponseFormat(refs, opts.specialtyNiche);
  }
  const properties = {
    outcome: { enum: ['success', 'unresolved'] },
    claims: { type: 'array', items: claimSchema(refs) },
    uncertainties: { type: 'array', items: { type: 'string', minLength: 1 } },
    artifactText: artifactTextSchema()
  };
  const required = ['outcome', 'claims'];
  if (artifactType === 'dossier') {
    const details = dossierProperties(resolved, refs, opts.diagnosis);
    Object.assign(properties, details);
  } else {
    properties.workerArtifact = artifactSchema({ kind: resolved, artifactType, refs,
      diagnosis: opts.diagnosis });
  }
  attachMissionRequirements({ properties, required }, opts, refs);
  const schema = object(properties, required);
  const successRequired = artifactType === 'dossier'
    ? Object.keys(dossierProperties(resolved, refs, opts.diagnosis)) : ['workerArtifact'];
  successRequired.push('artifactText');
  schema.allOf = [{
    if: { properties: { outcome: { const: 'success' } }, required: ['outcome'] },
    then: { properties: { claims: { minItems: 1 }, artifactText: artifactTextSchema() }, required: successRequired },
    else: { properties: { claims: { maxItems: 0 }, uncertainties: { minItems: 1 } },
      required: ['uncertainties'] }
  }];
  return { name: 'genos_worker_artifact', schema };
}

module.exports = { workerArtifactResponseFormat };
