"use strict";

const assert = require("assert");

const genomePolicy = require("../src/services/proceduralGenomePolicyService");
const syn = require("../src/services/proceduralSynapseService");
const plast = require("../src/services/proceduralPlasticityService");
const consol = require("../src/services/proceduralConsolidationService");
const prune = require("../src/services/proceduralPruningService");
const inhib = require("../src/services/proceduralInhibitionService");
const select = require("../src/services/proceduralActionSelectionService");
const pe = require("../src/services/proceduralPredictionErrorService");

// ---------- 1. proceduralGenomePolicyService ----------

assert.strictEqual(typeof genomePolicy.policyFrom, "function");
const gp = genomePolicy.policyFrom({});
assert.deepStrictEqual(Object.keys(gp), Object.keys(genomePolicy.DEFAULT_POLICY));
assert.ok(genomePolicy.genomeEncodesLearningRules({ expressedPhenotype: { procedural_policy: {} } }));
assert.ok(!genomePolicy.genomeEncodesLearningRules({}));
assert.ok(genomePolicy.isInnate({ encodedAsLearningRules: true, expressedPhenotype: { plasticity: {} } }));
assert.ok(genomePolicy.isAcquired({ encodedAsLearningRules: false }));
assert.strictEqual(genomePolicy.learningRateFor({ plasticity: { enabled: true, learningRate: "adaptive", maxDelta: 0.15 } }, 0), 0);
assert.strictEqual(genomePolicy.learningRateFor({ plasticity: { enabled: true, learningRate: "adaptive", maxDelta: 0.15 } }, 1), 0.15);
assert.strictEqual(genomePolicy.consolidationThreshold({ consolidation: { threshold: 0.9 } }), 0.9);
assert.ok(genomePolicy.isInheritanceValidatedOnly({ inheritance: { acquiredProcedures: "validated_only" } }));
assert.ok(!genomePolicy.isInheritanceValidatedOnly({ inheritance: { acquiredProcedures: "always" } }));
assert.ok(genomePolicy.requiresEvidence({ inheritance: { requireEvidence: true } }));
assert.ok(!genomePolicy.requiresEvidence({}));

// ---------- 2. proceduralSynapseService ----------

const s0 = syn.defaultSynapse("A", "B");
assert.strictEqual(s0.from, "A");
assert.strictEqual(s0.to, "B");
assert.strictEqual(s0.type, "excitatory");
assert.strictEqual(s0.lifecycle, "active");
assert.strictEqual(s0.weight, 1.0);
assert.strictEqual(s0.plasticity.weight, 1.0);
assert.strictEqual(s0.evidence.successRate, 0);
const s1 = syn.synapseFrom({ from: "X", to: "Y", weight: 0.4, type: "inhibitory", inhibitionStrength: 0.8 });
assert.strictEqual(s1.type, "inhibitory");
assert.ok(Math.abs(syn.computeEffectiveWeight(s1) - (-0.32)) < 1e-9);
const s2 = syn.synapseFrom({ from: "M", to: "N", type: "modulatory" });
assert.strictEqual(syn.computeEffectiveWeight(s2), 0);
const s3 = syn.activate(s0, { trajectory: "T-01" });
assert.strictEqual(s3.plasticity.lastActivation, "T-01");
const s4 = syn.recordTrial(s0, true);
assert.strictEqual(s4.evidence.trialCount, 1);
assert.strictEqual(s4.evidence.successRate, 1);
const s5 = syn.recordTrial(s4, false);
assert.strictEqual(s5.evidence.trialCount, 2);
assert.strictEqual(s5.evidence.successRate, 0.5);
assert.ok(syn.successfulTransition({ evidence: { successRate: 0.9 } }));
assert.ok(!syn.successfulTransition({ evidence: { successRate: 0.3 } }));

// ---------- 3. proceduralPlasticityService ----------

const r = plast.rewardFrom({ success: 1, evidence: 1, cost: 0, safety: 1, causalEffect: 1 });
assert.ok(r >= 0 && r <= 1);
const d = plast.deltaW({ weight: 0.5 }, { success: 1, evidence: 1, cost: 0, safety: 1, causalEffect: 1, episodeCount: 1 }, { plasticity: { enabled: true, learningRate: "adaptive", maxDelta: 0.15 } });
assert.ok(d > 0.5 && d <= 0.65);
const ltp = plast.applyLTP({ weight: 0.5, plasticity: { potentiationCount: 0 } }, { success: 1, evidence: 1, cost: 0, safety: 1, causalEffect: 1, episodeCount: 1 }, { plasticity: { enabled: true, learningRate: "adaptive", maxDelta: 0.15 } });
assert.ok(ltp.plasticity.potentiationCount, 1);
const ltd = plast.applyLTD({ weight: 0.5, plasticity: { depressionCount: 0 } }, { success: 0, evidence: 0, cost: 1, safety: 0, causalEffect: 0, episodeCount: 1 }, { plasticity: { enabled: true } });
assert.ok(ltd.plasticity.depressionCount, 1);
const pe1 = plast.predictionError(0.9, 0.2);
assert.ok(pe1 < 0);
const pe2 = plast.predictionError(0.2, 0.9);
assert.ok(pe2 > 0);
const surp = plast.surpriseScore(-0.5, { mutation: { surpriseThreshold: 0.25 } });
assert.ok(surp.isSurprising);

// ---------- 4. proceduralConsolidationService ----------

const e1 = consol.episodeFrom({ trajectory: ["a", "b", "c"], outcome: "success", context: { lang: "python" } });
assert.strictEqual(e1.success, true);
const common = consol.extractCommonSubpath([
  { trajectory: ["a", "b", "c"], success: true, context: {} },
  { trajectory: ["a", "b", "d"], success: true, context: {} },
]);
assert.deepStrictEqual(common, ["a", "b"]);
assert.deepStrictEqual(consol.extractCommonSubpath([{ trajectory: ["x"] }]), []);
const consolidated = consol.consolidatePath({ consolidation: { threshold: 0.5, minEpisodes: 2 } }, [
  { trajectory: ["a", "b", "c"], success: true, context: { lang: "python" } },
  { trajectory: ["a", "b", "d"], success: true, context: { lang: "python" } },
]);
assert.ok(consolidated.consolidated);
assert.ok(consolidated.path.length >= 2);
assert.strictEqual(consolidated.provenance.episodeCount, 2);
const notEnough = consol.consolidatePath({ consolidation: { threshold: 0.5, minEpisodes: 5 } }, [
  { trajectory: ["a", "b"], success: true, context: {} },
]);
assert.ok(!notEnough.consolidated);
assert.strictEqual(notEnough.reason, "insufficient_episodes");
const below = consol.consolidatePath({ consolidation: { threshold: 0.9, minEpisodes: 2 } }, [
  { trajectory: ["a", "b"], success: false, context: {} },
  { trajectory: ["a", "b"], success: true, context: {} },
]);
assert.ok(!below.consolidated);
assert.strictEqual(below.reason, "below_threshold");
const replay = consol.replaySummary([
  { success: true }, { success: true }, { success: false },
]);
assert.strictEqual(replay.replayed, 3);
assert.strictEqual(replay.successCount, 2);
assert.strictEqual(replay.successRate, 2 / 3);

// ---------- 5. proceduralPruningService ----------

const active = { weight: 1.0, lastUsage: Date.now(), lifecycle: "active", evidence: { successRate: 0.9 } };
const assess = prune.pruneEligibility(active, { pruning: { enabled: true, decayHalfLifeEpisodes: 80 } });
assert.strictEqual(assess.eligible, false);
assert.strictEqual(assess.state, "active");
const weak = { weight: 0.15, lastUsage: Date.now(), lifecycle: "active", evidence: { successRate: 0.1 } };
const assess2 = prune.pruneEligibility(weak, { pruning: { enabled: true } });
assert.strictEqual(assess2.state, "candidate_for_pruning");
assert.strictEqual(assess2.eligible, false);
const pruned = prune.prune({ weight: 1.0, lifecycle: "candidate_for_pruning" });
assert.strictEqual(pruned.lifecycle, "pruned");
const weakened = prune.weaken({ weight: 1.0, lifecycle: "active" });
assert.strictEqual(weakened.lifecycle, "weakened");
const revived = prune.revive({ weight: 1.0, lifecycle: "dormant" });
assert.strictEqual(revived.lifecycle, "weakened");
const candidates = prune.pruneCandidates([
  { weight: 0.01, lifecycle: "active", evidence: { successRate: 0.0 }, lastUsage: Date.now() },
], { pruning: { enabled: true, decayHalfLifeEpisodes: 1 } });
assert.ok(candidates.length);
const pr = candidates.find((c) => c.assessment.state === "dormant" || c.assessment.state === "weakened" || c.assessment.state === "candidate_for_pruning" || c.assessment.state === "pruned");
assert.ok(pr != null);

// ---------- 6. proceduralInhibitionService ----------

const ie = inhib.inhibitoryEdgeFrom({ from: "inspect_error", to: "patch_immediately", condition: { missing_reproduction: true }, strength: 0.9 });
assert.strictEqual(ie.type, "inhibitory");
assert.ok(inhib.isInhibitory(ie));
assert.ok(!inhib.isInhibited(ie, { missing_reproduction: false }));
assert.ok(inhib.isInhibited(ie, { missing_reproduction: true }));
assert.strictEqual(inhib.inhibitionStrength(ie, { missing_reproduction: true }), 0.9);
assert.strictEqual(inhib.inhibitionStrength(ie, { missing_reproduction: false }), 0);
const eff = inhib.effectiveTransitionScore(1.0, ie, { missing_reproduction: true });
assert.ok(eff < 0.2);
const triggered = inhib.trigger(ie, { missing_reproduction: true });
assert.strictEqual(triggered.triggeredCount, 1);
const deact = inhib.deactivate(ie);
assert.ok(!deact.active);
const react = inhib.reactivate(deact);
assert.ok(react.active);

// ---------- 7. proceduralActionSelectionService ----------

const c1 = select.candidateAction({ id: "patch", weight: 0.9, contextMatch: 0.9, expectedUtility: 0.8, evidence: 0.9, risk: 0.1, inhibition: 0 });
const c2 = select.candidateAction({ id: "search", weight: 0.3, contextMatch: 0.4, expectedUtility: 0.5, evidence: 0.4, risk: 0.5, inhibition: 0.6 });
const r1 = select.selectActions([c1, c2], {}, { topN: 1, winnerTakeMost: true });
assert.strictEqual(r1.selected.length, 1);
assert.strictEqual(r1.winner.id, "patch");
assert.ok(r1.selected[0].score > r1.selected.length > 1 ? r1.selected[1].score : true);
const c3 = select.candidateAction({ id: "A", id: "A", weight: 0.5, inhibition: 0 });
const inhibited = select.competitiveInhibition([c3], ["B"], {});
assert.ok(inhibited[0].inhibition > 0);
const r2 = select.activationScore({ weight: 1, contextMatch: 1, expectedUtility: 1, evidence: 1, risk: 0, inhibition: 0 });
assert.ok(r2 >= 0.8);

// ---------- 8. proceduralPredictionErrorService ----------

const peCtx = pe.predictionContext({ expectedReward: 0.9, observedReward: 0.2, episodeCount: 5 });
const peRes = pe.computePredictionError(peCtx);
assert.ok(peRes.delta < 0);
assert.strictEqual(peRes.expected, 0.9);
assert.strictEqual(peRes.observed, 0.2);
const action = pe.peAction(peRes, { mutation: { surpriseThreshold: 0.25 } });
assert.ok(action.triggerLTD);
assert.ok(action.triggerMutationSearch);
assert.ok(action.isSurprising);
const expR = pe.expectedRewardFrom({ evidence: { successRate: 0.9 } }, 9, 10);
assert.ok(expR > 0.7 && expR < 0.95);

console.log("=== procedural organism foundations: all passed ===");
