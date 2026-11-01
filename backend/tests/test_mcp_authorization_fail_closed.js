'use strict';

// Autorisation : une action sans droit valide est refusée, y compris par appel
// direct. Couvre les angles morts corrigés :
//  1. un bail d'autorité ne survit pas à l'expiration du bail du processus ;
//  2. un outil désactivé reste refusé même s'il figure dans un bail d'autorité ;
//  3. un appel direct au registre backend sans bail est refusé.
const assert = require('node:assert/strict');
const { directToolLeaseAllows } = require('../src/services/mcpExecutor/config');
const { executeConfiguredTransport } = require('../src/services/mcpExecutor/dispatch');

const names = ['GENOS_MCP_LEASE', 'GENOS_MCP_LEASE_EXPIRES_AT', 'GENOS_MCP_DISABLED_TOOLS',
  'GENOS_MCP_EXPOSE_ALL', 'GENOS_MCP_URL', 'GENOS_MCP_ENDPOINT', 'GENOS_MCP_COMMAND'];
const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
const runLocal = async (command) => ({ configured: true, success: true, status: 'completed', output: command });

async function expiredProcessLeaseRevokesAuthorityLease() {
  process.env.GENOS_MCP_LEASE_EXPIRES_AT = String(Date.now() - 1000);
  assert.equal(directToolLeaseAllows('genos_replay', ['genos_replay']), false);
  const result = await executeConfiguredTransport({ toolName: 'genos_replay',
    args: { snapshot: 'snapshot.json' }, authorityLease: ['genos_replay'], runLocal });
  assert.equal(result.success, false, 'an expired lease must not execute through an authority lease');
  assert.equal(result.status, 'lease_denied');
  process.env.GENOS_MCP_LEASE_EXPIRES_AT = 'not-a-date';
  assert.equal(directToolLeaseAllows('genos_replay', ['genos_replay']), false);
  process.env.GENOS_MCP_LEASE_EXPIRES_AT = String(Date.now() + 60000);
  assert.equal(directToolLeaseAllows('genos_replay', ['genos_replay']), true);
  delete process.env.GENOS_MCP_LEASE_EXPIRES_AT;
}

function disabledToolBeatsAuthorityLease() {
  process.env.GENOS_MCP_DISABLED_TOOLS = 'genos_replay';
  assert.equal(directToolLeaseAllows('genos_replay', ['genos_replay']), false);
  delete process.env.GENOS_MCP_DISABLED_TOOLS;
}

async function directCallWithoutLeaseIsDenied() {
  assert.equal(directToolLeaseAllows('genos_replay'), false);
  const result = await executeConfiguredTransport({ toolName: 'genos_replay',
    args: { snapshot: 'snapshot.json' }, runLocal });
  assert.equal(result.success, false);
  assert.equal(result.status, 'lease_denied');
}

(async () => {
  try {
    for (const name of names) delete process.env[name];
    await expiredProcessLeaseRevokesAuthorityLease();
    disabledToolBeatsAuthorityLease();
    await directCallWithoutLeaseIsDenied();
    console.log('MCP authorization fails closed on expiry, disablement and direct calls: PASS');
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
