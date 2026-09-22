#!/usr/bin/env node
// genos_health_check.js — Health probes pour le backend GenOS
const http = require('http');
const BASE = process.env.BACKEND_URL || 'http://localhost:4000';

async function probe(path) {
  return new Promise((resolve) => {
    const req = http.get(BASE + path, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ path, status: res.statusCode }));
    });
    req.on('error', (e) => resolve({ path, error: e.message }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ path, error:'timeout' }); });
  });
}

(async () => {
  const results = await Promise.all([
    probe('/healthz'),
    probe('/readyz'),
    probe('/livez')
  ]);
  const ok = results.every(r => r.status === 200 && !r.error);
  if (!ok) {
    console.error(JSON.stringify(results));
    process.exit(2);
  }
  console.log(JSON.stringify(results.map(r => ({path:r.path, status:r.status}))));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(3);
});
