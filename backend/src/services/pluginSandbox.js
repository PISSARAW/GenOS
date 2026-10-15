const { spawn } = require('child_process');
const { appendBounded } = require('./boundedOutput');
const { terminateChild } = require('./processTermination');
const ALLOWED_CAPABILITIES = new Set(['mcp', 'retrieval', 'webhook', 'grader', 'connector']);

function allowedPluginRegistries() {
  const configured = String(process.env.GENOS_PLUGIN_REGISTRIES || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return configured.length ? configured : ['docker.io'];
}

function validateImage(image) {
  const reference = parsePinnedImage(image);
  const registry = registryForImage(reference);
  const registries = allowedPluginRegistries();
  if (!registries.includes(registry)) throw new Error(`Plugin registry '${registry}' is not allowed.`);
  return image;
}

function parsePinnedImage(image) {
  assertImageString(image);
  const separator = image.indexOf('@');
  assertSingleDigestSeparator(image, separator);
  const reference = image.slice(0, separator);
  const digest = image.slice(separator + 1);
  assertSha256Digest(digest);
  assertSafeImageReference(reference);
  return reference;
}

function assertImageString(image) {
  if (typeof image !== 'string' || image.length > 512) throw new Error('Plugin image is invalid.');
}

function assertSingleDigestSeparator(image, separator) {
  if (separator < 1 || image.indexOf('@', separator + 1) !== -1) {
    throw new Error('Plugin image must be pinned by a sha256 digest.');
  }
}

function assertSha256Digest(digest) {
  if (!/^sha256:[a-f0-9]{64}$/i.test(digest)) throw new Error('Plugin image must be pinned by a sha256 digest.');
}

function assertSafeImageReference(reference) {
  if (!/^[a-z0-9][a-z0-9./:_-]+$/i.test(reference)) throw new Error('Plugin image is invalid.');
  const segments = reference.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) throw new Error('Plugin image reference is invalid.');
}

function registryForImage(reference) {
  const segments = reference.split('/');
  const first = segments[0].toLowerCase();
  const hasRegistry = segments.length > 1 && (first.includes('.') || first.includes(':') || first === 'localhost');
  return hasRegistry ? first : 'docker.io';
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
