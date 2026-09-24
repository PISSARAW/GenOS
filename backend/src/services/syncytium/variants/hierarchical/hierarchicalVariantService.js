'use strict';

const schemaService = require('../../../syncytiumSchemaService');
const projections = require('../../sync/projectionMaterializer');
const domainsService = require('../../domains/nuclearDomainService');

function createHierarchicalVariantService(syncytium) {
  return {
    createHierarchicalSession: (mission, configuration) => createSession(mission, configuration, syncytium),
    applyRegionalOperation: (sessionId, request) => applyRegionalOperation({ sessionId, ...request, syncytium }),
    applyRegionalTransaction: (sessionId, request) => applyRegionalTransaction({ sessionId, ...request, syncytium }),
    regionalSnapshot: (sessionId, request) => regionalSnapshot({ sessionId, ...request, syncytium })
  };
}

function createSession(mission, configuration = {}, syncytium) {
  const regions = normalizeRegions(configuration.regions);
  const contracts = normalizeContracts(configuration.sharedContracts);
  const fieldEntries = [...localFields(regions), ...contractFields(contracts)];
  const schema = schemaService.compile({
    schemaId: 'syncytium-hierarchical-v1', fields: Object.fromEntries(fieldEntries),
    invariants: configuration.invariants || []
  });
  return syncytium.createSession(mission, {
    ...configuration,
    schema,
    nuclearDomains: buildDomains(regions, contracts)
  });
}

function normalizeRegions(input) {
  if (!Array.isArray(input) || input.length < 2) throw hierarchyError('Hierarchical Syncytium requires at least two regions.');
  const ids = input.map((region) => String(region?.regionId || '').trim());
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw hierarchyError('Each region requires a unique regionId.');
  return input.map((region, index) => ({ ...region, regionId: ids[index], members: stringList(region.members) }));
}

function normalizeContracts(input) {
  if (!Array.isArray(input)) throw hierarchyError('sharedContracts must be a list.');
  return input.map((contract) => {
    const path = String(contract?.path || '').trim();
    if (!path) throw hierarchyError('Each shared contract requires a field path.');
    return { ...contract, path };
  });
}

function localFields(regions) {
  return regions.flatMap((region) => (region.localFields || []).map((item) => {
    const definition = typeof item === 'string' ? { path: item } : item;
    if (!definition?.path) throw hierarchyError(`Region '${region.regionId}' has a local field without a path.`);
    return [definition.path, {
      ...definition, ownerDomain: region.regionId, visibility: 'PRIVATE', replicationPolicy: 'OWNER_ONLY'
    }];
  }));
}

function contractFields(contracts) {
  return contracts.map((contract) => [contract.path, {
    ...contract, visibility: 'GLOBAL', replicationPolicy: 'ALL_SUBSCRIBED',
    consistencyZone: contract.consistencyZone || 'INVARIANT_PRESERVING', ownerDomain: 'organism'
  }]);
}

function buildDomains(regions, contracts) {
  const contractPaths = contracts.map((contract) => contract.path);
  const members = [...new Set(regions.flatMap((region) => region.members))];
  return [
    { domainId: 'organism', members, owns: contractPaths },
    ...regions.map((region) => ({
      domainId: region.regionId, members: region.members,
      owns: (region.localFields || []).map((field) => typeof field === 'string' ? field : field.path),
      mayRead: contractPaths, mayWrite: contractPaths, subscriptions: contractPaths
    }))
  ];
}

async function applyRegionalOperation(context) {
  const operation = { ...context.operation, domainId: context.regionId };
  return context.syncytium.applyOperation(context.sessionId, operation, {
    ...(context.options || {}), domainId: context.regionId
  });
}

async function applyRegionalTransaction(context) {
  if (!Array.isArray(context.transaction?.operations)) throw hierarchyError('A regional transaction requires operations.');
  const transaction = {
    ...context.transaction,
    operations: context.transaction.operations.map((operation) => ({ ...operation, domainId: context.regionId }))
  };
  return context.syncytium.applyTransaction(context.sessionId, transaction, {
    ...(context.options || {}), domainId: context.regionId
  });
}

async function regionalSnapshot(context) {
  const snapshot = await context.syncytium.snapshot(context.sessionId, context.options || {});
  const region = snapshot.domains[context.regionId];
  if (!region || context.regionId === 'organism') throw hierarchyError(`Unknown region '${context.regionId}'.`);
  const projected = projections.projectSnapshot({ snapshot: snapshot.shared, schema: snapshot.schema, domain: region });
  const projectedSchema = projections.projectSchema(snapshot.schema, region);
  const boundaryPaths = Object.keys(projectedSchema.fields).filter((path) => snapshot.schema.fields[path].visibility === 'GLOBAL');
  const boundaryState = Object.fromEntries(boundaryPaths.filter((path) => Object.hasOwn(projected.sharedFields, path))
    .map((path) => [path, projected.sharedFields[path]]));
  return {
    ...snapshot,
    shared: projected,
    schema: projectedSchema,
    domains: { [context.regionId]: region },
    hierarchy: { regionId: context.regionId, boundaryPaths, boundaryState, localPathCount: projected.visiblePaths.length - boundaryPaths.length }
  };
}

function stringList(items) {
  return Array.isArray(items) ? [...new Set(items.map((item) => String(item).trim()).filter(Boolean))] : [];
}

function hierarchyError(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_HIERARCHY_INVALID' });
}

module.exports = { createHierarchicalVariantService };
