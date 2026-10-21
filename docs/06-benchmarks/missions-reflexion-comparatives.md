# Missions de réflexion comparatives avec et sans GenOS

- **Statut** : protocole exécutable, aucune campagne rapportée
- **Portée** : pilote local sur branches, budget et porte de preuve
- **Dernière revue** : 2026-10-21

## Question

Le pilote mesure si les mécanismes GenOS améliorent la traçabilité, la reproductibilité,
la maîtrise du budget et la discipline de promotion par rapport à un workflow manuel.
Il ne compare ni l'intelligence des modèles ni leur chaîne de pensée privée.

## Plan expérimental

Le harnais [`benchmarks/reflection-comparison`](../../benchmarks/reflection-comparison/README.md)
prépare 12 essais selon un crossover contrebalancé : trois missions, deux variantes,
deux périodes et deux modes. Chaque mode reçoit les mêmes plafonds. Les variantes sont
inversées à la seconde période afin de réduire l'apprentissage direct de la solution.

| Mission | Mesure principale | Preuve obligatoire |
| --- | --- | --- |
| Branches | temps jusqu'à résolution | snapshot ou état initial, rapports des hypothèses, replay |
| Budget | dépassement en jetons | plafond déclaré et reçu de consommation |
| Porte de preuve | promotions non étayées | dossier, verdict et reçu de vérification |

Une réussite vérifiée exige conjointement `taskSucceeded` et `evidenceValid`. Un transport
réussi, un processus terminé ou un artefact présent ne suffisent pas.

## Exécution et résultats

La commande de préparation génère les fiches d'essai; le scoreur refuse une campagne
incomplète ou dont les empreintes de preuve ne correspondent pas. Les sorties sous
`benchmarks/**/results/` sont ignorées par Git jusqu'à une revue explicite.

Aucune campagne n'a été exécutée dans ce document. Toute publication future doit donner
la révision Git, le modèle servi, les paramètres, l'ordre, les données brutes, les reçus
et les limites. Ce protocole complète l'[ADR 0113](../adr/0113-benchmark-avec-sans-genos.md)
sans remplacer son exigence de comparaison appariée réelle.

## Limites

- Deux répétitions qualifient l'instrumentation, pas une supériorité générale.
- Les variantes croisées peuvent conserver un écart de difficulté résiduel.
- Les temps et jetons ne sont comparables que s'ils proviennent du même instrument.
- Un SHA-256 établit l'intégrité d'un fichier, pas la validité de son raisonnement.
