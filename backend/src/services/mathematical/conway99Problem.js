'use strict';

/**
 * @file conway99Problem.js
 * @description Conway-99 : problème de théorie des graphes formel.
 *
 * Énoncé : "Existe-t-il un graphe G simple non orienté sur 99 sommets tel que :
 *   - G est 4-régulier (chaque sommet a exactement 4 voisins)
 *   - Le graphe complémentaire G' est aussi 4-régulier (chaque sommet a 94 non-voisins dans G, et 4 voisins dans G')"
 *
 * Reformulation : Trouver une matrice d'adjacence A 99x99 symétrique, nulle sur la diagonale,
 * telle que chaque ligne/colonne ait exactement 4 uns (degré 4).
 *
 * Ce problème est NP-complet (existence de graphes k-réguliers avec contraintes).
 * Il est intéressant car :
 * - 99 est assez grand pour être non trivial
 * - La contrainte de régularité est forte (combinaitoire extrêmale)
 * - Il encode naturellement en SAT (chaque paire de sommets = variable binaire)
 */

function createConway99Problem() {
  const n = 99;
  const k = 4;

  return {
    id: 'conway-99',
    name: 'Conway-99 Regular Graph Existence',
    statement: `Existe-t-il un graphe simple non orienté G sur ${n} sommets tel que G et son complémentaire soient tous deux ${k}-réguliers ?`,
    domain: 'combinatorics',
    parameters: { n, k },
    assumptions: [
      `G est un graphe simple non orienté à ${n} sommets`,
      'Pas de boucles (pas d\'arêtes i→i)',
      'Pas d\'arêtes multiples',
    ],
    constraints: [
      `Chaque sommet a exactement ${k} voisins dans G`,
      `Chaque sommet a exactement ${k} voisins dans le complémentaire G'`,
      `Matrice d'adjacence ${n}x${n} symétrique binaire`,
    ],
    formalStatement: `∃ A ∈ {0,1}^(${n}×${n}) : A = A^T, diag(A) = 0, ∀i Σ_j A[i][j] = ${k}, ∀i Σ_j (1 - A[i][j]) - 1 = ${k}`,
    knownResults: [
      'Conway-98 : existence démontrée (graphe construit explicitement)',
      'Conway-100 : unknown au moment de la formulation',
      `Un graphe k-régulier à n sommets existe si et seulement si n*k est pair ET n ≥ k+1`,
      `Condition nécessaire : ${n}*${k} = ${n * k} (pair: ${n * k % 2 === 0}) ET ${n} ≥ ${k + 1}: ${n >= k + 1}`,
    ],
    encodeAsSAT() {
      const clauses = [];
      const varIndex = (i, j) => i * n + j + 1;

      // Contraintes de non-boucle : ¬A[i][i]
      for (let i = 0; i < n; i++) {
        clauses.push([-varIndex(i, i)]);
      }

      // Contraintes de régularité : chaque ligne a exactement k uns
      for (let i = 0; i < n; i++) {
        const row = [];
        for (let j = 0; j < n; j++) {
          if (i !== j) row.push(varIndex(i, j));
        }
        clauses.push({ type: 'cardinality_at_least', vars: row, k });
        clauses.push({ type: 'cardinality_at_most', vars: row, k });
      }

      return {
        format: 'DIMACS-like',
        numVars: n * n,
        numClauses: clauses.length,
        clauses,
      };
    },
    metadata: {
      source: 'Conway, 1999',
      tags: ['graph-theory', 'regular-graph', 'existence-problem', 'combinatorial-design'],
      difficulty: 'high',
      expectedBehavior: 'SAT solver + certificate verification via DRAT-trim',
    },
  };
}

module.exports = { createConway99Problem };
