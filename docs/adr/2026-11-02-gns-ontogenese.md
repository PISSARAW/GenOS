# Raccorder GNS à l'historique de l'ontogenèse

## Décision

Le contexte développemental résident et les frontières de dispatch, d'intégration
et d'échec ou de suspension capturent les mesures GNS dans `ontogenesis_nervous_history`.
L'organisation vient de `gvxScope.organizationId` du projet **persisté** ;
une configuration passée à un appelant ne remplace pas cette identité.
Le projet doit donc posséder ce scope explicite et GNS doit être activé.

Chaque exécution conserve un instantané avant et après, idempotent par phase.
Les références des signaux, les dates des mesures de pression, de couverture et
de menace, l'issue d'intégration, d'échec ou de suspension et l'état du projet
permettent de comparer les adaptations réellement
tentées. Le contexte des missions expose les vingt captures les plus récentes.
La table est créée de manière idempotente lors de la première capture active.
La purge autorisée des traces du projet l'inclut dans son manifeste et sa
suppression, sans supprimer les signaux conservés dans la base GNS séparée.

## Frontières

Une différence de pression est une comparaison descriptive, jamais une preuve
d'amélioration ou d'attribution causale. Une mesure périmée devient inconnue ;
son signal reste dans l'historique. Les reçus sont `UNVERIFIED` et ne donnent
aucun droit de promotion. Une panne du pont retourne `UNAVAILABLE`, sans modifier
les gates de dispatch, de vérification ou d'intégration.

## Validation

`node --test backend/tests/nervous/gnsOntogenesis.test.js` exerce le contexte
développemental réel avec SQLite, l'historique, les comparaisons avant/après,
l'idempotence, la configuration canonique, l'expiration, la désactivation,
les contrôleurs de dispatch/intégration/échec et la purge autorisée des traces.
