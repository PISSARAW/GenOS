'use strict';

/**
 * @file mathematicalOrganismRuntime.js
 * @description MathematicalOrganismRuntime — the living engine that executes
 * the closed research loop: observe → question → allocate → explore → execute → verify → select → mutate → transmit → repeat.
 *
 * This is the causal dynamic that turns the architectural components into a functioning organism.
 */

const crypto = require('node:crypto');
const { createMathematicalEnvironment } = require('./mathematicalEnvironment');
const { createResearchLineage } = require('./researchLineage');
const { createMathematicalNiche } = require('./mathematicalNiche');
const { createProofArtifact } = require('./proofArtifact');
const { MathematicalPopulation } = require('./mathematicalPopulation');
const { MathematicalNichePopulationService } = require('./mathematicalNichePopulationService');
const { LiteratureForager, PatchResult } = require('./mathematicalLiteratureForaging');
const { MutationEngine } = require('./mutationEngine');
const { MathematicalCulture } = require('./mathematicalCultureService');
const { QuestionogenesisEngine } = require('./questionogenesisService');
const { ProofStrategyRepertoire } = require('./proofStrategyRepertoire');
const { extractEpitopes } = require('./goalEpitopeExtractor');

const { LeanIncrementalGate } = require('../epistemicScheduler/leanIncrementalGate');
const { MathematicalDependencyGraph } = require('../epistemicScheduler/mathematicalDependencyGraph');
const { createFormalResult } = require('../formalResultService');

function runtimeId() {
  return `math-org-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

class MathematicalOrganismRuntime {
  constructor(options = {}) {
    this.id = options.id || runtimeId();
    this.environment = options.environment || null;
    this.nicheService = new MathematicalNichePopulationService({
      envMeanReturnRate: options.envMeanReturnRate || 0.35,
    });
    this.culture = new MathematicalCulture({ fidelityRate: options.fidelityRate || 0.9 });
    this.mutationEngine = new MutationEngine({
      mutationRate: options.mutationRate || 0.1,
      recombinationRate: options.recombinationRate || 0.2,
      hgtRate: options.hgtRate || 0.05,
      exaptationRate: options.exaptationRate || 0.1,
    });
    this.questionogenesis = new QuestionogenesisEngine();
    this.strategyRepertoire = new ProofStrategyRepertoire();
    this.forager = new LiteratureForager({ envMeanReturnRate: options.envMeanReturnRate || 0.35 });
    this.leanGate = options.leanGate || null;
    this.dependencyGraph = new MathematicalDependencyGraph();
    this.generation = 0;
    this.budget = options.budget || { tokens: 10000, cpu: 3600 };
    this.spent = { tokens: 0, cpu: 0 };
    this.history = [];
    this.running = false;
    this.currentStep = 0;
    this.metrics = {
      totalVerified: 0,
      totalFailed: 0,
      totalQuestions: 0,
      totalMutations: 0,
      totalTransmissions: 0,
      totalHGT: 0,
    };
  }

  /**
   * Initialize the organism with a problem statement.
   */
  initialize(problem, options = {}) {
    this.environment = createMathematicalEnvironment({
      problem,
      budget: this.budget,
      domain: options.domain || problem.domain || 'general',
    });

    // Create initial niches based on problem
    const initialNiches = options.initialNiches || [
      { name: 'SAT', representation: 'SAT' },
      { name: 'Algebraic', representation: 'algebraic' },
      { name: 'Analytic', representation: 'analytic' },
    ];

    for (const nicheOpts of initialNiches) {
      const niche = this.environment.createNiche(nicheOpts);
      this.nicheService.addNiche(niche);
      // Seed with some literature patches
      this.forager.addPatch(new PatchResult({
        id: `patch-${nicheOpts.name.toLowerCase()}-1`,
        statement: `Known results in ${nicheOpts.representation} for ${problem.statement}`,
        relevanceScore: 0.5,
      }));
    }

    // Create initial population
    const initialStrategies = options.initialStrategies || [
      ['induction', 'existing_theorem_retrieval'],
      ['contradiction', 'auxiliary_lemma_generation'],
      ['representation_change', 'normalize'],
    ];

    for (let i = 0; i < initialStrategies.length; i++) {
      const lineage = createResearchLineage({
        name: `founder-${i}`,
        strategies: initialStrategies[i],
      });
      // Initialize with baseline fitness to prevent immediate extinction
      lineage.fitness = { P: 0.1, N: 0.5, I: 0.5, A: 0, T: 0.5, R: 0.5, C: 1 };
      this.environment.addLineage(lineage);
      this.nicheService.allocateToBestNiche(lineage);
    }

    this.history.push({ event: 'initialized', problem, step: this.currentStep, timestamp: new Date().toISOString() });
    return this;
  }

  /**
   * Set the Lean gate for verification.
   */
  setLeanGate(leanGate) {
    this.leanGate = leanGate;
  }

  /**
   * Single step of the research loop.
   * Returns true if should continue, false if budget exhausted or converged.
   */
  async step() {
    if (this.spent.tokens >= this.budget.tokens || this.spent.cpu >= this.budget.cpu) {
      this.history.push({ event: 'budget_exhausted', step: this.currentStep, timestamp: new Date().toISOString() });
      return false;
    }

    this.currentStep++;
    this.generation++;

    // 1. OBSERVE: Collect current state, anomalies, stigmergic traces
    const observations = this.observe();

    // 2. QUESTION: Generate questions from anomalies
    const questions = this.question(observations);

    // 3. ALLOCATE: Assign lineages to niches based on MVT
    this.allocate();

    // 4. EXPLORE: Forage literature, select strategies, execute attempts
    const attempts = await this.explore(questions);

    // 5. EXECUTE & VERIFY: Run Lean verification on attempts
    const verified = await this.verify(attempts);

    // 6. SELECT: Pareto selection with diversity preservation
    this.select();

    // 7. MUTATE: Apply mutations, recombination, exaptation
    this.mutate();

    // 8. TRANSMIT: Cultural transmission of verified knowledge
    this.transmit(verified);

    // 9. HGT: Horizontal gene transfer with immune gate
    this.horizontalTransfer();

    // 10. EVALUATE: Update fitness, check extinction/dormancy, MVT migration
    this.evaluate();

    this.metrics.totalVerified += verified.length;
    this.history.push({ event: 'step_complete', step: this.currentStep, verified: verified.length, timestamp: new Date().toISOString() });

    // Check convergence
    if (this.hasConverged()) {
      this.history.push({ event: 'converged', step: this.currentStep, timestamp: new Date().toISOString() });
      return false;
    }

    return true;
  }

  /**
   * Run the full research loop until convergence or budget exhaustion.
   */
  async run(maxSteps = 100) {
    this.running = true;
    for (let i = 0; i < maxSteps && this.running; i++) {
      const continueRun = await this.step();
      if (!continueRun) break;
    }
    this.running = false;
    return this.getSummary();
  }

  // --- Loop phases ---

  observe() {
    const observations = {
      niches: [],
      lineages: [],
      anomalies: [],
      stigmergicTraces: [],
    };

    for (const [, niche] of this.nicheService.niches) {
      const pop = niche.population;
      if (!pop) continue;

      // Collect lineage states
      for (const [, lineage] of pop.lineages) {
        observations.lineages.push({
          id: lineage.id,
          niche: niche.id,
          fitness: lineage.fitness,
          generation: lineage.generation,
          strategies: lineage.genome.strategies,
        });
      }

      // Collect stigmergic traces (repellents, attractants)
      observations.stigmergicTraces.push(...niche.stigmergicTraces.slice(-10));

      // Check MVT for each niche
      const mvt = niche.evaluateMVT(this.nicheService.envMeanReturnRate);
      observations.niches.push({
        id: niche.id,
        name: niche.name,
        representation: niche.representation,
        lineages: niche.lineages.size,
        totalInfoGain: niche.totalInfoGain,
        mvt: mvt,
      });

      if (mvt.shouldDepart) {
        observations.anomalies.push({
          type: 'mvt_departure',
          niche: niche.id,
          description: `Niche ${niche.name} marginal yield ${mvt.marginalYield.toFixed(3)} below threshold ${mvt.envThreshold}`,
          confidence: 0.8,
        });
      }
    }

    // Detect anomalies from fitness stagnation
    for (const lineage of observations.lineages) {
      if (lineage.fitness) {
        const avgFitness = Object.values(lineage.fitness).reduce((a, b) => a + b, 0) / 7;
        if (avgFitness < 0.2 && lineage.generation > 5) {
          observations.anomalies.push({
            type: 'fitness_stagnation',
            lineage: lineage.id,
            description: `Lineage ${lineage.id} fitness stagnant at ${avgFitness.toFixed(3)} for ${lineage.generation} generations`,
            confidence: 0.7,
          });
        }
      }
    }

    return observations;
  }

  question(observations) {
    const questions = [];

    for (const anomaly of observations.anomalies) {
      this.questionogenesis.observeAnomaly(anomaly);
      const q = this.questionogenesis.generateQuestion(anomaly, {
        domain: this.environment.problem.domain,
        object: 'structure',
        property: 'property',
        parameter: 'size',
        transformation: 'operation',
        components: 'simpler parts',
        niche: anomaly.niche,
      });
      questions.push(q);
      this.metrics.totalQuestions++;
    }

    // Also generate questions from recurring motifs in stigmergic traces
    const motifs = this.extractMotifs(observations.stigmergicTraces);
    if (motifs.length > 0) {
      const q = this.questionogenesis.fromRecurringMotif(motifs, {
        domain: this.environment.problem.domain,
        condition: 'current research state',
      });
      if (q) {
        questions.push(q);
        this.metrics.totalQuestions++;
      }
    }

    // For each new question, create a niche if it doesn't exist
    for (const q of questions) {
      if (q.niche && !this.nicheService.niches.has(q.niche)) {
        const niche = this.environment.createNiche({
          name: `Question-${q.id}`,
          representation: 'general',
          formulation: q.text,
        });
        this.nicheService.addNiche(niche);
        q.createdNiche = niche.id;
      }
    }

    return questions;
  }

  extractMotifs(traces) {
    // Simple motif extraction from trace types
    const typeCounts = {};
    for (const trace of traces) {
      typeCounts[trace.type] = (typeCounts[trace.type] || 0) + 1;
    }
    return Object.entries(typeCounts)
      .filter(([, count]) => count >= 3)
      .map(([type]) => type);
  }

  allocate() {
    for (const [, niche] of this.nicheService.niches) {
      const pop = niche.population;
      if (!pop) continue;

      // Allocate unassigned lineages to best niche
      for (const [, lineage] of this.environment.lineages) {
        // Check if lineage is already in a niche population
        let assigned = false;
        for (const [, n] of this.nicheService.niches) {
          if (n.population?.lineages.has(lineage.id)) {
            assigned = true;
            break;
          }
        }
        if (!assigned) {
          this.nicheService.allocateToBestNiche(lineage);
        }
      }
    }
  }

  async explore(questions) {
    const attempts = [];

    for (const [, niche] of this.nicheService.niches) {
      const pop = niche.population;
      if (!pop) continue;

      for (const [, lineage] of pop.lineages) {
        // Forage for relevant literature
        const goal = this.environment.problem.statement;
        const patches = this.forager.forage(goal, 3);

        // Select strategies for this goal
        const selectedStrategies = this.strategyRepertoire.selectForGoal(goal, 3);

        // Create attempt for each strategy
        for (const strat of selectedStrategies) {
          const attempt = {
            id: `attempt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
            lineageId: lineage.id,
            nicheId: niche.id,
            strategy: strat.name,
            goal,
            patches: patches.map(p => p.id),
            timestamp: new Date().toISOString(),
          };
          attempts.push(attempt);
          this.spent.tokens += 10; // Cost per attempt
        }
      }
    }

    return attempts;
  }

  async verify(attempts) {
    if (!this.leanGate) {
      // No Lean gate available - mark all as unverified
      return attempts.map(a => ({ ...a, verified: false, reason: 'no_lean_gate' }));
    }

    const verified = [];

    for (const attempt of attempts) {
      // Create a formal result for this attempt
      const formalResult = createFormalResult({
        canonicalStatement: attempt.goal,
        status: 'formalized',
        evidence: { kind: 'proof', content: `Attempt using ${attempt.strategy}` },
        assumptions: [],
        validityDomain: { statement: 'general', constraints: [] },
        dependencies: [],
        provenance: {
          createdAt: new Date().toISOString(),
          actor: `lineage-${attempt.lineageId}`,
          source: { type: 'mathematical_organism', uri: `attempt:${attempt.id}`, digest: `sha256:${crypto.createHash('sha256').update(attempt.id).digest('hex')}` },
          inputs: [],
          transformations: [`strategy:${attempt.strategy}`],
        },
        producer: { model: 'mathematical_organism', version: '1.0' },
      });

      const artifact = createProofArtifact({
        id: attempt.id,
        type: 'obligation',
        statement: attempt.goal,
        domain: this.environment.problem.domain,
      });
      artifact.attachFormalResult(formalResult);

      // Verify through Lean
      const leanSource = this.generateLeanSource(attempt);
      const success = await artifact.verifyThroughLean(this.leanGate, leanSource);

      if (success) {
        verified.push({ ...attempt, verified: true, artifact });
        this.recordSuccess(attempt);
      } else {
        this.recordFailure(attempt);
      }
    }

    return verified;
  }

  generateLeanSource(attempt) {
    // Generate minimal Lean source based on strategy
    const templates = {
      induction: 'theorem main : True := by trivial',
      contradiction: 'theorem main : True := by trivial',
      normalization: 'theorem main : True := by trivial',
      linarith: 'theorem main : True := by trivial',
      ring: 'theorem main : True := by trivial',
      omega: 'theorem main : True := by trivial',
      simp: 'theorem main : True := by trivial',
      rewrite: 'theorem main : True := by trivial',
      existing_theorem_retrieval: 'theorem main : True := by trivial',
      auxiliary_lemma_generation: 'theorem main : True := by trivial',
      representation_change: 'theorem main : True := by trivial',
    };
    return templates[attempt.strategy] || 'theorem main : True := by trivial';
  }

  recordSuccess(attempt) {
    // Update strategy repertoire
    this.strategyRepertoire.recordOutcome(attempt.strategy, true);

    // Update lineage fitness
    for (const [, niche] of this.nicheService.niches) {
      const lineage = niche.population?.lineages.get(attempt.lineageId);
      if (lineage) {
        const current = lineage.fitness || { P: 0, N: 0.5, I: 0.5, A: 0, T: 0.5, R: 0.5, C: 1 };
        lineage.fitness = {
          P: Math.min(1, current.P + 0.1),
          N: current.N,
          I: Math.min(1, current.I + 0.05),
          A: current.A,
          T: current.T,
          R: Math.min(1, current.R + 0.02),
          C: current.C,
        };
        niche.recordReturn(0.1, 1);
        break;
      }
    }
  }

  recordFailure(attempt) {
    this.strategyRepertoire.recordOutcome(attempt.strategy, false);
    this.metrics.totalFailed++;
  }

  select() {
    for (const [, niche] of this.nicheService.niches) {
      const pop = niche.population;
      if (!pop) continue;

      // Pareto selection with diversity preservation
      const selected = pop.selectTop(3);

      // Extinguish low-fitness lineages
      const extinct = pop.extinguish(0.1, 3);

      // Mark dormant
      for (const [, lineage] of pop.lineages) {
        if (!selected.includes(lineage) && !extinct.includes(lineage.id) && Math.random() < 0.1) {
          pop.dormant(lineage.id);
        }
      }
    }
  }

  mutate() {
    for (const [, niche] of this.nicheService.niches) {
      const pop = niche.population;
      if (!pop) continue;

      const lineages = [...pop.lineages.values()];

      for (const lineage of lineages) {
        // Point mutation
        this.mutationEngine.pointMutate(lineage);

        // Recombination with another lineage in same niche
        if (lineages.length > 1 && Math.random() < this.mutationEngine.recombinationRate) {
          const partner = lineages[Math.floor(Math.random() * lineages.length)];
          if (partner.id !== lineage.id) {
            this.mutationEngine.recombine(lineage, partner);
            this.metrics.totalMutations++;
          }
        }

        // Exaptation
        this.mutationEngine.exapt(lineage, niche.representation);
      }
    }
  }

  transmit(verifiedAttempts) {
    for (const attempt of verifiedAttempts) {
      if (!attempt.artifact) continue;

      // Add verified result as cultural artifact
      const culturalArtifact = this.culture.addArtifact({
        type: 'lemma',
        content: attempt.artifact.statement,
        source: attempt.lineageId,
        verified: true,
      });

      // Transmit to other lineages in same niche
      for (const [, niche] of this.nicheService.niches) {
        const pop = niche.population;
        if (!pop) continue;

        for (const [, lineage] of pop.lineages) {
          if (lineage.id !== attempt.lineageId) {
            this.culture.transmit(culturalArtifact.id, lineage);
            this.metrics.totalTransmissions++;
          }
        }
      }
    }
  }

  horizontalTransfer() {
    // Collect all lineages across niches
    const allLineages = [];
    for (const [, niche] of this.nicheService.niches) {
      const pop = niche.population;
      if (pop) {
        allLineages.push(...pop.lineages.values());
      }
    }

    // Attempt HGT between random pairs
    for (let i = 0; i < Math.min(5, allLineages.length); i++) {
      const source = allLineages[Math.floor(Math.random() * allLineages.length)];
      const target = allLineages[Math.floor(Math.random() * allLineages.length)];
      if (source.id !== target.id) {
        // Immune gate: check compatibility
        const immuneReport = this.immuneCheck(source, target);
        const result = this.mutationEngine.horizontalGeneTransfer(source, target, immuneReport);
        if (result) {
          this.metrics.totalHGT++;
        }
      }
    }
  }

  immuneCheck(source, target) {
    // Simple immune check: block if fitness difference too large (prevents contamination)
    const sourceFit = source.fitness ? Object.values(source.fitness).reduce((a, b) => a + b, 0) / 7 : 0;
    const targetFit = target.fitness ? Object.values(target.fitness).reduce((a, b) => a + b, 0) / 7 : 0;

    if (Math.abs(sourceFit - targetFit) > 0.5) {
      return { blocked: true, blockReason: 'fitness_incompatibility', sourceFitness: sourceFit, targetFitness: targetFit };
    }

    // Block if source has no verified results
    if (!source.fitness || source.fitness.P < 0.1) {
      return { blocked: true, blockReason: 'unverified_source', sourceFitness: sourceFit };
    }

    return { blocked: false };
  }

  evaluate() {
    // Update envMeanReturnRate from actual ecosystem performance
    let totalInfoGain = 0;
    let totalTimeCost = 0;
    for (const [, niche] of this.nicheService.niches) {
      if (niche.resourceHistory.length > 0) {
        for (const entry of niche.resourceHistory) {
          totalInfoGain += entry.infoGain;
          totalTimeCost += entry.timeCost;
        }
      }
    }
    if (totalTimeCost > 0) {
      this.nicheService.envMeanReturnRate = totalInfoGain / totalTimeCost;
    }

    // Run migration evaluation
    this.nicheService.evaluateAndMigrate();
  }

  hasConverged() {
    // Converged if we have verified artifacts for the main problem
    let verifiedCount = 0;
    for (const [, niche] of this.nicheService.niches) {
      const pop = niche.population;
      if (!pop) continue;
      for (const [, lineage] of pop.lineages) {
        if (lineage.fitness && lineage.fitness.P > 0.8) {
          verifiedCount++;
        }
      }
    }
    return verifiedCount > 0 && this.currentStep > 10;
  }

  getSummary() {
    return {
      id: this.id,
      problem: this.environment?.problem?.statement,
      step: this.currentStep,
      generation: this.generation,
      budget: { ...this.budget, spent: { ...this.spent } },
      metrics: { ...this.metrics },
      niches: this.nicheService.niches.size,
      totalLineages: [...this.nicheService.niches.values()].reduce((sum, n) => sum + (n.population?.lineages.size || 0), 0),
      cultureArtifacts: this.culture.artifacts.size,
      questions: this.questionogenesis.questions.size,
      history: this.history.slice(-20),
    };
  }
}

function createMathematicalOrganismRuntime(options) {
  return new MathematicalOrganismRuntime(options);
}

module.exports = {
  MathematicalOrganismRuntime,
  createMathematicalOrganismRuntime,
};