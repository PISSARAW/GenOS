'use strict';

async function attachTruthGraph(context) {
  const compiler = require('./reportCompilerService');
  const graph = await compiler.buildTruthGraph(context.db, context.agentId,
    { missionId: context.autonomyPlan?.trinity?.missionId || null });
  if (graph?.status !== 'measured') {
    throw Object.assign(new Error('Mission truth graph is unavailable or unmeasured.'), {
      code: 'MISSION_TRUTH_GRAPH_UNAVAILABLE'
    });
  }
  context.autonomyPlan.missionTruthGraph = compiler.compileReport(graph);
}

function successClaim(claim, compiler) {
  if (claim.outcome !== 'success') return false;
  return claim.confidence !== 'supported'
    || compiler.nliVerdict(claim.proposition, claim.evidenceTexts) === 'contradiction';
}

async function enforceReportGate(context) {
  const compiled = context.autonomyPlan?.missionTruthGraph;
  if (!compiled || !Array.isArray(compiled.claims)) {
    throw Object.assign(new Error('Mission report gate cannot run without a compiled truth graph.'), {
      code: 'MISSION_REPORT_GATE_UNAVAILABLE'
    });
  }
  const compiler = require('./reportCompilerService');
  const violations = compiled.claims.filter((claim) => successClaim(claim, compiler)).map((claim) => claim.id);
  if (!violations.length) return;
  context.autonomyPlan.reportGateViolations = violations;
  require('./agentOrchestrationState').emit(context.agentId, 'REPORT_GATE_VIOLATION', 'EVIDENCE_GATE',
    `${violations.length} success claim(s) without supporting source in the mission truth graph.`,
    { claimIds: violations, count: violations.length }, 'warning');
  throw Object.assign(new Error('Mission report gate rejected unsupported or contradicted success claims.'), {
    code: 'MISSION_REPORT_GATE_REJECTED', claimIds: violations
  });
}

module.exports = { attachTruthGraph, enforceReportGate };
