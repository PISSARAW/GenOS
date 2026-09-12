const assert = require('node:assert/strict');
const { publicProviderView } = require('../src/routes/ssoRoutes');

const rows = [{
  id: 'corp',
  protocol: 'oidc',
  issuer: 'https://idp.internal.example',
  client_id: 'genos-client',
  redirect_uri: 'https://genos.example/api/sso/callback/corp',
  entry_point: 'https://idp.internal.example/saml',
  sp_entity_id: 'genos-sp',
  scopes: 'openid profile email',
  enabled: 1
}];

const anon = publicProviderView(rows, false);
assert.deepEqual(anon, [{ id: 'corp', protocol: 'oidc', enabled: true }]);
assert.equal(JSON.stringify(anon).includes('idp.internal.example'), false, 'issuer must not leak to anonymous callers');
assert.equal(JSON.stringify(anon).includes('genos-client'), false, 'client id must not leak');

const admin = publicProviderView(rows, true);
assert.equal(admin, rows, 'privileged callers receive the full provider rows');

console.log('SSO provider disclosure checks passed.');
