'use strict';

function workerAssignmentsSchema() {
  return {
    type: 'object',
    description: 'Optional per-role runtime and method contracts. Use a registered methodId such as dynamic_programming or evolutionary_search, or declare requiredCapabilities for a custom method.',
    additionalProperties: {
      type: 'object',
      properties: {
        workerKind: { type: 'string' },
        workerRequirements: { type: 'object', properties: {
          requiredCapabilities: { type: 'array', items: { type: 'string' } },
          allowedKinds: { type: 'array', items: { type: 'string' } }
        } },
        methodContract: { type: 'object', properties: {
          version: { type: 'integer', const: 1 }, methodId: { type: 'string' },
          requiredCapabilities: { type: 'array', items: { type: 'string' } },
          parameters: { type: 'object' }, requiredEvidence: { type: 'array', items: { type: 'string' } },
          evaluator: { type: 'object' }
        }, required: ['version', 'methodId'] }
      }
    }
  };
}

function workerRosterSchema() {
  return {
    type: 'object',
    description: 'Exact worker and task cardinality plus worker type selection policy. all_registered requires one slot for every registered worker kind.',
    properties: {
      agent_count: { type: 'integer', minimum: 1, maximum: 64 },
      task_count: { type: 'integer', minimum: 1, maximum: 100000 },
      types: { type: 'object', properties: {
        mode: { type: 'string', enum: ['auto', 'all_registered', 'explicit', 'allowlist', 'mix'] },
        kinds: { type: 'array', items: { type: 'string' }, uniqueItems: true },
        quotas: { type: 'object', additionalProperties: { type: 'integer', minimum: 1 } }
      }, additionalProperties: false }
    }, additionalProperties: false
  };
}

module.exports = { workerAssignmentsSchema, workerRosterSchema };
