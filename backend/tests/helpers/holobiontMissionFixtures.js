'use strict';

const { randomUUID } = require('node:crypto');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const service = require('../../src/services/holobionte/runtime/holobiontMissionService');
const store = require('../../src/services/holobionte/holobiontStore');

function symbiont(id = 'calculator') {
  return { id, contract: { capabilitiesOffered: ['arithmetic'], resourcesRequested: { tokens: 20 },
    inputs: {}, outputs: {}, authorityScope: { level: 'CAPABILITY', actions: ['arithmetic'] },
    toolLeases: [], dataAccess: [], privacyBoundary: {}, evidenceRequirements: ['math-proof'],
    expectedBenefit: { quality: 'checked arithmetic' }, maxCost: { tokens: 20 }, immunePolicy: {},
    adaptationPolicy: {}, transmissionPolicy: 'NEVER_INHERIT', terminationConditions: ['mission-end'], dependencyCeiling: 0.3 } };
}

function trial() {
  return { result: { sum: 6 }, contributionScore: 0.9, contractCompliant: true,
    resourcesConsumed: { tokens: 1 }, riskScore: 0 };
}

function output() {
  return { result: { sum: 6 }, receiptId: randomUUID(), benefitScore: 0.9, evidenceQuality: 1,
    costScore: 0.1, riskScore: 0, resourcesConsumed: { tokens: 1 } };
}

function verify({ result, resultHash }) {
  return { status: result.sum === 1 + 2 + 3 ? 'VERIFIED' : 'REJECTED',
    resultHash, verifierId: 'independent-arithmetic-checker', evidenceRefs: [`math-proof:${resultHash}`] };
}

function mission(overrides = {}) {
  return { hostId: 'math-host', missionId: randomUUID(), capability: 'arithmetic',
    symbionts: [symbiont()], executeCapability: async () => output(),
    trialCapabilityExecutor: async () => trial(), verifyCapability: verify,
    allocation: { policy: { tokens: { basal: 1, preferred: 2, maximum: 5, burstAllowance: 0 } },
      available: { tokens: 10 } }, ...overrides };
}

async function fixture() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const input = mission();
  const opened = await service.openMissionHost(db, input);
  input.holobiontId = opened.session.holobiontId;
  await service.admitMissionSymbiont(db, input, input.symbionts[0]);
  return { db, input, session: await store.getSession(db, input.holobiontId) };
}

module.exports = { fixture, mission, symbiont, output, verify, service, store, open, sqlite3 };
