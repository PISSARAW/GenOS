'use strict';

const { hash } = require('../../src/services/gvxContracts');
const snapshotHash = hash('initial snapshot');

function input() {
  const roles = ['baseline', 'candidate'];
  return {
    experimentId: 'p1-l01-paired', protocolVersion: 2,
    scope: { organizationId: 'p1-org', projectId: 'p1-project' }, entityId: 'p1-entity',
    candidateHash: hash('candidate'), snapshotHash, worldBudget: 10,
    controls: { model: 'fixture-no-model', toolsetHash: hash('tools'), environmentHash: hash('environment') },
    verifierRequirements: ['artifact-integrity'],
    experimentDesign: { type: 'paired', arms: roles.map(role => ({
      armId: role, role, worldId: `world-${role}`, isolationId: `isolation-${role}`,
      snapshotHash, strategyId: `strategy-${role}`, budget: 10
    })) },
    provenance: {
      mission: { id: 'mission-p1-l01', contractHash: hash('mission contract') },
      run: { id: 'run-p1-l01', parentRunId: 'run-parent' },
      claims: [
        { id: 'claim-open', statementHash: hash('candidate claim'), status: 'proposed', sourceRefs: ['artifact-source', 'receipt-parent'] },
        { id: 'claim-rejected', statementHash: hash('rejected claim'), status: 'rejected', sourceRefs: [] },
        { id: 'claim-retracted', statementHash: hash('retracted claim'), status: 'retracted', sourceRefs: [] }
      ],
      hypotheses: [{ id: 'hypothesis', claimIds: ['claim-open'], predictionHash: hash('prediction'), status: 'open' }],
      interventions: roles.map(role => ({ id: `intervention-${role}`, armId: role,
        hypothesisIds: ['hypothesis'], descriptionHash: hash(role) })),
      versions: { codeRevision: 'a'.repeat(40), sourceTreeHash: hash('fixture source tree') },
      lineage: [{ runId: 'run-parent', manifestHash: hash('parent manifest') }],
      costUnit: 'test-budget-units',
      artifacts: [{ artifactId: 'artifact-source', kind: 'fixture', sha256: hash('source bytes') }],
      receiptRefs: [{ receiptId: 'receipt-parent', sha256: hash('parent receipt') }]
    }
  };
}

function context(plan, overrides = {}) {
  const source = input();
  return { scope: source.scope, entityId: source.entityId, candidateHash: source.candidateHash,
    plan, outcomes: [], ...overrides };
}

module.exports = { input, context };
