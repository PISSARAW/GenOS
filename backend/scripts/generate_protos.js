const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, '../src/routes');
const protoDir = path.join(__dirname, '../proto');

if (!fs.existsSync(protoDir)) {
    fs.mkdirSync(protoDir);
}

const files = fs.readdirSync(routesDir);
let indexContent = `// Auto-generated gRPC loader\nconst grpc = require('@grpc/grpc-js');\nconst protoLoader = require('@grpc/proto-loader');\nconst path = require('path');\n\nmodule.exports = function loadAllProtos() {\n  const services = {};\n`;

for (const filename of files) {
    if (filename.endsWith('Routes.js')) {
        const serviceName = filename.replace('Routes.js', '');
        const capitalized = serviceName.charAt(0).toUpperCase() + serviceName.slice(1);
        
        const protoContent = `syntax = "proto3";\n\npackage genos.${serviceName};\n\nservice ${capitalized}Service {\n  rpc Ping (Empty) returns (PingResponse);\n}\n\nmessage Empty {}\n\nmessage PingResponse {\n  string status = 1;\n}\n`;
        
        fs.writeFileSync(path.join(protoDir, `${serviceName}.proto`), protoContent);
        console.log(`Generated ${serviceName}.proto`);

        indexContent += `  services.${serviceName} = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, '${serviceName}.proto'), {keepCase: true}));\n`;
    }
}
indexContent += `  return services;\n}\n`;
fs.writeFileSync(path.join(protoDir, 'index.js'), indexContent);
