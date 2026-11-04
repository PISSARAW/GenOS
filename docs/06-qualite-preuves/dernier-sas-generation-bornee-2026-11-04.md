# Le Dernier Sas — génération bornée du 4 novembre 2026

- **Statut** : Corrections et vérifications terminées ; dernière exécution interrompue sans verdict qualité, nouvelle mesure en attente d’une fenêtre calme.
- **Portée** : Répétition, troncature et production native d'un scénario complet.
- **Dernière revue** : 2026-11-04.

Cette campagne prolonge la [relance des raccords intégrés](relance-dernier-sas-raccords-integres-2026-11-04.md).
Elle conserve les refus et leurs coûts. Un brouillon complet ne vaut ni promotion
GQEL, ni qualification collective des mécanismes.

## Défauts observés et corrections

La tentative précédente, `mission_baaf0395-e50f-46fe-b83e-a1080bfacb16`, avait
échoué pendant `write:S1`. Sa réponse brute de 53 926 caractères répétait une
même phrase 262 fois puis atteignait 16 000 tokens de sortie. L'usage total connu
était de 75 477 tokens sur 16 tentatives de routage, en 793,311 secondes.
Le refus `GQEL_TRUNCATED_OUTPUT` était légitime : refermer le JSON ou publier
son fragment aurait inventé une réponse complète.

| Point | Commit | Comportement vérifiable |
|---|---|---|
| Répétitions | `b871ac285` | Refus des boucles lexicales dominantes et des copies normalisées de corps de scène, avec citations et digests ; aucune suppression automatique. |
| Troncature | `160cebe67` | Bornes par scène, réponses complètes nouvelles, usage corrélé à l'appel exact et maximum partagé de trois tentatives par scène. |
| Ordre du contexte | `56e69d9c8` | Contexte natif intégral avant les données exactes de l'étape ; aucune omission des handoffs ou substitution de contexte. |
| Durée contractuelle | `b4a0af3e8` | Preset explicite de vingt minutes activant le pacing et le critère de durée déjà existants. |
| Sections du scénario | `58ab27d95` | Génération mesurée du titre, de la logline, des profils avec objectif/secret et de la note, avant matérialisation exacte ; critère dur canonique et noms scellés. |
| Durée de l'autorité native | `704d7f894` | Transmission de la durée déjà demandée à la création et à la reconstruction canonique du contrat worker, avant son scellement. |
| Erreur de clôture secondaire | `a4c9e7a9e` | Préservation de la cause d'exécution, tentative des deux clôtures et maintien du refus GQWF d'un run non terminal. |
| Plan causal copié | `2cc87daf1` | Refus d'une majorité stricte d'au moins trois tuples décision/conséquence/état identiques, avant la rédaction provisoire ; diagnostic et réparation bornée. |
| Grammaire des scènes | `02f8bdbb0` | Lignes JSON courtes bornées, puis rendu des textes du modèle ; évite les quantificateurs rendus infinis par le parseur installé. |
| Consignes de lignes | `a72f7d65b` | Exemple JSON cohérent avec la séparation des noms et des répliques ; cible indicative visible et diagnostic exact après un retour complet. |

Les bornes de scène répartissent le minimum global de mots selon les poids de
durée du plan. Leur plafond est `min(plafond global, max(1536, cible * 6 + 256))`
tokens. Le premier schéma bornait `sceneText` à `max(4096, cible * 24)` points
de code Unicode ; le protocole final découpe cette sortie en lignes courtes.
Une troncature n'est réparable que si le reçu du nouvel appel établit ses
compteurs, sa route et son motif de fin. Usage inconnu, timeout, annulation,
perte d'autorité et dépassement de budget restent terminaux. L'épuisement
local ne permet pas de multiplier les tentatives par les tours d'artefact.

Le détecteur de répétition est lexical. Il ne certifie pas l'absence de
paraphrases, de scènes renommées ou de défauts dramaturgiques. Les reprises
conservent l'original rejeté ; elles ne le réutilisent pas comme scène admise.

Le parseur installé, commit `39febd2ad`, remplace silencieusement une borne de
répétition supérieure à 2 000 par une borne infinie. Un probe sans modèle sur
sa DLL accepte ainsi 5 000 caractères sous `[a]{20,4128}`, mais refuse le
2 001e sous `[a]{20,2000}`. Le schéma natif utilise maintenant un tableau de
lignes, avec tous ses quantificateurs au plus égaux à 2 000. Pour la cible
réelle de 172 mots, il autorise au plus 28 lignes de 73 caractères, sous le
même plafond de 1 536 tokens. L'en-tête vient du plan rédigé par le modèle ;
le rendu ajoute les sauts de ligne entre ses textes, sans écrire leurs actions
ou répliques. Le JSON, les sauts de ligne internes et les autres en-têtes
restent contrôlés localement. Cela ne garantit pas une scène réussie.

## Protocole de relance

La campagne crée une mission, un projet, un workspace et des ADN signés propres.
La topologie demandée reste un pipeline A-Team auteur → dramaturge, sous
`ollama://llama3.1:8b`, sans modèle de secours. Le runtime Rust est copié et
empreinté avant lancement. La révision, le diff initial, le preset et les
empreintes des chemins initialement modifiés ou non suivis sont conservés.
Pour les premières relances, cela ne fige pas les modules JavaScript chargés
plus tard dans le checkout partagé. Une modification concurrente d'un fichier
initialement propre, ou une mutation suivie de restauration, peut échapper
au contrôle final `sourceChangesDuringRun`. La dernière relance démarre dans
`D:/GenOS-runs/dernier-sas-runtime-execution-20261104/` avec une base et un
répertoire de données neufs. Elle utilise la copie complète figée des sources
et ressources sous `dernier-sas-runtime-complete-20261104/runtime-code`.
Les dépendances restent accessibles par des jonctions partagées ; le
fournisseur Ollama signé 0.40.12 et sa file de requêtes restent partagés.
Ce dispositif ne constitue donc pas un environnement hermétique. Cette dernière
exécution est interrompue sans résultat terminal observé. Les clés privées
temporaires ne sont pas archivées.

Le contrat demande cinq à sept scènes, au moins 1 200 mots de continuité,
des dialogues, une logline, les fiches Alain/Vera et une note dramaturgique.
Le seuil reste 80, avec deux lecteurs du même modèle soumis aux quatre
contrôles préalables existants, puis comparaison dans les deux ordres.
Ces contrôles ne sont pas une calibration générale du jugement artistique.
Ces lecteurs forment un seul groupe de dépendance.
Le nouveau critère des sections reçoit le texte intégral ; les autres critères
restent limités au corps des scènes. Le paratexte ne justifie ni le volume de
continuité ni sa qualité rédactionnelle. Les sections sont rédigées par le
modèle, sans remplacement substantiel par un gabarit ou par les données du plan.
Le budget GQEL reste de 500 000 tokens, 80 appels et une heure ; le budget
parent de 1 200 000 tokens et deux heures. Les durées écrites dans le plan
ne prouvent pas une durée jouée de vingt minutes.
Le plafond natif du worker qualité reste de 160 000 tokens, conformément
à l'ADR 0782. Un plafond interne GQEL de 500 000 ne le relève pas.

Les mécanismes sont requis par le contrat collectif : préparation ETT native
avec oracle distinct, NCE curiosité/phénotype, canal Axolotl avec panne déclarée,
AGOW borné, ADN signé, scan clinique, GVX, programme OMEGA/GCIR, protocoles
EVIDENCE, CONTINUITY, OMEGA, SYNAPSE, ALLOSTASIS et GQWF. MORPH exige une
transition réellement commise ; RPE exige admission, consommation et ACK natif.
Le refus du worker source peut empêcher ces étapes aval. Une configuration
active ne constitue jamais leur exécution ou leur qualification.

## Résultats des tentatives

### Première relance bornée : autorité expirée

La mission `mission_051841c8-ffae-4c5c-8814-5a2ad4904d3c`, équipe
`ateam_abc4c63e9c4e5a5d757ccfafcda2a47e`, termine sa commande avec le code 1
après 1 834,144 secondes. Le registre contient quatorze routes fournisseur,
toutes `llama3.1:8b`, avec 54 609 tokens mesurés : 46 667 en entrée et
7 942 en sortie. Il n'y a aucun livrable final vérifié.

Les huit contrôles des lecteurs passent. Le premier candidat de 702 mots
obtient 75 avec le détecteur V1 réappliqué, mais aucun score sémantique V2 :
le scan ne reconnaît pas de continuité conforme. Le runtime construit un plan,
puis deux scènes complètes : S1 utilise 463 tokens de sortie, S2 en utilise 325.
S3 atteint son plafond de 1 536 tokens avec une fin `length` et reste refusée.
Le probe lexical négatif du brut retrouve une boucle dominante : 390 mots
répétés sur 763 inspectés, soit 51,11 %, avec un pic de neuf occurrences.
Cette mesure diagnostique ne répare ni n'admet le JSON tronqué.

Le checkpoint conserve S3 avec `repairEligible: true`. L'autorité native
scellait pourtant une durée de trente minutes : le budget complet avait été
réduit à ses tokens lors de la construction du contrat. La tentative suivante
rencontre `EXECUTION_AUTHORITY_EXPIRED` avant un nouvel échange fournisseur.
Ce refus respecte le gate d'autorité et ne constitue pas un défaut du comptage
ou de l'éligibilité de réparation.

Le dernier checkpoint authentifié reste `in_progress`, avec quatorze appels
mesurés. Le feedback d'arrêt distinct indique `needs_review`, quinze
invocations GQEL et 83 115 tokens comptables avec `usageComplete: false` :
la différence de 28 506 est une réservation prudente après refus avant
fournisseur, pas une consommation mesurée supplémentaire. Aucun reçu final
GQEL n'a pu être scellé après expiration. La clôture GQWF signalait ensuite
`MISSION_GQWF_TERMINAL_RUN_REQUIRED` et masquait la cause première.

Le processus auteur est en erreur, le dramaturge reste inactif et la ligne
topologique relue reste `RUNNING`. Cet état résiduel ne prouve pas une mission
encore vivante : la commande est sortie et le qualifier collectif refuse
`MISSION_MECHANISMS_WORKER_INCOMPLETE`. MORPH n'a pas commis de transition
et aucun handoff RPE qualifié n'a été consommé. Les anciennes autorités et
les anciennes lignes ne sont pas modifiées pour transformer cet arrêt en succès.

### Relance avec durée transmise avant scellement

La mission `mission_6a051beb-f782-4cb3-9a6c-c10b8929392e` termine `FAILED`,
code 1, après 299,196 secondes. Son autorité native dispose bien d'environ
deux heures et n'est pas expirée. Le fournisseur privé disparaît pendant
l'inférence, avant une réponse terminale : le daemon montre environ 1 976
tokens générés, mais ce compteur diagnostique n'est pas un reçu d'usage.
Les deux routes enregistrées comprennent un appel fournisseur interrompu et
un refus ultérieur de découverte. Aucun token fournisseur n'est mesuré et
`usageIncomplete` reste vrai : la consommation réelle est inconnue, non nulle
par déduction. Aucun candidat ni aucune scène ne sont disponibles.

Le serveur avait une durée de vie observée proche de 600 secondes. La cause
de disparition n'est pas prouvée ; le diagnostic n'établit aucun deadlock.
L'hypothèse du cycle de vie du helper et celle d'une interruption extérieure
sont conservées. Une nouvelle mission utilise un fournisseur maintenu dans
une session d'exécution au premier plan, sans changement de gate.

### Relance avec fournisseur maintenu : bornes de texte libre inefficaces

La mission `mission_5ff84c27-c94e-4bcf-9369-b09de9b916e0` termine `FAILED`,
code 1, après 502,047 secondes : quatorze routes, 55 950 tokens fournisseur
mesurés, aucune exposition inconnue. S1 a trois tentatives exactement,
chacune tronquée à 1 536 tokens, puis l'épuisement est terminal. L'autorité
reste valide ; le fournisseur répond encore après 667 850 ms de vie.
Le candidat initial de 153 mots reçoit 0 au détecteur V1 et aucun score V2
recevable. Aucune scène complète ni section nouvelle n'est conservée.

L'audit établit deux défauts : les sept scènes du plan copient le même tuple
décision/conséquence/état ; les trois préfixes dépassent la borne de 4 128
caractères avant fermeture. Le premier défaut motive le refus des plans
dominés par ces copies ; le second est reproduit sans inférence sur la DLL
installée, puis motive les lignes à quantificateurs courts.

### Relance du format lignes : JSON complet, consigne contradictoire

Un lancement préparatoire dans `dernier-sas-lines-and-plan-20261104` échoue
avant dispatch : le lanceur contrôlait encore le catalogue sur 11434 alors
que le fournisseur était configuré ailleurs. Aucun worker ni appel modèle
de scénario n'a été lancé par ce préflight ; ses traces sont conservées.

La mission suivante `mission_308aa21a-3a60-48af-8818-002a2c1ad360` termine
`FAILED`, code 1, après 611,038 secondes : quatorze routes et 53 417 tokens
mesurés. Les trois réponses S1 sont complètes, `finishReason: stop`, avec
81, 87 et 578 tokens de sortie. Elles respectent leurs bornes de 80 caractères
et le nombre d'items. Mais elles placent `ALAIN` et sa réplique dans le même
item, séparés par LF ; le validateur les refuse. L'ancien exemple de dialogue
contenait justement ce regroupement, en contradiction avec le nouveau format.
La nouvelle consigne montre le JSON attendu ; la reprise reçoit désormais
le diagnostic local exact d'un retour complet. Aucun LF interdit n'est accepté
pour transformer ces réponses en scènes recevables.

Le fournisseur 11436 existait déjà : l'instance que le lanceur tentait de
créer a quitté sur un conflit de port, sans modifier l'instance existante.
L'API, le binaire et ses bibliothèques natives sont audités : signatures
Authenticode valides d'Ollama Inc., version 0.40.12, digest 8b attendu et
contexte 65 536. Ce n'est pas un mock ; propriété et exclusivité du fournisseur
ne sont pas revendiquées. Cette version diffère du fournisseur 0.40.14 précédent.

### Relance avec consignes alignées

La mission `mission_9e228faf-677a-4ff3-9a74-24228394d3c8` a été observée
après disparition de son arbre de processus, à 20 h 20 min 06,830 s, heure de
Paris. Aucun marqueur `exit.json`, code de sortie natif ni verdict qualité
terminal n'est disponible. Les 652 550 ms entre le lancement et ce constat
ne donnent ni l'heure réelle d'arrêt ni une durée d'exécution terminale.
L'état natif relu reste `RUNNING` ; il ne démontre pas un processus vivant.

Dix appels disposent d'un usage mesuré, soit 23 795 tokens. Une onzième route
reste d'usage inconnu. Le total mesuré est donc un minimum, avec exposition
supplémentaire inconnue ; il ne faut pas assimiler ce dernier appel à zéro
consommation. Aucun succès ou échec artistique final n'est déduit de cette
interruption. L'utilisateur confirme des campagnes simultanées, mais leur
rôle causal dans la disparition des processus n'est pas prouvé.

Le modèle, ses poids, le contexte de 65 536 tokens, les critères et les
plafonds de qualité sont conservés. Le délai du worker est transmis avant
la création de son autorité, avec le plafond natif de tokens inchangé.

### Préparation d'une copie figée : ressource Cedar absente

La préparation suivante, sous
`D:/GenOS-runs/dernier-sas-runtime-isolated-20261104/`, échoue avec le code 1
et `ENOENT` lors du chargement de
`backend/policies/agent-authority.cedarschema`. Cette ressource existe dans
le dépôt d'origine mais manque à la copie préparée. L'audit de la mission
`mission_382da335-51b4-4f38-ba02-56c219bbd32b` ne trouve aucun agent dans son périmètre,
run natif, appel fournisseur ou tour modèle. Il n'y a ni manifeste de
processus natif ni verdict qualité. C'est un échec de préparation avant
dispatch, distinct de la qualité du modèle et de l'interruption précédente.
La copie historique reste conservée avec son défaut.

### Seconde préparation : organisation locale absente

La préparation dans `D:/GenOS-runs/dernier-sas-runtime-complete-20261104/`
échoue ensuite avant dispatch : la ressource Cedar est présente, mais la
base neuve ne contient pas `org-local`. L'insertion du projet est refusée
par la contrainte de clé étrangère SQLite, avec le code 1. L'audit de
`mission_642dc4f7-c46f-456a-b238-6620381a7889` constate zéro organisation,
projet, agent, run natif, tentative fournisseur et tour modèle. Aucun
processus natif n'a été lancé et aucun verdict qualité n'est établi.

Le lanceur expérimental, hors dépôt, utilise ensuite le bootstrap canonique
`localWorkspaceBootstrap.ensure` pour créer l'organisation locale, le projet
et `ws-local`. La contrainte de clé étrangère reste active ; les anciennes
préparations et leurs bases ne sont pas réécrites en succès.

### Dernière relance complète : nouvelle interruption sans verdict

La mission `mission_48628cf0-8d41-408b-adb7-eb4184601acc` démarre le
4 novembre à 20 h 51 min 25,513 s, heure de Paris, dans
`D:/GenOS-runs/dernier-sas-runtime-execution-20261104/`. Le manifeste du
processus natif donne le PID 38384 et l'orchestrateur
`orchestrator_sas-repaired-e4b8ee87`.

Cette exécution utilise une base de contrôle et un répertoire de données
neufs, en réutilisant la copie figée
`D:/GenOS-runs/dernier-sas-runtime-complete-20261104/runtime-code`.
Le manifeste recense 11 858 fichiers : huit ressources ont été ajoutées à la
préparation et cinq noms de fichiers dont l'encodage était incorrect ont été
rétablis, avec vérification de leurs empreintes exactes contre les originaux.
Les dépendances restent accessibles par des jonctions partagées. Le
fournisseur Ollama 0.40.12 existant, signé, et sa file restent partagés et
n'ont pas été modifiés pour cette relance.

À 20 h 51 min 43 s, l'équipe est observée `RUNNING`, MORPH est `WATCHING` et
aucun appel modèle n'est encore enregistré pour cette mission. L'audit en
lecture seule de 20 h 54 min 21 s retrouve ensuite le reçu de préparation
ETT/NCE/Axolotl/AGOW : digests du contrat et du contexte concordants, ETT
avec oracle structurel distinct, curiosité et phénotype NCE, récupération
Axolotl déclarée et message reçu, AGOW borné accepté. Le binding de l'auteur
relie son ADN au run et à un scan clinique valide sans détection. La requête
modèle conservée inclut le contexte vérifié. Ces observations de préparation
ne valent pas qualification collective terminale ; le MAC n'est pas
réauthentifié hors ligne par cet audit.

L'audit du code relie les arguments des processus au runtime figé et à la
base isolée ; les empreintes des sept ressources et sources critiques
contrôlées concordent avec le manifeste. Il s'agit d'un contrôle ciblé,
pas d'une preuve d'immuabilité de tout le système de fichiers. Des chemins
descriptifs obsolètes dans `runtime-settings.json` sont corrigés hors des
processus ; les arguments d'exécution utilisaient déjà les bons chemins.
Le fichier antérieur reste conservé dans
`runtime-settings-before-path-correction.json`. Cette rectification de
métadonnées ne modifie ni le runtime ni les autorités en cours.

À 20 h 56 min 32 s, le constat OS ne retrouve plus les PID 39000, 38384 et
28124 du lanceur et de l'arbre natif. Aucun `exit.json`, marqueur de sortie
persistant ou `launcher-error.json` ne permet de connaître leur code de
sortie ou l'instant réel de disparition. La base reste `RUNNING`, avec une
route modèle en attente, aucun usage mesuré connu et aucun checkpoint GQEL.
L'usage réel de cette route est inconnu : l'absence de compteur mesuré ne
prouve pas une consommation nulle. Aucun temps terminal n'est reconstruit
à partir du seul instant d'observation.

L'outil Node REPL échoue aussi à charger les ressources de son noyau en
signalant un espace disque insuffisant. Une mesure à 20 h 56 min 44 s relève
environ 375 Mo disponibles sur C:. Ni cette observation ni les campagnes
simultanées confirmées par l'utilisateur ne démontrent la cause de la
disparition des processus. Aucun échec artistique, succès GQEL ou achèvement
collectif n'est déduit de cette interruption. Les critères, plafonds,
autorités et gates n'ont pas été abaissés ; MORPH `WATCHING` ne prouve pas
une transition commise.

La poursuite des mesures attend la confirmation d'une fenêtre calme,
sans campagnes simultanées ; la réponse utilisateur reste en attente.
Les tests réellement exécutés et les interruptions restent conservés.

## Vérifications

Les quatre nouvelles régressions sont enregistrées dans la suite composée par
`14cc716d1`. Les réponses synthétiques vérifient le runtime, sans qualifier
la qualité artistique du modèle réel.

| Vérification | Résultat observé |
|---|---|
| Répétition | 10/10 cas, et probe négatif sur la vraie réponse tronquée. |
| Génération bornée et lignes | Bornes, Unicode, usage cumulé, reprises et refus terminaux : PASS. |
| Contexte natif | Ordre, intégrité et répétition de préparation : PASS. |
| Sections | 12/12, dont grammaire bornée, intégration avant matérialisation, portée des citations et refus des fausses scènes. |
| Plans causaux copiés | 8/8 fixtures : PASS ; aucune acceptation artistique. |
| Progression GQEL | 35/35 fixtures : PASS. |
| GQEL V2 | 50/50 fixtures : PASS. |
| Suite composée après les consignes finales, temporaire D: | 28/28 suites, code 0 ; journal `inventory-post-prompt.log`. |
| Suite qualité après les consignes finales | 32/32 tests, code 0 ; journal `quality-post-prompt.log`. |
| Qualité stricte de l'union des corrections et des suites enregistrées | 30 sources, zéro violation, code 0 ; journal `code-quality-targeted-post-prompt.log`. |
| Qualité globale après les consignes finales | 9 163 sources, zéro violation, code 0 ; journal `code-quality-post-prompt.log`. Les corrections partagées ne sont pas attribuées à cette livraison. |
| `cargo test --workspace` | PASS, code 0, 1 234 tests, aucun échec ; journal `cargo-test-18h.log` et résumé associé. Cette vérification précède les derniers correctifs Node. |
| `npm test` | Après les préflights de verrou et d'espace disque, exécution réelle : code 1, `EBUSY` au nettoyage `control.sqlite-shm` du test mission-local-worker ; journal `npm-test-18h-temp-d.log`. |
| Préservation de l'erreur initiale | Rouge avant correction, puis 9/9 PASS ; refus GQWF conservé. |
| Frontières runtime et sécurité GQWF | PASS ; le refus des runs non terminaux est conservé. |
| Test local-worker isolé | Code 1, `EBUSY` SQLite reproduit sur D: au nettoyage de `control.sqlite`, avec avertissement de rollback sur base fermée ; journal `local-worker-post-authority.log`. La suite Node globale reste en échec. |

Un premier contrôle global avait rejeté trois complexités 11 > 10 dans
`qualify-worker-cooperation-live.cjs`, `nativeOracleDomains.js` et
`test_worker_cooperation_live.cjs`, alors modifiés par d'autres travaux.
Ce résultat historique est conservé dans `code-quality-18h.log`. Les contrôles
globaux suivants passent, dont le dernier après les consignes finales ; les
corrections externes ne sont pas attribuées à ces commits. Aucun verrou ou
seuil n'a été contourné.
La première suite composée s'était arrêtée sur
`WORKSPACE_DISK_SPACE_INSUFFICIENT` dans le test de handoffs. Ses reprises
utilisent un dossier temporaire sur D:, avec le même contrôle de réserve
d'espace. La dernière exécution passe les 28 suites après enregistrement
du test des plans copiés.

Les journaux de vérification restent dans
`D:/GenOS-runs/dernier-sas-scene-repair-20261104/`, avec les codes de sortie.

La dernière tentative d'enregistrement de la décision de développement par
MCP échoue avec `Transport closed`. La décision et ses références sont
conservées localement dans `development-memory-pending.json` du dossier de
la dernière exécution. Ce fichier ne vaut pas une persistance MCP confirmée.
Les preuves précédemment persistées restent distinctes et ne sont pas
invalidées par cette indisponibilité.

## Comparaison et limites

La référence du 2 novembre est la session
`gqel-session-1793643196888-63352b`. Les digests de ses trois versions et ses
scores V1 `20 → 30 → 75` sont reproductibles. Le meilleur texte compte
702 mots ; il n'était pas promu. L'exécution historique durait environ
87,42 secondes et ses tokens mesurés ne sont pas connus.

La nouvelle expérience reste une comparaison descriptive, sans ablation.
L'utilisateur confirme plusieurs campagnes simultanées ; cela établit une
concurrence possible, sans prouver la cause d'une interruption.
Une autre campagne a adressé trois requêtes Qwen 32B au même serveur Ollama.
Cette concurrence est étayée par un arbre de processus et une base distincts.
Le quatrième appel du Sas est resté en attente puis a terminé à 18 h 32 min 23 s,
avant son échéance de dix minutes. Les requêtes archivées du Sas demandaient
toutes `llama3.1:8b` ; aucune substitution Qwen n'a été démontrée. Une pression
mémoire est observée, sans mesure de sa contribution causale exacte au délai.
Les compteurs publiés portent sur le registre des tentatives de cette mission,
sans prétendre mesurer toute la consommation du serveur partagé.

La cible explicite de vingt minutes et les sections requises renforcent le
contrat précédent ; il ne s'agit pas de conditions identiques. Le brief enrichi,
la température ADN de 0,45 au lieu de 0,7, les plafonds, les revues et le
checkout partagé empêchent une attribution causale au seul runtime. L'empreinte
historique des poids du modèle n'est pas connue. Un score V1 réappliqué est un
contrôle de format et ne se compare pas directement au score sémantique V2.

Les signatures lient les preuves aux runs et aux artefacts. Elles ne prouvent
pas la vérité artistique des jugements. Les artefacts bruts restent hors Git,
dans les dossiers de campagne sous `D:/GenOS-runs/`, notamment
`dernier-sas-generation-repaired-20261104`, `dernier-sas-final-20261104`,
`dernier-sas-runtime-isolated-20261104`,
`dernier-sas-runtime-complete-20261104` et
`dernier-sas-runtime-execution-20261104`.

## Décisions associées

- [Refus des répétitions natives](../adr/2026-11-04-refus-repetition-scenes-natives.md).
- [Bornes et réparations des scènes](../adr/2026-11-04-gqel-bornes-et-reparations-des-scenes.md).
- [Ordre du contexte natif](../adr/2026-11-04-ordre-contexte-natif-et-donnees-de-scene.md).
- [Sections rédigées et revues du scénario](../adr/2026-11-04-sections-redigees-et-revues-du-scenario.md).
- [Durée transmise avant scellement](../adr/2026-11-04-transmission-duree-worker-avant-scellement.md).
- [Cause d'exécution et clôtures](../adr/2026-11-04-preservation-erreur-execution-cloture-protocoles.md).
- [Plans causaux copiés dominants](../adr/2026-11-04-refus-plans-causaux-copies-dominants.md).
- [Lignes bornées et grammaire native](../adr/2026-11-04-lignes-natives-bornees-et-grammaire-scene.md).
- [Consignes et diagnostics des lignes](../adr/2026-11-04-consignes-et-diagnostics-des-lignes-de-scene.md).
