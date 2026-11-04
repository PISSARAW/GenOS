# Comparaison du chemin natif

Ce banc reprend exactement le corpus, l'ordre des paires, les graines et les
budgets du pilote réduit. Chaque tentative ouvre sa propre base sur D: et
utilise le bootstrap natif du worker, la sélection de l'ADN Hachimoji, le budget
parent partagé, l'autorité signée, `modelRouter`, l'exécuteur de patches et les
contrôles de preuves. Les candidats restent DRAFT ; aucune promotion n'est appelée.

La préparation inscrit le génome dans le catalogue de sélection privé de chaque
base expérimentale. Son drapeau `active` permet cette sélection locale ; il
ne change pas le statut DRAFT du container ADN et ne touche pas au catalogue
de production. Le lease MCP demandé est restreint à l'ensemble vide : les
quatre outils déclarés par cet ADN ne peuvent pas élargir la politique du
worker. L'exécuteur de patches reste soumis à son contrat d'écriture, aux
chemins autorisés et à sa commande de test.

Les limites `attempts=1` et `outputTokens=1536` traversent la normalisation de
mission et sont scellées dans l'autorité. Le temps total et les 8192 tokens
restent bornés ; un refus natif n'est pas transformé en réussite.

Le contrôleur autonome du lancement initial a refusé un graphe de vérité
absent. Le contrôleur de cette campagne est donc un programme local. Il
exécute le worker natif complet et rapporte séparément sa preuve native et
les douze assertions indépendantes sur le candidat. Ce programme ne démontre
pas la réussite d'une mission d'orchestration autonome générale.

## Archives et reproduction

Laboratoire : `D:/GenOS-Experiments/local-code-temp-native-20261104`.
Campagne préréférencée : `archive/native-1793791715877`.
Manifeste : `662ba43f07176b9866bc1b4b018660199a210e40e4f535099b760c04c3308a85`.

Sources figées : archive complète du commit `01333f81c`, plus la couche de
transport `eb7b89601` contenant `workerInferenceLimits.js` et
`agentRuntimeAdapter/missionPlanningValues1.js`. Le manifeste conserve les
empreintes des deux archives, du CLI et des scripts. Les scripts exacts de la
mesure restent dans le laboratoire ; cette copie versionnée adapte seulement
la résolution de la racine, configurable par `GENOS_NATIVE_TEMPERATURE_LAB`.

Le banc dépend du pilote historique sur D: pour ses génomes et son oracle
immuable, et du checkout source pour les dépendances Node installées en lecture.
Les clés de preuve locales restent dans `private/keys.json`, hors Git et hors
des rapports. Elles ne sont jamais des clés de signature de génome.

```powershell
node benchmarks/local-code-temperature/native/prepare.cjs
node benchmarks/local-code-temperature/native/campaign.cjs <archive>
node benchmarks/local-code-temperature/native/verify.cjs <archive>
node benchmarks/local-code-temperature/native/audit-receipts.cjs <archive>
node benchmarks/local-code-temperature/native/audit-results.cjs <archive>
```

Une commande de vérification réussie confirme le rejeu et la cohérence de
l'archive. Elle ne modifie pas le verdict natif et ne qualifie ni ne promeut
un génome. Les refus et les prétests exclus sont conservés séparément.

L'audit supplémentaire ouvre les bases en `READONLY`, vérifie la chaîne MAC
de l'autorité, la liaison ADN authentifiée, les observations immuables, le
tour de modèle persistant et l'absence de promotion. Une tentative interrompue
reste `INCOMPLETE_NATIVE_EXECUTION` et rend cet audit global `INCOMPLETE`.
Il ne remplace pas un reçu natif absent ou négatif.

## Résultat du 2026-11-04

Les 18 tentatives ont tenu dans la borne globale de 25 minutes : fenêtre
observée de 21 min 49 s. Une génération réelle par tentative, aucune relance.

| Mesure | Température 0,45 | Température 0,2 |
| --- | ---: | ---: |
| Réparations passant les 12 assertions dans le budget | 1/9 | 3/9 |
| Assertions réussies, refus et données manquantes comptés zéro | 48/108 | 69/108 |
| Tokens fournisseur | 14626 | 14614 |
| Génération médiane, secondes | 3,116 | 3,087 |
| Durée totale médiane, secondes | 78,676 | 64,822 |
| Tentatives dans le budget | 8/9 | 8/9 |
| Reçus natifs acceptés | 0/9 | 0/9 |

Le coût financier reste inconnu. Le domaine de preuve des réparations
JavaScript n'est pas disponible (`ORACLE_DOMAIN_UNAVAILABLE`) ; les tests
externes ne remplacent pas cette preuve. Aucun génome n'a été promu.

Le vérificateur strict conserve son échec sur un résultat absent après timeout.
L'audit natif est `INCOMPLETE` (16 autorités et liaisons ADN authentifiées,
2 interruptions). L'audit des résultats est `COHERENT_WITH_TIMEOUTS`, avec
neuf paires de paramètres vérifiées. Les prompts ne diffèrent que par deux
identifiants natifs ; la neutralisation de ces identifiants sert uniquement à
l'analyse, sans changer les requêtes réelles. Le corpus répété et la charge
du poste ne permettent pas de conclure à une supériorité générale.

L'index local `archive/native-1793791715877/evidence-index.json` référence
686 fichiers ; SHA-256 :
`63f76c4b51c229e379d35047709533493611acbd1845bbb6265db6926ba2b419`.
Le bilan détaillé et les limitations sont dans `conclusion.md` de l'archive.
Les artefacts générés et les bases restent sur D:, hors Git.
