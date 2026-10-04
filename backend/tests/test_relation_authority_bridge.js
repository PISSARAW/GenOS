'use strict';

const assert = require('node:assert/strict');
const bridge = require('../src/services/relationAuthorityBridge');
const authority = require('../src/services/agentAuthorityService');

function verifyGrants() {
  assert.equal(bridge.relationGrantsControl('manager', 'forward'), false);
  assert.equal(bridge.relationGrantsControl('guardian', 'forward'), false);
  assert.equal(bridge.relationGrantsControl('manager', 'reverse'), false);
  assert.equal(bridge.relationGrantsControl('friend', 'forward'), false);
  assert.equal(bridge.isVerifierBlocked('twin'), true);
  assert.equal(bridge.isVerifierBlocked('stranger'), false);
}

function verifyVerifierFilter() {
  const selected = bridge.filterVerifierCandidates([
    { agentId: 'twin', relationType: 'twin', domainCompetence: 1, epistemicIndependence: 1, errorCorrelation: 0 },
    { agentId: 'solo', relationType: 'stranger', domainCompetence: 0.8, epistemicIndependence: 0.95, errorCorrelation: 0.1 }
  ], []);
  assert.equal(selected.candidate.agentId, 'solo');
}

async function verifyControlFallback() {
  const db = {
    get: async (sql, id) => {
      if (String(sql).includes('parent_agent_id')) {
        if (id === 'target-1') return { id: 'target-1', parent_agent_id: 'other', execution_mode: 'worker', workspace_id: 'w1' };
        return { id: 'actor-1', execution_mode: 'worker', workspace_id: 'w1' };
      }
      return null;
    },
    all: async () => [{
      id: 'rel-1', source_agent_id: 'actor-1', target_agent_id: 'target-1',
      relation_type: 'manager', relation_class: 'organizational', metadata_json: '{}',
      organization_id: null, project_id: null
    }]
  };
  await assert.rejects(
    () => authority.authorizeAgentControl(db, { targetId: 'target-1', actorId: 'actor-1' }),
    (error) => error.code === 'AGENT_CONTROL_FORBIDDEN'
  );
}

verifyGrants();
verifyVerifierFilter();
verifyControlFallback().then(() => console.log('Relation authority bridge tests passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
