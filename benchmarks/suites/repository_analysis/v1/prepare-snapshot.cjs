const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../../../..');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SOURCES = [
  'README.md',
  'backend/README.md',
  'docs/03-reference/outils-mcp.md',
  'integrations/codex/README.md'
];

function gitOutput(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function writeSnapshot(revision, source) {
  const content = execFileSync('git', ['show', `${revision}:${source}`], { cwd: ROOT });
  const outputPath = path.join(PUBLIC_DIR, 'snapshot', source);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content);
  return {
    path: source,
    gitBlob: gitOutput(['rev-parse', `${revision}:${source}`]),
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    bytes: content.length
  };
}

function prepareSnapshot() {
  const revision = process.argv[2] || gitOutput(['rev-parse', 'HEAD']);
  const files = SOURCES.map((source) => writeSnapshot(revision, source));
  const lock = { schemaVersion: 1, repository: 'GenOS', revision, files };
  fs.writeFileSync(path.join(PUBLIC_DIR, 'snapshot.lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
  return lock;
}

console.log(JSON.stringify(prepareSnapshot(), null, 2));
