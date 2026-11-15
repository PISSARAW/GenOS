'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const catalog = require('../shared/dependencyProfiles.json');

const root = path.resolve(__dirname, '..');
const OMIT_GROUPS = new Set(['optional', 'dev']);

function runNpm(args, options) {
  if (process.env.npm_execpath) {
    return spawnSync(process.execPath, [process.env.npm_execpath, ...args], options);
  }
  if (process.platform === 'win32') {
    const command = `npm ${args.join(' ')}`;
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], options);
  }
  return spawnSync('npm', args, options);
}

function install(directory, omit) {
  const args = ['ci'];
  for (const group of omit) {
    if (!OMIT_GROUPS.has(group)) throw new Error(`Unsupported omit group: ${group}`);
    args.push(`--omit=${group}`);
  }
  const result = runNpm(args, { cwd: directory, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function optionalPackages(location) {
  const names = Object.values(catalog.capabilities)
    .filter(item => item.location === location)
    .flatMap(item => item.packages);
  return [...new Set(names)].sort();
}

function removeCapabilities(directory, location) {
  const packages = optionalPackages(location);
  if (!packages.length) return;
  const args = ['uninstall', '--no-save', ...packages];
  const result = runNpm(args, { cwd: directory, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function main() {
  const name = process.argv[2] || 'full';
  const profile = catalog.profiles[name];
  if (!profile) throw new Error(`Unknown dependency profile: ${name}`);
  console.log(`[dependencies] Installing ${name}: ${profile.description}`);
  install(root, profile.omit);
  install(path.join(root, 'backend'), profile.omit);
  install(path.join(root, 'mcp'), profile.omit);
  if (profile.removeCapabilities) {
    removeCapabilities(root, 'root');
    removeCapabilities(path.join(root, 'backend'), 'backend');
  }
}

main();
