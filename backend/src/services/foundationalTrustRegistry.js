'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { canonicalValue, fingerprint } = require('./stateFingerprint');
const revocations = require('./foundationalRevocationAuthority');

const PACKAGE_SCHEMA = 'genos.foundational-trust-package/v1';
const SIGNATURE_ALGORITHM = 'ed25519';
const HASH = /^[a-f0-9]{64}$/;

function failure(code) {
  return Object.assign(new Error(code), { code });
}

function keyId(publicKey) {
  try {
    const der = crypto.createPublicKey(publicKey).export({ type: 'spki', format: 'der' });
    return crypto.createHash('sha256').update(der).digest('hex').slice(0, 32);
  } catch (_) {
    throw failure('FOUNDATION_TRUST_ROOT_INVALID');
  }
}

function normalizeAuthority(authority) {
  if (!authority || typeof authority.id !== 'string' || !authority.id.trim()) {
    throw failure('FOUNDATION_TRUST_AUTHORITY_INVALID');
  }
  if (!['active', 'revoked'].includes(authority.status)) {
    throw failure('FOUNDATION_TRUST_AUTHORITY_INVALID');
  }
  try {
    const publicKey = crypto.createPublicKey(authority.publicKey)
      .export({ type: 'spki', format: 'pem' }).toString();
    return { id: authority.id, status: authority.status, publicKey };
  } catch (_) {
    throw failure('FOUNDATION_TRUST_AUTHORITY_INVALID');
  }
}

function normalizeBody(body) {
  if (!body || body.schema !== PACKAGE_SCHEMA || !Number.isInteger(body.generation)
    || body.generation < 1) {
    throw failure('FOUNDATION_TRUST_PACKAGE_INVALID');
  }
  const times = normalizeTimes(body);
  const authorities = normalizeAuthorities(body.authorities);
  const previousPackageHash = normalizePreviousHash(body.previousPackageHash);
  return canonicalValue({ schema: PACKAGE_SCHEMA, generation: body.generation,
    issuedAt: times.issuedAt, expiresAt: times.expiresAt,
    previousPackageHash, authorities });
}

function normalizeTimes(body) {
  const issuedAt = Date.parse(body.issuedAt);
  const expiresAt = Date.parse(body.expiresAt);
  if (Number.isNaN(issuedAt) || Number.isNaN(expiresAt) || issuedAt >= expiresAt) {
    throw failure('FOUNDATION_TRUST_TIME_INVALID');
  }
  return { issuedAt: new Date(issuedAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString() };
}

function normalizeAuthorities(values) {
  if (!Array.isArray(values)) throw failure('FOUNDATION_TRUST_PACKAGE_INVALID');
  const authorities = values.map(normalizeAuthority)
    .sort((left, right) => left.id.localeCompare(right.id));
  const ids = new Set(authorities.map(({ id }) => id));
  if (!authorities.length || ids.size !== authorities.length
    || !authorities.some(({ status }) => status === 'active')) {
    throw failure('FOUNDATION_TRUST_AUTHORITY_INVALID');
  }
  return authorities;
}

function normalizePreviousHash(value) {
  const previousPackageHash = value ?? null;
  if (previousPackageHash !== null && !HASH.test(previousPackageHash)) {
    throw failure('FOUNDATION_TRUST_LINEAGE_INVALID');
  }
  return previousPackageHash;
}

function signingPayload(body) {
  return Buffer.from(JSON.stringify(canonicalValue(body)));
}

function signPackage(options) {
  const body = normalizeBody(options.body);
  let signature;
  try {
    signature = crypto.sign(null, signingPayload(body), options.rootPrivateKey).toString('base64');
  } catch (_) {
    throw failure('FOUNDATION_TRUST_SIGNING_FAILED');
  }
  const signed = { body, signature: { algorithm: SIGNATURE_ALGORITHM,
    rootKeyId: options.rootKeyId, value: signature } };
  return { ...signed, packageHash: fingerprint(signed) };
}

function validateRoot(rootTrust, signature) {
  if (!rootTrust || typeof rootTrust.id !== 'string' || typeof rootTrust.publicKey !== 'string'
    || rootTrust.id !== signature?.rootKeyId || keyId(rootTrust.publicKey) !== rootTrust.id) {
    throw failure('FOUNDATION_TRUST_ROOT_INVALID');
  }
  if (signature.algorithm !== SIGNATURE_ALGORITHM || typeof signature.value !== 'string') {
    throw failure('FOUNDATION_TRUST_SIGNATURE_INVALID');
  }
}

function verifyPackage(options) {
  const body = normalizeBody(options.package?.body);
  validateRoot(options.rootTrust, options.package?.signature);
  const signed = { body, signature: options.package.signature };
  const packageHash = fingerprint(signed);
  if (options.package.packageHash !== packageHash) {
    throw failure('FOUNDATION_TRUST_PACKAGE_TAMPERED');
  }
  let verified = false;
  try {
    verified = crypto.verify(null, signingPayload(body), options.rootTrust.publicKey,
      Buffer.from(options.package.signature.value, 'base64'));
  } catch (_) {
    verified = false;
  }
  if (!verified) throw failure('FOUNDATION_TRUST_SIGNATURE_INVALID');
  const now = Date.parse(options.now);
  if (Number.isNaN(now) || now < Date.parse(body.issuedAt) || now >= Date.parse(body.expiresAt)) {
    throw failure('FOUNDATION_TRUST_PACKAGE_STALE');
  }
  return { ...signed, packageHash };
}

function assertSuccessor(current, candidate) {
  if (!current) {
    if (candidate.body.generation !== 1 || candidate.body.previousPackageHash !== null) {
      throw failure('FOUNDATION_TRUST_BOOTSTRAP_INVALID');
    }
    return;
  }
  if (candidate.body.generation !== current.body.generation + 1
    || candidate.body.previousPackageHash !== current.packageHash) {
    throw failure('FOUNDATION_TRUST_LINEAGE_INVALID');
  }
}

function readPackage(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    throw failure('FOUNDATION_TRUST_PACKAGE_UNAVAILABLE');
  }
}

function writeAtomic(filePath, value) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, filePath);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function loadVerified(filePath, options) {
  return verifyPackage({ package: readPackage(filePath), rootTrust: options.rootTrust,
    now: options.now });
}

function loadActive(options) {
  try {
    return loadVerified(options.activePath, options);
  } catch (activeError) {
    try {
      const recovered = loadVerified(options.recoveryPath, options);
      writeAtomic(options.activePath, recovered);
      return recovered;
    } catch (_) {
      throw activeError;
    }
  }
}

function install(options) {
  const candidate = loadVerified(options.candidatePath, options);
  let current = null;
  if (fs.existsSync(options.activePath) || fs.existsSync(options.recoveryPath)) {
    current = loadActive(options);
  }
  assertSuccessor(current, candidate);
  writeAtomic(options.activePath, candidate);
  writeAtomic(options.recoveryPath, candidate);
  return candidate;
}

function runtimeRegistry(trustPackage) {
  const authorities = trustPackage.body.authorities
    .filter(({ status }) => status === 'active');
  if (!authorities.length) throw failure('FOUNDATION_TRUST_AUTHORITY_INVALID');
  return { schema: revocations.TRUST_SCHEMA, authorities };
}

module.exports = { PACKAGE_SCHEMA, keyId, signPackage, verifyPackage,
  install, loadActive, runtimeRegistry };
