# Qualification des missions LLM hiérarchiques Rust — 2026-11-04

Cette qualification porte sur une arborescence de rôles préadmis et une
délégation récursive réellement tirée des appels d'outils natifs.
Elle complète l'[ADR 0787](../adr/0787-hierarchie-et-delegation-recursive-llm-rust.md)
et la [référence des échanges](../03-reference/orchestration-hierarchique-llm-rust.md).

## État des preuves H2

Les quatre validations H2 sont terminées avec exit 0. Le résultat
de livraison post-commit est porté par le manifeste externe décrit
ci-dessous ; il ne se déduit pas de cette page.

H2 est une évolution du contrat d'admission : la fenêtre de mission peut
atteindre 600 000 ms uniquement pour une configuration hiérarchique Rust
réellement validée. Son ensemble source déclaré comprend 23 fichiers.
Le gel H2 officiel est `hierarchical-source-v2.json`, avec normalisation
CRLF et empreinte
`f176212c09f44fa78388b87d7a1c5a2747ebdd031d27e115dd612f1cd5c1555a`.
Ses commandes, son pin et son essai réel ont été vérifiés ensemble. Aucun résultat H1 ci-dessous n'est réutilisé
comme qualification H2.

| Vérification H2 | Résultat |
| --- | --- |
| Gel exact des 23 sources et empreinte | Gel H2 officiel relu ; fichiers et empreinte concordants |
| Unités du contrat d'admission et refus de profils (incluses dans Cargo global) | **167 passés, 0 échec** ; cinq nouveaux cas H2 présents |
| Runtime HTTP hiérarchique et reprise (inclus dans Cargo global) | **4 passés, 0 échec** |
| CLI native et bornes de fenêtre (incluses dans Cargo global) | **5 passés, 0 échec**, plus les deux gardes d'arguments passées |
| CONTINUITY sans fonctions par défaut | **8 passés, 0 échec, 0 ignoré**, exit 0 ; reçu H2 distinct |
| Qualité globale H2 | **8 822 sources, 0 violation**, exit 0 ; reçu H2 sur les 23 sources |
| `npm test` H2 | **exit 0, wrapper 0** ; chaîne complète, dernier inventaire **14/14 passés** |
| `cargo test --workspace --locked --offline` H2 | **151 targets, 1 227 passés, 0 échec, 0 ignoré**, exit 0 |
| Nouveau pin et essai réel H2 autorisé | **Qualification stricte positive**, premier CLI et rejeu exit 0 ; détails ci-dessous |
| Audit des huit commits, de toutes les sources et des preuves | Contrôle strict post-commit ; résultat dans le manifeste externe de livraison |

Les unités, le SDK runtime et la CLI H2 ont été exécutés dans la seule
commande `cargo test --workspace --locked --offline`. Le journal relie
chaque en-tête de target à son résumé et montre les cinq nouveaux
tests d'admission et les deux tests d'arguments CLI passés.
Aucune commande ciblée H2 supplémentaire n'est revendiquée. Les quatre
reçus finaux requis portent sur Cargo global, CONTINUITY sans fonctions
par défaut, la qualité et Node, tous sur la même carte H2 de 23 fichiers.

La qualité H2 est terminée : le reçu
`hierarchical-quality-h2-final1.json` porte `status: completed`,
`exit_code: 0`, `unchanged_sources: true` et la carte exacte des
23 sources. Son journal a pour SHA-256
`4fa999b18ebe21be7078d099681b47eab57ed2184d03ef0074fab691241e7bae`.
La suite H2 `cargo test --workspace --locked --offline` est terminée
avec exit 0 : **151 targets, 1 227 tests passés, 0 échec, 0 ignoré**.
Le reçu `hierarchical-rust-h2-final1.json` couvre la période UTC du
4 novembre 2026, 08:11:23.044860 à 08:43:37.450178
(1 934,405318 s), avec `unchanged_sources: true` et la carte H2
exacte des 23 fichiers. Son journal a pour SHA-256
`a49347e14ad7853640fd04181d4eaa5c1c5a1fb0f059b4b9d8d0137fbb6d960d`.

Le parseur relie les 151 en-têtes de target à leurs résumés.
Il confirme dans cette seule exécution les 167 unités orchestrator,
les quatre cas SDK hiérarchiques et les cinq cas CLI hiérarchiques,
ainsi que les cinq nouvelles unités de bornes et les deux gardes
d'arguments CLI. Aucun résultat ciblé H1 n'est substitué à ces
vérifications H2.

Les cinq nouvelles unités couvrent l'admission hiérarchique à
600 000 ms, le refus au-delà, le maintien de la borne plate/statique
à 180 000 ms, le plafond HTTP inchangé et la relation entre budget
cumulé, fenêtre et bail minimal. Les deux tests d'arguments refusent
le transfert d'une fenêtre élargie vers les routes héritées et
contrôlent l'enveloppe explicite Rust agentique.

CONTINUITY sans fonctions par défaut a été exécuté séparément :
`cargo test -p genos-orchestrator --no-default-features --locked --offline --test mission_protocol_continuity -- --test-threads=1`.
Le reçu `hierarchical-featureless-h2-final1.json` confirme exit 0,
huit tests passés, aucun échec ni ignoré, avec les mêmes 23 sources
inchangées. La période UTC est 08:44:27.352380 à 08:44:38.270402 ;
le journal a pour SHA-256
`64bc6d75f6b5fbacaa692a00e9e9f5d7cdc2668d71367b3d16d312d890616f29`.

La commande distincte `npm.cmd test` est terminée avec
`exit_code: 0` et `wrapper_exit_code: 0`. Le reçu
`npm-evidence/hierarchical-agentic-npm-h2-20261104-093236-cfaf8598aa1b482fb27103a97bb0efa0.json`
confirme la même carte H2 des 23 sources avant et après,
`unchanged_sources: true` et le même binaire épinglé
`e270f7d643f5f13fee0f64548c0dc573fb85cc85145c57eb3a1b594b9e8e4828`.
La période UTC est 08:32:37.8769497 à 08:57:22.2778264.
La chaîne atteint `test:inventory-composition` et termine
`Inventory composition: 14/14 suites PASS.` ; le garage a passé
ses huit cas. Le SHA-256 du journal est
`d9f0915335d8ac417c489b86759354e4b0dab3d901c0db53a00f56f7ff68e3cc`,
celui du reçu
`6069fffaea02fc61d71d04db7c8339d50f3ff097415826edd24593c7387c7d19`.

### Contrôle de livraison post-commit

Après création des huit commits, l'auditeur externe
`hierarchical-agentic-delivery-audit.py` vérifie la chaîne exacte depuis
la base, les huit plans et reçus, les arbres finaux et la propreté
de l'index et du worktree. Il exige les 23 sources H2 exactes,
les quatre reçus terminés, leurs journaux et le pin, puis relit
les snapshots immuables et les preuves réelles. Il rehash aussi
les quatre essais négatifs H1 et les archives de l'annulation.

La sélection finale est
`hierarchical-agentic-delivery-selection-h2.json` dans l'area de
qualification. Le helper `hierarchical-agentic-delivery-prepare.py`
n'écrit un nouveau `hierarchical-agentic-delivery-manifest-h2.json`
qu'après réussite de ces contrôles. Le résultat de livraison
et ses empreintes sont ceux de ce manifeste externe, relu par
`verify-manifest` ; cette description de procédure ne certifie pas
à elle seule la création des commits ni l'exécution de l'audit.

## Essai H2 réel — qualification stricte positive et rejeu

| Mission | Résultat observé |
| --- | --- |
| `16583b85-1adc-4e59-a829-be2a1a8b6d25` | **Qualifié strictement** : premier CLI `completed` exit 0 et rejeu `completed` exit 0, sans nouvel effet |

Le premier processus termine en 189,515 s et le second en 54,688 s.
Le modèle est `qwen2.5:14b`. L'admission réelle porte une fenêtre de
600 000 ms, un budget cumulé de 570 000 ms et des tours limités à
120 000 ms, sous le plafond HTTP natif inchangé de 180 000 ms.
La réserve protégée est de 28 500 ms. Le binding et son échéance
restent identiques au rejeu : aucun bail n'est prolongé.

Le pin H2 est
`e270f7d643f5f13fee0f64548c0dc573fb85cc85145c57eb3a1b594b9e8e4828`,
lié aux 23 sources du gel
`f176212c09f44fa78388b87d7a1c5a2747ebdd031d27e115dd612f1cd5c1555a`.
Les snapshots, les rapports CLI bruts et le manifeste ont été relus
indépendamment, en mode SQLite immutable.

Les preuves établissent 13 observations HTTP d'inférence, 11 reçus
d'outils, quatre affectations, quatre tâches CAS et quatre retours
physiques, dans huit vagues jointes. Les cinq acteurs logiques sont
la racine, deux parents intermédiaires et leurs deux feuilles. Les
parents intermédiaires et les feuilles ont chacun partagé une vague ;
le pic de workers Rust est de deux. Cela ne prouve ni chevauchement
HTTP réel ni calcul simultané des générations par le fournisseur.

La racine a effectivement lu son objet privé `final` par
`read_artifact`. Les 366 octets de cet objet correspondent au texte
du modèle terminal et à la tête publiée, SHA-256
`1b533017ffcdad536eeb2f056fb8fac72253a399c3e530f47d53aff2aa135936`.
Les tâches, activations MORPH, reçus natifs, contextes consommés,
retours CAS, effets CONTINUITY et clôture EVIDENCE sont liés aux
mêmes identités et à l'admission.

Le registre conserve 14 288 tokens, treize appels modèle, onze outils
et 69 041 ms cumulées ; `held` est nul,
`unknown_operations: 0` et `released: true`.
Le temps cumulé enregistré agrège les mesures d'inférence et d'outils ;
il ne se confond pas avec la durée totale du processus CLI.

Le rejeu n'ajoute aucune ligne, observation, vague, effet ni coût.
Ses métriques sont `waves_prepared: 0` et
`peak_active_step_workers: 0`. Les snapshots initial et post-rejeu
ont le même SHA-256
`c5af21d06e19747167d2e622b26ef0aa1be39d112bcf6caf7135d96b352c6f25`.

Les preuves sont conservées sous
`D:/GenOS-Codex-Temp/rust-agentic-hierarchical-20261104/trials/16583b85-1adc-4e59-a829-be2a1a8b6d25/` :

- manifeste de 109 fichiers :
  `9632a701bc0de86cc6404e89eda1aa37537a21f8b2deaf59d0da24b7640b3e8e` ;
- preuve primaire :
  `de51a9f491420a98c33f9f1e9631ba0335cb3f546afc280550ef256d4aa9dd2e` ;
- contrôle indépendant `hierarchical-agentic-live-h2-independent-result.json`
  dans l'area de qualification, SHA-256
  `e0e3f8c8a3688e8199410589a7ed13ba04e8cac5ae72860448cb3ba8643fe33c`.

La portée reste `artifact_contract_verified`, avec
`semantic_truth_verified: false`, `promotable: false` et
`external_effects_authorized: false`.
Ce succès contrôlé sous de nouvelles conditions d'admission ne
reclasse aucun des quatre essais H1. Il ne démontre pas que la fenêtre
explique à elle seule la différence de résultat. Les suites globales
et l'audit final des huit commits restent des vérifications distinctes.

## Historique H1 — contrôles terminés et quatre essais négatifs

Les contrôles suivants portent uniquement sur le gel H1 à 21 sources,
empreinte
`5b2602d180ad46f67faec6c56305701d63e6af773ff68fd8f42ddd152e67921d`.
Ils ne valident pas les changements de durée H2.

| Vérification H1 | Résultat historique |
| --- | --- |
| Unités orchestrator | **162 passés, 0 échec**, exit 0 |
| Runtime HTTP hiérarchique | **4 passés, 0 échec**, exit 0 ; 154,93 s |
| CLI native | **4 passés, 0 échec**, exit 0 ; 330,03 s |
| CONTINUITY sans fonctions par défaut | **8 passés, 0 échec**, exit 0 ; 0,29 s hors compilation |
| Qualité globale | **8 822 sources, 0 violation**, exit 0 |
| `cargo test --workspace` H1 | Exécution annulée pour supersession H2 ; reçu exit 1, aucun succès global revendiqué |
| `npm test` H1 | Aucun reçu de succès global H1 certifié ici |
| Essais réels H1 | **Quatre qualifications strictes négatives**, aucun rejeu après refus |

L'exécution globale Rust H1 a été volontairement interrompue après
décision de requalifier la nouvelle source H2. Le reçu conserve
`exit_code: 1` et `unchanged_sources: true`. Cette annulation n'est
ni un passage du workspace ni une preuve d'échec de régression.
La décision d'arrêt est conservée dans
`hierarchical-rust-final1-cancellation.json`, SHA-256
`2b61fe321011195dd01abd54223f7755f57b9e1f8b6c09414036867c2ffc5572`.
Le reçu du wrapper `hierarchical-rust-final1.json` a pour SHA-256
`3e89c28358991d0a24cf4273fb252ae1cc7e09a799fee52db8008b404b78285d`.

## Reçus H1 historiques

Les cinq commandes ont conservé les mêmes 21 sources Rust, empreinte
`5b2602d180ad46f67faec6c56305701d63e6af773ff68fd8f42ddd152e67921d`.
Leurs wrappers enregistrent `status: completed`, `exit_code: 0` et
`unchanged_sources: true`.

- `cargo test -p genos-orchestrator --features native-llm --locked --offline --lib` :
  162 tests passés, aucun échec ; le journal
  `hierarchical-unit-attempt1.log` a pour SHA-256
  `04be04ef9d660fc3a74c2031e3d0998544e9034842d7b0649311d2acada9986c`.
- `python scripts/ci/check_code_quality.py` : 8 822 sources vérifiées,
  aucune violation ; le journal `hierarchical-quality-attempt1.log` a pour SHA-256
  `4fa999b18ebe21be7078d099681b47eab57ed2184d03ef0074fab691241e7bae`.

- `cargo test -p genos-orchestrator --features native-llm --locked --offline --test agentic_hierarchical_runtime` :
  4 tests passés, aucun échec, en 154,93 s ; le journal
  `hierarchical-runtime-attempt1.log` a pour SHA-256
  `985b3fa2e52bdc4cad50c6869f3ecfe96496bec65404b55a3d7e44c2d65fef9f`.

- `cargo test -p genos-cli --locked --offline --test rust_agentic_hierarchical_mission` :
  4 tests passés, aucun échec, en 330,03 s ; le journal
  `hierarchical-cli-attempt1.log` a pour SHA-256
  `fa2c455dc001aec7877e6836effb87a13c6b456133ffe9a1a4ed2b55a7e7fa31`.
- `cargo test -p genos-orchestrator --no-default-features --locked --offline --test mission_protocol_continuity -- --test-threads=1` :
  8 tests passés, aucun échec, en 0,29 s hors compilation ; le journal
  `hierarchical-featureless-attempt1.log` a pour SHA-256
  `35b15e5b50a52ef853762ab08da003f276a86ac068274e578b868d3d64ccdf4d`.

Les journaux et leurs reçus JSON sont conservés sous
`D:/GenOS-Codex-Temp/rust-agentic-hierarchical-20261104/`.
Ces preuves décrivent les commandes achevées ; les validations globales
Rust et Node et la qualification du modèle réel restent distinctes.

## Procédure et conditions H2

L'observation de l'essai 4 motive une fenêtre d'admission plus longue
pour ce profil, sans démontrer une durée universelle du modèle.
H2 accepte au plus 600 000 ms pour une mission Rust dont la configuration
réelle possède `orchestration.hierarchy`. Les profils statique et
dynamique plat restent plafonnés à 180 000 ms. Le parsing CLI élargi
doit être suivi du contrôle de route et de la validation du type réel
de configuration avant admission.

Le budget `limits.wall_ms` doit rester inférieur ou égal à la fenêtre
admise ; une configuration typique déclare 570 000 ms pour une fenêtre
de 600 000 ms. La réserve protégée demeure de 5 %. Chaque HTTP garde
un maximum de 180 000 ms, ainsi que les bornes plus petites imposées
par son contexte, le budget restant et le bail. Cette évolution ne
modifie ni les droits, ni les reçus, ni les critères du contrat final.

Les anciennes missions H1 gardent leurs échéances et leurs états
inconnus. Leurs baux ne sont pas prolongés ; leurs expositions ne sont
ni libérées ni interprétées comme une consommation nulle. Un essai H2
demande une nouvelle admission, un nouveau pin et des conditions
explicites. Les comparaisons doivent signaler que la fenêtre et le
budget cumulé ont changé.

Avant un nouvel essai H2 sont requis le gel intégral des 23 sources, la
compilation du binaire, les contrôles préalables prévus, le pin vérifié
et une autorisation explicite. La certification finale exige aussi les contrôles
globaux Rust/Node terminés avec exit 0. Les huit commits, les arbres Git, les
journaux et leurs sorties, le pin et le snapshot réel doivent concorder.
La carte de sources exigée est l'ensemble déclaré, pas un sous-ensemble
de fichiers H1 restés identiques.

Les quatre validations globales et l'essai H2 décrits ici sont
vérifiés ; la certification de livraison post-commit reste distincte. Une fenêtre de dix minutes
ne garantit ni émission structurée
d'outils, ni réponse du fournisseur, ni respect du contrat final, ni
indépendance des méthodes de vérification.

## Frontières soumises à vérification

Le contrat admet au plus huit rôles, une largeur au plus égale à quatre,
une profondeur de un à quatre et au plus quatre enfants directs par
parent. Chaque rôle hors racine possède un parent admis unique et peut
être activé une fois. Les agents n'acquièrent aucun outil par leur tâche.

Les contrôles ciblés doivent établir les faits suivants :

- **MORPH** lie l'activation d'un descendant à son appel natif, son parent
  autorisé et ses ancêtres effectivement activés.
- **OMEGA** conserve les intentions, observations et reçus réels ; le
  rejeu ne relance pas une opération dont l'issue reste inconnue.
- **ALLOSTASIE** conserve les coûts partagés, les expositions et la
  réserve protégée dans tous les niveaux de l'arbre.
- **SYNAPSE** reconstruit pour chaque parent son propre préfixe local,
  sa tâche entrante et les retours de ses seuls enfants directs.
- **GQWF Exchange** rehashe les copies CAS des tâches et retours dans
  l'espace du destinataire effectif, sans accès transitif implicite.
- **CONTINUITY** refuse une succession avec descendant ou retour en
  attente, même après règlement des coûts et clôture des vagues.
- **EVIDENCE** ferme la totalité des affectations acceptées et des
  observations réellement consommées avant la publication atomique.

Une injection SQLite au reçu de publication, après la mise à jour de
tête dans la transaction, doit laisser la tête, OMEGA, le run et le reçu
dans leur état précédent. Après retrait de l'injection, la reprise doit
utiliser les observations connues et conserver les coûts.

## Essai réel

### Essai 1 — terminé, qualification stricte négative

| Mission | Résultat observé |
| --- | --- |
| `b13f9634-f2bd-4753-ac0b-128280db5b43` | CLI exit 0, `completed`, mais **non qualifié** par le critère expérimental strict ; aucun rejeu exécuté |

Le modèle local `qwen2.5:14b` n'était pas résident avant la mission.
L'exécution a duré 178,515 s et a réellement conservé 13 observations
modèle, 9 reçus d'outils, quatre affectations, quatre tâches CAS, quatre
retours et huit vagues jointes, avec un pic de deux workers Rust.
La consommation observée est de 14 130 tokens et de 118 065 ms cumulées ;
les expositions sont nulles, aucune opération n'est inconnue et le pool
est libéré. Ce temps cumulé n'est pas un temps de calcul parallèle prouvé
du fournisseur.

La raison exacte du refus strict est :
`Root written final artifact differs from published model text`.
L'artefact privé `root/final` contient 638 octets, SHA-256
`d0365dd3148d64085ec1a65f55e32ef63910e34ec3ef59b715ef61c7cdc1ee7f`.
Le texte effectivement publié contient 1 156 octets, SHA-256
`2d7bcb229f66c52deb2ccc92c042cde5e5f05d65bec12e3978af6c2fc8b44dc9`.

L'égalité exacte entre cet objet CAS privé et le texte final est un critère
expérimental supplémentaire de cet essai. Le runtime autorise par
conception un texte terminal différent d'un artefact privé ; cette
observation ne constitue donc pas, à elle seule, un défaut du mécanisme
de publication. Elle ne permet pas non plus de reclasser l'essai en
réussite : `qualified: false` reste conservé, sans rejeu après ce refus.

La vérification indépendante a relu les snapshots SQLite avec
`mode=ro&immutable=1`, les événements originaux, l'admission, les corps
HTTP UTF-8, les contextes consommés, les coûts et les copies des quatre
arêtes : `root→mid_left`, `root→mid_right`,
`mid_left→leaf_left` et `mid_right→leaf_right`.
Le snapshot initial et le snapshot final ont le même SHA-256 :
`b51e22d52bb560ec521cce77174b96bd3091f8ab3e52b4964737677df9b7e18e`.
Les diagnostics secondaires d'encodage Windows ne sont pas utilisés
pour les hashes et tailles rapportés ici.

Les preuves sont conservées sous
`D:/GenOS-Codex-Temp/rust-agentic-hierarchical-20261104/trials/b13f9634-f2bd-4753-ac0b-128280db5b43/` :

- manifeste : `245b5bd1ba4af9ef43578584325c3c9deb42b6fda41d5aab271c7291002eaccc` ;
- preuve primaire : `e76a1a41446e816fc8c0f997fbdb368f4d65b86f96e004c12afeabc9ccf5eeea` ;
- contrôle indépendant : `hierarchical-agentic-trial1-independent-result.json`
  dans l'area de qualification, avec verdict strict maintenu négatif.

Le binaire utilisé est figé au SHA-256
`50c799e480a5ccb1c04fc5345b53be0af4b7c342a84aa842973d2f5fe1bfaeab`.
### Essai 2 — issue de transport inconnue, qualification négative

| Mission | Résultat observé |
| --- | --- |
| `82b5aab9-8fec-4fd9-9b8b-d6f5b4506105` | CLI exit 1, `unresolved`, **non qualifié** ; aucun rejeu après ce refus |

La variante V2 n'a changé que l'instruction admise de la racine. La
comparaison JSON des deux configurations ne relève que
`/agents/4/instruction` ; le code, le pin, les quotas, les méthodes et
les contrôles stricts restent identiques.

L'exécution dure 101,516 s. L'erreur primaire du rapport natif est
`OutcomeUnknown: NATIVE_LLM_TRANSPORT_OUTCOME_UNKNOWN`. Les opérations
`mid_left/0` et `mid_right/0` restent `unknown` ; leurs échecs
conservés portent respectivement 66 804 ms et 66 478 ms, avec
`response: null` et `response_body: null`. Ces données ne permettent
pas de conclure que le fournisseur n'a rien exécuté ou consommé.

Seule la réponse de la racine est connue. Elle a enregistré deux
affectations et deux tâches CAS vers les parents intermédiaires.
Aucune feuille n'a été appelée, aucun retour n'a été livré et aucune
complétion ni publication n'a été créée.

Le registre conserve dans `spent` 802 tokens confirmés, trois appels
modèle — dont les deux à issue inconnue —, deux outils et 155 685 ms
cumulées. Il retient dans `held` 18 432 tokens, deux appels et
139 096 ms d'exposition. `unknown_operations: 2` et
`released: false` sont conservés. Les 802 tokens connus ne représentent
pas une mesure finale des deux opérations sans réponse ; leur coût
inconnu n'est jamais assimilé à zéro et leurs réserves ne sont pas
recréditées.

L'auditeur expérimental produit ensuite
`Seven actual native protocol journals missing`, car son contrôle des
journaux de succès précède son traitement du cas non résolu.
L'absence d'un événement EVIDENCE de succès est cohérente avec le refus
de publication. Cette erreur secondaire de qualification ne remplace
pas l'erreur primaire de transport et ne prouve pas sa cause.

La vérification indépendante a relu le snapshot cohérent avec
`mode=ro&immutable=1`, les identités et hashes des intentions et échecs,
les événements originaux, les effets CONTINUITY encore ouverts et les
deux copies CAS. Les montants dépensés et conservés correspondent aux
mesures et expositions persistées.

Les preuves primaires restent sous
`D:/GenOS-Codex-Temp/rust-agentic-hierarchical-20261104/trials/82b5aab9-8fec-4fd9-9b8b-d6f5b4506105/` :

- manifeste : `3f94be22d1b0dbba8c3eb96922a5a2499d3c54ac8d711cc775813bc836cdd349` ;
- preuve primaire : `9c460c25d5265d4758731265cee13353d520038d467e827b4f7fc9a8f7e16194` ;
- snapshot : `1a66323af9fcf2f41990f6ed731b945fcca0d004cb37ffeab09b09c0ead508d1` ;
- contrôle indépendant : `hierarchical-agentic-trial2-independent-result.json`,
  SHA-256 `cb9c61d4faefe6695c8477c7e88ae242a78efd7b4679a6b4c9a8dd8ee943db69`.

Aucune attribution causale n'est établie. L'état de modèles observé
ultérieurement par une requête fournisseur, les journaux Windows et la
présence d'autres processus constituent des observations distinctes ;
ils ne suffisent pas à expliquer cet échec. Les hypothèses diagnostiques
restent à distinguer de leurs preuves. Ce diagnostic H1 ne vaut
pas preuve des validations globales H2 présentées en tête de page.

### Essai 3 — pseudo-appels dans la prose, qualification négative

| Mission | Résultat observé |
| --- | --- |
| `f8490caf-4269-4f12-a444-09c07143324c` | CLI exit 1, `unresolved`, **non qualifié** ; aucun rejeu |

Cet essai utilise le modèle local déjà installé `qwen2.5-coder:7b`,
non résident avant son lancement et sans warmup. La comparaison de sa
configuration avec V2 ne révèle que `/provider/model`.
Le code Rust, son empreinte H1, le pin `50c799e4…bfaeab`, les quotas
et les contrôles causaux restent identiques.

Le modèle a répondu en 16,891 s pour la commande CLI, avec une observation
native de 11 775 ms. Le corps HTTP, le fournisseur de la requête et le
modèle déclaré dans la réponse sont liés à l'admission :
`qwen2.5-coder:7b`. Les auditeurs V3 conservent les contrôles stricts
et ajoutent cette égalité de modèle effectif ; les versions antérieures
et leurs preuves restent intactes.

La réponse contient deux objets JSON textuels nommant `delegate_task`,
mais le champ structuré `tool_calls` de la réponse native est vide.
Le runtime conserve ce texte comme candidat de 245 octets, SHA-256
`7c6dd88094008487af0166944c670e14812188e58c969a864832deab85f91420`.
Il ne transforme pas la prose en appels d'outils : aucune affectation,
aucun enfant, aucun outil, aucun artefact privé et aucune publication
n'ont été créés.

L'erreur primaire est `AGENTIC_FINAL_CONTRACT_UNRESOLVED`.
Les deux méthodes installées refusent les littéraux requis du contrat
final. Le registre conserve 799 tokens — 729 d'entrée et 70 de sortie —,
un appel modèle et 11 775 ms, avec `held: 0`,
`unknown_operations: 0` et `released: false`.
Le tour natif de la racine est clos et sa vague jointe ; cela ne rend
pas la mission ni le contrat final acceptés.

L'auditeur expérimental conserve ensuite l'erreur secondaire
`Seven actual native protocol journals missing`.
Cette vérification de succès ne doit pas masquer le refus primaire
du contrat final. L'essai ne fournit aucune preuve positive de
délégation hiérarchique réelle et n'établit pas à lui seul un défaut
du code Rust.

Les preuves figées sont sous
`D:/GenOS-Codex-Temp/rust-agentic-hierarchical-20261104/trials/f8490caf-4269-4f12-a444-09c07143324c/` :

- manifeste : `d24d884185e2808f006aa5996f3fec63a7444f5acb29b81b5ac58474d9f7ff28` ;
- preuve primaire : `def80cda7ed015aca7000b021684b0ef706decb94ae164f422c9142f865431c4` ;
- snapshot : `e41d7ecee5353dbad1c636db6d8cd01a1ae8c5d4284a13599d7d3bd7b8a34404` ;
- contrôle indépendant : `hierarchical-agentic-trial3-independent-result.json`,
  SHA-256 `b6c4914673cf79e1679739d0cb6d0587805114931b8f76d778d76d92c45b0e5b`.

Les trois premiers manifestes restent entièrement rehashables : 103 références
pour V1, 39 pour V2 et 35 pour V3. Le quatrième essai H1, autorisé
séparément, est décrit ci-dessous.

### Essai 4 H1 — expiration du bail, arbre partiel conservé

| Mission | Résultat observé |
| --- | --- |
| `2cae1997-73d5-4780-b288-dabfda8d6a45` | CLI exit 1, stderr `MISSION_LEASE_EXPIRED`, aucune sortie JSON de résultat, **non qualifié** ; aucun rejeu |

L'essai réutilise exactement la configuration V2 14b, SHA-256
`740721eefc1efee40a010100e51754041f6ab3d0aa58a9ef94b067f73eb4be00`,
le code H1 et le pin `50c799e4…bfaeab`.
Les contrôles de modèle effectif sont ceux des auditeurs V3.
Le modèle n'était pas résident avant la mission. Le CLI se termine
après 184,656 s avec une échéance admise de 180 000 ms.

Le snapshot conserve neuf observations connues et deux opérations
`unknown`, sur `mid_left/2` et `mid_right/2`, sans réponse ni corps
conservé. Les quatre affectations et tâches CAS sont authentiques.
Les deux feuilles sont terminées ; leurs deux retours ont été copiés
et consommés par leurs parents avant l'écriture des résumés privés.
Les parents et la racine ne sont pas terminés et aucune publication
n'a été créée.

Le registre conserve 7 298 tokens confirmés, onze tentatives modèle,
huit outils et 117 136 ms cumulées dans `spent`.
Il retient 18 432 tokens, deux appels et 81 864 ms dans `held`,
avec `unknown_operations: 2` et `released: false`.
Cinq vagues sont jointes et une reste active ; dix-sept effets
CONTINUITY sont terminés et deux restent ouverts.
L'audit indépendant a validé les onze contextes et les copies réellement
présentes, sans fabriquer les deux retours manquants vers la racine.

L'erreur primaire est celle du CLI : `MISSION_LEASE_EXPIRED`.
L'auditeur expérimental échoue ensuite sur le rapport JSON absent
avec `TypeError("'NoneType' object is not subscriptable")`.
Cette erreur secondaire ne produit aucune qualification et ne
remplace pas l'observation d'expiration.

Les preuves figées sont sous
`D:/GenOS-Codex-Temp/rust-agentic-hierarchical-20261104/trials/2cae1997-73d5-4780-b288-dabfda8d6a45/` :

- manifeste : `22d32f1f5bc2851599bd8e796487f7f1f049fae1d4b4bd3a14690d509eddbf2e` ;
- preuve primaire : `69fcbe664cb05aed96eb757ba42ff11b4a2be2964cf8a25dce59b86548555268` ;
- snapshot : `19ad0f5d16059f1f3d83b57ce4521cf31b9dbea90779c41f92a5236a3f12f279` ;
- contrôle indépendant : `hierarchical-agentic-trial4-independent-result.json`,
  SHA-256 `5250b877030c38bce924234a13cb1f4d3c2366285e7cd340e7bfdb3caf5723c7`.

Les quatre manifestes H1 et leurs résultats négatifs sont conservés.
Les observations de charge ou de modèles présents sur l'hôte
n'établissent pas une cause générale. L'évolution H2 doit être évaluée
dans ses nouvelles conditions, avec un autre gel et un autre pin ;
elle ne requalifie pas rétroactivement ces essais.

## Portée des conclusions

Les méthodes de contrat sont deux vérifications déterministes locales sur
le même hôte. Une publication acceptée atteste le contrat structurel de
l'artefact et la fermeture de ses preuves, avec
`semantic_truth_verified: false`, `promotable: false` et
`external_effects_authorized: false`.

Le stockage et les callbacks opérateur restent de confiance. Les hashes
lient les données et la provenance ; ils ne remplacent pas une
authentification distante. Les résultats historiques des profils
séquentiel, parallèle et dynamique plat demeurent des qualifications
distinctes.
