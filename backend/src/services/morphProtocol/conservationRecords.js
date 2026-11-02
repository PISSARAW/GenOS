'use strict';

const { digest } = require('../evidenceProtocol/canonical');

class MorphConservationError extends Error {
  constructor(message) {
    super(`MORPH conservation: ${message}`);
    this.name = 'MorphConservationError';
    this.code = 'MORPH_CONSERVATION_INVALID';
  }
}

const fail = (message) => { throw new MorphConservationError(message); };
const same = (left, right) => digest(left) === digest(right);

const IDENTIFIERS = Object.freeze({ tasks: 'taskId', obligations: 'obligationId', permissions: 'grantId',
  budgets: 'budgetId', claims: 'claimId', evidence: 'evidenceId', provenance: 'agentId',
  dependencies: 'dependencyId', audiences: 'messageId', uncertainties: 'uncertaintyId',
  questions: 'questionId', unknownEffects: 'effectId' });

function actorSet(actors) {
  const keys = actors.map((actor) => digest(actor));
  if (new Set(keys).size !== keys.length) fail('duplicate actor.');
  return new Set(keys);
}

function recordIndex(items, key) {
  const result = new Map();
  for (const item of items) {
    if (result.has(item[key])) fail(`duplicate ${key}: ${item[key]}.`);
    result.set(item[key], item);
  }
  return result;
}

function indexSnapshot(snapshot) {
  const result = { members: actorSet(snapshot.members) };
  for (const [kind, id] of Object.entries(IDENTIFIERS)) result[kind] = recordIndex(snapshot[kind], id);
  for (const audience of snapshot.audiences) actorSet(audience.recipients);
  return result;
}

function sameIds(source, target, label) {
  if (source.size !== target.size || [...source.keys()].some((key) => !target.has(key))) fail(`${label} identifiers changed.`);
}

function sameRecords(source, target, label) {
  sameIds(source, target, label);
  for (const [id, item] of source) {
    if (!same(item, target.get(id))) fail(`${label} content changed: ${id}.`);
  }
}

module.exports = { MorphConservationError, fail, same, actorSet, recordIndex, indexSnapshot, sameIds, sameRecords };
