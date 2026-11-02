'use strict';

const crypto = require('node:crypto');
const { validateMessage, validateProgram } = require('./contract');
const { immutable } = require('../evidenceProtocol/conversation');
const { digest } = require('../evidenceProtocol/canonical');
const executionJournal = require('../cognitiveOmegaExecutionJournal');
const { ExecutionStore, runKey } = require('./executionStore');
const { RuntimeAdapter } = require('./runtimeAdapter');
const bindings = require('./executionBindings');

function requireCallbacks(options) {
  for (const name of ['authorize', 'resolvePlan', 'describeRuntime', 'currentContext']) {
    if (typeof options[name] !== 'function') throw new Error(`OMEGA ${name} callback required.`);
  }
}

function resultStatus(result) {
  if (result.error === 'EFFECT_OUTCOME_UNKNOWN') return 'effect_outcome_unknown';
  if (result.status === 'blocked') return result.reason === 'operation_failed' ? 'recovery_required' : 'blocked';
  return 'completed';
}

class OmegaExecution {
  constructor(options) {
    requireCallbacks(options);
    this.store = new ExecutionStore(options.dbPath || ':memory:');
    this.authorize = options.authorize;
    this.resolvePlan = options.resolvePlan;
    this.describeRuntime = options.describeRuntime;
    this.currentContext = options.currentContext;
    this.handlers = options.handlers || [];
    this.clock = options.clock || (() => new Date().toISOString());
    this.owner = crypto.randomUUID();
    this.active = new Set();
    this.adapter = new RuntimeAdapter({ store: this.store, handlers: this.handlers, effectGate: options.effectGate });
  }

  state(query) { return this.store.state(query); }
  history() { return this.store.history(); }
  close() { this.store.close(); }

  async authorized(message) {
    if (await this.authorize(immutable(message)) !== true) throw new Error('OMEGA execution authority rejected or revoked.');
  }

  async accepted(message) {
    const accepted = structuredClone(await this.resolvePlan(immutable(bindings.planQuery(message))));
    bindings.validateAccepted(message, accepted);
    validateProgram(accepted.program);
    if (digest(accepted.context) !== accepted.plan.contextDigest) throw new Error('OMEGA accepted context digest mismatch.');
    return immutable(accepted);
  }

  async fresh(message, accepted) {
    await this.authorized(message);
    validateMessage(message, { now: this.clock() });
    const current = await this.currentContext(immutable({ message, plan: accepted.plan }));
    bindings.freshContext(accepted, current);
    const available = await this.describeRuntime(immutable({ message, stage: 'EXECUTE' }));
    bindings.capabilities(accepted, available, this.handlers);
    const effects = accepted.program.operations.some((operation) => ['CALL', 'EMIT'].includes(operation.kind));
    if (effects && typeof this.adapter.effectGate?.effect !== 'function') throw new Error('OMEGA effect gate missing.');
    if (digest((await this.resolvePlan(immutable(bindings.planQuery(message))))) !== digest(accepted)) {
      throw new Error('OMEGA accepted plan changed during execution.');
    }
    bindings.freshContext(accepted, await this.currentContext(immutable({ message, plan: accepted.plan })));
    bindings.capabilities(accepted, await this.describeRuntime(immutable({ message, stage: 'EXECUTE' })), this.handlers);
    await this.authorized(message);
    validateMessage(message, { now: this.clock() });
  }

  async report(binding) {
    const rows = this.store.db.prepare('SELECT operation_id,status,result_json FROM cognitive_omega_operations WHERE run_id = ?')
      .all(runKey(binding));
    const observed = new Map(rows.map((row) => [row.operation_id, row]));
    const operations = binding.plan.obligations.map((obligation) => {
      const row = observed.get(obligation.operationId);
      const result = row?.result_json ? JSON.parse(row.result_json) : null;
      const observation = this.observation(binding, obligation, row);
      return { ...obligation, executionStatus: row?.status || 'not_started',
        outcome: observation.outcome || result?.operationResult?.status || null,
        receiptDigest: observation.receiptDigest || (result?.receipt ? digest(result.receipt) : null) };
    });
    const state = this.state(binding);
    let status = state?.status || 'not_started';
    if (operations.some((operation) => operation.outcome === 'effect_outcome_unknown')) status = 'effect_outcome_unknown';
    if (operations.some((operation) => operation.outcome === 'inference_outcome_unknown')) status = 'inference_outcome_unknown';
    return { runId: binding.runId, planId: binding.planId, planDigest: binding.planDigest, status, obligations: operations };
  }

  observation(binding, obligation, row) {
    const effect = ['CALL', 'EMIT'].includes(obligation.kind) ? this.store.effect(binding, obligation.operationId) : null;
    if (row?.status === 'completed' && effect?.receipt) return { receiptDigest: effect.receipt.receiptDigest };
    if (row?.status !== 'running') return {};
    if (obligation.kind === 'INFER') return { outcome: 'inference_outcome_unknown' };
    if (!['CALL', 'EMIT'].includes(obligation.kind)) return {};
    if (!effect) return {};
    return effect.receipt ? { outcome: 'effect_completed_journal_pending', receiptDigest: effect.receipt.receiptDigest }
      : { outcome: 'effect_outcome_unknown' };
  }

  unsafeInference(binding) {
    const rows = this.store.db.prepare("SELECT operation_id FROM cognitive_omega_operations WHERE run_id = ? AND status = 'running'")
      .all(runKey(binding));
    return rows.some((row) => binding.plan.obligations.find((item) => item.operationId === row.operation_id)?.kind === 'INFER');
  }

  async apply(input) {
    const message = validateMessage(input, { now: this.clock() });
    if (!['EXECUTE', 'RESUME', 'REPORT_OBLIGATIONS'].includes(message.type)) throw new Error('OMEGA execution message unsupported.');
    const accepted = await this.accepted(message);
    await this.fresh(message, accepted);
    await executionJournal.ensureSchema(this.store.journal);
    const binding = bindings.binding(message, accepted);
    const existing = this.state(binding);
    if (existing && !bindings.same(existing.binding, binding)) throw new Error('OMEGA run binding conflict.');
    const replay = this.store.replay(message);
    if (replay) return replay;
    if (message.type === 'REPORT_OBLIGATIONS') return this.store.record(message, await this.report(binding));
    return this.execute(message, accepted, binding);
  }

  async execute(message, accepted, binding) {
    const key = runKey(binding);
    if (this.active.has(key)) throw new Error('OMEGA execution already active.');
    if (this.unsafeInference(binding)) throw new Error('INFERENCE_OUTCOME_UNKNOWN; trusted recovery required.');
    const prior = this.store.begin(binding, { owner: this.owner, type: message.type });
    if (['completed', 'blocked'].includes(prior.status)) return this.store.record(message, prior.result);
    this.active.add(key);
    try {
      const guard = async () => {
        this.store.owned(binding, this.owner);
        await this.fresh(message, accepted);
        this.store.owned(binding, this.owner);
      };
      const result = await this.adapter.execute({ message, accepted, binding, owner: this.owner, guard });
      await guard();
      const status = resultStatus(result);
      const output = { status, runId: binding.runId, planId: binding.planId, planDigest: binding.planDigest,
        runtimeResult: result, obligations: (await this.report(binding)).obligations };
      this.store.finish(binding, { owner: this.owner, status, result: output });
      return this.store.record(message, output);
    } finally { this.active.delete(key); }
  }
}

module.exports = { OmegaExecution };
