const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function main(args) {
  if (args.length !== 2) throw new Error('Usage: node activate-fossil-trust-bundle.cjs <candidate.json> <active.json>');
  const source = path.resolve(args[0]);
  const target = path.resolve(args[1]);
  const bundle = validate(JSON.parse(fs.readFileSync(source, 'utf8')));
  activate(target, `${JSON.stringify(bundle, null, 2)}\n`);
  process.stdout.write(`Activated ${Object.keys(bundle).length} fossil trust key(s) at ${target}\n`);
}

function validate(bundle) {
  if (!bundle || Array.isArray(bundle) || typeof bundle !== 'object' || !Object.keys(bundle).length) {
    throw new Error('Trust bundle must be a non-empty key-id map');
  }
  for (const [keyId, rawHex] of Object.entries(bundle)) {
    if (!/^[0-9a-f]{32}$/.test(keyId) || typeof rawHex !== 'string' || !/^[0-9a-f]{64}$/i.test(rawHex)) {
      throw new Error('Trust bundle contains an invalid Ed25519 key entry');
    }
    const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(rawHex, 'hex')]);
    const publicKey = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
    const actual = crypto.createHash('sha256').update(publicKey.export({ format: 'der', type: 'spki' }))
      .digest('hex').slice(0, 32);
    if (actual !== keyId) throw new Error(`Trust key id does not match public key fingerprint: ${keyId}`);
  }
  return Object.fromEntries(Object.entries(bundle).sort(([left], [right]) => left.localeCompare(right)));
}

function activate(target, contents) {
  const directory = path.dirname(target);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(target)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, contents, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, target);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
