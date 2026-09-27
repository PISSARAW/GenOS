'use strict';

const assert = require('assert');
const { buildClosedSemanticReport, verifyClosedRendering, runClosedPipeline } = require('../src/services/truthGraphSemanticPipelineService');

const graph = {
  nodes: [
    { id: 'tool_1', kind: 'tool_execution', tool: 'genos_test' },
    { id: 'claim_1', kind: 'claim', proposition: 'La mesure est supportée', outcome: 'success', sources: ['tool_1'], evidence: 1 },
  ],
  edges: [{ from: 'tool_1', to: 'claim_1', kind: 'supports' }],
};

async function main() {
  const report = buildClosedSemanticReport(graph);
  assert.strictEqual(report.propositions.length, 1);
  assert.deepStrictEqual(report.causalRelations, [], 'Une mention ne crée pas une causalité');
  const sentence = { kind: 'factual', text: 'La mesure est supportée [claim:claim_1]', claimIds: ['claim_1'] };
  assert.strictEqual(verifyClosedRendering(report, graph, [sentence]).ok, true);
  assert.throws(() => runClosedPipeline(graph, [{ kind: 'factual', text: 'La mesure est supportée' }]), (error) => error.code === 'CLOSED_RENDERING_REJECTED');
  assert.strictEqual(runClosedPipeline(graph, [sentence]).rendering.ok, true);
  const causalGraph = { ...graph, edges: [...graph.edges, { from: 'cause_1', to: 'claim_1', kind: 'caused_by_recorded' }] };
  assert.strictEqual(buildClosedSemanticReport(causalGraph).causalRelations.length, 1);
  console.log('✅ truth graph semantic pipeline tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
