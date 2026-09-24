'use strict';

const subscriptions = require('./subscriptionPlanner');
const invariantIndex = require('../invariants/invariantDependencyIndex');
const domainsService = require('../domains/nuclearDomainService');

function projectSnapshot({ snapshot, schema, domain }) {
  const visiblePaths = subscriptions.pathsFor(domain, schema);
  const visible = new Set(visiblePaths);
  const sharedFields = Object.fromEntries(Object.entries(snapshot.sharedFields || {}).filter(([path]) => visible.has(path)));
  return {
    ...snapshot,
    sharedFields,
    visiblePaths,
    textContent: mayReadRegion(domain, 'textContent') ? snapshot.textContent : '',
    cursors: mayReadRegion(domain, 'presence.cursor') ? snapshot.cursors : snapshot.cursors.filter((cursor) => domain.members.includes(cursor.agentId)),
    invariants: mayReadRegion(domain, 'invariants.*') ? snapshot.invariants : [],
    causalFrontier: Object.fromEntries(Object.entries(snapshot.causalFrontier || {}).filter(([actor]) => domain.members.includes(actor)))
  };
}

function mayReadRegion(domain, path) {
  return domainsService.matchesAny([...domain.subscriptions, ...domain.mayRead], path);
}

function projectSchema(schema, domain) {
  if (!schema) return null;
  const fields = Object.fromEntries(subscriptions.pathsFor(domain, schema).map((path) => [path, schema.fields[path]]));
  const paths = new Set(Object.keys(fields));
  const invariants = Object.fromEntries(Object.entries(schema.invariants || {}).filter(([, item]) =>
    item.dependencies.length ? item.dependencies.some((path) => paths.has(path)) : domain.subscriptions.includes('*')));
  return { ...schema, fields, invariants, invariantIndex: invariantIndex.compile(invariants) };
}

module.exports = { projectSnapshot, projectSchema };
