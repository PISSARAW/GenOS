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
  assert.ok(result.ok(), await result.text());
  await page.locator('#message').filter({ hasText: 'État runtime chargé' }).waitFor();
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
  return { checkpoint: snapshot.snapshotId, branch: branch.branchId, clone: clone.clonedAgentId };
}

module.exports = { action, worlds };
