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

function verifyObjectSignatureLocal(object) {
  if (!object.signature) return false;
  const isEd25519 = (object.signature_algorithm || signingAlgorithm()) === 'ed25519';
  const authHash = object.commit_hash || object.tree_hash || object.state_hash;
  const expected = Buffer.from(signObjectLocal(authHash, json(object.metadata_json, {})), isEd25519 ? 'base64' : 'utf8');
  const actual = Buffer.from(object.signature, isEd25519 ? 'base64' : 'utf8');
  if (actual.length !== expected.length) return false;
  if (isEd25519) return crypto.verify(null, Buffer.from(`${authHash}:${JSON.stringify(json(object.metadata_json, {}))}`), process.env.GENOS_AGENT_GIT_SIGNING_PUBLIC_KEY || process.env.GENOS_AGENT_GIT_SIGNING_PRIVATE_KEY, actual);
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
  return state;
}

async function checkParentLinks(ctx) {
  const { db, object, objIds, issues } = ctx;
  const parents = await db.all('SELECT parent_commit_id FROM agent_git_commit_parents WHERE commit_id = ?', object.id);
  for (const { parent_commit_id: parentId } of parents) {
    if (!objIds.has(parentId)) issues.push({ id: object.id, issue: 'missing_parent', parentId });
  }
}

async function verifySingleObject(db, object, objects) {
  const issues = [];
  const state = checkStateValidity(object, issues);
  if (!state) return issues;
  const objIds = new Set(objects.map(o => o.id));
  await checkParentLinks({ db, object, objIds, issues });
  return issues;
}

module.exports = { json, signingAlgorithm, signingSecret, signObjectLocal, verifyObjectSignatureLocal, checkStateValidity, checkParentLinks, verifySingleObject };
