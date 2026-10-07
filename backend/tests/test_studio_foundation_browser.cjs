'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const fixtures = {
  '/api/auth/session': { user: { permissions: ['workspace:write'] } },
  '/api/control-plane/organizations': [{ id: 'org', name: 'Fixture organisation' }],
  '/api/control-plane/projects': [{ id: 'project', name: 'Fixture projet' }],
  '/api/agents': [], '/api/workspaces': [{ id: 'workspace', name: 'Fixture workspace' }]
};

async function fixtureApi(route) {
  const url = new URL(route.request().url());
  const value = url.pathname.endsWith('/file')
    ? { path: 'fixture.txt', version: 'fixture-version', content: 'baseline' }
    : fixtures[url.pathname];
  await route.fulfill({ status: value ? 200 : 404, contentType: 'application/json',
    body: JSON.stringify(value || { error: { code: 'FIXTURE_MISSING' } }) });
}

async function login(page) {
  await page.locator('#token').fill('fixture-only');
  await page.locator('#organization').fill('org');
  await page.locator('#project').fill('project');
  await page.getByRole('button', { name: 'Ouvrir l’exécution' }).click();
  await page.locator('#session-bar').waitFor();
  await page.locator('[data-target="files-view"]').click();
  await page.locator('#file-path').fill('fixture.txt');
  await page.locator('#file-open').click();
  await page.locator('#file-result').filter({ hasText: 'Version chargée' }).waitFor();
  await page.locator('#file-content').fill('draft to keep');
}

async function guards(page) {
  const refused = dialog => dialog.dismiss();
  page.on('dialog', refused);
  await page.locator('#workspace-choice').fill('foreign-workspace');
  await page.locator('#workspace-choice').dispatchEvent('change');
  assert.equal(await page.locator('#workspace-choice').inputValue(), 'workspace');
  await page.locator('#project').fill('foreign-project');
  await page.locator('#project').dispatchEvent('change');
  assert.equal(await page.locator('#project').inputValue(), 'project');
  await page.locator('#disconnect').click();
  assert.equal(await page.locator('#session-bar').isVisible(), true);
  assert.equal(await page.locator('#file-content').inputValue(), 'draft to keep');
  page.off('dialog', refused);
}

async function failures(page) {
  const pattern = '**/api/workspaces/workspace/file?**';
  await page.evaluate(() => { document.getElementById('file-diff-button').disabled = true; });
  for (const status of [403, 409, 502]) {
    await page.route(pattern, route => route.fulfill({ status, contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'FIXTURE_REFUSED' } }) }));
    await page.locator('#file-save').click();
    await page.locator('#message').filter({ hasText: String(status) }).waitFor();
    assert.equal(await page.locator('#file-content').inputValue(), 'draft to keep');
    assert.equal(await page.locator('#file-diff-button').isDisabled(), true);
    await page.unroute(pattern);
  }
  await page.route(pattern, route => route.abort('internetdisconnected'));
  await page.locator('#file-save').click();
  await page.locator('#message').filter({ hasText: 'Effet non confirmé' }).waitFor();
  assert.equal(await page.locator('#file-content').inputValue(), 'draft to keep');
  await page.unroute(pattern);
}

async function expiry(page) {
  let dialogs = 0;
  page.on('dialog', async dialog => { dialogs += 1; await dialog.dismiss(); });
  await page.route('**/api/workspaces/workspace/file?**', route =>
    route.fulfill({ status: 401, contentType: 'text/plain', body: 'expired' }));
  await page.locator('#file-save').click();
  await page.locator('#message').filter({ hasText: 'Session expirée' }).waitFor();
  assert.equal(await page.locator('#session-bar').isVisible(), false);
  assert.equal(await page.locator('#file-content').inputValue(), '');
  assert.equal(dialogs, 0);
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
}

async function acceptedDiscard(page) {
  await login(page);
  page.removeAllListeners('dialog');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#workspace-choice').fill('other-workspace');
  await page.locator('#workspace-choice').dispatchEvent('change');
  assert.equal(await page.locator('#workspace-choice').inputValue(), 'other-workspace');
  assert.equal(await page.locator('#file-content').inputValue(), '');
}

async function main() {
  const server = await require('./helpers/studioStaticServer.cjs').start();
  const output = process.env.GENOS_STUDIO_TEST_ARTIFACTS;
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch({ channel: process.env.B06_BROWSER_CHANNEL || 'msedge' });
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', fixtureApi);
    await page.goto(server.url);
    await login(page);
    await guards(page);
    await failures(page);
    if (output) {
      fs.mkdirSync(output, { recursive: true });
      await page.screenshot({ path: path.join(output, 'studio-foundation-draft.png'), fullPage: true });
    }
    await expiry(page);
    await page.unroute('**/api/workspaces/workspace/file?**');
    await acceptedDiscard(page);
    assert.deepEqual(errors, []);
    console.log('Studio foundation browser: real DOM, fixture API; cancelled transitions, accepted discard, draft errors, original controls, uncertain effect and forced 401 purge passed.');
  } finally {
    await browser?.close();
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
