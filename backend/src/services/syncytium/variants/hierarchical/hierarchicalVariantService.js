'use strict';

const schemaService = require('../../../syncytiumSchemaService');
const projections = require('../../sync/projectionMaterializer');
const { randomUUID } = require('node:crypto');

function createHierarchicalVariantService(syncytium) {
  return {
    createHierarchicalSession: (mission, configuration) => createSession(mission, configuration, syncytium),
    applyRegionalOperation: (sessionId, request) => applyRegionalOperation({ sessionId, ...request, syncytium }),
    applyRegionalTransaction: (sessionId, request) => applyRegionalTransaction({ sessionId, ...request, syncytium }),
    setRegionalFirebreak: (sessionId, request) => setFirebreak({ sessionId, ...request, syncytium }),
    reconcileBoundaryContracts: (sessionId, request) => reconcileContracts({ sessionId, ...request, syncytium }),
    liftFirebreak: (sessionId, request) => liftFirebreakAtomic({ sessionId, ...request, syncytium }),
    regionalSnapshot: (sessionId, request) => regionalSnapshot({ sessionId, ...request, syncytium })
  };
}

function createSession(mission, configuration, syncytium) { const regions = normalizeRegions(configuration.regions); const contracts = normalizeContracts(configuration.sharedContracts); const fieldEntries = [...localFields(regions), ...contractFields(contracts)]; const schema = schemaService.compile({ schemaId: 'syncytium-hierarchical-v1', fields: Object.fromEntries([...fieldEntries, ['hierarchy.firebreaks', { dataType: 'MAP', consistencyZone: 'INVARIANT_PRESERVING', ownerDomain: 'organism', visibility: 'GLOBAL' }]]), invariants: configuration.invariants || [] }); return syncytium.createSession(mission, { ...configuration, schema, nuclearDomains: buildDomains(regions, contracts) }); }
function normalizeRegions(input) { if (!Array.isArray(input) || input.length < 2) throw hierarchyError('Hierarchical Syncytium requires at least two regions.'); const ids = input.map(r => String(r?.regionId || '').trim()); if (ids.some(id => !id) || new Set(ids).size !== ids.length) throw hierarchyError('Each region requires a unique regionId.'); return input.map((r, i) => ({ ...r, regionId: ids[i], members: stringList(r.members) })); }
function normalizeContracts(input) { if (!Array.isArray(input)) throw hierarchyError('sharedContracts must be a list.'); return input.map(c => { const p = String(c?.path || '').trim(); if (!p) throw hierarchyError('Each shared contract requires a field path.'); return { ...c, path: p }; }); }
function localFields(regions) { return regions.flatMap(r => (r.localFields || []).map(item => { const d = typeof item === 'string' ? { path: item } : item; if (!d?.path) throw hierarchyError(`Region '${r.regionId}' has a local field without a path.`); return [d.path, { ...d, ownerDomain: r.regionId, visibility: 'PRIVATE', replicationPolicy: 'OWNER_ONLY' }]; })); }
function contractFields(contracts) { return contracts.map(c => [c.path, { ...c, visibility: 'GLOBAL', replicationPolicy: 'ALL_SUBSCRIBED', consistencyZone: c.consistencyZone || 'INVARIANT_PRESERVING', ownerDomain: 'organism' }]); }
function buildDomains(regions, contracts) { const contractPaths = contracts.map(c => c.path); const members = [...new Set(regions.flatMap(r => r.members))]; return [{ domainId: 'organism', members, owns: [...contractPaths, 'hierarchy.firebreaks'] }, ...regions.map(r => ({ domainId: r.regionId, members: r.members, owns: (r.localFields || []).map(f => typeof f === 'string' ? f : f.path), mayRead: contractPaths, mayWrite: contractPaths, subscriptions: contractPaths }))]; }

async function applyRegionalOperation(ctx) { const { sessionId, regionId, operation, options, syncytium } = ctx; await assertRegionOpen({ sessionId, regionId, options, syncytium }); return syncytium.applyOperation(sessionId, { ...operation, domainId: regionId }, { ...(options || {}), domainId: regionId }); }
async function applyRegionalTransaction(ctx) { const { sessionId, regionId, transaction, options, syncytium } = ctx; if (!Array.isArray(transaction?.operations)) throw hierarchyError('A regional transaction requires operations.'); await assertRegionOpen({ sessionId, regionId, options, syncytium }); return syncytium.applyTransaction(sessionId, { ...transaction, operations: transaction.operations.map(op => ({ ...op, domainId: regionId })) }, { ...(options || {}), domainId: regionId }); }

async function reconcileContracts(ctx) {
  const { sessionId, regionId, boundaryPaths, options, syncytium, actorId } = ctx;
  if (!regionId || !Array.isArray(boundaryPaths) || boundaryPaths.length === 0) throw hierarchyError('Reconciliation requires regionId and non-empty boundaryPaths array.');

  const snapshot = await syncytium.snapshot(sessionId, options || {});
  if (!snapshot.domains[regionId] || regionId === 'organism') throw hierarchyError(`Unknown region '${regionId}'.`);
  if (snapshot.shared.sharedFields['hierarchy.firebreaks']?.[regionId]?.active) throw Object.assign(new Error(`Region '${regionId}' is isolated by an active firebreak.`), { code: 'SYNCYTIUM_REGION_FIREBREAK_ACTIVE' });

  const contractPaths = Object.keys(snapshot.schema.fields).filter(p => snapshot.schema.fields[p].visibility === 'GLOBAL' && p !== 'hierarchy.firebreaks');
  const missing = boundaryPaths.filter(p => !contractPaths.includes(p));
  if (missing.length > 0) throw hierarchyError(`Boundary paths not found in shared contracts: ${missing.join(', ')}`);

  const projected = projections.projectSnapshot({ snapshot: snapshot.shared, schema: snapshot.schema, domain: snapshot.domains[regionId] });
  const results = boundaryPaths.map(path => reconcilePath(snapshot, projected, path));
  const allReconciled = results.every(r => r.reconciled);
  const hasConflicts = results.some(r => r.conflict);

  const reconciliationId = randomUUID();
  await syncytium.applyOperation(sessionId, buildReconciliationRecordOp(reconciliationId, regionId, boundaryPaths, allReconciled, hasConflicts, results, actorId), { ...(options || {}), domainId: 'organism' });

  return { reconciliationId, regionId, allReconciled, hasConflicts, results };
}

function reconcilePath(snapshot, projected, path) { const organismValue = snapshot.shared.sharedFields[path]; const regionValue = projected.sharedFields[path]; if (organismValue && regionValue) { if (JSON.stringify(organismValue) !== JSON.stringify(regionValue)) return { path, reconciled: false, conflict: true, resolution: { strategy: 'ORGANISM_WINS', organismValue, regionValue } }; return { path, reconciled: true, conflict: false, resolution: null }; } if (organismValue && !regionValue) return { path, reconciled: true, conflict: false, resolution: { strategy: 'PROPAGATE_FROM_ORGANISM', value: organismValue } }; if (!organismValue && regionValue) return { path, reconciled: true, conflict: false, resolution: { strategy: 'PROPAGATE_TO_ORGANISM', value: regionValue } }; return { path, reconciled: true, conflict: false, resolution: null }; }

function buildReconciliationRecordOp(id, regionId, boundaryPaths, allReconciled, hasConflicts, results, actorId) { return { opId: randomUUID(), actorId, domainId: 'organism', kind: { type: 'typed_field', key: 'hierarchy.firebreaks', action: 'set', entryKey: `reconciliation-${id}`, value: { reconciliationId: id, regionId, boundaryPaths, reconciled: allReconciled, conflicts: hasConflicts, details: results, timestamp: Date.now(), actorId } } }; }

async function setFirebreak(ctx) { const { sessionId, regionId, active, actorId, reason, options, syncytium } = ctx; if (!regionId || typeof active !== 'boolean' || !actorId) throw hierarchyError('A firebreak update requires regionId, actorId and active.'); const snapshot = await syncytium.snapshot(sessionId, options || {}); if (!snapshot.domains[regionId] || regionId === 'organism') throw hierarchyError(`Unknown region '${regionId}'.`); return syncytium.applyOperation(sessionId, { opId: randomUUID(), actorId, domainId: 'organism', kind: { type: 'typed_field', key: 'hierarchy.firebreaks', action: 'set', entryKey: regionId, value: { regionId, active, reason: reason || null, updatedAt: Date.now() } } }, { ...(options || {}), domainId: 'organism' }); }

async function liftFirebreakAtomic(ctx) { const { sessionId, regionId, reconciliationId, actorId, options, syncytium } = ctx; if (!regionId || !reconciliationId || !actorId) throw hierarchyError('Lifting firebreak requires regionId, reconciliationId and actorId.'); const snapshot = await syncytium.snapshot(sessionId, options || {}); if (!snapshot.domains[regionId] || regionId === 'organism') throw hierarchyError(`Unknown region '${regionId}'.`); const firebreaks = snapshot.shared.sharedFields['hierarchy.firebreaks'] || {}; const firebreak = firebreaks[regionId]; if (!firebreak || !firebreak.active) throw hierarchyError(`No active firebreak for region '${regionId}'.`); const reconciliationRecord = firebreaks[`reconciliation-${reconciliationId}`]; if (!reconciliationRecord || !reconciliationRecord.reconciled) throw hierarchyError(`Reconciliation ${reconciliationId} not found or not successful. Cannot lift firebreak.`); if (reconciliationRecord.conflicts) throw hierarchyError(`Reconciliation ${reconciliationId} has unresolved conflicts. Cannot lift firebreak.`); if (reconciliationRecord.regionId !== regionId) throw hierarchyError(`Reconciliation ${reconciliationId} is for region '${reconciliationRecord.regionId}', not '${regionId}'.`); return syncytium.applyTransaction(sessionId, { txId: randomUUID(), operations: [buildLiftFirebreakOp(regionId, firebreak, reconciliationId, actorId), buildLiftLogOp(reconciliationId, regionId, actorId)], preconditions: [{ op: 'state_version', value: snapshot.shared.totalOps }], commitPolicy: 'SERIALIZABLE' }, { ...(options || {}), domainId: 'organism' }); }
function buildLiftFirebreakOp(regionId, firebreak, reconciliationId, actorId) { return { opId: randomUUID(), actorId, domainId: 'organism', kind: { type: 'typed_field', key: 'hierarchy.firebreaks', action: 'set', entryKey: regionId, value: { ...firebreak, active: false, liftedAt: Date.now(), liftedBy: actorId, reconciliationId } } }; }
function buildLiftLogOp(reconciliationId, regionId, actorId) { return { opId: randomUUID(), actorId, domainId: 'organism', kind: { type: 'typed_field', key: 'hierarchy.firebreaks', action: 'set', entryKey: `lift-log-${reconciliationId}`, value: { reconciliationId, regionId, liftedAt: Date.now(), liftedBy: actorId, status: 'LIFTED' } } }; }

async function assertRegionOpen(ctx) { const { sessionId, regionId, options, syncytium } = ctx; const snapshot = await syncytium.snapshot(sessionId, options || {}); if (!snapshot.domains[regionId] || regionId === 'organism') throw hierarchyError(`Unknown region '${regionId}'.`); if (snapshot.shared.sharedFields['hierarchy.firebreaks']?.[regionId]?.active) throw Object.assign(new Error(`Region '${regionId}' is isolated by an active firebreak.`), { code: 'SYNCYTIUM_REGION_FIREBREAK_ACTIVE' }); }

async function regionalSnapshot(ctx) {
  const { sessionId, regionId, options, syncytium } = ctx;
  const snapshot = await syncytium.snapshot(sessionId, options || {});
  const region = snapshot.domains[regionId];
  if (!region || regionId === 'organism') throw hierarchyError(`Unknown region '${regionId}'.`);
  const projected = projections.projectSnapshot({ snapshot: snapshot.shared, schema: snapshot.schema, domain: region });
  const projectedSchema = projections.projectSchema(snapshot.schema, region);
  const boundaryPaths = Object.keys(projectedSchema.fields).filter(p => p !== 'hierarchy.firebreaks' && snapshot.schema.fields[p].visibility === 'GLOBAL');
  const boundaryState = Object.fromEntries(boundaryPaths.filter(p => Object.hasOwn(projected.sharedFields, p)).map(p => [p, projected.sharedFields[p]]));
  const visiblePathCount = projected.visiblePaths.filter(p => p !== 'hierarchy.firebreaks').length;
  const firebreaks = snapshot.shared.sharedFields['hierarchy.firebreaks'] || {};
  const regionFirebreak = firebreaks[regionId];
  const recentReconciliations = Object.entries(firebreaks).filter(([k, v]) => k.startsWith('reconciliation-') && v.regionId === regionId).map(([, v]) => v).sort((a, b) => b.timestamp - a.timestamp).slice(-10);
  return { ...snapshot, shared: projected, schema: projectedSchema, domains: { [regionId]: region }, hierarchy: { regionId, boundaryPaths, boundaryState, localPathCount: visiblePathCount - boundaryPaths.length, firebreak: regionFirebreak || null, recentReconciliations } };
}

function stringList(items) { return Array.isArray(items) ? [...new Set(items.map(i => String(i).trim()).filter(Boolean))] : []; }
function hierarchyError(message) { return Object.assign(new Error(message), { code: 'SYNCYTIUM_HIERARCHY_INVALID' }); }

module.exports = { createHierarchicalVariantService };