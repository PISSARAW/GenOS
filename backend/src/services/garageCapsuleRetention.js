'use strict';

async function retained(db, agentId) {
  const schema = await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'garage_queue'");
  if (!schema) return false;
  return Boolean(await db.get(`SELECT request_id FROM garage_queue WHERE worker_id = ?
    AND phase IN ('freezing','freeze_failed') LIMIT 1`, agentId));
}

module.exports = { retained };
