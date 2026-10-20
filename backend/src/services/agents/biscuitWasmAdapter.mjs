import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PACKAGE_NAME = '@biscuit-auth/biscuit-wasm';
const GLUE_MODULE = './biscuit_bg.js';
const WASM_FILE = 'biscuit_bg.wasm';

let apiPromise;

function moduleUrl(moduleDirectory, moduleName) {
  return pathToFileURL(join(moduleDirectory, moduleName)).href;
}

async function wasmImports(moduleDirectory, compiledModule, glue) {
  const imports = { [GLUE_MODULE]: glue };
  const moduleNames = new Set(WebAssembly.Module.imports(compiledModule).map((entry) => entry.module));
  moduleNames.delete(GLUE_MODULE);
  for (const moduleName of moduleNames) {
    imports[moduleName] = await import(moduleUrl(moduleDirectory, moduleName));
  }
  return imports;
}

async function initialize() {
  const entrypoint = import.meta.resolve(PACKAGE_NAME);
  const moduleDirectory = dirname(fileURLToPath(entrypoint));
  const glue = await import(moduleUrl(moduleDirectory, GLUE_MODULE));
  const bytes = await readFile(join(moduleDirectory, WASM_FILE));
  const compiledModule = await WebAssembly.compile(bytes);
  const imports = await wasmImports(moduleDirectory, compiledModule, glue);
  const instance = await WebAssembly.instantiate(compiledModule, imports);
  glue.__wbg_set_wasm(instance.exports);
  instance.exports.__wbindgen_start();
  return glue;
}

export function loadBiscuitApi() {
  if (!apiPromise) apiPromise = initialize();
  return apiPromise;
}
