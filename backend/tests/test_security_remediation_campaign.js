'use strict';

const assert = require('node:assert/strict');
const immune = require('../src/services/immuneMemoryService');
const { ingestSecurityAlerts } = require('../src/services/securityRemediation/securityAlertContract');
const { buildAntigenGraph } = require('../src/services/securityRemediation/antigenGraphService');
const { planRemediationCampaign } = require('../src/services/securityRemediation/remediationCampaignPlanner');

const batch = ingestSecurityAlerts({ alerts: [{ externalId: 'sql-a', ruleId: 'sql-injection',
  cwes: ['CWE-89'], trustBoundary: 'http-to-db', sourceKind: 'request', sinkKind: 'sql',
  message: 'Unsafe SQL flow.', location: { path: 'src/users.js', line: 8 } }] });
const graph = buildAntigenGraph(batch);
const failed = immune.immuneRecord({ failureCategory: 'security-remediation',
  strategy: 'minimal_patch', contextFingerprint: graph.clusters[0].causeHash });

const campaign = planRemediationCampaign(graph, { sourceDigest: 'sha256:fixture-revision',
  producerId: 'patch-producer', immuneMemories: [failed], campaignSeed: 'campaign-1' });
assert.equal(campaign.candidates.length, 4);
assert.deepEqual(campaign.candidates.map((candidate) => candidate.family),
['control', 'minimal_patch', 'structural_fix', 'compensating_control']);
assert.equal(campaign.candidates.find((candidate) => candidate.family === 'minimal_patch').status,
'blocked_by_negative_memory');
assert.equal(campaign.candidates.find((candidate) => candidate.family === 'structural_fix').status,
'planned');
assert.ok(campaign.candidates.every((candidate) => candidate.isolation.network === 'disabled'));
assert.ok(campaign.candidates.every((candidate) => !candidate.safety.exploitPayloadExecution));
assert.equal(campaign.executionPolicy.realExploitExecutionAllowed, false);

assert.throws(() => planRemediationCampaign(graph, { producerId: 'p' }),
{ code: 'SECURITY_CAMPAIGN_SOURCE_DIGEST_REQUIRED' });

process.stdout.write('Security remediation campaign plans isolated counterfactual candidates.\n');
