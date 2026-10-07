'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function routes(page, output) {
  assert.equal(await page.locator('#connection-panel').isVisible(), false);
  assert.equal(await page.locator('#session-bar').isVisible(), true);
  assert.equal(await page.locator('#context-scope #organization').count(), 1);
  await page.locator('[data-target="dashboard-view"]').click();
  await page.locator('[data-target="files-view"]').click();
  assert.match(page.url(), /#\/fichiers/);
  await page.goBack();
  await page.locator('[data-target="dashboard-view"][aria-pressed="true"]').waitFor();
  await page.goForward();
  await page.locator('[data-target="files-view"][aria-pressed="true"]').waitFor();
  await page.locator('[data-target="inspection"]').click();
  assert.match(page.url(), /#\/runs\?run=/);
  await page.screenshot({ path: path.join(output, 'studio-navigation-desktop.png'), fullPage: true });
}

async function deepLink(page, spec) {
  const hash = '#/runs?run=' + encodeURIComponent(spec.run.id);
  await page.goto(spec.settings.url + '/studio/' + hash);
  await page.reload();
  assert.equal(await page.locator('#inspection').isVisible(), false);
  assert.match(await page.locator('#onboarding-steps').textContent(), /Authentification — À faire/);
  await page.locator('#token').fill(spec.token);
  await page.locator('#organization').fill(spec.settings.organization);
  await page.locator('#project').fill(spec.settings.project);
  await page.locator('#agent').fill(spec.settings.agent);
  await page.getByRole('button', { name: 'Ouvrir l’exécution' }).click();
  await page.locator('#run-status').filter({ hasText: 'completed' }).waitFor();
  assert.equal(await page.locator('#run-id').textContent(), spec.run.id);
  assert.equal(await page.locator('#token').inputValue(), '');
  assert.equal(await page.locator('#onboarding').getAttribute('open'), null);
  assert.match(await page.locator('#onboarding-steps').textContent(), /Première lecture — Dossier chargé/);
  assert.equal(new URL(page.url()).search, '');
  await page.evaluate(() => { location.hash = '#/runs?run=foreign-run'; });
  await page.locator('#message').filter({ hasText: '404' }).waitFor();
  assert.equal(await page.locator('#run-id').textContent(), '');
  assert.equal(await page.locator('#organization').inputValue(), spec.settings.organization);
  assert.equal(await page.locator('#project').inputValue(), spec.settings.project);
}

async function run(page, spec, output) {
  await routes(page, output);
  await deepLink(page, spec);
  const result = { history: true, deepLink: true, unauthenticatedRefusal: true,
    missingRunRefusal: true, tenantUnchanged: true, tokenNotStored: true };
  fs.writeFileSync(path.join(output, 'studio-navigation-qualified.json'), JSON.stringify(result, null, 2));
  return result;
}

module.exports = { run };
