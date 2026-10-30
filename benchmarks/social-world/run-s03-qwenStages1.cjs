'use strict';

async function mainStage1(__genosStageScope1) {
for (const agentId of ['agent-b', 'agent-c']) {
      const profile = await __genosStageScope1.resolver.getRelationProfile('agent-a', agentId, {
        db: __genosStageScope1.db, organizationId: 'socialworld-org', projectId: 'socialworld-project'
      });
      __genosStageScope1.profiles.push({ agentId, relationType: profile.relationType,
        sharedEvents: profile.relations?.[0]?.properties?.sharedEvents || [] });
    }
}

module.exports = { mainStage1 };
