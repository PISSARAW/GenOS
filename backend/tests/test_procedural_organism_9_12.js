"use strict";

const assert = require("assert");
const fit = require("../src/services/proceduralFitnessService");
const homeo = require("../src/services/proceduralHomeostaticPlasticityService");
const epigen = require("../src/services/proceduralEpigeneticService");
const methyl = require("../src/services/proceduralMethylationService");

// Point 9+10: fitness + homeostasis
const graph = { nodes: 50, edges: 100, tokenCost: 0.5, executionCost: 0.5 };
const cost = fit.complexityCost(graph);
assert.ok(cost >= 0 && cost <= 1);
assert.strictEqual(fit.withinBudget(graph, 0.9).ok, true);
assert.strictEqual(fit.withinBudget(graph, 0.1).ok, false);
const result = fit.fitness({ fitnessWeights: { success: 0.3, robustness: 0.2, evidence: 0.2, generalization: 0.1, cost: 0.08, risk: 0.07, complexity: 0.05 } }, { success: 1, robustness: 1, evidence: 1, generalization: 1, cost: 0, risk: 0, complexity: 0 });
assert.ok(result.score > 0.79);
const h = fit.fitnessHistoryCompare([0.1, 0.3, 0.5]);
assert.strictEqual(h.trend, "improving");
const h2 = fit.fitnessHistoryCompare([0.5, 0.3, 0.1]);
assert.strictEqual(h2.trend, "declining");

// Point 10: homeostatic plasticity
const w1 = homeo.homeostaticWeight(0.8, 0.8, { homeostasis: { targetActivation: 0.12, sensitivity: 0.3 } });
assert.ok(w1 < 0.8);
const w2 = homeo.homeostaticWeight(0.01, 0.01, { homeostasis: { targetActivation: 0.12, sensitivity: 0.3 } });
assert.ok(w2 > 0.01);
const norm = homeo.normalizeActivations([0.5, 0.3, 0.2], { homeostasis: { targetActivation: 0.3, sensitivity: 0.3 } });
assert.strictEqual(norm.length, 3);
const rigid = homeo.isRigid([0.95, 0.03, 0.02]);
assert.strictEqual(rigid, true);
const notRigid = homeo.isRigid([0.4, 0.3, 0.3]);
assert.strictEqual(notRigid, false);

// Point 11: epigenetic expression
const expr1 = epigen.expressionForEnvironment({ id: "p1", epigenetic_marks: { production: { expression: 0.9 } } }, "production");
assert.strictEqual(expr1.mode, "enabled");
const expr2 = epigen.expressionForEnvironment({ id: "p2", epigenetic_marks: { production: { expression: 0.1 } } }, "production");
assert.strictEqual(expr2.mode, "silenced");
const expr3 = epigen.expressionForEnvironment({ id: "p3", epigenetic_marks: { production: { expression: 0.5 } } }, "production");
assert.strictEqual(expr3.mode, "conditional");
assert.ok(epigen.isExpressed(0.7));
assert.ok(epigen.isEnabled(0.8));
assert.ok(epigen.isSilenced(0.1));

// Point 12: methylation
const m1 = methyl.methylationMarkFrom({ target: { type: "edge", from: "inspect", to: "patch" }, strength: 0.9, type: "repression", trigger: { environment: "production" } });
assert.strictEqual(m1.type, "repression");
assert.ok(Math.abs(methyl.expressionAfterMethylation(1.0, m1) - 0.1) < 1e-9);
assert.ok(methyl.targetsEdge(m1, "inspect", "patch"));
assert.ok(!methyl.targetsEdge(m1, "inspect", "deploy"));
assert.ok(methyl.targetsProcedure({ target: { type: "procedure", id: "p1" } }, "p1"));
const marks = [
  methyl.methylationMarkFrom({ target: { type: "edge", from: "a", to: "b" }, trigger: { environment: "production" } }),
  methyl.methylationMarkFrom({ target: { type: "edge", from: "c", to: "d" }, trigger: { environment: "development" } }),
];
const prodMarks = methyl.methylationByEnvironment(marks, "production");
assert.strictEqual(prodMarks.length, 1);

console.log("=== procedural organism 9-12: all passed ===");
