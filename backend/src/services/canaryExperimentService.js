'use strict';

/**
 * Expérience canari gelée (protocole → réplication → gate).
 *
 * freezeExperiment : fige un protocole (splits train/dev/reserved sur les
 * rowids de usage_ledger, seeds, critère MAE ≤ seuil) avec manifest SHA,
 * persisté en adaptive_state scope 'canary_experiment'.
 * runExperiment : vérifie le manifest, rejoue la calibration sur reserved
 * en deux moitiés (réplication), passe si MAE global ET deux moitiés sous
 * seuil. Le résultat alimente canaryAllowed() : un échec ferme le canari
 * (chooseWithGuardrails retombe en politique). Best-effort partout.
 */

const { AdaptiveStateService } = require('./adaptiveStateService');
const bandit = require('./routingBanditService');
const validation = require('./validationProtocolService');

const SCOPE = 'canary_experiment';
const KEY = 'current';
const HYPOTHESIS = 'canary routing calibration holds on unseen logged decisions';
const DEFAULT_THRESHOLD = 0.25;

async function ledgerIds(db, limit) {
  const rows = await db.all(`SELECT id FROM usage_ledger ORDER BY rowid DESC LIMIT ?`, limit);
  return (Array.isArray(rows) ? rows : []).map((row) => ({ id: String(row.id) })).reverse();
}

async function freezeExperiment(db, options) {
  const settings = options || {};
  if (!db) throw new Error('freezeExperiment requires db');
  const limit = Math.max(30, Math.min(500, Math.floor(Number(settings.limit) || 200)));
  const ids = await ledgerIds(db, limit);
  if (ids.length < 30) throw new Error('freezeExperiment requires at least 30 logged decisions');
  const train = ids.slice(0, Math.floor(ids.length * 0.6)).map((item) => ({ id: item.id }));
  const dev = ids.slice(Math.floor(ids.length * 0.6), Math.floor(ids.length * 0.7)).map((item) => ({ id: item.id }));
  const reserved = ids.slice(Math.floor(ids.length * 0.7)).map((item) => ({ id: item.id }));
  const threshold = Number(settings.threshold);
  const protocol = validation.createValidationProtocol({
    protocolId: 'bandit-canary-v1',
    revision: '1',
    hypothesis: HYPOTHESIS,
    corpus: { train, dev, reserved },
    seeds: [11, 22],
    criteria: { primaryMetric: 'calibration-mae', direction: 'lower', threshold: Number.isFinite(threshold) && threshold >= 0 ? threshold : DEFAULT_THRESHOLD }
  });
  const record = { protocol, manifestHash: protocol.manifestHash, threshold: protocol.criteria.threshold, decidedAt: new Date().toISOString(), lastResult: null };
  await new AdaptiveStateService(db).persistObject(SCOPE, settings.key || KEY, record, 1);
  return record;
}

async function rowsByIds(db, ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.all(`SELECT id, metadata_json FROM usage_ledger WHERE id IN (${placeholders})`, ...ids);
  return (Array.isArray(rows) ? rows : []).map(bandit.parseUsageRow).filter(Boolean);
}

async function loadCanaryRecord(db, settings) {
  const store = new AdaptiveStateService(db);
  const record = (await store.restoreObject(SCOPE, settings.key || KEY)) || {};
  return { store, record };
}

async function fetchCanaryDatasets(db, record) {
  const reservedIds = (record.protocol.corpus?.reserved || []).map((item) => item.id);
  const trainIds = (record.protocol.corpus?.train || []).map((item) => item.id);
  const train = await rowsByIds(db, trainIds);
  const reserved = await rowsByIds(db, reservedIds);
  return { train, reserved };
}

async function finalizeCanaryRun({ store, settings, record, result }) {
  await store.persistObject(SCOPE, settings.key || KEY, { ...record, lastResult: result }, 2);
  return result;
}

async function runExperiment(db, options) {
  const settings = options || {};
  if (!db) return { passed: false, reason: 'missing db' };
  let record = null;
  try {
    const loaded = await loadCanaryRecord(db, settings);
    record = loaded.record;
    if (!record.protocol) return { passed: false, reason: 'no frozen experiment' };
    validation.verifyManifest(record.protocol, record.manifestHash);
    const datasets = await fetchCanaryDatasets(db, record);
    if (datasets.train.length < 10 || datasets.reserved.length < 4) return { passed: false, reason: 'insufficient_data' };
    const result = scoreCanaryReplicas(datasets.train, datasets.reserved, record);
    return await finalizeCanaryRun({ store: loaded.store, settings, record, result });
  } catch (error) {
    await persistCanaryFailure(db, { settings, record, error });
    return runExperimentResult(error);
  }
}

module.exports = { freezeExperiment, runExperiment };

function runExperimentValues({ store, settings, record, error }) {
  return store.persistObject(SCOPE, settings.key || KEY, { ...record, lastResult: { passed: false, reason: error?.code || 'unavailable', at: new Date().toISOString() } }, 2);
}

function runExperimentResult(error) {
  return { passed: false, reason: error?.code || error?.message || 'unavailable' };
}

function runExperimentCondition(overall, first, second) {
  return !overall || !first || !second;
}

function scoreCanaryReplicas(train, reserved, record) {
const overall = bandit.scoreCalibration(train, reserved);
    const half = Math.floor(reserved.length / 2);
    const first = bandit.scoreCalibration(train, reserved.slice(0, half));
    const second = bandit.scoreCalibration(train, reserved.slice(half));
    if (runExperimentCondition(overall, first, second)) return { passed: false, reason: 'no overlapping arms' };
    const replicated = first.mae <= record.threshold && second.mae <= record.threshold;
    const passed = overall.mae <= record.threshold && replicated;
    const result = { passed, mae: overall.mae, halves: [first.mae, second.mae], replicated, threshold: record.threshold, at: new Date().toISOString(), manifestHash: record.manifestHash };
return result;
}

async function persistCanaryFailure(db, { settings, record, error }) {
    try {
      if (record) {
        const store = new AdaptiveStateService(db);
        await runExperimentValues({ store, settings, record, error });
      }
    } catch (_) {}
}
