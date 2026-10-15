'use strict';

// Condensed decision signals from docs/02-orchestration/topologies/*.md.
// These descriptions are routing priors, not measured outcome predictions.
const PROFILES = Object.freeze({
  trinity: {
    controlled: 'baseline reproductible comparaison strategies fixes controle experience',
    heterogeneous: 'diversite modeles fournisseurs independants erreurs correlees monoculture',
    adversarial: 'refutation contre exemple attaque defense robustesse falsification',
    counterfactual: 'hypotheses alternatives premisses scenarios sensibilite si budget',
    factorial: 'facteurs repetitions grille experimentale approche modele validation',
    pareto: 'objectifs multiples qualite cout latence compromis non domines',
    jury: 'jugement aveugle anonymat biais juges evaluation consultative',
    recursive: 'decomposition sous probleme recursion experience enfant hierarchie',
    adaptive: 'incertitude verifiee continuation allocation budget mondes',
    temporal: 'horizons temporels urgence court long terme effets differes',
    oracular: 'predire meilleur monde routeur prediction calibration ex ante',
    exploratory: 'creativite nouveaute ideation divergence niches solutions ouvertes'
  },
  a_team: {
    expert_committee: 'decision transverse avis experts independants deliberation quorum',
    pipeline: 'etapes lineaires collecte extraction transformation publication handoff',
    project_dag: 'graphe dependances branches paralleles jointures integration livrable',
    cross_functional_pod: 'fonctionnalite bout en bout equipe autonome design implementation validation',
    boundary_spanner: 'traduction interface domaines vocabulaires semantiques contrats',
    matrix_team: 'double autorite fonctionnelle produit expert rare partage',
    tiger_team: 'intervention urgente ciblee incident critique mandat timebox',
    incident_command: 'panne multiservice commandement roles escalade sitrep crise',
    multiteam: 'plusieurs equipes autonomes programme conseil integration sous objectifs',
    adaptive: 'competences manquantes recrutement reconfiguration phases perimetre evolutif',
    relay_team: 'contexte exclusif relais sequentiel detenteur unique passation'
  },
  biome: {
    resource: 'budget limite allocation ressources niches populations penurie quotas',
    exploration: 'recherche inconnue debugging prospection patches curiosite information',
    quality_diversity: 'qualite diversite elites archive couverture solutions distinctes',
    successional: 'phases succession populations colonisation stabilisation projet long',
    resilience: 'perturbation extinction refuge recolonisation redondance recuperation',
    persistent: 'missions durables saisons depot organisation memoire environnement',
    open_ended: 'nouvelles niches nouveaux environnements decouverte ouverte generation',
    adversarial: 'populations attaque defense coevolution vulnerabilite defi mitigation',
    knowledge: 'sources provenance corroboration contradictions recherche litterature',
    compute: 'fournisseurs cpu gpu cloud quota latence energie materiel',
    multi_scale: 'individus populations communautes niveaux echelles coordination globale'
  },
  biocenose: {
    epistemic_jury: 'juges independants preuves verdict validation audit revue',
    delphi_community: 'experts anonymes tours estimation incertitude feedback agregat',
    adversarial_assembly: 'refutation attaque defense reviewer robustesse stress test',
    forecasting_crowd: 'probabilite prevision evenement risque calibration brier horizon',
    argumentation_community: 'graphe arguments claims supports attaques premisses controverse',
    polycentric_council: 'conseils locaux federation regions clusters jugement multi echelle',
    byzantine_resilient_community: 'participants compromis collusion quarantaine preuves empoisonnees',
    minority_preserving_jury: 'dissensus objections minoritaires veto consensus risque',
    representative_community: 'panel stratifie representation population perspectives groupes',
    persistent_community: 'communaute durable reputation historique rotation longitudinal',
    human_ai_deliberation: 'autorite humaine valeurs ethique norme arbitrage humain',
    hybrid_oracle_community: 'verificateur deterministe tests preuves formelles claim factuel'
  },
  holobionte: {
    organelle: 'capacite coeur fondamentale stable dependance essentielle identite',
    'adaptive-microbiome': 'specialistes changeants remplacement utilite diversite adaptation',
    'immune-critical': 'securite menaces secrets invariants risque validation immunitaire',
    'local-first': 'hors ligne sans reseau appareil local donnees souverainete',
    regenerative: 'panne reparation restauration regeneration symbiote essentiel',
    'cloud-core/edge-symbionts': 'hote cloud specialistes edge distribution sites capteurs',
    'edge-core/cloud-symbionts': 'coeur edge local cloud demande latence confidentialite',
    'memory-rich': 'memoire historique consolidation provenance apprentissage longitudinal',
    'competitive-partner': 'specialistes concurrents comparaison budget egal challenger',
    procedural: 'workflow procedure etapes capacite manquante recrutement contrat',
    tool: 'outil api cli effet externe manifeste bail invocation',
    'cloud-core/edge-sync': 'cloud edge synchronisation asynchrone replicas horloges causalite'
  },
  syncytium: {
    hard: 'ressource critique ordre commit lease fencing coherence stricte',
    soft: 'metriques compteurs convergence eventual staleness divergence temporaire',
    code: 'code refactor fichiers imports compilation tests merge',
    document: 'document edition texte sections commentaires attribution collaboration',
    graph: 'graphe noeuds aretes relations dependances integrite cycles',
    transactional: 'transaction budget inventaire reservation atomique debit idempotence',
    epistemic: 'claims preuves refutations provenance connaissances contradictions',
    blackboard: 'tableau noir observations taches file partagee priorites',
    localFirst: 'appareils hors ligne file locale deconnexion reconciliation',
    speculative: 'branches contrefactuelles snapshots promotion alternatives isolees',
    hierarchical: 'regions domaines autorite niveaux frontieres multi echelle',
    realtimeControl: 'temps reel deadline watchdog controle signal surete arret',
    humanAi: 'approbation humaine consentement agent autorite retrait'
  },
  rhizome: {
    exploratory: 'capacites inconnues recherche scouts territoire exploration',
    routing: 'chemins etablis flux routage cout risque latence providers',
    growth: 'capacite manquante extension reseau branche nouveau noeud',
    resilient: 'panne chemins secours redondance continuite service',
    sparse: 'budget limite ponts rares faible densite coordination',
    persistent: 'missions longues traces durables routes memoire continue',
    ephemeral: 'mission courte temporaire graphe jetable fermeture',
    small_world: 'hubs chemins courts faible diametre nombre sauts',
    private: 'donnees confidentielles quarantaine confiance domaine prive',
    cross_representation: 'representations heterogenes traduction pont semantique formats',
    procedural: 'procedure reproductible sequence pipeline propagation',
    self_healing: 'auto reparation reconfiguration panne routes providers'
  },
  metapopulation: {
    classic_patch: 'patches stables extinction locale recolonisation fondateurs',
    island_search: 'optimisation dure solveurs ilp sat ilots recherche incumbents',
    heterogeneous_islands: 'algorithmes modeles strategies differents ilots diversite',
    source_sink: 'sources sinks ressources inegales migration dirigee reserve',
    rescue_network: 'fonction critique secours recolonisation redondance panne',
    stepping_stone: 'migration rare voisins corridors locaux diversite',
    anti_synchrony: 'echec correle synchronie firebreaks diversite strategique',
    federated: 'regions souverainete donnees privees contrat minimisation attestation',
    ephemeral_patch: 'instances temporaires patches intermittents expiration cloud',
    persistent: 'demes residents missions longues memoire historique baux',
    evolutionary: 'mutation genomes reproduction fitness speciation evolution continue',
    cultural: 'procedures artefacts culture transmission entre demes'
  }
});

module.exports = { PROFILES };
