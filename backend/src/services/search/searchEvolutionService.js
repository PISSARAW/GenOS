/**
 * Evolution of Search Processes — Phase 11.
 *
 * Les individus représentent des processus de recherche (SearchGenome),
 * pas des vecteurs numériques abstraits.
 */

const { createRandomGenome, mutateGenome, crossoverGenome } = require('./searchGenomeService')

class SearchEvolutionEngine {
  constructor(options = {}) {
    this.populationSize = options.populationSize || 6;
    this.generation = 0;
    this.population = [];
    this.generationHistory = [];
  }

  initialize() {
    this.population = [];
    for (let i = 0; i < this.populationSize; i++) {
      this.population.push(createRandomGenome());
    }
    this.generation = 0;
  }

  evaluateFitness(genome, environment) {
    let fitness = 0;

    // Bonus pour les familles d'hypothèses qui ont marché dans cet environnement
    if (environment.successfulFamilies.includes(genome.hypothesisFamily)) {
      fitness += 3;
    }

    // Pénalité pour les familles qui ont échoué
    if (environment.failedFamilies.includes(genome.hypothesisFamily)) {
      fitness -= 2;
    }

    // Bonus pour les stratégies adaptées
    if (environment.recommendedStrategies.includes(genome.strategy)) {
      fitness += 2;
    }

    // Diversité des opérateurs
    fitness += genome.operators.length * 0.5;

    // Pénalité pour l'exploration excessive
    fitness -= Math.abs(genome.exploration.radius - 0.3) * 2;

    return fitness;
  }

  selectParent(fitnesses) {
    const totalFitness = fitnesses.reduce((a, b) => a + Math.max(0, b), 0);
    if (totalFitness === 0) return Math.floor(Math.random() * this.population.length);

    let r = Math.random() * totalFitness;
    for (let i = 0; i < this.population.length; i++) {
      r -= Math.max(0, fitnesses[i]);
      if (r <= 0) return i;
    }
    return this.population.length - 1;
  }

  evolve(environment) {
    const fitnesses = this.population.map(g => this.evaluateFitness(g, environment));

    const newPopulation = [];

    // Élitisme: garder le meilleur
    const bestIdx = fitnesses.indexOf(Math.max(...fitnesses));
    newPopulation.push(this.population[bestIdx]);

    while (newPopulation.length < this.populationSize) {
      const p1 = this.selectParent(fitnesses);
      const p2 = this.selectParent(fitnesses);

      let child;
      if (Math.random() < 0.7) {
        child = crossoverGenome(this.population[p1], this.population[p2]);
      } else {
        child = mutateGenome(this.population[p1], 'medium');
      }

      // Mutation légère occasionnelle
      if (Math.random() < 0.2) {
        child = mutateGenome(child, 'minimal');
      }

      newPopulation.push(child);
    }

    this.population = newPopulation;
    this.generation++;

    this.generationHistory.push({
      generation: this.generation,
      bestFitness: Math.max(...fitnesses),
      avgFitness: fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length,
      diversity: this.calculateDiversity()
    });

    return this.generationHistory[this.generationHistory.length - 1];
  }

  calculateDiversity() {
    const strategies = new Set(this.population.map(g => g.strategy));
    const families = new Set(this.population.map(g => g.hypothesisFamily));
    return { strategies: strategies.size, families: families.size };
  }

  getBestGenome() {
    return this.population[0];
  }
}

module.exports = { SearchEvolutionEngine }
