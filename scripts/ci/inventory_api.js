'use strict';

// REST/gRPC inventory: route or RPC -> controller/service -> access controls
// -> schema -> nominal test -> refusal test (presence only, never a verdict).
// Scope: backend/src/routes, backend/src/app.js, backend/proto,
// backend/src/grpc_services, backend/tests.
// Auth note: backend/src/app.js applies requireAuthentication globally;
// per-file mentions below are additional controls, not the whole story.
const lib = require('./inventory_lib');

const ROUTES_DIR = 'backend/src/routes';
const GRPC_DIR = 'backend/src/grpc_services';
const PROTO_DIR = 'backend/proto';
const AUTH_HINTS = ['requireAuthentication', 'requireRole', 'authorize', 'canExecute', 'scope', 'tenant'];

function testCorpus() {
  const files = lib.listFiles('backend/tests', ['.js']);
  return files.map((file) => ({ file, text: lib.readText(file) }));
}

function routeRow(file, tests) {
  const src = lib.readText(file);
  const base = file.replace(/^.*\//, '').replace(/\.js$/, '');
  const short = base.replace(/Routes$/, '');
  const paths = [...src.matchAll(/\.(get|post|put|patch|delete|use|all)\s*\(\s*['"`]([^'"`]+)['"`]/g)]
    .map((m) => `${m[1].toUpperCase()} ${m[2]}`);
  const app = lib.readText('backend/src/app.js');
  const deps = [...src.matchAll(/require\(['"]\.\.\/(controllers|services)\/([^'"]+)['"]/g)]
    .map((m) => `${m[1]}/${m[2]}`);
  const hits = tests.filter((t) => t.text.includes(base) || t.text.includes(short)).map((t) => t.file);
  return { route: file, mounted: app.includes(`./routes/${base}`),
    paths: [...new Set(paths)].sort(), controllers: [...new Set(deps)].sort(),
    authHints: AUTH_HINTS.filter((h) => src.includes(h)), tests: hits };
}

function protoRow(file, tests) {
  const src = lib.readText(file);
  const base = file.replace(/^.*\//, '').replace(/\.proto$/, '');
  const services = [...src.matchAll(/^\s*service\s+(\w+)/gm)].map((m) => m[1]);
  const rpcs = [...src.matchAll(/^\s*rpc\s+(\w+)/gm)].map((m) => m[1]);
  const impls = lib.listFiles(GRPC_DIR, ['.js'])
    .filter((f) => f.toLowerCase().includes(base.toLowerCase()));
  const hits = tests.filter((t) => t.text.includes(base)).map((t) => t.file);
  return { proto: file, services, rpcCount: rpcs.length, implementations: impls, tests: hits };
}

function audit() {
  const tests = testCorpus();
  const routes = lib.listFiles(ROUTES_DIR, ['.js']).map((f) => routeRow(f, tests));
  const protos = lib.listFiles(PROTO_DIR, ['.proto']).map((f) => protoRow(f, tests));
  return { scope: 'api', method: 'route-and-proto-scan',
    caveat: 'Path extraction is regex-based; global auth lives in backend/src/app.js.',
    routes, protos,
    summary: { routes: routes.length, unmounted: routes.filter((r) => !r.mounted).length,
      routesWithoutTests: routes.filter((r) => !r.tests.length).length,
      protos: protos.length, protosWithoutImpl: protos.filter((p) => !p.implementations.length).length,
      protosWithoutTests: protos.filter((p) => !p.tests.length).length } };
}

if (require.main === module) {
  const result = audit();
  const s = result.summary;
  lib.emit(result, `api: ${s.routes} routes (${s.unmounted} unmounted, `
    + `${s.routesWithoutTests} without test mention), ${s.protos} protos `
    + `(${s.protosWithoutImpl} without impl, ${s.protosWithoutTests} without test mention).`);
}

module.exports = { audit };
