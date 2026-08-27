# Temporal Causal Simulator (Simulateur Causal Temporel)

Le **Temporal Causal Simulator** est un moteur déterministe au cœur de GenOS qui permet de forker l'histoire d'un agent et de rejouer des événements identiques à travers des environnements et des architectures alternatifs.

## Fonctionnement

Lors d'un "causal replay", GenOS enregistre les effets de ces réalités alternatives sous forme de tuples structurés :
`(décision architecturale, événement historique déclencheur, delta métrique, explication)`

Cela permet aux opérateurs (et aux agents) de répondre de manière empirique à des questions contrefactuelles précises, telles que : "Pourquoi la latence a-t-elle augmenté dans cette réalité alternative, alors que les mêmes actions ont été exécutées ?"

## Interface CLI

L'exécution d'une simulation causale se fait via la commande `experiment causal-replay` :

```bash
genos experiment causal-replay <manifest.yaml>
```
Le manifeste décrit le scénario de base, les points de divergence (forks) et les variations architecturales à appliquer.

## Intégration MCP

Les agents GenOS peuvent utiliser l'outil `genos_causal_replay_experiment` pour lancer eux-mêmes des analyses d'impact contrefactuelles et intégrer les résultats dans leur raisonnement.
