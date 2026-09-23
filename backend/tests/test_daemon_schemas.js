'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SPEC_DIR = path.join(__dirname, '..', '..', 'spec');

function loadSpec(name) {
  const raw = fs.readFileSync(path.join(SPEC_DIR, name), 'utf8');
  return JSON.parse(raw);
}

function checkRequired(obj, required) {
  return required.filter((key) => obj[key] === undefined);
}

function exampleTerritory() {
  return {
    apiVersion: 'genos.daemon/v1',
    kind: 'DaemonTerritory',
    id: 'territory.genos-backend',
    organizationId: 'org-1',
    projectId: 'proj-1',
    workspaceId: 'ws-1',
    repoIdentity: 'github.com/genos/test',
    rootPath: '/tmp/genos-test',
    scopePath: 'backend/',
    ref: 'main',
    headSha: 'a'.repeat(40),
    createdAt: new Date().toISOString(),
    lastObservedAt: new Date().toISOString(),
    state: 'ACTIVE'
  };
}

function exampleFinding() {
  const emptyEvidence = {
    observational: [],
    experimental: [],
    formal: [],
    causal: [],
    replicated: [],
    adversarial: []
  };
  return {
    apiVersion: 'genos.daemon/v1',
    kind: 'DaemonFinding',
    id: 'finding.auth-drift-001',
    territoryId: 'territory.genos-backend',
    claim: 'auth middleware may bypass contract check on refresh path',
    scope: { type: 'file', value: 'backend/src/auth/middleware.js' },
    headSha: 'a'.repeat(40),
    status: 'HYPOTHESIZED',
    supporting: emptyEvidence,
    contradicting: emptyEvidence,
    dependencies: [],
    limitations: ['not causally verified'],
    hypothesisId: null,
    createdBy: 'daemon.resident-1',
    createdAt: new Date().toISOString()
  };
}

function exampleDaemon() {
  return {
    apiVersion: 'genos.daemon/v1',
    kind: 'ResidentDaemon',
    id: 'daemon.resident-1',
    territoryId: 'territory.genos-backend',
    genomeRef: 'agents/daemons/resident_daemon.agent.json',
    activity: 'DORMANT',
    health: 'HEALTHY',
    authority: {
      filesystemWrite: false,
      gitPush: false,
      merge: false,
      allowedSignals: ['READ', 'INDEX', 'OBSERVE', 'TEST_SAFE', 'SNAPSHOT', 'SIGNAL']
    },
    organelles: ['cartography', 'findings', 'verification', 'handoff'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

async function main() {
  // 1. Les trois specs existent et sont du JSON valide
  const territorySpec = loadSpec('daemon-territory.schema.json');
  const findingSpec = loadSpec('daemon-finding.schema.json');
  const daemonSpec = loadSpec('resident-daemon.schema.json');
  assert.equal(territorySpec.properties.apiVersion.const, 'genos.daemon/v1');
  assert.equal(findingSpec.title, 'DaemonFinding');
  assert.equal(daemonSpec.title, 'ResidentDaemon');

  // 2. Exemples conformes aux required des contrats
  const territory = exampleTerritory();
  assert.deepEqual(checkRequired(territory, territorySpec.required), []);
  assert.ok(/^territory\.[a-z0-9-]+$/.test(territory.id));
  assert.ok(/^[a-f0-9]{40}$/.test(territory.headSha));

  const finding = exampleFinding();
  assert.deepEqual(checkRequired(finding, findingSpec.required), []);
  assert.ok(finding.limitations.length >= 1);
  assert.ok(findingSpec.properties.status.enum.includes(finding.status));

  const daemon = exampleDaemon();
  assert.deepEqual(checkRequired(daemon, daemonSpec.required), []);
  assert.equal(daemon.authority.filesystemWrite, false);
  assert.equal(daemon.authority.gitPush, false);
  assert.equal(daemon.authority.merge, false);

  // 3. Invariant : réparation absente du génome de base
  assert.ok(!JSON.stringify(daemon).includes('repair'));

  // 4. Invariant : preuve typée, pas de score global
  assert.ok(!('confidence' in finding));
  assert.ok('supporting' in finding && 'contradicting' in finding);

  console.log('Daemon schema contract tests passed (territory, finding, resident-daemon).');
}

main().catch((error) => { console.error(error); process.exit(1); });
