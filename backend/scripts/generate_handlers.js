const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, '../src/routes');
const grpcDir = path.join(__dirname, '../src/grpc_services');

const files = fs.readdirSync(routesDir);

let indexContent = `// Auto-generated gRPC Services Loader\nmodule.exports = function registerAllServices(grpcServer, protoDescriptor) {\n`;

for (const filename of files) {
    if (filename.endsWith('Routes.js')) {
        const serviceName = filename.replace('Routes.js', '');
        const capitalized = serviceName.charAt(0).toUpperCase() + serviceName.slice(1);
        
        const handlerContent = `module.exports = {\n  Ping: (call, callback) => {\n    callback(null, { status: "Service ${capitalized} is alive via gRPC!" });\n  }\n};\n`;
        
        fs.writeFileSync(path.join(grpcDir, `${serviceName}Service.js`), handlerContent);
        
        indexContent += `  if (protoDescriptor.genos.${serviceName} && protoDescriptor.genos.${serviceName}.${capitalized}Service) {\n`;
        indexContent += `    grpcServer.addService(protoDescriptor.genos.${serviceName}.${capitalized}Service.service, require('./${serviceName}Service'));\n`;
        indexContent += `  }\n`;
    }
}
indexContent += `};\n`;
fs.writeFileSync(path.join(grpcDir, 'index.js'), indexContent);
