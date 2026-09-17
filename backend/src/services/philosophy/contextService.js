'use strict';

const INDEXICALS = Object.freeze({
  je: 'speaker', i: 'speaker', tu: 'addressee', you: 'addressee',
  ici: 'location', here: 'location', maintenant: 'time', now: 'time',
  ceci: 'demonstratum', this: 'demonstratum'
});

function resolveIndexical(input = {}) {
  const expression = String(input.expression || '').trim().toLowerCase();
  if (!INDEXICALS[expression]) throw new Error(`Unknown indexical '${expression}'.`);
  const context = input.context && typeof input.context === 'object' ? input.context : {};
  const field = INDEXICALS[expression];
  return { expression, character: field, content: context[field] || null, resolved: context[field] !== undefined };
}

function createContext(input = {}) {
  return {
    apiVersion: 'genos.context/v1',
    kind: 'Context',
    speaker: input.speaker || null,
    addressee: input.addressee || null,
    time: input.time || null,
    location: input.location || null,
    world: input.world || null,
    discourseState: input.discourseState || {},
    socialRoles: input.socialRoles || {}
  };
}

module.exports = { INDEXICALS, resolveIndexical, createContext };
