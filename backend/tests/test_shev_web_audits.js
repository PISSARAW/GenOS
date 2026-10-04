'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fixture = require('./ontogenesisFixture');
const store = require('../src/services/ontogenesis/projectStore');
const { tickOnce } = require('../src/services/ontogenesis/tickService');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const { recordWebObservation, verifyWebEffect } = require('../src/services/shev/adapters/webAuditAdapter');
const { WebAuditSensors } = require('../src/services/webAuditSensors');
const { WebAuditService } = require('../src/services/webAuditService');

async function main() {
  let repaired = false;
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    if (request.url.startsWith('/done')) {
      response.end(`<html lang="fr"><title>Résultat</title><main><h1>${repaired
        ? 'Réservation confirmée' : 'Échec'}</h1></main></html>`);
      return;
    }
    const field = repaired ? '<label>Nom <input name="name"></label>' : '<input name="name">';
    response.end(`<html lang="fr"><title>Accueil</title><main><h1>Accueil</h1>
      <form action="/done">${field}<button>Réserver</button></form></main></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-shev-web-'));
  const originalFreeMem = os.freemem;
  os.freemem = () => Math.round(os.totalmem() * 0.5);
  const db = await fixture.memoryDb();
  const chromePath = process.env.GENOS_BROWSER_EXECUTABLE_PATH
    || await require('puppeteer').executablePath();
  const realSensors = new WebAuditSensors({ allowedHosts: ['127.0.0.1'], chromePath });
  const sensors = { axe: realSensors.axe.bind(realSensors),
    lighthouseAudit: async (url, minScores) => ({ sensor: 'lighthouse', result: 'confirmed',
      url, version: 'fixture', scores: { seo: 0.9 }, minScores }) };
  const service = new WebAuditService({ allowedHosts: ['127.0.0.1'], chromePath,
    artifactsDir: root, sensors });
  const url = `http://127.0.0.1:${server.address().port}/`;
  const config = { url, lighthouse: { minScores: { seo: 0.5 } },
    axe: { maxViolations: 0 }, journey: { url, steps: [
      { action: 'fill', role: 'textbox', name: 'Nom', value: 'Ada' },
      { action: 'click', role: 'button', name: 'Réserver' }
    ], assertions: [
      { type: 'url', expected: `${url}done?name=Ada` },
      { type: 'text', role: 'heading', name: 'Réservation confirmée', expected: 'Réservation confirmée' }
    ] } };
  try {
    await store.createProject(db, { id: 'shev-web', rootPath: root,
      branch: 'codex/ontogenesis', objective: 'maintenir le formulaire', config: fixture.testConfig() });
    await registerResponsibility(db, { projectId: 'shev-web', authorityRef: 'delegation:review',
      mandate: { purpose: 'Maintenir le formulaire', autoDiagnose: true, autoInstrument: true,
        dimensions: [{ name: 'parcours', expected: 'Réservation accessible et fonctionnelle',
          acceptance: ['Parcours, accessibilité et qualité vérifiés après intervention.'] }] } });
    await tickOnce(db, { projectId: 'shev-web', owner: 'web-audit-test' });
    await tickOnce(db, { projectId: 'shev-web', owner: 'web-audit-test' });
    const before = await recordWebObservation(db, { projectId: 'shev-web', dimension: 'parcours', config }, service);
    assert.equal(before.receipt.result, 'regressed');
    assert.equal(before.observation.kind, 'degradation');
    assert.ok(before.receipt.checks.some(check => check.sensor === 'axe-core' && check.result === 'regressed'));
    await tickOnce(db, { projectId: 'shev-web', owner: 'web-audit-test' });
    const initiative = await db.get('SELECT * FROM shev_initiatives WHERE project_id = ?', ['shev-web']);
    assert.equal(initiative.status, 'queued');
    await assert.rejects(verifyWebEffect(db, { projectId: 'shev-web', initiativeId: initiative.id,
      dimension: 'parcours', config }, service), /completed queued task/);
    await db.run("UPDATE ontogenesis_backlog SET status = 'done' WHERE id = ?", [initiative.task_id]);
    repaired = true;
    const after = await verifyWebEffect(db, { projectId: 'shev-web', initiativeId: initiative.id,
      dimension: 'parcours', config }, service);
    assert.equal(after.result, 'confirmed', JSON.stringify(after));
    assert.equal(after.effect.agent_result, 'not_tested');
    assert.equal(after.observation.kind, 'state');
    assert.ok(fs.existsSync(after.receipt.receiptPath));
    assert.equal((await verifyWebEffect(db, { projectId: 'shev-web', initiativeId: initiative.id,
      dimension: 'parcours', config }, service)).effect.replayed, true);
    await assert.rejects(verifyWebEffect(db, { projectId: 'shev-web', initiativeId: initiative.id,
      dimension: 'parcours', config: { ...config, axe: { maxViolations: 1 } } }, service), /criteria changed/);
    const malformed = new WebAuditService({ allowedHosts: ['127.0.0.1'], artifactsDir: root,
      sensors: { axe: async () => ({ sensor: 'axe-core', result: 'unexpected' }) } });
    const uncertain = await malformed.run({ url, axe: { maxViolations: 0 } });
    assert.equal(uncertain.result, 'inconclusive');
    const unsupported = new WebAuditService({ allowedHosts: ['127.0.0.1'], artifactsDir: root,
      sensors: { axe: async () => ({ sensor: 'axe-core', result: 'confirmed' }) } });
    assert.equal((await unsupported.run({ url, axe: { maxViolations: 0 } })).result, 'inconclusive');
    await assert.rejects(service.run({ url, lighthouse: { minScores: { seo: 1.1 } } }), /thresholds/);
    console.log('SHEV web regression, worker task gate, and independent effect verification passed.');
  } finally {
    os.freemem = originalFreeMem;
    await db.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
