'use strict';
const assert = require('node:assert/strict');

async function action(page, spec) {
  const form = page.locator(`[data-action="${spec.id}"], [data-journey-read="${spec.id}"]`);
  const detail = form.locator('..');
  if (await detail.evaluate(element => element.tagName === 'DETAILS' && !element.open)) await detail.locator('summary').click();
  for (const [name, value] of Object.entries(spec.fields || {})) await form.locator(`[name="${name}"]`).fill(value);
  const response = page.waitForResponse(item => item.url().endsWith(spec.route) && item.request().method() === (spec.method || 'POST'));
  await form.locator('button').click();
  const result = await response;
  if (spec.status) assert.equal(result.status(), spec.status);
  else assert.ok(result.ok(), await result.text());
  const message = spec.status >= 400 ? String(spec.status) : 'État runtime chargé';
  await page.locator('#message').filter({ hasText: message }).waitFor();
  return result.json();
}

async function worlds(page) {
  const root = '/api/studio/agents/consumer-promotion-agent';
  await page.locator('[data-target="worlds-view"]').click();
  const snapshot = await action(page, { id: 'worlds-checkpoint', route: root + '/checkpoints', fields: { reason: 'Browser D01' } });
  const branch = await action(page, { id: 'worlds-branch', route: root + '/branches', fields: { refName: 'browser-alternative' } });
  assert.equal(branch.fromCommitId, snapshot.snapshotId);
  const clone = await action(page, { id: 'worlds-clone', route: root + '/clone' });
  const diff = await action(page, { id: 'worlds-compare', route: root + '/compare' });
  assert.equal(diff.rightAgentId, clone.clonedAgentId);
  await action(page, { id: 'worlds-inspect', route: root + '/worlds', method: 'GET' });
  assert.match(await page.locator('#worlds-result-summary').textContent(), /shared_workspace/);
  await page.getByRole('button', { name: 'Examiner hypothèses et preuves au laboratoire' }).click();
  assert.equal(await page.locator('#research-view').isVisible(), true);
  return { checkpoint: snapshot.snapshotId, workspaceSnapshot: snapshot.workspaceSnapshotId, branch: branch.branchId, clone: clone.clonedAgentId };
}

async function knowledge(page, spec) {
  await page.locator('[data-target="knowledge-view"]').click();
  const memory = await action(page, { id: 'knowledge-record', route: '/api/studio/memories',
    fields: { title: 'Browser experience', content: 'Transport does not prove a decision.' } });
  assert.equal(memory.evidenceStatus, 'provisional');
  await action(page, { id: 'knowledge-inspect', route: '/api/studio/memories/' + memory.id, method: 'GET' });
  assert.match(await page.locator('#knowledge-result-summary').textContent(), /Vérité validéeNon/);
  const transferred = await action(page, { id: 'knowledge-transfer', route: '/api/studio/memories/' + memory.id + '/transfer',
    fields: { targetAgentId: spec.settings.agent, reason: 'Preserve origin' } });
  assert.equal(transferred.parentHash, memory.provenanceHash);
  assert.equal(transferred.promotionGranted, false);
  return { memoryId: memory.id, transferId: transferred.id, parentHash: transferred.parentHash };
}

async function organism(page) {
  await page.locator('[data-target="organism-view"]').click();
  const original = await action(page, { id: 'organism-inspect', route: '/api/studio/genomes/studio-source-genome',
    method: 'GET', fields: { genomeId: 'studio-source-genome' } });
  assert.ok(original.sections.some(section => section.name === 'META'));
  const mutated = await action(page, { id: 'organism-mutate', route: '/api/studio/genomes/studio-source-genome/mutate' });
  assert.equal(mutated.sourceHash, original.genome.contentHash);
  assert.equal(mutated.deployed, false);
  assert.match(await page.locator('#organism-result-summary').textContent(), /Promotion accordéeNon/);
  return { sourceHash: mutated.sourceHash, candidateId: mutated.genomeRef, eventId: mutated.eventId };
}

async function recovery(page, context) {
  const { spec, worlds: source } = context;
  const route = '/api/studio/agents/consumer-promotion-agent';
  await page.locator('[data-target="recovery-view"]').click();
  const diagnostic = await action(page, { id: 'recovery-inspect', route: route + '/diagnostic', method: 'GET' });
  assert.equal(diagnostic.agent.processAlive, null);
  const refused = await action(page, { id: 'recovery-stop', route: route + '/stop', status: 409 });
  assert.equal(refused.error.code, 'EXTERNAL_RUNTIME_UNVERIFIED');
  const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {},1000)'], { stdio: 'ignore', windowsHide: true });
  const state = require('../../src/services/agentOrchestrationState');
  try {
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    state.activeProcesses.set(spec.settings.agent, child);
    child.once('exit', () => state.activeProcesses.delete(spec.settings.agent));
    const stopped = await action(page, { id: 'recovery-stop', route: route + '/stop' });
    assert.equal(stopped.confirmed, true);
    assert.equal(require('../../src/services/garageProcessControl').pidAlive(child.pid), false);
    return await restoreWorkspace(page, { spec, snapshotId: source.workspaceSnapshot });
  } finally {
    if (require('../../src/services/garageProcessControl').pidAlive(child.pid)) child.kill();
    state.activeProcesses.delete(spec.settings.agent);
  }
}

async function restoreWorkspace(page, context) {
  const { request } = require('./studioRequest.cjs');
  const route = '/api/workspaces/consumer-ws/file?path=a%2Fverify.cjs';
  const before = await request(context.spec, route);
  assert.equal((await request(context.spec, route, { method: 'PUT', body: {
    version: before.value.version, contentBase64: Buffer.from('changed after checkpoint').toString('base64') } })).status, 200);
  await action(page, { id: 'recovery-preview', method: 'GET',
    route: '/api/workspaces/consumer-ws/rollback-preview?snapshotId=' + context.snapshotId, fields: { snapshotId: context.snapshotId } });
  assert.match(await page.locator('#recovery-result-summary').textContent(), /a\/verify.cjs/);
  await page.getByRole('button', { name: 'Ouvrir la restauration du workspace inspecté' }).click();
  assert.equal(await page.locator('#files-view').isVisible(), true);
  assert.equal(await page.locator('#restore-id').inputValue(), context.snapshotId);
  const response = page.waitForResponse(item => item.url().endsWith('/restore') && item.request().method() === 'POST');
  await page.locator('#restore').click();
  const result = await response;
  assert.equal(result.status(), 200);
  await page.locator('#restore-result-summary').filter({ hasText: 'Snapshot de sécurité' }).waitFor();
  assert.equal((await request(context.spec, route)).value.content, before.value.content);
  return { externalRefused: true, managedStopConfirmed: true, restored: context.snapshotId, safetySnapshot: (await result.json()).safetySnapshot.id };
}

module.exports = { action, worlds, knowledge, organism, recovery };
