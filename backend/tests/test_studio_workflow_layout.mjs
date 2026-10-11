import assert from 'node:assert/strict';
import { layoutWorkflow } from '../../integrations/studio/workflowLayout.mjs';

const nodes = ['end', 'start', 'middle'].map(id => ({ id }));
const graph = { nodes, edges: [{ source: 'start', target: 'middle' }, { source: 'middle', target: 'end' }] };
const source = structuredClone(graph);
const layout = layoutWorkflow(graph);
assert.ok(layout.points.get('start').x < layout.points.get('middle').x);
assert.ok(layout.points.get('middle').x < layout.points.get('end').x);
assert.deepEqual(graph, source);
const fork = layoutWorkflow({ nodes: ['a', 'b', 'c', 'd'].map(id => ({ id })),
  edges: [{ source: 'a', target: 'b' }, { source: 'a', target: 'c' }, { source: 'b', target: 'd' }, { source: 'c', target: 'd' }] });
assert.equal(fork.points.get('b').x, fork.points.get('c').x);
assert.notEqual(fork.points.get('b').y, fork.points.get('c').y);
const cycle = layoutWorkflow({ nodes: [{ id: 'a' }, { id: 'b' }],
  edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }, { source: 'absent', target: 'b' }] });
assert.equal(cycle.points.size, 2);
assert.deepEqual(layoutWorkflow({ nodes: [], edges: [] }), { points: new Map(), width: 320, height: 240 });
const large = layoutWorkflow({ nodes: Array.from({ length: 120 }, (_, index) => ({ id: String(index) })), edges: [] });
assert.equal(large.points.size, 100);
assert.equal(new Set([...large.points.values()].map(point => `${point.x},${point.y}`)).size, 100);
console.log('Studio layout: directed graph, forks, cycles, unknown links, immutability and display cap passed.');
