'use strict';
const assert = require('node:assert/strict');
const { authorizeClinicalMutation,clinicalSignature } = require('../src/services/medical/therapyAuthorizationService');
const { applyTherapy } = require('../src/services/medical/clinicalTherapyService');
process.env.GENOS_THERAPY_AUTH_SECRET = 'clinical-unit-test-secret';
async function main() {
  await assert.rejects(applyTherapy({},'target',{ diagnosis:{} }),{ code:'THERAPY_AUTHORIZATION_REQUIRED' });
  const auth = { approved:true,authorizationId:'approval',targetAgentId:'target',approverId:'admin',therapyType:'watchful_waiting',expiresAt:Date.now()+10000 };
  auth.signature=clinicalSignature(auth);
  authorizeClinicalMutation('target',{ authorization:auth });
  assert.throws(() => authorizeClinicalMutation('other',{ authorization:auth }));
  assert.throws(() => authorizeClinicalMutation('target',{ authorization:{ ...auth,expiresAt:0 } }));
  assert.throws(() => authorizeClinicalMutation('target',{ authorization:{ ...auth,therapyType:'quarantine' } }));
  console.log('Clinical mutations require signed explicit scoped unexpired approval: PASS');
}
main().catch(error => { console.error(error);process.exitCode=1; });
