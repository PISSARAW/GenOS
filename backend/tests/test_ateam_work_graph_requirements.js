'use strict';

const assert = require('node:assert/strict');
const aTeam = require('../src/services/aTeamService');
const { compileWorkGraph } = require('../src/services/aTeam/workGraph/workGraphCompiler');

const workGraph = compileWorkGraph({ teamRunId: 'requirements', members: [
  { memberId: 'api-owner', agentId: 'agent-api', subSystem: 'api', role: 'backend_engineer', capabilities: ['api'], dependsOn: [] },
  { memberId: 'ui-owner', agentId: 'agent-ui', subSystem: 'ui', role: 'frontend_engineer', capabilities: ['ui'], dependsOn: ['api'] }
] });
const analysis = aTeam.analyzeMission('Une mission sans signaux de domaine.', { workGraph });

assert.equal(analysis.analysisSource, 'validated_work_graph');
assert.equal(analysis.recommended, true);
assert.deepEqual(analysis.requiredCapabilities.map((item) => item.name).sort(), ['api', 'ui']);
assert.deepEqual(analysis.members.find((item) => item.label === 'ui').dependsOn, ['api']);
assert.deepEqual(analysis.capabilityGaps, []);
assert.equal(aTeam.analyzeMission('Mission vague').analysisSource, undefined);
console.log('A-Team derives requirements and handoffs from validated WorkGraph.');
