'use strict';

const { createEcologicalLink } = require('../contracts/ecologicalLink');

function advance(ecology, state, input) {
  const pair = validatePair(ecology, input);
  const pairId = pair.pairId;
  const previous = (state.armsRace || {})[pairId] || { rounds: 0, successfulChallenges: 0, mitigations: 0 };
  const challenge = input.challenge === true;
  const mitigated = challenge && input.mitigationEvidenceRefs?.length > 0;
  const round = makeRound({ pairId, input, challenge, mitigated });
  const armsRace = updateMetrics({ state, pairId, previous, challenge, mitigated });
  ecology.interactionGraph = upsertPredation(ecology.interactionGraph, pair.attacker, pair.defender);
  const lineages = makeLineages({ state, pairId, round, challenge, mitigated });
  return { state: { ...state, armsRace, strategyLineages: lineages, exploitArchive: append(state.exploitArchive, round) },
    decision: { ...round, metrics: armsRace[pairId], lineage: lineages[pairId] },
    action: { type: 'SAFE_ADVERSARIAL_ROUND_RECORDED', status: 'applied', pairId } };
}

function makeLineages(options) {
  const { state, pairId, round, challenge, mitigated } = options;
  return { ...(state.strategyLineages || {}), [pairId]: {
    attacker: round.attackStrategy || state.strategyLineages?.[pairId]?.attacker || null,
    defender: round.defenseStrategy || state.strategyLineages?.[pairId]?.defender || null,
    nextAttacker: mitigated ? round.attackStrategy : mutate(round.attackStrategy),
    nextDefender: challenge && !mitigated ? round.defenseStrategy : mutate(round.defenseStrategy)
  } };
}

function validatePair(ecology, input) {
  if (input.payload || input.exploitCode || input.executeAttack === true) {
    throw variantError('Adversarial Biome accepts evidence references and abstract scenarios only.', 'BIOME_ADVERSARIAL_BOUNDARY');
  }
  const attacker = text(input.attackerPopulationId);
  const defender = text(input.defenderPopulationId);
  if (!attacker || !defender || attacker === defender) throw variantError('Adversarial ecology needs distinct attacker and defender populations.', 'BIOME_VARIANT_INPUT_INVALID');
  assertPopulation(ecology, attacker);
  assertPopulation(ecology, defender);
  if (input.challenge === true && !strings(input.evidenceRefs).length) throw variantError('Adversarial challenges require scenario evidence.', 'BIOME_VARIANT_EVIDENCE_REQUIRED');
  return { attacker, defender, pairId: `${attacker}->${defender}` };
}

function makeRound(options) {
  const { pairId, input, challenge, mitigated } = options;
  return { pairId, scenario: text(input.scenario), challenge, mitigated,
    evidenceRefs: strings(input.evidenceRefs), exploitArchiveRef: text(input.exploitArchiveRef),
    mitigationEvidenceRefs: strings(input.mitigationEvidenceRefs), safetyBoundary: 'abstract_simulation_only',
    attackStrategy: safeStrategy(input.attackStrategy), defenseStrategy: safeStrategy(input.defenseStrategy) };
}

function updateMetrics(options) {
  const { state, pairId, previous, challenge, mitigated } = options;
  return { ...state.armsRace, [pairId]: { rounds: previous.rounds + 1,
    successfulChallenges: previous.successfulChallenges + Number(challenge && !mitigated),
    mitigations: previous.mitigations + Number(mitigated) } };
}

function safeStrategy(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => !/payload|command|code/i.test(key)
    && (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')));
}

function mutate(strategy) {
  return strategy ? { ...strategy, generation: Number(strategy.generation || 0) + 1 } : null;
}

function upsertPredation(links, sourceId, targetId) {
  const link = createEcologicalLink({ sourceId, targetId, type: 'predation', strength: 1, confidence: 1 });
  return [...links.filter((item) => item.sourceId !== sourceId || item.targetId !== targetId), link];
}

function assertPopulation(ecology, populationId) {
  if (!ecology.populations.some((population) => population.populationId === populationId)) {
    throw variantError(`Unknown adversarial population '${populationId}'.`, 'BIOME_POPULATION_UNKNOWN');
  }
}

function append(list, item) { return [...(Array.isArray(list) ? list : []), item].slice(-500); }
function strings(value) { return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : []; }
function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function variantError(message, code) { return Object.assign(new Error(message), { code }); }

module.exports = { advance };
