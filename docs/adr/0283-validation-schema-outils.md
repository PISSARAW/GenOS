# ADR 0283 — Validation JSON Schema et porte d'exécution des outils

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Holobionte, outils, validation de schéma
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0277, ADR 0282

## Contexte

La validation des invocations ne contrôlait que quelques propriétés d'objets et ne
vérifiait pas les sorties après exécution. Des schémas complexes pouvaient donc
passer l'autorisation sans que leurs contraintes soient appliquées.

## Décision

Valider récursivement un profil JSON Schema explicite comprenant types, objets,
tableaux, énumérations, constantes, bornes scalaires, expressions régulières et
combinateurs. Les mots-clés hors profil ou les schémas invalides sont refusés. La
porte `executeToolInvocation` exige d'abord une autorisation de manifeste, lease,
santé, révocation et entrée; elle exécute ensuite le callback et valide la sortie
contre le schéma de sortie avant de l'accepter.

## Conséquences

### Positives

- Entrées et sorties sont validées par le même moteur récursif.
- Un callback d'exécution ne peut pas être appelé sans autorisation complète.
- Les mots-clés non implémentés échouent explicitement au lieu d'être ignorés.

### Limites

- Ce profil n'est pas l'intégralité d'un draft JSON Schema : les références `$ref`,
  les formats et les vocabulaires non listés sont refusés.
- La validation de sortie intervient après l'effet du callback; elle peut rejeter le
  résultat mais ne peut pas annuler l'effet outil.

## Alternatives

- Ajouter une dépendance de validation tierce immédiatement : rejeté pour garder le
  runtime autonome; un futur ADR pourra choisir une implémentation conforme à un
  draft complet si les missions l'exigent.
