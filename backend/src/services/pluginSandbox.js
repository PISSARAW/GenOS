const { spawn } = require('child_process');
const ALLOWED_CAPABILITIES = new Set(['mcp', 'retrieval', 'webhook', 'grader', 'connector']);

function validate(manifest) {
  if (!manifest?.id || !/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(manifest.id)) throw new Error('Plugin id is invalid.');
  if (!manifest?.image || !/^[a-z0-9][a-z0-9./:_-]+$/i.test(manifest.image)) throw new Error('Plugin image is invalid.');
  const capabilities = Array.isArray(manifest.capabilities) ? manifest.capabilities : [];
  if (capabilities.some((capability) => !ALLOWED_CAPABILITIES.has(capability))) throw new Error('Plugin requests an unsupported capability.');
  return { id: manifest.id, image: manifest.image, version: manifest.version || 'latest', capabilities };
}

function run(manifest, payload = {}, timeoutMs = 15000) {
  const plugin = validate(manifest);
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--pids-limit', '64', '--memory', '256m', '--security-opt', 'no-new-privileges', plugin.image], { stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH } });
    let output = ''; let errors = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Plugin sandbox timed out.')); }, Math.min(Math.max(Number(timeoutMs) || 15000, 1000), 60000));
    child.stdout.on('data', (chunk) => { output += chunk.toString(); }); child.stderr.on('data', (chunk) => { errors += chunk.toString(); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); }); child.on('close', (code) => { clearTimeout(timer); if (code === 0) resolve({ plugin: plugin.id, output: output.slice(0, 65536) }); else reject(new Error(`Plugin exited ${code}: ${errors.slice(-1000)}`)); });
    child.stdin.end(JSON.stringify(payload));
  });
}
module.exports = { validate, run };
