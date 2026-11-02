'use strict';

function qualityMissionSchema() {
  return {
    qualityElevation: { type: 'object', description: 'Explicit GQEL options or compiled V2 contract. On an orchestrator this qualifies the final artifact; per-role worker assignments qualify only their own artifact.' },
    qualityRuntime: { type: 'object', additionalProperties: false, properties: {
      generatorModel: { type: 'string', minLength: 1 },
      planScenes: { type: 'boolean' },
      reviewers: { type: 'array', maxItems: 10, items: { type: 'object', additionalProperties: false,
        properties: { id: { type: 'string', minLength: 1 }, model: { type: 'string', minLength: 1 },
          dependencyGroup: { type: 'string' }, focus: { type: 'string' } }, required: ['id', 'model'] } }
    } }
  };
}

module.exports = { qualityMissionSchema };
