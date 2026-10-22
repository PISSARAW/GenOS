'use strict';

const evidenceOrgan = require('../digitalEvidenceOrgan');

function evidenceReferences(dossier, observation) {
  const collected = dossier?.observations?.map((item) => item.observationId) ?? [];
  return [...new Set([...(observation.evidenceRefs ?? []), ...collected])];
}

async function collectEvidence(windowSpec) {
  const artifacts = windowSpec.evidenceArtifacts;
  if (!Array.isArray(artifacts) || artifacts.length === 0) return null;
  return evidenceOrgan.runDigitalEvidenceOrgan(
    { artifacts },
    { trustPolicy: windowSpec.trustPolicy }
  );
}

async function investigate(adapter, context, observation) {
  if (!adapter || typeof adapter.investigate !== 'function') return null;
  const proposed = await adapter.investigate({
    windowId: context.windowId,
    observation,
    evidence: context.evidence,
    evidenceRefs: observation.evidenceRefs
  });
  if (!proposed || proposed.status !== 'candidate') return null;
  return proposed;
}

function hasIndependentReceipt(result, candidate) {
  return result?.status === 'verified' && Boolean(result.receipt) && result.independent === true
    && Boolean(candidate.producerId) && Boolean(result.verifierId)
    && result.verifierId !== candidate.producerId;
}

function coversEvidence(result, references) {
  return references.every((reference) => (result.evidenceRefs ?? []).includes(reference));
}

async function verifyInvestigation(adapter, context, candidate) {
  if (!candidate || !adapter || typeof adapter.verify !== 'function') return null;
  const result = await adapter.verify({ candidate, windowId: context.windowId });
  if (!hasIndependentReceipt(result, candidate)) return null;
  const requiredRefs = context.observation.evidenceRefs ?? [];
  if (!coversEvidence(result, requiredRefs)) return null;
  return result;
}

async function updateSecurityWorld(perception, input) {
  await perception.updateWorld(input.db, input.tenant, {
    entity: { id: input.observation.subject, type: input.entityType || 'security-subject',
      attributes: { lastSignal: input.observation.signal, classification: input.observed.detection.classification } }
  });
}

async function processInvestigation(perception, context) {
  const candidate = await investigate(context.investigator, context, context.observation);
  const result = await verifyInvestigation(context.verifier, context, candidate);
  if (!result) return { candidate: null, verification: null };
  await perception.recordIncident(context.db, context.tenant, {
    incidentId: `incident-${context.windowId}`,
    disposition: result.disposition || 'verified-investigation',
    cause: result.summary || 'Investigation candidate independently verified.',
    evidenceRefs: context.observation.evidenceRefs
  });
  return { candidate, verification: result };
}

async function recordCalibration(perception, context, observed) {
  if (typeof context.calibrationCorrect !== 'boolean') return;
  await perception.recordCalibrationOutcome(context.db, context.tenant, {
    classification: observed.detection.classification,
    correct: context.calibrationCorrect
  });
}

function makeWindowResult(windowId, details, shouldInvestigate) {
  const { dossier, observed, candidate, verification } = details;
  return Object.freeze({
    windowId,
    collection: {
      evidenceOrganUsed: Boolean(dossier),
      artifactCount: dossier?.ingestedArtifacts?.length ?? 0,
      observationCount: dossier?.observations?.length ?? 1,
      extractionFidelity: dossier?.extractionFidelity ?? null
    },
    detection: observed.detection,
    decision: observed.decision,
    alert: observed.alert,
    duplicateAlert: observed.duplicateAlert,
    investigation: candidate,
    verification: verification ? verification.receipt : null,
    report: verification?.report ?? null,
    triggered: Boolean(verification),
    decisionOutcome: verification
      ? (verification.disposition || 'verified-investigation')
      : shouldInvestigate ? 'investigation-unavailable-or-unverified' : 'no-investigation-scheduled'
  });
}

async function runImmuneSurveillanceWindow(perception, context, windowSpec) {
  const windowId = windowSpec.windowId || `window-${Date.now()}`;
  const dossier = await collectEvidence(windowSpec);
  const observation = { ...windowSpec.observation,
    evidenceRefs: evidenceReferences(dossier, windowSpec.observation ?? {}) };
  const observed = await perception.observe(context.db, context.tenant, observation);
  const session = { ...windowSpec, ...context, windowId, observation, evidence: dossier };
  await updateSecurityWorld(perception, { ...session, observed });
  const shouldInvestigate = ['investigate', 'escalate'].includes(observed.decision.action);
  const investigation = shouldInvestigate
    ? await processInvestigation(perception, session)
    : { candidate: null, verification: null };
  await recordCalibration(perception, session, observed);
  return makeWindowResult(windowId, { dossier, observed, ...investigation }, shouldInvestigate);
}

async function registerSensors(perception, context, sensors) {
  for (const sensor of sensors) {
    await perception.registerSensor(context.db, context.tenant, {
      sensorId: sensor.sensorId ?? sensor.id,
      kind: sensor.kind ?? 'network',
      quality: sensor.quality ?? 0.9,
      permissions: sensor.permissions ?? ['security:observe']
    });
  }
}

async function runWindows(perception, context, campaignSpec) {
  const windows = [];
  for (const spec of campaignSpec.windows ?? []) {
    windows.push(await runImmuneSurveillanceWindow(perception, context, {
      ...spec,
      investigator: spec.investigator ?? campaignSpec.investigator,
      verifier: spec.verifier ?? campaignSpec.verifier
    }));
  }
  return windows;
}

async function runImmuneSurveillanceCampaign(perception, context, campaignSpec) {
  await registerSensors(perception, context, campaignSpec.sensors ?? []);
  const windows = await runWindows(perception, context, campaignSpec);
  const state = await perception.getState(context.db, context.tenant);
  return Object.freeze({
    windowCount: windows.length,
    verifiedInvestigationCount: windows.filter((item) => item.triggered).length,
    verifiedReportCount: windows.filter((item) => item.report?.verified === true).length,
    abstainedWindowCount: windows.filter((item) => item.detection.classification === 'indeterminate').length,
    benignWindowCount: windows.filter((item) => item.decision.action === 'no-change').length,
    persistedInvestigationCount: state.investigations.length,
    persistedIncidentCount: Object.keys(state.incidents || {}).length,
    windows: Object.freeze(windows)
  });
}

module.exports = {
  runImmuneSurveillanceWindow,
  runImmuneSurveillanceCampaign
};
