'use strict';

const crypto = require('crypto');
const { treeHash } = require('./canonical');

function json(value, fallback) {
  try { return JSON.parse(value || ''); } catch (_) { return fallback; }
}

function signingAlgorithm() {
  return process.env.GENOS_AGENT_GIT_SIGNING_PRIVATE_KEY ? 'ed25519' : 'hmac-sha256';
}

function signingSecret() {
  const secret = process.env.GENOS_AGENT_GIT_SIGNING_SECRET || process.env.GENOS_GRPC_SHARED_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('GENOS_AGENT_GIT_SIGNING_SECRET or GENOS_GRPC_SHARED_SECRET must be configured in production');
    }
    return 'genos-agent-git-development-secret';
  }
  return secret;
}

function signObjectLocal(stateHash, metadata) {
  const payload = Buffer.from(`${stateHash}:${JSON.stringify(metadata || {})}`);
  const isEd25519 = signingAlgorithm() === 'ed25519';
  if (isEd25519) return crypto.sign(null, payload, process.env.GENOS_AGENT_GIT_SIGNING_PRIVATE_KEY).toString('base64');
  return crypto.createHmac('sha256', signingSecret()).update(payload).digest('hex');
}

// author_key_id sélectionne la clé publique dans le trust store
// (genome_trusted_signers) ; fallback sur la configuration locale pour les
// objets signés par le serveur courant. Le chemin async
// (resolveTrustPublicKey + verifyEd25519WithStore) est utilisé à la
// frontière remote ; le chemin sync reste pour show/log/fsck locaux.
function resolveVerificationKey(object, isEd25519) {
  if (!isEd25519) return signingSecret();
  return process.env.GENOS_AGENT_GIT_SIGNING_PUBLIC_KEY || process.env.GENOS_AGENT_GIT_SIGNING_PRIVATE_KEY;
}

async function resolveTrustPublicKey(ctx) {
  const { db, authorKeyId, tenantId } = ctx;
  if (!db || !authorKeyId) return null;
  try {
    const row = tenantId
      ? await db.get(`SELECT public_key FROM genome_trusted_signers WHERE key_id = ? AND tenant_id = ? AND status = 'active' AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP) LIMIT 1`, authorKeyId, tenantId)
      : await db.get(`SELECT public_key FROM genome_trusted_signers WHERE key_id = ? AND status = 'active' AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP) LIMIT 1`, authorKeyId);
    return row?.public_key || null;
  } catch (_) { return null; }
}

function verifyEd25519Payload(ctx) {
  const { payload, signature, publicKey } = ctx;
  try {
    return crypto.verify(null, payload, publicKey, Buffer.from(signature, 'base64'));
  } catch (_) { return false; }
}

async function verifyObjectSignatureWithStore(ctx) {
  const { db, object, tenantId } = ctx;
  if (!object.signature) return false;
  const isEd25519 = (object.signature_algorithm || signingAlgorithm()) === 'ed25519';
  if (!isEd25519) return verifyObjectSignatureLocal(object);
  const authHash = object.commit_hash || object.tree_hash || object.state_hash;
  const metadata = json(object.metadata_json, {});
  const payload = Buffer.from(`${authHash}:${JSON.stringify(metadata)}`);
  const trusted = await resolveTrustPublicKey({ db, authorKeyId: object.author_key_id, tenantId });
  if (trusted && verifyEd25519Payload({ payload, signature: object.signature, publicKey: trusted })) return true;
  return verifyObjectSignatureLocal(object);
}

function verifyObjectSignatureLocal(object) {
  if (!object.signature) return false;
  // Point 14 : l'algorithme vient de l'OBJET (auto-descriptif), pas de la
  // config courante — une ancienne signature HMAC reste vérifiable après
  // activation Ed25519, et inversement.
  const isEd25519 = (object.signature_algorithm || signingAlgorithm()) === 'ed25519';
  const authHash = object.commit_hash || object.tree_hash || object.state_hash;
  const metadata = json(object.metadata_json, {});
  const payload = Buffer.from(`${authHash}:${JSON.stringify(metadata)}`);
  const actual = Buffer.from(object.signature, isEd25519 ? 'base64' : 'utf8');
  if (isEd25519) {
    const key = resolveVerificationKey(object, true);
    if (!key) return false;
    return crypto.verify(null, payload, key, actual);
  }
  const expected = Buffer.from(signObjectLocal(authHash, metadata), 'utf8');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function checkStateValidity(object, issues) {
  let state;
  try { state = JSON.parse(object.state_json); } catch (_) { issues.push({ id: object.id, issue: 'invalid_json' }); return null; }
  const hash = crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex');
  if (hash !== object.state_hash) issues.push({ id: object.id, issue: 'state_hash_mismatch' });
  if (!verifyObjectSignatureLocal(object)) issues.push({ id: object.id, issue: 'invalid_signature' });
  const tree = treeHash(state);
  if (object.tree_hash && object.tree_hash !== tree) issues.push({ id: object.id, issue: 'tree_hash_mismatch' });
  checkCommitBinding({ object, tree, issues });
  return state;
}

function checkCommitBinding(ctx) {
  const { object, tree, issues } = ctx;
  if (!object.commit_hash) return;
  const metadata = json(object.metadata_json, null);
  if (metadata === null) {
    issues.push({ id: object.id, issue: 'invalid_metadata_json' });
    return;
  }
  const { commitHash } = require('./canonical');
  const parents = parentIdsFromRow(object);
  const expected = commitHash({ tree, parents, metadata });
  if (expected !== object.commit_hash) issues.push({ id: object.id, issue: 'commit_hash_mismatch' });
}

function parentIdsFromRow(object) {
  if (Array.isArray(object.parentIds)) return object.parentIds;
  if (Array.isArray(object.parent_commit_ids)) return object.parent_commit_ids;
  if (object.parent_commit_id) return [object.parent_commit_id];
  return [];
}

async function checkParentLinks(ctx) {
  const { db, object, objIds, issues } = ctx;
  const parents = await db.all('SELECT parent_commit_id FROM agent_git_commit_parents WHERE commit_id = ? ORDER BY position, rowid', object.id);
  const orderedIds = parents.map(p => p.parent_commit_id);
  object.parentIds = orderedIds;
  for (const parentId of orderedIds) {
    if (!objIds.has(parentId)) issues.push({ id: object.id, issue: 'missing_parent', parentId });
  }
  checkCommitBindingOrdered({ object, issues });
}

function checkCommitBindingOrdered(ctx) {
  const { object, issues } = ctx;
  if (!object.commit_hash) return;
  let state;
  try { state = JSON.parse(object.state_json); } catch (_) { return; }
  const metadata = json(object.metadata_json, null);
  if (metadata === null) return;
  const { commitHash } = require('./canonical');
  const expected = commitHash({ tree: treeHash(state), parents: object.parentIds || [], metadata });
  if (expected !== object.commit_hash && !issues.some(i => i.issue === 'commit_hash_mismatch')) {
    issues.push({ id: object.id, issue: 'commit_hash_mismatch' });
  }
}

async function verifySingleObject(db, object, objects) {
  const issues = [];
  const objIds = new Set(objects.map(o => o.id));
  await checkParentLinks({ db, object, objIds, issues });
  const state = checkStateValidity(object, issues);
  if (!state) return issues;
  return issues;
}

module.exports = { json, signingAlgorithm, signingSecret, signObjectLocal, verifyObjectSignatureLocal, verifyObjectSignatureWithStore, resolveTrustPublicKey, checkStateValidity, checkParentLinks, verifySingleObject };
