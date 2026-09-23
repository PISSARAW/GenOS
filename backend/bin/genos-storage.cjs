'use strict';

/**
 * GenOS Storage CLI — doctor, status, rebuild, verify, compact.
 *
 * Usage:
 *   node bin/genos-storage.cjs doctor
 *   node bin/genos-storage.cjs status
 *   node bin/genos-storage.cjs rebuild graph
 *   node bin/genos-storage.cjs rebuild analytics
 *   node bin/genos-storage.cjs rebuild search
 *   node bin/genos-storage.cjs verify
 *   node bin/genos-storage.cjs compact
 */

const { getDatabase, closeDatabase } = require('../src/db');
const { getProjectionStatus } = require('../src/storage/projection/projectionOutbox');
const { StorageCapabilityRegistry } = require('../src/storage/capabilityRegistry');
const { StorageQueryPlanner } = require('../src/storage/query/storageQueryPlanner');

async function doctor() {
  const planner = new StorageQueryPlanner();
  await planner.init();
  const registry = planner.registry;
  const status = await getProjectionStatus();
  const all = registry.getAll();
  console.log('=== GenOS Storage Doctor ===');
  console.log('');
  console.log('Capabilities:');
  for (const [name, cap] of Object.entries(all)) {
    console.log(`  ${name}: provider=${cap.provider} available=${cap.available} degraded=${cap.degraded}`);
  }
  console.log('');
  console.log('Projection Status:');
  console.log(`  Total events: ${status.totalEvents}`);
  console.log(`  Unconsumed (graph): ${status.unconsumedGraph}`);
  console.log(`  Unconsumed (analytics): ${status.unconsumedAnalytics}`);
  console.log(`  Unconsumed (search): ${status.unconsumedSearch}`);
  console.log(`  Unresolved failures: ${status.unresolvedFailures}`);
  if (status.consumers.length) {
    console.log('  Consumers:');
    for (const c of status.consumers) {
      console.log(`    ${c.consumer_name}: last_sequence=${c.last_sequence}`);
    }
  }
  const issues = [];
  for (const [name, cap] of Object.entries(all)) {
    if (cap.degraded) issues.push(`${name} capability degraded (${cap.provider})`);
  }
  if (status.unresolvedFailures > 0) issues.push(`${status.unresolvedFailures} unresolved projection failures`);
  console.log('');
  if (issues.length) {
    console.log('Issues:');
    for (const issue of issues) console.log(`  ⚠ ${issue}`);
  } else {
    console.log('All systems nominal.');
  }
  await closeDatabase();
}

async function status() {
  const planner = new StorageQueryPlanner();
  await planner.init();
  const registry = planner.registry;
  const all = registry.getAll();
  const status = await getProjectionStatus();
  console.log(JSON.stringify({ capabilities: all, projections: status }, null, 2));
  await closeDatabase();
}

async function rebuild(target) {
  if (!target) {
    console.error('Usage: genos-storage rebuild <graph|analytics|search|all>');
    process.exit(1);
  }
  if (target === 'graph' || target === 'all') {
    console.log('Rebuilding graph projection...');
    const { GraphProjector } = require('../src/storage/projection/graphProjector');
    const db = await getDatabase();
    const projector = new GraphProjector(db);
    await projector.init();
    const graphResult = await projector.rebuild();
    console.log(`Graph projection rebuilt: ${JSON.stringify(graphResult.counts)} checksum=${graphResult.checksum}`);
  }
  if (target === 'analytics' || target === 'all') {
    console.log('Rebuilding analytics projection...');
    const { AnalyticsProjector } = require('../src/storage/projection/analyticsProjector');
    const db = await getDatabase();
    const analyticsProjector = new AnalyticsProjector(db);
    await analyticsProjector.init();
    const analyticsResult = await analyticsProjector.rebuild();
    console.log(`Analytics projection rebuilt: ${JSON.stringify(analyticsResult.datasets)} checksum=${analyticsResult.checksum}`);
  }
  if (target === 'search' || target === 'all') {
    console.log('Rebuilding search projection...');
    const { SearchProjector } = require('../src/storage/projection/searchProjector');
    const db = await getDatabase();
    const searchProjector = new SearchProjector(db);
    await searchProjector.init();
    const searchResult = await searchProjector.rebuild();
    console.log(`Search projection rebuilt: ${JSON.stringify(searchResult.counts)} checksum=${searchResult.checksum}`);
  }
  await closeDatabase();
}

async function verify() {
  const db = await getDatabase();
  const status = await getProjectionStatus();
  console.log('=== GenOS Storage Verify ===');
  console.log(`Projection events: ${status.totalEvents}`);
  console.log(`Unconsumed graph events: ${status.unconsumedGraph}`);
  console.log(`Unconsumed analytics events: ${status.unconsumedAnalytics}`);
  console.log(`Unconsumed search events: ${status.unconsumedSearch}`);
  console.log(`Unresolved failures: ${status.unresolvedFailures}`);
  const integrity = await db.get('PRAGMA integrity_check');
  console.log(`SQLite integrity: ${integrity ? integrity.integrity_check : 'unknown'}`);
  await closeDatabase();
}

async function compact() {
  const db = await getDatabase();
  console.log('Running VACUUM...');
  await db.exec('VACUUM');
  console.log('Running ANALYZE...');
  await db.exec('ANALYZE');
  console.log('Compaction complete.');
  await closeDatabase();
}

async function main() {
  const [command, arg] = process.argv.slice(2);
  switch (command) {
    case 'doctor': await doctor(); break;
    case 'status': await status(); break;
    case 'rebuild': await rebuild(arg); break;
    case 'verify': await verify(); break;
    case 'compact': await compact(); break;
    default:
      console.log('Usage: genos-storage <doctor|status|rebuild|verify|compact> [target]');
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
