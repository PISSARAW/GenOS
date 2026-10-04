# ADR 0294 — Exécuteurs déterministes des workers

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Workers, orchestration, preuve
- **Décideurs** : Équipe GenOS
- **Lié à** : ADR 0063, ADR 0064, ADR 0123

## Contexte

`procedural_executor` et `formal_worker` avaient un budget de zéro token, mais
aucun exécuteur relié au lancement des missions. Leur affectation échouait
fermée. Les capacités de méthode du catalogue ne suffisent pas à prouver qu'un
algorithme donné est implémenté.

## Décision

- Le contrat de méthode persisté contient des paramètres structurés. Le
  dispatch refuse toute modification de ce contrat avant l'exécution.
- Le chemin déterministe contourne le routeur de modèles. Il produit des
  événements et des artefacts contrôlés par la barrière de preuve existante.
  Le budget de stratégie conserve explicitement zéro token, même si le
  validateur commun exige un total positif pour les missions à modèle.
- Les procédures réellement implémentées sont `lpt` et `subset_sum`, avec
  bornes de taille et d'entiers. Les autres noms de méthode restent refusés.
- Le worker formel construit un théorème Lean à partir d'une comparaison
  arithmétique close, le prouve par `decide` et exige le succès du processus
  Lean de la version demandée. L'absence de Lean, un timeout ou une preuve
  rejetée terminent la mission en erreur.
- Les reçus sont calculés par le runtime sur les entrées et résultats observés.
  Ils décrivent une exécution et ne sont pas des attestations cryptographiques
  indépendantes ni des preuves de parité avec un concurrent.

## Conséquences

Les topologies peuvent affecter ces deux types seulement si une méthode
exécutable et des paramètres structurés sont fournis. La prise en charge
formelle reste limitée à l'arithmétique close et requiert Lean installé sur
l'hôte. Les benchmarks comparatifs devront mesurer des missions réelles avec
un jeu de tâches et des résultats adverses publiés séparément.
La fin d'une exécution procédurale ne contourne pas la gate de promotion :
un contrat exigeant une vérification indépendante peut garder le run bloqué.

## Alternatives

- Générer les reçus par modèle : rejeté, car aucun calcul ou preuve ne serait
  exécuté.
- Exécuter tous les noms du registre comme synonymes d'un algorithme : rejeté,
  car les contrats promettraient des méthodes absentes.
