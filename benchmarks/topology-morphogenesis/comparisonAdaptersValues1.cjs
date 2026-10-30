'use strict';

function genosFullValue1(__genosValueScope1) {
  return { ...__genosValueScope1.process.env, GENOS_DEFAULT_MODEL: `ollama://${__genosValueScope1.state.model}`,
    GENOS_AGENT_EXECUTOR: '', GENOS_LOCAL_MODEL: __genosValueScope1.state.model,
    GENOS_GVX_LEDGER_HMAC_SECRET: __genosValueScope1.process.env.GENOS_GVX_LEDGER_HMAC_SECRET
      || (0, __genosValueScope1.require)('crypto').randomBytes(32).toString('hex'),
    GENOS_TOOL_MEMBRANE_HMAC_SECRET: __genosValueScope1.process.env.GENOS_TOOL_MEMBRANE_HMAC_SECRET || (0, __genosValueScope1.require)('crypto').randomBytes(32).toString('hex'),
    GENOS_IN_PROCESS_WORKERS: __genosValueScope1.process.platform === 'win32' ? '1' : __genosValueScope1.process.env.GENOS_IN_PROCESS_WORKERS || '',
    GENOS_WORKSPACE_ROOT: __genosValueScope1.state.workspace, GENOS_DB_PATH: __genosValueScope1.state.dbPath,
    GENOS_CAPSULE_ROOT: (0, __genosValueScope1.ensureAttemptWorkspace)(__genosValueScope1.state),
    GENOS_ADMIN_PASSWORD: __genosValueScope1.process.env.GENOS_ADMIN_PASSWORD || 'genos-comparison-admin-pw',
    GENOS_COMPARISON_TOOL_POLICY: 'empty', GENOS_MORPHOGENESIS_V2_SHADOW: '0' };
}

function measuredMetricsValue2(__genosValueScope2) {
  return __genosValueScope2.result.servedModel || (__genosValueScope2.state.servedModels.size === 1 ? [...__genosValueScope2.state.servedModels][0]
      : __genosValueScope2.state.servedModels.size ? 'mixed' : null);
}

function genosFullValue3(__genosValueScope3) {
  return (__genosValueScope3.result.telemetry || []).filter(event => event.event_type === 'AGENT_COMPLETED')
    .map(event => { try { return (0, __genosValueScope3.Number)(__genosValueScope3.JSON.parse(event.payload_json || '{}').usage?.tokens); } catch { return __genosValueScope3.NaN; } });
}

module.exports = { genosFullValue1, measuredMetricsValue2, genosFullValue3 };
