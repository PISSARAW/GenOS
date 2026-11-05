# Frontières comportementales générées et reçues par l'hôte

Date : 2026-11-05. Statut : adopté, qualification native séparée requise.

## Problème

Des tests visibles verts et une sortie JSON conforme ne démontrent pas la correction
sémantique d'une solution. Le premier essai Q7 fondé sur un script libre a accepté
une assertion lisant le texte source : elle distinguait deux fichiers sans appeler
l'API métier. Cette observation invalide ce format comme preuve de frontière.

## Décision

Le contrat optionnel `boundaryTestContract` est explicite dans la mission et son
hash normalisé entre dans l'enveloppe d'autorité scellée. Sa modification après
admission est refusée. Le contrat déclare un module CJS, les fichiers visibles,
l'API publique autorisée et ses postconditions. Il est distinct de l'oracle
arithmétique Q5 et de tout jugement général de correction.

`sourceHashes` déclare les hashes initiaux des sources, calculés par l'opérateur à
partir des octets du workspace avant lancement et inclus dans ce même scellement.
Le cache hôte borné conserve les octets initiaux durant les réparations d'un run.
Après reload, restart ou éviction, un cache froid ne peut utiliser le fichier
courant que si son hash correspond à cet ancrage initial. Sinon il refuse
`Q7_BASELINE_ANCHOR_UNAVAILABLE` avant application, sans prendre silencieusement
un candidat pour l'original. Cela ne promet pas de recovery complet après restart.

Chaque membre exposé déclare une signature de domaines fermés : instant ISO avec
offset explicite, liste de records JSON à clé numérique finie, entier sûr, chaîne
ou valeur JSON finie de profondeur bornée. Les arguments hors domaine sont refusés
avant application/exécution des cas. Ce mapping ne contient aucun résultat attendu.

Le worker propose le code et `boundary-cases.json`. Ce document contient uniquement
des appels, constructions, méthodes, arguments JSON et résultats attendus. L'hôte
valide ce format, installe `.genos/boundary-check.cjs` et son contrat protégé, puis
exécute les cas. Le module est chargé dans un contexte sans `require`, `process`
ou accès aux fichiers, avec compilation dynamique interdite et appels synchrones
bornés. Le runner conserve les assertions et attentes du côté hôte ; le module ne
reçoit que les arguments métier. Ce contexte réduit les capacités disponibles ;
il ne remplace pas le confinement général du runtime et ne constitue pas une
preuve universelle de sûreté contre du JavaScript hostile.

Le module et le dispatcher utilisent deux contextes distincts. Les intrinsics et
l'état privé du dispatcher ne sont pas ceux du module : remplacer `Reflect.apply`
dans le module ne remplace pas l'API réellement appelée par le runner. Ce cas a
falsifié une première version déclarative et reste un contrôle négatif permanent.

L'hôte exige quatre observations réelles : tests visibles verts sur le candidat,
frontières vertes sur le candidat, tests visibles verts sur l'original, et échec
identifiable d'une assertion de frontière sur l'original. Un crash, une dépendance
absente, un timeout ou une frontière déjà verte ne constituent pas ce témoin.
Chaque cas doit observer un résultat effectif de l'API. Les postconditions telles
que non-mutation et nouvelle liste proviennent du contrat public, sans ajouter une
exigence d'identité des éléments absente de la spécification.

L'original est exécuté dans un monde possédé par l'hôte, sous le workspace autorisé,
avec identifiant de propriétaire et chemins sans symlink. Les hashes des sources,
cas, tests visibles et runner sont vérifiés avant et après exécution. Les reçus des
deux lots sont de vraies lignes natives `local_code_test_execution_receipts`.
Un témoin marqué par l'hôte lie ces reçus, le scope réel, le contrat et les hashes.
Une copie de cet objet fournie par le modèle ne devient pas un témoin admissible.

Le rapport ajoute une affirmation bornée sur cette régression finie. Les anciennes
évaluations `null` ou `false`, les leases, budgets et gates restent applicables.
Un score d'oracle caché ne peut jamais créer une preuve admissible. Les réparations
éventuelles consomment les plafonds existants et ne les augmentent pas.

## Diagnostic du dernier candidat

Pour ce contrat, l'événement durable `CODE_CANDIDATE_OBSERVED` est écrit après
application effective du lot et avant les tests. Il contient le scope, les hashes
et contenus des sources et cas appliqués, `promoted:false` et un hash du payload.
Ce hash porte sur la projection canonique `schema`, `promoted`, `scope`, `stage`,
`files` ; les annotations de transport `traceId`/`requestId` en sont exclues.
Il permet de sélectionner le dernier candidat réellement appliqué même si une
gate le refuse. Il ne rejoint jamais les références de preuve ni les handoffs.
Une capture échouée est une erreur explicite, pas une absence silencieuse.

## Validation et limites

La CI honnête reconstruit trente épisodes : dix-huit solutions archivées correctes
et douze témoins synthétiques, sur trois problèmes publics. Elle exécute de nouveaux
tests et produit des reçus frais puis une déclaration explicitement conforme au
critère fini. Elle ne réécrit pas les anciens rapports négatifs et ne mesure pas le
taux d'acceptation d'un modèle. Deux archives à score caché maximal restent des
contrôles négatifs d'admission légitimes.

Les négatifs permanents couvrent les frontières absentes, copiées ou déjà vertes,
le script cosmétique d'inspection source, une source encore fautive, les mutations
du contrat et des fichiers, les chemins sortants et les symlinks. Une qualification
native sur un checkout isolé reste nécessaire avant tout nouveau banc mesuré.

Cette preuve porte uniquement sur les comportements finis déclarés. Elle ne prouve
ni l'exhaustivité des frontières choisies, ni la correction sur toutes les entrées,
ni l'absence d'une solution qui mémorise des exemples. Les cas cachés restent un
instrument d'évaluation indépendant, extérieur au contrat et à ses preuves.
