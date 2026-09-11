const TOOL_SCHEMAS = {
  genos_create: {
    type: 'object',
    required: ['path', 'content'],
    properties: {
      path: { type: 'string', description: 'Relative target file path to create' },
      content: { type: 'string', description: 'Raw content to write into file' },
      overwrite: { type: 'boolean', default: false, description: 'Allow overwriting existing files' }
    }
  },
  genos_snapshot: {
    type: 'object',
    required: ['agent', 'out'],
    properties: {
      agent: { type: 'string', description: 'Path to the agent genome input' },
      out: { type: 'string', description: 'Output path for the snapshot JSON' }
    }
  },
  genos_restore: {
    type: 'object',
    required: ['workspace_id', 'snapshot_id'],
    properties: {
      workspace_id: { type: 'string', description: 'Workspace ID to restore' },
      snapshot_id: { type: 'string', description: 'Target snapshot ID to rollback to' }
    }
  },
  genos_run: {
    type: 'object',
    required: ['command'],
    properties: {
      command: { type: 'string', description: 'Shell command line to execute' },
      cwd: { type: 'string', description: 'Working directory path' },
      timeoutMs: { type: 'integer', default: 5000, description: 'Maximum execution timeout' }
    }
  },
  genos_inspect: {
    type: 'object',
    required: ['path'],
    properties: {
      path: { type: 'string', description: 'Path of file or directory to inspect' },
      startLine: { type: 'integer', description: 'Starting line number (1-indexed)' },
      endLine: { type: 'integer', description: 'Ending line number (1-indexed)' }
    }
  },
  genos_diff: {
    type: 'object',
    required: ['workspace_id'],
    properties: {
      workspace_id: { type: 'string', description: 'Workspace ID to diff' },
      baseSnapshot: { type: 'string', description: 'Base snapshot hash or ID' },
      targetSnapshot: { type: 'string', description: 'Target snapshot hash or ID' }
    }
  }
};

function generateDefaultSchema(toolName) {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: toolName,
    type: 'object',
    properties: {
      target: { type: 'string', description: 'Target entity ID or path' },
      options: { type: 'object', description: 'Optional execution parameters', default: {} }
    },
    additionalProperties: true
  };
}

function getToolSchema(toolName) {
  if (!toolName) {
    throw new Error('Tool name is required for schema inspection');
  }

  const customSchema = Object.prototype.hasOwnProperty.call(TOOL_SCHEMAS, toolName)
    ? TOOL_SCHEMAS[toolName]
    : null;
  if (customSchema) {
    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: toolName,
      ...customSchema
    };
  }

  return generateDefaultSchema(toolName);
}

module.exports = {
  TOOL_SCHEMAS,
  generateDefaultSchema,
  getToolSchema
};
