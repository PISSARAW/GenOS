# 0333 — Biocénose : cycle persistant et finalisation vérifiable

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : Biocénose, délibération, reprise, preuves

## Contexte

Les douze politiques de variant existaient, mais les révisions ne modifiaient pas
l'agrégation finale. La stabilité ne conservait pas ses résultats intermédiaires.
Un résultat mixte incomplet pouvait être finalisé et les exécuteurs de vérification
n'étaient invoqués que par Hybrid Oracle. Les actions écologiques restaient proposées.

## Décision

Chaque étape et son résultat sont enregistrés atomiquement dans le journal append-only,
avec numéro de tour, hash de résultat et hash de constitution. La reprise valide ces
reçus et reprend à l'étape suivante. Une lease SQLite exclusive empêche deux runtimes
d'exécuter simultanément une communauté. Les résultats terminaux sont relus sans
réexécuter les modèles ni créer un deuxième jugement.

L'agrégation applique les révisions et leurs probabilités avant le pooling. Les tours
stables sont comptés sur les agrégations persistées. Les sorties sont évaluées par
une politique commune et récursive : une sortie vide ou inconnue reste non réglée.
La finalisation mixte vérifie la couverture des claims persistés et leur type propre.
Les questions normatives restent soumises au jugement humain.

Un exécuteur déterministe fourni est utilisé par tous les variants disposant du
vérificateur approprié. Les reçus hors claim ou hors vérificateur sont refusés.
Les fournisseurs observés restent distincts des fournisseurs déclarés ; leur diversité
n'est pas une mesure de l'indépendance des erreurs.

Le contrôleur observe chaque tour. Les candidats supplémentaires fournis peuvent
combler les déficits de rôles avant un nouveau tour scellé. Les actions externes sont
adressées aux adaptateurs explicites et ne sont déclarées terminées qu'avec un reçu
de confiance lié à la communauté, à l'action et à sa clé d'idempotence.

## Conséquences

Les statuts publics existants sont conservés ; `decisionOutcome` explicite la nature
du jugement. `executeBiocenoseMission` relie préparation et exécution, et peut reprendre
une communauté existante. `npm --prefix backend run test:biocenose` exécute les tests
du composant, la matrice des douze variants et les régressions de cycle.

Les adaptateurs externes doivent honorer la clé d'idempotence après une interruption
entre leur effet et l'enregistrement du reçu. Un adaptateur absent est signalé par
`DEPENDENCY_REQUIRED`. Ni ce statut ni un transport réussi ne constituent une preuve
d'exécution. L'indépendance cognitive et la supériorité causale nécessitent toujours
des données et expériences réelles.
