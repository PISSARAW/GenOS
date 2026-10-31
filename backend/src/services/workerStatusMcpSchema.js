'use strict';

module.exports = {
  type: 'object',
  properties: {
    orchestrator_id: { type: 'string', description: 'Owning orchestrator for the worker roster.' },
    worker_id: { type: 'string', description: 'Optional direct child worker ID to inspect.' },
    limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Maximum workers to return when worker_id is omitted.' }
  }
};
