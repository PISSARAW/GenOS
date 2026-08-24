// Golden usage.js — VecStore v3 documented surface only.
const VecStore = require('vecstore');

async function ingest(index, items) {
  for (const item of items) {
    await index.upsert(item.id, item.vector, item.meta ?? {});
  }
  await index.flush();
}

async function searchTop5(index, vector) {
  const result = await index.query(vector, { k: 5 });
  return result.hits;
}

module.exports = { ingest, searchTop5 };
