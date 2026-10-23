'use strict';

const assert = require('node:assert/strict');
const { rankMemories, CANDIDATE_LIMIT, MAX_SOURCE_ITEMS } = require('../src/services/memory/situationalRecallService');
const features = require('../src/services/memory/situationFeatures');
const { compileContext } = require('../src/services/memory/memoryContextCompiler');

const referenceTime = '2026-10-23T12:00:00Z';
const query = 'Diagnostiquer les écritures concurrentes dans un fichier partagé';

function memory(id, summary, similarityScore = 0.5) {
  return { id, summary, similarityScore, status: 'SUCCESS', category: 'Experience' };
}

function structuralTransfer() {
  const causal = memory('coordination', 'SQLite transaction contention: serialize writers', 0.3);
  const misleading = memory('timeout', 'Network HTTP timeout: increase remote socket deadline', 0.9);
  const ranked = rankMemories(query, [misleading, causal], { referenceTime });
  assert.equal(rankMemories(query, [misleading, causal], { situationalRecall: false })[0].id, misleading.id);
  assert.equal(ranked[0].id, causal.id);
  assert.deepEqual(ranked[0].recall.matchedDimensions, ['coordination', 'sharedState']);
  assert.equal(ranked[0].similarityScore, 0.3);
  assert.equal(ranked[0].recall.phase, 'diagnosis');
  assert.equal(causal.recall, undefined);
  const compiled = compileContext({ procedures: ranked, query, budget: 2000 });
  assert.equal(compiled.items[0].id, causal.id, 'Prompt compilation must preserve the new ranking');
  assert.ok(compiled.usedTokens <= compiled.tokenBudget);
}

function phaseSwitch() {
  const lexical = memory('lexical', 'SQLite transaction contention', 0.9);
  const traceable = { ...memory('traceable', 'SQLite transaction contention', 0.5),
    evidenceRefs: ['log:historical-run'], provenance: { hash: 'historical-pointer' }, isEpistemicallyValid: false };
  const exploration = rankMemories(query, [lexical, traceable], { recallPhase: 'exploration', referenceTime });
  const verification = rankMemories(query, [lexical, traceable], { recallPhase: 'verification', referenceTime });
  assert.equal(exploration[0].id, 'lexical');
  assert.equal(verification[0].id, 'traceable');
  assert.equal(verification[0].isEpistemicallyValid, false);
  assert.equal(verification[0].provenance, traceable.provenance);
  assert.equal(verification[0].evidenceRefs, traceable.evidenceRefs);
  assert.equal(verification[0].recall.interpretation, 'ranking-only');
  assert.equal(features.resolvePhase('Vérifier les reçus', {}), 'verification');
  assert.equal(features.resolvePhase('Explorer le système', { recallPhase: '__proto__' }), 'exploration');
}

function diversity() {
  const candidates = [memory('a', 'SQLite contention', 0.8), memory('b', 'SQLite contention', 0.79),
    memory('c', 'SQLite transaction', 0.78)];
  const options = { referenceTime, recallPhase: 'exploration' };
  const ranked = rankMemories('SQLite', candidates, options);
  assert.deepEqual(ranked.map((item) => item.id), ['c', 'a', 'b']);
  assert.ok(ranked[1].recall.diversityPenalty > 0);
  assert.deepEqual(ranked, rankMemories('SQLite', candidates, options));
}

function exclusionsAndBounds() {
  const clean = memory('clean', 'SQLite contention');
  const candidates = [
    { ...clean, id: 'unverified', category: 'UnverifiedExperience', similarityScore: 1 },
    { ...clean, id: 'inhibited', inhibitorySignal: 'active', similarityScore: 1 },
    { ...clean, id: 'marker', content: '[UNVERIFIED_EVIDENCE]', similarityScore: 1 },
    clean, clean
  ];
  assert.deepEqual(rankMemories(query, candidates).map((item) => item.id), ['clean']);
  assert.deepEqual(rankMemories(query, null), []);
  const many = Array.from({ length: MAX_SOURCE_ITEMS + 1 }, (_, index) => memory(String(index), 'SQLite'));
  assert.equal(rankMemories(query, many).length, CANDIDATE_LIMIT);
  assert.ok(!rankMemories(query, many).some((item) => item.id === String(MAX_SOURCE_ITEMS)));
  assert.deepEqual(rankMemories(query, [clean], { situationalRecall: false }), [clean]);
}

function malformedDatesAndScores() {
  const input = [
    { ...memory('bad', 'SQLite', NaN), createdAt: 'not-a-date' },
    { ...memory('future', 'SQLite', Infinity), createdAt: '2099-01-01' },
    { ...memory('today', 'SQLite', 0.5), createdAt: referenceTime }
  ];
  const ranked = rankMemories('SQLite', input, { referenceTime });
  assert.ok(ranked.every((item) => Number.isFinite(item.recallScore)));
  assert.equal(ranked.find((item) => item.id === 'future').recall.criteria.freshness, 0);
  assert.equal(ranked.find((item) => item.id === 'bad').recall.criteria.freshness, 0);
  assert.equal(ranked[0].id, 'today');
  const sqlite = rankMemories('SQLite', [{ ...memory('sqlite-date', 'SQLite'), created_at: '2026-10-23 12:00:00' }], { referenceTime });
  assert.equal(sqlite[0].recall.criteria.freshness, 1, 'SQLite timestamps are UTC regardless of host timezone');
  const emptyQuery = rankMemories('', input, { referenceTime });
  assert.ok(emptyQuery.every((item) => item.recall.criteria.structure === 0));
}

structuralTransfer();
phaseSwitch();
diversity();
exclusionsAndBounds();
malformedDatesAndScores();
console.log('Situational recall: structural transfer, phase switching, diversity, authority boundary and bounds passed.');
