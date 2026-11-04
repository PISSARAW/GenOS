# Expiration d’autorité dans la qualification de coopération

- **Statut** : Implémenté — qualification npm réussie sur les sources figées ; suite Rust encore en échec.
- **Portée** : budgets de qualification, échéances signées, admissions cliniques et preuves natives.
- **Dernière revue** : 2026-11-04.

## Reproduction et cause

Le 4 novembre 2026, une sonde de la qualification native de coopération reproduit
`EXECUTION_AUTHORITY_EXPIRED`. Elle conserve les appels au véritable garde, les
identifiants de runs, les échéances et les budgets, sans modifier ses résultats.

Le contrôleur `strategy_run_1793787553223_20f4240a` reçoit 60 000 ms pour
coordonner le scénario. Le premier worker
`strategy_run_1793787567856_7233e7bc` reçoit également 60 000 ms ; son enveloppe
est émise à 10:19:49.451 UTC et expire à 10:20:46.451 UTC. Le refus observé à
10:20:48.670 UTC respecte donc l’échéance. La réserve ALLOSTASIS de 5 % explique
les 57 secondes de sa fenêtre d’autorité.

Le profil de test utilisait la même minute pour une étape et pour une chaîne de
quatre étapes, alors que chaque étape initialise les protocoles, exécute sa
méthode, produit deux vérifications natives et publie ses preuves. Son plafond
global de 180 secondes ne couvrait pas les huit étapes séquentielles déclarées.

## Correction bornée avant admission

`workerCooperationBudgets.cjs` définit le profil de cette qualification :

- 180 000 ms par worker ; les limites de jetons et d’événements restent bornées ;
- 30 000 ms de préparation du contrôleur, puis 30 000 ms de préparation et
  180 000 ms d’exécution par étape ;
- respectivement 240 000, 660 000 et 870 000 ms pour les scénarios de une, trois
  et quatre étapes, soit un plafond global de 1 770 000 ms ;
- huit workers, zéro jeton de modèle et seize processus d’oracle au maximum.

Ces budgets sont fournis à la création des runs et scellés avant exécution.
Les enveloppes ne sont ni renouvelées ni réécrites. La réserve ALLOSTASIS reste
appliquée. Ce profil est limité à la qualification ; les vérifications
d’expiration, de révocation et de preuve restent exécutées.
Le hash de l’enveloppe du contrôleur est revérifié en fin de scénario.

Le rapport conserve pour chaque worker l’émission, l’expiration et la fin
persistée. Le test exige une fin antérieure à l’expiration, une autorité du
contrôleur encore valide et des budgets cohérents avec le nombre réel d’étapes.
Les refus de promotion implicite, d’outil non autorisé et de reprise sans bail
restent exercés par les scénarios existants.

## Preuves

Le dossier d’exécution est `D:\GenOS-runs\authority-expiry-repair-20261104` :

- `baseline-events.json`, `baseline-runs.json`, `baseline.log` et
  `baseline.exit.txt` : reproduction avant correction, code 1 ;
- `before-files.json` et `before/` : état initial des fichiers concernés ;
- `scoped-source-manifest.json` : empreintes des 31 fichiers du correctif, comparaison
  avec la copie figée testée et observation initiale des gardes ;
- `authority-guards.log` et son code de sortie : test réel des enveloppes,
  incluant le refus à l’échéance exacte et la révocation ;
- les journaux de coopération, de npm et de Cargo conservent aussi les tentatives
  infructueuses. Les codes définitifs sont ajoutés après leur exécution.

La première nouvelle assertion de date ajoutait à tort un second suffixe `Z`
à une date déjà ISO. Ce défaut de sonde a été corrigé avant la seconde tentative ;
sa tentative échouée reste dans `cooperation-fixed-attempt1.log`.

## Résultats ciblés

La première qualification corrigée termine avec le code 0. Elle exécute huit
workers et seize processus d’oracle en 403 279 ms, sans jeton de modèle.
`cooperation-report-before-deadline.json` conserve les huit runs, leurs hashes d’autorité, leurs
dates de fin et les trois contrôles d’autorité des contrôleurs.

| Scénario | Étapes | Budget du contrôleur | Contrôle final UTC | Expiration UTC |
| --- | ---: | ---: | --- | --- |
| Sain | 1 | 240 000 ms | 10:27:21.895 | 10:30:35.484 |
| Réparation | 3 | 660 000 ms | 10:30:03.018 | 10:38:23.281 |
| Récupération | 4 | 870 000 ms | 10:33:17.745 | 10:44:34.301 |

Les huit workers terminent avant leurs propres expirations. Le test réel
`test_mission_authority_envelope.js` et le contrôle de qualité terminent aussi
avec le code 0.

La première relance npm complète s’exécute de 10:33:29 à 10:35:29 UTC et termine
avec le code 1, à cause de `test_hachimoji_catalog.cjs` : l’empreinte des sources
ne correspond plus au reçu qualifié. La requalification officielle utilise
`migrate-agent-dna-hachimoji.cjs renew` et ses six programmes de preuve ; aucun
hash attendu n’est remplacé manuellement.

La requalification termine avec le code 0 : 234 génomes et six programmes de
preuve, puis une seconde vérification complète avant installation. Son reçu
est `06ad7165e79c29b48894c374c8947ea8416d1952217f437f6934ddb3ae817415`.
Le dossier `catalog-proof/` contient les journaux, le plan, le reçu antérieur et
le reçu qualifié ; `catalog-renewal-observation.json` constate son installation.

## Admission clinique et réservation directe

La seconde suite npm franchit la biologie (11/11), puis refuse le démarrage
direct avec `WORKER_CLINICAL_ADMISSION_CONFLICT`. Une observation sans changement
du garde confirme un worker `running`, sans PID ni admission clinique préalable.
La réservation anticipée de la CLI avait changé son statut avant le bootstrap.

La CLI effectue maintenant un contrôle de capacité sans réservation anticipée.
L’adoption du runtime existant réserve le slot atomiquement après l’admission,
puis lie le bail au run. Le caller ne libère plus un slot qu’il n’a pas réservé.
Les gardes cliniques, de capacité et de concurrence restent exécutés ; aucun
statut temporaire `idle` n’est forcé pour franchir l’admission.

`test_direct_worker_control_run.cjs` vérifie le bail durable et son run réel,
ainsi que la preuve indépendante et le refus d’un parent étranger. Il termine
avec le code 0, comme `test_garage_runtime_store.js`, qui exerce notamment la
capacité atomique entre deux connexions. Les observations et journaux sont
`clinical-observations.jsonl`, `direct-worker-baseline.log`,
`direct-worker-fixed.log` et `garage-capacity.log`.

## Échéances cliniques et natives

La troisième suite révèle ensuite une admission clinique expirée : son horloge
commençait avant le bootstrap, celle de l’autorité après. Le runtime plafonne
maintenant l’enveloppe signée et ALLOSTASIS par le `validUntil` clinique original.
L’exécution native prend aussi le minimum entre sa durée relative et l’échéance
absolue de la mission. Une échéance invalide ou déjà expirée reste refusée.
Aucun renouvellement d’autorité ni d’admission n’est ajouté.

Les tests `clinical-deadline`, `native-deadline`, `local-worker-profile` et
`authority-guards-final` terminent avec le code 0. Ils couvrent notamment une
admission plus courte que la durée demandée, l’expiration exacte, la révocation
et le refus de déclarer une réussite sans preuve indépendante. Le profil du
worker local déclare son budget de 300 secondes avant admission ; la réserve
ALLOSTASIS de 5 % reste vérifiée.

La qualification finale de coopération (`cooperation-report.json`) termine en
194 955 ms : huit workers, seize processus d’oracle, zéro jeton de modèle. Chaque
fin est antérieure à son expiration, chaque enveloppe reste bornée par l’admission
clinique et le hash signé du contrôleur est identique au contrôle final.

La troisième suite npm complète réexécute ces trois scénarios avec succès en
66 398 ms : huit workers, seize oracles, zéro jeton de modèle et une concurrence
maximale de un worker. Les régressions de cause terminale, d’arithmétique
indépendante et de comptabilisation de toutes les tentatives passent aussi.

## Mesure Lean dans la limite existante

La suite des workers révèle ensuite un dépassement de la limite Lean de 90 secondes.
La mesure séquentielle de l’environnement ne pouvait pas interrompre une lecture
de fichier en cours. La reproduction réelle dure 135 038 ms et reste inconclusive
(`lean-baseline-result.json`).

Le correctif mesure les mêmes fichiers, dans le même ordre canonique, par groupes
de quatre lectures au maximum. Chaque lecture reçoit l’échéance absolue existante
et peut être annulée. Toutes les lectures du groupe sont terminées ou annulées
avant de propager un échec. Aucun fichier n’est omis, aucun cache ajouté et la
limite de 90 secondes reste identique.

`lean-deadline-guards.log` vérifie l’ordre, les doublons, l’effet d’une modification,
le refus d’un module absent et l’absence de lecture après échéance. L’exécution
Lean réelle corrigée termine en environ 48 secondes avec 1 952 entrées de manifeste,
le noyau et l’audit des axiomes vérifiés (`lean-fixed-result.json`). Le worker
formel complet termine avec le code 0 : certificat validé et deux processus
d’oracle indépendants acceptés (`formal-compliance-result.json` et
`formal-compliance-proof/worker-compliance-report.json`).

La troisième suite npm qualifie ensuite 19 types de workers avec 38 processus
d’oracle indépendants. Le worker formel y termine également avec un certificat
accepté. `npm-native-worker-oracles-attempt3.json` extrait les runs, décisions et hashes
du véritable journal global ; chaque mission exige deux oracles et un artefact
validé.

## Validation complète reproductible

Plusieurs autres chats modifient simultanément le checkout. La validation globale
utilise donc une copie figée, avec manifeste des sources et exécutables reconstruits
depuis cette copie. `npm-full-frozen-start.json` indique la commande `npm test`, le
répertoire, la révision de base et les empreintes des exécutables. Le verrou normal
de la suite, les bases temporaires et les preuves restent actifs dans cette copie.
Les dépendances installées sont partagées ; les sources de test ne changent pas
pendant la suite. `frozen-source-manifest.json` consigne aussi les autres corrections
présentes dans le checkout au moment de la capture.

Le commit reprend les sources archivées de cette copie au moyen d’un index Git
temporaire. Les hooks habituels et le contrôle complet du code stagé s’y
appliquent. Le manifeste distingue leurs empreintes des modifications concurrentes
du checkout ; ces dernières conservent leur contenu et leur état de travail.
Les octets bruts testés sont archivés avec leur SHA-256. Les blobs du commit sont
vérifiés après application des filtres Git du dépôt, notamment la normalisation
des fins de ligne ; aucun changement de contenu n’est accepté par cette comparaison.
Les deux index documentaires reçoivent le lien vers ce rapport à partir de leur
version déjà commitée. Les autres ajouts en cours dans ces README sont conservés
dans l’arbre de travail et ne sont pas intégrés à ce commit par cette opération.

La tentative globale partagée précédente avait échoué sur le profil de délai de
l’action signée. Sa correction concurrente déclare 120 secondes avant signature
et une calibration de 300 secondes ; revue et vérifiée par les suites relancées,
elle est incluse dans les 31 fichiers de ce correctif.

Les essais Cargo sont également conservés. `cargo test --workspace --jobs 2`
échoue sur `same_initial_state_and_seed_reproduce_identical_lineage_after_cli_restarts`
dans la campagne de reproduction écologique ; une relance isolée de ce test
passe, mais la suite Rust complète reste en échec. Aucun résultat Rust global
positif n’est revendiqué.

Le contrôle `python scripts/ci/check_code_quality.py` termine avec le code 0 :
8 971 fichiers vérifiés, aucune violation avant le correctif IPC
(`code-quality-before-gqwf.log`).

## Délai IPC de la qualification GQWF

La première suite complète sur la copie figée termine avec le code 1 après les
contrôles de publication GQWF : `GQWF Exchange process timeout`. Son journal et
son résultat restent dans `npm-full-frozen-attempt1.log` et
`npm-full-frozen-attempt1-result.json`.

La reproduction instrumentée conserve les véritables requêtes et délais
(`gqwf-ipc-baseline-events.jsonl`). Deux `REQUEST_EVIDENCE` partent à
12:44:07.396 et 12:44:07.397 UTC vers un récepteur séquentiel. Le premier termine
à 12:44:24.252 UTC (16 856 ms). Le second expire au bout de 30 secondes, après
avoir attendu la fin du premier ; les enfants sont arrêtés et le test échoue.

`gqwfExchangeProcessBudgets.cjs` compose maintenant le watchdog du banc de test :
30 secondes de préparation et jusqu’à trois vérifications de 10 secondes par
opération, pour deux candidats en file, soit 120 secondes au maximum. Le démarrage
et l’attente d’un jalon restent limités à 30 secondes. Le vérificateur natif
conserve exactement sa limite de 10 secondes. Aucun garde de production, bail,
test de révocation ou prédicat indépendant n’est supprimé. Les erreurs indiquent
désormais le rôle, l’action et la limite atteinte.

La copie figée reçoit uniquement ces trois sources supplémentaires avant la
nouvelle suite ; son manifeste conserve l’amendement et le manifeste antérieur.
Dans la sonde corrigée, la seconde demande concurrente termine en 57 966 ms,
attente comprise ; une lecture d’état attendant derrière elle prend 31 599 ms.
Ces opérations légitimes dépassaient donc bien l’ancien watchdog de 30 secondes.
Le contrôle de qualité final passe sur 8 986 fichiers, sans violation
(`code-quality-final.log`, code 0).
La qualification corrigée termine avec le code 0 en 352 603 ms : producteur et
récepteur dans des processus séparés,
interruption après écriture avant ACK, redémarrages, course de deux candidats,
refus du candidat devenu périmé, rebasage avec trois preuves indépendantes et
rejeu des reçus sans nouvelle publication (`gqwf-ipc-fixed-events.jsonl` et
`gqwf-ipc-fixed.log`).

## Reprise OMEGA et admission d’une réservation

La deuxième suite figée échoue sur le watchdog de 20 secondes du processus de
reprise OMEGA (`npm-full-frozen-attempt2.log`). La mission de test déclare pourtant
300 secondes. Le correctif concurrent déjà présent dans le checkout est repris :
watchdog borné de 120 secondes, erreur précisant le mode, nettoyage des timers
et arrêt idempotent d’un enfant déjà terminé. Les deux phases restent donc
bornées sous le budget initial de la mission ; aucune autorité n’est renouvelée.

`omega-recovery-fixed-events.jsonl` observe les deux véritables enfants : effet
commis avant l’arrêt volontaire en 18 355 ms, puis reprise en 14 223 ms. Le test
termine avec le code 0 et exige toujours un seul effet et une seule dépense.

La copie intègre aussi l’ajustement concurrent des admissions ADN et cliniques :
une réservation de garage peut marquer un worker `running` avant qu’un run soit
créé. L’admission est alors permise par une vérification SQL d’absence de run
`planned` ou `running`, avec comparaison atomique des métadonnées. Une incarnation
active conserve son interdiction de réadmission. Les contrôles cliniques et les
preuves signées restent obligatoires. Les fixtures distinguent désormais la
réservation et l’exécution active, sans forcer un statut temporaire pour franchir
le garde. Ces ajustements sont inclus dans le périmètre des sources commitées.
Les qualifications `clinical-reserved-admission` et `windows-active-admission`
terminent avec le code 0. Le contrôle de qualité après leur intégration vérifie
8 987 fichiers, sans violation (`code-quality-final.log`, code 0).

## Watchdog du scénario de preuve de code

La troisième suite termine avec le code 1 sur `test_native_code_completion.js` :
le scénario positif est tué par son watchdog externe de 60 secondes, avec un
statut enfant `null`. Les résultats précédents restent conservés dans
`npm-full-frozen-attempt3.log` et `npm-full-frozen-attempt3-result.json`.

Une observation séparée, bornée à 240 secondes, termine réellement avec le code 0
en 61 775 ms (`native-code-positive-baseline-result.json`). Elle conserve le budget
signé du worker de 60 secondes. Les 264 postconditions, les deux oracles, la
reçu d’approbation contrôlé du banc, le rejeu frais et le refus après mutation du code passent.
Le délai externe était plus court que le scénario complet, qui comprend aussi
le bootstrap, les inspections après décision et le nettoyage.

La première correction du watchdog compose quatre phases bornées de
60 secondes, soit 240 secondes au maximum, en gardant le worker à 60 secondes.
Le test refuse explicitement une erreur de lancement ou un signal d’arrêt et
publie la durée de chaque cas. Les vérifications de preuve, d’autorité, de budget
et de nonces restent exécutées.

`remaining-stage-preflight-result.json` distingue explicitement la qualification
ciblée des groupes restant après cet échec d’une suite npm complète. Cette
qualification utilise le verrou et le contrôle d’espace disque officiels ; elle
ne constitue pas à elle seule le résultat final demandé.

Une première qualification ciblée passe sept cas, puis un enfant est terminé
avec le code Windows `1073807364`, soit `0x40010004` (`DBG_TERMINATE_PROCESS` dans
la [référence Microsoft](https://learn.microsoft.com/fr-fr/openspecs/windows_protocols/ms-erref/596a1078-e883-4972-9bbc-49e60bebca55)).
Cette interruption n’est pas transformée en réussite ; ses journaux sont archivés.
La relance suivante reproduit une véritable expiration du worker de 60 secondes :
enveloppe émise à 17:05:22.978 UTC, expiration clinique à 17:06:03.043 UTC et début
persisté à 17:05:35.231 UTC. Le garde refuse correctement l’exécution après échéance.

L’API publique de sous-orchestration conserve son plafond de 60 secondes. Le
scénario complet de preuve de code utilise désormais l’orchestrateur du banc
autorisé à lancer ce travail : son contrôle signé est de 300 secondes et le
vérificateur reçoit 180 secondes avant admission, via les services de flotte et
de runtime habituels. Le watchdog externe couvre cette durée et trois phases de
60 secondes, soit 360 secondes. Le parent doit rester valide avec le même hash ;
le worker doit conserver son enveloppe initiale, bornée par son admission clinique.
Les 264 postconditions, les deux oracles, le reçu d’approbation contrôlé du banc, les nonces et le rejeu
restent obligatoires. Le test de délégation publique demande 120 secondes et exige
une enveloppe effectivement plafonnée à 60 secondes.

La première sonde de périmètre clinique du nouveau montage transmettait à tort
`entityId` en plus de l’organisation et du projet. L’appel a été corrigé sans
modifier le garde. Le scénario positif termine ensuite réellement avec le code 0
en 116 647 ms (`native-code-root-budget-result.json`). Le résultat brut du wrapper
est conservé séparément ; sa déclaration en secondes a été convertie explicitement
en millisecondes dans les métadonnées, sans modifier le statut ni la durée observée.

Les treize cas du groupe de preuve de code passent ensuite dans la qualification
ciblée. Le scénario positif complet dure 244 047 ms, avec un worker toujours
borné à 180 secondes ; cette durée globale comprend les contrôles après exécution,
la promotion contrôlée et le rejeu dans un nouveau processus. Les refus de chemin
hors périmètre, d’empreinte incorrecte, de tests fournis par le candidat et de
couverture signée insuffisante restent vérifiés. Le journal est conservé dans
`remaining-stage-preflight-before-foundation.log`.

## Requalification des sources scellées

La modification du contrat d’enveloppe et du test de délégation invalide le reçu
fondateur antérieur. La commande officielle
`node backend/bin/qualify-foundational-principles.cjs` réexécute les onze programmes
de preuve, puis qualifie les dix-neuf principes. Les 44 références de source restent
identiques pendant cette exécution. Le résultat ne revendique ni validité universelle
ni autorisation de promotion.

Le nouveau reçu versionné est
`receipts/principes-fondateurs-2026-11-04-autorite.json`, avec l’empreinte
`db71341c39059cb20351914396ba2ef3b520fc8c15940fba929a0e06543d5cae`
et le digest de sources
`30b68b737d9a0e34bd968d60fefaa978547c272c9088a37e3938865fcccfa0cb`.
`foundation-requalification-result.json` atteste le code 0 et la stabilité des
sources. Le test persistant pointe vers ce reçu ; les anciens reçus sont conservés.

Le descripteur d’export GCI présentait également une identité périmée. Sa nouvelle
empreinte d’implémentation est
`sha256:763c39fbfec7aabad0f87c12fdb935875fc433511b8ff2bc1d75be65f0721d1a`.
Elle est calculée sur les huit fichiers déclarés, restés inchangés pendant cinq
tests exécutables : garde de promotion, approbation contrôlée, parcours HTTP,
contrat d’export et parcours HTTP Linked complet. Tous terminent avec le code 0
(`gci-export-qualification-result.json`). Seule l’identité de source du descripteur
est actualisée ; aucune publication réelle n’est effectuée.

Le contrôle complet de la copie figée vérifie 8 973 fichiers, sans violation
(`code-quality-frozen-final.log`). Après les derniers amendements, le contrôle de
ses 69 sources stagées passe également sans violation
(`code-quality-snapshot-staged.log`). La qualification ciblée des derniers groupes,
de GCI à l’inventaire, termine avec le code 0 ; son résultat précise explicitement
qu’il ne constitue pas une exécution complète de npm.

La quatrième relance complète est arrêtée volontairement après cinq minutes :
un contrôle de préservation détecte que le commit concurrent `704d7f894` transmet
désormais le budget complet et le délai explicite au contrat du worker direct.
Cette ligne est intégrée à la copie figée avant la cinquième relance. Seul l’arbre
de processus appartenant à cette quatrième validation est arrêté ; son résultat
reste un code 1, archivé dans `npm-full-frozen-attempt4-result.json`. La cinquième
relance utilise de nouveau la commande racine depuis le début et le verrou normal.

## Conservation d’une échéance absolue déclarée

La revue finale reproduit un autre défaut dans `ALLOSTASIS.prepare` : la coercition
`Number(value) || Infinity` transforme une date ISO, zéro ou une valeur invalide
en absence de limite. La sonde du service réel accepte ainsi une échéance datant
de 2000 et lui substitue 57 secondes futures. Elle conserve également un délai
relatif trop long lorsque l’échéance numérique est plus proche.

Le correctif distingue l’absence de date, une date numérique et une date ISO.
Une date invalide déclenche `WORKER_DEADLINE_INVALID`, une date déjà atteinte
`WORKER_DEADLINE_EXCEEDED`. Une date future conserve exactement sa valeur ; le
délai relatif devient au plus le temps restant, avant application éventuelle du
plafond clinique plus court. Il n’existe plus de conversion d’une date expirée
en une nouvelle fenêtre d’exécution.

`absolute-deadline-comparison.json` compare les deux versions réelles du service
sur six entrées : date ISO expirée, zéro, chaîne vide, chaîne invalide, date
numérique future et date ISO future. Les quatre refus attendus et les deux
conservations de date passent. La version antérieure est archivée dans
`before-absolute-deadline/` pour rejouer la comparaison.
Le test d’incarnation topologique vérifie aussi ces cas entre la préparation
ALLOSTASIS et le contexte d’exécution natif, avec le délai relatif borné.

La cinquième relance globale est arrêtée volontairement avant cette modification ;
ses résultats restent archivés avec le code 1. Une sixième relance repart de la
commande racine après les tests ciblés et le contrôle de qualité des sources.

La sixième relance perd ensuite son lanceur et son arbre npm pendant la
qualification des missions natives. Le journal s’arrête sans exception de test
ni code final du processus npm. Le statut externe du lanceur est 1 ; le code npm
reste inconnu. `npm-full-frozen-attempt6-result.json` marque donc explicitement
une interruption de cause inconnue, sans réussite revendiquée. Le propriétaire
du verrou est constaté absent ; la relance suivante utilise la récupération
normale du verrou, sans suppression manuelle. Les sources restent identiques.

L’abonnement Windows à `Win32_ProcessStopTrace` est refusé. Le suivi de la
septième relance utilise donc des handles des deux processus et consigne leur
présence en lecture seule dans `npm-process-polling.jsonl`. Il ne permet pas
d’identifier l’auteur d’une éventuelle interruption.

Le transport MCP GenOS se ferme également : la tentative suivante de mémoire
renvoie `Transport closed`. Les décisions et expériences précédemment confirmées
restent des écritures réelles, mais aucune synchronisation finale par ce transport
n’est revendiquée. Les preuves d’exécution restent les sorties locales de la CLI,
les assertions des tests et leurs codes de sortie.

## Résultat npm complet et empreintes finales

La septième exécution de `npm test`, depuis la racine de la copie figée, termine
avec le **code 0**, du 4 novembre 2026 à 19:16:02.623 UTC jusqu’à
19:48:39.430 UTC, soit 32 min 36,807 s. Son dernier groupe affiche
`Inventory composition: 21/21 suites PASS`. Aucun groupe de la commande racine
n’est remplacé par une sélection ciblée.

Le suivi des handles observe aussi le lanceur et le processus npm terminés avec
le code 0. `npm-full-final-result.json` et `validation-summary.json` conservent
la commande, les dates, les empreintes des exécutables et le périmètre validé.
Les 31 fichiers archivés correspondent toujours aux octets présents dans la
copie figée après la suite.

Dans cette exécution complète :

- la coopération termine en 20 451 ms : huit workers, seize oracles, zéro jeton
  de modèle et un seul worker simultané (`npm-cooperation-milestone.json`) ;
- les dix-neuf types natifs obtiennent trente-huit oracles indépendants acceptés,
  dont le worker formel (`npm-native-worker-oracles.json`) ;
- les treize scénarios de code passent ; le positif dure 15 564 ms et conserve
  son budget signé de 180 000 ms (`npm-native-code-evidence.json`) ;
- les gardes d’autorité, de révocation, de budget insuffisant, de preuve manquante
  et de couverture signée insuffisante restent exercés avec leurs refus attendus.

Le run positif de code est `strategy_run_1793821319391_a1b80991`, avec le hash
d’autorité `25cdb61a03fde6be3505d262bdbed22cccdcdc718e5565f04e64145d686853d3`.
Son expiration `2026-11-04T19:44:51.744Z` reste antérieure à sa limite clinique
originale `2026-11-04T19:44:59.102Z`.

Empreintes SHA-256 des preuves locales :

| Fichier | SHA-256 |
| --- | --- |
| `npm-full-frozen.log` | `04C1A9C87665A01E843F987D1ACD756F8530F31CF40EF7309D91909FE30FF343` |
| `npm-full-frozen-result.json` | `B6F071C96A8994A6C065FB957FA07454429055A2AF96831FBE77BFBC68C23554` |
| `scoped-source-manifest.json` | `608FBCA947590091061A80D09823B37CB0C8924F4AC3E49E70430D6459F09914` |

Le résultat Rust reste distinct : la commande complète s’arrête avec le code 101,
avec 325 tests réussis et un échec relevé dans les quinze groupes terminés.
La cause écologique déjà décrite n’est pas corrigée par ce changement JavaScript.
La nouvelle tentative de synchronisation MCP après le succès npm renvoie encore
`Transport closed` ; aucune écriture finale de mémoire GenOS n’est revendiquée.
