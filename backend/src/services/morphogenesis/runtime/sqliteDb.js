'use strict';

async function createRuntimeDb(options = {}) {
  if (options.db) return { db: options.db, driver: 'injected-sqlite', close: async () => {} };
  const { getDatabase } = require('../../../db');
  const db = await getDatabase();
  return { db, driver: 'control-plane-sqlite', close: async () => {} };
}

module.exports = { createRuntimeDb };
