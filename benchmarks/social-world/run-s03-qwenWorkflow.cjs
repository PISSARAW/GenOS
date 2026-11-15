'use strict';

async function mainStep1(context) {
for (const agentId of ['agent-b', 'agent-c']) {
      const profile = await context.resolver.getRelationProfile('agent-a', agentId, {
        db: context.db, organizationId: 'socialworld-org', projectId: 'socialworld-project'
      });
      context.profiles.push({ agentId, relationType: profile.relationType,
        sharedEvents: profile.relations?.[0]?.properties?.sharedEvents || [] });
    }
}

module.exports = { mainStep1 };
