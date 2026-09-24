'use strict';

const schemaService = require('../../syncytiumSchemaService');
const projections = require('../sync/projectionMaterializer');
const topologyCapabilities = require('../../topologyCapabilityService');

const NESTED_MODES = new Set(['a_team', 'trinity', 'biocenose']);
const SEPARATOR = '::';

function createNestedTopologyService(syncytium) {
  return {
    createNestedSession: (mission, configuration) => createSession(mission, configuration, syncytium),
    applyNestedOperation: (sessionId, request) => applyOperation({ sessionId, request, syncytium }),
    applyNestedTransaction: (sessionId, request) => applyTransaction({ sessionId, request, syncytium }),
    nestedSnapshot: (sessionId, request) => nestedSnapshot({ sessionId, request, syncytium })
  };
}

function createSession(mission, configuration = {}, syncytium) {
  const fields = normalizeFields(configuration.sharedFields);
  const nested = normalizeTopologies(configuration.nestedTopologies, configuration.parentDomains);
  const domains = compileDomains(nested, fields);
  const schema = schemaService.compile({
    schemaId: 'syncytium-nested-topologies-v1', fields,
    invariants: configuration.invariants || []
  });
  const session = syncytium.createSession(mission, { ...configuration, schema, nuclearDomains: domains });
  return Promise.resolve(session).then((created) => ({
    ...created,
    nestedTopologies: nested.map((item) => ({
      parentDomainId: item.parentDomainId, topologyId: item.topologyId, mode: item.mode,
      requiredCapabilities: topologyCapabilities.capabilitiesForMode(item.mode).required,
      domainIds: item.subdomains.map((domain) => nestedDomainId(item, domain.domainId))
    }))
  }));
}

function normalizeFields(input = {}) {
  return Object.fromEntries(Object.entries(input).map(([path, definition]) => [path, {
    ...definition, ownerDomain: 'shared-state', visibility: definition.visibility || 'DOMAIN',
    consistencyZone: definition.consistencyZone || 'INVARIANT_PRESERVING'
  }]));
}

function normalizeTopologies(input, parentDomains) {
  if (!Array.isArray(input) || !input.length || !Array.isArray(parentDomains) || !parentDomains.length) {
    throw nestedError('Nested Syncytium requires parentDomains and nestedTopologies.');
  }
  return input.map((topology) => normalizeTopology(topology, parentDomains));
}

function normalizeTopology(topology, parents) {
  const parentDomainId = String(topology?.parentDomainId || '').trim();
  const topologyId = safeId(topology?.topologyId);
  const mode = String(topology?.mode || '').trim().toLowerCase();
  if (!parents.some((item) => item.domainId === parentDomainId) || !topologyId || !NESTED_MODES.has(mode)) {
    throw nestedError('Each nested topology requires a known parent, safe topologyId and supported mode.');
  }
  if (!Array.isArray(topology.subdomains) || !topology.subdomains.length) {
    throw nestedError(`Nested topology '${topologyId}' requires subdomains.`);
  }
  return { ...topology, parentDomainId, topologyId, mode, subdomains: topology.subdomains.map(normalizeSubdomain) };
}

function normalizeSubdomain(domain) {
  const domainId = safeId(domain?.domainId);
  const members = stringList(domain?.members);
  if (!domainId || !members.length) throw nestedError('Nested subdomains require a safe id and at least one member.');
  return { ...domain, domainId, members };
}

function compileDomains(topologies, fields) {
  const members = [...new Set(topologies.flatMap((topology) => topology.subdomains.flatMap((domain) => domain.members)))];
  const domains = [{ domainId: 'shared-state', members, owns: Object.keys(fields) }];
  const parents = [...new Set(topologies.map((topology) => topology.parentDomainId))];
  for (const parentDomainId of parents) {
    domains.push({ domainId: parentDomainId, members: topologyMembers(topologies, parentDomainId) });
  }
  for (const topology of topologies) domains.push(...topologyDomains(topology, fields));
  const ids = domains.map((domain) => domain.domainId);
  if (new Set(ids).size !== ids.length) throw nestedError('Nested Syncytium domain identifiers must be unique.');
  return domains;
}

function topologyDomains(topology, fields) {
  const rootId = `${topology.parentDomainId}${SEPARATOR}${topology.topologyId}`;
  const members = [...new Set(topology.subdomains.flatMap((domain) => domain.members))];
  return [
    { domainId: rootId, members },
    ...topology.subdomains.map((domain) => ({
      domainId: nestedDomainId(topology, domain.domainId), members: domain.members,
      mayRead: domain.mayRead || topology.mayRead || Object.keys(fields),
      mayWrite: domain.mayWrite || topology.mayWrite || []
    }))
  ];
}

function topologyMembers(topologies, parentDomainId) {
  return [...new Set(topologies.filter((topology) => topology.parentDomainId === parentDomainId)
    .flatMap((topology) => topology.subdomains.flatMap((domain) => domain.members)))];
}

async function applyOperation(context) {
  const { sessionId, request, syncytium } = context;
  validateNestedRequest(request, request?.operation);
  const operation = { ...request.operation, domainId: request.domainId };
  return syncytium.applyOperation(sessionId, operation, {
    ...(request.options || {}), domainId: request.domainId
  });
}

async function applyTransaction(context) {
  const { sessionId, request, syncytium } = context;
  if (!Array.isArray(request?.transaction?.operations)) throw nestedError('Nested transaction requires operations.');
  validateNestedRequest(request, request.transaction.operations[0]);
  const transaction = {
    ...request.transaction,
    operations: request.transaction.operations.map((operation) => ({ ...operation, domainId: request.domainId }))
  };
  return syncytium.applyTransaction(sessionId, transaction, {
    ...(request.options || {}), domainId: request.domainId
  });
}

function validateNestedRequest(request, operation) {
  if (!request?.domainId || request.domainId.split(SEPARATOR).length !== 3) {
    throw nestedError('Nested operations must target a leaf subdomain.');
  }
  if (!operation?.kind) throw nestedError('Nested operation requires a kind.');
}

async function nestedSnapshot(context) {
  const { sessionId, syncytium } = context;
  const request = context.request || {};
  const snapshot = await syncytium.snapshot(sessionId, request.options || {});
  const domain = snapshot.domains[request.domainId];
  if (!domain || request.domainId.split(SEPARATOR).length !== 3) throw nestedError('Unknown nested leaf domain.');
  const shared = projections.projectSnapshot({ snapshot: snapshot.shared, schema: snapshot.schema, domain });
  const schema = projections.projectSchema(snapshot.schema, domain);
  return { ...snapshot, shared, schema, domains: { [request.domainId]: domain } };
}

function nestedDomainId(topology, domainId) {
  return `${topology.parentDomainId}${SEPARATOR}${topology.topologyId}${SEPARATOR}${domainId}`;
}

function safeId(value) {
  const id = String(value || '').trim();
  return id && !id.includes(SEPARATOR) ? id : '';
}

function stringList(items) {
  return Array.isArray(items) ? [...new Set(items.map((item) => String(item).trim()).filter(Boolean))] : [];
}

function nestedError(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_NESTED_TOPOLOGY_INVALID' });
}

module.exports = { createNestedTopologyService };
