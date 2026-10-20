# ADR 0694 — Responsabilité et rétention des compétences

- **Statut** : Accepté
- **Date** : 2026-10-19
- **Domaine** : GVX, apprentissage, gouvernance des compétences
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0613, `docs/01-concepts/gvx.md`

## Contexte

Le graphe et le curriculum GVX représentent des compétences candidates, leurs
prérequis et leurs preuves initiales. Ce modèle ne répond pas encore à quatre
questions nécessaires après l'acquisition : quelle responsabilité externe la
compétence sert-elle, est-elle réellement réutilisée, son bénéfice persiste-t-il
hors du contexte d'origine et que faire lorsqu'elle régresse ?

Une bibliothèque de compétences déclarative ou un score obtenu pendant
l'entraînement ne suffit pas. Elle peut favoriser une compétence inutilisée,
réutiliser une preuve contaminée comme holdout ou masquer un oubli derrière une
ancienne qualification.

## Décision

Ajouter `gvxSkillStewardship.js` comme couche de stewardship au-dessus du
curriculum. Une inscription lie une version d'artefact à une responsabilité
externe persistante, un propriétaire, un objectif, une métrique, un contexte et
des expériences sources. La lignée de version et le hash d'artefact sont
conservés dans le ledger GVX immuable.

Une qualification calcule séparément le nombre de contextes de réutilisation, le
bénéfice moyen pour le projet, le bénéfice d'un holdout scellé dans un autre
contexte et la régression de rétention. Le vérificateur du holdout doit être
distinct du producteur. Une régression recommande la quarantaine et le
réapprentissage ; elle ne détruit pas la provenance historique.

La décision finale est bornée à deux résultats : `NO_CHANGE` ou
`EXTERNAL_REVIEW_REQUIRED`. Une autorité externe doit permettre la demande de
revue. Aucun résultat de ce service ne produit un événement d'application ou une
promotion automatique.

## Conséquences

### Positives

- Une compétence est évaluée par son service à une responsabilité durable, pas
  par sa seule présence dans un catalogue.
- La réutilisation, le bénéfice projet, le holdout et la rétention restent des
  dimensions distinctes et auditables.
- L'oubli devient une observation réversible vers quarantaine, sans effacement
  du lignage ni des preuves négatives.
- L'absence d'autorité, de bénéfice, de holdout ou de rétention produit
  explicitement `NO_CHANGE`.

### Négatives

- Le service dépend de mesures fournies par des adaptateurs métier ; il ne prouve
  pas leur vérité sémantique.
- Un seul holdout scellé reste descriptif et ne démontre pas une généralisation
  statistique.
- La revue externe doit encore être raccordée par le consommateur à son propre
  workflow d'adoption.

## Alternatives

- **Promouvoir après succès du curriculum** : rejeté, car l'entraînement ne
  démontre ni usage réel ni bénéfice durable.
- **Compter seulement les réutilisations** : rejeté, car une compétence souvent
  appelée peut n'apporter aucun gain au projet.
- **Supprimer une compétence régressée** : rejeté, car cela efface la provenance
  et empêche l'analyse de l'oubli.

## Vérification

- `node backend/tests/test_gvx_skill_stewardship.js`
- `python scripts/ci/check_code_quality.py`
- `python scripts/ci/check_adr_index.py`
