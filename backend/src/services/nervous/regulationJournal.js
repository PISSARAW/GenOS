'use strict';

const { JOURNAL_SCHEMA } = require('./regulationSchema');
const { scopeOf } = require('./contract');

class RegulationJournal {
  constructor(store) { this.store = store; this.db = store.db; }

  async initialize() {
    await this.store.serial(() => this.db.exec(JOURNAL_SCHEMA));
    return this;
  }

  append(sample, policy) {
    return this.store.serial(() => this.store.transaction(async () => {
      const prior = await this.db.all(`SELECT body_json FROM nervous_garage_samples
        WHERE organization_id=? AND project_id=? AND manager_id=? ORDER BY sequence DESC LIMIT 2`,
      sample.scope.organizationId, sample.scope.projectId, sample.managerId);
      const recent = prior.map(row => JSON.parse(row.body_json));
      if (recent[0] && sample.observedAt - recent[0].observedAt < 1000) return false;
      const count = await this.db.get('SELECT count(*) AS n FROM nervous_garage_samples');
      if (count.n >= 100000) throw new Error('GNS_SAMPLE_CAPACITY');
      sample.forecast = policy ? require('./regulationForecast').forecast([sample, ...recent], policy) : null;
      sample.regulationPolicy = policy ? { version: policy.version, highThreshold: policy.highThreshold } : null;
      await this.db.run(`INSERT INTO nervous_garage_samples
        (id,organization_id,project_id,manager_id,observed_at,body_json) VALUES(?,?,?,?,?,?)`,
      sample.id, sample.scope.organizationId, sample.scope.projectId, sample.managerId,
      sample.observedAt, JSON.stringify(sample));
      return sample;
    }));
  }

  samples(scope, managerId) {
    const s = scopeOf(scope);
    return this.store.serial(async () => {
      const rows = await this.db.all(`SELECT body_json FROM nervous_garage_samples
        WHERE organization_id=? AND project_id=? AND manager_id=? ORDER BY sequence DESC LIMIT 100`,
      s.organizationId, s.projectId, managerId);
      return rows.map(row => JSON.parse(row.body_json));
    });
  }

  pending(scope, managerId) {
    const s = scopeOf(scope);
    return this.store.serial(() => this.db.all(`SELECT body_json FROM nervous_garage_samples
      WHERE organization_id=? AND project_id=? AND manager_id=? AND signal_id IS NULL
      ORDER BY sequence LIMIT 10`, s.organizationId, s.projectId, managerId));
  }

  processed(sampleId, signalId) {
    return this.store.serial(() => this.db.run(`UPDATE nervous_garage_samples SET signal_id=?
      WHERE id=? AND signal_id IS NULL`, signalId, sampleId));
  }

  prepare(input) {
    const s = scopeOf(input.policy.scope);
    return this.store.serial(() => this.store.transaction(async () => {
      const active = await this.db.get(`SELECT effect_id FROM nervous_regulation_episodes
        WHERE organization_id=? AND project_id=? AND manager_id=?
        AND status IN ('PREPARED','EXECUTED_UNVERIFIED','UNCERTAIN') LIMIT 1`,
      s.organizationId, s.projectId, input.policy.managerId);
      if (active) return false;
      const result = await this.db.run(`INSERT OR IGNORE INTO nervous_regulation_episodes
        (effect_id,organization_id,project_id,manager_id,status,body_json,updated_at)
        VALUES(?,?,?,?,'PREPARED',?,?)`, input.effectId, s.organizationId, s.projectId,
      input.policy.managerId, JSON.stringify(input), Date.now());
      return result.changes === 1;
    }));
  }

  episodes(scope, managerId) {
    const s = scopeOf(scope);
    return this.store.serial(() => this.db.all(`SELECT * FROM nervous_regulation_episodes
      WHERE organization_id=? AND project_id=? AND manager_id=? ORDER BY rowid DESC LIMIT 100`,
    s.organizationId, s.projectId, managerId));
  }

  verdict(effectId, outcome) {
    return this.store.serial(() => this.db.run(`UPDATE nervous_regulation_episodes
      SET status=?,verdict_json=?,updated_at=? WHERE effect_id=?
      AND status IN ('PREPARED','EXECUTED_UNVERIFIED','UNCERTAIN')`,
    outcome.status, JSON.stringify(outcome), Date.now(), effectId));
  }

  noteDenial(effectId) {
    return this.store.serial(() => this.db.run(`UPDATE nervous_regulation_episodes
      SET denied_count=denied_count+1 WHERE effect_id=?`, effectId));
  }

  reconcileEffect(effectId) {
    return this.store.serial(() => this.db.run(`UPDATE nervous_effects
      SET status='EXECUTED_UNVERIFIED',outcome=? WHERE id=? AND status IN ('CLAIMED','UNCERTAIN')`,
    JSON.stringify({ status: 'EXECUTED_UNVERIFIED', reconciledFrom: 'persisted_admission_hold' }), effectId));
  }
}

module.exports = { RegulationJournal };
