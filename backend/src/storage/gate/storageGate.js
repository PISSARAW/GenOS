'use strict';

const { execSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

const GATE_HISTORY_PATH = path.join(process.cwd(), '.genos', 'storage-gate-history.jsonl');

async function runLocalBenchmarks() {
  const { getDatabase } = require('../../db');
  const db = await getDatabase();

  const results = {
    timestamp: new Date().toISOString(),
    platform: `${os.platform()} ${os.arch()}`,
    cpus: os.cpus().length,
    memory_gb: Math.round(os.totalmem() / 1024 ** 3),
    engines: {},
  };

  results.engines.sqlite = benchmarkSQLite(db);

  try {
    results.engines.duckdb = benchmarkDuckDB();
  } catch (e) {
    results.engines.duckdb = { available: false, error: e.message };
  }

  try {
    results.engines.ladybug = benchmarkLadybug();
  } catch (e) {
    results.engines.ladybug = { available: false, error: e.message };
  }

  return results;
}

function benchmarkSQLite(db) {
  const samples = 5000;

  db.exec('CREATE TABLE IF NOT EXISTS __bench_oltp (id TEXT PRIMARY KEY, name TEXT, status TEXT, val REAL)');
  const t0 = performance.now();
  for (let i = 0; i < samples; i++) {
    db.run('INSERT OR REPLACE INTO __bench_oltp VALUES (?, ?, ?, ?)', `a${i}`, 'test', 'active', i * 100);
  }
  const insertMs = performance.now() - t0;

  db.exec('CREATE TABLE IF NOT EXISTS __bench_olap (agent_id TEXT, tokens REAL, cost REAL)');
  for (let i = 0; i < samples; i++) {
    db.run('INSERT INTO __bench_olap VALUES (?, ?, ?)', `agent_${i % 100}`, i, i * 0.01);
  }
  const t1 = performance.now();
  db.all('SELECT agent_id, SUM(tokens), AVG(cost) FROM __bench_olap GROUP BY agent_id');
  const aggMs = performance.now() - t1;

  db.exec('CREATE TABLE IF NOT EXISTS __bench_edges (src TEXT, dst TEXT)');
  for (let i = 0; i < 500; i++) {
    db.run('INSERT INTO __bench_edges VALUES (?, ?)', `n${i}`, `n${i+1}`);
  }
  const t2 = performance.now();
  db.get("WITH RECURSIVE walk(n, d) AS (SELECT 'n0', 1 UNION ALL SELECT e.dst, w.d + 1 FROM __bench_edges e JOIN walk w ON e.src = w.n WHERE d < 5) SELECT COUNT(*) as cnt FROM walk");
  const cteMs = performance.now() - t2;

  return {
    available: true,
    oltp_ops_per_ms: Math.round(samples / insertMs),
    olap_ms: Math.round(aggMs * 100) / 100,
    cte_ms: Math.round(cteMs * 100) / 100,
  };
}

function benchmarkDuckDB() {
  const duckdb = require('duckdb');
  const db = new duckdb.Database(':memory:');

  const samples = 20000;
  db.exec('CREATE TABLE bench_olap(agent_id VARCHAR, tokens DOUBLE, cost DOUBLE)');

  const t0 = Date.now();
  for (let i = 0; i < samples; i++) {
    db.exec(`INSERT INTO bench_olap VALUES ('agent_${i % 100}', ${i}, ${i * 0.01})`);
  }
  const insertMs = Date.now() - t0;

  const t1 = Date.now();
  db.all('SELECT agent_id, SUM(tokens), AVG(cost) FROM bench_olap GROUP BY agent_id');
  const aggMs = Date.now() - t1;

  return {
    available: true,
    oltp_ops_per_ms: Math.round(samples / insertMs),
    olap_ms: Math.round(aggMs * 100) / 100,
  };
}

function benchmarkLadybug() {
  const ladybug = require('@ladybugdb/core');
  const db = new ladybug.Database(':memory:');
  db.open();

  const samples = 1000;
  db.executeQuery('CREATE GRAPH bench_graph');
  db.executeQuery('USE bench_graph');
  db.executeQuery('CREATE NODE TABLE Node(id STRING PRIMARY KEY)');

  const t0 = Date.now();
  for (let i = 0; i < samples; i++) {
    db.executeQuery("CREATE (n:Node {id: 'node_" + i + "'})");
  }
  const insertMs = Date.now() - t0;

  return {
    available: true,
    oltp_ops_per_ms: Math.round(samples / insertMs),
  };
}

function evaluateBenchmarks(results) {
  const recommendations = [];
  const engines = results.engines;

  if (engines.sqlite?.available && engines.duckdb?.available) {
    const duckdbAgg = engines.duckdb.olap_ms;
    const sqliteAgg = engines.sqlite.olap_ms;
    if (duckdbAgg > 0) {
      const ratio = sqliteAgg / duckdbAgg;
      if (ratio > 2) {
        recommendations.push({
          capability: 'analytics',
          current: 'sqlite',
          recommended: 'duckdb',
          reason: `DuckDB ${ratio.toFixed(1)}x faster OLAP (${sqliteAgg}ms vs ${duckdbAgg}ms)`,
          confidence: 'high',
          requires_validation: true,
        });
      }
    }
  }

  if (engines.sqlite?.available && engines.ladybug?.available) {
    const ratio = engines.sqlite.cte_ms / Math.max(1, engines.ladybug.oltp_ops_per_ms);
    if (ratio > 2) {
      recommendations.push({
        capability: 'graph',
        current: 'sqlite',
        recommended: 'ladybug',
        reason: 'Ladybug faster for graph traversals',
        confidence: 'medium',
        requires_validation: true,
      });
    }
  }

  return {
    timestamp: results.timestamp,
    results,
    recommendations,
    promoted: [],
  };
}

function saveHistory(entry) {
  const dir = path.dirname(GATE_HISTORY_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(GATE_HISTORY_PATH, JSON.stringify(entry) + '\n');
}

function loadHistory(limit = 100) {
  if (!fs.existsSync(GATE_HISTORY_PATH)) return [];
  const lines = fs.readFileSync(GATE_HISTORY_PATH, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(-limit);
  return lines.map(l => JSON.parse(l));
}

function detectDrift(current, historySize = 5) {
  const history = loadHistory(historySize);
  if (history.length === 0) return [];

  const drift = [];
  for (const [engine, metrics] of Object.entries(current.engines)) {
    if (!metrics.available) continue;
    const prev = history
      .filter(h => h.engines?.[engine]?.available)
      .map(h => h.engines[engine]);
    if (prev.length === 0) continue;

    const avgInsert = prev.reduce((s, p) => s + p.oltp_ops_per_ms, 0) / prev.length;
    if (avgInsert > 0 && metrics.oltp_ops_per_ms < avgInsert * 0.8) {
      drift.push({
        engine,
        metric: 'oltp_ops_per_ms',
        previous_avg: Math.round(avgInsert),
        current: metrics.oltp_ops_per_ms,
        drop_pct: Math.round(100 - 100 * metrics.oltp_ops_per_ms / avgInsert),
      });
    }
  }
  return drift;
}

async function cli() {
  const args = process.argv.slice(2);
  const command = args[0] || 'bench';

  switch (command) {
    case 'bench':
      console.log('🔬 Storage Evolution Gate — benchmarks in progress...');
      const results = await runLocalBenchmarks();
      const evalResult = evaluateBenchmarks(results);
      saveHistory({ ...results, recommendations: evalResult.recommendations });
      const drift = detectDrift(results);
      displayResults(evalResult, drift);
      break;
    case 'history':
      const hist = loadHistory(parseInt(args[1]) || 10);
      console.log('📊 History:', JSON.stringify(hist, null, 2));
      break;
    default:
      console.log('Usage: genos storage gate <bench|history>');
  }
}

function displayResults(evalResult, drift) {
  console.log('\n📊 Results:');
  console.log(`   Platform: ${evalResult.results.platform}`);
  console.log(`   CPUs: ${evalResult.results.cpus}, RAM: ${evalResult.results.memory_gb}GB`);

  for (const [engine, metrics] of Object.entries(evalResult.results.engines)) {
    if (!metrics.available) {
      console.log(`   ${engine}: unavailable (${metrics.error || 'not installed'})`);
      continue;
    }
    console.log(`   ${engine}: ${metrics.oltp_ops_per_ms || '?'} ops/ms (OLTP), ${metrics.olap_ms || '?'}ms (OLAP), ${metrics.cte_ms || '?'}ms (CTE)`);
  }

  if (evalResult.recommendations.length > 0) {
    console.log('\n📈 Recommendations:');
    for (const r of evalResult.recommendations) {
      console.log(`   ${r.capability}: ${r.current} → ${r.recommended} (${r.reason}) [${r.confidence}]`);
    }
  }

  if (drift.length > 0) {
    console.log('\n⚠️ Performance drift:');
    for (const d of drift) {
      console.log(`   ${d.engine}: -${d.drop_pct}% on ${d.metric}`);
    }
  }
}

module.exports = {
  runLocalBenchmarks,
  evaluateBenchmarks,
  detectDrift,
  saveHistory,
  loadHistory,
  cli,
};

if (require.main === module) {
  cli();
}
