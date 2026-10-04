'use strict';

const { permittedUrl } = require('./webJourneyVerifier');

class WebAuditSensors {
  constructor(options = {}) {
    this.playwright = options.playwright || require('playwright');
    this.AxeBuilder = options.AxeBuilder || require('@axe-core/playwright').default;
    this.chromeLauncher = options.chromeLauncher || require('chrome-launcher');
    this.lighthouse = options.lighthouse || (() => import('lighthouse').then(module => module.default));
    this.chromePath = options.chromePath || process.env.GENOS_BROWSER_EXECUTABLE_PATH;
    this.allowedHosts = new Set(options.allowedHosts || []);
  }

  async axe(url, maxViolations = 0) {
    permittedUrl(url, this.allowedHosts);
    let browser;
    try {
      browser = await this.playwright.chromium.launch({ headless: true,
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
      const audit = await new this.AxeBuilder({ page }).analyze();
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
      chrome = await this.chromeLauncher.launch({ chromePath: this.chromePath,
        chromeFlags: ['--headless'], logLevel: 'error' });
      const run = await this.lighthouse();
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
}

module.exports = { WebAuditSensors };
