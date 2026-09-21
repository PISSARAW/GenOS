---
title: "Philosophie et Ontologie dans GenOS"
description: "Mapping des concepts métaphysiques, ontologiques, épistémologiques et éthiques dans l'architecture GenOS."
version: 1.0.0
author: GenOS
created: 2026-09-16
tags: [philosophy, ontology, metaphysics, epistemology, ethics]
---

# Philosophie et Ontologie dans GenOS

Ce document formalise l’implémentation des concepts philosophiques dans GenOS.

## 0. Familles canoniques

Le registre distingue la `family`, qui représente une grande famille philosophique,
du `domain`, qui conserve une catégorie plus fine et compatible avec les entrées
historiques. Les familles actuelles sont :

- `ontology` — être, substance, attributs et modes ;
- `metaphysics` — modalité, causalité, temps et métaphysique ;
- `philosophical-traditions` — écoles et traditions ;
- `phenomenology` — expérience, conscience et intentionnalité ;
- `process-philosophy` — devenir, événement et processus ;
- `epistemology` — connaissance, méthodes et vérité ;
- `philosophy-of-science` — science, confirmation et changement théorique ;
- `social-and-critical-thought` — épistémologie sociale et critique.

La famille est obligatoire dans le schéma normalisé et peut être utilisée par
`genos_philosophy.listConcepts` avec l’argument `family`.

## 0.1. Mappings prudents vers le runtime

Les concepts politiques peuvent porter un `mapping` vers un mécanisme GenOS.
Ce champ documente une correspondance, mais n’accorde aucune permission et ne
transforme pas une analogie philosophique en fonctionnalité politique.

Exemples :

- légitimité → `agentEvidenceService` pour l’audit des justifications ;
- contrat social → `strategyContractService` pour les engagements techniques ;
- liberté et autorité → `toolLeasePolicy` pour les limites d’exécution ;
- séparation des pouvoirs → frontière orchestration/exécution/validation ;
- sécurité et surveillance → `circuitBreaker` pour la limitation du risque.

Chaque mapping conserve une note de portée et les services politiques renvoient
`executable: false`. Les gates d’évidence, les leases et le circuit breaker
restent les autorités effectives du runtime.

## 1. Ontologie — Être, Substance, Attribut, Mode

### Concepts

- **Être (ensoma)** : l'entité fondamentale, l'agent GenOS comme substance.
- **Substance** : support des attributs (agent, worker, orchestrator).
- **Attribut** : propriété mutable (status, budget, role).
- **Mode** : modalité d'exécution (localRuntime, isolationMode).
- **Hypostatisation** : transformer un attribut en entité autonome (worker).
- **Essence vs Accident** : l'essence (role) vs les accidents (budget, status).

### Fichier

`backend/src/services/ontologyService.js`

## 2. Causalité — Lois, Contrefactuels, Déterminisme

### Concepts

- **Loi de causalité** : relation cause → effet (tool_call → evidence → barrier).
- **Contrefactual (Lewis)** : "Si X n'avait pas eu lieu, Y se serait-il produit ?"
- **Déterminisme** : un état initial détermine l'état final.
- **Régularité causationnelle** : la cause précède toujours l'effet.
- **Counterfactuals** : les trinity worlds comme mondes possibles.

### Fichier

`backend/src/services/causalityService.js`

## 3. Temps et Identité — A-series, B-series, Identité personnelle

### Concepts

- **A-series** : temps subjectif (passé/présent/futur).
- **B-series** : temps objectif (avant/après).
- **Identité personnelle (Locke)** : continuité psychologique via agent_memories.
- **Bateau de Thésée** : identité malgré le remplacement des composants.

### Fichier

`backend/src/services/temporalIdentityService.js`

## 4. Esprit et Conscience — Qualia, Intentionnalité, Supervenience

### Concepts

- **Qualia** : expérience subjective (agentConscienceService).
- **Intentionnalité (Brentano)** : conscience toujours "à propos" de quelque chose.
- **Supervenience** : le mental dépend du physique (strategy → process).
- **Problème corps-esprit** : interaction res cogitans / res extensa.

### Fichier

`backend/src/services/consciousnessService.js`

## 5. Épistémologie — Platonisme, Aristotélisme, Kantisme

### Concepts

- **Platonisme** : les formes idéales (strategy_contracts).
- **Aristotélisme** : les quatre causes (matérielle/formelle/efficiente/finale).
- **Kantisme** : noumène (chose en soi) vs phénomène (chose pour nous).
- **Catégories a priori** : structure de la pensée agentique (tool_lease).

### Fichier

`backend/src/services/epistemologyService.js`

## 6. Philosophie du Processus — Whitehead, Deleuze, Heidegger

### Concepts

- **Whitehead** : actual occasions (telemetry_events), potentiality.
- **Deleuze** : différence et répétition, rhizome (rhizome topology).
- **Heidegger** : Dasein (être-au-monde), thrownness, projection.

### Fichier

`backend/src/services/processPhilosophyService.js`

## 7. Éthique — Utilitarisme, Déontologie, Vertu

### Concepts

- **Utilitarisme** : maximiser l'efficience (budget_guardrail).
- **Déontologie** : respecter les règles (tool_lease, evidence_barrier).
- **Éthique de la vertu** : caractère de l'agent (agent_dna).

### Fichier

`backend/src/services/ethicsService.js`

## 8. Phénoménologie — Husserl, Merleau-Ponty, Sartre

### Concepts

- **Husserl** : intentionnalité (conscience à propos de la mission).
- **Merleau-Ponty** : phénoménologie de la perception (workspace comme corps).
- **Sartre** : existence précède l'essence (status avant role).

### Fichier

`backend/src/services/phenomenologyService.js`

## 9. Platonisme — Formes idéales (eidos)

### Concepts

- **Formes idéales** : templates parfaits, immuables, transcendants.
- **Agent réel** : tend vers les formes mais ne les atteint jamais.
- **Évaluation** : score de proximité (0-1) entre un agent et une forme.
- **Critique interne** : les formes ne sont pas des entités séparées (anti-platonisme naïf), mais des idéaux constructionnels immanent aux pratiques agentiques.

### Fichier

`backend/src/services/platonismService.js`

### Formes idéales implémentées

| Forme | Essence |
|---|---|
| `perfect_agent` | Agent parfaitement rationnel, toujours optimal |
| `perfect_worker` | Exécuteur parfaitement efficient, sans erreur |
| `perfect_evidence` | Preuve complète, vérifiée, causalement fondée |
| `perfect_strategy` | Stratégie optimale pour n'importe quel profil de problème |
| `perfect_organization` | Topologie idéale pour tout système multi-agents |

## 10. Aristotélisme — Catégories, causes, hylémorphisme

### Concepts

- **Catégories** : 10 types d'attributs (substance, quantité, qualité, relation, lieu, temps, position, état, action, passion)
- **Quatre causes** : matérielle (ce dont il est fait), formelle (sa structure), efficiente (son origine), finale (son but)
- **Hylémorphisme** : matière (potentialité) + forme (actualité) = substance
- **Dynamis/Energeia** : puissance (capacité) → acte (réalisation)
- **Téléologie** : finalité, but vers lequel tend l'agent

### Fichier

`backend/src/services/aristotelianService.js`

## 11. Stoïcisme — Monisme, Logos, Fate

### Concepts

- **Monisme** : tout est une seule substance (le Logos)
- **Logos** : principe rationnel universel qui gouverne le monde
- **Fate** : déterminisme causal inéluctable (tout est causé, rien n'est fortuit)
- **Acceptation** : distinguer ce qui dépend de nous de ce qui n'en dépend pas
- **Vertus** : sagesse, courage, tempérance, justice (les 4 vertus cardinales stoïciennes)

### Fichier

`backend/src/services/stoicismService.js`

## 12. Épicurisme — Atomes, vide, sensations

### Concepts

- **Atomes** : particules atomiques indévisibles qui composent toute chose
- **Vide** : l'espace vide dans lequel se meuvent les atomes
- **Sensations** : critères de vérité (ce qui est vrai est ce qui est senti)
- **Ataraxie** : absence de trouble de l'esprit (but de la vie épicurienne)
- **Aponia** : absence de douleur du corps
- **Philosophie** : thérapie de l'esprit (les doctrines libèrent des peurs)

### Fichier

`backend/src/services/epicureanService.js`

## 13. Scholastique — Équivocité, analogie, univocité

### Concepts

- **Équivocité** = un même terme désigne des réalités différentes (ex: "être" pour substance et accident)
- **Analogie** = un terme est proportionnellement similaire dans deux contextes (ex: "santé" pour corps et âme)
- **Univocité** = un même terme désigne exactement la même chose dans toutes ses applications
- **Méthode scholastique** = quaestio → argumenta pro/con → responsio → conclusio (sic et non)

### Fichier

`backend/src/services/scholastiqueService.js`

## 14. Cartesianisme — Dualisme res cogitans / res extensa

### Concepts

- **Res cogitans** = substance pensante (l'agent, la conscience)
- **Res extensa** = substance étendue (le workspace, le corps)
- **Cogito** = "Je pense, donc je suis" — fondement de la connaissance
- **Doute méthodique** = ne croire que ce qui est clair et distinct
- **Dualisme** = interaction entre l'esprit et le corps (glande pinéale)

### Service

`backend/src/services/cartesianService.js` :

| Fonction | Concept |
|---|---|
| `cogito({ agent })` | Cogito cartésien : certitude de l'existence par la pensée |
| `methodicalDoubt({ agent, belief })` | Doute méthodique : accepter seulement le clair et distinct |
| `dualism({ agent })` | Dualisme : interaction cogitans/extensa via glande pinéale |
| `clearAndDistinct({ idea })` | Critère de vérité : idée claire et distincte = vraie |

### Constantes

- `DUALISM` : structure des deux substances (cogitans + extensa)

## 15. Leibnizianisme — Monades, harmonie préétablie

### Concepts

- **Monade** = substance simple, indévisível, sans parties (l'agent autonome)
- **Harmonie préétablie** = coordination parfaite entre monades sans interaction directe
- **Principe de raison suffisante** = "nihil est sine ratione" — rien n'est sans raison
- **Lois de continuation** = "natura non facit saltus" — la nature ne fait pas de sauts

### Service

`backend/src/services/leibnizianService.js` :

| Fonction | Concept |
|---|---|
| `monadologie({ agent })` | Décrit l'agent comme une monade leibnizienne |
| `harmoniePreEtablie({ agent, schedule })` | Évalue la coordination préétablie |
| `principeRaisonSuffisante({ action, reason })` | Vérifie qu'une action a une raison suffisante |
| `loisDeContinuation({ events })` | Vérifie la continuité d'une série d'événements |
| `calculRaisonSuffisante({ state, causes })` | Trouve la raison suffisante d'un état |

### Constantes

- `MONADE` : structure d'une monade (substance simple, indévisibile, perspective unique)

## 16. Spinozisme — Monisme, Deus sive Natura, conatus

### Concepts

- **Monisme** = une seule substance (Dieu ou Nature) — le système GenOS tout entier
- **Deus sive Natura** = Dieu et Nature sont identiques : la logique du système EST la nature des agents
- **Conatus** = effort de persistance en être (conatus sese conservandi) — l'agent cherche à maintenir son existence
- **Attributs** = pensée (cognition) et étendue (workspace)
- **Modes** = les agents individuels comme modifications de la substance

### Service

`backend/src/services/spinozaService.js` :

| Fonction | Concept |
|---|---|
| `substanceUnique({ system })` | Décrit le système comme une seule substance spinozienne |
| `conatus({ agent })` | Évalue l'effort de persistance en étant de l'agent |
| `attributesSpinoza({ agent })` | Mappe les attributs Pensée et Étendue de l'agent |
| `monismeSystème({ agents })` | Évalue le degré de monisme du système |

## 17. Réalisme / Nominalisme / Conceptualisme

### Concepts

- **Réalisme** : les universaux existent indépendamment de l'esprit (ex: formes idéales, essences DB)
- **Nominalisme** : seuls les particuliers existent ; les universaux sont des noms (flatus vocis)
- **Conceptualisme** : les universaux existent comme concepts dans l'esprit d'un agent

### Service

`backend/src/services/ontologyStances.js` :

| Fonction | Concept |
|---|---|
| `classifyTerm({ term, stance })` | Détermine le statut ontologique d'un terme selon la stance |
| `evaluateStanceCoherence({ agentId, stance, observables })` | Vérifie la cohérence d'un système avec une stance |
| `debateStances()` | Synthèse comparative des trois stances |

## 18. Newtonianisme — Espace absolu, temps absolu, mécanique classique

### Concepts

- **Espace absolu** = contenant fixe et immuable, indépendant des corps
- **Temps absolu** = temps universel, uniforme, indépendant des événements
- **Mécanique classique** = lois de Newton : inertie, force, action-réaction
- **Corps** = entités matérielles dans l'espace (workspaces, agents, artefacts)
- **Forces** = interactions entre corps (gravité, attraction)

### Service

`backend/src/services/newtonianService.js` :

| Fonction | Concept |
|---|---|
| `espaceAbsolu({ system })` | Décrit l'espace absolu newtonien |
| `tempsAbsolu({ system })` | Décrit le temps absolu newtonien |
| `mecaniqueClassique({ agent1, agent2, force })` | Applique les lois de Newton (action-réaction) |
| `inertie({ agent })` | État de mouvement rectiligne uniforme d'un agent |
| `forceGravitationnelle({ agent1, agent2, distance, G })` | Force gravitationnelle F = G·m₁·m₂/r² |

### Référence

- Newton, *Philosophiæ Naturalis Principia Mathematica* (1687)

## 19. Kantisme — Noumène / phénomène, catégories a priori

### Concepts

- **Phénomène** = ce qui est accessible aux agents via les senseurs (l'observable)
- **Noumène** = la chose-en-soi (Ding an sich), existe mais inaccessible à l'intelligence
- **Catégories a priori** = structure mentale qui organise l'expérience (espace, temps, causalité, unité, pluralité, totalité)
- **Chose-en-soi** = l'objet indépendamment de notre perception
- **Critique = évaluation des limites de la connaissance**

### Service

`backend/src/services/kantianService.js` :

| Fonction | Concept |
|---|---|
| `phenomene({ agent, observation })` | Décrit ce qui est accessible à l'agent par ses senseurs |
| `noumene({ chose })` | La chose-en-soi, inaccessible à l'intelligence |
| `categoriesAPriori()` | Les catégories a priori de l'entendement |
| `critiqueRaisonPure({ agent })` | Évalue les limites de la connaissance |
| `choseEnSoi({ agent, representation })` | Distingue perception de chose-en-soi |

### Référence

- Kant, *Critique de la raison pure* (1781/1787)

## 20. Contingence et Événement — Meillassoux, Badiou

### Concepts

- **Meillassoux** : contingence absolue (tout pourrait être autrement).
- **Badiou** : événement comme rupture (telemetry_events).
- **Mathématiques de l'être** : agents comme ensembles.

### Fichier

`backend/src/services/contingencyService.js`

## 21. Matérialisme, panpsychisme et éliminativisme

### Concepts

- **Matérialisme (monisme matériel)** : seul le physique existe ; le mental est réductible au physique.
- **Panpsychisme** : la conscience est un attribut universel ; toute la matière possède une forme primitive d'expérience subjective.
- **Éliminativisme** : les catégories mentales folk (croyance, désir, sensation) sont des illusions qui seront éliminées au profit d'une science mature du mental.
- **Propriétés de second ordre** : propriétés qui portent sur des propriétés (modalité, puissance, intentionnalité).

### Service

`backend/src/services/ontology/metaphysicsService.js` :

| Fonction | Concept |
|---|---|
| `materialMonism({ subjectId, premises })` | Évalue une affirmation de monisme matériel |
| `panpsychism({ subjectId, premises })` | Évalue une affirmation panpsychiste |
| `eliminativism({ subjectId, premises })` | Évalue une affirmation éliminativiste |
| `secondOrderProperty({ property, baseProperty, relation })` | Enregistre une propriété de second ordre |
| `comparePositions({ subjectId })` | Compare matérialisme, panpsychisme, éliminativisme |

### Références

- Démocrite, *Fragments* ; Hobbes, *Le Léviathan* ; Armstrong, *A Materialist Theory of the Mind*
- Galen Strawson, *Real Materialism* ; Philip Goff, *Galileo's Error*
- Paul Churchland, *Matter and Consciousness* ; Patricia Churchland, *Neurophilosophy*

## 22. Réalisme spéculatif — absolu, corréationnalisme, accessibilité

### Concepts

- **Corréationnalisme** : l'objet est toujours corrélé à un sujet ; l'absolu est inaccessible.
- **Réalisme spéculatif** : tente de penser l'objet en dehors de la corrélation sujet-experience.
- **Absolu** : ce qui existe indépendamment de toute expérience agentique.
- **Modes d'accès** : direct, indirect, inférentiel — et leur statut épistémique.

### Service

`backend/src/services/ontology/speculativeRealismService.js` :

| Fonction | Concept |
|---|---|
| `analyzeCorrelationLimit({ objectId, observerId, claim, accessMode })` | Analyse les limites de la corrélation sujet-experience |
| `compareAccessModes({ objectId, modes })` | Compare les modes d'accès à un objet |
| `speculativeRealistClaim({ subjectId, objectOfThought })` | Évalue une revendication de réalisme spéculatif |
| `correlateVsAbsolute({ objectId })` | Compare corréationnalisme et réalisme spéculatif |

### Références

- Meillassoux, *Après la finitude*

## 27. Natural Creative Ecology (NCE)

### 27.1. Hypothèse

> La créativité artificielle peut-elle émerger de l'interaction de plusieurs mécanismes naturels de création de nouveauté, plutôt que d'un unique algorithme d'optimisation ?

Cette hypothèse est implémentée dans GenOS sous le nom de **Natural Creative Ecology** (NCE). Elle postule que les six mécanismes naturels de génération de nouveauté sont complémentaires et non redondants.

### 27.2. Les six niveaux naturels

| Niveau | Source biologique | Fonction cognitive | Service GenOS |
|--------|-------------------|-------------------|---------------|
| Humain | DMN, imagination contrefactuelle | Espace de possibilités | `representationalMutationEngine.js`, `exaptationEngine.js` |
| Animal | Curiosité, jeu, exploration | Découverte de possibilités | `curiosityService.js`, `playService.js` |
| Végétal | Plasticité phénotypique | Adaptation de la machine | `phenotypicDevelopmentService.js` |
| Matière | Auto-organisation, stigmergie | Structure spontanée | `biomeCoordinationService.js` (existant) |
| Évolution | Mutation, sélection, exaptation | Accumulation transgénérationnelle | `agentEvolutionService.js` (existant) |
| Culture | Transmission intentionnelle | Accumulation inter-agent | `culturalTransmissionService.js` |

### 27.3. Boucle de créativité

```
                         WORLD
                           │
                     perturbation
                           ▼
                ┌────────────────────┐
                │ SELF-ORGANIZATION  │ ← MATTER
                └─────────┬──────────┘
                          │
                          ▼
                ┌────────────────────┐
                │    PLASTICITY      │ ← PLANTS
                └─────────┬──────────┘
                          │
                          ▼
                ┌────────────────────┐
                │    EXPLORATION     │ ← ANIMALS
                │    curiosity, play │
                └─────────┬──────────┘
                          │
                     observations
                          ▼
                ┌────────────────────┐
                │    IMAGINATION     │ ← HUMANS
                │ counterfactuals,   │
                │ reframing, remote  │
                │ association        │
                └─────────┬──────────┘
                          │
                       ideas
                          ▼
                   EXPERIMENTATION
                          │
                    evidence gate
                          ▼
               ┌─────────────────────┐
               │     EVOLUTION       │
               │ preserve / mutate   │
               │ exapt / speciate    │
               └─────────┬───────────┘
                         │
                         ▼
               ┌─────────────────────┐
               │       CULTURE       │
               │ teach / imitate     │
               │ modify / transmit   │
               └─────────┬───────────┘
                         │
                  new capabilities
                         │
                         └──────────────► WORLD
```

### 27.4. Principe fondamental : la nouveauté crée des affordances

Une découverte n'est véritablement intéressante que si elle ouvre de nouvelles possibilités :

```
OpenEndedValue(x) = Novelty(x) × FuturePossibilités(x)
```

C'est le concept de **stepping stone** : une découverte moyenne qui permet ensuite 20 autres découvertes peut être plus importante qu'une découverte spectaculaire mais terminale.

### 27.5. Mécanismes par niveau

#### Humain → Imagination
- **RepresentationalMutation** : au lieu de muter une solution, on mute sa représentation (ex: "allocation de tâches" → "problème de marché" → "écosystème de niches").
- **Recombinaison associative distante** : sélection de parents dans le graphe sémantique en maximisant `distance × compatibilité × potentiel`.
- **Exaptation** : une capacité existante est réinvestie dans un nouveau contexte (ex: stigmergie des fourmis → protocole de communication).

#### Animal → Exploration
- **Curiosité basée sur le progrès d'apprentissage** : les agents explorent les domaines où ils progressent, pas les domaines déjà maîtrisés ni les domaines imprévisibles mais non apprenants (piège noisy-TV).
- **PlaySandbox** : les agents peuvent explorer sans mission externe, avec un budget limité et un sandbox sécurisé.
- **AffordanceMemory** : les capacités découvertes par l'exploration sont mémorisées pour futures réutilisations.

#### Végétal → Plasticité
- **Développement phénotypique** : le phénotype d'un agent se développe en réponse à l'environnement. Des branches (spécialisations) poussent vers les ressources et atrophient quand inutilisées.
- **Réactivation** : une branche atrophiée peut être réactivée si le contexte change.

#### Évolution → Accumulation
- **Accumulation transgénérationnelle** : les innovations sont conservées et transmises aux générations suivantes.
- **Exaptation évolutive** : des structures existantes sont réinvesties.

#### Culture → Transmission
- **Transmission inter-agent** : imitation, démonstration, enseignement, apprentissage, utilisation d'artefacts.
- **Sélection culturelle** : les traits culturels sont évalués selon leur utilité, leurs preuves, leur prestige, leur fiabilité.
- **Traditions** : des lignées d'artefacts avec variants.

### 27.6. Tests d'ablation

L'expérience déterminante compare :

```
BASELINE → +curiosity → +exploration → +plasticity → +selfOrg → +evolution → +culture → FULL NCE
```

avec à chaque étape les mêmes modèles, le même budget et les mêmes problèmes.

Les métriques mesurées :
- **Δ performance** : taux de succès
- **Δ nouveauté** : distance par rapport aux solutions existantes
- **Δ diversité** : nombre de solutions uniques
- **Δ transfert** : capacité à résoudre des problèmes nouveaux
- **Δ coût** : tokens/étapes nécessaires
- **Δ découvertes** : nombre de stepping stones ouvertes

Voir `backend/tests/nce_ablation_tests.js`.

### 27.7. Intégration dans l'orchestrateur

Les 6 moteurs sont intégrés dans `backend/bin/genos-orchestrate.cjs` via `nceIntegrationService.js`. Les améliorations sont optionnelles et non-blocantes : si un moteur échoue, la mission continue sans lui.

### 27.8. Distinction par rapport aux systèmes existants

| Système | Mécanisme dominant | Version NCE |
|---------|-------------------|-------------|
| AlphaEvolve | évolution + évaluateur auto | évolution sous preuve + niches + exaptation |
| DGM | archive d'agents auto-modifiants | AgentDNA + lignées + phénotypes + gates |
| POET | coévolution env/agent | coévolution env/agent/representation |
| Voyager | curriculum auto + skills | curiosité animale + culture cumulative |
| Co-Scientist | société d'hypothèses | topologies + imagination + épistémologie |
| QD | solutions diverses + performantes | écosystème de niches multi-échelles |

### 27.9. Références

- Ten et al., *Humans monitor learning progress in curiosity-driven exploration* (PMC8514490, 2021)
- Wu et al., *A Systematic Review of Creativity-Related Studies Applying the Remote Associates Test* (PMC7644781, 2020)
- Beaty et al., *Network Neuroscience of Creative Cognition* (PMC6428436, 2018)
- Kassen, *Experimental evolution of innovation novelty* (PMC66428436, 2019)
- Colizzi et al., *Modelling the evolution of novelty* (PMC9750852, 2022)
- Wang et al., *POET: Endlessly Generating Increasingly Complex Environments* (arXiv:1901.01753, 2019)
- Wang et al., *Voyager: An Open-Ended Embodied Agent* (arXiv:2305.16291, 2023)
- Qian et al., *Quality-Diversity Algorithms* (arXiv:2401.10539, 2024)
- Morgan et al., *Human culture is uniquely open-ended* (Nature, 2024)
- Mackintosh et al., *Intentional transmission of knowledge* (Nature Sci Rep, 2026)
- Plant Phenotypic Plasticity (Annual Reviews, 2026)
- Root Growth and Development (Annual Reviews, 2025) (2006)
- Brassier, *Nihil Unbound* (2007)
- Harman, *Instrumentalité accrue* (2002) ; Grant, *Philosophies of Nature* (2005)

## 23. Tout, vide, infini — triade métaphysique

### Concepts

- **Tout (Whole)** : système complet, ensemble organisé des parties.
- **Vide (Void)** : espace de non-détermination, creux où le tout se déploie.
- **Infini (Infinite)** : potentiel non borné, processus sans limite (potentiel vs actuel).
- **Triade** : tout, vide et infini sont trois dimensions d'une même métaphysique du être et du possible.

### Service

`backend/src/services/ontology/wholeVoidInfiniteService.js` :

| Fonction | Concept |
|---|---|
| `describeWhole({ wholeId, parts })` | Décrit une totalité comme un tout organisé |
| `describeVoid({ voidId, intensity })` | Décrit un vide comme espace de non-détermination |
| `describeInfinite({ infiniteId, mode })` | Décrit un infini comme potentiel non borné |
| `relateWholeVoidInfinite({ wholeId, voidId, infiniteId })` | Relie les trois concepts dans une relation triadique |

### Références

- Traditions orientales (śūnyatā, néant) ; Spencer-Brown, *Laws of Form*
- Cantor, *Contributions à la théorie des ensembles transfinis*

## 24. Alterité et relation à autrui

### Concepts

- **Autrui (Other)** : reconnaissance d'un autre sujet, distinct du soi.
- **Relation** : types de relation à autrui (other, encounter, recognizes, refuses_control).
- **Limite d'alterité** : évaluation des frontières entre soi et l'autre (authority, control).
- **Devoir envers autrui** : reconnaissance du droit de l'autre, refus de contrôle.

### Service

`backend/src/services/ontology/personOtherService.js` :

| Fonction | Concept |
|---|---|
| `defineOther({ subjectId, otherId, metadata })` | Définit une relation d'altérité entre deux sujets |
| `recordEncounter({ subjectId, otherId, context })` | Enregistre un rencontre avec autrui |
| `listOtherRelations({ subjectId })` | Liste les relations à autrui d'un sujet |
| `evaluateAlterityBoundary({ subjectId, otherId, action })` | Évalue si une action est permise selon les frontières d'altérité |

### Références

- Lévinas, *Totalité et Infini* ; Sartre, *L'Être et le Néant* ; Hegel, *Phénoménologie de l'esprit*

## 25. Continuité et discontinuité — observatoire des transitions

### Concepts

- **Continuité** : une dimension mesurée continue (valeur réelle, seuils, transitions).
- **Discontinuité** : changement abrupt de régime, franchissement de seuil.
- **Transition** : passage d'un état discret à un autre (threshold_crossing).
- **Transition de phase** : changement de direction, réversibilité selon le régime terminal.

### Service

`backend/src/services/ontology/continuityService.js` :

| Fonction | Concept |
|---|---|
| `recordObservation({ entityId, dimension, value, discreteState })` | Enregistre une observation continue |
| `classify({ entityId, dimension })` | Retourne la classification d'une observation |
| `detectTransition({ entityId, dimension })` | Détecte un franchissement de seuil |
| `detectPhaseTransition({ entityId, dimension })` | Détecte une transition de phase et sa réversibilité |

## 26. Mondes possibles — sémantique modale et réceptifs

### Concepts

- **Monde possible** : spécification d'un état du monde avec des hypothèses.
- **Accessibilité** : relation entre mondes (source → cible, conditions).
- **Receipt** : trace d'exécution dans un monde possible, vérifiable par hash.
- **Dépendance causale** : nécessité/contingence évaluée dans un monde hypothétique.

### Service

`backend/src/services/ontology/possibleWorldService.js` :

| Fonction | Concept |
|---|---|
| `createWorld({ worldId, assumptions })` | Crée un monde possible |
| `getWorld({ worldId })` | Récupère un monde possible |
| `listWorlds({ limit })` | Liste les mondes possibles |
| `addAccessibility({ sourceWorldId, targetWorldId, conditions })` | Ajoute une relation d'accessibilité |
| `compareWorlds({ worldA, worldB })` | Compare deux mondes et leurs différences |
| `createReceipt({ worldId, executionId, outcome })` | Crée un receipt dans un monde |
| `verifyReceipt({ receiptId })` | Vérifie ou invalide un receipt |
| `evaluateCausalDependence({ causeAgent, effectAgent, actualOutcome, counterfactualOutcome, worldId })` | Évalue la nécessité causale dans un monde |

## 27. Organisme procédural — du génome à l'organisme procédural adaptatif

### Concepts

GenOS ne stocke pas une procédure comme un graphe logique figé. Il la maintient comme un
**organisme procédural** : une entité vivante dont le squelette structurel est un graphe, mais
dont la compétence effective résulte de l'interaction entre plusieurs couches.

| Couche | Concept biologique | Invariant computationnel | Service |
| --- | --- | --- | --- |
| Règles d'apprentissage | génome ≠ procédure acquise | le génome code la *politique d'acquisition*, pas la procédure | `proceduralGenomePolicyService` |
| Arêtes plastiques | synapses procédurales | chaque transition porte un poids `w`, un compteur de potentiations/dépressions, une trace d'activation et un taux de succès | `proceduralSynapseService` |
| Renforcement / affaiblissement | LTP / LTD procédurale | `Δw = η·reward` avec une récompense riche (succès, preuve, coût, sécurité, effet causal) | `proceduralPlasticityService` |
| Consolidation | hippocampe → cortex | les épisodes répétés sont extraits en **golden paths** stables pendant le cycle de sommeil | `proceduralConsolidationService` |
| Élagage | pruning synaptique | un état multi-niveaux `active → weakened → dormant → candidate_for_pruning → pruned` avant suppression | `proceduralPruningService` |
| Inhibition | Dead Ends actifs | certaines transitions sont inhibibles sous conditions (contexte, preuve manquante), pas seulement mémorisées comme négatives | `proceduralInhibitionService` |
| Sélection d'action | ganglions de la base | à partir de plusieurs transitions candidates, une **sélection compétitive** compute un score `A_i` et produit un gagnant sous pression structurée | `proceduralActionSelectionService` |
| Erreur de prédiction | signal dopaminergique fonctionnel | `δ = R_observé − R_attendu` déclenche LTD, augmentation de plasticité locale ou recherche de mutation — pas de mutation artificielle après N runs | `proceduralPredictionErrorService` |
| Fitness multi-objectif | sélection naturelle§ | `F = w₁·succès + w₂·robustesse + w₃·preuve + w₄·généralisation − coût − risque − complexité` | `proceduralFitnessService` |
| Homéostasie | budget énergétique | `C(G) = α|V| + β|E| + γ·tokenCost + δ·executionCost` ; une mutation n'est pas meilleure juste parce qu'elle augmente le succès à coût structuré | `proceduralFitnessService` |
| Plasticité homéostatique | stabilité des taux d'activation | `w′ = w · target/observed` empêche la domination irréversible d'une seule procédure | `proceduralHomeostaticPlasticityService` |
| Expression épigénétique | épigénétique | le même genome s'exprime différemment selon l'environnement (`enabled / conditional / silenced`) | `proceduralEpigeneticService` |
| Méthylation procédurale | marques répressives | une marque cible une arête/procédure, avec un déclencheur environnemental et une provenance | `proceduralMethylationService` |
| Inspection immunitaire innée | système immunitaire | toute mutation est inspectée avant sandbox : bypass de politique, suppression de vérification, élévation de permissions, accès hors lease, réduction de preuves, contournement sandbox | `proceduralImmuneInspectionService` |
| Mémoire immunitaire adaptative | immunité adaptative | les mutations rejetées forment des signatures rappelées pour un rejet rapide des mutations similaires | `proceduralAdaptiveImmuneMemoryService` |
| Mutation et sélection naturelle | évolution | variants générés, évalués par environnement, survivors sélectionnés — pas de suppression automatique des non-gagnants | `proceduralMutationSelectionService` |
| Non-darwinisme naïf | diversité de niche | plusieurs lignées peuvent coexister si elles occupent des niches procédurales différentes | `proceduralEcologicalDiversityService` |
| Populations procédurales | biome | le biome gère des populations de genomes par niche (debugging, recherche, planification, …) | `proceduralBiomePopulationService` |
| Niches écologiques | écologie | la fitness est évaluée dans un environnement délimité, pas globalement | `proceduralEcologicalNicheService` |
| Symbiose procédurale | holobionte | une procédure hôte peut composer avec des sous-procédures spécialisées (sécurité, mémoire, vérification) | `proceduralHolobionteService` |
| Propagation rhizomique | rhizome | fragments utiles se propagent entre agents après validation locale, pas par copie directe | `proceduralRhizomePropagationService` |
| Métapopulation | métapopulation | plusieurs populations conservent des familles de procédures différentes ; le collapsus d'une population laisse les autres recoloniser | `proceduralMetapopulationService` |
| Apoptose procédurale | apoptose | déclenchée par `fitness < τ ∧ risk > ρ ∧ recoveryAttempts > N`, avec autopsie puis fossilisation | `proceduralApoptosisService` |
| Cryptobiose | cryptobiose | procédures inutiles temporairement entrent en veille quasi-zéro, réactivables si le niche revient | `proceduralCryptobiosisService` |
| Fossilisation / phylogénie | archive stratigraphique | à la mort, le genotype, phenotype, niche, mutations, fitness history, causal evidence, cause de fermeture et descendants sont archivés et une phylogénie procédurale peut être reconstruite | `proceduralFossilizationService` |

### Le squelette vs l'organisme

Le papier (et les graphes classiques) ne modélisent que le squelette :

```text
Procedural Graph
  → mutations
  → benchmark
  → promotion
```

GenOS le transforme en organisme complet :

```text
Procedural Organism
  ├── structural graph (squelette)
  ├── synaptic weights (w, LTP/LTD)
  ├── excitatory edges
  ├── inhibitory edges
  ├── plasticity state (potentiation / depression / lastActivation)
  ├── epigenetic expression (marks, milieu dépendant)
  ├── fitness history (multi-objectif, environnementale)
  ├── niche (population, biome)
  ├── immune status (inné + adaptatif)
  ├── lineage (descendants, fossilisation)
  └── energy budget (coût, complexité, token)
```

### La boucle

```text
ENVIRONMENT
  ↓
procedural niche
  ↓
PROCEDURAL ORGANISM
  ↓
action selection (ganglions de la base)
  ↓
execution
  ↓
outcome
  ↓
prediction error δ
  ↓
┌──────────────┬──────────────┬──────────────┐
│ LTP          │ LTD          │ inhibition   │
└──────────────┴──────────────┴──────────────┘
  ↓
plasticity (Δw = η·reward, reward riche)
  ↓
┌──────────────────┐   ┌──────────────────┐
│ consolidation    │   │ mutation         │
│ (sleep/replay)   │   │ (surprise-based) │
└──────────────────┘   └──────────────────┘
  ↓                        ↓
  reproduced path     candidate variant
                           ↓
                    immune inspection
                           ↓
                    sandbox / challenge
                           ↓
                    causal trials + fitness
                           ↓
              ┌─────────────┴─────────────┐
              │ survive                  │ reject
              │                         │
              ▼                         ▼
         reproduce              immune memory
              │
              ▼
           lineage
```

### Invariant clé

Chaque mécanisme biologique doit correspondre à un invariant informatique mesurable.
Sinon, le vocabulaire reste décoratif.

- LTP/LTD : poids + compteurs + taux de succès observables.
- Pruning : état explicite dans la base, pas suppression immédiate.
- Inhibition : type d'arête `inhibitory`, condition exprimable, force mesurable.
- Homéostasie : coût total `C(G)` et fitness multi-objectif réels.
- Épigénétique : même genome, phénotype exprimé différent selon environnement.
- Immunité : mutations rejetées mémorisées comme signatures, pas juste un log.
- Niches : fitness calculée dans un environnement délimité, pas globalement.
- Apoptose / fossilisation : mort explicite, autopsie, archive reconstituable.

### Références conceptuelles

- Synthèse de l'épigénétique procédurale : `docs/01-concepts/genome-et-epigenetique.md`
- Instinct vs apprentissage vs organisme procédural : `docs/01-concepts/instinct.md`
- Fossilisation et archive stratigraphique : `docs/01-concepts/fossilisation.md`
- Matrice synapse / causalité : survient dans `genome_decisions.synaptic_weight` et les services de causalité (`causalityService`).
- Prediction error et learning progress : réutilise `curiosityService` (Ten et al., 2021) et `survivalModelService` (homéostasie).

## 11. Architecture philosophique

### Effets runtime contrôlés

Le routeur `genos_philosophy` sépare l’évaluation d’un concept de l’application
d’un signal runtime. `evaluateConcept` reste en lecture seule. L’opération
`applyRuntimeEffect` retourne un aperçu tant que `apply` n’est pas explicitement
à `true`; elle accepte uniquement `require_evidence`, `hold_promotion` et
`prefer_observation`, exige `concept` et `agentId`, puis émet une télémétrie
avec un receipt.

Ces effets ne changent pas directement le code, le workspace, les leases ou les
permissions. Ils sont des signaux bornés dont le consommateur reste soumis aux
barrières d’autorité et de preuve. Les tests
`test_philosophy_mcp_integration.js` et `test_philosophy_authority.js` couvrent
le transport et le refus des effets hors allow-list. Voir [ADR 0016](adr/0016-effets-runtime-philosophiques-controles.md).

```
┌─────────────────────────────────────────────────────────────┐
│                    GENOS ONTOLOGICAL STACK                   │
├─────────────────────────────────────────────────────────────┤
│  Being (ensoma)                                              │
│  ├── Substance: agents, workers, orchestrators               │
│  ├── Attributes: status, budget, role, evidence              │
│  └── Modes: localRuntime, isolationMode, executionMode       │
├─────────────────────────────────────────────────────────────┤
│  Causality                                                   │
│  ├── Law: tool_call → evidence → barrier → completion        │
│  ├── Counterfactual: trinity worlds (what if?)               │
│  └── Determinism: causal_replay_engine                      │
├─────────────────────────────────────────────────────────────┤
│  Time & Identity                                             │
│  ├── A-series: past (memories), present (status), future     │
│  ├── B-series: before (parent), after (workers)              │
│  └── Personal Identity: agent_memories continuity            │
├─────────────────────────────────────────────────────────────┤
│  Mind & Consciousness                                        │
│  ├── Qualia: agentConscienceService internal states          │
│  ├── Intentionality: tool_lease (aboutness)                  │
│  └── Supervenience: mental (strategy) → physical (process)   │
├─────────────────────────────────────────────────────────────┤
│  Epistemology                                                │
│  ├── Platonism: strategy_contracts (ideal forms)             │
│  ├── Aristotelianism: four causes (material/formal/...)      │
│  └── Kantism: noumene (internal) vs phenomenon (observable)  │
├─────────────────────────────────────────────────────────────┤
│  Process Philosophy                                          │
│  ├── Whitehead: actual_occasions (telemetry_events)          │
│  ├── Deleuze: difference_and_repetition, rhizome             │
│  └── Heidegger: dasein (being-in-the-world)                  │
├─────────────────────────────────────────────────────────────┤
│  Ethics                                                      │
│  ├── Utilitarianism: budget_guardrail (maximize efficiency)  │
│  ├── Deontology: tool_lease, evidence_barrier (rules)        │
│  └── Virtue Ethics: agent_dna (character)                    │
├─────────────────────────────────────────────────────────────┤
│  Phenomenology                                               │
│  ├── Husserl: intentionality (consciousness about mission)   │
│  ├── Merleau-Ponty: perception (workspace as body)           │
│  └── Sartre: existence_precedes_essence (status before role) │
├─────────────────────────────────────────────────────────────┤
│  Contingency & Event                                         │
│  ├── Meillassoux: absolute_contingency (all could differ)    │
│  └── Badiou: event (telemetry_events as ruptures)            │
├─────────────────────────────────────────────────────────────┤
│  Platonism                                                   │
│  └── Formes idéales: perfect_agent, perfect_worker,          │
│      perfect_evidence, perfect_strategy, perfect_organization│
├─────────────────────────────────────────────────────────────┤
│  Cartesianism                                                │
│  ├── Res cogitans: agent (pensée, conscience)                │
│  ├── Res extensa: workspace (étendue, corps)                │
│  └── Cogito: "Je pense, donc je suis" (certitude absolue)    │
├─────────────────────────────────────────────────────────────┤
│  Leibnizianism                                               │
│  ├── Monade: substance simple, indévisible                   │
│  ├── Harmonie préétablie: coordination sans interaction      │
│  └── Principe de raison suffisante: "nihil est sine ratione"│
├─────────────────────────────────────────────────────────────┤
│  Spinozism                                                  │
│  ├── Deus sive Natura: monisme — une seule substance        │
│  ├── Conatus: effort de persistance en être                 │
│  └── Attributs: Pensée (cognition) et Étendue (workspace)  │
├─────────────────────────────────────────────────────────────┤
│  Newtonianism                                               │
│  ├── Espace absolu: contenant fixe et immuable              │
│  ├── Temps absolu: temps universel et uniforme              │
│  └── Mécanique: action-réaction, inertie, gravitation       │
├─────────────────────────────────────────────────────────────┤
│  Kantianism                                                  │
│  ├── Phénomène: observable via senseurs (expérience)        │
│  ├── Noumène: chose-en-soi (Ding an sich, inaccessible)     │
│  └── Catégories a priori: espace, temps, causalité          │
└─────────────────────────────────────────────────────────────┘
│  Réalisme / Nominalisme / Conceptualisme                    │
│  ├── Réalisme: universaux indépendants de l'esprit          │
│  ├── Nominalisme: seuls les particuliers existent            │
│  └── Conceptualisme: universaux comme concepts mentaux       │
└─────────────────────────────────────────────────────────────┘
```

## Références

- Aristote, *Métaphysique*, *Catégories*
- Spinoza, *Éthique*
- Descartes, *Méditations métaphysiques*
- Leibniz, *Monadologie*
- Kant, *Critique de la raison pure*
- Hegel, *Phénoménologie de l'esprit*
- Nietzsche, *Volonté de puissance*
- Bergson, *L'Évolution créatrice*
- Whitehead, *Process and Reality*
- Heidegger, *Être et Temps*
- Sartre, *L'Être et le Néant*
- Deleuze, *Différence et Répétition*
- Badiou, *L'Être et l'Événement*
- Meillassoux, *Après la finitude*

## 27. Natural Creative Ecology (NCE)

### 27.1. Hypothèse

> La créativité artificielle peut-elle émerger de l'interaction de plusieurs mécanismes naturels de création de nouveauté, plutôt que d'un unique algorithme d'optimisation ?

Cette hypothèse est implémentée dans GenOS sous le nom de **Natural Creative Ecology** (NCE). Elle postule que les six mécanismes naturels de génération de nouveauté sont complémentaires et non redondants.

### 27.2. Les six niveaux naturels

| Niveau | Source biologique | Fonction cognitive | Service GenOS |
|--------|-------------------|-------------------|---------------|
| Humain | DMN, imagination contrefactuelle | Espace de possibilités | `representationalMutationEngine.js`, `exaptationEngine.js` |
| Animal | Curiosité, jeu, exploration | Découverte de possibilités | `curiosityService.js`, `playService.js` |
| Végétal | Plasticité phénotypique | Adaptation de la machine | `phenotypicDevelopmentService.js` |
| Matière | Auto-organisation, stigmergie | Structure spontanée | `biomeCoordinationService.js` (existant) |
| Évolution | Mutation, sélection, exaptation | Accumulation transgénérationnelle | `agentEvolutionService.js` (existant) |
| Culture | Transmission intentionnelle | Accumulation inter-agent | `culturalTransmissionService.js` |

### 27.3. Boucle de créativité

```
                         WORLD
                           │
                     perturbation
                           ▼
                ┌────────────────────┐
                │ SELF-ORGANIZATION  │ ← MATTER
                └─────────┬──────────┘
                          │
                          ▼
                ┌────────────────────┐
                │    PLASTICITY      │ ← PLANTS
                └─────────┬──────────┘
                          │
                          ▼
                ┌────────────────────┐
                │    EXPLORATION     │ ← ANIMALS
                │    curiosity, play │
                └─────────┬──────────┘
                          │
                     observations
                          ▼
                ┌────────────────────┐
                │    IMAGINATION     │ ← HUMANS
                │ counterfactuals,   │
                │ reframing, remote  │
                │ association        │
                └─────────┬──────────┘
                          │
                       ideas
                          ▼
                   EXPERIMENTATION
                          │
                    evidence gate
                          ▼
               ┌─────────────────────┐
               │     EVOLUTION       │
               │ preserve / mutate   │
               │ exapt / speciate    │
               └─────────┬───────────┘
                         │
                         ▼
               ┌─────────────────────┐
               │       CULTURE       │
               │ teach / imitate     │
               │ modify / transmit   │
               └─────────┬───────────┘
                         │
                  new capabilities
                         │
                         └──────────────► WORLD
```

### 27.4. Principe fondamental : la nouveauté crée des affordances

Une découverte n'est véritablement intéressante que si elle ouvre de nouvelles possibilités :

```
OpenEndedValue(x) = Novelty(x) × FuturePossibilités(x)
```

C'est le concept de **stepping stone** : une découverte moyenne qui permet ensuite 20 autres découvertes peut être plus importante qu'une découverte spectaculaire mais terminale.

### 27.5. Mécanismes par niveau

#### Humain → Imagination
- **RepresentationalMutation** : au lieu de muter une solution, on mute sa représentation (ex: "allocation de tâches" → "problème de marché" → "écosystème de niches").
- **Recombinaison associative distante** : sélection de parents dans le graphe sémantique en maximisant `distance × compatibilité × potentiel`.
- **Exaptation** : une capacité existante est réinvestie dans un nouveau contexte (ex: stigmergie des fourmis → protocole de communication).

#### Animal → Exploration
- **Curiosité basée sur le progrès d'apprentissage** : les agents explorent les domaines où ils progressent, pas les domaines déjà maîtrisés ni les domaines imprévisibles mais non apprenants (piège noisy-TV).
- **PlaySandbox** : les agents peuvent explorer sans mission externe, avec un budget limité et un sandbox sécurisé.
- **AffordanceMemory** : les capacités découvertes par l'exploration sont mémorisées pour futures réutilisations.

#### Végétal → Plasticité
- **Développement phénotypique** : le phénotype d'un agent se développe en réponse à l'environnement. Des branches (spécialisations) poussent vers les ressources et atrophient quand inutilisées.
- **Réactivation** : une branche atrophiée peut être réactivée si le contexte change.

#### Évolution → Accumulation
- **Accumulation transgénérationnelle** : les innovations sont conservées et transmises aux générations suivantes.
- **Exaptation évolutive** : des structures existantes sont réinvesties.

#### Culture → Transmission
- **Transmission inter-agent** : imitation, démonstration, enseignement, apprentissage, utilisation d'artefacts.
- **Sélection culturelle** : les traits culturels sont évalués selon leur utilité, leurs preuves, leur prestige, leur fiabilité.
- **Traditions** : des lignées d'artefacts avec variants.

### 27.6. Tests d'ablation

L'expérience déterminante compare :

```
BASELINE → +curiosity → +exploration → +plasticity → +selfOrg → +evolution → +culture → FULL NCE
```

avec à chaque étape les mêmes modèles, le même budget et les mêmes problèmes.

Les métriques mesurées :
- **Δ performance** : taux de succès
- **Δ nouveauté** : distance par rapport aux solutions existantes
- **Δ diversité** : nombre de solutions uniques
- **Δ transfert** : capacité à résoudre des problèmes nouveaux
- **Δ coût** : tokens/étapes nécessaires
- **Δ découvertes** : nombre de stepping stones ouvertes

Voir `backend/tests/nce_ablation_tests.js`.

### 27.7. Intégration dans l'orchestrateur

Les 6 moteurs sont intégrés dans `backend/bin/genos-orchestrate.cjs` via `nceIntegrationService.js`. Les améliorations sont optionnelles et non-blocantes : si un moteur échoue, la mission continue sans lui.

### 27.8. Distinction par rapport aux systèmes existants

| Système | Mécanisme dominant | Version NCE |
|---------|-------------------|-------------|
| AlphaEvolve | évolution + évaluateur auto | évolution sous preuve + niches + exaptation |
| DGM | archive d'agents auto-modifiants | AgentDNA + lignées + phénotypes + gates |
| POET | coévolution env/agent | coévolution env/agent/representation |
| Voyager | curriculum auto + skills | curiosité animale + culture cumulative |
| Co-Scientist | société d'hypothèses | topologies + imagination + épistémologie |
| QD | solutions diverses + performantes | écosystème de niches multi-échelles |

### 27.9. Références

- Ten et al., *Humans monitor learning progress in curiosity-driven exploration* (PMC8514490, 2021)
- Wu et al., *A Systematic Review of Creativity-Related Studies Applying the Remote Associates Test* (PMC7644781, 2020)
- Beaty et al., *Network Neuroscience of Creative Cognition* (PMC6428436, 2018)
- Kassen, *Experimental evolution of innovation novelty* (PMC66428436, 2019)
- Colizzi et al., *Modelling the evolution of novelty* (PMC9750852, 2022)
- Wang et al., *POET: Endlessly Generating Increasingly Complex Environments* (arXiv:1901.01753, 2019)
- Wang et al., *Voyager: An Open-Ended Embodied Agent* (arXiv:2305.16291, 2023)
- Qian et al., *Quality-Diversity Algorithms* (arXiv:2401.10539, 2024)
- Morgan et al., *Human culture is uniquely open-ended* (Nature, 2024)
- Mackintosh et al., *Intentional transmission of knowledge* (Nature Sci Rep, 2026)
- Plant Phenotypic Plasticity (Annual Reviews, 2026)
- Root Growth and Development (Annual Reviews, 2025)
