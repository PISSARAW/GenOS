# ADR 0014 — Théorie du soi opérationnelle de l'orchestrator

- Statut : Accepté
- Date : 2026-09-16
- Domaine : Orchestration, apprentissage, persistance, sûreté
- Décideurs : Équipe GenOS
- Lié à : [régulation multi-boucles](../02-orchestration/regulation-multi-boucles.md), [preuve et épistémologie](../01-concepts/epistemologie-et-evidence.md)

## Contexte

L'orchestrator connaissait la mission, le budget et les portes de preuve, mais
ne disposait pas d'une vue persistée et mesurable de sa propre fiabilité. Cela
laissait les erreurs récurrentes, notamment la sur-délégation et la promotion
prématurée, sans rétroaction explicite sur les décisions suivantes.

## Décision

Introduire un `SelfModel` calculé et persistant, séparé en identité, état
courant et histoire apprise. Il lit les enregistrements d'agent, le plan,
l'historique des exécutions et les preuves disponibles; il produit une synthèse
structurée ainsi que des contraintes de décision.

Le stockage utilise `adaptive_state` sous le scope `orchestrator_self_model`.
La calibration est mise à jour après les runs terminaux. Le modèle peut réduire
le fan-out et renforcer une porte de promotion; il ne peut jamais lever une
contrainte de survie, une lease, une preuve contractuelle ou une approbation
humaine.

## Conséquences

Positives : les biais observables deviennent des garde-fous traçables, et la
planification utilise l'état interne mesuré plutôt qu'une hypothèse implicite.

Négatives : la première exécution a peu d'historique, donc utilise des valeurs
prudentes par défaut. Les métriques de run doivent rester structurées pour
améliorer la qualité de calibration.

## Alternatives

- Profil statique écrit à la main : rejeté, car il ne reflète ni l'état ni les
  résultats observés.
- Modèle de langage en monologue libre : rejeté, car il n'est pas une contrainte
  vérifiable et pourrait transformer une intuition en fausse preuve.
- Nouvelle table dédiée : différé; `adaptive_state` fournit déjà une persistance
  versionnée adaptée au modèle appris.