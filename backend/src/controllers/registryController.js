const crypto = require('crypto');
const { getDatabase } = require('../db');
const { scopeSql } = require('../middleware/tenant');

const KINDS = new Set(['model', 'prompt', 'tool', 'workflow']);
const digest = (manifest) => crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
const id = (prefix) => `${prefix}-${crypto.randomUUID()}`;

function kind(value) {
  const normalized = String(value || '').toLowerCase().replace(/s$/, '');
  if (!KINDS.has(normalized)) throw new Error('kind must be model, prompt, tool, or workflow');
  return normalized;
}

async function artifact(db, req, artifactId) {
  const scope = scopeSql(req);
  return db.get(`SELECT * FROM registry_artifacts WHERE id = ? AND ${scope.clause}`, artifactId, ...scope.params);
}

async function list(req, res, next) {
  try {
    const db = await getDatabase();
    const scope = scopeSql(req);
    const requested = req.params.kind ? kind(req.params.kind) : null;
    const rows = await db.all(`SELECT a.*, v.manifest_json, v.digest, v.labels_json FROM registry_artifacts a JOIN registry_artifact_versions v ON v.artifact_id = a.id AND v.version = a.current_version WHERE ${scope.clause}${requested ? ' AND a.kind = ?' : ''} ORDER BY a.updated_at DESC`, ...scope.params, ...(requested ? [requested] : []));
    res.json(rows.map(row => ({ ...row, manifest: JSON.parse(row.manifest_json), labels: JSON.parse(row.labels_json) })));
  } catch (error) { next(error); }
}

async function create(req, res, next) {
  try {
    const db = await getDatabase();
    const artifactKind = kind(req.params.kind || req.body?.kind);
    const { name, description = '', manifest = {}, labels = [] } = req.body || {};
    if (!String(name || '').trim()) return res.status(400).json({ error: { code: 'INVALID_NAME', message: 'name is required.' } });
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return res.status(400).json({ error: { code: 'INVALID_MANIFEST', message: 'manifest must be an object.' } });
    const scope = scopeSql(req);
    const artifactId = id('registry');
    const versionId = id('registry-version');
    const manifestDigest = digest(manifest);
    await db.run('INSERT INTO registry_artifacts(id,organization_id,project_id,kind,name,description) VALUES(?,?,?,?,?,?)', artifactId, ...scope.params, artifactKind, name.trim(), description);
    await db.run('INSERT INTO registry_artifact_versions(id,artifact_id,version,manifest_json,digest,labels_json) VALUES(?,?,?,?,?,?)', versionId, artifactId, 1, JSON.stringify(manifest), manifestDigest, JSON.stringify(labels));
    res.status(201).json({ id: artifactId, kind: artifactKind, name: name.trim(), description, version: 1, digest: manifestDigest, manifest, labels });
  } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed')) return res.status(409).json({ error: { code: 'ARTIFACT_EXISTS', message: 'An artifact with this kind and name already exists in the project.' } });
    next(error);
  }
}

async function addVersion(req, res, next) {
  try {
    const db = await getDatabase();
    const item = await artifact(db, req, req.params.id);
    if (!item) return res.status(404).json({ error: { code: 'ARTIFACT_NOT_FOUND', message: 'Artifact is outside the tenant scope.' } });
    const { manifest, labels = [] } = req.body || {};
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return res.status(400).json({ error: { code: 'INVALID_MANIFEST', message: 'manifest must be an object.' } });
    const version = Number(item.current_version) + 1;
    const manifestDigest = digest(manifest);
    await db.run('INSERT INTO registry_artifact_versions(id,artifact_id,version,manifest_json,digest,labels_json) VALUES(?,?,?,?,?,?)', id('registry-version'), item.id, version, JSON.stringify(manifest), manifestDigest, JSON.stringify(labels));
    await db.run('UPDATE registry_artifacts SET current_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', version, item.id);
    res.status(201).json({ id: item.id, version, digest: manifestDigest, manifest, labels });
  } catch (error) { next(error); }
}

async function publish(req, res, next) {
  try {
    const db = await getDatabase();
    const item = await artifact(db, req, req.params.id);
    if (!item) return res.status(404).json({ error: { code: 'ARTIFACT_NOT_FOUND', message: 'Artifact is outside the tenant scope.' } });
    const slug = String(req.body?.slug || `${item.kind}-${item.name}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) return res.status(400).json({ error: { code: 'INVALID_SLUG', message: 'A valid marketplace slug is required.' } });
    const listingId = id('listing');
    await db.run('INSERT INTO marketplace_listings(id,artifact_id,publisher_organization_id,publisher_project_id,slug) VALUES(?,?,?,?,?) ON CONFLICT(artifact_id) DO UPDATE SET slug=excluded.slug,status=\'published\',updated_at=CURRENT_TIMESTAMP', listingId, item.id, item.organization_id, item.project_id, slug);
    const listing = await db.get('SELECT * FROM marketplace_listings WHERE artifact_id = ?', item.id);
    res.status(201).json({ ...listing, artifact: { id: item.id, kind: item.kind, name: item.name, version: item.current_version } });
  } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed')) return res.status(409).json({ error: { code: 'SLUG_TAKEN', message: 'Marketplace slug is already in use.' } });
    next(error);
  }
}

async function marketplace(req, res, next) {
  try {
    const db = await getDatabase();
    const rows = await db.all("SELECT l.*, a.kind, a.name, a.description, a.current_version, v.digest, v.labels_json FROM marketplace_listings l JOIN registry_artifacts a ON a.id = l.artifact_id JOIN registry_artifact_versions v ON v.artifact_id = a.id AND v.version = a.current_version WHERE l.status = 'published' ORDER BY l.created_at DESC");
    res.json(rows.map(row => ({ ...row, labels: JSON.parse(row.labels_json) })));
  } catch (error) { next(error); }
}

async function install(req, res, next) {
  try {
    const db = await getDatabase();
    const listing = await db.get("SELECT l.*, a.kind, a.current_version FROM marketplace_listings l JOIN registry_artifacts a ON a.id = l.artifact_id WHERE l.id = ? AND l.status = 'published'", req.params.id);
    if (!listing) return res.status(404).json({ error: { code: 'LISTING_NOT_FOUND', message: 'Marketplace listing not found.' } });
    const scope = scopeSql(req);
    const installId = id('install');
    await db.run('INSERT INTO marketplace_installs(id,listing_id,organization_id,project_id,artifact_id,installed_version) VALUES(?,?,?,?,?,?) ON CONFLICT(listing_id,project_id) DO UPDATE SET installed_version=excluded.installed_version,created_at=CURRENT_TIMESTAMP', installId, listing.id, ...scope.params, listing.artifact_id, listing.current_version);
    res.status(201).json({ id: installId, listingId: listing.id, artifactId: listing.artifact_id, kind: listing.kind, installedVersion: listing.current_version });
  } catch (error) { next(error); }
}

module.exports = { list, create, addVersion, publish, marketplace, install };
