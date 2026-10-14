# Qualification vérifiable des workers

- **Statut** : C2/C3 vérifiés pour les 19 `WorkerKind` sur Windows. La requalification du 2026-10-14 sur `2e0df82f` a passé le profil workers, le benchmark 24 cas et trois campagnes faultées (57/57 scénarios conformes). Les rapports identifient le checkout comme exploratoire car des rapports locaux non suivis sont présents. Linux reste à qualifier.
- **Date de l'inventaire** : 2026-10-12.
- **Portée** : les 19 `WorkerKind`, les méthodes du registre Node, les missions persistées et leurs preuves.

## Niveaux de preuve

| Niveau | Ce qu'il établit | Ce qu'il ne démontre pas |
|---|---|---|
| C0 — contrat | Identité, méthode, autorité et artefact déclarés cohérents. | Lancement réel. |
| C1 — méthode | Exécution sur fixture et refus des entrées ou artefacts altérés. | Dispatch, persistance et supervision réels. |
| C2 — mission | Entrée mission, contrat persistant, bail, runtime, run et preuve terminale liés. | Justesse métier indépendante. |
| C3 — oracle | Résultat contrôlé par un oracle distinct ou une évaluation humaine documentée. | Réussite de toute mission libre. |
| C4 — robustesse | Répétitions et fautes injectées sur environnements explicités. | Garantie statistique hors des conditions mesurées. |

Une méthode n'est dite qualifiée que si C0 à C3 passent pour sa tâche bornée.
C4 est rapporté séparément avec le nombre d'essais et les échecs. Aucun statut
`unavailable`, `unmeasured` ou `skipped` ne vaut réussite.

## Inventaire exécutable

`node backend/tests/workerQualificationInventory.cjs` produit l'inventaire du
registre, des artefacts et des cas du benchmark avec son digest SHA-256. Le test
`test_worker_qualification_inventory.js` refuse un type sans exécuteur ou cas,
un identifiant dupliqué et une méthode de benchmark non enregistrée. L'inventaire
actuel contient **19 types, 25 méthodes et 24 cas de benchmark**.

La matrice `test_worker_native_matrix.js` exécute une méthode par type avec
artefact typé et provenance, soit C1 pour ces 19 couples type-méthode. Ses
enfants de sous-orchestrateur empruntent un transport simulé. Les méthodes
supplémentaires `verify_memory_fidelity`, `verify_code_postconditions`,
`formal_proof` et `theorem_proving`, ainsi que le second algorithme du worker
procédural, exigent leurs propres reçus d'exécution et oracles. Le test Lean
unitaire injecte un exécuteur ; une qualification formelle exige Lean réel.

Les 24 cas disposent maintenant d’un oracle ; `bounded-code` est mesuré par une
mission Ollama réelle et son oracle relit le reçu biologique, l’attestation du
quorum natif et les deux stratégies de postconditions. Les détails du run sont
consignés dans le bilan du 2026-10-12 ci-dessous. Le registre contient aussi deux
méthodes sans cas benchmark propre : `verify_memory_fidelity`,
`replenish_external_quota`. La vérification mémoire
est exercée par `test_native_memory_budget.js` ; le quota externe a ses probes
fournisseur et supervision et une matrice 19 workers × 2 cycles ;
`coordinate_children` dispose maintenant de son cas comparatif `subgraph-delegation`
avec oracle indépendant. Ces preuves sont séparées du score comparatif.
Le candidat créatif peut être contrôlé sur son contrat et évalué selon une
grille explicite ; son originalité universelle n'est pas déductible d'une fixture.
Le cas médical reste synthétique et pédagogique, sans validation clinique.

## Campagne exploratoire du 2026-10-11

Sur Windows, le profil `workers` a passé ses **28 suites**, dont la matrice
native **19/19**. Cela donne C0 et C1 à une méthode testée par type, et non
aux 25 méthodes du registre. Le benchmark a rendu **23 `passed` et 1
`unmeasured`** sur 24 cas, avec Lean 4.34.0 réel. Son résultat formel prouve
l'exécution du cas arithmétique par Lean, mais pas la promotion d'une mission
`formal_worker`. Les deux cas Lean et la mission `formal_worker` ont chacun
recompilé leur claim. Seize cas disposent d'un oracle indépendant du producteur :
les trois observations du README, les huit oracles structurés, la procédure
bornée, le contrôle de code sur 264 entrées, l'arithmétique exacte et les deux
méthodes formelles recompilées par Lean. Les sept autres cas `passed`
réutilisent encore le module de l'exécuteur et ne prouvent pas l'indépendance de
son implémentation.

La campagne de missions a démarré chaque type dans un processus, une racine
temporaire et une base SQLite distincts. Dix-neuf missions ont été promues avec
une preuve C2/C3 sur leur tâche bornée :
`bounded_worker → scoped_procedure → subset_sum`,
`procedural_executor → subset_sum`, `scout_cell → scan_literal` et
`resident_daemon → monitor_samples`, `forensic_worker → trace_declared_causes`,
`experimental_worker → measure_lpt`, `synthesis_worker → synthesize_claims`,
`verifier_worker → verify_procedure`, `red_worker → falsify_procedure` et
`teaching_worker → teach_subset_sum`, `formal_worker → formal_proof` avec Lean
4.34.0, `recovery_worker → restore_checkpoint`, `liaison_worker → prepare_handoff`,
`sub_orchestrator → coordinate_children` avec deux enfants, `adaptive_worker → adapt_procedure`,
`specialist → niche_procedure`, `symbiotic_worker → host_procedure`,
`creative_worker → combine_candidates` et `medical_worker → review_synthetic_case`.
Pour chaque mission, deux processus
d'oracle distincts ont recalculé les postconditions, puis la décision
persistée a été acceptée. Le scan vérifie des occurrences littérales et ne
prouve ni l'authenticité ni l'interprétation des sources. Le daemon vérifie
les seuils numériques et la structure du rapport, pas la justesse des capteurs.
L'expérimentation confirme une mesure LPT bornée, sans prouver l'optimalité
globale. Le forensique recopie les liens causaux déclarés, sans établir leur
vérité. La synthèse conserve des désaccords exacts, sans décider la vérité
des claims. Le contrôle Lean recompile la source reconstruite depuis le contrat,
vérifie la version du toolchain et rejette le reçu altéré. L'oracle de récupération
relit le fichier restauré et rejette un état altéré ; celui de passation recalcule
les références et garde l'accusé à faux. Ainsi, **19/19 types** ont une
démonstration C2/C3 sur leur tâche bornée.

Les rapports finaux sont conservés hors du dépôt dans
`%TEMP%\genos-workers-subgraph-final.json` et
`%TEMP%\genos-worker-missions-subgraph-final.json`. Le benchmark courant a fini à
**23/24 mesurés**, sans échec, digest
`sha256:fea3b108352f550ef728129fe2aa3a612e30047918c3dd2a3bcb9b9d928e8031` ;
seul `bounded-code` reste non mesuré. La campagne isolée a vérifié **19/19 missions**
avec ce même digest. Le profil
workers a passé **28 suites** et `npm test` ainsi que `cargo test --workspace`
ont terminé avec le code 0. La requalification a confirmé 0 nouvelle violation
sur 5 941 fichiers source (8 violations historiques dans le baseline). L'index
ADR a ensuite été réconcilié sans renommer de fichier : 553 fichiers, 553
entrées et 0 problème. Le benchmark
complet courant est conservé dans `%TEMP%\genos-workers-subgraph-final.json` ;
il confirme 23 réussites, 0 échec et `bounded-code` non mesuré. Le checkout était modifié (71 chemins)
sur le commit `9990b43601925b269c4d8b481bf3d5a90e00e80f` ; ces résultats restent
exploratoires et ne remplacent pas une campagne sur checkout propre.

Deux répétitions séquentielles supplémentaires des 19 scénarios ont également
passé : **57/57 missions au total sur trois campagnes**, même digest et aucun
échec. Les rapports sont sous `%TEMP%\genos-worker-missions-subgraph-final.json`,
`%TEMP%\genos-worker-missions-subgraph-c4-run-2.json` et
`%TEMP%\genos-worker-missions-subgraph-c4-run-3.json`. Cette stabilité sans charge
concurrente établit la répétabilité de ces missions sur Windows ; elle ne suffit
pas à qualifier C4, qui exige aussi des fautes injectées et d'autres environnements.

Les probes `npm --prefix backend run test:worker-credit` vérifient le service
loopback, les signatures, l'idempotence, la reprise après réponse perdue, le
redémarrage, la concurrence et la conservation du crédit. La dernière matrice
a couvert **38 exécutions, 19 types sur deux cycles**, avec conservation vraie ;
le worker cible sans preuve de récupération a été refusé comme attendu.

| Type de worker | Benchmark | Mission C2/C3 du 2026-10-11 |
|---|---|---|
| `scout_cell` | `passed`, recherche littérale | **Passé** : positions recalculées par deux stratégies natives indépendantes |
| `resident_daemon` | `passed`, seuil numérique | **Passé** : anomalies et rapport recalculés par deux stratégies natives indépendantes |
| `bounded_worker` | **Passé** pour `bounded-procedure` et `bounded-code` avec Ollama | **Passé** pour `scoped_procedure → subset_sum` et pour la mission Ollama `bounded-code` décrite ci-dessous |
| `adaptive_worker` | **Passé**, oracle LPT indépendant | **Passé** : essais LPT et reçu recalculés par deux stratégies |
| `specialist` | **Passé**, niche et procédure LPT ou subset_sum indépendants | **Passé** : niche contrôlée, sortie LPT ou subset_sum vérifiée et liée au reçu |
| `procedural_executor` | `passed`, LPT et `subset_sum` | **Passé** pour `subset_sum` direct |
| `symbiotic_worker` | **Passé**, hôte et subset_sum indépendants | **Passé** : capacité hôte, sortie subset_sum vérifiée et liée au reçu |
| `verifier_worker` | **Passé** : reçu de procédure et code borné sur 264 entrées | **Passé** : comparaison indépendante de `subset_sum` |
| `red_worker` | `passed`, contre-exemple | **Passé** : divergence et contre-exemple recalculés |
| `experimental_worker` | `passed`, mesure bornée | **Passé** : makespan LPT recalculé par deux stratégies |
| `formal_worker` | **Passé** : arithmétique exacte, `formal_proof` et `theorem_proving` avec Lean | **Passé** avec Lean 4.34.0 et deux recompilations natives |
| `synthesis_worker` | `passed`, désaccord structuré | **Passé** : regroupement et désaccords recalculés |
| `creative_worker` | **Passé**, énumération indépendante ; qualité non mesurée | **Passé** : combinaisons et sources recalculées ; originalité non mesurée |
| `medical_worker` | **Passé**, fixture éducative ; clinique non mesurée | **Passé** : considérations et références synthétiques recalculées |
| `recovery_worker` | **Passé**, contenu et digest relus après restauration | **Passé** : fichier restauré et reçu recalculés dans deux processus |
| `forensic_worker` | `passed`, liens déclarés | **Passé** : graphe déclaré recalculé par parcours indépendants |
| `liaison_worker` | **Passé**, groupes/références/absence d'accusé contrôlés | **Passé** : groupes, références et absence d'accusé recalculés |
| `teaching_worker` | `passed`, transfert `subset_sum` | **Passé** : démonstration et témoin apprenant recalculés |
| `sub_orchestrator` | `passed`, délégation multi-enfant et reçus vérifiés par deux oracles | **Passé** : deux enfants persistés, contrats, runs, artefacts et références recalculés par deux oracles distincts |

La matrice native de conformité a maintenant passé **19/19 missions C2/C3**,
dont `sub_orchestrator → coordinate_children` avec `bounded_worker` et
`scout_cell` comme enfants réels. Les oracles `delegation_manifest_map` et
`delegation_child_scan` ont accepté la même décision après vérification des
liaisons parent/enfant, contrats, runs terminaux, artefacts, références et reçu
du parent. Le provisionnement des capsules imbriquées a aussi été corrigé :
les enfants sont placés comme voisins dans la capsule racine, ce qui évite une
récursion de copie jusqu'à la limite de profondeur. La régression de cette
isolation passe seule.

Les cinq missions natives ajoutées ont aussi passé, chacune avec deux
processus indépendants. L'adaptation vérifie les makespans et le meilleur
résultat observé, sans conclure à l'optimalité globale. Le spécialiste et le
worker symbiotique vérifient la niche ou la capacité hôte, contrôlent
indépendamment la sortie subset_sum et la relient au reçu. Le cas créatif vérifie
l'énumération des options fournies, pas
l'originalité. Le cas médical vérifie la projection des considérations d'un cas
synthétique éducatif, sans validation clinique. Les tests unitaires rejettent
les altérations de résultat et de contrat correspondantes.

Les campagnes natives de cette section utilisent les méthodes déterministes et
ne dépendent pas d'Ollama. L'inventaire Ollama 0.40.2 répond et contient
`qwen2.5-coder:7b`, mais une génération directe testée hors sandbox échoue en
HTTP 500 : `llama-server binary not found`. Les capacités génératives restent
donc non qualifiées tant que cette installation locale n'est pas réparée. Lean
était disponible à
`C:\Users\Shadow\.elan\toolchains\leanprover--lean4---v4.34.0\bin\lean.exe`.
Le checkout étant modifié pendant la campagne, les manifestes portent
`qualificationClass: exploratory` : ces résultats ne constituent pas une
qualification officielle sur commit propre. La composante répétition de C4 a
passé 3 campagnes nominales séquentielles (57/57). Les suites workers injectent
annulation, délai dépassé, arrêt par garde et altérations d'oracles ; la suite
SIGKILL couvre la restauration d'organisme séparément. Une répétition des trois
missions sous la charge simultanée de `npm test` avait rendu
`ORACLE_BUDGET_EXPIRED` pour `bounded_worker`. Ce résultat sous concurrence a
motivé une campagne séquentielle avec fautes injectées, décrite plus bas. Linux
reste à qualifier : les
distributions WSL installées sont en version 1 et ne disposent ni de Node, ni
de Cargo, ni de Lean. Docker Desktop est présent,
mais son moteur Linux ne démarre pas et le client reçoit `permission denied` sur
`dockerDesktopLinuxEngine`; l’accès WSL échoue avec `Wsl/E_ACCESSDENIED`.

Le harnais `run_worker_qualification_campaign.cjs` conserve chaque sortie,
code de retour, résultat et manifeste dans le JSON demandé, puis renvoie 1
si un seul type manque la vérification. Exemple :

```powershell
$env:GENOS_LOCAL_MODEL = 'ollama://qwen2.5-coder:7b'
$env:GENOS_LEAN_EXECUTABLE = 'C:\Users\Shadow\.elan\toolchains\leanprover--lean4---v4.34.0\bin\lean.exe'
$env:GENOS_BENCHMARK_LEAN_VERSION = (& $env:GENOS_LEAN_EXECUTABLE --version).Trim()
node benchmarks/workers/campaign.cjs benchmarks/workers/genos-adapter.cjs genos "$env:TEMP/genos-workers.json"
node backend/tests/run_worker_qualification_campaign.cjs "$env:TEMP/genos-worker-missions.json"
```

## Portes de qualification restantes

1. **Rapport reproductible** : lier chaque campagne à un commit propre, aux
   versions Node, Rust, Lean et modèle, au digest des cas, à la configuration,
   aux sorties et aux codes de sortie. Un checkout modifié est exploratoire.
2. **Campagne de référence** : rejouer les 19 missions sur un commit propre,
   après le passage de la suite complète, pour produire un manifeste candidat
   reproductible.
3. **Benchmark** : connecter les cas encore `unmeasured` à des fixtures natives
   qualifiées, et ajouter un oracle indépendant pour `bounded-code`. Les scores
   C0/C1 restent distincts de la campagne de missions C2/C3.
4. **Collectif et perception** : exercer deux enfants réels, les huit
   topologies applicables, la barrière et deux changements externes par mode
   d'exécution. Un digest observé n'atteste pas la connaissance du contenu.
5. **Répétition** : qualifier la contention SQLite, le redémarrage, le gel et
   la reprise sur Windows et Linux, en conservant chaque résultat d'essai.

La campagne `run_worker_compliance_missions.cjs` refuse désormais tout type
requis indisponible et son résumé exige un lancement, un contrat, un parent,
un artefact et une provenance validés. Elle requiert une racine isolée hors
dépôt et un modèle local explicite pour les méthodes qui l'utilisent ; une
méthode native enregistrée peut s'exécuter sans modèle.
Elle n'est pas incluse dans la simple matrice native.

Le test d'intégration `test_worker_compliance_native_missions.js` lance dix-neuf
missions dans des bases SQLite et racines temporaires distinctes. Le cas
`bounded_worker` avec `scoped_procedure → subset_sum`, confirmé le 2026-10-11,
a atteint C2 et C3 : deux vérificateurs natifs indépendants ont accepté
le résultat, le run persistant est `completed`, et l'événement terminal,
l'artefact et la provenance sont liés à cette tentative. L'agent redevient
`idle` après la fermeture normale ; le statut du run et l'événement terminal
font foi.

Le 2026-10-11, `procedural_executor → subset_sum` a également atteint C2 et
C3 : le résultat du reçu natif de la tentative courante a été contrôlé par
les deux algorithmes indépendants de l'oracle, puis la décision persistée a
été promue. [L'ADR 0398](../adr/0398-oracle-subset-sum-procedural-direct.md)
borne ce nouveau domaine à cette méthode.

Les missions `scout_cell → scan_literal` et `resident_daemon → monitor_samples`
ont atteint C2/C3 le 2026-10-11. L'oracle d'observation exécute deux
stratégies dans des processus distincts : indexation et balayage caractère par
caractère pour le scout ; filtrage et comptage pour le daemon. L'assemblée AEIS
lie leurs reçus, workspaces et décisions à la tentative courante. Les domaines
FormalResult sont comparés après tri canonique des contraintes, et les reçus
portent les identités distinctes des processus exécutés. [L'ADR 0399](../adr/0399-oracles-observation-workers-bornes.md)
définit ces deux domaines.

Les missions `forensic_worker`, `experimental_worker`, `synthesis_worker`,
`verifier_worker`, `red_worker`, `teaching_worker`, `formal_worker`,
`recovery_worker` et `liaison_worker` ont atteint
C2/C3 dans le même test. Les deux oracles contrôlent les seules propriétés
calculables du contrat : liens déclarés, mesure LPT, regroupements de claims,
verdict/contre-exemple de procédure, témoin `subset_sum` et compilation Lean
du claim arithmétique scellé. Ces oracles ne
valident ni la vérité causale, ni l'optimalité du planning, ni la vérité des
claims, ni la qualité pédagogique générale. [L'ADR 0400](../adr/0400-oracles-workers-deterministes-structures.md)
décrit les cinq domaines structurés, [l'ADR 0401](../adr/0401-oracle-formel-lean-borné.md)
la preuve Lean bornée, et [l'ADR 0402](../adr/0402-oracles-workers-recuperation-et-passation.md)
les domaines de récupération et de passation.

Le cas formel est promu uniquement quand Lean est disponible et que sa version
exacte est liée à l'exécution. Sans Lean, le harnais conserve le refus
`ORACLE_DOMAIN_UNAVAILABLE`. Un essai antérieur
`procedural_executor → subset_sum` avait révélé `ORACLE_DOMAIN_UNAVAILABLE`
avant l'extension bornée de l'ADR 0398. Des erreurs de persistance ou de
fermeture asynchrone (`ENOENT`, `SQLITE_MISUSE`) ont été observées dans des
essais antérieurs ; elles n'ont pas fait échouer les derniers passages ciblés.

Le 2026-10-11, `test:workers` a passé ses 28 suites avec Lean 4.34.0, la
matrice native **19/19** et les dix-neuf missions C2/C3 promues. La campagne
isolée a aussi promu `formal_worker` et vérifié chaque décision par deux
processus d'oracle. Le test Trinity a passé séparément : trois workers terminés,
examen indépendant des claims, promotion GQWF, puis reprise idempotente après
redémarrage. L'auditeur natif LPT lie ses mesures au run courant ; les preuves
terminales d'un run antérieur ne suffisent plus.

Après configuration explicite de Lean 4.34.0, `npm test` a terminé avec le
code 0. Un passage antérieur de la même commande a échoué sur la première
compilation Lean d'une mission `formal_worker`; le test formel seul et les
treize missions isolées ont ensuite passé. Ce résultat contradictoire est
conservé comme signal de répétabilité à examiner, pas masqué. Le test
`test_native_memory_budget.js`, qui avait produit `SQLITE_BUSY` lors d'un
passage précédent, a passé isolément et dans le dernier `npm test` après que
le helper SQLite des tests a reçu un délai d'attente de 30 secondes par défaut.
`test_gqwf_trinity_mission_qualification.js` passe isolément dans son scénario
actuel de promotion et reprise. Les essais dans le sandbox Windows peuvent
échouer avec `EPERM` sur les répertoires temporaires ; les commandes de
qualification ont donc été exécutées hors sandbox.

La suite complète `npm test` a terminé avec le code 0 après les campagnes
workers, garage et P1 v3. `cargo test --workspace` a également terminé avec le
code 0 hors sandbox ; dans le sandbox, le test `accepts_simple_id` échouait
parce que Cargo ne pouvait pas canonicaliser le chemin Windows du dépôt, puis
il a passé isolément hors sandbox.

Le harnais `run_worker_qualification_campaign.cjs` produit un rapport isolé
vérifié **19/19** avec Lean 4.34.0. Il active les méthodes natives
recovery/handoff et transmet la version Lean à l'oracle formel. Le rapport
final est conservé sous `%TEMP%\genos-worker-missions-subgraph-final.json`.
Le checkout étant modifié, cette exécution reste exploratoire. La composante
répétition de C4 a passé trois campagnes nominales (57/57). Les suites workers
injectent annulation, délai dépassé, arrêt par garde et altérations d'oracles ;
la suite SIGKILL couvre la restauration d'organisme séparément. La campagne
multi-missions sous pannes a ensuite été passée sur Windows au commit propre
`ca7f5ca5`, voir le bilan plus bas. Linux reste à qualifier : le 2026-10-12,
WSL était en version 1 sans toolchain Linux et le moteur Linux de Docker Desktop
était inaccessible (`Wsl/E_ACCESSDENIED` / `permission denied`); aucun résultat
Linux n’est revendiqué.

Le 2026-10-12, `run_worker_gate_campaign.cjs` a réévalué les 19 missions
depuis SQLite, leur événement terminal, leur assemblée d'oracles persistée et
leurs reçus avec un registre de nonces partagé : **19/19 `verified`, tous par
`independent_quorum`**. Cette seconde couche a révélé puis corrigé l'adaptation
des sujets d'observation (`method`/`result`) dans le gate. Lean 4.34.0 a été
passé explicitement via `GENOS_LEAN_EXECUTABLE`, avec une fenêtre d'oracle de
420 secondes pour le profil formel. Le digest de la matrice est
`sha256:fea3b108352f550ef728129fe2aa3a612e30047918c3dd2a3bcb9b9d928e8031`.
Cette qualification demeure exploratoire sur checkout modifié ; le rapport
JSON de la campagne est conservé dans le workspace local sous
`.worker-gate-qualification-final.json`.

La régression de normalisation du sujet est intégrée à la suite `workers` via
`test_worker_mission_qualification_gate.js`.
Le 2026-10-12, Ollama local a été interrogé avec `qwen2.5-coder:32b`. La première
proposition de code a échoué au test allowlisté et le runtime a annulé ses
changements. Une tentative suivante a produit `((a % b) + b) % b`; les deux
stratégies du vérificateur indépendant l'ont acceptée sur les 264 entrées.
À ce stade, cette mission n'était pas qualifiée : l'émission de l'événement
terminal échouait avec `BIOLOGICAL_WORKER_RECEIPT_SEALED`, et aucun reçu
terminal avec les tests persistés n'était produit. La correction et la
qualification ultérieures du chemin sont consignées dans le bilan du
2026-10-12 ci-dessous. `bounded-code` était alors `unmeasured` dans le benchmark comparatif ; voir le
résultat ultérieur du 2026-10-12 ci-dessous.

Ces essais ont aussi révélé deux conditions du chemin local : le worker doit
recevoir le `modelBudgetScope` parent et son bail d'écriture doit être transmis
au contrat persisté. La génération d'une proposition utilise désormais
`cognitiveIntegration: worker` sans déclencher le graphe `worker/execute`, qui
n'avait pas de handler enregistré sur ce chemin. Les tests ciblés de preuve code,
reçu biologique et sécurité du worker passent; la cause du scellage terminal
reste à isoler avant de compter cette mission.

Après correction du lanceur de gate pour transmettre la version détectée de
Lean, la campagne du 2026-10-12 a vérifié **19/19** missions par
`independent_quorum`, avec Lean 4.34.0 explicite. Le rapport est
`.worker-gate-qualification-current.json`.

Le worker Ollama borné est maintenant qualifié dans ce même gate. Le run
`q-4c5fe7390089` a terminé `completed`; le gate a relu l'assemblée AEIS, la
décision attachée à l'événement terminal, les deux reçus indépendants et leurs
nonces depuis SQLite, puis a rendu `verified / independent_quorum`. La
proposition `((a % b) + b) % b` a réussi `npm test`; les stratégies
`code_remainder` et `code_quotient` ont chacune vérifié les 264 entrées du
contrat `euclidean_modulo_v1`. Le digest de l'artefact est
`864e97d870a87e630fe1924dcd1b419df7fb03bbc32e64cc7ddd87955eb018bb`.
Le modèle était `ollama://qwen2.5-coder:32b`. Le rapport de vérification de
mission est `.worker-code-qualification-current.json`.

Cette mission a conduit à deux corrections du chemin de preuve : produire et
persister le rapport code avant l'événement terminal afin que le quorum natif
puisse l'inspecter, puis omettre le verdict absent au lieu de sérialiser
`undefined`. Le gate de campagne accepte maintenant aussi ce chemin local
quand il trouve le run complété et la décision native correspondante. Les tests
du gate refusent toujours une assemblée altérée et une mission sans preuve.
Le contrôle de qualité indique 0 nouvelle violation sur 5 995 fichiers source.

La campagne comparative a aussi passé **24/24 cas**, sans échec, preuve
invérifiable ou cas non mesuré. `bounded-code` a utilisé Ollama; son oracle a
recalculé les postconditions, vérifié le reçu biologique et l'attestation du
quorum natif. Les 24 scores ont été recalculés depuis le rapport avec Lean
4.34.0 configuré et concordent. Le rapport est
`.worker-benchmark-qualification-current.json` (digest de jeu
`sha256:11be284a67148d705b0e096549420121d2035139b3f8397f3e78714b89a70a6d`).
La campagne complète valide 24/24 oracles, mais ne démontre pas la parité avec
un système rival. Les rapports
portent `qualificationClass: exploratory`, car le checkout était modifié. Le
gate complet a vérifié les 19 types; la campagne de qualification séparée a
aussi rendu **19/19**.
`npm test` a terminé avec le code 0 après exécution du test formel réel sous
Lean 4.34.0 explicite; `cargo test --workspace` a également terminé avec le
code 0 sur cet état.

Le 2026-10-12, `run_worker_fault_campaign.cjs` a exécuté les 19 types en
séquence, dans des racines et bases isolées, avec un registre de nonces partagé.
**19/19 scénarios sont conformes** : 17 missions gardent leur quorum indépendant,
la falsification de l'assemblée de `verifier_worker` est refusée
(`oracle_proof_invalid`) et le timeout borné de `recovery_worker` reste sans
preuve (`mission_evidence_missing`). Les missions suivantes se terminent après
ces fautes. La campagne constate 34 nonces acceptés uniques. Le rapport est
`.worker-fault-campaign-current.json`, SHA-256
`f53d7a97b23e94eb26334b097ece16c930a947cf4a15f669a36b84e46d194834`.
Le nouveau scénario est dans `test_worker_fault_campaign.js`; le profil workers
complet passe **32/32 suites** avec Lean 4.34.0 et Ollama configurés. Le contrôle
de qualité trouve 0 nouvelle violation sur 5 997 fichiers source.

Ces rapports de campagne initiaux sont exploratoires car ils provenaient d'un
checkout modifié. Une requalification complète sur le commit propre `ca7f5ca5`
a été exécutée le 2026-10-12 : le worktree est resté propre, `npm test`,
`cargo test --workspace` et le profil workers ont terminé avec le code 0 ; ce
profil comprend 32 suites. Le gate normal a rendu **19/19 `verified`** par
`independent_quorum`. Le benchmark a rendu **24/24 `passed`**, et le recalcul
des scores a trouvé 24/24 correspondances. Trois campagnes C4 faultées ont rendu
**57/57 scénarios conformes** : 51 missions ont gardé leur quorum, trois
assemblées altérées ont été refusées et trois timeouts sont restés sans preuve.
Chaque campagne a compté 34 nonces acceptés uniques. Le contrôle qualité a trouvé 0
nouvelle violation sur 5 997 fichiers source.

Les rapports propres sont conservés dans le workspace local :
`.worker-gate-clean-qualification-current.json` (SHA-256
`53654958b5ec115d7273fe35c6f7e6462a1b97fb44f15e6ebd761144c3214826`),
`.worker-fault-campaign-clean-current.json` (SHA-256
`edb5fcc84af11ee5ef043d5cbbb00d3709311d3d15585625a7bd8552f513f03c`),
`.worker-fault-campaign-clean-run-2.json` (SHA-256
`ea169fe7e0b133bdada76037fe8b90a64c5e404314c3248ae3440af6bfd60a40`) et
`.worker-fault-campaign-clean-run-3.json` (SHA-256
`0a5c3c409ca0f38cd462a6016cd69c6e90b6f3eb26f76810d4f5b93c388cb1fc`), ainsi que
`.worker-benchmark-clean-qualification-current.json` (SHA-256
`70b018352430c66d06229b1036110c0b7b9f9e914819552c65ced40bdb5c1d57`).
Le benchmark garde le digest de jeu
`sha256:11be284a67148d705b0e096549420121d2035139b3f8397f3e78714b89a70a6d`.
Les réexécutions faultées ont été faites sur le commit documentaire `e8b4e12e`,
qui ne modifie que ce bilan par rapport au code qualifié de `ca7f5ca5`.
La campagne comparative ne démontre pas la parité avec un rival et la campagne
faultée ne garantit pas les comportements hors des 19 scénarios exécutés.

La commande complète `npm test` a terminé avec le code 0. Elle a journalisé
trois erreurs `ENAMETOOLONG` sur les snapshots du scénario GQWF à cause du
chemin long du worktree ; ce scénario a été relancé isolément via un lecteur
temporaire court et a passé sans cette erreur. Ces contrôles établissent la
qualification mesurée sur Windows, pas une garantie statistique ni une
qualification Linux.

## Requalification Windows du 2026-10-14

Le commit `2e0df82f6c63631a0904b5fe3cc9769571f0d25d` ajoute un correctif de
fixture : la vérification de la racine hors dépôt utilise maintenant un
répertoire temporaire dédié, indépendant de la racine du lecteur. Cela permet
au manifeste de rester testable depuis un lecteur monté. Le contrôle de qualité
trouve **0 nouvelle violation sur 6 018 fichiers source** (8 violations du
baseline).

Avec Ollama `qwen2.5-coder:32b` et Lean 4.34.0, `npm --prefix backend run
test:workers` passe **32/32 suites** (142,6 s). La matrice exécute les 19 types,
valide leurs artefacts typés, contrats, autorisations, budgets et cycles de vie ;
le gate de mission accepte les preuves `independent_quorum` et vérifie le run,
l'événement terminal et les reçus. Les deux chemins formels Lean recompilent
leurs propositions dans deux processus d'oracle indépendants. Les tests
multi-pannes refusent les assemblées altérées et les timeouts sans preuve, puis
continuent la campagne. La variante de benchmark compare aussi chaque cas avec
son entrée altérée et attend le refus.

`npm test` passe (code 0), y compris le profil workers, les suites P1, Garage,
biologie et backend. `cargo test --workspace` passe aussi (code 0) quand il est
exécuté avec les droits nécessaires à la résolution du répertoire temporaire
Windows. L'exécution dans le bac à sable échouait seulement sur
`accepts_simple_id`, car le répertoire `TEMP` isolé ne pouvait pas être
canonisé ; la relance hors de cette isolation a passé l'ensemble des tests Rust.

La campagne comparative complète du 2026-10-14 rend **24/24 `passed`**, dont
`bounded-code` avec Ollama et les deux cas Lean. Le recalcul indépendant des
scores, avec le même binaire Lean, retrouve **24/24** scores sans divergence.
Digest du jeu :
`sha256:11be284a67148d705b0e096549420121d2035139b3f8397f3e78714b89a70a6d`.
Rapport `.worker-benchmark-p2-current.json`, SHA-256
`ed4cc5ebd754a35cd50b00dcdae562bb0b833d58d30508e2bfc72112de84665`.

Trois campagnes faultées complètes ont chacune rendu **19/19 conformes** et
34 nonces acceptés uniques : 17 missions ont conservé leur quorum indépendant,
la preuve altérée de `verifier_worker` a été refusée
(`oracle_proof_invalid`) et `recovery_worker` a expiré sans preuve
(`mission_evidence_missing`). Soit **51/51 missions nominales conformes** et
les six refus attendus sur les trois répétitions. Les rapports sont
`.worker-fault-p2-current.json` (SHA-256
`8d2da24df7922d4ba96aae2bde9713997951814c6b052e67e91e60b4d017733c`),
`.worker-fault-p2-run-2-current.json` (SHA-256
`527f0d63f8adb80e93a00466b6944d086fb1c69538ea9ec308d5cb2631a1a8db`) et
`.worker-fault-p2-run-3-current.json` (SHA-256
`4f1b5c03e7c225c721ed6191308f9d0e32d56a22b19c3728bdd9924815b39dc6`).

Le manifeste des trois rapports faultés identifie le commit `2e0df82f`, mais
classe la qualification `exploratory` car des rapports générés et d'autres
fichiers locaux non suivis sont présents dans le checkout. Les résultats
établissent le comportement observé sous Windows et les scénarios mesurés ; ils
ne démontrent ni la parité avec un système rival, ni le comportement Linux, ni
une garantie hors de ces cas.

## Commandes et limites du verdict

```powershell
node backend/tests/workerQualificationInventory.cjs
node backend/tests/test_worker_compliance_native_missions.js
node backend/tests/run_worker_fault_campaign.cjs "$env:TEMP/genos-worker-fault-campaign.json"
npm --prefix backend run test:workers
npm --prefix backend run test:worker-credit
npm run test:garage
python scripts/ci/check_code_quality.py
npm test
cargo test --workspace
```

Un passage de ces commandes ne remplace pas les missions C2, les oracles C3
ou les répétitions C4. Le résultat publié doit conserver les sorties exactes,
leurs codes de sortie et les échecs. Voir aussi
[l'exécution native](../03-reference/execution-native-workers.md),
[les types](../03-reference/types-de-workers.md) et
[la campagne comparative](../../benchmarks/workers/README.md).
