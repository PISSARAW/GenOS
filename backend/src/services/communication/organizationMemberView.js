'use strict';

const { routeMessage } = require('../organizationRouting');

async function fetchMembers(db, orchestratorId) {
  return db.all(
    `SELECT id, name, name_meaning as nameMeaning, role, execution_mode as executionMode,
            parent_agent_id as parentAgentId
       FROM agents WHERE id = ? OR parent_agent_id = ? ORDER BY execution_mode DESC, name ASC`,
    orchestratorId, orchestratorId
  );
}

function relationship(state, requester, member) {
  if (requester.id === state.orchestratorId) return 'coordinates';
  if (member.id === state.orchestratorId) return 'reports_to';
  if (state.policy.routing === 'adversarial_pair') return 'counterpart';
  return 'peer';
}

function deliveryMode(route, memberId) {
  if (route.recipientAgentId === memberId) return 'direct';
  if (route.recipientAgentId === null) return 'shared';
  return 'mediated';
}

function communicationLink(state, requester, member) {
  const route = routeMessage({
    state, sender: requester, recipientAgentId: member.id, kind: 'question'
  });
  const mode = deliveryMode(route, member.id);
  return {
    agentId: member.id,
    name: member.name,
    role: member.role,
    relationship: relationship(state, requester, member),
    communication: {
      mode,
      channel: route.channel,
      viaAgentId: mode === 'mediated' ? route.recipientAgentId : null
    }
  };
}

function buildMemberState(state, requesterAgentId, members) {
  if (!state) return null;
  const requester = members.find((member) => member.id === requesterAgentId) || null;
  return {
    ...state,
    requester,
    members,
    communicationLinks: requester
      ? members.filter((member) => member.id !== requester.id)
        .map((member) => communicationLink(state, requester, member))
      : []
  };
}

module.exports = { fetchMembers, buildMemberState, communicationLink };
