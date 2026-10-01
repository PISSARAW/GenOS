# ADR 0239 — Provenance épistémique des candidats AGOW

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : AGOW, épistémologie, contrefactuels
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : [ADR 0006](0006-active-global-organism-workspace.md), [ADR 0007](0007-agow-runtime-persistence-et-evaluation.md)

## Contexte

Les candidats AGOW distinguaient leur module source, mais pas une observation réelle,
une inférence, une conséquence d'action du soi, un rappel mémoire ou une simulation.
Le branchement futur d'un workspace contrefactuel risquait donc de faire traiter un
résultat simulé comme un fait observé par les receivers métier.

## Décision

- Ajouter au contrat canonique `CognitiveCandidate` le bloc obligatoire
  `epistemicOrigin` (`origin`, `realityMode`, `agency`, `simulationId` et
  `parentRealityFrameId`).
- Les adaptateurs renseignent des valeurs par défaut conservatrices; la provenance
  reste `unknown` quand le module ne suffit pas à déterminer une origine.
- Une entrée dans un monde contrefactuel fournit un `simulationId` et référence son
  frame réel parent. `origin` reste indépendant de `realityMode` : un rappel mémoire
  exécuté en simulation reste `memory_retrieved` dans un monde `counterfactual`.
  L'origine `counterfactual_simulated` ne peut jamais être marquée réelle.
- Les receivers `world_model` et `self_model` ne modifient pas leurs stores canoniques
  lorsqu'ils reçoivent un candidat contrefactuel.
- Aucun nouveau bus ou moteur de simulation n'est introduit par cette décision.

Les tags sont des métadonnées runtime déclarées; ils ne constituent pas une preuve
cryptographique de provenance. Les services d'exécution doivent conserver ces tags et
respecter les gates de monde réel lors des écritures.

## Conséquences

### Positives

- Les consommateurs peuvent distinguer plus finement observation, inférence, rappel,
  action et simulation.
- Les candidats non classifiables restent explicites plutôt que faussement certains.
- Les stores canoniques du monde et du soi refusent directement les observations
  contrefactuelles.

### Négatives

- Les producteurs qui soumettent directement un candidat doivent désormais respecter
  le schéma révisé; les adaptateurs internes sont migrés dans cette tranche.
- Cette garde ne fournit pas encore de partition complète pour exécuter un AGOW shadow.
- Les autres receivers et effets aval doivent être évalués avant que le marqueur de
  réalité puisse être considéré comme une isolation complète.

## Alternatives

- Réutiliser `source.module` comme approximation de la réalité : rejeté, car le module
  ne décrit pas toujours l'origine de l'information ni son statut simulé.
- Ajouter uniquement une chaîne `self/world` : rejeté, car cela confond action attendue,
  action observée, mémoire, inférence et simulation.
- Construire une base contrefactuelle complète dans cette tranche : reporté; le runtime
  existant doit d'abord être adapté et contrôlé sans créer un moteur concurrent.
