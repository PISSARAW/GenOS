# ADR 0338 - Comparer les archives DGM et GVX sous contrat identique

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : GVX, ontogenèse, recherche comparative

## Décision

Conserver les lignées de candidats et comparer DGM et GVX seulement sur les
mêmes tâches tenues à l'écart, budgets et empreintes d'évaluateur. Rejeter les
candidats qui modifient l'évaluateur, les permissions ou les gates de promotion.
Le comparateur consomme des résultats externes, sans exécuter directement le
code auto-modifiant DGM ni promouvoir un candidat.

## Limites

Le harnais vérifie la comparabilité du contrat, pas l'authenticité de la
production des résultats. Les campagnes réelles exigent des sandboxes,
reçus signés et évaluations indépendantes.
