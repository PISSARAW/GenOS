/**
 * Builds rich, validated Protobuf definition files for all GenOS gRPC services.
 */

const fs = require('fs');
const path = require('path');
const protoLoader = require('@grpc/proto-loader');
const schemasA = require('./rich_proto_schemas_a');
const schemasB = require('./rich_proto_schemas_b');
const schemasC = require('./rich_proto_schemas_c');

const PROTO_DIR = path.resolve(__dirname, '../proto');
if (!fs.existsSync(PROTO_DIR)) {
  fs.mkdirSync(PROTO_DIR, { recursive: true });
}

// Map of service names to their full Protobuf definition content
const PROTO_DEFINITIONS = {
  ...schemasA,
  ...schemasB,
  ...schemasC
};

// Write each proto file and validate with protoLoader
let count = 0;
for (const [name, content] of Object.entries(PROTO_DEFINITIONS)) {
  const filePath = path.join(PROTO_DIR, `${name}.proto`);
  fs.writeFileSync(filePath, content, 'utf8');
  try {
    protoLoader.loadSync(filePath, { keepCase: true });
    count++;
  } catch (err) {
    console.error(`Validation failed for ${name}.proto:`, err.message);
    process.exit(1);
  }
}

console.log(`Successfully generated and validated ${count} rich .proto files in ${PROTO_DIR}`);
