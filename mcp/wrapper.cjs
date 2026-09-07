const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const tracePath = process.env.GENOS_MCP_TRACE_LOG;
const log = tracePath
	? fs.createWriteStream(path.resolve(tracePath), { flags: 'a', mode: 0o600 })
	: null;
const child = spawn(process.execPath, [path.join(__dirname, 'index.js')], { stdio: ['pipe', 'pipe', 'pipe'] });
process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);
if (log) {
	process.stdin.on('data', d => log.write('IN: ' + d));
	child.stdout.on('data', d => log.write('OUT: ' + d));
	child.stderr.on('data', d => log.write('ERR: ' + d));
	child.on('exit', c => { log.write('EXIT: ' + c); log.end(); });
}
