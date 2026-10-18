'use strict';

const leases = require('./leases');
const storage = require('./storage');
const views = require('./views');

function virtualDescriptor(view) {
  return {
    backend: 'gqwf',
    workspaceId: view.workspaceId,
    baseHash: view.baseHash,
    viewId: view.id,
    version: view.version,
    state: 'virtual',
    materialized: false,
    path: null
  };
}

async function openExecutionWorkspace(db, input) {
  await storage.root(db, input.workspaceId, input.baseHash);
  const view = await views.createView(db, input);
  return virtualDescriptor(view);
}

async function materializeExecutionWorkspace(db, input) {
  const current = await storage.view(db, input.workspaceId, input.viewId);
  if (current.base_hash !== input.baseHash) {
    throw new Error('GQWF execution workspace base changed before materialization.');
  }
  const sealed = await views.sealView(db, {
    workspaceId: input.workspaceId,
    viewId: input.viewId,
    expectedVersion: input.expectedVersion
  });
  const lease = await leases.materializeRoot(db, {
    workspaceId: input.workspaceId,
    rootHash: sealed.rootHash
  });
  return {
    backend: 'gqwf',
    workspaceId: input.workspaceId,
    baseHash: input.baseHash,
    viewId: input.viewId,
    version: sealed.version,
    candidateHash: sealed.rootHash,
    leaseId: lease.leaseId,
    state: 'materialized',
    materialized: true,
    path: lease.path
  };
}

async function ingestExecutionWorkspace(db, input) {
  const ingested = await leases.ingestLease(db, input);
  return {
    backend: 'gqwf',
    workspaceId: input.workspaceId,
    leaseId: input.leaseId,
    previousHash: ingested.previousRootHash,
    candidateHash: ingested.rootHash,
    fileCount: ingested.fileCount,
    state: 'ingested',
    materialized: true
  };
}

async function releaseExecutionWorkspace(db, input) {
  await leases.releaseLease(db, input);
  return {
    backend: 'gqwf',
    workspaceId: input.workspaceId,
    leaseId: input.leaseId,
    state: 'released',
    materialized: false,
    path: null
  };
}

module.exports = {
  openExecutionWorkspace,
  materializeExecutionWorkspace,
  ingestExecutionWorkspace,
  releaseExecutionWorkspace
};
