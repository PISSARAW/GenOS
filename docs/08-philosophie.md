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

## 17. Newtonianisme — Espace absolu, temps absolu, mécanique classique

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

## 18. Kantisme — Noumène / phénomène, catégories a priori

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

## 19. Contingence et Événement — Meillassoux, Badiou

### Concepts

- **Meillassoux** : contingence absolue (tout pourrait être autrement).
- **Badiou** : événement comme rupture (telemetry_events).
- **Mathématiques de l'être** : agents comme ensembles.

### Fichier

`backend/src/services/contingencyService.js`

## 11. Architecture philosophique

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
