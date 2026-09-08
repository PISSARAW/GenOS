const fs = require('fs');
const path = require('path');

function readPrivateTlsPair(keyPath, certPath) {
  if (!keyPath && !certPath) return null;
  if (!keyPath || !certPath) throw new Error('GENOS_GRPC_TLS_KEY and GENOS_GRPC_TLS_CERT must be configured together.');

  const files = [['GENOS_GRPC_TLS_KEY', keyPath], ['GENOS_GRPC_TLS_CERT', certPath]];
  const materials = {};
  for (const [name, configuredPath] of files) {
    const resolved = path.resolve(String(configuredPath));
    const stat = fs.lstatSync(resolved);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${name} must reference a regular file, not a symlink.`);
    if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
      throw new Error(`${name} must not be group/world accessible.`);
    }
    materials[name] = fs.readFileSync(resolved);
  }
  return { private_key: materials.GENOS_GRPC_TLS_KEY, cert_chain: materials.GENOS_GRPC_TLS_CERT };
}

module.exports = { readPrivateTlsPair };
