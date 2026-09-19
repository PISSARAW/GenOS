const fs = require('fs');
const path = require('path');

function warnWin32Key(name) {
  if (process.platform === 'win32' && name.endsWith('_TLS_KEY')) console.warn('[tlsConfig] win32 key ACL check skipped; verify file permissions manually.');
}

function checkKeyPermissions(name, stat) {
  if (process.platform !== 'win32') {
    if ((stat.mode & 0o077) !== 0) {
      throw new Error(`${name} must not be group/world accessible.`);
    }
  }
  warnWin32Key(name);
}

function readRegularMaterial(name, configuredPath) {
  const resolved = path.resolve(String(configuredPath));
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile()) throw new Error(`${name} must reference a regular file, not a symlink.`);
  if (stat.isSymbolicLink()) throw new Error(`${name} must reference a regular file, not a symlink.`);
  return fs.readFileSync(resolved);
}

function readKeyMaterial(name, configuredPath) {
  const resolved = path.resolve(String(configuredPath));
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${name} must reference a regular file, not a symlink.`);
  checkKeyPermissions(name, stat);
  return fs.readFileSync(resolved);
}

function readPrivateTlsPair(keyPath, certPath, names = {}) {
  if (!keyPath) {
    if (!certPath) {
      console.warn('[tlsConfig] No TLS pair configured; falling back to insecure transport.');
      return null;
    }
  }
  const keyName = names.keyEnv || 'GENOS_GRPC_TLS_KEY';
  const certName = names.certEnv || 'GENOS_GRPC_TLS_CERT';
  if (!keyPath || !certPath) throw new Error(`${keyName} and ${certName} must be configured together.`);
  const privateKey = readKeyMaterial(keyName, keyPath);
  const certChain = readRegularMaterial(certName, certPath);
  return { private_key: privateKey, cert_chain: certChain };
}

function readTransportTlsConfig(input) {
  const keyPath = process.env[input.keyEnv];
  const certPath = process.env[input.certEnv];
  const caPath = process.env[input.caEnv];
  const required = process.env[input.requiredEnv] === '1';
  const pair = readPrivateTlsPair(keyPath, certPath, input);
  if ((required || caPath) && (!pair || !caPath)) throw new Error(`${input.requiredEnv}=1 or a client CA requires a server key, certificate and client CA.`);
  const clientCa = caPath ? readRegularMaterial(input.caEnv, caPath) : null;
  return { pair, clientCa, requireClientCertificate: required || Boolean(clientCa) };
}

function grpcServerCredentials(grpc, tls) {
  if (!tls.pair) return grpc.ServerCredentials.createInsecure();
  return grpc.ServerCredentials.createSsl(tls.clientCa, [tls.pair], tls.requireClientCertificate);
}

module.exports = { readPrivateTlsPair, readTransportTlsConfig, grpcServerCredentials };
