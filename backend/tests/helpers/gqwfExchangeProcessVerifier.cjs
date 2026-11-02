'use strict';

const fs = require('node:fs/promises');
const nativeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const storage = require('../../src/services/gqwf/storage');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const fixture = require('./gqwfExchangeProcessFixtures.cjs');
const same = (left, right) => digest(left) === digest(right);

async function file(exchange, manifest, name) {
  const item = manifest.files.find(entry => entry.path === name);
  if (!item) throw new Error('GQWF demo expected file absent.');
  return exchange.cas.read({ hash: item.hash, size: item.size });
}

async function material(exchange, request) {
  const candidate = request.candidate;
  if (!same(candidate.predicate, { command: fixture.COMMAND, expectedExitCode: 0, expectedOutput: 'counter increased' }) ||
      !same(request.world.closure.runtime, fixture.NODE) || !same(request.policy, fixture.POLICY)) {
    throw new Error('GQWF demo verifier, runtime or policy not installed.');
  }
  const head = await storage.root(exchange.db, fixture.WORKSPACE, request.currentHead.rootHash);
  const actualBase = await file(exchange, head, 'candidate.json');
  const offeredBase = await file(exchange, request.world.manifest, 'base.json');
  if (!same(JSON.parse(actualBase), JSON.parse(offeredBase))) throw new Error('GQWF demo world was not rebased on the actual head.');
  const script = await file(exchange, request.world.manifest, 'verify-candidate.cjs');
  if (script.toString('utf8') !== fixture.SCRIPT) throw new Error('GQWF demo remote command is not an installed verifier.');
  return { script, base: offeredBase, candidate: await file(exchange, request.world.manifest, 'candidate.json') };
}

async function probe(content) {
  const temporaryRoot = path.resolve(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(temporaryRoot, 'gqwf-exchange-check-'));
  try {
    await fs.writeFile(path.join(directory, 'verify-candidate.cjs'), content.script);
    await fs.writeFile(path.join(directory, 'base.json'), content.base);
    await fs.writeFile(path.join(directory, 'candidate.json'), content.candidate);
    const result = spawnSync(process.execPath, ['verify-candidate.cjs', 'base.json', 'candidate.json'],
      { cwd: directory, encoding: 'utf8', timeout: 10000, windowsHide: true });
    if (result.error) throw result.error;
    if (result.status !== 0 || result.stdout !== 'counter increased') throw new Error('GQWF demo independent candidate predicate failed.');
    return { exitCode: result.status, output: result.stdout };
  } finally {
    if (path.dirname(path.resolve(directory)) !== temporaryRoot) throw new Error('Unsafe verification temporary root.');
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function verifier(exchange, directory) {
  return async request => {
    const outcome = await probe(await material(exchange, request));
    const filename = path.join(directory, 'evidence-log.json');
    const log = JSON.parse(nativeFs.readFileSync(filename, 'utf8'));
    log.push({ stage: request.stage, candidateId: request.candidate.candidateId,
      baseHash: request.currentHead.rootHash, rootHash: request.candidate.rootHash, ...outcome });
    nativeFs.writeFileSync(filename, JSON.stringify(log));
    return { status: 'validated', requestDigest: digest(request), verifierRef: 'counter-increases',
      receiptDigest: digest({ request, outcome }) };
  };
}

module.exports = { verifier };
