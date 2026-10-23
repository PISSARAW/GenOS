# SH-001 — expérience Qwen réelle (2026-10-22)

## Question et protocole

Dans un clone jetable du dépôt SH-001, Qwen reçoit une mission de réparation après redémarrage. La lésion est dans `src/delivery.js` : les messages au-delà du checkpoint acquitté sont incorrectement filtrés si `attempts > 0`. Le modèle ne reçoit pas l’emplacement ni la correction attendue. Le contrôle public est `node checks/verify.js`; l’oracle indépendant, gardé hors des espaces de travail des agents, couvre tentatives antérieures, frontière d’acquittement, ordre et intégrité des payloads.

Les runs et bases sont isolés sous `D:\GenOS\runs\sh001-qwen-20261022`. Aucun secret ni base n’est inclus dans les commits. Les espaces de travail des échecs sont conservés sur D avec leur historique Git.

## Résultats

| Run | Modèle / voie | Résultat expérimental | Verdict |
| --- | --- | --- | --- |
| 01–05 | essais de lancement A-Team/Rhizome | Morphogenèse non activée, mauvais passage PowerShell, dépendances du worker absentes, puis récupération de worker invalide | Échecs de lancement conservés dans les DB isolées |
| 06 | Qwen Coder 7B, worker direct | Inférence réelle (64 s, 1 211 tokens), commande proposée hors allowlist | Échec maîtrisé; aucun correctif |
| 07 | Qwen Coder 7B, worker direct | Refus de la commande car l’allowlist ne correspondait pas à la commande complète | Échec de configuration |
| 08 | Qwen Coder 7B, worker direct | A créé `src/message-delivery.ts`; le test public ne chargeait pas ce fichier; oracle indépendant en échec | Faux succès détecté; commit `539cedb` |
| 09 | Qwen Coder 7B, sans chemin imposé | A créé `src/node-delivery.js`; le test public passait, l’oracle échouait | Faux succès détecté; commit `445bc9b` |
| 10 | Qwen Coder 7B, contexte source récursif | A laissé la logique défectueuse intacte (changement de nouvelle ligne uniquement); public vert, oracle rouge | Faux succès détecté; commit `c23b8f4` |
| 11 | Qwen 2.5 14B, worker local GenOS | A modifié la fonction existante dans `src/delivery.js`; public et oracle indépendant passent | Réparation candidate réussie; commit `583bd1d` |
| 12 | Qwen 2.5 14B, réplication aveugle dans un clone frais | A modifié uniquement `src/delivery.js`; public et oracle indépendant passent | Deuxième réparation candidate réussie; commit `7d16588` |

Les runs 01–05 et les erreurs intermédiaires (SQLite, configuration admin locale, SDK MCP, readiness A-Team, signature du ledger, activation de topologie et dépendances) sont consignés dans les bases et journaux isolés sous `D:\GenOS\runs\sh001-qwen-20261022`. Ils ne sont pas présentés comme des réparations.

## Contre-vérification du candidat 14B

Dans `workspace-qwen-blind-11`, commande exécutée :

```text
node checks/verify.js
node D:\GenOS\runs\sh001-qwen-20261022\oracle\verify.js .\src\delivery.js
```

Résultats : `public checks passed: fresh delivery ordering and checkpoint filtering` et `independent oracle passed: restart replay, acknowledgement boundary, payload integrity, and order`.

L’inférence Qwen 14B du run 11 est tracée par GenOS : 70 831 ms, 1 173 tokens en entrée, 124 en sortie, modification de `src/delivery.js`, contrôle public exit 0. L’oracle caché a ensuite été exécuté séparément sur le même candidat et a réussi.

La réplication du run 12 est indépendante, repart du commit sain `1ea8553` dans `workspace-qwen-blind-12`, et n’indique toujours pas au modèle le chemin du fichier. Qwen 14B a inféré en 3 654 ms (1 177 tokens en entrée, 115 en sortie), a changé le checkpoint pour traiter aussi une valeur absente et a retiré le filtre `attempts === 0`. Les commandes publiques et l’oracle indépendant passent; le patch est commité sur D: (`7d16588`). Le verdict d’orchestration reste `required_coverage_incomplete` pour les six phases GenOS manquantes, donc ces deux réparations ne prouvent pas encore le parcours complet du runner.

## Limite de la démonstration

Le worker local a produit une réparation correcte, mais le verdict final du runner GenOS est `success:false`, `verdict:required_coverage_incomplete` : la voie locale directe n’a pas enregistré les phases requises `genos_diagnose`, `genos_snapshot`, `genos_hypothesis_evidence`, `genos_evaluate_trajectories`, `genos_replay` et `genos_record_decision`. Le succès du code et celui de l’oracle ne transforment pas ce verdict orchestration en succès. La preuve établit donc une réparation assistée par GenOS/Qwen 14B dans le clone SH-001, pas l’auto-guérison complète de GenOS.

## Corrections apportées à GenOS pour les prochains essais

- La voie d’exécution locale Windows transmet maintenant le contrat de chemins et marqueurs de patch exigés au worker.
- Le worker local reçoit désormais un inventaire récursif, borné et déterministe des fichiers source du workspace (en excluant liens symboliques et répertoires ignorés usuels), au lieu des seules entrées de premier niveau.
- Le rejet d’un artefact par le rédacteur local n’est plus silencieusement ignoré.
- Tests ciblés réussis : `backend/tests/test_windows_local_worker_load.js`, `backend/tests/test_local_code_worker.js`, `backend/tests/test_local_worker_file_capabilities.js`. Qualité : `python scripts/ci/check_code_quality.py`, 7 293 fichiers, zéro violation nouvelle.

Ces corrections améliorent la qualité des prochains essais, mais ne résolvent pas encore la lacune de couverture du runner direct.

## Expériences de récupération supplémentaires (suite du 22 octobre)

Les six commandes du brief ont été exécutées depuis le dépôt backend et ont réussi :

- `test_shev_healing_contract.js` — phases durables, preuves et verrouillage terminal.
- `test_shev_healing_integration.js` — tick, ontogenèse, effet et fenêtre longitudinale.
- `test_physiological_arc_closed_loop.js` — connexions de la boucle physiologique.
- `test_sre_healing_policy.js` — 10/10 cas, dont abstention, disjoncteur, effet indépendant et rollback demandé.
- `test_sre_healing_store.js` — 3/3 cas de persistance et transitions immuables.
- `test_security_qualification_lab.js` — PASS.

Ces scripts restent des tests logiciels; leurs fixtures ne constituent pas une campagne de terrain ou un actionneur Hyper-V réel. En particulier, le laboratoire de sécurité manipule l’état de VM simulé décrit par le brief.

Une injection de panne de processus distincte a aussi réussi : `node backend/tests/search/test_natural_search_crash.js` force la sortie du processus enfant avec le code 17, rouvre la base et prouve que le checkpoint faisant autorité restaure une projection partielle, tout en refusant un écrivain périmé. Ce résultat qualifie une récupération après arrêt de processus pour le sous-système Natural Search; il ne prouve pas la reprise d’une mission worker complète.

Une campagne worker réelle, en processus enfants et bases jetables, a fourni deux bras comparables. Le bras témoin `D:\GenOS\runs\sh001-qwen-20261022\worker-fault-control-20261022.json` qualifie `verifier_worker` et `recovery_worker` tous deux `verified` (`independent_quorum`, exit 0; runs `q-7a754f2a7974` et `q-d94fa524b995`). Le bras d’injection `D:\GenOS\runs\sh001-qwen-20261022\worker-fault-campaign-20261022.json` altère la preuve du premier et force le timeout du second. Il obtient `oracle_proof_invalid` et `mission_evidence_missing` avec `conforms:true` pour les deux runs (`q-7dc1cc3992d8`, `q-37e06246939e`). Ce sont des réussites du contrôle de faute : aucune mission n’est qualifiée comme guérie à partir d’une preuve altérée ou absente. Les workers de cette campagne utilisent des politiques déterministes d’essai; cette expérience n’utilise pas Qwen.

Enfin, le premier lancement réel du drill chaos avait révélé `SQLITE_ERROR: no such table: detached_processes` sur une base fraîche. Le chemin de refus des PID non gérés supposait une table créée uniquement à la demande par un autre outil. Le test utilisait auparavant un worker factice, donc n’exerçait jamais l’actionneur OS. Le test utilise maintenant un processus Node jetable réel et attend son événement `exit`; le schéma de démarrage crée désormais la table canonique. Avec une base temporaire fraîche, le drill a terminé le PID enfant réel (SIGTERM), a rapporté honnêtement l’absence de processus vivant, résolu le PID persisté en mode dry-run et refusé les PID arbitraires. Ce drill vérifie la terminaison contrôlée et les refus; le « Regeneration Steward » reste seulement annoncé comme activé par ce chemin, et la préservation/reprise effective de la mission n’est pas encore prouvée par ce test.

L’audit global `test_schema_drift.js` n’a pas pu servir d’oracle : lancé directement, il échouait d’abord avant assertions (`test is not defined`; `expect` global absent). Une adaptation temporaire au runner Node a ensuite révélé une divergence préexistante importante de son catalogue : plusieurs centaines de tables générées sont classées « orphelines » et 16 entrées déclarées canoniques sont absentes. Cette adaptation a été retirée; la correction `detached_processes` est vérifiée directement par le drill chaos sur une base fraîche. Le catalogue global reste à réparer avant de réutiliser ce test comme preuve.

Deux contrôles de basculement Rhizome passent (`test_rhizome_runtime_recovery.js`, `test_rhizome_repair.js`) : le reçu d’échec exclut les arêtes de la première route, puis le second trajet reçoit un reçu signé de succès; une échéance expirée reste non vérifiée. Ces exécutants et reçus sont des fixtures, pas des nœuds réseau réellement déconnectés. Les vérifications Natural Search `test_natural_search_module_restore.js` (restauration SQLite des sept modules) et `test_natural_search_integrity.js` (corruption, provenance et culture durable) passent également. Ce sont des altérations de données locales en fixture; le crash forcé documenté plus haut est l’essai qui a effectivement arrêté et redémarré un processus.

## Couverture des huit expériences proposées

| Test | État actuel | Limite restante |
| --- | --- | --- |
| T01 — arrêt worker | Arrêt réel d’un processus jetable par chaos; crash/reprise Natural Search; tests de reconnexion de processus réels passent | Pas encore de démonstration unique de reprise d’une mission worker après son kill et sans mock de dispatch |
| T02 — mémoire | Projection partielle restaurée depuis checkpoint après crash; restauration des sept modules et cas de corruption passent | Cas applicatif local, pas une corruption mémoire persistante injectée dans un GenOS déployé |
| T03 — réseau | Rhizome exclut le chemin échoué et vérifie une route alternative | Les callbacks de transport et vérificateurs sont des fixtures; aucun lien réseau réel n’a été coupé |
| T04 — organe indisponible | Redispatch logique vérifie checkpoint et identité/remplacement; les tests de supervision de processus passent | Le test de redispatch remplace `startMission`; pas de mission complète terminée par un remplaçant réel |
| T05 — immunité | Laboratoire de qualification et contrôles de sécurité passent | Actionneur JSON de VM simulée; pas d’outil malveillant réel exécuté dans une VM isolée |
| T06 — cicatrisation | SH-001 : Qwen 14B répare le défaut caché; public et oracle indépendant passent | Verdict global du runner direct reste `required_coverage_incomplete`; résultat limité à ce bug/famille |
| T07 — régénération | Aucun essai de suppression puis reconstruction d’un sous-orchestrateur avec mission réellement reprise | À lancer |
| T08 — adaptation | Aucun essai réservé comparant performance avec et sans mémoire d’expériences | À lancer; requiert protocole et cas inédits gelés avant exécution |

Ainsi, les preuves actuelles couvrent des récupérations locales et une réparation SH-001 observée; les T01, T03, T04 et T05 demeurent partiellement simulés, T07/T08 ne sont pas exécutés, et aucun résultat ne qualifie une campagne longitudinale de 72 h.

## Relance Qwen 14B et fermeture de couverture (22 octobre 2026)

Le runner Windows a été modifié pour enregistrer les primitives GenOS réellement exécutées avant et après le worker. Un test MCP stdio intégral sur une base temporaire confirme les reçus durables de `genos_search_failures`, `genos_diagnose`, `genos_snapshot`, `genos_hypothesis_evidence`, `genos_evaluate_trajectories`, `genos_replay` et `genos_record_decision`. Le verdict de couverture est `required-coverage-complete`; le test MCP utilise un worker fixture et ne prétend pas prouver une réparation Qwen.

Les tentatives Qwen supplémentaires sont conservées séparément sous `D:\GenOS\runs\sh001-qwen-20261022` :

- Run 13b : le runner utilise par défaut `localhost:11434`; l’inférence a fini par échouer par `fetch failed` après environ 309 s. Le test local GET des tags répondait, mais cela ne prouvait pas le chemin POST du runner.
- Diagnostic réseau : une requête courte sur l’API compatible OpenAI à `http://127.0.0.1:11434/v1/chat/completions` a renvoyé `QWEN-READY` avec `qwen2.5:14b`. Cet endpoint IPv4 a été fourni explicitement à l’essai suivant.
- Run 13c : Qwen a répondu en 26 070 ms, mais son candidat échouait à `node checks/verify.js` avec `SyntaxError: Unexpected identifier 'strict'` à la première ligne de `src/delivery.js`. Le runner a annulé le patch; le modèle n’a consommé que 1 322 tokens et aucun changement n’a été promu.
- Préparation 13d : une première commande de relance a utilisé la mauvaise propriété JSON et a été interrompue; elle n’a pas lancé le worker. La correction a ensuite rencontré l’identité mission déjà consommée dans la base isolée, d’où un refus `Mission succession requires the current orchestrator`. Ces erreurs de harnais sont conservées dans les sorties locales.
- Run 13e : base neuve, workspace 13d reparti du commit scellé `1ea8553`, endpoint IPv4 et instruction explicite de préserver la directive `'use strict';`. Qwen 14B a répondu en 139 024 ms (1 177 tokens en entrée, 145 en sortie), a retiré le filtre fautif `message.attempts === 0` et le contrôle public a réussi. L’oracle indépendant a ensuite réussi séparément : `restart replay, acknowledgement boundary, payload integrity, and order`. Le patch est commité dans le clone D : `630b58c` (`[SH-001] Accept Qwen restart recovery fix`).

Le verdict de l’orchestrateur 13e demeure `success:false`, `verdict:homeostasis_continuation`: le worker de continuation n’a pas pu démarrer (`startFailed:true`, invariant `tests_pass` non satisfait), alors que le rapport du worker initial et les deux commandes indépendantes démontrent que le candidat satisfait le test public et l’oracle caché. Les sept reçus d’outils sont néanmoins présents. Ainsi, la réparation du bug est démontrée indépendamment, et la couverture MCP est complète, mais le verdict de mission de bout en bout reste explicitement non réussi tant que le chemin de continuation homeostasis n’est pas réparé.

Le test direct Qwen a isolé le routage `localhost` comme cause probable du `fetch failed`; l’endpoint IPv4 a permis l’inférence. Il n’est pas encore établi si `localhost` échouait par résolution IPv6, par arrêt du modèle ou par une autre condition transitoire. Le run 13c a aussi révélé que le garde-fou rollback fonctionne sur une proposition syntaxiquement invalide.

## Relance SH-001 après correction du cycle de continuation (23 octobre 2026)

Une nouvelle campagne a été exécutée dans `D:\GenOS\runs\sh001-homeostasis-continuation-20261023`, avec une base SQLite et un workspace jetables. Le workspace est reparti du commit scellé `1ea8553`. Avant l’inférence, `node checks/verify.js` passait alors que l’oracle indépendant échouait sur la conservation des messages non acquittés déjà tentés. L’oracle est resté hors du workspace de l’agent.

- Mission `sh001-finalize-terminal-20261023`, orchestrateur `mcp_orchestrator_7c4f75b2-81ca-4f41-8ad8-65629aad4063`, modèle local `qwen2.5:14b` via Ollama sur `127.0.0.1`.
- Qwen a modifié uniquement `src/delivery.js`, en retirant le filtre `message.attempts === 0` tout en conservant la frontière du checkpoint acquitté.
- Après la fin du processus GenOS, le contrôle public et l’oracle indépendant ont été relancés dans le workspace. Ils passent tous deux. SHA-256 du fichier final : `4c25ec376258846266ea6cd11d0f5438d2a4b6f5f96962aa8490493c637958be`.
- Verdict GenOS : `success:true`, `completed`, gate homeostatique autorisé. Les sept outils requis ont des reçus persistés (`genos_search_failures`, `genos_diagnose`, `genos_snapshot`, `genos_hypothesis_evidence`, `genos_evaluate_trajectories`, `genos_replay`, `genos_record_decision`). L’enregistrement de l’orchestrateur est terminal (`completed`) après la clôture.
- Le reçu de décision est non promoteur : le patch reste dans le workspace expérimental; il n’a été ni fusionné ni promu dans le dépôt SH-001.

Cette campagne ferme le jalon SH-001 pour ce défaut : réparation Qwen réelle, oracle caché indépendant, verdict de mission complet et persistance vérifiée après l’arrêt du runner. La première tentative ayant satisfait le gate, le dispatch d’un worker de continuation n’a pas été nécessaire dans cette campagne. Le rôle de continuation `bounded_worker`, la projection d’un succès local différé dans le calcul de l’issue, la normalisation des événements de postflight différés et la clôture du statut de l’orchestrateur sont couverts par des tests ciblés; un démarrage réel de worker de continuation après échec reste à qualifier séparément. Cette preuve reste limitée à cette lésion et ne qualifie pas les campagnes longitudinales de 72 heures ni les autres familles de défauts.
