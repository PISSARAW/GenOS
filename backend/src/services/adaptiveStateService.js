'use strict';

const TABLE = 'adaptive_state';
const EVENTS_TABLE = 'adaptive_state_events';

function serializeState(mapOrObject) {
  if (mapOrObject instanceof Map) {
    const entries = [];
    for (const [k, v] of mapOrObject.entries()) {
      entries.push([String(k), v]);
    }
    return JSON.stringify(entries, null, 0);
  }
  if (Array.isArray(mapOrObject)) {
    return JSON.stringify(mapOrObject, null, 0);
  }
  return JSON.stringify(mapOrObject, null, 0);
}

function restoreMapFromJson(payloadJson) {
  if (!payloadJson) return new Map();
  try {
    const parsed = JSON.parse(payloadJson);
    const map = new Map();
    if (Array.isArray(parsed)) {
      for (const [k, v] of parsed) {
        if (k !== undefined && k !== null) map.set(String(k), v);
      }
    } else if (parsed && typeof parsed === 'object') {
      for (const k of Object.keys(parsed)) {
        map.set(k, parsed[k]);
      }
    }
    return map;
  } catch (e) {
    return new Map();
  }
}

function restoreObjectFromJson(payloadJson) {
  if (!payloadJson) return {};
  try {
    return JSON.parse(payloadJson);
  } catch (e) {
    return {};
  }
}

async function loadMap(db, scope, key) {
  const row = await db.get(
    `SELECT payload_json FROM ${TABLE} WHERE scope = ? AND key = ?`, scope, key
  );
  if (!row) return new Map();
  return restoreMapFromJson(row.payload_json);
}

async function saveMap(db, { scope, key, map, version }) {
  const payload = serializeState(map);
  await db.run(
    `INSERT OR REPLACE INTO ${TABLE} (scope, key, payload_json, version, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    scope, key, payload, version || 1
  );
}

async function loadObject(db, scope, key) {
  const row = await db.get(
    `SELECT payload_json FROM ${TABLE} WHERE scope = ? AND key = ?`, scope, key
  );
  if (!row) return null;
  return restoreObjectFromJson(row.payload_json);
}

async function saveObject(db, { scope, key, obj, version }) {
  const payload = serializeState(obj);
  await db.run(
    `INSERT OR REPLACE INTO ${TABLE} (scope, key, payload_json, version, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    scope, key, payload, version || 1
  );
}

async function appendEvent(db, { scope, key, eventType, eventPayload }) {
  await db.run(
    `INSERT INTO ${EVENTS_TABLE} (scope, key, event_type, event_payload, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    scope, key, eventType, serializeState(eventPayload)
  );
}

class AdaptiveStateService {
  constructor(db) {
    this.db = db;
  }

  // ── Génériques ────────────────────────────────────────────────────────────

  async persistMap(scope, key, map, version) {
    await saveMap(this.db, { scope, key, map, version });
    await appendEvent(this.db, { scope, key, eventType: 'persist_map', eventPayload: {
      keys: Array.from(map.keys()),
      size: map.size
    } });
  }

  async restoreMap(scope, key) {
    return loadMap(this.db, scope, key);
  }

  async persistObject(scope, key, obj, version) {
    await saveObject(this.db, { scope, key, obj, version });
    await appendEvent(this.db, { scope, key, eventType: 'persist_object', eventPayload: {
      keys: Object.keys(obj)
    } });
  }

  async restoreObject(scope, key) {
    return loadObject(this.db, scope, key);
  }

  // ── Map proxy auto-persistant ─────────────────────────────────────────────

  /**
   * Retourne un Proxy sur la Map `initial` : chaque mutation
   * (set/delete/clear) est persistée de manière best-effort vers
   * `scope`/`key` si `this.db` est configuré.
   */
  makePersistentMap(scope, key, initial) {
    const map = new Map(initial);
    const db = this.db;
    if (!db) return map;

    const persist = (verb, args) => {
      const snapshot = new Map(map);
      saveMap(db, { scope, key, map: snapshot }).catch(() => {});
      appendEvent(db, { scope, key, eventType: `mutate::${verb}`, eventPayload: {
        verb,
        args: Array.from(args).slice(0, 4).map(a =>
          (a instanceof Map || a instanceof Set) ? '[complex]' : a
        )
      } }).catch(() => {});
    };

    return new Proxy(map, {
      get(target, prop) {
        const val = target[prop];
        if (typeof val === 'function') {
          if (prop === 'set') {
            return function (...args) {
              const r = Reflect.apply(val, target, args);
              persist('set', args).catch(() => {});
              return r;
            };
          }
          if (prop === 'delete') {
            return function (...args) {
              const r = Reflect.apply(val, target, args);
              persist('delete', args).catch(() => {});
              return r;
            };
          }
          if (prop === 'clear') {
            return function (...args) {
              const r = Reflect.apply(val, target, args);
              persist('clear', args).catch(() => {});
              return r;
            };
          }
          if (prop === 'updateFrom' && typeof val === 'function') {
            return function (data) {
              if (Array.isArray(data)) {
                for (const row of data) {
                  if (row && row.key !== undefined) target.set(String(row.key), row);
                  }
                } else if (data && typeof data === 'object') {
                  for (const k of Object.keys(data)) target.set(k, data[k]);
                }
              persist('updateFrom', [data]).catch(() => {});
              return target;
            };
          }
        }
        return val;
      }
    });
  }

  // ── Mutation hooks pour objets non-Map (neuroplastie, etc.) ───────────────

  /** Registre des hooks d'objet par scope, selon le pattern legacy. */
  static objectMutationHooks = new Map();

  /**
   * Enregistre un hook de persistance pour un objet mutable exporté par un
   * module. `getSnapshot` retourne l'objet à persister ; `onMutation` est
   * appelé après chaque flush réussi.
   */
  static installObjectHook(moduleExports, scope, key, getSnapshot, onMutation) {
    if (!getSnapshot || !onMutation) return;
    if (!AdaptiveStateService.objectMutationHooks.has(scope)) {
      AdaptiveStateService.objectMutationHooks.set(scope, new Map());
    }
    AdaptiveStateService.objectMutationHooks.get(scope).set(key, {
      getSnapshot, onMutation, scope, key
    });
  }

  /**
   * Notifie tous les hooks d'un scope donné. Appelé depuis les modules qui
   * persistants leur état objet après mutation.
   */
  async flushObjectHooks(scope) {
    const handlers = AdaptiveStateService.objectMutationHooks.get(scope);
    if (!handlers || !this.db) return;
    for (const [key, { getSnapshot, onMutation }] of handlers.entries()) {
      try {
        const snap = getSnapshot();
        await saveObject(this.db, { scope, key, obj: snap });
        await appendEvent(this.db, { scope, key, eventType: 'object_mutated', eventPayload: {
          keys: Object.keys(snap)
        } });
        if (onMutation) onMutation(snap);
      } catch (_) {}
    }
  }

  // ── Ganglia (Q-values, attractions, feedback) ─────────────────────────────

  async getDopamineState(ctxId) {
    const map = await loadMap(this.db, 'ganglia', ctxId);
    let baseline = 1.0;
    const baselineRow = await this.db.get(
      `SELECT payload_json FROM ${TABLE} WHERE scope = ? AND key = ?`,
      'ganglia', `${ctxId}::baseline`
    );
    if (baselineRow) {
      try {
        baseline = Number(JSON.parse(baselineRow.payload_json).baseline) || 1.0;
      } catch (_) { /* keep default */ }
    }
    const history = [];
    const historyRow = await this.db.get(
      `SELECT payload_json FROM ${TABLE} WHERE scope = ? AND key = ?`,
      'ganglia', `${ctxId}::history`
    );
    if (historyRow) {
      try {
        const parsed = JSON.parse(historyRow.payload_json);
        if (Array.isArray(parsed)) history.push(...parsed);
      } catch (_) { /* keep empty */ }
    }
    return {
      ctxId,
      valeurs_attendues: map,
      historique: history,
      baseline_attraction: baseline
    };
  }

  async setDopamineState(ctxId, state) {
    const valeurs = state.valeurs_attendues || new Map();
    const history = Array.isArray(state.historique) ? state.historique : [];
    await this.persistMap('ganglia', ctxId, valeurs);
    await this.persistMap('ganglia', `${ctxId}::history`, history);
    await this.persistObject('ganglia', `${ctxId}::baseline`, {
      baseline: state.baseline_attraction || 1.0
    });
    await appendEvent(this.db, { scope: 'ganglia', key: ctxId, eventType: 'state_next', eventPayload: {
      keys: Array.from(valeurs.keys()),
      historyLength: history.length
    } });
  }

  // ── Foraging / Stigmergie ─────────────────────────────────────────────────

  async getForagingPheromones() {
    const map = await loadMap(this.db, 'foraging', 'pheromones');
    return map;
  }

  async setForagingPheromones(pheromoneMap) {
    await this.persistMap('foraging', 'pheromones', pheromoneMap);
    await appendEvent(this.db, { scope: 'foraging', key: 'pheromones', eventType: 'ledger_snapshot', eventPayload: {
      count: pheromoneMap.size
    } });
  }

  // ── Axolotl Topology Modes ────────────────────────────────────────────────

  async getTopologyModes() {
    const map = await loadMap(this.db, 'axolotl_topology', 'modes');
    return map;
  }

  async setTopologyModes(modesMap) {
    await this.persistMap('axolotl_topology', 'modes', modesMap);
    await appendEvent(this.db, { scope: 'axolotl_topology', key: 'modes', eventType: 'topology_modes_saved', eventPayload: {
      count: modesMap.size
    } });
  }

  // ── Axolotl Regeneration Sessions ─────────────────────────────────────────

  async getRegenerationSessions() {
    const map = await loadMap(this.db, 'axolotl_regeneration', 'sessions');
    return map;
  }

  async setRegenerationSessions(sessionsMap) {
    await this.persistMap('axolotl_regeneration', 'sessions', sessionsMap);
    await appendEvent(this.db, { scope: 'axolotl_regeneration', key: 'sessions', eventType: 'sessions_saved', eventPayload: {
      count: sessionsMap.size
    } });
  }

  // ── MCP Biomimétiques Registries ──────────────────────────────────────────

  async getMcpBiomimicryRegistry(scope, key) {
    const map = await loadMap(this.db, `mcp_bio::${scope}`, key);
    return map;
  }

  async setMcpBiomimicryRegistry(scope, key, map) {
    await this.persistMap(`mcp_bio::${scope}`, key, map);
  }

  // ── Boot / Resume ─────────────────────────────────────────────────────────

  async resumeGangliaFromStorage() {
    if (!this.db) return;
    try {
      const rows = await this.db.all(
        `SELECT scope, key, payload_json FROM ${TABLE} WHERE scope = 'ganglia' ORDER BY key`
      );
      for (const row of rows) {
        if (row.key.endsWith('::baseline') || row.key.endsWith('::history')) continue;
        const map = restoreMapFromJson(row.payload_json);
        legacyDopamineState.set(row.key, {
          ctxId: row.key,
          valeurs_attendues: map,
          historique: [],
          baseline_attraction: 1.0,
          restoredFromStorage: true
        });
      }
      // Rebuild baselines + historiques si présents
      for (const row of rows) {
        if (row.key.endsWith('::baseline')) {
          const obj = restoreObjectFromJson(row.payload_json);
          for (const [ctxId, dState] of legacyDopamineState.entries()) {
            if (ctxId === row.key.replace('::baseline', '')) {
              dState.baseline_attraction = Number(obj.baseline) || 1.0;
            }
          }
        }
        if (row.key.endsWith('::history')) {
          const parsed = restoreMapFromJson(row.payload_json);
          const ctxId = row.key.replace('::history', '');
          const dState = legacyDopamineState.get(ctxId);
          if (dState && parsed instanceof Map) {
            dState.historique = Array.from(parsed.values());
          }
        }
      }
    } catch (_) { /* storage resume is best-effort */ }
  }
}

// État legacy en mémoire (fallback quand persister non initialisé)
const legacyDopamineState = new Map();

module.exports = {
  AdaptiveStateService,
  serializeState,
  restoreMapFromJson,
  restoreObjectFromJson
};
