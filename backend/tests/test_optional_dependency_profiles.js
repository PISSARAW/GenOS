'use strict';

const assert = require('node:assert/strict');
const catalog = require('../../shared/dependencyProfiles.json');
const { inspectCapability, loadOptionalPackage } = require('../src/services/optionalDependencies');
const { WebAuditSensors } = require('../src/services/webAuditSensors');
const { WebJourneyVerifier } = require('../src/services/webJourneyVerifier');

const missing = () => { throw Object.assign(new Error('absent'), { code: 'MODULE_NOT_FOUND' }); };

async function main() {
  assert.deepEqual(catalog.profiles.full.omit, []);
  assert.deepEqual(catalog.profiles.core.omit, ['dev']);
  assert.equal(catalog.profiles.core.removeCapabilities, true);
  const graph = inspectCapability('storage.graph', missing);
  assert.equal(graph.available, false);
  assert.deepEqual(graph.missing, ['@ladybugdb/core']);
  assert.equal(graph.fallback, 'sqlite-cte');
  assert.throws(() => loadOptionalPackage('web.scout', 'puppeteer', missing),
    { code: 'GENOS_OPTIONAL_CAPABILITY_UNAVAILABLE', capability: 'web.scout' });

  const audit = new WebAuditSensors({ allowedHosts: ['example.test'], packageLoader: missing });
  const axe = await audit.axe('https://example.test/', 0);
  assert.equal(axe.result, 'inconclusive');
  assert.match(axe.error, /requires package playwright/);

  const journey = new WebJourneyVerifier({ allowedHosts: ['example.test'], packageLoader: missing,
    artifactsDir: process.env.GENOS_TEST_BROWSER_ARTIFACTS });
  assert.equal(journey.playwright, null, 'constructing a verifier must not load Playwright');
  console.log('Core and full dependency profiles keep optional capabilities fail-closed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
