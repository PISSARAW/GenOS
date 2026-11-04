'use strict';
const assert = require('node:assert/strict');
const Ajv = require('ajv');
const { workerArtifactResponseFormat } = require('../src/services/agents/workerArtifactResponseSchema');
const criteria = ['brief_coverage', 'causal_chain', 'character_actions', 'enacted_resolution', 'continuity'];
const handoffs = [{ handoffId: 'received-handoff', digest: 'actual-digest', version: 2 }];
const schema = workerArtifactResponseFormat('creative_worker', ['mission'], {
  nativeQuality: true, missionCriteria: criteria, handoffs }).schema;
const validate = new Ajv({ strict: false }).compile(schema);
const candidate = 'INT. SAS - NUIT\nALAIN\nJe ferme la porte.\n' + 'Une action concrète reste à évaluer. '.repeat(3000);
const claim = { statement: 'Un candidat est fourni pour évaluation.', evidence: ['mission'] };
const report = { outcome: 'success', claims: [claim], integrationConstraints: ['Contrôler le vrai handoff reçu.'],
  handoffEvaluations: [{ handoffId: 'received-handoff', digest: 'actual-digest', version: 2, passed: false, evidenceRefs: ['mission'] }],
  acceptanceEvaluations: criteria.map(criterion => ({ criterion, passed: null, evidenceRefs: ['mission'] })),
  workerArtifact: { type: 'creative_candidate', content: { candidate, assumptions: ['Fiction proposée.'],
    falsificationTest: 'Comparer les scènes aux contraintes du brief.' }, provenance: { sourceRefs: ['mission'] } } };
assert.equal(validate(report), true, JSON.stringify(validate.errors));
assert.equal(schema.properties.workerArtifact.properties.content.properties.candidate.maxLength, undefined);
assert.equal(validate({ ...report, claims: Array(5).fill(claim) }), false);
assert.equal(validate({ ...report, claims: [{ ...claim, statement: 'x'.repeat(601) }] }), false);
assert.equal(validate({ ...report, claims: [{ ...claim, evidence: ['invented'] }] }), false);
assert.equal(validate({ ...report, acceptanceEvaluations: [...report.acceptanceEvaluations, report.acceptanceEvaluations[0]] }), false);
assert.equal(validate({ ...report, workerArtifact: undefined }), false);
assert.equal(validate({ ...report, handoffEvaluations: [] }), false);
assert.equal(validate({ ...report, handoffEvaluations: [{ ...report.handoffEvaluations[0], digest: 'substituted' }] }), false);
assert.equal(validate({ outcome: 'unresolved', claims: [], uncertainties: ['Preuve insuffisante.'],
  integrationConstraints: report.integrationConstraints, handoffEvaluations: report.handoffEvaluations }), true);
const ordinary = workerArtifactResponseFormat('creative_worker', ['mission']).schema;
assert.equal(ordinary.properties.claims.maxItems, undefined);
console.log('Creative native envelope: metadata bounded; full candidate, unresolved outcome, exact handoffs and source gates preserved. Synthetic schema fixtures only.');
