'use strict';
const { agent, failure } = require('./studioWorldsService');
const input = require('./studioSpecialistInput');
const capabilities = require('./topologyCapabilityService');
const organizations = require('./dynamicOrganizationService');

async function inspect(db, context) {
  const current = await agent(db, context);
  const table = await db.get("SELECT name FROM sqlite_master WHERE name = 'agent_organization_state'");
  const state = table ? await organizations.getState(db, current.id) : null;
  return { agentId: current.id, activeOrganization: state, available: null, authorized: null, exercised: false,
    topologies: Object.keys(capabilities.MODE_CAPABILITIES).map(id => ({ id, ...capabilities.capabilitiesForMode(id) })),
    organizations: Object.entries(organizations.ORGANIZATIONS).map(([id, profile]) => ({ id, ...profile,
      required: capabilities.capabilitiesForOrganization(id).required })),
    capabilities: capabilities.GENOS_CAPABILITIES, source: 'runtime_catalog', contractIsExecution: false };
}

async function step(db, context) {
  await agent(db, context);
  const organization = input.text(context.body.organization, 100);
  if (!organizations.organizationProfile(organization)) throw failure('UNKNOWN_ORGANIZATION', 400);
  const state = input.object(context.body.state);
  const result = require('./swarmTopologyAlgorithms').runTopologyStep(organization, state, {});
  return input.record(db, context, { mechanism: 'collective_step', input: { organization, state },
    result: { organization, step: result, inputAuthority: 'declared', runtimeApplied: false, scope: 'bounded_algorithm' } });
}

module.exports = { inspect, step };
