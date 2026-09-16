const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const { terminateChild } = require('./processTermination.cjs');

const REPO_ROOT = process.env.GENOS_REPO_ROOT || path.resolve(__dirname, '..');
const BIN = process.env.GENOS_MCP_BIN || path.resolve(REPO_ROOT, 'target', 'release', 'genos-mcp.exe');
const tracePath = process.env.GENOS_MCP_TRACE_LOG;
const log = tracePath ? fs.createWriteStream(path.resolve(tracePath), { flags: 'a', mode: 0o600 }) : null;

// Utilise le binaire Rust MCP (plus stable que le SDK Node sous Windows)
const child = spawn(BIN, [], {
  cwd: REPO_ROOT,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, GENOS_REPO_ROOT: REPO_ROOT }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => terminateChild(child));
}

process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);

if (log) {
  process.stdin.on('data', d => log.write('IN: ' + d));
  child.stdout.on('data', d => log.write('OUT: ' + d));
  child.stderr.on('data', d => log.write('ERR: ' + d));
  child.on('exit', c => { log.write('EXIT: ' + c); log.end(); });
}

child.on('error', (err) => {
  console.error('[MCP WRAPPER] Erreur spawn:', err.message);
  process.exit(1);
});
