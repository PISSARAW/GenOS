'use strict';

// Node inventory: entries, static reachability, known dynamic registries,
// routes, jobs/daemons, CLI programs, MCP catalogs and verified callers.
// Scope: backend/src, backend/bin, backend/server.js, mcp/index.js.
// Heuristic output only: presence here never proves a production wiring.
const lib = require('./inventory_lib');
const reachability = require('./audit_service_reachability');

const APP = 'backend/src/app.js';
const ROUTES_DIR = 'backend/src/routes';

function routeMount() {
  const app = lib.readText(APP);
  const files = lib.listFiles(ROUTES_DIR, ['.js']);
  const mounted = files.filter((file) => {
    const base = file.replace(/^.*\//, '').replace(/\.js$/, '');
    return app.includes(`./routes/${base}`);
  });
  return { total: files.length, mounted, unmounted: files.filter((f) => !mounted.includes(f)) };
}

function cliPrograms() {
  const files = lib.listFiles('backend/bin', ['.cjs', '.js']);
  return files.map((file) => {
    const head = lib.readText(file).split('\n')[0] || '';
    return { program: file, shebang: head.startsWith('#!') };
  });
}

function daemonJobs() {
  const daemon = lib.listFiles('backend/src/services/daemon', ['.js']);
  const bin = lib.listFiles('backend/bin', ['.cjs', '.js']);
  const pattern = /(daemon|cron|sched|worker)/i;
  return { daemonServices: daemon.length, binJobs: bin.filter((f) => pattern.test(f)) };
}

function dynamicRegistries() {
  const services = lib.listFiles('backend/src/services', ['.js']);
  const extra = lib.listFiles('backend/src/strategies', ['.js'])
    .concat(lib.listFiles('backend/src/cognition', ['.js']));
  return services.concat(extra).filter((f) => /registry/i.test(f));
}

function catalogCounts() {
  const shared = lib.toolNames(lib.readJson('shared/toolDefinitions.json'));
  const bundled = lib.toolNames(lib.readJson('mcp/toolDefinitions.json'));
  return { shared: shared.length, bundled: bundled.length,
    onlyShared: shared.filter((n) => !bundled.includes(n)),
    onlyBundled: bundled.filter((n) => !shared.includes(n)) };
}

function audit() {
  const reach = reachability.audit();
  const routes = routeMount();
  const cli = cliPrograms();
  return { scope: 'node', method: 'static-enumeration',
    caveat: 'Presence is not wiring. See docs/06-qualite-preuves/registres-dynamiques.md.',
    entries: ['backend/server.js', 'mcp/index.js', ...cli.map((c) => c.program)],
    services: { total: reach.total, staticReachable: reach.staticReachable,
      notStaticallyReachable: reach.notStaticallyReachable,
      withoutLiteralInbound: reach.withoutLiteralInbound,
      categories: reach.categories || null },
    routes: { total: routes.total, mounted: routes.mounted.length, unmounted: routes.unmounted },
    jobs: daemonJobs(), cli, registries: dynamicRegistries(), mcpCatalogs: catalogCounts() };
}

if (require.main === module) {
  const result = audit();
  lib.emit(result, `node: ${result.services.total} services `
    + `(${result.services.staticReachable} reachable), ${result.routes.total} routes `
    + `(${result.routes.mounted} mounted), ${result.cli.length} bin programs, `
    + `${result.registries.length} registry files, `
    + `mcp catalogs ${result.mcpCatalogs.shared}/${result.mcpCatalogs.bundled}.`);
}

module.exports = { audit };
