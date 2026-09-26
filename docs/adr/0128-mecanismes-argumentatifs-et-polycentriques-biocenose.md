# 0128 — Mécanismes argumentatifs et polycentriques Biocénose

- **Statut** : Accepté
- **Date** : 2026-09-26
- **Domaine** : Biocénose, agrégation, argumentation
- **Décideurs** : GenOS
- **Lié à** : [ADR 0090](0090-variants-executables-biocenose.md), [topologie Biocénose](../02-orchestration/topologies/biocenose.md)

## Contexte

Les variants Argumentation Community et Polycentric Council avaient une politique
enregistrée mais n'influençaient pas le résultat agrégé. Delphi exposait les réponses
anonymes au modèle, sans publier une distribution quantifiée au jugement.

## Décision

- Argumentation Community évalue les relations SUPPORT, ATTACK, REFUTE, UNDERCUT et
  COUNTEREXAMPLE par claim. Un claim vérifié ou soutenu sans attaque est accepté; un
  claim seulement attaqué est rejeté; les cas contradictoires ou sans soutien restent
  indécis. Le jugement conserve les IDs d'arguments, les auteurs et les contradictions.
- Polycentric Council transmet les clusters fournis au service hiérarchique existant.
  L'absence de clusters ou une preuve minoritaire qui contourne l'agrégation exige une
  revue et empêche la finalisation comme jugement réglé.
- Delphi Community ajoute la distribution anonyme des positions et, pour les positions
  numériques, la médiane et l'intervalle interquartile au résultat d'agrégation.
- Ces mécanismes ne prétendent pas implémenter la sémantique complète des graphes
  d'argumentation, la composition de communautés locales, ni un stopping rule statistique.
  Les variants concernés restent `PARTIAL` jusqu'à l'intégration de ces garanties.

## Conséquences

### Positives

- Les politiques d'argumentation et de hiérarchie affectent désormais les décisions runtime.
- Le désaccord est observable sans effacer la provenance ni assimiler une preuve absente à
  une preuve favorable.
- Delphi produit une mesure de dispersion lisible sans exposer les identités dans sa
  distribution publique.

### Négatives

- L'évaluation des arguments est une labellisation locale, pas une sémantique complète
  avec calcul de cycles ou d'undercuts transitifs.
- Polycentric Council dépend de clusters déjà composés et fournis à l'agrégation.

## Alternatives

- Marquer les deux variants `EXECUTABLE` dès le branchement : rejeté, car les mécanismes
  ne couvrent pas encore leurs garanties institutionnelles complètes.
- Conserver des politiques seulement descriptives : rejeté, car elles n'influençaient
  aucun résultat du runtime.
