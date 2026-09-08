const assert = require('node:assert/strict');
const protobuf = require('protobufjs');

protobuf.load(require('node:path').join(__dirname, '../src/proto/synapse.proto')).then((root) => {
  const descriptor = root.lookup('synapse').nested.Exosome.toJSON();
  const fields = descriptor.fields;
  for (const field of ['plasmid_vector', 'source_agent_id', 'recipient_agent_id', 'organization_id', 'project_id']) {
    assert.ok(Object.values(fields).some((entry) => entry.protoName === field), `missing Exosome field: ${field}`);
  }
  console.log('Plasmid transport contract passed.');
}).catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
