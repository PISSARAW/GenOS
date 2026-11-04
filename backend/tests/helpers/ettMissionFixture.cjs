'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const fixture = require('../ontogenesisFixture');
const { bytesDigest } = require('../../src/services/endogenousThoughtMissionContract');

async function create(text) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-ett-mission-'));
  const workspace = path.join(directory, 'workspace');
  fs.mkdirSync(workspace);
  const filename = path.join(workspace, 'candidate.md');
  fs.writeFileSync(filename, text);
  const db = await fixture.memoryDb(path.join(directory, 'mission.sqlite'));
  const projectId = `ett-mission-${crypto.randomUUID()}`;
  const agentId = `agent-${crypto.randomUUID()}`;
  const missionId = `mission-${crypto.randomUUID()}`;
  const keys = crypto.generateKeyPairSync('ed25519');
  await require('../../src/services/ontogenesis/projectStore').createProject(db, {
    id: projectId, rootPath: workspace, branch: 'codex/ett-mission', objective: 'Native bounded structural review' });
  await require('../../src/services/shev/responsibilityService').registerResponsibility(db, {
    projectId, authorityRef: 'operator:test-ett-mission',
    authorityPublicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }),
    mandate: { purpose: 'Vérifier un artefact réel sans certification artistique', autoDiagnose: false,
      autoInstrument: false, dimensions: [{ name: 'artifact_structure', expected: 'Les exigences de structure sont mesurées',
        acceptance: ['Mesures indépendantes sur le contenu exact.'] }] } });
  await db.exec(`CREATE TABLE workspaces(id TEXT PRIMARY KEY,path TEXT,organization_id TEXT,project_id TEXT);
    CREATE TABLE agents(id TEXT PRIMARY KEY,workspace_id TEXT,status TEXT,is_apoptotic INTEGER,cognitive_budget REAL,runtime_pid INTEGER);
    CREATE TABLE missions(mission_id TEXT PRIMARY KEY,orchestrator_agent_id TEXT,status TEXT);
    CREATE TABLE mission_agents(mission_id TEXT,agent_id TEXT);`);
  await db.run('INSERT INTO workspaces VALUES(?,?,?,?)', 'ws-ett-mission', workspace, 'org-a', projectId);
  await db.run("INSERT INTO agents VALUES(?,?,'idle',0,10,NULL)", agentId, 'ws-ett-mission');
  await db.run("INSERT INTO missions VALUES(?,?,'active')", missionId, agentId);
  const input = { organizationId: 'org-a', projectId, agentId, missionId,
    artifact: { path: filename, sha256: bytesDigest(Buffer.from(text)) },
    requirements: { minWords: 1200, minScenes: 5, maxScenes: 7, requireDialogue: true },
    authority: { privateKey: keys.privateKey, grantedBy: 'operator:test-ett-mission' },
    budget: { tokens: 1000, usd: 0, seconds: 120 } };
  return { db, input, keys, directory, workspace, filename };
}

async function close(context) {
  await context.db.close();
  const resolved = path.resolve(context.directory);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('genos-ett-mission-')) {
    throw Error('Fixture cleanup target must remain under the explicit temporary root.');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

module.exports = { create, close };
