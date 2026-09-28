'use strict';

// Rust inventory: crates, binaries, CLI commands, MCP tools exposed by the
// Rust server, and name-level links to Node callers when they exist.
// Scope: crates/*, packages/*, backend/src (Node side of the bridges).
// Name matching is a lead, not a wiring verdict.
const fs = require('node:fs');
const path = require('node:path');
const lib = require('./inventory_lib');

function crateNames() {
  const entries = fs.readdirSync(path.join(lib.root, 'crates'), { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

function cargoName(crate) {
  const file = path.join(lib.root, 'crates', crate, 'Cargo.toml');
  if (!fs.existsSync(file)) return null;
  const match = fs.readFileSync(file, 'utf8').match(/^name\s*=\s*"([^"]+)"/m);
  return match ? match[1] : null;
}

function binaries(crate) {
  const src = path.join(lib.root, 'crates', crate, 'src');
  if (!fs.existsSync(src)) return [];
  const direct = fs.existsSync(path.join(src, 'main.rs')) ? ['src/main.rs'] : [];
  const toml = path.join(lib.root, 'crates', crate, 'Cargo.toml');
  const declared = fs.existsSync(toml)
    ? [...fs.readFileSync(toml, 'utf8').matchAll(/\[\[bin\]\]\s*\n(?:[^\[]*\n)*?path\s*=\s*"([^"]+)"/g)]
      .map((m) => m[1]) : [];
  return [...new Set([...direct, ...declared])].sort();
}

function cliCommands() {
  const dir = path.join(lib.root, 'crates/genos-cli/src/commands');
  if (!fs.existsSync(dir)) return { files: [], undeclared: [] };
  const mod = fs.readFileSync(path.join(dir, 'mod.rs'), 'utf8');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.rs') && f !== 'mod.rs')
    .map((f) => f.replace(/\.rs$/, '')).sort();
  const undeclared = files.filter((m) => !new RegExp(`pub mod ${m};`).test(mod));
  return { files, undeclared };
}

function rustMcpTools() {
  const file = path.join(lib.root, 'crates/genos-mcp/src/tools.rs');
  if (!fs.existsSync(file)) return [];
  const catalogFile = path.join(lib.root, 'crates/genos-mcp/src/tools/catalog_tools.rs');
  const baseFile = path.join(lib.root, 'crates/genos-mcp/src/tools/base_specs.rs');
  const src = fs.readFileSync(file, 'utf8');
  const catalogSrc = fs.existsSync(catalogFile) ? fs.readFileSync(catalogFile, 'utf8') : '';
  const baseSrc = fs.existsSync(baseFile) ? fs.readFileSync(baseFile, 'utf8') : '';
  const names = [
    ...[...src.matchAll(/"name"\s*:\s*"(genos_[^"]+)"/g)].map((m) => m[1]),
    ...[...catalogSrc.matchAll(/"(genos_[^"]+)"/g)].map((m) => m[1]),
    ...[...baseSrc.matchAll(/"name"\s*:\s*"(genos_[^"]+)"/g)].map((m) => m[1])
  ];
  return [...new Set(names)].sort();
}

function nodeMentions(names) {
  const haystacks = ['backend/src/services/genosCli.js', 'backend/src/services/rustBridgeController.js'];
  const texts = haystacks.filter((f) => fs.existsSync(path.join(lib.root, f)))
    .map((f) => lib.readText(f)).join('\n');
  const all = lib.listFiles('backend/src/services', ['.js']).join('\n');
  return names.filter((n) => {
    const short = n.replace(/^genos-/, '');
    return texts.includes(n) || all.includes(short);
  });
}

function audit() {
  const crates = crateNames();
  const commands = cliCommands();
  const tools = rustMcpTools();
  return { scope: 'rust', method: 'cargo-manifest-and-source-scan',
    caveat: 'Name matches suggest bridges; only typed receipts prove them (matrix section 11).',
    crates: crates.map((crate) => ({ crate, package: cargoName(crate),
      binaries: binaries(crate) })),
    cli: { commands: commands.files, undeclaredInMod: commands.undeclared },
    rustMcpTools: tools,
    nodeLinkedCrates: nodeMentions(crates.map((c) => cargoName(c)).filter(Boolean)) };
}

if (require.main === module) {
  const result = audit();
  lib.emit(result, `rust: ${result.crates.length} crates, `
    + `${result.cli.commands.length} cli commands (${result.cli.undeclaredInMod.length} undeclared), `
    + `${result.rustMcpTools.length} rust mcp tool names, `
    + `${result.nodeLinkedCrates.length} crates mentioned in Node.`);
}

module.exports = { audit };
