'use strict';

const assert = require('node:assert/strict');

const CASES = [
  ['trinity', 'Explique le démarrage lent, confronte les explications concurrentes et réfute-les.', 'adversarial'],
  ['trinity', 'La conclusion doit survivre à une tentative systématique de réfutation.', 'adversarial'],
  ['trinity', 'Compare contention, garbage collection et réseau avec les preuves contraires.', 'controlled'],
  ['trinity', 'Compare trois architectures selon coût, latence, risque et front de Pareto.', 'pareto'],
  ['trinity', 'Résous les 12 pièces en trois pesées et prouve tous les cas.', 'adversarial'],
  ['trinity', 'Minimise temps, coût, risque et énergie, puis conserve les solutions non dominées.', 'pareto'],
  ['a_team', 'Conçois une fonctionnalité avec parcours utilisateur, backend et sécurité.', 'cross_functional_pod'],
  ['a_team', 'Définis le contrat HTTP, les validations et les messages UI de cette API.', 'boundary_spanner'],
  ['a_team', 'Organise le Work Graph et les dépendances entre spécialistes.', 'project_dag'],
  ['a_team', 'Conçois le checkout e-commerce et explicite ses interfaces inter-domaines.', 'cross_functional_pod'],
  ['a_team', 'Repère les capability gaps et recrute les expertises manquantes.', 'adaptive'],
  ['a_team', 'Construis le Work Graph, les handoffs typés et les gates d’intégration.', 'project_dag'],
  ['biome', 'Explore plusieurs explications distinctes et élimine les pistes stériles.', 'exploration'],
  ['biome', 'Explore les doublons intermittents sans fixer les pistes au départ.', 'exploration'],
  ['biome', 'Trouve 20 façons substantiellement différentes et préserve plusieurs familles.', 'quality_diversity'],
  ['biome', 'Autorise l’apparition de nouvelles niches quand les observations le justifient.', 'open_ended'],
  ['biome', 'Laisse émerger des niches architecturales et conserve leurs élites.', 'open_ended'],
  ['biome', 'Fais naître, fusionner ou disparaître les niches selon leur pouvoir explicatif.', 'open_ended'],
  ['biocenose', 'Compare REST et GraphQL, en gardant les objections minoritaires.', 'minority_preserving_jury'],
  ['biocenose', 'Évalue le changement de session avec sécurité, UX et opérations; ne force pas le consensus.', 'adversarial_assembly'],
  ['biocenose', 'Cartographie arguments, contre-arguments et désaccords persistants.', 'minority_preserving_jury'],
  ['biocenose', 'Détermine ce que permettent les résultats A/B et quelles preuves manquent.', 'epistemic_jury'],
  ['biocenose', 'Revue sécurité: une vulnérabilité reproductible peut bloquer le consensus majoritaire favorable.', 'adversarial_assembly'],
  ['biocenose', 'Préserve les désaccords sur les benchmarks et demande une réplication indépendante.', 'minority_preserving_jury'],
  ['holobionte', 'Change un mot de passe; l’immunité rejette les failles et la mémoire conserve les règles.', 'immune-critical'],
  ['holobionte', 'Fais tourner les clés API sans secrets dans les logs et avec rollback.', 'immune-critical'],
  ['holobionte', 'Renomme une colonne sans perte et valide les invariants de sécurité.', 'immune-critical'],
  ['holobionte', 'L’immunité bloque toute faille de récupération d’une authentification passkey.', 'immune-critical'],
  ['holobionte', 'Corrige une vulnérabilité critique sans désactiver les contrôles.', 'immune-critical'],
  ['holobionte', 'Gère secrets multi-tenant, révocation, chiffrement et compromission.', 'immune-critical'],
  ['syncytium', 'Construisez un glossaire unique et sans contradiction pour sept termes.', 'document'],
  ['syncytium', 'Maintenez un graphe partagé acyclique pour ces dépendances.', 'graph'],
  ['syncytium', 'Faites évoluer le contrat API sans rupture de compatibilité pendant deux versions.', 'code'],
  ['syncytium', 'Reconstruisez une timeline causale unique depuis les logs et les décalages d’horloge.', 'epistemic'],
  ['syncytium', 'Partagez le contrat logique et les tests pendant la migration d’API.', 'code'],
  ['syncytium', 'Paiement, remboursement et idempotence doivent partager des invariants atomiques.', 'transactional'],
  ['rhizome', 'Fais apparaître de nouvelles branches lorsqu’un maillon nécessaire est découvert.', 'growth'],
  ['rhizome', 'Crée une branche pour explorer chaque dépendance inconnue.', 'growth'],
  ['rhizome', 'Étends le réseau quand DNS ou session store révèle une dépendance cachée.', 'growth'],
  ['rhizome', 'Détecte les interfaces manquantes dans une architecture encore inconnue.', 'growth'],
  ['rhizome', 'Reroute les branches d’analyse autour des impasses et des routes inutiles.', 'resilient'],
  ['rhizome', 'Crée des branches pour les consommateurs cachés et conserve des routes alternatives.', 'growth'],
  ['metapopulation', 'Trois populations utilisent des philosophies différentes et échangent des idées validées.', 'heterogeneous_islands'],
  ['metapopulation', 'Trois environnements locaux conservent leur fitness et migrent les techniques utiles.', 'heterogeneous_islands'],
  ['metapopulation', 'Quatre populations optimisent performance, lisibilité et mémoire avec migration locale.', 'heterogeneous_islands'],
  ['metapopulation', 'Injecte des idées entre lignées tout en conservant plusieurs stratégies évolutionnaires.', 'evolutionary'],
  ['metapopulation', 'Audite la sécurité par threat modeling et contre-exemples vérifiés localement.', 'conservative'],
  ['metapopulation', 'Après l’effondrement d’une population, recolonise depuis deux lignées et retrouve une solution viable.', 'resilient']
];

const SELECTORS = Object.freeze({
  trinity: (mission) => {
    const selected = require('../src/services/trinityVariantService').selectForMission(mission);
    return selected.selectedPreset || selected.variant;
  },
  a_team: (mission) => require('../src/services/aTeam/variants/variantRegistry').selectVariant({ goal: mission }),
  biome: (mission) => require('../src/services/biome/variants/variantPolicyService').select(mission).variant,
  biocenose: (mission) => require('../src/services/biocenose/variants/variantPolicyRouter').recommend(mission).name,
  holobionte: (mission) => require('../src/services/holobionteCoordinationService').composeHolobiont(mission).variant,
  syncytium: (mission) => require('../src/services/syncytium/variants/variantPolicyRegistry').selectPolicy(mission).id,
  rhizome: (mission) => require('../src/services/rhizome/variants/variantPolicyService').selectForMission(mission).selection.variant,
  metapopulation: (mission) => require('../src/services/metapopulation/policy/metapopulationPolicyService').selectVariant(mission).variant
});

function verifyCases() {
  assert.equal(CASES.length, 48);
  for (const [topology, mission, expected] of CASES) {
    assert.equal(SELECTORS[topology](mission), expected, `${topology}: ${mission}`);
  }
}

verifyCases();
console.log('Topology mission variant routing (48 fixtures): PASS');
