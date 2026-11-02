# Complémentarité des types de workers : qualification locale

- **Statut** : intégration native contrôlée, pas qualification d'autonomie générale.
- **Portée** : runtime Node, sélection native des types, dispatch réel, SQLite,
  enveloppes d'autorité et oracles indépendants. Aucun dispatch simulé.
- **Date** : 2026-11-02.

## Protocole reproductible

Depuis la racine du dépôt :

```powershell
npm run qualify:worker-cooperation -- "$env:TEMP/genos-worker-cooperation-report.json"
node backend/tests/test_worker_cooperation.js
```

Le pilote crée une base et des workspaces temporaires isolés, puis les supprime
après fermeture du runtime. Le rapport JSON demandé reste disponible ; il contient
les objectifs et méthodes d'entrée, dossiers produits, identités de mission,
références de passation, empreintes d'autorité et d'oracle, PID des vérificateurs
et coûts mesurés. Les chemins des capsules du rapport deviennent historiques
après nettoyage. Ce rapport ne remplace pas une base conservée pour replay signé.

Le test est intégré à `npm --prefix backend run test:workers`.

## Incident et répartition des responsabilités

Le problème est une allocation de ressources : sélectionner dans `[3, 5, 7]`
un ensemble totalisant exactement `10`. Un fichier `allocation.json` contient
initialement les indices `[0, 1]`, soit `8` : l'écart observé est donc `2`.
Ce défaut existe effectivement dans le workspace de la fixture.

| Responsabilité | Exécution et critère contrôlé |
| --- | --- |
| Daemon | `monitor_samples` reçoit une mesure issue des octets lus sur disque, avec leur SHA-256 ; il signale l'écart au seuil zéro. |
| Orchestrateur racine | Le pilote lui fournit le protocole de réponse ; `nativeMissionPlanService` sélectionne un type unique pour chaque méthode et scelle les affectations avant le dispatch. |
| Spécialiste | `niche_procedure`, niche `resource_allocation`, calcule réellement une solution `subset_sum`, avec indices et reçu. |
| Vérificateur | Un autre worker reçoit le reçu exact du spécialiste, recalcule le résultat et rend `accept` avant application par le pilote. |
| Récupération | Après corruption volontaire du fichier, `restore_checkpoint` restaure le checkpoint vérifié dans sa capsule, sous lease sur le chemin et contrôle de l'empreinte courante. |

Chaque worker passe par `createAutonomousWorkers` et `startMission`. La campagne
exige un run terminé, un reçu biologique vérifié et une attestation acceptée par
les **deux processus d'oracle natifs** de son domaine. Elle contrôle leurs PID
distincts de celui du pilote et la présence de deux vérifications indépendantes.
Le vérificateur de procédure utilise la même implémentation de calcul pour sa
reproduction ; la diversité algorithmique vient des oracles séparés du runtime.

Le sous-orchestrateur n'est pas utilisé : son allowlist courante exclut
`specialist` et `recovery_worker`. La campagne ne modifie pas cette frontière.

## Trois cas et refus obligatoires

| Cas | Workers exécutés | Résultat attendu |
| --- | --- | --- |
| État sain | daemon seul | Aucun finding ; aucune correction ou récupération. |
| Allocation incorrecte | daemon → spécialiste → vérificateur | Écart `2 → 0`, récupération non exécutée. |
| Corruption après vérification | daemon → spécialiste → vérificateur → récupération | Écart final nul dans la capsule restaurée. |

Les objectifs de chaque étape citent la provenance de l'étape précédente. Le
reçu du spécialiste est transmis tel quel dans les paramètres du vérificateur.
La récupération reçoit le checkpoint et son empreinte après acceptation. Un
journal de contexte est relu sur disque et comparé aux dossiers collectés.
Le pilote compare l'empreinte du fichier courant à celle du checkpoint avant de
déclencher la récupération ; le paramètre de scénario injecte seulement le défaut.
Les enveloppes et preuves doivent conserver l'identité de mission attendue.

La campagne doit également démontrer les refus suivants :

- réaffecter une preuve authentique à une autre mission ;
- demander à un daemon, spécialiste ou vérificateur de merger, déléguer,
  changer la topologie ou écrire via `genos_run`, en passant par le contrôle
  du contrat persisté ;
- changer les paramètres d'une méthode après construction du contrat ;
- présenter un reçu de calcul dont la somme a été falsifiée ;
- rejouer une restauration sur un état courant différent de celui autorisé ;
- restaurer sans lease sur l'action et le chemin concernés.

La restauration n'est pas promue vers le workspace source. Le rapport distingue
`finalError` (état de la capsule restaurée) de `sourceFinalError` (source encore
corrompue), et conserve `promoted: false`. L'application de la proposition vérifiée
dans la fixture est une action explicite du pilote, pas un droit du spécialiste.

## Ressources et mesures

L'exécution finale de la commande de qualification a réussi avec **8 workers**,
**16 processus d'oracle**, **0 token de modèle** et **8 930 ms** pour les trois cas, hors
initialisation de la base. Une seule étape worker s'exécute à la fois.
Un passage dans `npm test` a mesuré **14 763 ms**, avec les mêmes
8 workers, 16 processus d'oracle et zéro token de modèle.
Le plafond de qualification est de 8 workers, 16 processus d'oracle et 180 s.
Chaque lancement garde son budget d'événements et sa limite de temps du runtime.

Le JSON expose aussi le CPU et le pic RSS du pilote ainsi que les coûts d'oracle.
Le CPU/RSS du pilote ne couvre pas ses processus enfants : aucune consommation
mémoire ou CPU totale n'est déduite de ces seules valeurs. La mesure locale
n'établit pas un avantage de coût sur un agent unique ou une autre topologie.

## Limites de la preuve

Le scénario établit une **complémentarité fonctionnelle bornée** des contrats
existants. Le défaut est réel dans une fixture synthétique ; aucun daemon de
production n'est lancé pour surveiller un dépôt utilisateur. La sonde du pilote
lit le fichier et calcule la mesure : le daemon contrôle une fenêtre fournie.

La décomposition et les conditions de passation sont explicites dans le pilote.
La sélection des types, l'exécution et la vérification sont celles du runtime,
mais aucune planification cognitive autonome face à un incident inconnu n'est
démontrée. Le journal relu démontre les passations du scénario, pas une reprise
automatique du coordinateur après crash. Aucune amélioration longitudinale ni
promotion vers un projet réel n'est revendiquée.

Sources exécutables : [pilote](../../backend/tests/run_worker_cooperation.cjs),
[dispatch et preuves](../../backend/tests/helpers/workerCooperationRuntime.cjs),
[scénarios et refus](../../backend/tests/helpers/workerCooperationScenario.cjs),
[assertions globales](../../backend/tests/test_worker_cooperation.js).
