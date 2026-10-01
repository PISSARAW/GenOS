'use strict';

/**
 * Opérateurs philosophiques comme mutations cognitives dirigées.
 *
 * Second usage de la philosophie : non plus analyser une représentation,
 * mais la muter (Hume doute, suppression contrefactuelle, fusion
 * d'entités, glissement méréologique, hypostase, changement de catégorie,
 * tranches d'identité, inversion causale/temporelle, maintien chimérique).
 * Bibliothèque pure et déterministe sur claims structurés
 * {statement, entities[], relations[], properties[]} — sans LLM, testable,
 * rejouable. Consommée par le planificateur morphogénétique (prochaine
 * étape) ; les anomalies vivent en sandbox cognitif, jamais comme vérités.
 */

const CLASSES = ['object', 'process', 'relation', 'event', 'agent'];

function normalizeClaim(input) {
  const data = input || {};
  const strings = (value) => (Array.isArray(value) ? value : []).filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim().slice(0, 160));
  return {
    statement: String(data.statement || '').slice(0, 500),
    entities: strings(data.entities),
    relations: Array.isArray(data.relations) ? data.relations.filter((rel) => rel && typeof rel.from === 'string' && typeof rel.to === 'string') : [],
    properties: strings(data.properties)
  };
}

function variant(operator, claim, { statement, extra }) {
  return { operator, statement: String(statement).slice(0, 500), entities: claim.entities, note: extra || null };
}

function humeDoubt(claim) {
  return [
    variant('hume-doubt', claim, { statement: `${claim.statement} — ou simple régularité observée ?`, extra: 'regularity' }),
    variant('hume-doubt', claim, { statement: `${claim.statement} — cause commune cachée possible ?`, extra: 'common-cause' })
  ];
}

function counterfactualRemove(claim) {
  return claim.entities.map((entity) => variant('counterfactual-remove', claim,
    { statement: `Monde sans ${entity} : ${claim.statement}`, extra: `removed:${entity}` }));
}

function mergeEntities(claim) {
  if (claim.entities.length < 2) return [];
  const fused = `${claim.entities[0]}+${claim.entities[1]}`;
  return [variant('merge-entities', claim, { statement: claim.statement.replace(claim.entities[0], fused).replace(claim.entities[1], fused), extra: `fused:${fused}` })];
}

function mereologicalShift(claim) {
  return claim.entities.map((entity) => variant('mereological-shift', claim,
    { statement: `${entity} comme partie du système : ${claim.statement}`, extra: `part:${entity}` }));
}

function hypostatize(claim) {
  return claim.properties.map((property) => variant('hypostatize', claim,
    { statement: `${property} traitée comme entité autonome dans : ${claim.statement}`, extra: `entity:${property}` }));
}

function categoryShift(claim) {
  return claim.entities.map((entity) => {
    const shifted = CLASSES[entity.length % CLASSES.length];
    return variant('category-shift', claim, { statement: `${entity} reclassé comme ${shifted} : ${claim.statement}`, extra: `class:${shifted}` });
  });
}

function identityShift(claim) {
  return claim.entities.map((entity) => variant('identity-shift', claim,
    { statement: `${entity}@t0 ≠ ${entity}@t1 : ${claim.statement}`, extra: `sliced:${entity}` }));
}

function causalInvert(claim) {
  if (!claim.relations.length) {
    return [variant('causal-invert', claim, { statement: `Et si la causalité était inversée : ${claim.statement}`, extra: 'inverted' })];
  }
  return claim.relations.map((rel) => variant('causal-invert', claim,
    { statement: `${rel.to} → ${rel.from} (au lieu de ${rel.from} → ${rel.to})`, extra: `inverted:${rel.from}>${rel.to}` }));
}

function temporalInvert(claim) {
  return [variant('temporal-invert', claim, { statement: `Effet avant cause apparente : ${claim.statement}`, extra: 'time-reversed' })];
}

function chimericHold(claim) {
  if (claim.relations.length < 1 && claim.entities.length < 2) return [];
  return [{
    operator: 'chimeric-hold',
    statement: claim.statement,
    entities: claim.entities,
    compartments: [
      { holds: 'A→B', relations: claim.relations },
      { holds: 'B→A', relations: claim.relations.map((rel) => ({ from: rel.to, to: rel.from })) }
    ],
    note: 'contradiction maintenue sans fusion prematuree'
  }];
}

const OPERATORS = {
  'hume-doubt': humeDoubt,
  'counterfactual-remove': counterfactualRemove,
  'merge-entities': mergeEntities,
  'mereological-shift': mereologicalShift,
  'hypostatize': hypostatize,
  'category-shift': categoryShift,
  'identity-shift': identityShift,
  'causal-invert': causalInvert,
  'temporal-invert': temporalInvert,
  'chimeric-hold': chimericHold
};

function applyOperators(claim, names) {
  const normalized = normalizeClaim(claim);
  const selected = Array.isArray(names) && names.length
    ? names.filter((name) => OPERATORS[name])
    : Object.keys(OPERATORS);
  const variants = [];
  for (const name of selected) {
    for (const produced of OPERATORS[name](normalized) || []) variants.push(produced);
  }
  return variants;
}

module.exports = { applyOperators, normalizeClaim, OPERATORS };
