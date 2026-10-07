# Studio — suivi de la parité

- **Statut** : Programme en cours ; aucune parité globale revendiquée.
- **Dernière revue** : 2026-10-07.

## F02 — Base et risques de consolidation

La reprise part du worktree propre `codex/studio-completion` à `6a3c7b6f`.
Son ancêtre commun avec `v3` est `b7e39894` ; `v3` est observée à
`ed9af6fa`. Le checkout principal contient des modifications opérateur
MCP/VFS et des fichiers non suivis. Il n'est ni restauré ni fusionné.

La branche isolée conserve les huit lots Studio. Cette décision ne signifie
pas que ses dépendances sont à jour avec tous les travaux de `v3`.

| Zone divergente | Risque | Stratégie avant intégration finale |
| --- | --- | --- |
| Studio HTML/JS/CSS et README | Main conserve un client différent, dont pagination | Adapter les parcours explicitement ; aucun remplacement aveugle |
| package.json backend et dépendances | Scripts et versions évoluent des deux côtés | Fusionner par clé, vérifier lockfile et installation |
| Fixtures B06 et productProofRoutes | Assertions main ne ciblent pas toutes les vues modulaires | Qualifier les parcours de cette branche ; réconcilier les deux harnais |
| consumerInspectionService et contrôleur | Pagination et contrat des listes évoluent | Choisir le contrat versionné après audit |
| CLI/env/runtime/VFS/MCP | Autorisation, timeout et exécution changent | Ne pas importer du dirty checkout ; requalifier au futur merge |
| ADR et index | Plusieurs documents 0348, nouveau 0349 dans main | Réserver 0350 Studio ; générer l'index sans renommer les chemins |
| Manifeste expérimental GVX | Main apporte des primitives utiles au laboratoire | Relier après qualification, ne pas créer un contrat concurrent |

Les commandes de diagnostic sont `git status --short`, `git log -8 --oneline`,
`git merge-base HEAD v3` et `git diff --name-only HEAD...v3`.
L'audit est un constat ponctuel : les autres travaux peuvent continuer.
L'intégration finale sera un point séparé, avec résolution et tests.

## Registre des points

| Point | État | Preuve / limites |
| --- | --- | --- |
| F01.1 Matrice | Livré : aad3bf6b | Tous les lots F/C/S recensés ; benchmark concurrentiel non exécuté |
| F02.1 Base isolée | Livré par ce document | Git inspecté, checkout opérateur conservé |
| F03.1 Contrats | Livré : ADR 0350 | Frontières UI/API/runtime, routes et sessions |
| F04.1 Harnais | Qualifié Windows | Port attribué par l'OS, origine exacte, résultat structuré ; Edge 154.0.4258.62, aucune erreur de page |
| F04.2 Contrat du benchmark | Qualifié par tests ciblés | Fixture positive vérifiée ; absence/échec/incomplétude refusés, service inchangé |
| F04.3 Contrat d'argumentation | Qualifié par tests ciblés | Invoker `context`, revue plate, identifiants persistés ; arguments et labels réellement assertés |
| F04.4 Gate élargi | Non qualifié | Échec du bridge d'organisation, reproduit isolément ; aucun contournement |
| C01.1 Navigation | Qualifié Windows | Connexion séparée, contexte compact, cinq routes, liens de run et historique |
| C02.1 Composants | Qualifié Windows, partiel | Fiches gestion/laboratoire, champs autorisés, inconnus et garanties fausses ; JSON secondaire |
| C02.2 Réponses et provenance | Qualifié Windows, partiel | Fiches de réponse, cible/sécurité de restauration et empreintes ; JSON replié, effacement à la déconnexion |
| C03.1 Responsive et clavier | Qualifié Windows, partiel | Cinq vues 390/1440 px, texte 200 %, labels et focus ; audit WCAG/lecteur d'écran non exécuté |
| C04.1 Onboarding | Qualifié Windows, partiel | Guide de première lecture, session vs sélection, repli automatique et état vide de lignée |
| Autres C/S | Planifiés / partiels selon matrice | Aucune clôture implicite |

## Limites de l'outillage

La recherche MCP GenOS des échecs antérieurs a réussi. Le checkpoint
`genos_snapshot` demandé avant les modifications a expiré après 120 secondes.
Le fichier `studio-parity-start.json` attendu dans la session est absent.
Ce checkpoint n'est donc pas une preuve acquise. La décision de base isolée
est persistée sous `decision-dbd96b47-212a-4d27-b3db-a2dc03f09d4b`, sans
promotion. Les commits et résultats exécutables restent les preuves locales.
L'activation effective des hooks n'est pas attestée.

## Preuves de la première tranche

F04 : `npm --prefix backend run test:studio:browser` a réussi sur la
base SQLite isolée, avec approbation réelle, refus tenant, reconnexion SSE,
conflit éditeur, restauration, protocole, rejeu et annulation.
Le démarrage Edge dans le sandbox Windows a échoué ; la relance autorisée
hors sandbox a réussi. Les artefacts sont sous
`.genos-tests/studio-parity-proof/`, jamais une preuve Linux.

Pour chaque point : vérifier qualité, exécuter les tests concernés, conserver
captures/versions dans un répertoire ignoré et mettre à jour ce registre.
Les gates obligatoires ont été réexécutés ; résultats ci-dessous.
Une validation Windows ne qualifie pas Linux/Docker ni un fournisseur réel.

F04.2/F04.3 : les deux fixtures historiques sont alignées avec les services
inchangés. La fixture biologique ne confond plus couverture sémantique et
vérification d'état. La fixture d'argumentation lit le contexte public, renvoie
la revue à plat et cible les identifiants persistés générés par le service.
Elle exige désormais une agrégation grounded, des arguments SUPPORT/ATTACK
persistés et des labels IN/OUT, avec une issue non résolue. L'absence
d'agrégation n'est plus un simple message de log suivi d'un succès.
Les jugements et reçus du vérificateur restent injectés pour ce test ; aucune
preuve de sécurité réelle ni indépendance de fournisseurs n'est revendiquée.

C01.1 : tests unitaires routes/client réussis et parcours navigateur enrichi
réussi sous Edge 154.0.4258.62 : historique avant/arrière, rechargement de lien
profond sans session, lecture après authentification, refus de run introuvable,
contexte tenant inchangé et absence de stockage de clé. Aucune erreur de page.
Le lien d'un workflow, d'un job ou d'un fichier sera qualifié avec son lot.

C01.2 : le navigateur normalise également les paramètres URL non supportés,
préserve la route lors du lien d'évitement et efface le run précédent sur
changement de scope. Test navigateur réussi avec une fausse clé dans l'URL,
jamais avec un secret réel. Le contrôle de session partagé réduit la
complexité de navigation sans modifier ses contrôles.

C02.1 : tests unitaires des projections réussis ; parcours navigateur réel
réussi avec inspection de job et comparaison depuis les fiches, inspecteur
technique fermé. Les autres sorties ont ensuite été traitées en C02.2.

C02.2 : réponses de gestion/recherche, provenance mémoire et restauration
utilisent les mêmes projections métier. Les champs de l'enveloppe restent
visibles même lorsqu'elle contient des listes ; snapshots cible, restauré et
de sécurité disposent de fiches distinctes. Tests unitaires et navigateur
réussis, dont réponse de protocole sans exécution, restauration physique et
effacement de toutes les nouvelles fiches à la déconnexion. Les diagnostics
d'exploitation et l'édition du dossier d'approbation restent techniques.

C03.1 : dix captures desktop/mobile et tests de largeur des cinq vues,
identifiant long, texte agrandi à 200 %, contrôle des labels et focus
du titre après navigation. Les colonnes et valeurs longues se replient.
Ce contrôle DOM ne remplace pas un audit complet d'accessibilité,
une vérification de contrastes ni un test avec lecteur d'écran.

C04.1 : projection unitaire du guide et parcours navigateur réussis.
Le guide distingue sélection renseignée, session authentifiée et dossier chargé.
Il ne lance aucun effet externe. Après première lecture il se replie ; les
diagnostics restent une action explicite de Gestion. Les templates exécutables
et le provisioning guidé seront des sous-points suivants.

Voir [la matrice](studio-parite-plan.md) et
[la qualification des huit lots](studio-qualification.md).

## Gates exécutés à la clôture de la tranche

| Commande | Résultat observé |
| --- | --- |
| `python scripts/ci/check_code_quality.py` | Exit 0 ; 5402 sources, 105 dettes existantes, aucune nouvelle violation |
| `npm test` | Exit 0, relance finale après les fiches C02.2 ; biologie/backend/garage |
| `cargo test --workspace --offline -j 1` | Exit 0 ; compilation et tests du workspace, avertissements existants |
| `npm --prefix backend run test:studio` | Exit 0 ; 11/11 suites sur win32 |
| `npm --prefix backend run test:studio:browser` | Exit 0 ; Edge 154.0.4258.62, cinq vues, erreurs de page vides |
| Tests benchmark biologique, argumentation et invocation de membres | Exit 0 ; services non modifiés |
| `npm --prefix backend run test:validation` | Exit 1 dans `test_dynamic_organization.js:109`, après dépassement des fixtures corrigées |
| `node backend/tests/test_dynamic_organization.js` | Exit 1 reproduit : sortie vide du bridge, parsing JSON impossible |

Les tests Node utilisent des bases par suite sous `.genos-tests/`, et les
fixtures de parcours créent leurs propres bases/workspaces temporaires.
Les lancements de sockets et Edge nécessitent l'exécution autorisée hors
sandbox Windows. Le target Rust existant du dépôt principal a servi de cache,
sans suppression de fichiers ni de caches tiers. L'échec initial de compilation
native en sandbox n'est pas compté comme un succès.

Dix captures desktop/mobile des vues, capture de navigation et reçu
`studio-qualified.json` sont dans `.genos-tests/studio-parity-proof/` (ignoré).
Les captures de laboratoire et d'inspection ont été inspectées visuellement.
Les avertissements de télémétrie SQLite dans certaines fixtures restent
visibles ; une suite réussie ne signifie pas que tous les logs sont exempts
d'erreurs. Aucun artefact généré, base ou secret n'est commité.

## Reprise

1. Fermer F04.4 : diagnostiquer le cycle d'entrée du bridge orchestration,
   dont `executeMission` est déclaré mais n'est pas appelé par le script
   observé ; qualifier sorties et refus sans lancer de mission opérateur.
   Ne pas remplacer la sortie vide par un succès ni désactiver le test.
2. Achever C02–C04 : formulaires typés, ergonomie des dossiers d'approbation,
   audit complet d'accessibilité, templates/provisioning guidés.
3. Passer à J2/C05–C12 : catalogue versionné, workflows, playground,
   prompts/modèles/outils/déclencheurs/RAG, avec preuves backend et UI.
4. Poursuivre J3–J7 selon la matrice ; benchmarks concurrentiels, domaines
   spécifiques et qualification Linux/Docker restent ouverts.
5. Auditer puis intégrer les divergences avec `v3` dans un point dédié ;
   aucune fusion ni push n'a été effectué dans cette tranche.

Le retour d'expérience GenOS est persisté sous
`ef2354db-2d43-408c-82dd-167fe3b81f47`. Il conserve les observations fournies,
sans les certifier ni accorder de promotion. Le programme global reste ouvert.

## Intégration avec v3 — 2026-10-07

La fusion est préparée dans `codex/studio-v3-integration`, depuis `v3`
à `2a2aa0db`, avec `codex/studio-completion` à `5abc56c0`. Le premier parent
reste la base v3 ; les commits Studio sont conservés. Le checkout principal
n'est pas utilisé pour résoudre les huit conflits. Les index conservent les
deux familles de documents ; les identifiants ADR partagés sont désambiguïsés
par l'index, sans renommer les chemins scellés (430 entrées).

Le client modulaire conserve les parcours négatifs B06 de v3 : JSON invalide,
401/403/404/502, délai, réseau et double-clic. Lors d'une erreur serveur de
rafraîchissement, le dernier dossier reste affiché avec une actualisation
explicitement non confirmée. La pagination utilise le contrat serveur de v3,
avec transmission de l'offset, recherche filtrée, remise à zéro sur changement
de filtre et état vide. Le navigateur exerce 21 runs fixture via HTTP/SQLite.
Le contrôle de scope des assessments scientifiques reste celui du ledger P1
de v3, qualifié avec ses tests de refus, et non un contrôle UI concurrent.

Les tests Rust, les onze suites Studio, le navigateur Edge, les tests ciblés
P0/P1 et la relance finale de `npm test` réussissent. Le contrôle qualité
ne relève aucune nouvelle violation. Les artefacts sont dans
`.genos-tests/studio-merge-proof/`.

Deux conditions locales de v3 restent explicites :

- `mcpExecutor.js` référence `mcpExecutor/domainVerdict.js`, encore non suivi
  dans le checkout principal. Une copie temporaire, non incluse dans la fusion,
  a servi aux tests du worktree puis a été retirée. La fusion ne commite pas
  ce travail opérateur ; le fichier original principal reste intact.
- Le lock P0 scelle des empreintes CRLF, alors que les blobs Git des quatre
  assets sont LF. Les tests utilisent les mêmes fins de ligne locales que le
  checkout principal ; ni dataset ni lock ne changent dans la fusion. Un
  checkout LF neuf reste à corriger dans un point P0 dédié.

Le checkpoint du checkout principal a réussi et son fichier a été vérifié :
`snap-9cb24593beda41cc8891a20c0f36877c`. Ce checkpoint ne constitue pas une
certification du résultat fusionné. Des modifications concurrentes sont
apparues pendant la préparation, dont `backend/package.json` et
`docs/adr/README.md`, également modifiés par la fusion. L'avancement de v3 doit
attendre leur stabilisation et conserver ces changements non commités.

## Étape A — Cible unifiée fixée (2026-10-07)

L'opérateur demande « Étape A — Fixer la cible et commite ». Le
[contrat directeur](../03-reference/studio-contrat-directeur.md), version
`STUDIO-TARGET-V1`, et l'[ADR 0360](../adr/0360-studio-cible-unifiee-et-zones-de-livraison.md)
fixent la finalité, onze espaces, 21 zones Z00–Z20, 22 domaines GenOS,
douze exigences propres à Studio et huit parcours de livraison. Les 40
identifiants F/C/S historiques restent rattachés aux zones. Le registre exhaustif
entrée par entrée est l'étape suivante, pas un résultat revendiqué ici.

Le worktree Studio existant a été avancé par fast-forward de `8803fcf3` à
`69e9d07e55db1581b514989c448f131d731d7676`, sans inclure les écritures non
commitées du checkout principal. Cette étape ne change que la documentation.
Le checkpoint GenOS cognitif `snap-82f128f37ea645319b562cf9e97a6607` a été créé
et son fichier vérifié ; il n'est pas une sauvegarde des fichiers du worktree.

### Vérifications exécutées avant commit

| Commande / contrôle | Résultat et portée |
| --- | --- |
| `python scripts/ci/check_adr_index.py --update`, puis sans option | Index régénéré ; 440 fichiers, 440 entrées, zéro problème. |
| `python scripts/ci/check_code_quality.py` | Code 0 ; 5494 sources, zéro violation. |
| `git diff --check` | Code 0 ; aucun défaut d'espacement détecté. |
| Sonde Node documentaire via `node -e` | Code 0 ; liens relatifs des deux nouveaux documents, présence des N01–N11, Z00–Z20, G01–G22, U01–U12, P01–P08 et des 40 identifiants F/C/S ; indexation vérifiée. |
| `npm test` | Code 1 ; suite biologie 6/7, chargement de `./mcpExecutor/domainVerdict` impossible. Les suites suivantes du script ne sont pas exécutées. |
| `cargo test --workspace` | Code 101 ; suites précédentes passantes, puis `genos-cli` 69/70 : échec de `commands::platform::world_path_tests::accepts_simple_id`, qui utilise le répertoire temporaire de l'environnement. Les suites suivantes ne sont pas certifiées. |

Les logs ignorés sont dans `.genos-tests/studio-target-a/npm-test.log` et
`.genos-tests/studio-target-a/cargo-test.log` du worktree de livraison. Cargo utilise
le cache `target` du dépôt principal. Les deux échecs globaux portent sur du code
inchangé par l'étape A ; cela ne prouve pas que toute la base est saine.
Le module absent avait déjà été signalé dans la qualification de fusion ci-dessus.
Les avertissements SQLite de la suite Node signalent aussi une configuration
de base locale non accessible ; aucune correction ou copie d'un travail concurrent
n'est ajoutée pour contourner ces résultats. Aucun runtime ou nouvel écran n'est
qualifié par les contrôles documentaires. La qualification globale reste ouverte.

## Étape B — Renforcement du socle existant

La demande opérateur priorise désormais le socle (Z01/Z02/Z18/Z20) avant le
registre détaillé, qui reste ouvert. L'[ADR 0361](../adr/0361-studio-socle-requetes-actions-et-brouillons.md)
fixe trois points livrés avec un commit par point, sans nouveau moteur frontend
ou extension d'autorité. Base : `b95dd362`, checkpoint cognitif vérifié
`snap-4da0fd9605b640bd877064a6089412ff` ; ce n'est pas une sauvegarde des fichiers.

### B01 — Contrat de requête et d'erreur

`StudioClient` refuse les destinations hors `/api/` et les redirections ; la
deadline couvre transport et décodage, y compris un transport ignorant AbortSignal.
Le statut HTTP reste lisible si le JSON est invalide. Les réponses explicitement
`success: false` restent des refus sous HTTP 200. Body false/0/null/chaîne vide
est conservé. Annulation, timeout et session obsolète ont des erreurs distinctes.
Les effets de mutation sans réponse ou sous erreur serveur restent inconnus ;
aucune mutation n'est automatiquement rejouée. Les permissions restent au serveur.

Probes exécutées : `node backend/tests/test_studio_client.mjs` et
`node backend/tests/test_studio_request_safety.mjs`, code 0. La nouvelle suite
est incluse dans `npm --prefix backend run test:studio`. L'index ADR est régénéré
(441 entrées) et `git diff --check` passe. Ce point ne qualifie pas les providers
réels ni les effets d'une mutation métier ; les suites globales restent distinctes.

### B02 — États d'action et conservation des entrées

La libération d'une action restaure l'état initial des boutons avant de réappliquer
les permissions. Une actualisation transitoirement échouée conserve le dernier
dossier avec mention « actualisation non confirmée ». Les formulaires d'action
conservent leurs entrées lors des refus et erreurs ; HTTP 401 purge toujours la
session. Un effet de mutation inconnu reçoit une consigne d'inspection, pas une
invitation au rejeu automatique. Le flag UI de réussite ne remplace aucune preuve.

`node backend/tests/test_studio_action_state.mjs` passe : contrôles initialement
désactivés, réseau/timeout/protocole, refus 403/404/409, priorité du 401 et distinction
lecture réessayable/mutation incertaine. B01 reste couvert par ses deux probes.

### B03 — Brouillon et frontières de contexte

Le fichier édité demande confirmation avant changement d'organisation/projet/agent,
workspace ou déconnexion manuelle. Un refus restaure les sélecteurs et ne change
pas la session ; une acceptation purge le contexte précédent. La fermeture signale
le brouillon via `beforeunload`, sous réserve de la politique du navigateur.
HTTP 401, y compris le flux SSE, force la purge sans confirmation : un brouillon
ne permet pas de conserver une session expirée. Aucune entrée n'est stockée dans
localStorage/sessionStorage ; les formulaires autres que l'éditeur n'ont pas encore
de garde de changement de contexte. La fonctionnalité n'est pas une autosauvegarde.

`node backend/tests/test_studio_context_guard.mjs` passe : contexte propre, refus
des quatre transitions, abandon confirmé, avertissement de fermeture et nettoyage
des listeners. Les parcours navigateur de socle et pilote doivent qualifier le
branchement réel aux sélecteurs et la priorité de l'expiration.

Le test `node backend/tests/test_studio_foundation_browser.cjs` passe sous Edge
headless, hors sandbox Windows après échec de lancement dans celui-ci. Il exerce
le véritable DOM avec des API fixtures : refus de changement de projet/workspace
et déconnexion, conservation du draft sur 403/409/502 et réseau, état initial des
boutons, effet incertain et purge forcée sur 401 non JSON sans dialogue. L'abandon
confirmé est aussi exercé. Ce test n'est pas une certification du backend.
Capture ignorée : `.genos-tests/studio-foundation-b/studio-foundation-draft.png`.
Le script dédié est `npm --prefix backend run test:studio:foundation`.

## Étape C — Parcours pilote borné

L'[ADR 0362](../adr/0362-studio-parcours-pilote-borne-et-dependances.md) définit
la tranche P03 à qualifier sans APIs interceptées. Checkpoint cognitif vérifié :
`snap-b357311035934195b34bbf27ed696750`. Les changements du checkout principal,
dont le module MCP non suivi, ne sont pas importés dans le worktree Studio.

### C01 — Dépendance MCP obligatoire seulement au point d'exécution

Le verdict de domaine est chargé au tout début de `mcpExecutor.execute`, avant
tout accès DB et effet. Les parcours qui n'exécutent pas MCP peuvent charger le
backend ; un appel MCP sans le module échoue toujours, sans verdict inventé.
`node backend/tests/test_studio_optional_mcp.cjs` passe : module absent simulé,
import disponible et appel refusé avant effet. Le test est inclus dans la suite
Studio. Ce changement ne livre pas le module absent ni une qualification MCP.

### C02 — Pilote exécutable de bout en bout

Le [guide de rejeu](../04-exploitation/studio-parcours-pilote.md) et
`npm --prefix backend run test:studio:pilot` qualifient une tranche P03 sans
interception API : Studio → HTTP réel → SQLite/fichiers → CAS → snapshots
durables → refus de revue → assemblage vérifié → provenance persistée → purge.
Le dossier d'approbation refusé reste visible et corrigible. Sa deadline client
est de 60 secondes pour la vérification synchrone, sans changer le budget runtime
ni les gates ; un effet incertain n'est jamais resoumis automatiquement.

Le pilote final passe sous Windows/Edge 154.0.4258.62 : octets sauvegardés et
restaurés vérifiés, 409 avec brouillon intact, snapshot de sécurité relu en DB,
autre projet 404, secret 403, traversée 400 et approbation sans signature 403.
Le refus conserve le run en attente sans provenance. La revue signée obtient
un journal `completed`, un assemblage accepté, au moins deux résultats de
vérificateurs et une mémoire intègre liée au hash parent. Les commandes `npm test`
des répliques sont exécutées par le backend, pas remplacées par une fixture HTTP.
Le navigateur ne signale aucune erreur de page ; le viewport 390 px ne déborde
pas et la déconnexion purge le contenu sans stockage de session.

Les captures desktop de restauration/promotion et mobile ont été inspectées.
Elles montrent aussi les limites du run préparé : métriques inconnues et étapes
initiales planifiées. Elles ne prouvent pas une trajectoire autonome antérieure.
Les artefacts ignorés restent dans `.genos-tests/studio-pilot-c/` : manifeste
`studio-pilot-qualified.json`, trois captures et logs. Le manifeste avant commit
indique la base `61275fa4` et les hashes des sources réellement testées.
L'autorité observée est `legacy_unbound`, les postconditions et la vérification
native sont `not_evaluated`. Le pilote reste synthétique, sans LLM externe et
sans revue humaine indépendante réelle ; toute la cible P03 n'est pas certifiée.

### Qualification finale B/C — 2026-10-07

| Contrôle | Résultat observé |
| --- | --- |
| `python scripts/ci/check_code_quality.py` | Code 0 ; 5 505 sources, zéro violation nouvelle ou totale. |
| `python scripts/ci/check_adr_index.py` | Code 0 ; 442 ADR, 442 entrées, zéro problème. |
| `git diff --check` | Code 0. |
| `npm --prefix backend run test:studio` | Code 0 ; 16/16 suites Windows, services réels et frontières MCP inclus. |
| `npm --prefix backend run test:studio:foundation` | Code 0 avant C02 ; DOM réel, API fixtures explicitement bornées. |
| `npm --prefix backend run test:studio:pilot` | Code 0 après les assertions finales ; services réels, aucune interception API. |
| `cargo test --workspace` | Code 0 hors sandbox Windows ; cache Cargo principal réutilisé. |
| `npm test` | Code 1 après les suites précédentes passantes ; `test_p0_pilot_protocol.js` refuse l'intégrité de `public/code.json`. Les suites suivantes ne sont pas certifiées. |

Les quatre assets de `benchmarks/p0-pilots/v1/dataset.lock.json` sont inchangés.
La probe de hash en lecture seule confirme : hashes des octets LF différents du
lock ; conversion en mémoire vers CRLF exactement égale aux quatre hashes attendus.
Aucun fichier ni empreinte du dataset n'a été modifié pour contourner le gate.
Le défaut global reste ouvert et distinct de la qualification Studio.
Le chargement MCP absent ne bloque plus les suites indépendantes grâce à C01 ;
il reste obligatoire et fail-closed au point d'exécution MCP.

Commits B : `a3b6755f` (B01), `5ca266fa` (B02), `54030cbc` (B03).
Prérequis C : `61275fa4` (C01). C02 conserve son propre commit et le manifeste
d'exécution ; branche `codex/studio-v3-integration`, sans fusion ou push implicite.
Le registre exhaustif et les autres zones de la cible restent ouverts.

## Étape D — Parcours GenOS structurants

L'[ADR 0363](../adr/0363-studio-parcours-genos-structurants.md) fixe quatre
tranches D01–D04 rattachées à P04–P07, sans les déclarer entièrement terminés.
Base `ded03ed2`, checkpoint cognitif vérifié `snap-bc75f35226704b2ea29a4fc16196f57e`.
Le worktree principal V3 et ses modifications concurrentes restent hors périmètre.

### D01 — Mondes et lignages

Destination `#/mondes` : checkpoint d'agent lié à son snapshot workspace durable,
référence de branche, clone inactif, comparaison des états et liens vers preuves
et revue. La façade `/api/studio` exige un tenant explicite même pour l'admin,
RBAC et projet actif pour écrire. L'identité d'agent vient de la route.
La lecture retourne au plus 100 checkpoints et 100 agents apparentés.

`node backend/tests/test_studio_worlds.cjs` et
`npm --prefix backend run test:studio:genos` passent sur services réels, sans
interception API : persistance du checkpoint et de sa branche, clone `idle`,
workspace partagé explicite, comparaison, refus étranger 404, viewer 403,
membre read-only 403 et projet archivé 409. La navigation laboratoire et la purge
à la déconnexion sont vérifiées ; viewport 390 px sans débordement.
Routes et gate qualité passent ; index ADR régénéré (443 entrées).
Artefacts ignorés sous `.genos-tests/studio-genos-d/`.

Limites : le clone ne crée pas un workspace isolé, la branche n'exécute aucun
candidat et la comparaison n'effectue aucune promotion. Rejeu causal,
falsification automatisée et exécution d'alternatives isolées restent ouverts.

### D02 — Connaissances et mémoire

Destination `#/memoire` : recherche par mots-clés bornée à 100 décisions du
projet, enregistrement de justification et références de provenance, inspection
d'intégrité et transmission à un agent du même projet. `persistDecision` conserve
le statut provisoire sans sources ; une transmission conserve l'ID/hash/contenu
source, l'acteur, le destinataire et la raison, avec provenance parent liée.
Elle ne valide pas la vérité et n'accorde aucune promotion. Aucun provider ou
embedding externe n'est appelé. L'auteur d'une décision vient du principal
authentifié, pas du formulaire ; les mémoires non scellées ne sont pas transmissibles.

`node backend/tests/test_studio_memory.cjs` passe : recherche scoped, statut
provisoire, auteur non falsifiable, transmission réellement persistée, hash parent,
référence invalide 400, mémoire étrangère 404, altération refusée 409 et contrôles
RBAC/projet archivé/read-only. Le parcours navigateur D01/D02 passe sans API
interceptée et qualifie la transmission depuis le formulaire. Capture mémoire
ignorée sous `.genos-tests/studio-genos-d/studio-memory.png`.
Routes, rendu des valeurs inconnues et gate qualité passent.
Limites : pas de retrieval sémantique, consolidation automatique ou transfert
entre tenants ; source liée ne signifie pas conclusion actuelle validée.

### D03 — Organisme et AgentDNA

Destination `#/organisme` : génomes du projet, sections réellement présentes,
gènes, signature et phénotype déclaré. La source est lue par ID exact dans son
tenant, décodée et liée à son hash ; aucun lookup global par nom n'est utilisé.
Mutation candidate via les arguments CLI existants : taux 0–1, seed explicite,
version source obligatoire vérifiée avant exécution et avant persistance.
Le candidat et son événement MUTATION sont persistés atomiquement avec parent,
hash source, acteur et paramètres. La source n'est pas remplacée ; aucun agent
n'est déployé, aucun effet fonctionnel ou promotion n'est annoncé.

`node backend/tests/test_studio_genome.cjs` et le navigateur D01–D03 passent
avec le vrai CLI Rust et `GENOS_BIN` désignant le binaire debug du dépôt principal.
Probes : lecture étrangère 404, rate/seed invalides 400, version périmée 409,
mutation native persistée en `candidate`, événement parent et source inchangée,
refus RBAC/read-only/projet archivé. La fixture AgentDNA comporte six sections,
pas toutes les sections optionnelles du format ; aucun compteur fictif n'est ajouté.
Gate qualité et routes passent. Capture ignorée : `studio-organism.png`.
Limites : pas de composition complète d'organismes, de mesure cognitive ni de
promotion automatique ; le laboratoire est la prochaine destination de mesure.

### D04 — Diagnostic et reprise

Destination `#/reprise` : incidents du projet, état persisté, observation du PID,
garanties du dernier run et snapshots du workspace associé. Les valeurs absentes
restent inconnues ; aucun diagnostic causal n'est fabriqué. L'arrêt réutilise le
service existant, exige confirmation, écriture et `emergency_kill`, puis vérifie
la terminaison. Un runtime externe non vérifiable est refusé.

La préparation exige un arrêt confirmé et la prévisualisation d'un snapshot ;
les chemins des fichiers concernés sont rendus avant l'intervention. Elle rejoint
l'éditeur existant avec le bon workspace/snapshot et respecte la garde de brouillon.
La restauration reste séparée, confirmée et accompagnée d'un snapshot de sécurité.
Une nouvelle lecture de diagnostic invalide la préparation précédente.
La purge masque désormais toutes les vues et efface résultats/champs des parcours.

`node backend/tests/test_studio_recovery.cjs` passe : lecture scoped, admin sans
tenant 403, agent étranger 404, absence de confirmation 409, arrêt externe refusé,
processus réel géré terminé, RBAC/read-only/projet archivé. Le navigateur D01–D04
arrête réellement son processus de fixture, modifie puis restaure `a/verify.cjs`,
vérifie les octets et le snapshot de sécurité, sans réponse API interceptée.
Captures desktop/mobile inspectées ; aucune erreur de page, aucun débordement à
390 px et texte 200 %, champs nommés, focus de titre et Tab vérifiés.

Limites : la présence d'un PID ne prouve pas son identité ; le garde frontend ne
verrouille pas atomiquement les nouveaux démarrages pendant la restauration.
La reprise porte sur les fichiers, pas les effets externes ni une réparation
nosologique automatique. Les fixtures ne prouvent pas une mission autonome.

### Qualification finale D — 2026-10-07

| Contrôle | Résultat observé |
| --- | --- |
| `npm --prefix backend run test:studio` | Code 0 ; 20/20 suites, dont quatre nouveaux services GenOS. |
| `npm --prefix backend run test:studio:genos` | Code 0 ; quatre parcours, services HTTP/SQLite/filesystem et CLI natif, sans interception API. |
| `npm --prefix backend run test:studio:foundation` | Code 0 ; gardes et transitions B sans régression. |
| `npm --prefix backend run test:studio:pilot` | Code 0 ; pilote C réel, refus, restauration et promotion vérifiée. |
| `python scripts/ci/check_code_quality.py` | Code 0 ; 5 522 sources, zéro violation. |
| `python scripts/ci/check_adr_index.py` | Code 0 ; 443 ADR, 443 entrées, zéro problème. |
| `git diff --check` | Code 0. |
| `cargo test --workspace` | Code 0 ; cache du dépôt principal réutilisé. |
| `npm test` | Code 1 ; intégrité P0 `public/code.json` refusée ; suites suivantes non certifiées. |

La probe en lecture seule confirme encore les quatre hashes attendus uniquement
après conversion LF → CRLF en mémoire ; aucun dataset ni lock n'a été modifié.
Les logs globaux restent ignorés sous `.genos-tests/studio-genos-d/`.
Le manifeste navigateur conserve la date, la révision, les hashes des sources
réellement testées et du binaire ; un rejeu après commit rattache la preuve au HEAD.
La validation globale n'est donc pas déclarée entièrement verte.

Commits : `8458738d` (D01), `dcab4715` (D02), `aa660b86` (D03), puis commit D04
portant cette qualification. Un commit par tranche, sans fusion ni push implicite.
Le [guide opérateur](../04-exploitation/studio-parcours-genos.md) précise les étapes,
autorités et limites. P04–P07 complets, G01–G22 et la parité universelle restent
ouverts ; ces quatre tranches ne les déclarent pas terminés.

## Étape E — Mécanismes spécialisés

Base `a39bc995`, checkpoint cognitif vérifié `snap-b9afcf338995465f84ab5f72c5000598`.
L'[ADR 0364](../adr/0364-studio-mecanismes-specialises.md) fixe E01–E05,
sans confondre catalogue, calcul déclaré, observation et capacité runtime validée.

### E01 — Collectifs sous contrat

Depuis Organisme, `#/collectif` expose huit topologies et les 19 organisations
du catalogue runtime, leurs capacités requises et l'organisation persistée de
l'agent lorsqu'elle existe. Disponibilité et autorité non mesurées restent inconnues.
Un pas collectif réutilise `runTopologyStep` sur données déclarées bornées ;
aucun worker, routage, budget ou état d'organisation n'est modifié. La sortie est
scellée comme analyse provisoire avec acteur authentifié et agent scoped, puis
inspectable dans Mémoire. Cela n'accorde aucune promotion ou autorité collective.

Qualification exécutée : `test_studio_collective.cjs` code 0, les 19 calculs,
intégrité de l'analyse, refus tenant/droits et entrées invalides. Le navigateur
`test:studio:specialized` passe sans interception API, viewport 390 px sans
débordement, sortie purgée à la déconnexion. Routes et rendu passent.
Les points E02–E05 sont encore à livrer dans leurs commits respectifs.
