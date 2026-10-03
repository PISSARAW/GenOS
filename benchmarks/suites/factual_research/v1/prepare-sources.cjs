const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SOURCE_DIR = path.join(__dirname, 'public', 'sources');
const SOURCES = ['rfc9110.json', 'rfc9111.json'];

function prepareSources() {
  const files = SOURCES.map((name) => {
    const content = fs.readFileSync(path.join(SOURCE_DIR, name));
    const source = JSON.parse(content.toString('utf8'));
    return {
      path: name,
      sourceId: source.sourceId,
      version: source.version,
      url: source.url,
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
      bytes: content.length
    };
  });
  const lock = { schemaVersion: 1, corpusVersion: '1.1.0', files };
  fs.writeFileSync(path.join(__dirname, 'public', 'sources.lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
  return lock;
}

console.log(JSON.stringify(prepareSources(), null, 2));
