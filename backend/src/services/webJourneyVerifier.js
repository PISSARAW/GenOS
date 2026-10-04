'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const ROLES = new Set(['button', 'link', 'textbox', 'combobox', 'checkbox', 'heading', 'status']);
const ACTIONS = new Set(['click', 'fill', 'select']);
const ASSERTIONS = new Set(['url', 'text', 'visible', 'value']);

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) {
    throw new TypeError(`Invalid journey ${label}.`);
  }
  return value;
}

function permittedUrl(value, allowedHosts) {
  const url = new URL(requiredText(value, 'URL'));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || !allowedHosts.has(url.hostname)) throw new Error('Journey URL is not allowlisted.');
  return url.href;
}

function validateTarget(item) {
  if (!ROLES.has(item.role)) throw new TypeError('Invalid journey role.');
  requiredText(item.name, 'accessible name');
}

function validateStep(step) {
  if (!ACTIONS.has(step.action)) throw new TypeError('Invalid journey action.');
  validateTarget(step);
  if (step.action !== 'click') requiredText(step.value, 'action value');
}

function validateAssertion(assertion, allowedHosts) {
  if (!ASSERTIONS.has(assertion.type)) throw new TypeError('Invalid journey assertion.');
  if (assertion.type !== 'url') validateTarget(assertion);
  if (assertion.type === 'visible') {
    if (typeof assertion.expected !== 'boolean') throw new TypeError('Invalid visibility expectation.');
  } else requiredText(assertion.expected, 'expected value');
  if (assertion.type === 'url') permittedUrl(assertion.expected, allowedHosts);
}

function validateJourney(journey, allowedHosts) {
  if (!journey || !Array.isArray(journey.steps) || !Array.isArray(journey.assertions)
      || journey.steps.length > 20 || !journey.assertions.length || journey.assertions.length > 20) {
    throw new TypeError('Journey requires bounded steps and assertions.');
  }
  permittedUrl(journey.url, allowedHosts);
  journey.steps.forEach(validateStep);
  journey.assertions.forEach(item => validateAssertion(item, allowedHosts));
}

function locate(page, item) {
  return page.getByRole(item.role, { name: item.name, exact: true });
}

async function performStep(page, step) {
  const target = locate(page, step);
  if (step.action === 'click') await target.click();
  if (step.action === 'fill') await target.fill(step.value);
  if (step.action === 'select') await target.selectOption(step.value);
}

async function readAssertion(page, assertion) {
  const target = assertion.type === 'url' ? null : locate(page, assertion);
  if (assertion.type === 'url') return page.url();
  if (assertion.type === 'text') return target.innerText({ timeout: 100 });
  if (assertion.type === 'visible') return target.isVisible();
  return target.inputValue({ timeout: 100 });
}

async function checkAssertion(page, assertion) {
  let observed = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { observed = await readAssertion(page, assertion); }
    catch (_) { observed = null; }
    if (observed === assertion.expected) break;
    if (attempt < 29) await page.waitForTimeout(100);
  }
  return { type: assertion.type, role: assertion.role || null, name: assertion.name || null,
    expected: assertion.expected, observed, passed: observed === assertion.expected };
}

function persistReceipt(artifactsDir, receipt) {
  fs.mkdirSync(artifactsDir, { recursive: true });
  const body = JSON.stringify(receipt, null, 2);
  const digest = createHash('sha256').update(body).digest('hex');
  const receiptPath = path.join(artifactsDir, `${digest}.json`);
  fs.writeFileSync(receiptPath, body, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { receiptPath, evidenceRefs: [`browser-journey:sha256:${digest}`] };
}

class WebJourneyVerifier {
  constructor(options = {}) {
    this.playwright = options.playwright || require('playwright');
    this.allowedHosts = new Set(options.allowedHosts || []);
    this.artifactsDir = options.artifactsDir || process.env.GENOS_BROWSER_VERIFICATION_ARTIFACTS_DIR
      || path.resolve(process.cwd(), '.genos', 'workspace', 'browser-verifications');
    this.executablePath = options.executablePath || process.env.GENOS_BROWSER_EXECUTABLE_PATH;
  }

  async verify(journey) {
    validateJourney(journey, this.allowedHosts);
    let browser;
    const checks = [];
    let result = 'inconclusive';
    let error = null;
    let finalUrl = null;
    try {
      browser = await this.playwright.chromium.launch({ headless: true,
        ...(this.executablePath ? { executablePath: this.executablePath } : {}) });
      const context = await browser.newContext({ serviceWorkers: 'block' });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      await page.route('**/*', async (route) => {
        try {
          permittedUrl(route.request().url(), this.allowedHosts);
          await route.continue();
        } catch (_) { await route.abort('blockedbyclient'); }
      });
      const response = await page.goto(journey.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      result = 'regressed';
      if (!response?.ok()) throw new Error(`Journey navigation failed: HTTP ${response?.status() ?? 'unknown'}.`);
      for (const step of journey.steps) await performStep(page, step);
      finalUrl = permittedUrl(page.url(), this.allowedHosts);
      for (const assertion of journey.assertions) checks.push(await checkAssertion(page, assertion));
      if (checks.every((check) => check.passed)) result = 'confirmed';
    } catch (caught) { error = caught.message; }
    finally { if (browser) await browser.close(); }
    const receipt = { verifierRef: 'playwright:chromium', checkedAt: new Date().toISOString(),
      journeyHash: createHash('sha256').update(JSON.stringify(journey)).digest('hex'),
      result, finalUrl, checks, error };
    const evidence = persistReceipt(this.artifactsDir, receipt);
    return { ...receipt, ...evidence, verified: result === 'confirmed' };
  }
}

module.exports = { WebJourneyVerifier };
