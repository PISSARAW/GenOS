'use strict';

const { permittedUrl } = require('./webJourneyVerifier');
const { loadOptionalPackage, unavailableError } = require('./optionalDependencies');

class WebAuditSensors {
  constructor(options = {}) {
    this.playwright = options.playwright || null;
    this.AxeBuilder = options.AxeBuilder || null;
    this.chromeLauncher = options.chromeLauncher || null;
    this.lighthouse = options.lighthouse || null;
    this.packageLoader = options.packageLoader || require;
    this.chromePath = options.chromePath || process.env.GENOS_BROWSER_EXECUTABLE_PATH;
    this.allowedHosts = new Set(options.allowedHosts || []);
  }

  async axe(url, maxViolations = 0) {
    permittedUrl(url, this.allowedHosts);
    let browser;
    try {
      const playwright = this.playwright || loadOptionalPackage('web.audit', 'playwright', this.packageLoader);
      const AxeBuilder = this.AxeBuilder || loadOptionalPackage(
        'web.audit', '@axe-core/playwright', this.packageLoader).default;
      browser = await playwright.chromium.launch({ headless: true,
        ...(this.chromePath ? { executablePath: this.chromePath } : {}) });
      const context = await browser.newContext({ serviceWorkers: 'block' });
      const page = await context.newPage();
      await page.route('**/*', async route => {
        try {
          permittedUrl(route.request().url(), this.allowedHosts);
          await route.continue();
        } catch (_) { await route.abort('blockedbyclient'); }
      });
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      if (!response?.ok()) throw new Error(`Axe navigation failed: HTTP ${response?.status() ?? 'unknown'}.`);
      permittedUrl(page.url(), this.allowedHosts);
      const audit = await new AxeBuilder({ page }).analyze();
      const violations = audit.violations.map(item => ({ id: item.id, impact: item.impact,
        nodes: item.nodes.length }));
      return { sensor: 'axe-core', result: violations.length <= maxViolations ? 'confirmed' : 'regressed',
        url: page.url(), violations, incomplete: audit.incomplete.length, maxViolations };
    } catch (error) {
      return { sensor: 'axe-core', result: 'inconclusive', error: error.message };
    } finally { if (browser) await browser.close(); }
  }

  async lighthouseAudit(url, minScores) {
    permittedUrl(url, this.allowedHosts);
    let chrome;
    try {
      const chromeLauncher = this.chromeLauncher || loadOptionalPackage(
        'web.audit', 'chrome-launcher', this.packageLoader);
      chrome = await chromeLauncher.launch({ chromePath: this.chromePath,
        chromeFlags: ['--headless'], logLevel: 'error' });
      const run = await this._loadLighthouse();
      const report = await run(url, { port: chrome.port, logLevel: 'error', output: 'json',
        onlyCategories: Object.keys(minScores) });
      if (!report?.lhr || report.lhr.runtimeError) throw new Error('Lighthouse did not complete its audit.');
      permittedUrl(report.lhr.finalDisplayedUrl, this.allowedHosts);
      const scores = Object.fromEntries(Object.keys(minScores).map(key => [key,
        report.lhr.categories[key]?.score ?? null]));
      const complete = Object.values(scores).every(Number.isFinite);
      const passed = Object.entries(minScores).every(([key, minimum]) => scores[key] >= minimum);
      return { sensor: 'lighthouse', result: !complete ? 'inconclusive' : passed ? 'confirmed' : 'regressed',
        url: report.lhr.finalDisplayedUrl, version: report.lhr.lighthouseVersion, scores, minScores };
    } catch (error) {
      return { sensor: 'lighthouse', result: 'inconclusive', error: error.message };
    } finally { if (chrome) await chrome.kill(); }
  }

  async _loadLighthouse() {
    if (this.lighthouse) return this.lighthouse();
    try { return (await import('lighthouse')).default; }
    catch (error) {
      if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
      throw unavailableError('web.audit', 'lighthouse');
    }
  }
}

module.exports = { WebAuditSensors };
