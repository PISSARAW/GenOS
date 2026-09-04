const assert = require('assert/strict');
process.env.GENOS_SECRET_KEY = 'saml-validation-test-key';
const vault = require('./src/services/secretVault');
const { buildSaml } = require('./src/routes/ssoRoutes');

const provider = {
  id: 'saml-test',
  issuer: 'https://idp.example.test/entity',
  entry_point: 'https://idp.example.test/sso',
  redirect_uri: 'https://genos.example.test/api/sso/saml/saml-test/acs',
  sp_entity_id: 'https://genos.example.test/saml/metadata',
  idp_cert_json: JSON.stringify(vault.encrypt('-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----'))
};
const db = { run: async () => {}, get: async () => null };

async function main() {
  const saml = buildSaml(provider, db);
  assert.equal(saml.options.wantAssertionsSigned, true);
  assert.equal(saml.options.wantAuthnResponseSigned, true);
  assert.equal(saml.options.validateInResponseTo, 'always');
  const unsigned = Buffer.from('<Response xmlns="urn:oasis:names:tc:SAML:2.0:protocol"/>').toString('base64');
  await assert.rejects(() => saml.validatePostResponseAsync({ SAMLResponse: unsigned }));
  console.log('SAML cryptographic validation checks passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
