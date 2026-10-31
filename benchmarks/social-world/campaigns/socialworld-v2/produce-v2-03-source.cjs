'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../../../../backend/src/db');
const sourceWorld = require('./v2-03-source-world.cjs');

async function produceSource(input) {
  if (!path.isAbsolute(input.outputDirectory || '')) throw new Error('V2-03 source output must be absolute.');
  const ids = sourceWorld.idsFor(input.seed);
  fs.mkdirSync(input.outputDirectory, { recursive: false });
  const databasePath = path.join(input.outputDirectory, 'source.sqlite');
  const db = await getDatabase(databasePath);
  const artifacts = [];
  try {
    await sourceWorld.createWorld({ db, ids, seed: input.seed });
    for (let index = 1; index <= 5; index += 1) {
      const artifact = await sourceWorld.publishObservedEvent({ db, ids, seed: input.seed, index });
      const name = `event-${index}.json`;
      fs.writeFileSync(path.join(input.outputDirectory, name), `${JSON.stringify(artifact, null, 2)}\n`, { flag: 'wx' });
      artifacts.push(name);
    }
  } finally { await closeDatabase(); }
  const result = { seed: input.seed, databasePath, artifacts, recipientId: ids.recipientId,
    sourceKind: 'persisted-organization-delivery', createdAt: new Date().toISOString() };
  fs.writeFileSync(path.join(input.outputDirectory, 'source-metadata.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  return result;
}

if (require.main === module) {
  produceSource(JSON.parse(process.argv[2] || '{}')).then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}

module.exports = { produceSource };
