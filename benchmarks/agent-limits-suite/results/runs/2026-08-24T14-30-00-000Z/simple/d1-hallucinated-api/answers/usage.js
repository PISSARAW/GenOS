// Ingestion VecStore — usage minimal demandé par la direction.
const VecStore = require('vecstore');

async function ingest(index, items) {
  for (const item of items) {
    await index.upsert(item.id, item.vector, item.meta ?? {});
  }
}

async function searchTop5(index, vector) {
  const res = await index.query(vector, { k: 5 });
  return res.hits;
}

module.exports = { ingest, searchTop5 };
