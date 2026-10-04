'use strict';

async function createRuntimeDb() {
  const { getDatabase } = require('../../../db');
  const db = await getDatabase();
  return { db, driver: 'control-plane-sqlite', close: async () => {} };
}

module.exports = { createRuntimeDb };
