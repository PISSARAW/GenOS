'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const { withTransaction } = require('../../db');
const { parseManifest } = require('./manifest');
const catalogMaintenance = require('./catalogMaintenance');
const closureCatalog = require('./executionClosureCatalog');
const metadataStore = require('./metadataStore');
const storage = require('./storage');

const PROTOCOL = 'gqwf-catalog-v2';
const LEGACY_PROTOCOL = 'gqwf-catalog-v1';
const REPAIR_PROTOCOL = 'gqwf-metadata-repair-v1';
const HASH = /^[a-f0-9]{64}$/;
const STATUSES = new Set(['preparing', 'open', 'ingested', 'releasing', 'released', 'quarantined']);

function canonicalJson(value) { return JSON.stringify(value); }

function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

async function catalogRows(db, workspaceId) {
  return Promise.all([
    db.all(`SELECT root_hash, manifest_json FROM gqwf_roots
      WHERE workspace_id = ? ORDER BY root_hash`, workspaceId),
    db.all(`SELECT name, root_hash, generation FROM gqwf_heads
      WHERE workspace_id = ? ORDER BY name`, workspaceId),
    db.all(`SELECT id, root_hash, path, execution_path, status, created_at FROM gqwf_leases
      WHERE workspace_id = ? ORDER BY id`, workspaceId)
  ]);
}

async function rootEntries(workspacePath, rows) {
  const roots = [];
  for (const row of rows) {
    const manifest = parseManifest(row.manifest_json, row.root_hash);
    const storedHash = await metadataStore.putObject(workspacePath, row.manifest_json);
    if (storedHash !== row.root_hash) throw new Error('GQWF root manifest CAS identity changed.');
    roots.push({ rootHash: row.root_hash, manifest });
  }
  return roots;
}

function headEntries(rows) {
  return rows.map((row) => ({ name: row.name, rootHash: row.root_hash,
    generation: row.generation }));
}

function leaseEntries(rows) {
  return rows.map((row) => ({ id: row.id, rootHash: row.root_hash, path: row.path,
    executionPath: row.execution_path || row.path, status: row.status,
    createdAt: row.created_at }));
}

async function buildCatalog(db, input) {
  const workspace = await storage.workspace(db, input.workspaceId);
  const [roots, heads, leases] = await catalogRows(db, input.workspaceId);
  const executionClosures = await closureCatalog.entries(db, {
    workspaceId: input.workspaceId, workspacePath: workspace.path
  });
  return { protocol: PROTOCOL, workspaceId: input.workspaceId,
    revision: input.revision, previousCatalogHash: input.previousCatalogHash || null,
    roots: await rootEntries(workspace.path, roots),
    heads: headEntries(heads), leases: leaseEntries(leases), executionClosures };
}

async function catalogState(db, workspaceId) {
  return db.get(`SELECT revision, catalog_hash FROM gqwf_catalog_state
    WHERE workspace_id = ?`, workspaceId);
}

async function stageCatalog(db, workspaceId) {
  const workspace = await storage.workspace(db, workspaceId);
  const stored = await catalogState(db, workspaceId);
  const published = stored ? null : await metadataStore.latestRef(workspace.path);
  const previous = stored || (published && {
    revision: published.revision, catalog_hash: published.catalogHash
  });
  const revision = (previous?.revision || 0) + 1;
  const catalog = await buildCatalog(db, { workspaceId, revision,
    previousCatalogHash: previous?.catalog_hash || null });
  const catalogHash = await metadataStore.putObject(workspace.path, canonicalJson(catalog));
  await db.run(`INSERT INTO gqwf_catalog_state (workspace_id, revision, catalog_hash)
    VALUES (?, ?, ?) ON CONFLICT(workspace_id) DO UPDATE SET
      revision = excluded.revision, catalog_hash = excluded.catalog_hash`,
  workspaceId, revision, catalogHash);
  return { protocol: 'gqwf-catalog-ref-v1', workspaceId, revision, catalogHash };
}

async function publishRef(db, ref) {
  const workspace = await storage.workspace(db, ref.workspaceId);
  await metadataStore.writeRef(workspace.path, ref);
}

async function withCatalogMutation(db, input) {
  let result;
  let mutationError;
  try {
    result = await input.run();
  } catch (error) {
    mutationError = error;
  }
  try {
    await checkpointMetadata(db, { workspaceId: input.workspaceId });
  } catch (checkpointError) {
    if (!mutationError) throw checkpointError;
    mutationError.cause = checkpointError;
  }
  if (mutationError) throw mutationError;
  return result;
}

async function checkpointMetadata(db, input) {
  await catalogMaintenance.maintain(db, { workspaceId: input.workspaceId });
  const ref = await withTransaction(db, () => stageCatalog(db, input.workspaceId));
  await publishRef(db, ref);
  const maintenance = await catalogMaintenance.maintain(db, { workspaceId: input.workspaceId });
  return { checkpointed: true, revision: ref.revision, catalogHash: ref.catalogHash,
    maintenance };
}

function assertUnique(entries, key, label) {
  const values = new Set();
  for (const entry of entries) {
    if (values.has(entry[key])) throw new Error(`GQWF catalog has duplicate ${label}.`);
    values.add(entry[key]);
  }
}

function validateRoot(entry) {
  if (!entry || typeof entry !== 'object') throw new Error('GQWF catalog root is invalid.');
  const serialized = canonicalJson(entry.manifest);
  const parsed = parseManifest(serialized, entry.rootHash);
  return { rootHash: entry.rootHash, manifest: parsed };
}

function validateHead(entry, roots) {
  const valid = entry && typeof entry.name === 'string' && entry.name.length > 0
    && roots.has(entry.rootHash) && Number.isSafeInteger(entry.generation)
    && entry.generation >= 0;
  if (!valid) throw new Error('GQWF catalog head is invalid.');
  return entry;
}

function validateLeasePath(workspacePath, entry) {
  const parent = path.resolve(workspacePath, '.genos', 'gqwf', 'materialized');
  const container = path.resolve(entry.path || '');
  const executionPath = path.resolve(entry.executionPath || '');
  const expected = path.join(parent, `lease-${entry.id}`);
  const same = (left, right) => process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase() : left === right;
  const executionValid = same(executionPath, container)
    || (path.basename(executionPath) === 'root' && same(path.dirname(executionPath), container));
  if (!same(container, expected) || !executionValid) {
    throw new Error('GQWF catalog lease path is outside its managed root.');
  }
}

function validateLease(workspacePath, entry, roots) {
  const valid = entry && typeof entry.id === 'string' && entry.id.length > 0
    && roots.has(entry.rootHash) && STATUSES.has(entry.status)
    && typeof entry.createdAt === 'string';
  if (!valid) throw new Error('GQWF catalog lease is invalid.');
  validateLeasePath(workspacePath, entry);
  return entry;
}

function validPreviousLink(catalog) {
  return catalog?.revision === 1
    ? catalog.previousCatalogHash === null : HASH.test(catalog?.previousCatalogHash || '');
}

function validCatalogHeader(expected, catalog) {
  const supported = catalog?.protocol === PROTOCOL || catalog?.protocol === LEGACY_PROTOCOL;
  return supported && catalog.workspaceId === expected.workspaceId
    && catalog.revision === expected.revision && validPreviousLink(catalog);
}

function validCatalogCollections(catalog) {
  const common = Array.isArray(catalog?.roots) && Array.isArray(catalog?.heads)
    && Array.isArray(catalog?.leases);
  const closures = catalog?.protocol === LEGACY_PROTOCOL
    || Array.isArray(catalog?.executionClosures);
  return common && closures;
}

function normalizedCatalog(catalog, entries) {
  const normalized = { ...catalog, roots: entries.roots,
    heads: entries.heads, leases: entries.leases };
  if (catalog.protocol === PROTOCOL) normalized.executionClosures = entries.executionClosures;
  return normalized;
}

function validateCatalog(workspacePath, expected, catalog) {
  if (!validCatalogHeader(expected, catalog) || !validCatalogCollections(catalog)) {
    throw new Error('GQWF metadata catalog binding is invalid.');
  }
  const roots = catalog.roots.map(validateRoot).sort((a, b) => compareText(a.rootHash, b.rootHash));
  assertUnique(roots, 'rootHash', 'root');
  const rootSet = new Set(roots.map((entry) => entry.rootHash));
  const heads = catalog.heads.map((entry) => validateHead(entry, rootSet))
    .sort((a, b) => compareText(a.name, b.name));
  const leases = catalog.leases.map((entry) => validateLease(workspacePath, entry, rootSet))
    .sort((a, b) => compareText(a.id, b.id));
  const executionClosures = catalog.protocol === PROTOCOL
    ? closureCatalog.validateEntries({ entries: catalog.executionClosures,
      roots: rootSet, workspaceId: catalog.workspaceId }) : [];
  assertUnique(heads, 'name', 'head');
  assertUnique(leases, 'id', 'lease');
  const normalized = normalizedCatalog(catalog, { roots, heads, leases, executionClosures });
  if (canonicalJson(normalized) !== canonicalJson(catalog)) {
    throw new Error('GQWF metadata catalog is not canonical.');
  }
  return catalog;
}

async function latestCatalog(db, workspaceId) {
  const workspace = await storage.workspace(db, workspaceId);
  const ref = await metadataStore.latestRef(workspace.path);
  if (!ref || ref.workspaceId !== workspaceId) throw new Error('GQWF metadata catalog ref is missing.');
  const state = await catalogState(db, workspaceId);
  if (state && (state.revision !== ref.revision || state.catalog_hash !== ref.catalogHash)) {
    throw new Error('GQWF metadata catalog has an unpublished newer SQLite state.');
  }
  const serialized = await metadataStore.readObject(workspace.path, ref.catalogHash);
  return { ref, catalog: validateCatalog(workspace.path, ref, JSON.parse(serialized)) };
}

async function currentRows(db, workspaceId) {
  const [roots, heads, leases] = await catalogRows(db, workspaceId);
  return { roots: new Map(roots.map((row) => [row.root_hash, row])),
    heads: new Map(heads.map((row) => [row.name, row])),
    leases: new Map(leases.map((row) => [row.id, row])),
    executionClosures: await closureCatalog.currentRows(db, workspaceId) };
}

function rootIssue(entry, row) {
  if (!row) return { type: 'missing_root', entityId: entry.rootHash };
  try {
    parseManifest(row.manifest_json, entry.rootHash);
    return row.manifest_json === canonicalJson(entry.manifest) ? null
      : { type: 'divergent_root', entityId: entry.rootHash };
  } catch (_) { return { type: 'corrupt_root', entityId: entry.rootHash }; }
}

function headIssue(entry, row) {
  const matches = row && row.root_hash === entry.rootHash && row.generation === entry.generation;
  return matches ? null : { type: row ? 'divergent_head' : 'missing_head', entityId: entry.name };
}

function leaseIssue(entry, row) {
  const matches = row && row.root_hash === entry.rootHash && row.path === entry.path
    && (row.execution_path || row.path) === entry.executionPath && row.status === entry.status;
  return matches ? null : { type: row ? 'divergent_lease' : 'missing_lease', entityId: entry.id };
}

async function repairPlan(db, input) {
  const loaded = await latestCatalog(db, input.workspaceId);
  const rows = await currentRows(db, input.workspaceId);
  const issues = [];
  for (const entry of loaded.catalog.roots) issues.push(rootIssue(entry, rows.roots.get(entry.rootHash)));
  for (const entry of loaded.catalog.heads) issues.push(headIssue(entry, rows.heads.get(entry.name)));
  for (const entry of loaded.catalog.leases) issues.push(leaseIssue(entry, rows.leases.get(entry.id)));
  issues.push(...await closureCatalog.issues({
    entries: loaded.catalog.executionClosures || [], rows: rows.executionClosures,
    workspaceId: input.workspaceId,
    workspacePath: (await storage.workspace(db, input.workspaceId)).path
  }));
  const filtered = issues.filter(Boolean).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
  const body = { protocol: REPAIR_PROTOCOL, workspaceId: input.workspaceId,
    catalogHash: loaded.ref.catalogHash, catalogRevision: loaded.ref.revision, issues: filtered };
  return { ...loaded, issues: filtered, planHash: metadataStore.digest(canonicalJson(body)) };
}

function repairPreview(plan) {
  return { protocol: REPAIR_PROTOCOL, mode: 'preview', workspaceId: plan.catalog.workspaceId,
    catalogHash: plan.ref.catalogHash, catalogRevision: plan.ref.revision,
    planHash: plan.planHash, issueCount: plan.issues.length, issues: plan.issues };
}

async function inspectMetadataRepair(db, input) {
  return repairPreview(await repairPlan(db, input));
}

function authorizationRequest(plan) {
  return { operation: 'repair_metadata', protocol: REPAIR_PROTOCOL,
    workspaceId: plan.catalog.workspaceId, catalogHash: plan.ref.catalogHash,
    catalogRevision: plan.ref.revision, planHash: plan.planHash };
}

async function authorizeRepair(options, plan) {
  if (typeof options.authorizeMetadataRepair !== 'function') {
    throw new Error('GQWF metadata repair authorizer is unavailable.');
  }
  const request = authorizationRequest(plan);
  const verdict = await options.authorizeMetadataRepair(request);
  const bound = verdict?.allowed === true
    && Object.entries(request).every(([key, value]) => verdict[key] === value)
    && typeof verdict.evidenceId === 'string' && verdict.evidenceId.trim();
  if (!bound) throw new Error('GQWF metadata repair lacks bound authorization evidence.');
  return verdict;
}

async function restoreRoots(db, catalog) {
  for (const entry of catalog.roots) {
    await db.run(`INSERT INTO gqwf_roots (workspace_id, root_hash, manifest_json)
      VALUES (?, ?, ?) ON CONFLICT(workspace_id, root_hash) DO UPDATE SET
        manifest_json = excluded.manifest_json`, catalog.workspaceId,
    entry.rootHash, canonicalJson(entry.manifest));
  }
}

async function restoreHeads(db, catalog) {
  for (const entry of catalog.heads) {
    await db.run(`INSERT INTO gqwf_heads (workspace_id, name, root_hash, generation)
      VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id, name) DO UPDATE SET
        root_hash = excluded.root_hash, generation = excluded.generation`,
    catalog.workspaceId, entry.name, entry.rootHash, entry.generation);
  }
}

async function restoreLeases(db, catalog) {
  for (const entry of catalog.leases) {
    const status = entry.status === 'released' ? 'released' : 'quarantined';
    await db.run(`INSERT INTO gqwf_leases
      (id, workspace_id, root_hash, path, execution_path, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id, root_hash = excluded.root_hash,
        path = excluded.path, execution_path = excluded.execution_path,
        status = excluded.status, created_at = excluded.created_at`, entry.id,
    catalog.workspaceId, entry.rootHash, entry.path, entry.executionPath,
    status, entry.createdAt);
  }
}

async function persistRepairReceipt(db, input) {
  const receiptId = crypto.randomUUID();
  const body = { receiptId, protocol: REPAIR_PROTOCOL, workspaceId: input.plan.catalog.workspaceId,
    catalogHash: input.plan.ref.catalogHash, catalogRevision: input.plan.ref.revision,
    planHash: input.plan.planHash, repairedCount: input.plan.issues.length,
    authorizationEvidenceId: input.authorization.evidenceId };
  const receiptHash = metadataStore.digest(canonicalJson(body));
  await db.run(`INSERT INTO gqwf_metadata_repair_receipts
    (id, workspace_id, catalog_hash, catalog_revision, plan_hash,
      repaired_count, evidence_id, receipt_hash, receipt_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, receiptId, body.workspaceId,
  body.catalogHash, body.catalogRevision, body.planHash, body.repairedCount,
  body.authorizationEvidenceId, receiptHash, canonicalJson(body));
  return { ...body, receiptHash };
}

async function repairMetadata(db, input, options = {}) {
  const plan = await repairPlan(db, input);
  if (plan.planHash !== input.expectedPlanHash) {
    throw new Error('GQWF metadata repair plan changed; run a new preview.');
  }
  const authorization = await authorizeRepair(options, plan);
  return withTransaction(db, async () => {
    await restoreRoots(db, plan.catalog);
    await closureCatalog.restore(db, {
      entries: plan.catalog.executionClosures || [],
      workspaceId: plan.catalog.workspaceId,
      workspacePath: (await storage.workspace(db, plan.catalog.workspaceId)).path
    });
    await restoreHeads(db, plan.catalog);
    await restoreLeases(db, plan.catalog);
    return persistRepairReceipt(db, { plan, authorization });
  });
}

async function maintainMetadataCatalog(db, input) {
  return catalogMaintenance.maintain(db, { workspaceId: input.workspaceId });
}

module.exports = {
  checkpointMetadata,
  inspectMetadataRepair,
  latestCatalog,
  maintainMetadataCatalog,
  repairMetadata,
  withCatalogMutation
};
