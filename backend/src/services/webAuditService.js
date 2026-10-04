'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { WebJourneyVerifier, permittedUrl } = require('./webJourneyVerifier');
const { WebAuditSensors } = require('./webAuditSensors');

const CATEGORIES = new Set(['performance', 'accessibility', 'best-practices', 'seo']);

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validThreshold([key, value]) {
  return CATEGORIES.has(key) && Number.isFinite(value) && value >= 0 && value <= 1;
}

function validateLighthouse(config) {
  const scores = config.minScores;
  if (!scores || !Object.keys(scores).length || !Object.entries(scores).every(validThreshold)) {
    throw new TypeError('Lighthouse score thresholds are invalid.');
  }
}

function validateAxe(config) {
  if (!Number.isSafeInteger(config.maxViolations)
      || config.maxViolations < 0 || config.maxViolations > 100) {
    throw new TypeError('Axe violation threshold is invalid.');
  }
}

function validateConfig(config, allowedHosts) {
  if (!config || (!config.lighthouse && !config.axe && !config.journey)) {
    throw new TypeError('Web audit requires at least one sensor.');
  }
  permittedUrl(config.url, allowedHosts);
  if (config.lighthouse) validateLighthouse(config.lighthouse);
  if (config.axe) validateAxe(config.axe);
  if (config.journey && config.journey.url !== config.url) {
    throw new TypeError('Journey URL must match the audited URL.');
  }
}

function summarizeJourney(receipt) {
  return { sensor: 'playwright', result: receipt.result, finalUrl: receipt.finalUrl,
    verifierRef: receipt.verifierRef, evidenceRefs: receipt.evidenceRefs,
    checks: receipt.checks, error: receipt.error };
}

function normalizeLighthouse(check) {
  if (check?.result === 'inconclusive') return check;
  const thresholds = Object.entries(check?.minScores || {});
  if (!thresholds.length || !check?.url || !thresholds.every(([key]) =>
    Number.isFinite(check.scores?.[key]))) return { ...check, result: 'inconclusive' };
  const passed = thresholds.every(([key, value]) => check.scores[key] >= value);
  if (!passed || check.result === 'regressed') return { ...check, result: 'regressed' };
  return { ...check, result: check.result === 'confirmed' ? 'confirmed' : 'inconclusive' };
}

function normalizeAxe(check) {
  if (check?.result === 'inconclusive') return check;
  if (!check?.url || !Array.isArray(check.violations)
      || !Number.isSafeInteger(check.maxViolations)) return { ...check, result: 'inconclusive' };
  if (check.violations.length > check.maxViolations || check.result === 'regressed') {
    return { ...check, result: 'regressed' };
  }
  return { ...check, result: check.result === 'confirmed' ? 'confirmed' : 'inconclusive' };
}

function normalizeJourney(check) {
  if (!Array.isArray(check?.evidenceRefs) || !check.evidenceRefs.length
      || !Array.isArray(check.checks)) return { ...check, result: 'inconclusive' };
  if (check.result === 'regressed') return check;
  const passed = check.finalUrl && check.checks.length && check.checks.every(item => item.passed);
  return { ...check, result: passed && check.result === 'confirmed' ? 'confirmed' : 'inconclusive' };
}

function normalizeCheck(check) {
  if (check?.sensor === 'lighthouse') return normalizeLighthouse(check);
  if (check?.sensor === 'axe-core') return normalizeAxe(check);
  if (check?.sensor === 'playwright') return normalizeJourney(check);
  return { sensor: 'unknown', result: 'inconclusive' };
}

function resultOf(checks) {
  if (checks.some(check => check?.result === 'regressed')) return 'regressed';
  return checks.every(check => check?.result === 'confirmed') ? 'confirmed' : 'inconclusive';
}

function persistReceipt(directory, receipt) {
  fs.mkdirSync(directory, { recursive: true });
  const body = JSON.stringify(receipt, null, 2);
  const digest = createHash('sha256').update(body).digest('hex');
  const receiptPath = path.join(directory, `${digest}.json`);
  fs.writeFileSync(receiptPath, body, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { receiptPath, evidenceRefs: [`web-audit:sha256:${digest}`] };
}

class WebAuditService {
  constructor(options = {}) {
    this.allowedHosts = new Set(options.allowedHosts || []);
    this.artifactsDir = options.artifactsDir || process.env.GENOS_BROWSER_VERIFICATION_ARTIFACTS_DIR
      || path.resolve(process.cwd(), '.genos', 'workspace', 'browser-verifications');
    this.sensors = options.sensors || new WebAuditSensors({ allowedHosts: [...this.allowedHosts],
      chromePath: options.chromePath });
    this.journeyVerifier = options.journeyVerifier || new WebJourneyVerifier({
      allowedHosts: [...this.allowedHosts], artifactsDir: this.artifactsDir,
      executablePath: options.chromePath });
  }

  async run(config) {
    validateConfig(config, this.allowedHosts);
    const checks = [];
    if (config.lighthouse) checks.push(normalizeCheck(await this.sensors.lighthouseAudit(
      config.url, config.lighthouse.minScores)));
    if (config.axe) checks.push(normalizeCheck(await this.sensors.axe(config.url, config.axe.maxViolations)));
    if (config.journey) checks.push(normalizeCheck(summarizeJourney(
      await this.journeyVerifier.verify(config.journey))));
    const receipt = { verifierRef: 'web-audits:v1', checkedAt: new Date().toISOString(),
      configHash: hash(config), result: resultOf(checks), checks };
    const evidence = persistReceipt(this.artifactsDir, receipt);
    return { ...receipt, ...evidence };
  }
}

module.exports = { WebAuditService, fingerprintWebConfig: hash };
