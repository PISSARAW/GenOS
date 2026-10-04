'use strict';

module.exports = {
  type: 'object',
  properties: {
    signal_type: { type: 'string', enum: ['ligand', 'voltage', 'pheromone', 'plasmid', 'tensor'] },
    signal_data: { type: ['object', 'string'] },
    topic: { type: 'string' }, ttl_ms: { type: 'integer' },
    signal_id: { type: 'string' }, orchestrator_id: { type: 'string' },
    relational: {
      type: 'object',
      description: 'HTTP MCP: targeted typed references; signal_type=ligand and signal_data={}.',
      properties: {
        operationId: { type: 'string' }, receiverId: { type: 'string' },
        refs: { type: 'array', items: { type: 'object', properties: {
          id: { type: 'string' }, hash: { type: 'string' }, kind: { type: 'string' }
        }, required: ['id', 'hash', 'kind'] } },
        event: { type: 'string' }, blind: { type: 'boolean' },
        expectedRevision: { type: 'integer', minimum: 0 }
      },
      required: ['operationId', 'receiverId', 'refs']
    }
  },
  required: ['signal_type']
};
