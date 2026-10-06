'use strict';
const assert = require('node:assert/strict');
const { AXES } = require('../src/services/trinityVariantService');
const { trinityDesignSchema } = require('../src/services/trinityDesignSchema');
const schema = trinityDesignSchema();
assert.deepEqual(Object.keys(schema), Object.keys(AXES));
for (const [axis, policies] of Object.entries(AXES)) {
  const implemented = Object.entries(policies).filter(([, policy]) => policy.maturity === 'implemented').map(([name]) => name);
  assert.deepEqual(schema[axis].enum, implemented);
}
for (const file of ['../../shared/toolDefinitions.json', '../../mcp/toolDefinitions.json']) {
  const tools = require(file).tools.filter(tool => tool.inputSchema?.properties?.experimental_design);
  assert.equal(tools.length, 1);
  assert.deepEqual(tools[0].inputSchema.properties.experimental_design.properties, schema);
}
console.log('Trinity runtime policies and both advertised MCP schemas agree: PASS');
