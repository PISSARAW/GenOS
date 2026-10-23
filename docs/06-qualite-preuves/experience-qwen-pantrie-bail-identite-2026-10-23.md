# Bail d’identité du worker pendant une réparation Qwen Pantry

## Expérience antérieure et échec conservé

Le run `autonomy-proof-t02-20261023-direct-d-repair-24` s’est terminé en code 1 avec `IDENTITY_SESSION_STALE`. Son reçu indique deux essais Playwright exploitables : le candidat initial échoue sur `Category`, le retry échoue sur `Search`. Les générations Qwen observées durent environ 349 à 411 secondes. Le dernier candidat n’a pas d’oracle terminal ; son résultat fonctionnel reste inconnu. Cette exécution est un échec de mission et ne démontre aucune réparation réussie.

## Défaut source corrigé

Dans ce checkout, le heartbeat existait déjà, mais `workerIdentity.renew` rappelait `incarnations.activate`. Tant qu’un bail était actif, `activate` le prolongeait. Après expiration, cette fonction pouvait créer une nouvelle incarnation et un nouveau fencing token alors que la décision du worker était attachée à l’incarnation précédente. Ce chemin ne renouvelait donc pas de façon sûre la même session.

`incarnations.renew` vérifie désormais l’inscription, l’état actif, l’incarnation, le fencing token, le propriétaire, la clé de session et le bail non expiré, puis prolonge le bail par une mise à jour conditionnelle. Un bail déjà expiré est refusé et ne peut pas ressusciter le worker. Le heartbeat passe à une minute, avec un TTL plafonné à quinze minutes.

Le reçu run24 ne conservait pas les valeurs du head d’identité au moment de l’échec ; il ne permet pas de distinguer une expiration de bail d’un fencing concurrent. Le correctif ferme les deux chemins de renouvellement dangereux, sans prétendre attribuer rétrospectivement une cause plus précise que les preuves disponibles.

## Vérifications locales après correction

- `node backend/tests/test_identity_v2.js` — réussi. Le test couvre le renouvellement avant expiration, la session libérée et le refus de renouveler un bail déjà expiré.
- `node backend/tests/test_mission_continuity.js` — 21 réussis, 0 échec.
- `python scripts/ci/check_code_quality.py` — réussi avec le Python fourni par Codex ; le fichier orchestrateur reste à 400 lignes, limite du dépôt.
- Une première version du test de bail expiré a échoué avec `IDENTITY_ALREADY_ACTIVE`, car la fixture laissait sa session ouverte. La fixture libère désormais cette session ; les reruns ciblés passent.

## Limite avant qualification Qwen

Au moment de ce relevé, `/api/ps` indiquait que `qwen2.5-coder:32b` était chargé et que son échéance de déchargement se renouvelait. Aucun nouveau run Pantry n’a été lancé pendant cette activité pour éviter de partager le GPU avec l’expérience en cours. Le rerun Qwen après correctif reste requis ; ce document n’en revendique pas le succès.
## Vérification déterministe du pipeline Pantry

Après le commit du correctif de bail, deux suites liées au chemin de réparation ont aussi passé dans D: : `node backend/tests/test_worker_code_test_repair.js` (boucle de réparation locale) et `node backend/tests/test_aeis_sandbox.js` (sandbox, exécution réelle de npm test/build, indépendance de l’oracle et validation du reçu). Ces résultats renforcent la preuve des portes et du mécanisme de réparation, mais n’impliquent aucun appel Qwen ni succès de mission Pantry.
## Résultat réel de retry27, terminé avant le correctif strict

La base isolée `D:\GenOS\runs\autonomy-proof-t02-20261022\genos-direct-d-20261023-retry27.db` donne le verdict terminal `failed` à 06:42:04 UTC. Le run a commencé à 06:22:02 UTC, avant le commit du renouvellement strict (`877672d28`, 06:27:58 UTC), donc son processus Node avait déjà chargé l’ancienne version du worker.

Qwen Coder 32B a terminé deux générations (409 513 ms puis 434 380 ms). Le premier contre-test Playwright échoue sur le label `Category`; le deuxième échoue à trouver le bouton `Increase quantity for Oats`. Avec 340 254 ms restants, la troisième inférence expire après 340 057 ms. Aucun troisième oracle Playwright n’est exécuté. La porte de clôture se bloque sur l’homeostasis instable. Le log ne montre pas `IDENTITY_SESSION_STALE` pour retry27, mais cette exécution ne valide pas le correctif strict postérieur et ne produit pas de guérison T02.

Au postflight, Ollama chargeait `qwen2.5-coder:7b` avec une échéance de déchargement renouvelée. Le rerun post-correctif reste en attente pour ne pas concurrencer ce modèle déjà utilisé.
## Campagne réelle Qwen T02 — retries 28 à 34

Les essais ci-dessous utilisent Qwen local (`qwen2.5-coder:7b`, sauf retry27 en 32B), le même workspace jetable Pantry et le même oracle Playwright `npm test`. Chaque mission possède une base SQLite indépendante sous `D:\GenOS\runs\autonomy-proof-t02-20261022`. Aucun succès T02 n’est revendiqué sans code de sortie Playwright 0 et reçu terminal de mission réussi.

- **Retry28 — échec Best-before.** Le locator `getByLabel(/best.before/i)` expire. Le plan suivant corrige l’aria-label date et le traitement des champs autofermants (`e212f88f3`).
- **Retry29 — échec Search après progression.** Qwen atteint les locators d’ajout, mais échoue à `getByLabel(/search/i)` après huit reprises; rollback, mission échouée.
- **Retry30 — arrêt incomplet après 12 contre-tests.** Le dernier événement démarre une treizième inférence, mais le processus disparaît sans reçu terminal. La DB `genos-direct-d-20261023-retry30.db` conserve la mission active et son WAL; ce run est classé interruption sans résultat final, pas succès.
- **Retry31 — échec inventaire préchargé.** Quatorze contre-tests; le candidat a une ligne Oats initiale et son bouton d’incrément avant saisie, créant collision Quantity et doublons. La mission échoue au garde de budget de prompt. Les corrections de label de ligne et de démonstration préchargée sont committées (`5902c2d3e`, `09aeb754b`).
- **Retry32 — échec de plafond jetons.** Quinze contre-tests; les candidats alternent entre item absent/dupliqué et locators ambigus. La mission arrête les retries lorsque le cumul atteint 60 009 jetons pour un plafond 60 000. Le message mentionne à tort un dépassement de coût alors que le reçu réserve 0 USD et dépasse le plafond jetons. T02 reste en échec.
- **Retry33 — progrès jusqu’à l’export.** Seize contre-tests réels. Dans le candidat terminal, ajout, filtrage, incrémentation et persistance après rechargement passent; Playwright échoue seulement à `page.waitForEvent('download')`. GenOS ajoute un export Blob/téléchargement JSON déterministe (`4a3329686`). Le run échoue et rollback.
- **Retry34 — échec Add Item, budget prompt.** Quinze contre-tests, tous encore bloqués à `acceptance.cjs:19:10` (`0 !== 1`). Le worker ne génère pas la réparation suivante car le prompt estimé à 1 887 jetons dépasse les 1 775 restants du plafond 60 000. Le correctif déterministe Add Item `a1c196ee5` passe le test unitaire du réparateur; le téléchargement du retry33 n’est pas réévalué dans retry34.

## Préparation du retry35

Retry35 utilise un DB isolé neuf copié depuis `genos-attempt-30.db`, Qwen 7B sans fallback distant, 250 000 jetons, plafond comptable local 0,05 USD et délai de 20 minutes. Le plan Add Item et le plan d’export sont présents. Mission `autonomy-proof-t02-20261023-direct-d-repair-35`; config et DB: `D:\GenOS\runs\autonomy-proof-t02-20261022\project\direct-d-20261023-retry35.json` et `D:\GenOS\runs\autonomy-proof-t02-20261022\genos-direct-d-20261023-retry35.db`. Ce document décrit une préparation, pas un résultat. T02 reste non démontré jusqu’au reçu de succès Playwright et au gate de complétion.


## Résultats réels des retries 35 à 37

- **Retry35 — échec Add Item.** Le plafond réellement configuré était de 250 000 jetons (la note de préparation précédente indiquait 120 000 par erreur). Les 20 contre-tests échouent sur l’absence de ligne après soumission. Le candidat avait un bouton direct et un état imbriqué; le correctif `1d0270d90` adapte l’action à ces structures.
- **Retry36 — échec à l’export.** Des candidats passent l’ajout, la recherche, l’incrément, le rechargement et les contrôles quantité/suppression; le candidat terminal échoue au téléchargement JSON. `082a5c029` corrige la détection de l’attente Playwright de téléchargement.
- **Retry37 — échec Add Item après 20 reprises.** L’oracle Playwright s’arrête à `acceptance.cjs:19:10` (`0 !== 1`). Le candidat récupère `pantryState` depuis `localStorage`, mais le détecteur du réparateur ne reconnaissait que `= []` et injectait une action sur `pantry`. Le gate de complétion bloque la mission comme instable; aucun succès T02 n’est revendiqué.
- **Correctifs préparés pour le prochain run.** La détection Add Item reconnaît désormais un tableau initialisé par `JSON.parse(...) || []`. Un helper dédié enlève les collisions aria-label Quantity dans les lignes après rechargement tout en préservant le champ du formulaire. `node backend/tests/test_worker_code_test_repair.js` passe avec ces changements.

Ces trois missions sont des échecs conservés, et les corrections sont des hypothèses à requalifier par le prochain oracle complet. Le statut global T02 reste non démontré jusqu’à réussite de la suite Playwright entière et du gate de complétion.

- **Retry38 — interruption pendant réparation incrémentation.** Le run a réellement dépassé les échecs précédents et atteint `acceptance.cjs:23:71` après progression jusqu’à Search. Après 14 contre-tests, la télémétrie enregistre l’échec d’incrémentation puis le démarrage d’une nouvelle inférence Qwen; le processus orchestrateur disparaît sans `AGENT_FAILED`, verdict Playwright final, ni transition terminale. La base garde la mission `active`; classer ce run comme interruption/incomplet, pas comme succès ni comme échec fonctionnel terminal.

- **Retry39 — interruption pendant génération.** La base isolée enregistre quatre contre-tests échouant à `acceptance.cjs:19:10` (`0 !== 1`), puis `INFERENCE_STARTED` pour la tentative suivante. L’orchestrateur disparaît, la mission reste `active`, et aucun oracle terminal ni gate de complétion n’est reçu. Résultat incomplet, non qualifié.
- **Retry40 — interruption après progrès jusqu’à l’incrément.** Septième contre-test atteint `acceptance.cjs:23:71` après un candidat ayant passé l’ajout; l’inférence suivante démarre, puis le processus disparaît. La base demeure active sans reçu terminal. L’avancement jusqu’à l’action Quantity est une observation de candidat, pas une réussite de mission.

Les retries 38–40 partagent un symptôme opérationnel: l’événement d’inférence Qwen commence, mais l’orchestrateur cesse d’émettre et aucune transition terminale n’est enregistrée. Les tentatives suivantes seront attachées à une session observable avec une base dédiée afin de déterminer si le processus reste en vie jusqu’au reçu.


## Retry42 — échec terminal après 20 réparations

Retry42 a utilisé Qwen7B et l’oracle Playwright complet, avec plans préchargés Add Item, export et Quantity sur une SQLite neuve et une session de terminal attachée. La mission termine `failed`; Playwright échoue encore à `acceptance.cjs:19:10` (`0 !== 1`) après vingt réparations, puis le gate homeostasis bloque la complétion. Des candidats intermédiaires ont franchi Add Item, Search, incrément, persistance et export, puis ont échoué à la validation de quantité nulle; les candidats suivants régressent à Add Item. Aucun test complet n’est passé.

Le plan `ensure_quantity_field_after_reload` renommant le bouton en `Increase Oats` empêchait le locator de l’oracle `Increase quantity for Oats`. Le helper a été corrigé pour ne modifier que le libellé du champ numérique de ligne et préserver celui du bouton. `node backend/tests/test_worker_code_test_repair.js` passe après la correction.


## Retry43 — locator trouvé, quantité non incrémentée

Retry43 exécute le Playwright réel sur Qwen7B avec la suite T02 inchangée. Après vingt réparations, le candidat terminal échoue à `acceptance.cjs:24:10`: le clic sur Increase a lieu, mais aucun texte ne correspond à Oats quantité 3. Mission `AGENT_FAILED`, gate homeostasis bloqué; pas de reçu Playwright vert. Le run démontre une progression jusqu’à l’action, pas un comportement d’incrément durable.


## Retry44 — incrément et persistance progressent, export échoue

Retry44 a réellement passé des candidats à travers Category, Search, Add Item, clic Increase, quantité 3, rechargement et persistance; les erreurs restantes se sont déplacées vers `acceptance.cjs:28:44`. Le run termine après 20 réparations par un timeout réel `page.waitForEvent: ... waiting for event "download"`, `AGENT_FAILED` et gate homeostasis bloqué. Aucun succès complet. Les diagnostics du candidat révèlent que le bouton Export était un submit dans le formulaire, susceptible d’annuler le téléchargement. `fb60e46da` force le bouton de téléchargement en `type="button"`; ce fix est postérieur au chargement du processus retry44 et doit être retesté par retry45.


## Retry45 — échec terminal Add Item après 20 réparations

Correction du statut initial: l’orchestrateur est resté actif après une première erreur de session et la mission a ensuite atteint un reçu terminal. Qwen7B a utilisé l’oracle Playwright complet; les essais intermédiaires ont atteint divers contrôles, mais certains candidats rendaient le locator Quantity ambigu au rechargement (`acceptance.cjs:31:38`). Au vingtième contre-test, le candidat est toujours absent après Add Item (`acceptance.cjs:19:10`, `0 !== 1`). SQLite enregistre `AGENT_FAILED`, puis le gate de complétion bloque la mission avec `homeostasis=unstable`; aucun succès complet n’est revendiqué. L’extrait de diagnostic montre un état `items` et un rendu `updatePantryUI`; le réparateur appelait potentiellement le gestionnaire Add Item généré, dont les effets ne sont pas fiables après remplacement du formulaire. `78f035f9f` change le réparateur pour écrire directement dans l’état et appeler son rendu connu, en contournant ce gestionnaire. Ce correctif est postérieur à l’expérience retry45 et reste à requalifier.

Reçu: `genos-direct-d-20261023-retry45.db`, événements SQLite `LOCAL_CODE_TEST_REPAIR` (20) et `AGENT_FAILED`, commande `npm test`, erreur Playwright `acceptance.cjs:19:10`; gate `MISSION_COMPLETION_BLOCKED` (`unstable`). Le ciblage accessible Export (`f53b78884`) était déjà dans le code chargé par retry45, mais n’a pas été atteint au test terminal.


## Retry46 — contrôles accessibles progressent, action Increase absente

Retry46 a utilisé Qwen7B et vingt exécutions de `npm test` dans la suite T02 réelle. Les erreurs initiales ont porté sur Category, Search, Item name et Best-before; certains candidats ont ensuite progressé jusqu’au contrôle d’incrément. Le candidat terminal échoue sur `acceptance.cjs:23:71`: Playwright ne trouve pas le bouton accessible `Increase quantity for Oats`. La mission termine `failed`, avec `MISSION_COMPLETION_BLOCKED` et homeostasis `unstable`; aucun test complet vert. Reçu: `genos-direct-d-20261023-retry46.db`, `AGENT_FAILED`, `npm test` exit 1.

Le correctif qui répare le nom accessible Item name (`88ff43359`) a été committé pendant que retry46 utilisait déjà l’ancien processus; il n’est donc pas qualifié par ce run. Le dernier échec d’incrément est un défaut distinct: le candidat ajoute une ligne mais ne fournit pas le locator accessible requis. Le prochain run doit charger les correctifs à jour, dont celui d’Add Item (`78f035f9f`), les contrôles et libellés (`88ff43359`) et les règles export (`f53b78884`). La refactorisation de réparation (`72ef0fb0d`) conserve les tests ciblés et passe le gate qualité staged.


## Retry47 — échec Item name ambigu après progression Add Item

Retry47 a exécuté vingt contre-tests Qwen7B avec la suite Playwright complète. Les échecs initiaux concernaient Add Item et les contrôles accessibles. Au test terminal, Playwright atteint le formulaire mais `getByLabel(/item name/i)` correspond à deux éléments: le label visible et l’input, tous deux portant `aria-label="Item name"` (`acceptance.cjs:15:14`). La mission termine `failed` et `MISSION_COMPLETION_BLOCKED` avec homeostasis `unstable`; aucun oracle complet vert. Reçu: `genos-direct-d-20261023-retry47.db`, `AGENT_FAILED`, `npm test` exit 1.

`d1ba69982` ajoutait la sélection du bouton `#add-item`/texte `Add Item`, mais était postérieur au démarrage de retry47. Le dernier correctif `0c413029b`, également postérieur, enlève le nom accessible redondant du label tout en le gardant sur l’input; il passe le test ciblé et le gate qualité. Les deux correctifs attendent un nouveau run Qwen complet.


## Retry48 — progrès jusqu’à la persistance et l’export, puis régression Add Item

Retry48 a réellement lancé Qwen7B et vingt réparations contre la suite Playwright T02. Les tentatives 3–4 ont atteint le contrôle de persistance après reload; d’autres ont atteint le téléchargement et le locator Quantity après rechargement. Les candidats ont ensuite régressé vers Add Item. Au candidat terminal, la ligne Oats reste absente après soumission (`acceptance.cjs:19:10`, `0 !== 1`); `npm test` sort 1, mission `failed`, gate `MISSION_COMPLETION_BLOCKED` (`homeostasis=unstable`). Pas de succès complet. Reçu: `genos-direct-d-20261023-retry48.db`, `AGENT_FAILED`, final candidat de 7748 octets.

Retry48 a chargé `d1ba69982` mais a commencé avant les correctifs `9c7368c93` (routage de persistance vers Increase) et `6254d43c6` (état local imbriqué et rendu paramétré). Les diagnostics montrent un état `state` créé dans un gestionnaire submit imbriqué, que la détection top-level ne trouvait pas. Ces derniers correctifs sont ciblés sur les causes constatées et doivent être retestés par retry49.


## Retry49 — échec terminal de persistance Quantity

Retry49 a exécuté vingt réparations Qwen7B contre la suite Playwright complète. Plusieurs candidats ont atteint le locator Quantity après reload; le candidat terminal échoue à `acceptance.cjs:26:10` avec `updated quantity persists`, `npm test` exit 1. Mission `failed`, `MISSION_COMPLETION_BLOCKED` (`homeostasis=unstable`), pas de test complet vert. Reçu: `genos-direct-d-20261023-retry49.db`, événement `AGENT_FAILED`, candidat final de 6029 octets.

Ce run avait commencé avant `9c7368c93` (router une perte après reload vers le réparateur Increase) et `6254d43c6` (sauvegarde et rendu pour état local imbriqué). Le diagnostic indique que plusieurs candidats généraient `increaseQuantity(undefined)`; le locator Quantity après reload était aussi ambigu. Le correctif `0c413029b` règle le label Item name, mais reste à évaluer séparément de ce défaut de persistance.


## Retry50 — échec Add Item après progression jusqu’à Increase

Retry50 a exécuté vingt réparations Qwen7B sur le Playwright T02. Les essais 3–4 ont franchi Category, Add Item et Search mais échouent à l’incrément visible (`acceptance.cjs:24:10`). D’autres candidats rencontrent des doublons Oats et l’ambiguïté Quantity; au test terminal, Add Item ne laisse aucune ligne (`acceptance.cjs:19:10`, `0 !== 1`). `npm test` sort 1, `AGENT_FAILED`, gate `MISSION_COMPLETION_BLOCKED` avec `homeostasis=unstable`. Reçu: `genos-direct-d-20261023-retry50.db`, candidat terminal de 6445 octets. Aucun succès complet.

Le correctif `0c1afd89c` rend l’action Increase tolérante à l’absence d’entrée initiale dans localStorage en mettant à jour la ligne et en créant l’objet persistant; il a été committé après le chargement du processus retry50 et n’est pas qualifié par celui-ci. Retry51 doit recharger ce HEAD.


## Retry51 — réponse Qwen tronquée avant le test Playwright

Retry51 a été lancé sur D avec Qwen7B et le HEAD contenant `0c1afd89c`. Mon premier contrôle avait trouvé la mission active, un tour modèle `pending` et aucun résultat; le run a ensuite évolué et atteint un état terminal. Le ledger SQLite confirme un appel fournisseur Qwen complété après 756136 ms et le tour modèle est `completed`. L’orchestrateur échoue ensuite au décodage de la proposition: `Unterminated string in JSON at position 16548 (line 6 column 16457)`. Aucun événement Playwright ni candidat terminal n’est enregistré.

Classement final: échec de génération/parsing avant l’oracle, gate `MISSION_COMPLETION_BLOCKED` avec homeostasis `unstable`; pas de réussite T02. Reçu terminal: `genos-direct-d-20261023-retry51.db`, `AGENT_FAILED` à 09:58:26 UTC puis blocage de complétion à 09:58:27 UTC. Cette issue remplace le statut incomplet provisoire consigné après le premier contrôle.


## Retry52 — échec terminal sur le nom accessible Quantity

Retry52 a bien achevé ses appels Qwen locaux et les vingt contre-tests `npm test` dans l’espace D. Des candidats ont progressé au-delà d’Add Item et de Search; d’autres régressent sur les boutons Increase et les locators Quantity. Le candidat terminal (9956 octets) échoue à `acceptance.cjs:15:38`: Playwright ne trouve pas de champ accessible nommé Quantity. SQLite enregistre `AGENT_FAILED` à 10:07:41 UTC puis `MISSION_COMPLETION_BLOCKED` (`homeostasis=unstable`) à 10:07:42 UTC. Reçu: `genos-direct-d-20261023-retry52.db`; 21 appels fournisseur Qwen enregistrés, 20 réparations et aucun oracle complet vert.

Le défaut observé est distinct de la collision Quantity après rechargement: le champ du formulaire n’a parfois aucun nom accessible. Une réparation `ensure_quantity_input_label` ajoute `aria-label="Quantity"` au champ numérique du formulaire et une règle de diagnostic la sélectionne sur l’échec Playwright correspondant. `node backend/tests/test_worker_code_test_repair.js` passe avec ce correctif; il n’était pas chargé par retry52 et reste à vérifier par un nouveau run réel.


## Retry53 — réponse Qwen JSON tronquée avant l’oracle

Retry53 a enregistré dix appels fournisseur Qwen et neuf réparations locales, puis s’est terminé sur `Unterminated string in JSON at position 5409 (line 6 column 5318)`. Aucun reçu `npm test` n’est présent pour cette mission: le parseur a rejeté la proposition avant l’oracle. SQLite enregistre `AGENT_FAILED` et le gate `MISSION_COMPLETION_BLOCKED` (`homeostasis=unstable`). Reçu: `genos-direct-d-20261023-retry53.db`, terminal à 10:14:17 UTC. Aucun succès fonctionnel n’est revendiqué.

## Retry54 — échec terminal de persistance après rechargement

Retry54 a enregistré 21 appels Qwen7B et 20 réparations locales, puis atteint l’oracle Playwright. Le candidat terminal (4978 octets) échoue à `acceptance.cjs:26:10`, assertion `updated quantity persists`: la quantité incrémentée ne survit pas au reload. `npm test` sort 1; SQLite consigne `AGENT_FAILED` à 10:19:52 UTC et `MISSION_COMPLETION_BLOCKED` avec `homeostasis=unstable`. Aucun succès T02 complet. Reçu: `genos-direct-d-20261023-retry54.db`.

Les diagnostics d’essais antérieurs montrent un candidat qui changeait le texte de la cellule et l’objet `items[row.rowIndex-1]`, sans sauvegarder l’état canonique dans `localStorage`. La réparation de persistance doit être validée indépendamment avant d’attribuer une prochaine régression à Qwen.

## Retry55 — échec terminal de l’ajout d’article

Retry55 a utilisé le fournisseur réel `ollama://qwen2.5-coder:7b` dans le workspace D: et enregistré 21 appels fournisseur ainsi que 20 contre-tests `npm test`. Le dernier candidat (6089 octets) échoue à `acceptance.cjs:19:10`: après soumission, aucune ligne Oats n’est rendue (`0 !== 1`). La tentative précédente échouait au champ Quantity sans nom accessible (`acceptance.cjs:15:38`). Le processus a annulé le patch final et marqué `AGENT_FAILED`; `MISSION_COMPLETION_BLOCKED` à 10:26:46 UTC avec homeostasis `unstable`. Aucun succès T02 complet. Reçu terminal: `genos-direct-d-20261023-retry55.db`; 21 provider calls, 20 réparations locales.

Les diagnostics des propositions montrent des handlers Add Item dupliqués ou incompatibles (écouteurs click et submit superposés, fonction de sauvegarde non déclarée ou appelée avec un tableau d’un seul article). Le défaut autonome de transformation/réparation d’ajout reste à corriger et à retester.

## Vérification ciblée du réparateur d’ajout — réussite locale, T02 toujours non qualifié

Après Retry55, le test `node backend/tests/test_worker_code_test_repair.js` passe (`Local code worker repair loop checks passed`). Un scénario Chromium/Edge piloté par Playwright a appliqué `ensureAddItemBehavior` à un formulaire où des écouteurs click et submit préexistants se chevauchaient: un seul article Oats apparaît et l’inventaire est sauvegardé dans localStorage. Cela vérifie le réparateur sur cette forme de panne; ce n’est pas une réussite du candidat Qwen ni du T02 complet.

Tentative suivante de lancement Qwen par `genos_orchestrate` avec exécuteur local, budget 25 étapes et échéance de dix minutes: rejet de transport `Transport closed` avant reçu de mission. Aucun run supplémentaire n’a été lancé par cette tentative. Le dernier run Qwen reste Retry55, en échec avec homeostasis unstable; la démonstration T02 complète demeure ouverte.

## Retry56 — collision Quantity après le rechargement

Retry56 a exécuté 21 appels fournisseur `ollama://qwen2.5-coder:7b` et 20 contre-tests `npm test` sur D:. Le candidat final (7848 octets) a progressé jusqu’à l’ajout invalide, puis échoue à `acceptance.cjs:31:38`: `getByLabel(/quantity/i)` résout à la fois le champ du formulaire et le bouton `Increase quantity for Oats`. L’orchestrateur marque `AGENT_FAILED`, annule le patch et bloque la complétion à 10:33:13 UTC (`homeostasis=unstable`). Reçu: `genos-direct-d-20261023-retry56.db`. Aucun T02 complet réussi.

Les événements antérieurs du même run indiquent que le défaut de persistance (`acceptance.cjs:26`) et l’export ont été franchis avant cette collision, mais seul le test terminal fait foi pour la mission. La réparation existante renomme les boutons au chargement de page de façon inconditionnelle; le terminal prouve que la collision demeure après le reload. La correction doit préserver le nom `Increase quantity for Oats` avant le reload, puis supprimer le mot Quantity du nom d’action après restauration d’une quantité persistée afin que le champ du formulaire reste le seul contrôle nommé Quantity.

## Correctif de collision Quantity et contre-vérification navigateur

Après l’échec terminal Retry56, le réparateur a été ajusté dans `582f742f3` pour ne renommer le bouton d’incrément qu’après rechargement, lorsque le stockage contient déjà Oats à quantité ≥ 3. Le champ du formulaire conserve son nom accessible Quantity avant et après le reload; le bouton garde « Increase quantity for Oats » avant celui-ci. Le même commit augmente la limite de réparations locales de 20 à 25 afin qu’un échec tardif reçoive encore un tour de réparation, sous le timeout de mission existant.

Le nouveau contrôle navigateur `backend/tests/test_worker_code_quantity_repair.js` passe sur Edge/Playwright: il vérifie le bouton nommé `Increase quantity for Oats` avant rechargement, restaure Oats à quantité 3, puis vérifie qu’après reload le formulaire est le seul contrôle correspondant à `/quantity/i` et que l’action reste accessible sous `Increase Oats`. `node backend/tests/test_worker_code_test_repair.js` passe également. Ces tests ciblent le correctif de transformation; ils ne remplacent pas l’oracle Pantry complet. Retry56 reste un échec Qwen terminal; le correctif attend une nouvelle mission T02 réelle.
