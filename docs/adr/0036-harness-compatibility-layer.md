---
title: Harness Compatibility Layer — rendre le harness remplaçable
date: 2026-09-23
status: proposed
authors: GenOS
decision-id: 0036
---

# ADR 0036 : Harness Compatibility Layer — rendre le harness remplaçable

## Statut

Proposé.

## Date

2026-09-23.

## Domaine

Orchestration, runtime, exécution cognitive, preuve.

## Décideurs

GenOS.

## Lié à

- ADR 0018 — Exécution cognitive via le client MCP (`0018-execution-cognitive-via-client-mcp.md`).
- `backend/src/services/cognitiveExecutor.js` — ensemble fermé `caller_mcp, codex, local, solar-direct`.
- `backend/src/services/agentRuntimeExecutable.js` — dispatch `configuredExecutable`.
- `backend/src/services/agentRuntimeAdapter/missionBootstrap.js` — bootstrap mission.
- `crates/genos-store/src/snapshot.rs`, `crates/genos-genome/src/fork.rs`, `crates/genos-genome/src/replay.rs` — primitives fork/replay.

## Contexte

Les applications agentiques construisent aujourd'hui leur logique métier *dans* leur harness
(planification, outils, mémoire, sous-agents, HITL, état). Changer de harness
(Vercel AI SDK vers Jev, OpenCode, ou autre) impose alors une réécriture, car le
harness possède trop de sémantique métier et agentique.

GenOS sépare déjà partiellement la cognition de l'autorité : le mode `caller_mcp`
laisse le client fournir la génération tandis que GenOS conserve l'identité, les
contrats, les budgets, les workers, les leases, les outils, la mémoire, les preuves
et la promotion. Cette séparation est au niveau **modèle**, pas encore au niveau
**harness** : `resolveExecutor` et `configuredExecutable` sélectionnent un script
runtime en dur, sans registre de capacités, sans routage, sans expérience de
migration mesurée.

Le problème à optimiser n'est pas d'avoir le meilleur harness, mais de pouvoir
remplacer le harness sans remplacer l'agent.

## Décision

Introduire une couche **Harness Compatibility Layer (HCL)**, aussi appelée
écologie d'exécution, entre le runtime GenOS et les harnesses externes :

```text
GenOS (identité, contrats, budgets, mémoire, preuves, snapshots, promotion)
  ↓
Harness Compatibility Layer (protocole canonique + registre + routage)
  ↓
Vercel AI SDK | Jev | OpenCode | Codex SDK | caller_mcp | futur X
```

Règles :

- GenOS reste l'autorité sur l'identité, les contrats, les budgets, les leases,
  l'isolation, la provenance, les snapshots et la promotion. Aucun driver ne peut
  contourner ces gates. Un transport réussi n'est pas une preuve de décision valide.
- Le protocole canonique est minimal et stable : `ExecutionRequest`,
  `ExecutionEvent`, `ToolRequest`, `ToolResult`, `HumanIntervention`,
  `Checkpoint`, `Artifact`, `Evidence`, `Completion`, `Failure`.
- Chaque harness est encapsulé derrière un driver qui déclare ses capacités
  (`capabilities()`), exécute (`execute`), annule (`cancel`),
  checkpoint/restore (`checkpoint`, `restore`) et demande un humain
  (`requestHumanInput`). Les particularités non mappables restent derrière
  l'adapter et ne remontent jamais dans l'application.
- Le routage est par capacités, pas par nom : la mission déclare des besoins,
  le registre sélectionne le phénotype d'exécution
  (`harness + modèle + topologie + politiques mémoire/communication`).
- La migration est progressive et mesurée : routage partiel (5/95, 25/75),
  fork + replay d'un même snapshot sur deux harnesses, comparaison sur
  succès, erreurs outils, latence, tokens, coût, interventions humaines,
  retries, couverture de preuve, corruption d'état.

Périmètre de la première étape :

- `backend/src/services/harnessRegistry.js` : registre nom → driver + capacités.
- `backend/src/services/harnessDrivers/callerMcpDriver.js` et
  `codexDriver.js` : normaliser les deux exécuteurs existants en drivers,
  sans changer leur comportement.
- `configuredExecutable` devient une fabrique qui délègue au registre.
- Aucun nouveau harness externe dans cette étape ; l'extension
  (Jev, OpenCode, Vercel) vient après, un driver à la fois.

## Conséquences

### Positives

- Le choix du harness devient réversible : ajout, évaluation et retrait sans
  réécriture de l'application.
- Les primitives Git-like de GenOS (fork, snapshot, replay, evidence)
  deviennent le banc de mesure des harnesses au lieu d'un gadget.
- On maintient une population de harnesses et on route par tâche
  (codage autonome, MCP fort, workflow simple, exploration multi-agent,
  tâche critique type Trinity) au lieu de parier sur un vainqueur global.
- Les drivers restent petits, testables et conformes aux gates
  (400 lignes, 3 paramètres, complexité 10, frontières SOLID).

### Négatives

- Interface canonique volontairement pauvre : certaines fonctions
  harness-spécifiques seront dégradées ou indisponibles derrière l'adapter.
- Coût d'évaluation : rejouer des workloads réels sur deux harnesses
  consomme tokens, temps et stockage d'evidence.
- Risque de fuite d'abstraction si un driver expose des détails
  (chemins, secrets, handles) hors protocole. Les revues doivent le bloquer.

## Alternatives

- Choisir un harness gagnant et migrer en flag-day : rejeté, coût de
  réécriture et obsolescence en six mois.
- Abstraction `HarnessAdapter` complète immédiate (spawn, resume, tools,
  HITL, checkpoint, cancel) pour tous les harnesses : rejeté, trop large
  pour une première étape et violerait les limites de taille/complexité.
- Second framework d'évaluation parallèle : rejeté, dupliquerait
  jobs, checkpoints et provenance existants.
- Laisser chaque application posséder son harness : rejeté, c'est
  exactement le verrouillage décrit dans le problème d'origine.
