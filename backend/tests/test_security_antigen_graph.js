'use strict';

const assert = require('node:assert/strict');
const { ingestSecurityAlerts } = require('../src/services/securityRemediation/securityAlertContract');
const { buildAntigenGraph } = require('../src/services/securityRemediation/antigenGraphService');

const batch = ingestSecurityAlerts({ alerts: [
  { externalId: 'sql-a', ruleId: 'codeql/sql-injection', cwes: ['CWE-89'],
    trustBoundary: 'http-to-db', sourceKind: 'request', sinkKind: 'sql',
    message: 'Tainted input reaches query.', location: { path: 'src/users.js', line: 8 } },
  { externalId: 'sql-b', ruleId: 'semgrep/unsafe-query', cwes: ['CWE-89'],
    trustBoundary: 'http-to-db', sourceKind: 'request', sinkKind: 'sql',
    message: 'Unsafe query construction.', location: { path: 'src/orders.js', line: 13 } },
  { externalId: 'xss-a', ruleId: 'codeql/xss', cwes: ['CWE-79'],
    trustBoundary: 'http-to-browser', sourceKind: 'request', sinkKind: 'html',
    message: 'Unsafe HTML rendering.', location: { path: 'src/view.js', line: 21 } }
] });

const graph = buildAntigenGraph(batch);
const replayed = buildAntigenGraph(batch);
assert.equal(graph.clusters.length, 2);
assert.equal(graph.edges.length, 3);
assert.equal(graph.graphHash, replayed.graphHash);
const sqlCluster = graph.clusters.find((cluster) => cluster.basis.cwes?.includes('CWE-89'));
assert.equal(sqlCluster.alertCount, 2);
assert.deepEqual(sqlCluster.paths, ['src/orders.js', 'src/users.js']);
assert.equal(sqlCluster.promotionEligible, false);

assert.throws(() => buildAntigenGraph({ schema: 'wrong', alerts: [] }),
{ code: 'SECURITY_ANTIGEN_BATCH_REQUIRED' });
assert.throws(() => buildAntigenGraph({ schema: 'genos.security-antigen-batch/v1',
  alerts: [{ schema: 'wrong' }] }), { code: 'SECURITY_ANTIGEN_INVALID' });

process.stdout.write('Antigen graph groups scanner findings by shared causal structure.\n');
