'use strict';

const metadataStore = require('./metadataStore');
const storage = require('./storage');

const PROTOCOL = 'gqwf-catalog-maintenance-v1';
const RETAINED_REF_COUNT = 64;
const HASH = /^[a-f0-9]{64}$/;

function canonicalJson(value) { return JSON.stringify(value); }

async function catalogState(db, workspaceId) {
  return db.get(`SELECT revision, catalog_hash FROM gqwf_catalog_state
    WHERE workspace_id = ?`, workspaceId);
}

function assertWorkspaceRefs(refs, workspaceId) {
  if (refs.some((ref) => ref.workspaceId !== workspaceId)) {
    throw new Error('GQWF metadata catalog ref belongs to another workspace.');
  }
}

function validCatalogBinding(input, parsed) {
  const previousValid = input.revision === 1
    ? parsed?.previousCatalogHash === null : HASH.test(parsed?.previousCatalogHash || '');
  return parsed?.protocol === 'gqwf-catalog-v1'
    && parsed.workspaceId === input.workspaceId && parsed.revision === input.revision
    && previousValid && Array.isArray(parsed.roots) && Array.isArray(parsed.heads)
    && Array.isArray(parsed.leases);
}

async function loadCatalog(input) {
  let parsed;
  try {
    parsed = JSON.parse(await metadataStore.readObject(input.workspacePath, input.catalogHash));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('GQWF metadata catalog JSON is invalid.');
    }
    throw error;
  }
  if (!validCatalogBinding(input, parsed)) {
    throw new Error('GQWF metadata catalog publication binding is invalid.');
  }
  return parsed;
}

async function verifyChain(input) {
  let revision = input.state.revision;
  let catalogHash = input.state.catalog_hash;
  const boundary = input.latest?.revision || 0;
  while (revision > boundary) {
    const catalog = await loadCatalog({ ...input, revision, catalogHash });
    if (revision === 1 && catalog.previousCatalogHash !== null) {
      throw new Error('GQWF metadata catalog genesis link is invalid.');
    }
    catalogHash = catalog.previousCatalogHash;
    revision -= 1;
  }
  if (input.latest && catalogHash !== input.latest.catalogHash) {
    throw new Error('GQWF metadata catalog publication chain diverged.');
  }
  if (!input.latest && (revision !== 0 || catalogHash !== null)) {
    throw new Error('GQWF metadata catalog publication chain is incomplete.');
  }
}

function compareState(state, latest) {
  if (!state || !latest) return;
  if (latest.revision > state.revision) {
    throw new Error('GQWF metadata catalog ref is newer than SQLite state.');
  }
  if (latest.revision === state.revision && latest.catalogHash !== state.catalog_hash) {
    throw new Error('GQWF metadata catalog state conflicts with its published ref.');
  }
}

async function reconcilePublication(input) {
  if (!input.state) {
    if (input.latest) {
      await loadCatalog({ ...input, revision: input.latest.revision,
        catalogHash: input.latest.catalogHash });
    }
    return false;
  }
  compareState(input.state, input.latest);
  const published = input.latest?.revision === input.state.revision;
  if (published) {
    await loadCatalog({ ...input, revision: input.state.revision,
      catalogHash: input.state.catalog_hash });
    return false;
  }
  await verifyChain(input);
  await metadataStore.writeRef(input.workspacePath, {
    protocol: 'gqwf-catalog-ref-v1', workspaceId: input.workspaceId,
    revision: input.state.revision, catalogHash: input.state.catalog_hash
  });
  return true;
}

function publicRef(ref) {
  return { revision: ref.revision, catalogHash: ref.catalogHash };
}

function maintenanceResult(input) {
  const body = { protocol: PROTOCOL, workspaceId: input.workspaceId,
    revision: input.latest?.revision || 0,
    catalogHash: input.latest?.catalogHash || null,
    republished: input.republished,
    retainedRefCount: input.retention.retained.length,
    prunedRefs: input.retention.pruned.map(publicRef) };
  return { ...body, maintenanceHash: metadataStore.digest(canonicalJson(body)) };
}

async function maintain(db, input) {
  const workspace = await storage.workspace(db, input.workspaceId);
  const state = await catalogState(db, input.workspaceId);
  const refs = await metadataStore.listRefs(workspace.path);
  assertWorkspaceRefs(refs, input.workspaceId);
  const shared = { workspacePath: workspace.path, workspaceId: input.workspaceId,
    state, latest: refs[0] || null };
  const republished = await reconcilePublication(shared);
  const publishedRefs = republished ? await metadataStore.listRefs(workspace.path) : refs;
  const retention = await metadataStore.pruneRefs(workspace.path,
    RETAINED_REF_COUNT, publishedRefs);
  assertWorkspaceRefs(retention.retained, input.workspaceId);
  return maintenanceResult({ workspaceId: input.workspaceId,
    latest: retention.retained[0] || null, republished, retention });
}

module.exports = { maintain, PROTOCOL, RETAINED_REF_COUNT };
