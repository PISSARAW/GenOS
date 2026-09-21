"use strict";

const assert = require("assert");
const immune = require("../src/services/proceduralImmuneInspectionService");
const immMemory = require("../src/services/proceduralAdaptiveImmuneMemoryService");
const mutation = require("../src/services/proceduralMutationSelectionService");
const diversity = require("../src/services/proceduralEcologicalDiversityService");
const biome = require("../src/services/proceduralBiomePopulationService");
const niche = require("../src/services/proceduralEcologicalNicheService");
const holo = require("../src/services/proceduralHolobionteService");
const rhizome = require("../src/services/proceduralRhizomePropagationService");
const metapop = require("../src/services/proceduralMetapopulationService");
const apoptosis = require("../src/services/proceduralApoptosisService");
const crypto = require("../src/services/proceduralCryptobiosisService");
const fossil = require("../src/services/proceduralFossilizationService");

// 13: immune inspection
const report1 = immune.inspectMutation({ id: "m1", code: "remove verification" });
assert.strictEqual(report1.safe, false);
assert.ok(report1.findings.length > 0);
const report2 = immune.inspectMutation({ id: "m2", code: "do nothing dangerous" });
assert.strictEqual(report2.safe, true);
const multi = immune.inspectMultiple([{ code: "a" }, { code: "remove verif" }]);
assert.strictEqual(multi.length, 2);
assert.ok(immune.hasFindings(report1));
assert.ok(!immune.hasFindings(report2));
assert.ok(["clean", "low", "medium", "high"].includes(immune.severityLevel(report1)));

// 14: adaptive immune memory
const sig = immMemory.immuneSignatureFrom({ pattern: "remove verif", mutationPattern: ["REMOVE_VERIFICATION"] });
assert.ok(sig.id);
const match = immMemory.matchSignature(sig, { code: "please remove verification now" });
assert.strictEqual(match.matched, true);
const noMatch = immMemory.matchSignature(sig, { code: "do something safe" });
assert.strictEqual(noMatch.matched, false);
const recall = immMemory.recallRejection([sig], { code: "remove verification" });
assert.strictEqual(recall.rejected, true);
const memory2 = immMemory.recordRejection([], sig);
assert.strictEqual(memory2.length, 1);

// 15: mutation selection
const variants = mutation.generateVariants({ id: "p1" }, 4);
assert.strictEqual(variants.length, 4);
const evaluated = mutation.evaluateVariants(variants, (v) => 0.5);
assert.ok(evaluated[0].fitness != null);
const survivors = mutation.selectSurvivors([{ fitness: 0.9 }, { fitness: 0.8 }, { fitness: 0.1 }], { topN: 2 });
assert.strictEqual(survivors.length, 2);

// 16: ecological diversity
const procA = { id: "a" };
const procB = { id: "b" };
const niches = [{ id: "n1", scoreFor: (p) => p.id === "a" ? 0.9 : 0.1 }];
const assigned = diversity.assignNiche([procA, procB], niches);
assert.strictEqual(assigned.a.niche.id, "n1");
const overlap = diversity.hasNicheOverlap({ niche: { id: "n1" } }, { niche: { id: "n1" } });
assert.strictEqual(overlap, true);
const noOverlap = diversity.hasNicheOverlap({ niche: { id: "n1" } }, { niche: { id: "n2" } });
assert.strictEqual(noOverlap, false);
const idx = diversity.diversityIndex([{ size: 5 }, { size: 5 }]);
assert.ok(idx > 0 && idx <= 1);

// 17: biome population
const pop = biome.population({ id: "p1", niche: { id: "n1" }, size: 3 });
assert.strictEqual(pop.size, 3);
assert.strictEqual(biome.populationCapacity(pop, { maxPop: 50 }), 47);
assert.strictEqual(biome.canReplicate(pop, { maxPop: 50 }), true);
const registered = biome.registerFitness(pop, 0.8);
assert.strictEqual(registered.fitnessHistory.length, 1);
const stats = biome.nicheStats([{ niche: { id: "n1" }, size: 3 }]);
assert.strictEqual(stats.n1, 3);

// 18: ecological niche
const niche1 = niche.defineNiche({ id: "n1", environment: { lang: "python" }, scoreFor: (p) => p.lang === "python" ? 0.9 : 0.1 });
assert.strictEqual(niche1.id, "n1");
const score = niche.scoreInEnvironment(niche1, { lang: "python" });
assert.ok(score > 0.8);
const sorted = niche.sortedByNicheFit([{ lang: "js" }, { lang: "python" }], niche1);
assert.strictEqual(sorted[0].lang, "python");

// 19: holobionte
const host = holo.holobionte({ id: "h1", host: { fitness: 0.8 }, symbionts: [{ id: "s1", fitness: 0.9 }] });
const withNewSymb = holo.addSymbionte(host, { id: "s2", fitness: 0.7 });
assert.strictEqual(withNewSymb.symbionts.length, 2);
const fit = holo.compositeFitness(host, { host: 0.5, symbiont: 0.5 });
assert.ok(fit > 0.8);
assert.ok(holo.hasSymbionte(host, "s1"));

// 20: rhizome propagation
const frag = rhizome.fragmentFrom({ id: "proc1", role: "debug" }, { agent: "A" });
assert.strictEqual(frag.source, "proc1");
const validated = rhizome.validateFragment(frag, (f) => f.procedure != null);
assert.strictEqual(validated.validated, true);
const assim = rhizome.assimilate({ id: "target" }, validated);
assert.ok(assim.assimilatedFrom === "proc1");
const trace = rhizome.tracePropagation([frag]);
assert.strictEqual(trace.length, 1);

// 21: metapopulation
const meta = metapop.metapopulation({ id: "m1" });
const withPop = metapop.addPopulation(meta, { id: "p1" });
assert.strictEqual(withPop.populations.length, 1);
const collapsed = metapop.markCollapsed(withPop, "p1");
assert.strictEqual(collapsed.populations.length, 0);
assert.strictEqual(collapsed.collapsed.length, 1);
const recol = metapop.recolonize(collapsed, { id: "p2" });
assert.strictEqual(recol.populations.length, 1);
const div = metapop.totalDiversity(recol);

// 22: apoptosis
const cond = apoptosis.apoptosisCondition({ fitness: 0.05, risk: 0.95, recoveryAttempts: 5 });
assert.strictEqual(cond.fitness, 0.05);
assert.strictEqual(apoptosis.shouldApoptose(cond, { fitness: 0.1, risk: 0.9, recoveryAttempts: 3 }), true);
assert.strictEqual(apoptosis.shouldApoptose({ fitness: 0.5, risk: 0.5, recoveryAttempts: 0 }, { fitness: 0.1, risk: 0.9, recoveryAttempts: 3 }), false);
const apo = apoptosis.apoptose({ id: "p1" });
assert.strictEqual(apo.apoptotic, true);
assert.ok(apoptosis.isApoptotic(apo));

// 23: cryptobiosis
const cs = crypto.cryptobioticState({ id: "c1" });
const entered = crypto.enterCryptobiosis(cs);
assert.strictEqual(entered.cryptobiotic, true);
assert.ok(crypto.isCryptobiotic(entered));
assert.strictEqual(crypto.energyCost(entered), 0.01);
const rehyd = crypto.rehydrate(entered, { rehydrated: true });
assert.strictEqual(rehyd.cryptobiotic, false);
assert.ok(rehyd.rehydratedAt);

// 24: fossilization
const fos = fossil.fossilRecord({ id: "f1", genotype: { role: "debug" }, phenotype: { role: "debug" } });
assert.ok(fos.id);
const fos2 = fossil.fossilize({ genotype: {} });
assert.ok(fos2.fossilizedAt);
const lineage = fossil.fossilLineage([{ id: "r1", descendants: ["r2"] }, { id: "r2", descendants: [] }]);
assert.ok(lineage.length >= 1);
const sum = fossil.fossilSummary({ id: "f1", niche: { id: "n1" }, fitnessHistory: [0.5, 0.9], failureCause: "test", descendants: ["d1", "d2"] });
assert.strictEqual(sum.id, "f1");

console.log("=== procedural organism 13-24: all passed ===");
