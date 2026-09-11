/**
 * Generates rich, fully-functional gRPC microservice handlers
 * connected to the GenOS backend services.
 */

const fs = require('fs');
const path = require('path');
const templatesA = require('./rich_handler_templates_a');
const templatesB = require('./rich_handler_templates_b');
const templatesC = require('./rich_handler_templates_c');
const templatesD = require('./rich_handler_templates_d');

const GRPC_DIR = path.resolve(__dirname, '../src/grpc_services');
if (!fs.existsSync(GRPC_DIR)) {
  fs.mkdirSync(GRPC_DIR, { recursive: true });
}

const HANDLERS = {
  ...templatesA,
  ...templatesB,
  ...templatesC,
  ...templatesD
};

// Write each service handler file
let count = 0;
for (const [filename, content] of Object.entries(HANDLERS)) {
  const filePath = path.join(GRPC_DIR, `${filename}.js`);
  fs.writeFileSync(filePath, content, 'utf8');
  count++;
}

console.log(`Successfully written ${count} rich gRPC service handlers in ${GRPC_DIR}`);
