---
title: "Philosophie et Ontologie dans GenOS"
description: "Mapping des concepts métaphysiques, ontologiques, épistémologiques et éthiques dans l'architecture GenOS."
version: 1.0.0
author: GenOS
created: 2026-09-16
tags: [philosophy, ontology, metaphysics, epistemology, ethics]
---

# Philosophie et Ontologie dans GenOS

Ce document formalise l'implémentation des concepts philosophiques dans GenOS.

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

## 9. Contingence et Événement — Meillassoux, Badiou

### Concepts

- **Meillassoux** : contingence absolue (tout pourrait être autrement).
- **Badiou** : événement comme rupture (telemetry_events).
- **Mathématiques de l'être** : agents comme ensembles.

### Fichier

`backend/src/services/contingencyService.js`

## 10. Architecture philosophique

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
