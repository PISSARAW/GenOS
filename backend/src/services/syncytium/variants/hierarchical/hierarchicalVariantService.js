'use strict';

const schemaService = require('../../../syncytiumSchemaService');
const projections = require('../../sync/projectionMaterializer');
const domainsService = require('../../domains/nuclearDomainService');
const { randomUUID } = require('node:crypto');

function createHierarchicalVariantService(syncytium) {
  return {
    createHierarchicalSession: (mission, configuration) => createSession(mission, configuration, syncytium),
    applyRegionalOperation: (sessionId, request) => applyRegionalOperation({ sessionId, ...request, syncytium }),
    applyRegionalTransaction: (sessionId, request) => applyRegionalTransaction({ sessionId, ...request, syncytium }),
    reconcileRegionalBoundary: (sessionId, request) => reconcileRegionalBoundary({ sessionId, ...request, syncytium }),
    setRegionalFirebreak: (sessionId, request) => setFirebreak({ sessionId, ...request, syncytium }),
    regionalSnapshot: (sessionId, request) => regionalSnapshot({ sessionId, ...request, syncytium })
  };
}

function createSession(mission, configuration = {}, syncytium) {
  const regions = normalizeRegions(configuration.regions);
  const contracts = normalizeContracts(configuration.sharedContracts);
  const fieldEntries = [...localFields(regions), ...contractFields(contracts)];
  const schema = schemaService.compile({
    schemaId: 'syncytium-hierarchical-v1', fields: Object.fromEntries([...fieldEntries, ['hierarchy.firebreaks', {
      dataType: 'MAP', consistencyZone: 'INVARIANT_PRESERVING', ownerDomain: 'organism', visibility: 'GLOBAL'
    }], ['hierarchy.boundaryReconciliations', {
      dataType: 'ADD_WINS_SET', consistencyZone: 'APPEND_ONLY', ownerDomain: 'organism', visibility: 'PRIVATE'
    }]]),
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
    { domainId: 'organism', members, owns: [...contractPaths, 'hierarchy.firebreaks'] },
    ...regions.map((region) => ({
      domainId: region.regionId, members: region.members,
      owns: (region.localFields || []).map((field) => typeof field === 'string' ? field : field.path),
      mayRead: contractPaths, mayWrite: contractPaths, subscriptions: contractPaths
    }))
  ];
}

async function applyRegionalOperation(context) {
  const snapshot = await assertRegionOpen(context);
  const operation = { ...context.operation, domainId: context.regionId };
  const result = await context.syncytium.applyTransaction(context.sessionId, {
    txId: `regional:${operation.opId}`, operations: [operation],
    preconditions: [{ op: 'state_version', value: snapshot.shared.totalOps }], commitPolicy: 'SERIALIZABLE'
  }, {
    ...(context.options || {}), domainId: context.regionId
  });
  return { ...result, deltaRecipients: result.deltas?.[0]?.recipients || [] };
}

async function applyRegionalTransaction(context) {
  if (!Array.isArray(context.transaction?.operations)) throw hierarchyError('A regional transaction requires operations.');
  const snapshot = await assertRegionOpen(context);
  const transaction = {
    ...context.transaction,
    preconditions: [...(context.transaction.preconditions || []), { op: 'state_version', value: snapshot.shared.totalOps }],
    operations: context.transaction.operations.map((operation) => ({ ...operation, domainId: context.regionId }))
  };
  return context.syncytium.applyTransaction(context.sessionId, transaction, {
    ...(context.options || {}), domainId: context.regionId
  });
}

async function setFirebreak(context) {
  if (!context.regionId || typeof context.active !== 'boolean' || !context.actorId) {
    throw hierarchyError('A firebreak update requires regionId, actorId and active.');
  }
  const snapshot = await context.syncytium.snapshot(context.sessionId, context.options || {});
  if (!snapshot.domains[context.regionId] || context.regionId === 'organism') throw hierarchyError(`Unknown region '${context.regionId}'.`);
  if (!context.active) assertBoundaryReconciled(snapshot, context);
  return setFirebreakValues(context, snapshot);
}

function assertBoundaryReconciled(snapshot, context) {
  const fields = snapshot.schema.fields;
  const requiredPaths = context.requiredContracts || Object.entries(fields)
    .filter(([path, field]) => path !== 'hierarchy.firebreaks' && field.visibility === 'GLOBAL')
    .map(([path]) => path);
  const records = snapshot.shared.sharedFields['hierarchy.boundaryReconciliations'] || [];
  const latest = records.filter((item) => item.regionId === context.regionId)
    .sort((left, right) => right.reconciledAt - left.reconciledAt)[0];
  const currentState = snapshot.shared.sharedFields;
  const coversAll = latest && requiredPaths.every((path) => latest.contractPaths.includes(path)
    && JSON.stringify(latest.boundaryState[path]) === JSON.stringify(currentState[path]));
  if (!coversAll) throw Object.assign(new Error('Required shared boundary contracts must be reconciled before reopening the region.'), {
    code: 'SYNCYTIUM_BOUNDARY_RECONCILIATION_REQUIRED'
  });
}

async function reconcileRegionalBoundary(context) {
  const snapshot = await context.syncytium.snapshot(context.sessionId, context.options || {});
  if (!snapshot.domains[context.regionId] || context.regionId === 'organism') throw hierarchyError(`Unknown region '${context.regionId}'.`);
  if (!snapshot.shared.sharedFields['hierarchy.firebreaks']?.[context.regionId]?.active) {
    throw hierarchyError('Boundary reconciliation is only required while a region firebreak is active.');
  }
  const available = Object.entries(snapshot.schema.fields)
    .filter(([path, field]) => path !== 'hierarchy.firebreaks' && field.visibility === 'GLOBAL')
    .map(([path]) => path);
  const contractPaths = context.contractPaths || available;
  if (contractPaths.some((path) => !available.includes(path))) throw hierarchyError('Boundary reconciliation includes a non-contract field.');
  const boundaryState = Object.fromEntries(contractPaths.map((path) => [path, snapshot.shared.sharedFields[path]]));
  const receipt = { receiptId: context.receiptId || randomUUID(), regionId: context.regionId,
    contractPaths: [...contractPaths], boundaryState, reconciledAt: Date.now(), reconciledBy: context.actorId };
  return reconcileRegionalBoundaryValues(context, receipt, snapshot);
}

async function assertRegionOpen(context) {
  const snapshot = await context.syncytium.snapshot(context.sessionId, context.options || {});
  if (!snapshot.domains[context.regionId] || context.regionId === 'organism') throw hierarchyError(`Unknown region '${context.regionId}'.`);
  if (snapshot.shared.sharedFields['hierarchy.firebreaks']?.[context.regionId]?.active) {
    throw Object.assign(new Error(`Region '${context.regionId}' is isolated by an active firebreak.`), { code: 'SYNCYTIUM_REGION_FIREBREAK_ACTIVE' });
  }
  return snapshot;
}

async function regionalSnapshot(context) {
  const snapshot = await context.syncytium.snapshot(context.sessionId, context.options || {});
  const region = snapshot.domains[context.regionId];
  if (!region || context.regionId === 'organism') throw hierarchyError(`Unknown region '${context.regionId}'.`);
  const projected = projections.projectSnapshot({ snapshot: snapshot.shared, schema: snapshot.schema, domain: region });
  const projectedSchema = projections.projectSchema(snapshot.schema, region);
  const boundaryPaths = Object.keys(projectedSchema.fields).filter((path) => path !== 'hierarchy.firebreaks'
    && snapshot.schema.fields[path].visibility === 'GLOBAL');
  const boundaryState = Object.fromEntries(boundaryPaths.filter((path) => Object.hasOwn(projected.sharedFields, path))
    .map((path) => [path, projected.sharedFields[path]]));
  const visiblePathCount = projected.visiblePaths.filter((path) => path !== 'hierarchy.firebreaks').length;
  return {
    ...snapshot,
    shared: projected,
    schema: projectedSchema,
    domains: { [context.regionId]: region },
    hierarchy: { regionId: context.regionId, boundaryPaths, boundaryState, localPathCount: visiblePathCount - boundaryPaths.length }
  };
}

function stringList(items) {
  return Array.isArray(items) ? [...new Set(items.map((item) => String(item).trim()).filter(Boolean))] : [];
}

function hierarchyError(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_HIERARCHY_INVALID' });
}

module.exports = { createHierarchicalVariantService };

function setFirebreakValues(context, snapshot) {
  return context.syncytium.applyTransaction(context.sessionId, {
    txId: context.txId || randomUUID(), operations: [{
      opId: context.opId || randomUUID(), actorId: context.actorId, domainId: 'organism',
      kind: { type: 'typed_field', key: 'hierarchy.firebreaks', action: 'set', entryKey: context.regionId,
        value: { regionId: context.regionId, active: context.active, reason: context.reason || null, updatedAt: Date.now() } }
    }], preconditions: [{ op: 'state_version', value: snapshot.shared.totalOps }], commitPolicy: 'SERIALIZABLE'
  }, { ...(context.options || {}), domainId: 'organism' });
}

function reconcileRegionalBoundaryValues(context, receipt, snapshot) {
  return context.syncytium.applyTransaction(context.sessionId, {
    txId: context.txId || randomUUID(), operations: [{ opId: context.opId || randomUUID(),
      actorId: context.actorId, domainId: 'organism', kind: { type: 'typed_field',
        key: 'hierarchy.boundaryReconciliations', action: 'add', value: receipt } }],
    preconditions: [{ op: 'state_version', value: snapshot.shared.totalOps }], commitPolicy: 'SERIALIZABLE'
  }, { ...(context.options || {}), domainId: 'organism' });
}
