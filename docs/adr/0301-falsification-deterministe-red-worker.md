# ADR 0301 — Falsification déterministe du red worker

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Workers, revue adversariale, preuve
- **Décideurs** : Équipe GenOS
- **Lié à** : ADR 0294, ADR 0300

## Contexte

Le `red_worker` pouvait décrire un contre-exemple dans un rapport généré,
mais ne disposait pas d'une route qui le recalculait indépendamment. La
campagne comparative ne mesurait donc aucune falsification adversariale.

## Décision

La méthode `falsify_procedure` reçoit une procédure déterministe bornée
et un reçu candidat. Elle recalcule la procédure avec le même exécuteur
que le vérificateur, compare les sorties et produit un rapport avec le
reçu recalculé. Le verdict est `reject` si une divergence est observée.
Il est `unresolved` en l'absence de divergence ; ce verdict ne prétend pas
prouver la correction générale de l'algorithme. Le budget de modèle de
cette route est zéro token. Le rapport `reject` doit contenir un
contre-exemple reproduisible ; `unresolved` peut avoir une liste vide.

## Conséquences

Un cas supplémentaire du benchmark dispose d'un oracle indépendant.
Cette route ne recherche pas encore des entrées adverses inconnues et
ne remplace pas la revue de code ou la découverte d'exploits. Le reçu
SHA-256 relie les paramètres au calcul observé ; il n'atteste pas à lui
seul la confiance dans l'environnement d'exécution.

## Alternatives

- Déclarer toute divergence décrite par un modèle comme contre-exemple :
  rejeté, faute de reproduction indépendante.
- Déclarer `accept` quand aucun contre-exemple n'est trouvé : rejeté,
  car un seul cas non falsifiant ne prouve rien au-delà de ce cas.
