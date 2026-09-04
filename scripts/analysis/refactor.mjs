import fs from 'fs';
import path from 'path';

const SRC_DIR = 'integrations/mcp/genos-mcp/src';
const FILE_PATH = path.join(SRC_DIR, 'lib.rs');

const content = fs.readFileSync(FILE_PATH, 'utf8');
const lines = content.split('\n');

function writePart(name, startLine, endLine, prefix = '', suffix = '') {
    const partLines = lines.slice(startLine - 1, endLine);
    fs.writeFileSync(path.join(SRC_DIR, name), prefix + partLines.join('\n') + suffix);
}

// 1. imports and helpers: 1-99
writePart('lib_imports.rs', 1, 99);

// 2. tools: 100-323
writePart('lib_tools.rs', 100, 323);

// 3. executor: 325-425 (skipping 324 which is likely blank)
writePart('lib_executor.rs', 325, 426);

// 4. server core (McpServer struct + new + handle): 427-464
writePart('lib_server.rs', 427, 464, '', '\n}\n'); // close the impl block

// 5. server call (call_tool): 466-856
writePart('lib_server_call.rs', 466, 856, 'impl McpServer {\n', ''); // starts with impl, ends with original }

// 6. server http and helpers: 858-965
writePart('lib_server_http.rs', 858, 965);

// 7. tests: 966-1228
writePart('lib_tests.rs', 966, lines.length);

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
