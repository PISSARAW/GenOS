'use strict';
const c = require('./common.cjs');
async function audit(input) {
  const { ctx, result, directory } = input;
  const compiler = c.service('reportCompilerService');
  const graph = await compiler.buildTruthGraph(ctx.db, 'benchmark-root', { missionId: 'temperature-mission' });
  c.write(c.path.join(directory, 'truth-graph.json'), graph);
  const gateContext = { db: ctx.db, agentId: 'benchmark-root', normalizedMission: { missionId: 'temperature-mission' }, autonomyPlan: {} };
  try {
    await c.service('workerEvidenceTruthGate').attachTruthGraph(gateContext);
    await c.service('workerEvidenceTruthGate').enforceReportGate(gateContext);
    result.truthGate = { status: 'passed', graphStatus: graph.status, compiled: gateContext.autonomyPlan.missionTruthGraph };
  } catch (error) { result.truthGate = { status: 'refused', code: error.code, message: error.message }; }
  if (result.nativeRun) {
    result.oracleInspection = await c.service('epistemic/nativeOracleInspection').inspect(ctx.db, {
      runId: result.nativeRun.id, agentId: 'benchmark-worker' });
    c.write(c.path.join(directory, 'oracle-inspection.json'), result.oracleInspection);
    c.write(c.path.join(directory, 'biological-binding.json'),
      await c.service('biologicalWorkerStore').binding(ctx.db, result.nativeRun.id));
  }
}
require('../native/worker-run.cjs').main({ setup: c.setup, provision: require('./provision.cjs').provision, audit })
  .then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
