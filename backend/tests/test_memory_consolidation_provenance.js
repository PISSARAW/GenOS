'use strict';

const assert = require('node:assert/strict');
const policy = require('../src/services/memory/consolidationPolicyService');
const compiler = require('../src/services/memory/memoryContextCompiler');

const episode = { id: 'episode-17', title: 'Verified recovery', actionType: 'recover',
  actionInput: 'restore checkpoint', observationOutput: 'tests passed', applicability: { repo: 'genos' },
  evidenceRefs: ['test://run-4', 'test://run-4', null], counterexampleRefs: ['issue://failure-2'],
  provenance: { sourceRefs: ['decision://adr-12'] } };

const semantic = policy.promoteToSemantic(episode);
assert.deepEqual(semantic.evidenceRefs, ['test://run-4']);
assert.deepEqual(semantic.counterexampleRefs, ['issue://failure-2']);
assert.deepEqual(semantic.provenance.sourceRefs,
  ['episode-17', 'decision://adr-12', 'test://run-4', 'issue://failure-2']);
assert.deepEqual(semantic.applicability, episode.applicability);

const compiled = compiler.compileContext({ relevantFacts: [semantic], budget: 500, query: 'recovery' });
assert.deepEqual(compiled.provenance[0].ref.sourceRefs, semantic.provenance.sourceRefs);
assert.deepEqual(compiled.items[0].evidenceRefs, semantic.evidenceRefs);

const oversizedTrace = compiler.compileContext({ relevantFacts: [{ id: 'oversized-trace', title: 'A', content: 'B',
  provenance: { sourceRefs: [`proof://${'x'.repeat(400)}`] } }], budget: 10 });
assert.equal(oversizedTrace.itemCount, 0, 'provenance metadata must count toward the memory context budget');

const procedural = policy.promoteToProcedural(episode);
assert.deepEqual(procedural.evidenceRefs, ['test://run-4']);
assert.deepEqual(procedural.counterexampleRefs, ['issue://failure-2']);
assert.deepEqual(procedural.provenance.sourceRefs, semantic.provenance.sourceRefs);

const negative = policy.markAsNegativeKnowledge({ ...episode, actionType: 'failed-recovery' });
assert.deepEqual(negative.evidenceRefs, ['test://run-4']);
assert.deepEqual(negative.counterexampleRefs, ['issue://failure-2']);
assert.deepEqual(negative.provenance.sourceRefs,
  ['episode-17', 'decision://adr-12', 'test://run-4', 'issue://failure-2']);

process.stdout.write('Semantic and negative memory consolidation preserve evidence provenance.\n');
