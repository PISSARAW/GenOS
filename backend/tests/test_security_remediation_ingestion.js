'use strict';

const assert = require('node:assert/strict');
const { ingestSecurityAlerts } = require('../src/services/securityRemediation/securityAlertContract');

function sarif() {
  return { version: '2.1.0', runs: [{ tool: { driver: { rules: [{ id: 'js/sql-injection',
    properties: { cwe: ['CWE-89'], trustBoundary: 'http-to-database',
      sourceKind: 'request.query', sinkKind: 'sql.execute' } }] } }, results: [{
    guid: 'alert-1', ruleId: 'js/sql-injection', level: 'error',
    message: { text: 'Untrusted input reaches a SQL sink.' }, locations: [{ physicalLocation: {
      artifactLocation: { uri: 'src/search.js' }, region: { startLine: 19 } } }] }] }] };
}

const first = ingestSecurityAlerts({ sarif: sarif() });
const second = ingestSecurityAlerts({ sarif: sarif() });
assert.equal(first.alerts.length, 1);
assert.equal(first.alerts[0].externalId, 'alert-1');
assert.deepEqual(first.alerts[0].cwes, ['CWE-89']);
assert.equal(first.alerts[0].antigenHash, second.alerts[0].antigenHash);
assert.equal(first.alerts[0].promotionEligible, false);

const duplicated = ingestSecurityAlerts({ alerts: [
  { externalId: 'a', ruleId: 'xss', message: 'Unsafe HTML', location: { path: 'src/view.js' } },
  { externalId: 'a', ruleId: 'xss', message: 'Unsafe HTML', location: { path: 'src/view.js' } }
] });
assert.equal(duplicated.alerts.length, 1);
assert.equal(duplicated.duplicateCount, 1);

assert.throws(() => ingestSecurityAlerts({ alerts: [{ externalId: 'a', ruleId: 'x',
  message: 'bad path', location: { path: '../secret.env' } }] }),
{ code: 'SECURITY_ALERT_PATH_OUTSIDE_WORKSPACE' });
assert.throws(() => ingestSecurityAlerts({ sarif: { version: '2.0.0', runs: [] } }),
{ code: 'SECURITY_ALERT_SARIF_2_1_REQUIRED' });

process.stdout.write('Security alert ingestion produces bounded canonical antigens.\n');
