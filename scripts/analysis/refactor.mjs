import fs from 'fs';
import path from 'path';

const SRC_DIR = 'integrations/mcp/genos-mcp/src';
const FILE_PATH = path.join(SRC_DIR, 'lib.rs');

const content = fs.readFileSync(FILE_PATH, 'utf8');
const lines = content.split('\n');

function writePart({ name, startLine, endLine, prefix = '', suffix = '' }) {
    const partLines = lines.slice(startLine - 1, endLine);
    fs.writeFileSync(path.join(SRC_DIR, name), prefix + partLines.join('\n') + suffix);
}

// 1. imports and helpers: 1-99
writePart({ name: 'lib_imports.rs', startLine: 1, endLine: 99 });

// 2. tools: 100-323
writePart({ name: 'lib_tools.rs', startLine: 100, endLine: 323 });

// 3. executor: 325-425 (skipping 324 which is likely blank)
writePart({ name: 'lib_executor.rs', startLine: 325, endLine: 426 });

// 4. server core (McpServer struct + new + handle): 427-464
writePart({ name: 'lib_server.rs', startLine: 427, endLine: 464, suffix: '\n}\n' }); // close the impl block

// 5. server call (call_tool): 466-856
writePart({ name: 'lib_server_call.rs', startLine: 466, endLine: 856, prefix: 'impl McpServer {\n' }); // starts with impl, ends with original }

// 6. server http and helpers: 858-965
writePart({ name: 'lib_server_http.rs', startLine: 858, endLine: 965 });

// 7. tests: 966-1228
writePart({ name: 'lib_tests.rs', startLine: 966, endLine: lines.length });

// 8. new lib.rs
const newLib = `
include!("lib_imports.rs");
include!("lib_tools.rs");
include!("lib_executor.rs");
include!("lib_server.rs");
include!("lib_server_call.rs");
include!("lib_server_http.rs");
include!("lib_tests.rs");
`;

fs.writeFileSync(FILE_PATH, newLib.trim() + '\n');
console.log("Refactoring complete.");
