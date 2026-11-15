'use strict';

function genosFullRule1(context) {
  return { ...context.process.env, GENOS_DEFAULT_MODEL: `ollama://${context.state.model}`,
    GENOS_AGENT_EXECUTOR: '', GENOS_LOCAL_MODEL: context.state.model,
    GENOS_GVX_LEDGER_HMAC_SECRET: context.process.env.GENOS_GVX_LEDGER_HMAC_SECRET
      || context.require('crypto').randomBytes(32).toString('hex'),
    GENOS_TOOL_MEMBRANE_HMAC_SECRET: context.process.env.GENOS_TOOL_MEMBRANE_HMAC_SECRET || context.require('crypto').randomBytes(32).toString('hex'),
    GENOS_IN_PROCESS_WORKERS: context.process.platform === 'win32' ? '1' : context.process.env.GENOS_IN_PROCESS_WORKERS || '',
    GENOS_WORKSPACE_ROOT: context.state.workspace, GENOS_DB_PATH: context.state.dbPath,
    GENOS_CAPSULE_ROOT: context.ensureAttemptWorkspace(context.state),
    GENOS_ADMIN_PASSWORD: context.process.env.GENOS_ADMIN_PASSWORD || 'genos-comparison-admin-pw',
    GENOS_COMPARISON_TOOL_POLICY: 'empty', GENOS_MORPHOGENESIS_V2_SHADOW: '0' };
}

function measuredMetrics(context) {
  return context.result.servedModel || (context.state.servedModels.size === 1 ? [...context.state.servedModels][0]
      : context.state.servedModels.size ? 'mixed' : null);
}

function genosFullRule3(context) {
  return (context.result.telemetry || []).filter(event => event.event_type === 'AGENT_COMPLETED')
    .map(event => { try { return context.Number(context.JSON.parse(event.payload_json || '{}').usage?.tokens); } catch { return context.NaN; } });
}

module.exports = { genosFullRule1, measuredMetrics, genosFullRule3 };
