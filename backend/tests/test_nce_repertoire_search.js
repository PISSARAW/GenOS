'use strict';

const assert = require('node:assert/strict');
const programs = require('../src/services/nceProcedureProgram');
const { searchOptions, searchRepertoire } = require('../src/services/nceRepertoireSearch');

function stateFor(stepsList) {
  const state = { agentId: 'learner', proceduralRepertoire: {}, nceReceipts: [] };
  for (const steps of stepsList) {
    const procedure = programs.program(steps);
    const hash = programs.digest(procedure);
    const evidenceRef = `proof-${hash}`;
    state.proceduralRepertoire[hash] = { procedure, evidenceRef };
    state.nceReceipts.push({ agentId: state.agentId, procedure, evidenceRef, promoted: true, measured: true });
  }
  return state;
}

function search(state, options = {}) {
  return searchRepertoire(state, { options: searchOptions(options), artifacts: [] });
}

function assertCompositions() {
  const state = stateFor([['unique', 'sort'], ['sort', 'reverse']]);
  const original = structuredClone(state);
  const candidates = search(state);
  assert.deepEqual(search(state), candidates, 'search is deterministic');
  assert.deepEqual(search(stateFor([['sort', 'reverse'], ['unique', 'sort']])), candidates);
  assert.deepEqual(state, original, 'proposals do not change the phenotype');
  const composed = candidates.find((item) => item.provenance.derivation.kind === 'composition'
    && JSON.stringify(item.content.procedure.steps) === JSON.stringify(['unique', 'sort', 'sort', 'reverse']));
  assert.ok(composed, 'ordered composition produces a program outside the fixed catalog');
  assert.deepEqual(programs.executeProgram(composed.content.procedure, [9, 2, 9, -4]), [9, 2, -4]);
  assert.equal(composed.provenance.derivation.parents.length, 2);
  for (const parent of composed.provenance.derivation.parents) {
    assert.equal(state.proceduralRepertoire[parent.programHash].evidenceRef, parent.evidenceRef);
  }
  assert.equal(new Set(candidates.map((item) => programs.digest(item.content.procedure))).size, candidates.length);
  assert.ok(candidates.some((item) => item.provenance.derivation.edit?.type === 'insert'));
  assert.ok(search(state, { maxCandidates: 32 }).some((item) => item.provenance.derivation.edit?.type === 'delete'));
}

function assertBounds() {
  const state = stateFor([['unique', 'sort'], ['sort', 'reverse']]);
  assert.equal(search(state, { maxCandidates: 0 }).length, 0);
  assert.equal(search(state, { maxParents: 0 }).length, 0);
  assert.equal(search(state, { maxCandidates: 1 }).length, 1);
  assert.ok(search(state, { maxParents: 1 }).every((item) => item.provenance.derivation.parents.length === 1));
  const full = Array(32).fill({ content: { procedure: programs.program() } });
  assert.deepEqual(searchRepertoire(state, { options: searchOptions(), artifacts: full }), []);
  const long = search(stateFor([Array(16).fill('sort'), ['reverse']]));
  assert.ok(long.every((item) => item.content.procedure.steps.length <= 16));
  for (const maxCandidates of [-1, 33, 1.5, '2', Infinity]) {
    assert.throws(() => searchOptions({ maxCandidates }), /budget/);
  }
  assert.throws(() => searchOptions({ maxParents: 17 }), /budget/);
  assert.throws(() => searchOptions({ arbitraryCode: true }), /Unknown/);
  assert.throws(() => searchOptions(null), /options/);
}

function assertEvidenceGate() {
  for (const change of [
    (state) => { state.nceReceipts = []; },
    (state) => { state.nceReceipts[0].promoted = false; },
    (state) => { state.nceReceipts[0].measured = false; },
    (state) => { state.nceReceipts[0].promoted = 'true'; },
    (state) => { state.nceReceipts[0].measured = 'true'; },
    (state) => {
      state.nceReceipts[0].evidenceRef = '';
      Object.values(state.proceduralRepertoire)[0].evidenceRef = '';
    },
    (state) => { state.nceReceipts[0].agentId = 'another-agent'; },
    (state) => { state.nceReceipts[0].procedure = programs.program(['reverse']); },
  ]) {
    const state = stateFor([['sort']]);
    change(state);
    assert.deepEqual(search(state), [], 'unproven parent cannot enter search');
  }
  const state = stateFor([['sort']]);
  Object.values(state.proceduralRepertoire)[0].procedure = { schema: 'genos.nce.procedure.v1', steps: ['eval'] };
  assert.throws(() => search(state), /Unsupported/);
}

assertCompositions();
assertBounds();
assertEvidenceGate();
console.log('NCE repertoire search: composition, mutation, lineage, budgets and proof gates: PASS');
