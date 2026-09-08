const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { getDatabase } = require('../db');
const vault = require('../services/secretVault');
const { requireRole, hashKey } = require('../middleware/auth');
const { SAML, ValidateInResponseTo } = require('@node-saml/node-saml');

async function dbReady() {
  const db = await getDatabase();
  await db.exec("CREATE TABLE IF NOT EXISTS sso_providers (id TEXT PRIMARY KEY, issuer TEXT NOT NULL, client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, client_secret_json TEXT, scopes TEXT NOT NULL DEFAULT 'openid profile email', enabled INTEGER NOT NULL DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  await db.exec('CREATE TABLE IF NOT EXISTS user_identities (id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, subject TEXT NOT NULL, email TEXT, display_name TEXT, role TEXT NOT NULL DEFAULT \'viewer\', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(provider_id, subject))');
  await db.exec('CREATE TABLE IF NOT EXISTS saml_requests (id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, value TEXT NOT NULL, expires_at INTEGER NOT NULL)');
  await db.exec('CREATE TABLE IF NOT EXISTS oidc_requests (id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, nonce TEXT NOT NULL, code_verifier TEXT NOT NULL, expires_at INTEGER NOT NULL)');
  const columns = new Set((await db.all('PRAGMA table_info(sso_providers)')).map(column => column.name));
  if (!columns.has('protocol')) await db.exec("ALTER TABLE sso_providers ADD COLUMN protocol TEXT NOT NULL DEFAULT 'oidc'");
  if (!columns.has('entry_point')) await db.exec('ALTER TABLE sso_providers ADD COLUMN entry_point TEXT');
  if (!columns.has('idp_cert_json')) await db.exec('ALTER TABLE sso_providers ADD COLUMN idp_cert_json TEXT');
  if (!columns.has('sp_entity_id')) await db.exec('ALTER TABLE sso_providers ADD COLUMN sp_entity_id TEXT');
  return db;
}

function samlRequestCache(db, providerId) {
  return {
    async saveAsync(key, value) {
      const expiresAt = Date.now() + 5 * 60 * 1000;
      await db.run('INSERT OR REPLACE INTO saml_requests(id,provider_id,value,expires_at) VALUES(?,?,?,?)', key, providerId, value, expiresAt);
      return { value, createdAt: Date.now() };
    },
    async getAsync(key) {
      const row = await db.get('SELECT value FROM saml_requests WHERE id = ? AND provider_id = ? AND expires_at > ?', key, providerId, Date.now());
      return row?.value || null;
    },
    async removeAsync(key) {
      const row = await db.get('SELECT value FROM saml_requests WHERE id = ? AND provider_id = ?', key, providerId);
      await db.run('DELETE FROM saml_requests WHERE id = ? AND provider_id = ?', key, providerId);
      return row?.value || null;
    }
  };
}

function buildSaml(provider, db) {
  const certificate = provider.idp_cert_json ? vault.decrypt(JSON.parse(provider.idp_cert_json)) : null;
  if (!certificate || !provider.entry_point || !provider.sp_entity_id) throw new Error('SAML provider is missing its IdP certificate, entry point, or SP entity ID.');
  return new SAML({
    entryPoint: provider.entry_point,
    issuer: provider.sp_entity_id,
    callbackUrl: provider.redirect_uri,
    idpCert: certificate,
    idpIssuer: provider.issuer,
    audience: provider.sp_entity_id,
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: true,
    validateInResponseTo: ValidateInResponseTo.always,
    requestIdExpirationPeriodMs: 5 * 60 * 1000,
    acceptedClockSkewMs: 30 * 1000,
    cacheProvider: samlRequestCache(db, provider.id)
  });
}
async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`OIDC endpoint returned ${response.status}`);
    return response.json();
  } finally { clearTimeout(timer); }
}

async function oidcDiscovery(provider) {
  const issuer = String(provider.issuer || '').replace(/\/$/, '');
  const discovery = await fetchJson(`${issuer}/.well-known/openid-configuration`);
  if (discovery.issuer !== issuer || !discovery.authorization_endpoint || !discovery.token_endpoint || !discovery.jwks_uri) {
    throw new Error('OIDC discovery metadata is incomplete or has an issuer mismatch.');
  }
  return discovery;
}

async function validateIdToken(token, provider, discovery, expectedNonce) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('OIDC identity token is malformed.');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  const algorithms = {
    RS256: 'RSA-SHA256', RS384: 'RSA-SHA384', RS512: 'RSA-SHA512',
    PS256: 'RSA-SHA256', PS384: 'RSA-SHA384', PS512: 'RSA-SHA512',
    ES256: 'SHA256', ES384: 'SHA384', ES512: 'SHA512'
  };
  if (!algorithms[header.alg] || !header.kid) throw new Error('OIDC identity token uses an unsupported algorithm or has no key id.');
  const jwks = await fetchJson(discovery.jwks_uri);
  const jwk = Array.isArray(jwks.keys) ? jwks.keys.find((key) => key.kid === header.kid && (!key.alg || key.alg === header.alg)) : null;
  if (!jwk) throw new Error('OIDC signing key was not found.');
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const verifyOptions = { key };
  if (header.alg.startsWith('PS')) {
    verifyOptions.padding = crypto.constants.RSA_PKCS1_PSS_PADDING;
    verifyOptions.saltLength = crypto.constants.RSA_PSS_SALTLEN_DIGEST;
  }
  if (header.alg.startsWith('ES')) verifyOptions.dsaEncoding = 'ieee-p1363';
  const valid = crypto.verify(algorithms[header.alg], Buffer.from(`${parts[0]}.${parts[1]}`), verifyOptions, Buffer.from(parts[2], 'base64url'));
  if (!valid) throw new Error('OIDC identity token signature is invalid.');
  const now = Math.floor(Date.now() / 1000);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== discovery.issuer || !audience.includes(provider.client_id)) throw new Error('OIDC identity token issuer or audience is invalid.');
  if (!Number.isFinite(Number(claims.exp)) || Number(claims.exp) <= now || Number(claims.nbf || 0) > now + 30) throw new Error('OIDC identity token is expired or not active.');
  if (!expectedNonce || claims.nonce !== expectedNonce) throw new Error('OIDC identity token nonce is invalid.');
  return claims;
}
router.get('/providers', async (req, res, next) => { try { const db = await dbReady(); res.json(await db.all('SELECT id,protocol,issuer,client_id,redirect_uri,entry_point,sp_entity_id,scopes,enabled FROM sso_providers ORDER BY id')); } catch (e) { next(e); } });
router.post('/providers', requireRole(['admin']), async (req, res, next) => {
  try {
    const db = await dbReady();
    const { id, issuer, clientId, clientSecret, redirectUri, scopes = 'openid profile email', protocol = 'oidc', entryPoint, idpCertificate, spEntityId } = req.body || {};
    if (!id || !issuer || !redirectUri || !['oidc', 'saml'].includes(protocol) || (protocol === 'oidc' && !clientId) || (protocol === 'saml' && (!entryPoint || !idpCertificate || !spEntityId))) {
      return res.status(400).json({ error: { code: 'INVALID_SSO_PROVIDER', message: 'OIDC requires id, issuer, clientId and redirectUri; SAML also requires entryPoint, idpCertificate and spEntityId.' } });
    }
    const encrypted = clientSecret ? JSON.stringify(vault.encrypt(clientSecret)) : null;
    const encryptedCertificate = idpCertificate ? JSON.stringify(vault.encrypt(idpCertificate)) : null;
    await db.run('INSERT OR REPLACE INTO sso_providers(id,issuer,client_id,redirect_uri,client_secret_json,scopes,enabled,protocol,entry_point,idp_cert_json,sp_entity_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)', id, issuer.replace(/\/$/, ''), clientId || '', redirectUri, encrypted, scopes, 1, protocol, entryPoint || null, encryptedCertificate, spEntityId || null);
    res.status(201).json({ id, issuer, clientId: clientId || null, redirectUri, scopes, protocol, entryPoint: entryPoint || null, spEntityId: spEntityId || null });
  } catch (e) { next(e); }
});
router.get('/start/:id', async (req, res, next) => {
  try {
    const db = await dbReady();
    const provider = await db.get("SELECT * FROM sso_providers WHERE id=? AND enabled=1 AND protocol='oidc'", req.params.id);
    if (!provider) return res.status(404).json({ error: { code: 'SSO_PROVIDER_NOT_FOUND', message: 'OIDC provider not found.' } });
    const discovery = await oidcDiscovery(provider);
    const state = crypto.randomBytes(24).toString('base64url');
    const nonce = crypto.randomBytes(24).toString('base64url');
    const codeVerifier = crypto.randomBytes(48).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    await db.run('DELETE FROM oidc_requests WHERE expires_at <= ?', Date.now());
    await db.run('INSERT INTO oidc_requests(id,provider_id,nonce,code_verifier,expires_at) VALUES(?,?,?,?,?)', state, provider.id, nonce, codeVerifier, Date.now() + 5 * 60 * 1000);
    res.redirect(`${discovery.authorization_endpoint}?${new URLSearchParams({ response_type: 'code', client_id: provider.client_id, redirect_uri: provider.redirect_uri, scope: provider.scopes, state, nonce, code_challenge: codeChallenge, code_challenge_method: 'S256' })}`);
  } catch (e) { next(e); }
});
router.get('/saml/:id/start', async (req, res, next) => { try { const db = await dbReady(); const provider = await db.get("SELECT * FROM sso_providers WHERE id=? AND enabled=1 AND protocol='saml'", req.params.id); if (!provider) return res.status(404).json({ error: { code: 'SAML_PROVIDER_NOT_FOUND', message: 'SAML provider not found.' } }); const relayState = crypto.randomBytes(18).toString('base64url'); res.redirect(await buildSaml(provider, db).getAuthorizeUrlAsync(relayState, req.get('host'))); } catch (e) { next(e); } });
router.get('/callback/:id', async (req, res, next) => {
  try {
    const db = await dbReady();
    const provider = await db.get("SELECT * FROM sso_providers WHERE id=? AND enabled=1 AND protocol='oidc'", req.params.id);
    const state = String(req.query.state || '');
    const request = state ? await db.get('SELECT * FROM oidc_requests WHERE id=? AND provider_id=? AND expires_at>?', state, req.params.id, Date.now()) : null;
    if (!provider || !req.query.code || !request) return res.status(400).json({ error: { code: 'INVALID_SSO_CALLBACK', message: 'Provider, authorization code and valid state are required.' } });
    await db.run('DELETE FROM oidc_requests WHERE id=?', state);
    const discovery = await oidcDiscovery(provider);
    const secret = provider.client_secret_json ? vault.decrypt(JSON.parse(provider.client_secret_json)) : undefined;
    const tokens = await fetchJson(discovery.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: String(req.query.code), redirect_uri: provider.redirect_uri, client_id: provider.client_id, code_verifier: request.code_verifier, ...(secret ? { client_secret: secret } : {}) }) });
    const claims = await validateIdToken(tokens.id_token, provider, discovery, request.nonce);
    const subject = claims.sub;
    if (!subject) throw new Error('OIDC identity token has no subject.');
    const identityId = `identity-${crypto.randomUUID()}`;
    await db.run('INSERT INTO user_identities(id,provider_id,subject,email,display_name,role) VALUES(?,?,?,?,?,?) ON CONFLICT(provider_id,subject) DO UPDATE SET email=excluded.email, display_name=excluded.display_name', identityId, provider.id, subject, claims.email || null, claims.name || claims.preferred_username || subject, 'viewer');
    const identity = await db.get('SELECT * FROM user_identities WHERE provider_id=? AND subject=?', provider.id, subject);
    const token = `sso_${crypto.randomBytes(32).toString('hex')}`;
    await db.run('INSERT INTO sessions(id,token_hash,role,username,expires_at) VALUES(?,?,?,?,datetime(\'now\',\'+8 hours\'))', `session-${crypto.randomUUID()}`, hashKey(token), identity.role, identity.display_name || identity.email || subject);
    res.json({ token, user: { id: identity.id, username: identity.display_name, email: identity.email, role: identity.role }, expiresIn: 28800 });
  } catch (e) { next(e); }
});
router.post('/saml/:id/acs', async (req, res, next) => {
  try {
    const db = await dbReady();
    const provider = await db.get("SELECT * FROM sso_providers WHERE id=? AND enabled=1 AND protocol='saml'", req.params.id);
    if (!provider || !req.body?.SAMLResponse) return res.status(400).json({ error: { code: 'INVALID_SAML_RESPONSE', message: 'A configured provider and SAMLResponse are required.' } });
    const { profile, loggedOut } = await buildSaml(provider, db).validatePostResponseAsync({ SAMLResponse: String(req.body.SAMLResponse), RelayState: String(req.body.RelayState || '') });
    if (loggedOut || !profile?.nameID) return res.status(401).json({ error: { code: 'SAML_LOGOUT_OR_INVALID', message: 'SAML response did not establish an identity.' } });
    const subject = profile.nameID;
    const email = profile.email || profile.mail || profile['urn:oid:0.9.2342.19200300.100.1.3'] || null;
    const displayName = profile.displayName || profile.cn || email || subject;
    const identityId = `identity-${crypto.randomUUID()}`;
    await db.run('INSERT INTO user_identities(id,provider_id,subject,email,display_name,role) VALUES(?,?,?,?,?,?) ON CONFLICT(provider_id,subject) DO UPDATE SET email=excluded.email, display_name=excluded.display_name', identityId, provider.id, subject, email, displayName, 'viewer');
    const identity = await db.get('SELECT * FROM user_identities WHERE provider_id=? AND subject=?', provider.id, subject);
    const token = `sso_${crypto.randomBytes(32).toString('hex')}`;
    await db.run('INSERT INTO sessions(id,token_hash,role,username,expires_at) VALUES(?,?,?,?,datetime(\'now\',\'+8 hours\'))', `session-${crypto.randomUUID()}`, hashKey(token), identity.role, identity.display_name || identity.email || subject);
    res.json({ token, user: { id: identity.id, username: identity.display_name, email: identity.email, role: identity.role }, expiresIn: 28800, protocol: 'saml' });
  } catch (error) { res.status(401).json({ error: { code: 'SAML_SIGNATURE_VALIDATION_FAILED', message: error.message } }); }
});
module.exports = router;
module.exports.buildSaml = buildSaml;
