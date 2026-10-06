#!/usr/bin/env node
'use strict';

const { getDatabase, closeDatabase } = require('../src/db');
const capabilities = require('../src/services/morphogenesis/capabilities/capabilityRuntime');

(async () => {
  if (!process.argv[2]) {
    console.log(JSON.stringify({ operations: capabilities.OPERATIONS }));
    return;
  }
  const input = JSON.parse(process.argv[2]);
  const db = await getDatabase();
  try { console.log(JSON.stringify(await capabilities.invoke(db, input))); }
  finally { await closeDatabase(); }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
