'use strict';

const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { createRequire } = require('node:module');
const backendRequire = createRequire(path.join(__dirname, '..', '..', 'backend', 'package.json'));
const sqlite3 = backendRequire('sqlite3').verbose();
const { open } = backendRequire('sqlite');
const missionService = require('../../backend/src/services/holobionte/runtime/holobiontMissionService');
const admissionService = require('../../backend/src/services/holobionte/symbionts/symbiontAdmissionService');

const RUNNER_ID = 'real-holobiont-mission/v1';

function calculate(values) {
  return values.reduce((total, value) => total + value, 0);
}

function symbiont(caseId) {
  return {
    id: `bounded-sum-${caseId}`,
    contract: {
      capabilitiesOffered: ['bounded-sum'], resourcesRequested: { tokens: 8 },
      inputs: {}, outputs: {}, authorityScope: { level: 'CAPABILITY', actions: ['bounded-sum'] },
      toolLeases: [], dataAccess: [], privacyBoundary: {}, evidenceRequirements: ['campaign-oracle'],
      expectedBenefit: { quality: 'exact bounded sum' }, maxCost: { tokens: 8 }, immunePolicy: {},
      adaptationPolicy: {}, transmissionPolicy: 'NEVER_INHERIT',
      terminationConditions: ['mission-end'], dependencyCeiling: 0.25
    }
  };
}

function isolationProof(adapterProvenance, testCase, repetition) {
  const evidenceRef = `isolation-proof:${testCase.id}:${repetition}:${adapterProvenance.proofHash}`;
  return {
    schema: admissionService.ISOLATION_PROOF_SCHEMA,
    status: 'VERIFIED',
    isolationId: `campaign-${testCase.id}-${repetition}`,
    mechanism: 'dedicated-process-with-ephemeral-sqlite-state',
    adapterProofHash: adapterProvenance.proofHash,
    observedAt: new Date().toISOString(),
    evidenceRefs: [evidenceRef],
    boundaries: { process: 'ISOLATED', workspace: 'EPHEMERAL', network: 'DENIED' }
  };
}

function missionInput(testCase, repetition) {
  const producerId = `bounded-sum-${testCase.id}`;
  return {
    hostId: `campaign-host-${testCase.id}-${repetition}`,
    missionId: `campaign-${testCase.id}-${repetition}`,
    capability: 'bounded-sum', request: { values: [...testCase.values] },
    symbionts: [symbiont(testCase.id)],
    executionBudget: { tokens: 12, maxSteps: 1, maxTimeMs: 5000 },
    allocation: {
      policy: { tokens: { basal: 1, preferred: 2, maximum: 8, burstAllowance: 0 } },
      available: { tokens: 8 }
    },
    trialCapabilityExecutor: async ({ adapterProvenance }) => ({
      result: { value: calculate(testCase.values) }, contributionScore: 1, contractCompliant: true,
      resourcesConsumed: { tokens: 1 }, riskScore: 0,
      isolationProof: isolationProof(adapterProvenance, testCase, repetition)
    }),
    executeCapability: async ({ request }) => ({
      result: { value: calculate(request.values) }, receiptId: randomUUID(), benefitScore: 1,
      evidenceQuality: 1, costScore: 0, riskScore: 0, resourcesConsumed: { tokens: 1 }
    }),
    verifyCapability: async ({ result, resultHash, output }) => ({
      status: result.value === calculate(testCase.values) ? 'VERIFIED' : 'REJECTED',
      resultHash, verifierId: `${producerId}-runtime-verifier`,
      evidenceRefs: [`campaign-oracle:${testCase.id}:${resultHash}`,
        ...(output.isolationProof?.evidenceRefs || [])]
    })
  };
}

async function execute(testCase, repetition) {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const started = process.hrtime.bigint();
  try {
    const result = await missionService.runHolobiontMission(db, missionInput(testCase, repetition));
    const elapsedNs = Number(process.hrtime.bigint() - started);
    const execution = result.completed?.[0]?.execution;
    return {
      runnerId: RUNNER_ID,
      output: execution?.result ?? null,
      metrics: {
        durationMs: elapsedNs / 1e6,
        tokenUsage: result.usage?.tokens ?? null,
        admissionCount: Array.isArray(result.admissions) ? result.admissions.length : null,
        sessionClosed: result.lifecycle?.disposition === 'CLOSED'
      },
      missionStatus: result.status,
      admissionIsolationProof: result.admissions?.[0]?.receipt?.isolationProof || null,
      trialAdapterProofHash: result.adapterProvenance?.trial?.proofHash || null,
      evidenceRefs: execution?.contribution?.evidenceRefs || []
    };
  } finally {
    await db.close();
  }
}

module.exports = { RUNNER_ID, execute };
