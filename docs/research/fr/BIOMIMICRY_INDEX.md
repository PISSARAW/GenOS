> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Index des Concepts Biomimétiques Non Exploités — Propositions de Recherche

Cet index recense les 66 concepts biologiques proposés en extension de GenOS, un document par concept dans `docs/research/fr/`. Chaque document suit le gabarit : fondement biologique → formalisation → mapping vers les primitives existantes → cas d'usage → apports attendus → points d'intégration.

## 1. Biologie du développement
| Concept | Document | Apport clé |
|---|---|---|
| Embryogenèse | `BIOMIMICRY_EMBRYOGENESIS.md` | Boot progressif par phases scellées |
| Gènes Hox | `BIOMIMICRY_HOX_GENES.md` | Ordre colinéaire d'activation des capacités |
| Canalisation | `BIOMIMICRY_CANALIZATION.md` | Métrique de robustesse phénotypique (Waddington) |
| Métamorphose | `BIOMIMICRY_METAMORPHOSIS.md` | Reconfiguration majeure auditable |
| Régénération | `BIOMIMICRY_REGENERATION.md` | Reconstruction par blastème après perte partielle |
| Plans d'organisation | `BIOMIMICRY_BODY_PLANS.md` | Archétypes d'agents (phylas) réutilisables |

## 2. Neurosciences & endocrinologie
| Concept | Document | Apport clé |
|---|---|---|
| Système endocrinien | `BIOMIMICRY_ENDOCRINE_SYSTEM.md` | Signalisation flotte entière longue durée |
| Neuromodulation dopaminergique | `BIOMIMICRY_NEUROMODULATION.md` | Erreur de prédiction de récompense pour MCTS |
| Arc réflexe | `BIOMIMICRY_REFLEX_ARC.md` | Double voie rapide/lente |
| Cervelet | `BIOMIMICRY_CEREBELLUM.md` | Procéduralisation des compétences répétées |
| Replay hippocampique | `BIOMIMICRY_HIPPOCAMPAL_REPLAY.md` | Consolidation hors-ligne depuis le DAG |
| Rythmes circadiens | `BIOMIMICRY_CIRCADIAN_RHYTHMS.md` | Chronobiologie des opérations |
| Allostasie | `BIOMIMICRY_ALLOSTASIS.md` | Anticipation prospective de la charge |
| Plasticité cross-modale | `BIOMIMICRY_CROSS_MODAL_PLASTICITY.md` | Substitution de canaux défaillants |

## 3. Immunologie
| Concept | Document | Apport clé |
|---|---|---|
| Mémoire immunitaire / vaccination | `BIOMIMICRY_IMMUNE_MEMORY.md` | Immunisation proactive par adversaires atténués |
| Inflammation / fièvre | `BIOMIMICRY_INFLAMMATION.md` | Mode dégradé global auto-résolutif |
| Auto-immunité | `BIOMIMICRY_AUTOIMMUNITY.md` | Méta-surveillance des faux positifs défensifs |
| Interférons | `BIOMIMICRY_INTERFERONS.md` | Alerte préventive du voisinage à risque |
| Résistance systémique acquise | `BIOMIMICRY_SAR.md` | Immunité durable héritable |

## 4. Écologie & évolution
| Concept | Document | Apport clé |
|---|---|---|
| Mutualisme | `BIOMIMICRY_MUTUALISM.md` | Coopération contractuelle co-évolutive |
| Commensalisme | `BIOMIMICRY_COMMENSALISM.md` | Réutilisation d'artefacts à coût nul |
| Spéciation allopatrique | `BIOMIMICRY_SPECIATION.md` | Divergence contrôlée, compatibilité de merge |
| Équilibres ponctués | `BIOMIMICRY_PUNCTUATED_EQUILIBRIA.md` | Sortie automatique des plateaux |
| Radiation adaptative | `BIOMIMICRY_ADAPTIVE_RADIATION.md` | Exploitation systématique des innovations |
| Sélection sexuelle | `BIOMIMICRY_SEXUAL_SELECTION.md` | Signaux honnêtes coûteux pour le breeding |
| Sélection de parentèle | `BIOMIMICRY_KIN_SELECTION.md` | Allocation Hamilton r·B > C aux lignées |
| Altruisme réciproque | `BIOMIMICRY_RECIPROCAL_ALTRUISM.md` | Anti-free-riding par jeux évolutionnaires |
| Bet-hedging | `BIOMIMICRY_BET_HEDGING.md` | Assurance par diversification sous incertitude |
| Succession écologique | `BIOMIMICRY_ECOLOGICAL_SUCCESSION.md` | Déploiement graduel pionniers → climax |
| Extinction de masse | `BIOMIMICRY_MASS_EXTINCTION.md` | Purges contrôlées + ré-émission fossile |

## 5. Comportement animal
| Concept | Document | Apport clé |
|---|---|---|
| Apprentissage social | `BIOMIMICRY_SOCIAL_LEARNING.md` | Tutorat par replay pédagogique |
| Empreinte | `BIOMIMICRY_IMPRINTING.md` | Ancrage initial contrôlé (période sensible) |
| Conditionnement | `BIOMIMICRY_CONDITIONING.md` | Associations stimulus-résultat au niveau état |
| Jeu animal | `BIOMIMICRY_PLAY.md` | Budget protégé d'exploration sans enjeu |
| Migration animale | `BIOMIMICRY_MIGRATION.md` | Navigation planifiée entre mondes |
| Territorialité | `BIOMIMICRY_TERRITORIALITY.md` | Zones de responsabilité exclusives |
| Taxis | `BIOMIMICRY_TAXIS.md` | Mouvements orientés quasi gratuits |
| Thanatose / deimatisme | `BIOMIMICRY_THANATOSIS.md` | Feintes défensives passives |
| Mimétisme | `BIOMIMICRY_MIMICRY.md` | Détection d'usurpation, signaux partagés |
| Alarmes typées | `BIOMIMICRY_TYPED_ALARM_CALLS.md` | Communication à référents structurés |
| Cache dispersé | `BIOMIMICRY_SCATTER_HOARDING.md` | Persistance résiliente multi-sites |

## 6. Biologie cellulaire & moléculaire
| Concept | Document | Apport clé |
|---|---|---|
| Checkpoints du cycle cellulaire | `BIOMIMICRY_CELL_CYCLE_CHECKPOINTS.md` | Gates de progression obligatoires par phase |
| Chaperonnes moléculaires | `BIOMIMICRY_CHAPERONES.md` | Réparation conservative avant destruction |
| Protéostase (ubiquitine) | `BIOMIMICRY_PROTEOSTASIS.md` | Marquage décisionnel avant nettoyage |
| Cascades de signalisation | `BIOMIMICRY_SIGNALING_CASCADES.md` | Amplification graduée des signaux faibles |
| Potentiels d'action | `BIOMIMICRY_ACTION_POTENTIALS.md` | Propagation tout-ou-rien des décisions critiques |
| Gap junctions | `BIOMIMICRY_GAP_JUNCTIONS.md` | Couplage direct sélectif avec découplage |
| Barrière hémato-encéphalique | `BIOMIMICRY_BLOOD_BRAIN_BARRIER.md` | Frontières à perméabilité contrôlée |
| Matrice extracellulaire | `BIOMIMICRY_EXTRACELLULAR_MATRIX.md` | Infrastructure porteuse persistante |
| Mitose contrôlée | `BIOMIMICRY_CONTROLLED_MITOSIS.md` | Clonage vérifié de capacités éprouvées |
| Endosymbiose | `BIOMIMICRY_ENDOSYMBIOSIS.md` | Intégration permanente d'outils externes |
| Transition multicellulaire | `BIOMIMICRY_MULTICELLULARITY.md` | Agrégation élastique en super-organisme |

## 7. Biologie végétale
| Concept | Document | Apport clé |
|---|---|---|
| Tropismes | `BIOMIMICRY_TROPISM.md` | Réallocation continue vers les signaux positifs |
| Thigmonastie | `BIOMIMICRY_THIGMONASTY.md` | Réflexes moteurs ultra-rapides pré-câblés |
| Dormance / dispersion des graines | `BIOMIMICRY_SEED_DISPERSAL.md` | Reproduction différée conditionnelle |
| Abscission | `BIOMIMICRY_ABSCISSION.md` | Retrait programmé et récupératrice des modules |
| Endurcissement | `BIOMIMICRY_HARDENING.md` | Acclimatation certifiée au stress |

## 8. Concepts théoriques & systèmes
| Concept | Document | Apport clé |
|---|---|---|
| Autopoïèse | `BIOMIMICRY_AUTOPOIESIS.md` | Critère formel de viabilité autonome |
| Homéorrhésie | `BIOMIMICRY_HOMEORHESIS.md` | Stabilité de trajectoire (cap) plutôt que point fixe |
| Dégénérescence | `BIOMIMICRY_DEGENERACY.md` | Redondance hétérogène anti-correlated failures |
| Structures dissipatives | `BIOMIMICRY_DISSIPATIVE_STRUCTURES.md` | Fondement flux/entropie des budgets |
| Horloge développementale | `BIOMIMICRY_DEVELOPMENTAL_CLOCK.md` | Triple âge : généalogique/développemental/fonctionnel |

## 9. Sénescence & cycle de vie
| Concept | Document | Apport clé |
|---|---|---|
| Télomères / Hayflick | `BIOMIMICRY_TELOMERES.md` | Limite de forks forcant le brassage |
| Sénescence cellulaire | `BIOMIMICRY_CELLULAR_SENESCENCE.md` | Détection et élimination des zombies |
| Néoténie | `BIOMIMICRY_NEOTENY.md` | Conservation démographique de la plasticité |
| Sénescence négligeable | `BIOMIMICRY_NEGLIGIBLE_SENESCENCE.md` | Longévité sous surveillance renforcée |

## Priorisation suggérée (impact/effort)
1. Checkpoints du cycle cellulaire — aligne et systématise le merge gating existant.
2. Chaperonnes moléculaires — comble le trou entre autophagie et rollback.
3. Vaccination + interférons + SAR — complète la chaîne immunitaire existante.
4. Mutualisme + altruisme réciproque — équilibre l'écosystème face au parasitisme déjà implémenté.
5. Procéduralisation cérébelleuse + replay hippocampique — valorise le DAG causal déjà stocké.

## Statut d'implémentation (triptyque code + MCP + CLI)

| Concept | Module core | Tool MCP | CLI | Doc feature |
|---|---|---|---|---|
| Checkpoints du cycle cellulaire | `genos-core::biomimicry::cycle_checkpoints` | `biomimicry_gate_evaluate` | `bio-feature --feature gate` | `docs/3-features-and-domain/biomimicry/cycle-checkpoints.md` |
| Chaperonnes moléculaires | `genos-core::biomimicry::chaperone` | `biomimicry_chaperone_repair` | `bio-feature --feature chaperone` | `docs/3-features-and-domain/biomimicry/chaperones.md` |
| Mémoire immunitaire / vaccination | `genos-core::biomimicry::vaccination` | `biomimicry_vaccinate` | `bio-feature --feature vaccination` | `docs/3-features-and-domain/biomimicry/vaccination.md` |
| Interférons | `genos-core::biomimicry::interferon` | `biomimicry_interferon_emit` | `bio-feature --feature interferon` | `docs/3-features-and-domain/biomimicry/interferons.md` |
| Résistance systémique acquise | `genos-core::biomimicry::sar` | `biomimicry_sar_prime` | `bio-feature --feature sar` | `docs/3-features-and-domain/biomimicry/sar.md` |
| Altruisme réciproque | `genos-core::biomimicry::reciprocity` | `biomimicry_reciprocity_decide` | `bio-feature --feature reciprocity` | `docs/3-features-and-domain/biomimicry/reciprocity.md` |
| Procéduralisation cérébelleuse | `genos-core::biomimicry::proceduralization` | `biomimicry_skill_proceduralize` | `bio-feature --feature proceduralization` | `docs/3-features-and-domain/biomimicry/proceduralization.md` |
| Mutualisme / symbiose | `genos-core::organization::symbiosis` (commit dc6cfbe) | — | — | — |

Les 58 concepts restants restent au stade proposition (`BIOMIMICRY_*.md` dans ce dossier).

> Chaque concept est indépendant ; aucun ne modifie les invariants fondamentaux (`spec/GENOME_SPEC.md`) : séparation génotype/phénotype/état, DAG causal immuable, neutralité provider, isolation stricte des mondes forkés.
