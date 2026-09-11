const fs = require('fs');
const path = require('path');

function warnWin32Key(name) {
  if (process.platform === 'win32') {
    if (name === 'GENOS_GRPC_TLS_KEY') {
      console.warn('[tlsConfig] win32 key ACL check skipped; verify file permissions manually.');
    }
  }
}

function checkKeyPermissions(name, stat) {
  if (process.platform !== 'win32') {
    if ((stat.mode & 0o077) !== 0) {
      throw new Error(`${name} must not be group/world accessible.`);
    }
  }
  warnWin32Key(name);
}

function readKeyMaterial(name, configuredPath) {
  const resolved = path.resolve(String(configuredPath));
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile()) throw new Error(`${name} must reference a regular file, not a symlink.`);
  if (stat.isSymbolicLink()) throw new Error(`${name} must reference a regular file, not a symlink.`);
  checkKeyPermissions(name, stat);
  return fs.readFileSync(resolved);
}

function readPrivateTlsPair(keyPath, certPath) {
  if (!keyPath) {
    if (!certPath) {
      console.warn('[tlsConfig] No TLS pair configured; falling back to insecure transport.');
      return null;
    }
  }
  if (!keyPath) throw new Error('GENOS_GRPC_TLS_KEY and GENOS_GRPC_TLS_CERT must be configured together.');
  if (!certPath) throw new Error('GENOS_GRPC_TLS_KEY and GENOS_GRPC_TLS_CERT must be configured together.');
  const privateKey = readKeyMaterial('GENOS_GRPC_TLS_KEY', keyPath);
  const certChain = readKeyMaterial('GENOS_GRPC_TLS_CERT', certPath);
  return { private_key: privateKey, cert_chain: certChain };
}

module.exports = { readPrivateTlsPair };
