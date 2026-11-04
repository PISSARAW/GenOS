# Coopération LLM : diagnostic et corrections du pilote

Cette fiche conserve les corrections initiales et leurs résultats contrôlés.
Le [contrat v3 fondé sur le constat](../02-orchestration/planification-cooperation-depuis-constat.md)
remplace la planification préalable après les [deux refus réels du plan](cooperation-llm-plan-refuse-2026-11-04.md).

- **Statut** : corrections implémentées ; requalification avec un vrai LLM à réaliser.
- **Date** : 2026-11-04.
- **Portée** : allocation bornée, runtime Node, oracles sémantiques natifs,
  arrêt des récupérations et comptabilité des tentatives.
- **Décision** : [ADR 0791](../adr/0791-cooperation-llm-verification-et-arret.md).

## Échec réel du 2 novembre

Les traces de `D:/GenOS-runs/worker-cooperation-live-20261102-170831` et son runtime
archivé au commit `39c40d308` montrent :

1. Le daemon reçoit `[4,9,6,3,8]`, la cible `17` et les indices `[0,1]`.
   L'observation attendue avec les indices du pilote est `4+9=13`, donc une anomalie.
2. Qwen répond deux fois `outcome: unresolved`, `claims: []`. Le runtime émet
   `AGENT_FAILED / EVIDENCE_GAP`, sans lancer l'oracle. `guardrail_reason` est nul
   dans les deux runs. La finalisation du reçu ajoute ensuite l'exigence
   `require_independent_verification` : elle est secondaire, pas la cause initiale.
3. Une récupération automatique `mutate_worker` relance le daemon. Une reprise
   `fork_worker` échoue ensuite avec `SQLITE_MISUSE: Database is closed` parce que
   le pilote ferme la base avant sa fin. Ce mécanisme ne constitue pas une
   restauration par le `recovery_worker` du protocole.
4. Spécialiste, vérificateur et restauration ne sont pas atteints. Le plan initial
   imposait déjà les rôles et l'ordre ; il ne prouve pas une décomposition autonome.

Les deux réponses passent le schéma JSON transmis. Un témoin construit avec
`observedSum:13`, `target:17`, `anomaly:true` le passe aussi : ce contrôle hors
ligne n'est pas une réponse du modèle ni une preuve promue. Les données existent
dans les deux prompts effectifs, longs de 10 397 et 13 638 caractères. Les sorties
de 37 et 29 tokens sont très inférieures aux plafonds. Charge du prompt,
références de preuve ambiguës et convention d'indices implicite sont des facteurs
possibles ; leur causalité précise n'est pas établie.

| Appel historique | Entrée | Sortie | Total |
| --- | ---: | ---: | ---: |
| Plan | 105 | 96 | 201 |
| Daemon 1 | 3 479 | 37 | 3 516 |
| Daemon 2 | 4 465 | 29 | 4 494 |
| Total principal | | | **8 211** |

Le prétest de transport ajoute 37 tokens, soit 8 248. Les 4 695 annoncés
initialement omettaient le premier daemon. Ce total ne couvre pas tous les essais
de démarrage historiques. Les originaux `RESULTAT.md` et `llm-protocol-report.json`
restent conservés ; `ANALYSE-ECHEC.md`, `analysis-sql.json`,
`analysis-model-requests.json` et `analysis-controls.json` portent la correction.

## Corrections versionnées

- Le reçu garde la cause terminale et l'exigence de promotion dans des champs
  distincts, sans modifier les anciens reçus scellés.
- Les refus OMEGA conservent aussi leur code et leur cause interne, sans recopier
  tout le prompt dans le diagnostic. Un appel fournisseur sans mesure finale
  rend le total inconnu ; il n'est pas présenté comme gratuit.
- Le suivi des dispatchs couvre aussi l'attente initiale de la file durable.
  L'arrêt du pilote annule les reprises, attend leurs écritures et leurs tâches,
  puis ferme la base. L'expiration de l'attente n'autorise pas sa fermeture.
- Le contrôleur de la fixture native reçoit une durée couvrant ses quatre
  allocations séquentielles maximales, au lieu de réutiliser le délai d'un seul
  worker. Les durées et l'expiration des autorités restent contrôlées.
- Le contrat `resource_allocation` lie les trois étapes génératives aux octets
  sources et à deux oracles séparés. Le préflight refuse un contrat absent ou
  incompatible avec le rôle avant l'appel au modèle.
- Le prompt permet le calcul sur les faits fournis, indique les indices depuis
  zéro et harmonise les références `mission` et `sha256`. L'abstention demeure valide.
- Le rapport conserve tous les runs, y compris les échecs et les forks, ainsi que
  les reçus, références de passation, coûts, état d'arrêt et limites expérimentales.

## Vérifications reproductibles

```powershell
node backend/tests/test_worker_cooperation_regressions.cjs
node backend/tests/test_worker_cooperation_live.cjs
node backend/tests/test_worker_cooperation.js
```

Le second test utilise un fournisseur HTTP contrôlé : ses réponses sont des
fixtures déclarées, pas des générations LLM. Le dispatch, la base, les capsules,
les gates et les processus d'oracle restent réels. Il exerce le parcours complet
et le refus d'une abstention sans lancer les étapes suivantes. Le premier teste
aussi les réponses arithmétiques fausses, les indices invalides, les verdicts
contradictoires, le drainage bloqué et le coût de plusieurs runs/forks.

## Résultats de correction du 4 novembre

Le parcours HTTP contrôlé passe : quatre workers distincts, quatre reçus
sémantiques vérifiés, deux processus d'oracle par étape (huit au total),
checkpoint restauré et source inchangée, en 104 412 ms pour le cas positif final.
L'autorité du contrôleur est contrôlée avant chaque dispatch et encore valide
après la restauration. Les compteurs de la fixture annoncent
560 tokens : c'est une donnée du fournisseur simulé, pas une mesure d'un vrai LLM.
Le scénario d'abstention passe également : pas de spécialiste lancé après le
daemon, arrêt propre et coûts de toutes les tentatives conservés. Chaque cas
utilise son propre processus et sa propre base, pour respecter les caches de
runtime à portée de processus.

Les tests de régression et de reçus biologiques passent. Le contrôle global de
qualité a vérifié 8 880 fichiers sans violation nouvelle ; le contrôle des fichiers
staged passe aussi. Les preuves locales et les versions figées des sources sont
conservées dans `D:/GenOS-runs/cooperation-correction-checks-20261104`.
Après correction du délai du contrôleur, les trois scénarios natifs passent
également : huit workers, zéro token modèle, seize processus d'oracle et
134 634 ms, sous leur limite globale de 180 000 ms. L'index des ADR de la copie
figée est cohérent (933 fichiers et 933 entrées).

Les suites générales ne sont pas déclarées entièrement vertes : `npm test`
s'arrête après 10/11 tests de biologie (timeout du catalogue Hachimoji). Le nouveau
contrôle isolé du checkout mutable signale ensuite une dérive de son empreinte de
qualification ; la copie figée valide bien 234/234 entrées. `cargo test --workspace`
échoue sur le test de continuité des délégations (deux appels observés, trois
attendus), puis ce test passe seul. Ces résultats et les modifications simultanées
du checkout interdisent de conclure à une qualification globale du dépôt.

## Nouvelle exécution réelle sur D:

Créer un fichier de configuration, par exemple `D:/GenOS-runs/cooperation-config.json` :

```json
{"root":"D:/GenOS-runs/cooperation-live-nouveau","model":"ollama://qwen2.5-coder:7b"}
```

Le répertoire `root` doit être nouveau et son parent doit exister. Le serveur
Ollama et le modèle doivent être disponibles ; l'endpoint se configure avec
`GENOS_OLLAMA_ENDPOINT` si nécessaire, avec le chemin natif `/api/chat` pour borner
le contexte Ollama (défaut `http://127.0.0.1:11434/api/chat`). Depuis le dépôt :

```powershell
node backend/bin/qualify-worker-cooperation-live.cjs D:/GenOS-runs/cooperation-config.json
```

Le pilote conserve la base, les snapshots, les capsules, le checkpoint et
`report.json` dans ce répertoire. `private/credentials.json` contient les clés
locales d'inspection : ne pas le publier ni le committer. Le budget partagé des
workers est de 64 000 tokens, 1 USD déclaré et 12 minutes ; chaque lancement a
un budget de 16 000 tokens et 3 minutes. Le plan est borné à 512 tokens de sortie
et 1 024 tokens mesurés au total dans la version v2 décrite ici. La version v3
dispose de 768 tokens de sortie et 4 096 au total pour inclure le constat.
La facturation fournisseur ne mesure pas le
coût matériel d'un modèle local.

Le succès exige tous les reçus sémantiques, un vérificateur distinct, la capsule
restaurée, la source inchangée et l'arrêt propre. Une reprise consomme le budget
partagé et reste visible. Le plan est une proposition sur un catalogue de rôles
connu ; ce protocole ne qualifie ni une planification générale ni un incident de
production. Aucun résultat d'un nouveau vrai LLM n'est revendiqué par cette fiche.
`qualified` est le verdict du pilote sur ce protocole borné ;
`genosMissionQualified` reste faux, car aucune complétion native de la mission
racine n'est affirmée. Son run de contrôle est arrêté explicitement en fin d'essai.
