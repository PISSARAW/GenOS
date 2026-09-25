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

module.exports = { workerAssignmentsSchema };
