const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { getDatabase } = require('../db');
const vault = require('../services/secretVault');
const { requireRole, resolveUserFromHeaders, hashKey } = require('../middleware/auth');
const { SAML, ValidateInResponseTo } = require('@node-saml/node-saml');

// Public callers may discover that a provider exists (needed by the login
// page) but must not learn its issuer, client id, redirect URI or certificates.
function publicProviderView(rows, privileged) {
  if (privileged) return rows;
  return rows.map((row) => ({ id: row.id, protocol: row.protocol, enabled: Boolean(row.enabled) }));
}

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

async function listProvidersHandler(req, res, next) {
  try {
    const db = await dbReady();
    const user = await resolveUserFromHeaders(req.headers);
    const privileged = Boolean(user?.isAuthenticated && (user.permissions?.includes('all') || user.role === 'admin'));
    const rows = await db.all('SELECT id,protocol,issuer,client_id,redirect_uri,entry_point,sp_entity_id,scopes,enabled FROM sso_providers ORDER BY id');
    res.json(publicProviderView(rows, privileged));
  } catch (e) { next(e); }
}

function hasRequiredBaseFields({ id, issuer, redirectUri, protocol }) {
  return id && issuer && redirectUri && ['oidc', 'saml'].includes(protocol);
}

function validateOidcSpecific({ protocol, clientId }) {
  return protocol !== 'oidc' || clientId;
}

function validateSamlSpecific({ protocol, entryPoint, idpCertificate, spEntityId }) {
  return protocol !== 'saml' || (entryPoint && idpCertificate && spEntityId);
}

function validateProviderInput({ id, issuer, redirectUri, protocol, clientId, entryPoint, idpCertificate, spEntityId }) {
  if (!hasRequiredBaseFields({ id, issuer, redirectUri, protocol })) return { error: { code: 'INVALID_SSO_PROVIDER', message: 'OIDC requires id, issuer, clientId and redirectUri; SAML also requires entryPoint, idpCertificate and spEntityId.' } };
  if (!validateOidcSpecific({ protocol, clientId })) return { error: { code: 'INVALID_SSO_PROVIDER', message: 'OIDC requires id, issuer, clientId and redirectUri; SAML also requires entryPoint, idpCertificate and spEntityId.' } };
  if (!validateSamlSpecific({ protocol, entryPoint, idpCertificate, spEntityId })) return { error: { code: 'INVALID_SSO_PROVIDER', message: 'OIDC requires id, issuer, clientId and redirectUri; SAML also requires entryPoint, idpCertificate and spEntityId.' } };
  return null;
}

function prepareProviderData({ clientSecret, idpCertificate, vault }) {
  const encrypted = clientSecret ? JSON.stringify(vault.encrypt(clientSecret)) : null;
  const encryptedCertificate = idpCertificate ? JSON.stringify(vault.encrypt(idpCertificate)) : null;
  return { encrypted, encryptedCertificate };
}

async function processProviderCreation(reqBody, vault) {
  const { id, issuer, clientId, clientSecret, redirectUri, scopes = 'openid profile email', protocol = 'oidc', entryPoint, idpCertificate, spEntityId } = reqBody || {};
  const validationError = validateProviderInput({ id, issuer, redirectUri, protocol, clientId, entryPoint, idpCertificate, spEntityId });
  if (validationError) return { error: validationError };
  const { encrypted, encryptedCertificate } = prepareProviderData({ clientSecret, idpCertificate, vault });
  const providerData = { id, issuer, clientId, redirectUri, encrypted, scopes, protocol, entryPoint, encryptedCertificate, spEntityId };
  return { providerData, response: buildProviderResponse({ id, issuer, clientId, redirectUri, scopes, protocol, entryPoint, spEntityId }) };
}

async function createProviderHandler(req, res, next) {
  try {
    const db = await dbReady();
    const result = await processProviderCreation(req.body, vault);
    if (result.error) return res.status(400).json(result.error);
    await insertProviderRecord(db, result.providerData);
    res.status(201).json(result.response);
  } catch (e) { next(e); }
}

async function startOidcHandler(req, res, next) {
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
}

async function startSamlHandler(req, res, next) {
  try {
    const db = await dbReady();
    const provider = await db.get("SELECT * FROM sso_providers WHERE id=? AND enabled=1 AND protocol='saml'", req.params.id);
    if (!provider) return res.status(404).json({ error: { code: 'SAML_PROVIDER_NOT_FOUND', message: 'SAML provider not found.' } });
    const relayState = crypto.randomBytes(18).toString('base64url');
    res.redirect(await buildSaml(provider, db).getAuthorizeUrlAsync(relayState, req.get('host')));
  } catch (e) { next(e); }
}
function validateOidcCallbackInput({ provider, code, request }) {
  return provider && code && request ? null : { error: { code: 'INVALID_SSO_CALLBACK', message: 'Provider, authorization code and valid state are required.' } };
}

function buildTokenRequestBody({ code, redirectUri, clientId, codeVerifier, secret }) {
  return new URLSearchParams({ grant_type: 'authorization_code', code: String(code), redirect_uri: redirectUri, client_id: clientId, code_verifier: codeVerifier, ...(secret ? { client_secret: secret } : {}) });
}

async function exchangeCodeForTokens({ tokenEndpoint, code, redirectUri, clientId, codeVerifier, secret }) {
  const body = buildTokenRequestBody({ code, redirectUri, clientId, codeVerifier, secret });
  return fetchJson(tokenEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
}

async function validateAndExtractSubject({ idToken, provider, discovery, expectedNonce }) {
  const claims = await validateIdToken({ token: idToken, provider, discovery, expectedNonce });
  const subject = claims.sub;
  if (!subject) throw new Error('OIDC identity token has no subject.');
  return { claims, subject };
}

async function upsertIdentity({ db, providerId, subject, claims }) {
  const identityId = `identity-${crypto.randomUUID()}`;
  await db.run('INSERT INTO user_identities(id,provider_id,subject,email,display_name,role) VALUES(?,?,?,?,?,?) ON CONFLICT(provider_id,subject) DO UPDATE SET email=excluded.email, display_name=excluded.display_name', identityId, providerId, subject, claims.email || null, claims.name || claims.preferred_username || subject, 'viewer');
  return db.get('SELECT * FROM user_identities WHERE provider_id=? AND subject=?', providerId, subject);
}

async function createSession({ db, identity }) {
  const token = `sso_${crypto.randomBytes(32).toString('hex')}`;
  await db.run('INSERT INTO sessions(id,token_hash,role,username,expires_at) VALUES(?,?,?,?,datetime(\'now\',\'+8 hours\'))', `session-${crypto.randomUUID()}`, hashKey(token), identity.role, identity.display_name || identity.email);
  return { token, user: { id: identity.id, username: identity.display_name, email: identity.email, role: identity.role }, expiresIn: 28800 };
}

async function handleOidcCallback(req, res, next) {
  try {
    const db = await dbReady();
    const provider = await db.get("SELECT * FROM sso_providers WHERE id=? AND enabled=1 AND protocol='oidc'", req.params.id);
    const state = String(req.query.state || '');
    const request = state ? await db.get('SELECT * FROM oidc_requests WHERE id=? AND provider_id=? AND expires_at>?', state, req.params.id, Date.now()) : null;
    const validationError = validateOidcCallbackInput({ provider, code: req.query.code, request });
    if (validationError) return res.status(400).json(validationError);
    await db.run('DELETE FROM oidc_requests WHERE id=?', state);
    const discovery = await oidcDiscovery(provider);
    const secret = provider.client_secret_json ? vault.decrypt(JSON.parse(provider.client_secret_json)) : undefined;
    const tokens = await exchangeCodeForTokens({ tokenEndpoint: discovery.token_endpoint, code: req.query.code, redirectUri: provider.redirect_uri, clientId: provider.client_id, codeVerifier: request.code_verifier, secret });
    const { claims, subject } = await validateAndExtractSubject({ idToken: tokens.id_token, provider, discovery, expectedNonce: request.nonce });
    const identity = await upsertIdentity({ db, providerId: provider.id, subject, claims });
    const session = await createSession({ db, identity });
    res.json(session);
  } catch (e) { next(e); }
}

async function exchangeCodeForTokens({ tokenEndpoint, code, redirectUri, clientId, codeVerifier, secret }) {
  const body = new URLSearchParams({ grant_type: 'authorization_code', code: String(code), redirect_uri: redirectUri, client_id: clientId, code_verifier: codeVerifier, ...(secret ? { client_secret: secret } : {}) });
  return fetchJson(tokenEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
}

function validateSamlAcsInput({ provider, samlResponse }) {
  return provider && samlResponse ? null : { error: { code: 'INVALID_SAML_RESPONSE', message: 'A configured provider and SAMLResponse are required.' } };
}

function extractSubjectAndEmail({ profile }) {
  const subject = profile.nameID;
  const email = profile.email || profile.mail || profile['urn:oid:0.9.2342.19200300.100.1.3'] || null;
  return { subject, email };
}

function extractDisplayName({ profile, email, subject }) {
  return profile.displayName || profile.cn || email || subject;
}

async function upsertSamlIdentity({ db, providerId, subject, email, displayName }) {
  const identityId = `identity-${crypto.randomUUID()}`;
  await db.run('INSERT INTO user_identities(id,provider_id,subject,email,display_name,role) VALUES(?,?,?,?,?,?) ON CONFLICT(provider_id,subject) DO UPDATE SET email=excluded.email, display_name=excluded.display_name', identityId, providerId, subject, email, displayName, 'viewer');
  return db.get('SELECT * FROM user_identities WHERE provider_id=? AND subject=?', providerId, subject);
}

async function handleSamlAcs(req, res, next) {
  try {
    const db = await dbReady();
    const provider = await db.get("SELECT * FROM sso_providers WHERE id=? AND enabled=1 AND protocol='saml'", req.params.id);
    const validationError = validateSamlAcsInput({ provider, samlResponse: req.body?.SAMLResponse });
    if (validationError) return res.status(400).json(validationError);
    const { profile, loggedOut } = await buildSaml(provider, db).validatePostResponseAsync({ SAMLResponse: String(req.body.SAMLResponse), RelayState: String(req.body.RelayState || '') });
    if (loggedOut || !profile?.nameID) return res.status(401).json({ error: { code: 'SAML_LOGOUT_OR_INVALID', message: 'SAML response did not establish an identity.' } });
    const { subject, email } = extractSubjectAndEmail({ profile });
    const displayName = extractDisplayName({ profile, email, subject });
    const identity = await upsertSamlIdentity({ db, providerId: provider.id, subject, email, displayName });
    const session = await createSession({ db, identity });
    res.json({ ...session, protocol: 'saml' });
  } catch (error) { res.status(401).json({ error: { code: 'SAML_SIGNATURE_VALIDATION_FAILED', message: error.message } }); }
}

router.get('/callback/:id', handleOidcCallback);
router.post('/saml/:id/acs', handleSamlAcs);
module.exports = router;
module.exports.buildSaml = buildSaml;
module.exports.publicProviderView = publicProviderView;
