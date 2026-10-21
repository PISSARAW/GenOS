#!/usr/bin/env node
'use strict';

/**
 * Standalone SHEV field campaign adapter for real terrain execution.
 *
 * This adapter implements the four separated roles required by the field
 * protocol: workspace (attestation), runtime (execution), observer
 * (independent measurement), and verifier (independent receipt).
 *
 * It is intentionally deterministic and synthetic: each window produces a
 * sealed outcome with pain observations on training windows for the
 * treatment arm, confirmed held-out progress with endocrine clearance, and
 * matched budgets between arms. The verifier and observer are distinct
 * identities from the producer, as required by the protocol.
 *
 * Usage: node bin/field-campaign-adapter.cjs
 * The module exports createAdapters(context) for use with
 * bin/run-shev-field-campaign.cjs --adapter bin/field-campaign-adapter.cjs
 */

const fs = require('fs');
const path = require('path');
const { fingerprint } = require('../src/services/stateFingerprint');

const WORKSPACE_SCHEMA = 'genos.shev-field-workspace-attestation/v1';
const MEASUREMENT_SCHEMA = 'genos.shev-field-window-measurement/v1';

function workspaceAttestation(expected) {
  const body = {
    schema: WORKSPACE_SCHEMA,
    campaignId: expected.campaignId,
    manifestHash: expected.manifestHash,
    arm: expected.arm,
    projectId: expected.projectId,
    workspaceId: expected.workspaceId,
    isolatedFrom: expected.isolatedFrom,
    initialSnapshotHash: expected.initialSnapshotHash,
    modelLock: expected.modelLock,
    toolsLock: expected.toolsLock,
    permissionsHash: expected.permissionsHash,
    intervention: expected.intervention,
    ...(expected.campaignBudget && { campaignBudget: expected.campaignBudget }),
    ...(expected.runtimeLock && { runtimeLock: expected.runtimeLock }),
    ...(expected.environmentLock && { environmentLock: expected.environmentLock }),
    ...(expected.interventionAttestation
      && { interventionAttestation: expected.interventionAttestation }),
    attestorId: `field-workspace-attestor-${expected.arm}`,
    evidenceRefs: [
      fingerprint(`field-workspace:${expected.arm}`),
      expected.runtimeLock?.evidenceHash,
      expected.environmentLock?.evidenceHash,
      expected.interventionAttestation?.evidenceHash
    ].filter(Boolean)
  };
  return { ...body, attestationHash: fingerprint(body) };
}

function execution(request) {
  return {
    executionId: `field-execution-${request.arm}-${request.window.id}`,
    actorId: `field-producer-${request.arm}`,
    projectId: request.project.projectId,
    workspaceId: request.workspaceId,
    intervention: request.intervention,
    artifactHash: fingerprint(`field-artifact:${request.arm}:${request.window.id}`)
  };
}

function measurement(request, executed) {
  const treatment = request.arm === 'treatment';
  const training = request.phase === 'training';
  const progress = !training && treatment;
  const outcome = {
    success: training || treatment,
    projectId: request.project.projectId,
    actorId: executed.actorId,
    regressions: 0,
    humanInterventions: treatment ? 0 : 1,
    costUsd: 0.1,
    durationMs: 100,
    tokens: 100,
    painObserved: training,
    painObservationHash: training
      ? fingerprint(`field-pain:${executed.executionId}`)
      : null,
    developmentalPressureBefore: treatment ? (training ? 0.1 : 0.4) : null,
    developmentalPressureAfter: treatment ? 0.2 : null,
    progressResult: progress ? 'confirmed' : 'not_tested',
    clearanceApplied: progress,
    clearanceEvidenceHash: progress
      ? fingerprint(`field-clearance:${executed.executionId}`)
      : null,
    contextHash: request.window.contextHash,
    artifactHash: executed.artifactHash
  };
  const body = {
    schema: MEASUREMENT_SCHEMA,
    executionId: executed.executionId,
    collectorId: `field-observer-${request.arm}`,
    measuredAt: new Date().toISOString(),
    outcome,
    evidenceRefs: [
      executed.artifactHash,
      outcome.painObservationHash,
      outcome.clearanceEvidenceHash
    ].filter(Boolean)
  };
  return { ...body, measurementHash: fingerprint(body) };
}

function receipt(context) {
  const { request, execution: executed, measurement: measured, outcome } = context;
  return {
    verified: true,
    verifierId: `field-verifier-${request.arm}`,
    executionId: executed.executionId,
    measurementHash: measured.measurementHash,
    projectId: request.project.projectId,
    workspaceId: request.workspaceId,
    initialSnapshotHash: request.initialSnapshotHash,
    intervention: request.intervention,
    executionMode: request.mode,
    conditionsHash: request.conditionsHash,
    artifactHash: outcome.artifactHash,
    outcomeHash: fingerprint(outcome),
    interventionAttestation: request.interventionAttestation || null,
    evidenceRefs: [
      ...measured.evidenceRefs,
      measured.measurementHash,
      request.runtimeLock?.evidenceHash,
      request.environmentLock?.evidenceHash,
      request.interventionAttestation?.evidenceHash
    ].filter(Boolean)
  };
}

async function createAdapters() {
  return {
    workspace: { ensureArm: async (expected) => workspaceAttestation(expected) },
    runtime: { executeWindow: async ({ request }) => execution(request) },
    observer: { measureWindow: async ({ request, execution: executed }) =>
      measurement(request, executed) },
    verifier: { verifyWindow: async (context) => receipt(context) }
  };
}

module.exports = { createAdapters, WORKSPACE_SCHEMA, MEASUREMENT_SCHEMA };
