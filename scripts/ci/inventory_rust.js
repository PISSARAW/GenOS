'use strict';

// Rust inventory: crates, binaries/examples, Node bridges.
// Scope: crates/*, packages/*. Presence never proves production wiring.
const lib = require('./inventory_lib');

function crateNames() {
  const entries = lib.listFiles('crates', ['Cargo.toml']);
  return entries.map((file) => file.replace('/Cargo.toml', ''));
}

function details(crate) {
  const manifest = lib.readText(`${crate}/Cargo.toml`);
  const bins = lib.listFiles(`${crate}/src/bin`, ['.rs']);
  const examples = lib.listFiles(`${crate}/examples`, ['.rs']);
  const hasLib = manifest.includes('[lib]');
  return { crate, hasLib, bins: bins.length, examples: examples.length };
}

function nodeBridges() {
  const services = lib.listFiles('backend/src/services', ['.js']);
  const pattern = /rust|bridge|spawn|cargo|neon|napi/i;
  return services.filter((file) => pattern.test(lib.readText(file)));
}

function audit() {
  const crates = crateNames();
  return { scope: 'rust', method: 'static-enumeration',
    caveat: 'Presence is not wiring. Bridges are textual matches only.',
    crates: crates.map(details),
    nodeBridges: nodeBridges(),
    packages: lib.listFiles('packages', ['package.json']) };
}

if (require.main === module) {
  const result = audit();
  lib.emit(result, `rust: ${result.crates.length} crates, `
    + `${result.nodeBridges.length} node bridge candidates, `
    + `${result.packages.length} packages.`);
}

module.exports = { audit };
