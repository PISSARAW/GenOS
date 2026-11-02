'use strict';

const Database = require('better-sqlite3');
const { migrateAdaptiveState } = require('../../src/db/migrations/migrateAdaptiveState');
const persistence = require('../../src/services/agow/agowStatePersistenceService');
const scopeService = require('../../src/services/agow/allostaticScopeService');
const candidateAdapter = require('../../src/services/agow/candidates/candidateAdapterService');
const { createStateQualifier } = require('../../src/services/allostasisProtocol/qualification');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const fixture = require('./allostasisContractFixture');

const values = args => args.length === 1 && Array.isArray(args[0]) ? args[0] : args;

function database(filename = ':memory:') {
  const raw = new Database(filename);
  return { raw, db: { exec: async sql => raw.exec(sql),
    get: async (sql, ...args) => raw.prepare(sql).get(...values(args)),
    all: async (sql, ...args) => raw.prepare(sql).all(...values(args)),
    run: async (sql, ...args) => raw.prepare(sql).run(...values(args)) } };
}

function configuration(db, overrides = {}) {
  const sourceAgentId = overrides.sourceAgentId || 'client-a';
  return { db, sourceAgentId, scope: fixture.SCOPE, missionId: 'mission-1', maxAgeMs: 60000,
    subjectBindings: { agent: sourceAgentId, topology: 'topology-1', mission: 'mission-1', organization: fixture.SCOPE.organizationId },
    metricBindings: Object.keys(scopeService.SCOPES).map(level => ({ metricId: 'energy', level, field: 'energy', unit: 'ratio_ppm', kind: 'ratio' })),
    clock: () => fixture.NOW, ...overrides };
}

function buildCandidate(sourceAgentId = 'client-a', now = Date.parse(fixture.NOW)) {
  return candidateAdapter.build({ agentId: sourceAgentId, module: 'interoception', now,
    observation: { candidateId: 'native-forecast-1', confidence: 0.8, causalEvidence: true,
      evidenceRefs: ['fixture:declared-native-prediction'], ttlMs: 60000,
      epistemicContext: { viabilityForecast: { horizonCycles: 3, confidence: 0.8,
        attend: { goalProgress: 0.8, resourceReserve: 0.7, blockageRisk: 0.1, stability: 0.8 },
        ignore: { goalProgress: 0.2, resourceReserve: 0.3, blockageRisk: 0.7, stability: 0.3 } } } } });
}

async function seedNative(db, config, options = {}) {
  await migrateAdaptiveState(db);
  const measuredAt = options.measuredAt ?? Date.parse(fixture.NOW);
  for (const [level, scope] of Object.entries(scopeService.SCOPES)) {
    await persistence.save({ db, scope, agentId: config.sourceAgentId,
      state: { variables: { energy: options.energy ?? 0.75 }, measuredAt,
        evidenceRefs: [`fixture:persisted-state:${config.sourceAgentId}:${level}`] } });
  }
  const candidate = buildCandidate(config.sourceAgentId, measuredAt);
  await persistence.save({ db, scope: 'allostasis_protocol_forecasts', agentId: `${config.sourceAgentId}/${candidate.candidateId}`, state: candidate });
  return candidate;
}

function candidateReader(db, config) {
  return async query => {
    if (digest(query.scope) !== digest(config.scope) || query.missionId !== config.missionId || query.sourceAgentId !== config.sourceAgentId) {
      throw new Error('Fixture native source is pinned to another scope or agent.');
    }
    return (await persistence.load({ db, scope: 'allostasis_protocol_forecasts', agentId: `${config.sourceAgentId}/${query.candidateId}` })).state;
  };
}

async function setup(options = {}) {
  const storage = database(options.dbPath);
  const config = configuration(storage.db, options.config);
  const candidate = await seedNative(storage.db, config, options.seed);
  const qualifier = createStateQualifier({ ...config, loadCandidate: candidateReader(storage.db, config), ...options.qualifier });
  return { ...storage, config, candidate, qualifier, close: () => storage.raw.close() };
}

module.exports = { ...fixture, database, configuration, buildCandidate, seedNative, candidateReader, setup };
