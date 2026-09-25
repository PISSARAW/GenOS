---
title: Préparer les workers de topologie et exposer le graphe Rhizome
date: 2026-09-25
status: accepted
authors: GenOS
decision-id: 0118
---

# ADR 0118 : Préparer les workers de topologie et exposer le graphe Rhizome

## Contexte

Les dispatchers Trinity, biologiques et A-Team pouvaient annoncer un worker accepté
avant que son identité soit créée dans `agents`. Le runtime enfant exige pourtant une
identité worker avec parent, rôle et contrat persistés avant son démarrage. Les sessions
Rhizome persistaient leur graphe, mais l'outil MCP de session ne permettait ni d'ajouter
des noeuds ni des arêtes; une route de capacité ne pouvait donc pas être construite par
une mission.

Le chemin de Morphogenèse V2 reste un prévol `SHADOWED`. L'ADR 0101 garde l'adjudication
Rust, l'approbation de gouvernance et la transition transactionnelle comme prérequis
indispensables au commit. Aucun de ces prérequis n'est remplacé par cet ADR.

## Décision

- Avant de lancer un worker topologique, persister son identité, son parent, son rôle,
  son contrat et son état initial `idle`. Si le lancement échoue, marquer le worker en
  erreur; une réponse `accepted` ne précède plus la ligne d'agent.
- Précréer aussi les identités des membres A-Team de stades différés. L'état `idle`
  distingue un worker planifié d'un worker déjà démarré lors de la réconciliation.
- Retourner l'identifiant et la version de la session issue d'un dispatch Rhizome.
- Ajouter `add_node` et `add_edge` à `genos_topology_session`, avec validation par les
  contrats canoniques Rhizome, pour permettre le routage par capacité.
- N'émettre `MORPHOGENESIS_COMPLETED` que si le runtime fournit un `commitId`; sinon,
  émettre `MORPHOGENESIS_PROPOSED` avec `committed: false`.
- Ignorer les événements internes `NATURAL_SEARCH_*` dans le contrôleur de recherche,
  afin qu'une décision/action du contrôleur ne soit pas retraitée comme une nouvelle
  entrée.

## Conséquences

### Positives

- Les workers sont autorisables par le runtime avant leur démarrage et réconciliables
  par identité persistée.
- Les missions peuvent créer un graphe Rhizome exécutable et vérifier les arêtes
  réellement utilisées.
- Les événements de Morphogenèse ne confondent plus proposition et commit.
- Les émissions du contrôleur de recherche ne peuvent plus créer leur propre boucle.

### Négatives

- Les identités A-Team différées existent en état `idle` avant l'ouverture de leur stade.
- L'opérationnalisation de Morphogenèse V2 reste bloquée jusqu'à l'intégration d'une
  autorité Rust vérifiée, de la gouvernance et d'adaptateurs de transition sûrs.

## Alternatives

- Considérer `accepted` comme une preuve de worker persistant : rejeté, car le runtime
  enfant échoue ensuite à son contrôle d'autorité.
- Autoriser les routes Rhizome à ignorer le graphe de capacités : rejeté, car cela
  sélectionnerait un fournisseur sans preuve d'admissibilité ni chemin.
- Émettre un événement de complétion lorsque le planner retourne seulement un plan :
  rejeté, car l'événement serait une fausse preuve d'application.
- Engager une proposition shadow sans adjudication et autorisation : rejeté par l'ADR
  0101.
