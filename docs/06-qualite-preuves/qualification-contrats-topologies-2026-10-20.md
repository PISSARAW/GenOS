# Qualification des contrats des huit topologies — 2026-10-20

- **Type** : rapport de preuve borné
- **Périmètre** : lanceur transverse, contrats de workers, repli des variants et suites dédiées
- **Statut** : validation locale partielle ; production et fournisseurs réels non certifiés
- **Révision observée** : checkout local du 2026-10-20

## 1. Question de qualification

Le dépôt fournit huit topologies : Trinity, A-Team, Biome, Biocénose, Rhizome,
Syncytium, Holobionte et Metapopulation. Le lanceur
`backend/tests/run_topology_contracts.cjs` vise une question plus étroite que la
réussite produit :

> chaque topologie dispose-t-elle d’un point d’entrée de test reproductible, et
> les frontières communes refusent-elles les succès prématurés ?

Cette qualification ne mesure pas la qualité des réponses de modèles ni la
supériorité d’une topologie.

## 2. Catalogue exécuté

Le lanceur associe exactement un groupe à chacun des huit identifiants :

| Identifiant | Suites appelées |
| --- | --- |
| `trinity` | suite Trinity et qualification GQWF |
| `a_team` | e2e, attente terminale et runtime multiteam |
| `biome` | suite Biome |
| `biocenose` | suite Biocénose |
| `rhizome` | suite Rhizome |
| `syncytium` | suite Syncytium |
| `holobionte` | suite Holobionte |
| `metapopulation` | profil Metapopulation de la validation commune |

Sans filtre, cinq groupes de frontière sont ensuite exécutés :

1. attente de la terminaison des workers et lecture de leurs résultats ;
2. traçabilité des replis de variants ;
3. reçus biologiques et reprise ;
4. commit gouverné de Morphogenèse ;
5. démarrage et stdio du runtime LLM local.

Le test de catalogue refuse un doublon, une topologie absente ou un groupe
supplémentaire présenté comme neuvième topologie.

## 3. Commandes

```bash
node backend/tests/run_topology_contracts.cjs --list
node backend/tests/run_topology_contracts.cjs --topology=syncytium
node backend/tests/run_topology_contracts.cjs
```

Le filtre `--topology=<id>` exécute seulement le groupe demandé. Il n’exécute
pas les cinq contrôles de frontière. Une qualification complète exige donc la
commande sans filtre.

Chaque script enfant dispose d’un timeout de dix minutes. Un code de sortie non
nul ou une erreur de lancement rend le groupe rouge. Le résumé distingue le
nombre de groupes topologiques et celui des frontières ; il ne transforme pas
une suite partiellement verte en succès.

### 3.1 Dossier de preuve du lanceur

Chaque exécution de qualification, filtrée ou complète, persiste un dossier
`genos.qualification-evidence-bundle/v1` sous
`artifacts/qualification/topology-contracts/`. Le chemin peut être fixé avec
`GENOS_QUALIFICATION_EVIDENCE_FILE`. Le dossier contient la révision Git et son
état propre ou modifié, l’environnement Node/OS, chaque commande et son code de
sortie, les sorties partielles hachées et bornées, les tests non exécutés, les
échecs et un verdict terminal parmi :

- `qualified` : toutes les commandes prévues ont terminé avec succès ;
- `failed` : au moins une commande ou le lanceur a échoué ;
- `inconclusive` : timeout, commande manquante dans l’exécution ou absence de
  preuve suffisante ;
- `environment_blocked` : l’environnement a refusé ou empêché l’exécution
  (`ENOENT`, `EACCES`, `EPERM` ou `ENOTCONN`).

Un timeout ou une exception du lanceur produit donc encore un dossier terminal
et un code de sortie non nul. Il n’est jamais converti en qualification.

Les métadonnées expérimentales facultatives sont lues depuis
`GENOS_QUALIFICATION_SEED`, `GENOS_QUALIFICATION_PROVIDER`,
`GENOS_QUALIFICATION_BUDGETS_JSON` et
`GENOS_QUALIFICATION_ARTIFACTS_JSON`. Les identités distinctes de producteur et
de vérificateur peuvent être déclarées avec
`GENOS_QUALIFICATION_PRODUCER_ID` et `GENOS_QUALIFICATION_VERIFIER_ID` ; leur
présence ne constitue pas, à elle seule, une preuve d’indépendance effective.

## 4. Propriétés ciblées

### 4.1 Attente des workers

`workerLauncher.cjs` démarre les processus topologiques sans détachement et
attend `close`. Un code non nul est persisté comme erreur et remonté. Le contrat
empêche donc un simple événement `spawn` de clore le dispatch.

La barrière biologique refuse également un tableau `dispatchFailures` non vide,
indépendamment du mode. Pour Rhizome, elle évalue les branches attendues plutôt
qu’un tableau générique de membres.

### 4.2 Complétion

Le contrat `genos.mission-completion/v1` exige des identités de membres uniques,
les membres requis terminés, des preuves SHA-256 liées à la mission et au membre,
une validation topologique et une barrière complète. Un membre échoué a priorité
sur un verdict partiel.

Le contrat structurel ne promeut rien : `promotionEligible` reste `false`.
`missionClosureService.closeMission` ajoute workers, preuves, invariants et
oracle indépendant ; son succès peut rendre une mission techniquement éligible
à une étape de promotion, mais n'exécute aucun effet. Syncytium appelle encore
directement le contrat structurel après ses contrôles de session et conserve
donc `promotionEligible: false`.

Sur le chemin biologique non-Syncytium, la validation topologique générique est
la barrière de workers. La preuve sémantique additionnelle provient des
références d'oracle natives attachées aux reçus workers. Cette voie ne remplace
pas les invariants riches des runtimes canoniques dédiés.

### 4.3 Repli des variants

Les tests contrôlent que les résolveurs ne remplacent pas silencieusement une
proposition. Lorsque la politique autorise un repli, la sortie conserve son
origine, l’identité effective et une raison. Les variants explicitement inconnus
ou incompatibles restent refusés lorsque le contrat de la topologie l’exige.

### 4.4 Morphogenèse

Le contrôle de commit authentifié vérifie que la transition proposée traverse
les gardes de Morphogenèse. Il ne démontre pas qu’un changement organisationnel
a été appliqué dans un déploiement externe.

### 4.5 Runtime LLM

Le test `test_orchestrator_local_models.js` exerce le démarrage et les flux stdio
avec un exécutable contrôlé. Il détecte les régressions de protocole local, mais
ne contacte pas un fournisseur réel et ne qualifie aucun modèle.

## 5. Observations locales

Les contrôles ciblés du lot ont confirmé :

- le catalogue exact des huit groupes ;
- l’attente du processus worker ;
- la prise en compte des échecs de dispatch ;
- la traçabilité des replis de variant ;
- le commit authentifié de Morphogenèse ;
- le démarrage/stdio avec un faux exécutable local ;
- le groupe Syncytium et ses treize variants dans son périmètre contrôlé.

Les tests spécifiques à la clôture sont reproductibles séparément :

```bash
node backend/tests/test_common_mission_closure.js
node backend/tests/test_syncytium_completion_contract.js
node backend/tests/test_biological_mission_completion.js
node backend/tests/test_syncytium_mission_completion.js
node backend/tests/run_biology_suite.cjs
```

Ils falsifient notamment l'absence de preuve, le contenu altéré, la mauvaise
corrélation mission/worker, l'invariant faux, l'oracle absent et le snapshot
Syncytium périmé.

Lors de la relecture documentaire du 2026-10-20, les sept scripts ciblés du
catalogue, de l'attente/barrière worker, du repli, du commit Morphogenèse et du
stdio local ont rendu un code nul. `run_biology_suite.cjs`, exécuté par la suite
racine, a terminé à **8/8**. La suite Trinity a terminé à **46/47** : le seul
échec est la création du lien
symbolique de `test_trinity_l2_capsules.js`, refusée par Windows avec `EPERM`.
La suite Biocénose a annoncé **20 fichiers réussis sur 31 découverts**, puis
n'a plus produit de sortie dans la fenêtre d'observation ; elle a été
interrompue sans verdict global. Les onze fichiers restants ne sont donc pas
qualifiés par cette exécution.

La matrice complète n’a pas obtenu un verdict global vert dans l’environnement
Windows utilisé. Les observations incluent une création de lien symbolique
Trinity refusée par l’OS (`EPERM`), un canal de processus enfant fermé
(`ENOTCONN`) et une exécution Biocénose qui n’a pas fourni de verdict terminal
dans la fenêtre d’observation. Ces incidents empêchent une attestation globale ;
ils ne sont pas remplacés par une extrapolation à partir des groupes réussis.

## 6. Ce que ce rapport prouve

Il prouve l’existence d’un point d’entrée unique, son catalogue fermé et les
assertions des tests ciblés réellement exécutés. Il rend aussi reproductibles
les limites observées.

Il ne prouve pas :

- l’exécution de modèles ou fournisseurs externes ;
- la réussite de huit missions réelles ;
- l’équivalence Linux/Windows ;
- la sûreté d’effets réseau, Git, cloud ou humains ;
- la calibration causale du sélecteur de topologie ;
- une promotion de Morphogenèse en production.

## 7. Critère de promotion future

Une qualification supérieure exige au minimum :

1. la commande complète verte sur Windows et Linux ;
2. les logs et artefacts de chaque groupe conservés ;
3. une mission réelle par topologie avec provider observé ;
4. au moins un scénario négatif et un scénario de reprise par topologie ;
5. la vérification indépendante des effets externes ;
6. aucune confusion entre acceptation du dispatch, fin des workers, décision et
   promotion.

## Références

- [Tests et validation](tests-et-validation.md)
- [Contrat commun de complétion](../03-reference/contrat-completion-mission.md)
- [Architecture de clôture des missions biologiques](../02-orchestration/cloture-missions-biologiques.md)
- [Plugins des topologies](../03-reference/plugins-topologies-morphogenese.md)
- [Runtime Trinity](../03-reference/runtime-trinity.md)
- [Runtime Biocénose](../03-reference/runtime-biocenose.md)
- [`run_topology_contracts.cjs`](../../backend/tests/run_topology_contracts.cjs)

