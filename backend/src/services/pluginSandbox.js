const { spawn } = require('child_process');
const { appendBounded } = require('./boundedOutput');
const { terminateChild } = require('./processTermination');
const ALLOWED_CAPABILITIES = new Set(['mcp', 'retrieval', 'webhook', 'grader', 'connector']);

function allowedPluginRegistries() {
  return String(process.env.GENOS_PLUGIN_REGISTRIES || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function validateImage(image) {
  if (!String(image).includes('@sha256:')) throw new Error('Plugin image must be pinned by a sha256 digest.');
  if (!/^[a-z0-9][a-z0-9./:_-]+@sha256:[a-f0-9]{64}$/i.test(image)) throw new Error('Plugin image is invalid.');
  const [reference, digest] = image.split('@');
  if (!digest || !/^sha256:[a-f0-9]{64}$/i.test(digest)) throw new Error('Plugin image must be pinned by a sha256 digest.');
  const registry = reference.includes('/') ? reference.split('/')[0].toLowerCase() : 'docker.io';
  const registries = allowedPluginRegistries();
  if (registries.length && !registries.includes(registry)) throw new Error(`Plugin registry '${registry}' is not allowed.`);
  return image;
}

function validate(manifest) {
  if (!manifest?.id || !/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(manifest.id)) throw new Error('Plugin id is invalid.');
  if (!manifest?.image) throw new Error('Plugin image is invalid.');
  const image = validateImage(manifest.image);
  const capabilities = Array.isArray(manifest.capabilities) ? manifest.capabilities : [];
  if (capabilities.some((capability) => !ALLOWED_CAPABILITIES.has(capability))) throw new Error('Plugin requests an unsupported capability.');
  return { id: manifest.id, image, version: manifest.version || 'latest', capabilities };
}

function dockerRunArgs(plugin) {
  const cpuLimit = Number(process.env.GENOS_PLUGIN_CPU_LIMIT);
  const memoryLimit = Number(process.env.GENOS_PLUGIN_MEMORY_LIMIT_MB);
  const tmpfsLimit = Number(process.env.GENOS_PLUGIN_TMPFS_LIMIT_MB);
  const cpus = Number.isFinite(cpuLimit) && cpuLimit > 0 ? String(cpuLimit) : '1';
  const memoryMb = Number.isSafeInteger(memoryLimit) && memoryLimit > 0 ? memoryLimit : 256;
  const tmpfsMb = Number.isSafeInteger(tmpfsLimit) && tmpfsLimit > 0 ? tmpfsLimit : 64;
  return ['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--pids-limit', '64', '--cpus', cpus, '--memory', `${memoryMb}m`, '--memory-swap', `${memoryMb}m`, '--tmpfs', `/tmp:rw,noexec,nosuid,size=${tmpfsMb}m`, '--ulimit', 'nofile=1024:1024', '--security-opt', 'no-new-privileges', plugin.image];
}

function run(manifest, payload = {}, timeoutMs = 15000) {
  const plugin = validate(manifest);
  return new Promise((resolve, reject) => {
    const child = spawn('docker', dockerRunArgs(plugin), { detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH } });
    let output = ''; let errors = '';
    const timer = setTimeout(() => { terminateChild(child); reject(new Error('Plugin sandbox timed out.')); }, Math.min(Math.max(Number(timeoutMs) || 15000, 1000), 60000));
    child.stdout.on('data', (chunk) => { output = appendBounded(output, chunk); }); child.stderr.on('data', (chunk) => { errors = appendBounded(errors, chunk); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); }); child.on('close', (code) => { clearTimeout(timer); if (code === 0) resolve({ plugin: plugin.id, output: output.slice(0, 65536) }); else reject(new Error(`Plugin exited ${code}: ${errors.slice(-1000)}`)); });
    child.stdin.end(JSON.stringify(payload));
  });
}
module.exports = { dockerRunArgs, validate, run, validateImage };
