'use strict';

const agent = require('./agent.cjs');
const { hash } = require('../competence-100/corpus.cjs');
async function main() {
  const db = await agent.connect(process.argv[2]);
  try {
    const state = await agent.store.load(db, { agentId: 'experienced', verifierDigest: process.argv[3] });
    process.stdout.write(JSON.stringify({ hash: hash(state), version: state.version }));
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
