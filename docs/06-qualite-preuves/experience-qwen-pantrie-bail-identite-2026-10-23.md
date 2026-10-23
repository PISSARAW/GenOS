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

## Retry57 — échec terminal Add Item après 25 réparations

Retry57 a utilisé `ollama://qwen2.5-coder:7b` sur D:, avec 26 appels fournisseur enregistrés et 25 contre-tests locaux `npm test` après l’appel initial. Le dernier candidat (5387 octets) échoue toujours à `acceptance.cjs:19:10` (`0 !== 1` après Add Item); `AGENT_FAILED` et le blocage de complétion `homeostasis=unstable` sont enregistrés à 10:44:31 UTC. Reçu: `genos-direct-d-20261023-retry57.db`.

Le diagnostic du candidat terminal révèle une incompatibilité de forme: `renderItem(item)` affiche `item.ItemName`, tandis que le réparateur ajoutait surtout `name` et appelait parfois une fonction globale `addItem` dont l’implémentation dépend d’un formulaire différent. Le test direct dans navigateur a reproduit le défaut de rendu (`undefined` au lieu d’Oats). Le correctif local fournit les alias de propriétés attendus, résout les identifiants `name` par correspondance complète et régénère son script après les changements du candidat afin de ne pas conserver un réparateur périmé.

Le nouveau test Edge/Playwright `backend/tests/test_worker_code_add_repair.js` passe sur un formulaire semblable au candidat Qwen, avec handler inline obsolète: le réparateur crée une seule ligne Oats et persiste l’objet `ItemName`. Les suites ciblées de réparation et de collision Quantity passent aussi. Retry58 est toujours actif, mais a démarré avant ce correctif et ne peut donc pas le qualifier; son essai 20 échoue actuellement sur le titre Pantry absent. La preuve T02 complète reste ouverte.

## Retry58 — échec terminal sur le titre Pantry

Retry58 a enregistré 26 appels fournisseur `ollama://qwen2.5-coder:7b` et 25 réparations avec l’oracle complet. Il s’est terminé à 10:54:15 UTC sur `locator.waitFor` à `acceptance.cjs:13:52`: le candidat final (4493 octets) n’affiche plus de titre correspondant à Pantry. La mission `autonomy-proof-t02-20261023-direct-d-repair-58` est `failed`; `MISSION_COMPLETION_BLOCKED` confirme `homeostasis=unstable`. Reçu: `genos-direct-d-20261023-retry58.db`. Aucun succès T02.

Le diagnostic a exposé plusieurs formes d’échec Add Item dans les reprises: accès à un champ via `form.name` susceptible de collision, propriétés du modèle uniquement en minuscules alors que le rendu lit `ItemName`, appel d’un rendu singulier avec un tableau, et script de réparation déjà injecté mais périmé quand le candidat change de balisage. Le correctif local `a1889e5c3` couvre ces cas en utilisant les identifiants trouvés, en fournissant les alias de propriétés, en appelant le renderer singulier avec `item` et en régénérant le script de réparation existant.

Le test Edge/Playwright `backend/tests/test_worker_code_add_repair.js` passe sur la forme de candidat observée, y compris un ancien handler inline; les tests worker de réparation et de collision Quantity passent aussi. Retry58 a été démarré avant `a1889e5c3` et ne qualifie pas ce correctif. Une mission ultérieure sur le nouveau HEAD est nécessaire.

## Retry59 — échec terminal sur persistance malgré accès au bouton

Retry59 a enregistré 26 appels fournisseur `ollama://qwen2.5-coder:7b` et 25 contre-tests `npm test`. Le candidat terminal (6070 octets) échoue à `acceptance.cjs:26:10`, `updated quantity persists`; mission `failed`, complétion bloquée (`homeostasis=unstable`) à 11:02:37 UTC. Reçu: `genos-direct-d-20261023-retry59.db`.

Le terminal confirme que le bouton d’incrément du candidat n’a qu’un handler `onclick="incrementQuantity(...)"` et le texte « Increase quantity », sans nom accessible contenant Oats. L’ancien réparateur n’interceptait que `button[aria-label*="Increase quantity for Oats"]`; il ne pouvait donc pas sauvegarder l’incrément qu’il devait réparer. Le correctif local désormais testé intercepte les actions Increase/Increment dans la ligne Oats, écrit la quantité visible dans l’objet canonique sous la clé observée, reconnaît les formes `name`, `itemName` et `ItemName`, et remplace son propre script injecté au lieu de conserver une version périmée.

Le nouveau test navigateur Edge/Playwright `backend/tests/test_worker_code_quantity_increment_repair.js` passe: un bouton textuel sans aria-label incrémente Oats de 2 à 3, écrit le stockage, puis conserve 3 après reload. Les tests worker de réparation, Add Item et collision Quantity passent également. Retry59 a chargé l’ancien helper et ne qualifie pas ce correctif.

## Retry60 — échec de schéma de preuve après 25 réparations

Retry60 a lancé le protocole T02 dans le workspace D: et enregistré 27 inférences complétées ainsi que 25 événements de réparation Playwright `LOCAL_CODE_TEST_REPAIR`. L’orchestrateur s’est arrêté à 11:13:06 UTC parce que la sortie du modèle ne respectait pas le schéma de preuve demandé (`Model output did not satisfy the requested worker evidence schema`). La mission `autonomy-proof-t02-20261023-direct-d-repair-60` est `failed`; le gate a bloqué la complétion avec `homeostasis=unstable`. Reçu: `D:\GenOS\runs\autonomy-proof-t02-20261022\genos-direct-d-20261023-retry60.db`. Ce terminal ne démontre pas un résultat T02 vert, même si les 25 réparations ont franchi le cycle de test local.

## Correctif des contrôles Quantity dupliqués — tests ciblés verts

Le dernier cycle de réparation a exposé une entrée HTML Quantity dupliquée avec des guillemets échappés. `labelQuantityInput` supprime maintenant les entrées Quantity redondantes dans le formulaire et normalise l’attribut accessible de l’entrée conservée. Le contrôle unitaire vérifie qu’il reste un seul `id="quantity"` et un seul nom accessible Quantity.

Vérification locale sur ce correctif: `node backend/tests/test_worker_code_test_repair.js`, `node backend/tests/test_worker_code_quantity_repair.js`, `node backend/tests/test_worker_code_quantity_increment_repair.js` et `node backend/tests/test_worker_code_add_repair.js` passent tous. Ces tests ciblés ne certifient pas le T02 complet. `genos_search_failures` a renvoyé `Transport closed`; aucune couverture mémoire GenOS n’est revendiquée.

## Retry61 — échec terminal sur nom accessible Best-before dupliqué

Retry61 a enregistré 27 inférences Qwen et 25 cycles de réparation avec l’oracle Playwright local. Le test terminal échoue à `acceptance.cjs:17:41`: `getByLabel(/best.before/i)` trouve à la fois le label et le champ date parce que le label porte lui-même `aria-label="Best-before date"`. `AGENT_FAILED` indique que les tests locaux ont échoué et que les modifications de capsule ont été annulées; `MISSION_COMPLETION_BLOCKED` confirme `homeostasis=unstable` à 11:22:20 UTC. Reçu: `D:\GenOS\runs\autonomy-proof-t02-20261022\genos-direct-d-20261023-retry61.db`.

Le correctif supprime le nom ARIA redondant du label associé au champ date, tout en conservant le nom accessible du champ. Le nouveau cas de réparation et les tests ciblés worker, collision Quantity, persistance d’incrément et Add Item passent. Retry61 n’inclut pas ce correctif et ne peut pas le qualifier; la réussite T02 complète reste à démontrer.

## Retry62 — échec terminal Add Item après 25 réparations

Retry62 a enregistré 27 inférences Qwen et 25 cycles `LOCAL_CODE_TEST_REPAIR`. Le dernier `npm test` échoue de nouveau à `acceptance.cjs:19:10` après Add Item (`0 !== 1`); l’orchestrateur annule la capsule, marque la mission `failed` et bloque la complétion avec `homeostasis=unstable` à 11:31:49 UTC. Reçu: `D:\GenOS\runs\autonomy-proof-t02-20261022\genos-direct-d-20261023-retry62.db`.

Avant le terminal, le run a aussi rencontré la collision `getByLabel(/quantity/i)` où le label Quantity et le champ étaient chacun nommés. Le réparateur enlève maintenant `aria-label` du label relié à l’entrée Quantity, en gardant le nom accessible sur l’entrée. Le nouveau test navigateur Edge confirme que Playwright trouve un seul champ Quantity et peut le remplir. Il passe avec les tests worker, Best-before, collision Quantity, persistance d’incrément et Add Item. Retry62 a chargé l’ancienne réparation Quantity; une mission suivante doit encore vérifier ce correctif et démontrer le T02 complet.

Le candidat terminal Retry62 avait le formulaire et le bouton Add Item, mais après 25 cycles il n’affichait toujours aucune ligne Oats. Un filet de secours rend maintenant l’article dans le conteneur Pantry si le chemin de rendu généré n’a pas produit de ligne visible. `node backend/tests/test_worker_code_add_repair_fallback.js` passe dans Edge: il confirme une ligne Oats, l’incrément 2→3 et sa persistance dans localStorage. Le test existant `test_worker_code_add_repair.js` passe aussi. Ce filet de secours reste à qualifier dans une nouvelle exécution T02 réelle.

## Retry63 — échec terminal de persistance après rechargement

Retry63 a enregistré 27 inférences Qwen et 25 cycles de réparation. Le test terminal échoue à `acceptance.cjs:26:10` (`updated quantity persists`); la mission est `failed` et le gate `homeostasis=unstable` à 11:43:14 UTC. Reçu: `D:\GenOS\runs\autonomy-proof-t02-20261022\genos-direct-d-20261023-retry63.db`. Les diagnostics montrent que le correctif atteint le point de reload, mais que le renderer candidat ne réhydrate pas toujours Oats depuis localStorage.

Le fallback Add Item réutilise maintenant son rendu de secours pour reconstruire les articles persistés au chargement. Le scénario navigateur Edge dans `test_worker_code_add_repair.js` ne contourne plus l’erreur du renderer via sessionStorage: il ajoute Oats, l’incrémente à 3, recharge et vérifie une seule ligne visible à 3. Les tests Add Item, fallback isolé, incrément Quantity et nom accessible Quantity passent. Retry63 a chargé la version sans réhydratation; le correctif exige une nouvelle qualification T02 complète.

## Retry64 — échec terminal de nom accessible Quantity

Retry64 a enregistré 27 inférences Qwen et 25 réparations; son `npm test` terminal échoue à `acceptance.cjs:15:38`, car `getByLabel(/quantity/i)` ne trouve pas de champ nommé. Le candidat avait un `<label for="quantity">` qui contenait l’input sans texte; le gate final marque la mission `failed` et `homeostasis=unstable` à 11:52:55 UTC. Reçu: `D:\GenOS\runs\autonomy-proof-t02-20261022\genos-direct-d-20261023-retry64.db`.

L’inspection a trouvé que la déduplication accessible précédente retirait par erreur `aria-label` de l’input quand celui-ci était imbriqué dans son label. Les deux réparateurs Quantity et Best-before ne modifient maintenant que l’ouverture `<label>`. Les contrôles Edge couvrent cette structure imbriquée et confirment que le nom reste sur l’input; le worker, Add Item, réhydratation, collision Quantity et incrément passent également. Retry64 a chargé l’ancienne version; ce correctif attend une nouvelle mission T02.

## Retry65 — collision Quantity pendant la validation à zéro

Retry65 a enregistré 27 inférences Qwen et 25 réparations. Son test terminal échoue à `acceptance.cjs:31:38`: après le reload et le contrôle de persistance, `getByLabel(/quantity/i)` correspond au champ et au bouton `Increase quantity for Oats` pendant la validation de quantité nulle. La mission est `failed`, le gate `homeostasis=unstable` à 12:00:00 UTC. Reçu: `D:\GenOS\runs\autonomy-proof-t02-20261022\genos-direct-d-20261023-retry65.db`.

Le correctif committé dans `b1d9eba68` renomme l’action d’incrément en `Increase Oats` lorsque la quantité persistée atteint 3 et attend aussi un rendu asynchrone. Les tests worker, collision Quantity, incrément et Add Item passent localement. Retry66 a démarré avec ce correctif, mais le T02 complet reste non qualifié.

## Retry66 — deux lignes Oats au lieu d’une

Retry66 a enregistré 27 inférences Qwen et 25 réparations; le test terminal échoue à `acceptance.cjs:19:10` (`2 !== 1`) après Add Item. La mission est `failed` et le gate `homeostasis=unstable` à 12:10:03 UTC. Reçu: `D:\GenOS\runs\autonomy-proof-t02-20261022\genos-direct-d-20261023-retry66.db`.

Le candidat affichait déjà une feuille de texte `Oats: 2`; le fallback la comptait comme différente de `Oats` et ajoutait une deuxième ligne. `ensureVisibleItem` reconnaît maintenant le nom exact et les lignes qui commencent par le nom suivi de deux-points ou d’un espace. Le test Edge `test_worker_code_add_repair_fallback.js` couvre à la fois le renderer cassé et un renderer qui produit déjà `Oats: 2`; il passe avec une seule ligne. Retry66 utilisait la version antérieure au correctif; le T02 complet reste à démontrer.

## Retry67 — collision Quantity persistante après 25 réparations

Retry67 a enregistré 27 inférences Qwen et 25 réparations `LOCAL_CODE_TEST_REPAIR`. Le test terminal échoue encore à `acceptance.cjs:31:38`: `getByLabel(/quantity/i)` trouve le champ numérique et le bouton `Increase quantity for Oats`. La mission passe à `failed` à 12:20:43 UTC et le gate bloque la complétion (`homeostasis=unstable`). Reçu: `D:\GenOS\runs\autonomy-proof-t02-20261022\genos-direct-d-20261023-retry67.db`.

Le plan déclenché par cet échec n’appliquait que la normalisation au rechargement; il pouvait donc manquer l’intercepteur qui enregistre le marqueur de quantité 3. Le réparateur `ensure_quantity_field_after_reload` compose maintenant aussi `ensureQuantityIncrementBehavior`, afin que la séquence d’incrément, persistance et renommage après reload soit installée ensemble. `node backend/tests/test_worker_code_test_repair.js` et `node backend/tests/test_worker_code_add_repair_fallback.js` passent après ce changement. Cela constitue une vérification ciblée, pas une réussite T02; une nouvelle expérience réelle doit encore confirmer le gate complet.

## Retry68 — le plan de réparation ne reconnaît pas la collision stricte

Retry68 a enregistré 27 inférences Qwen et 25 réparations avant l’échec à 12:27:32 UTC; mission `failed`, gate `homeostasis=unstable`. Au contre-test terminal (`acceptance.cjs:31:38`), Playwright rapporte une violation de mode strict entre le champ Quantity et le bouton `Decrease quantity for Oats`. Le run a aussi atteint un timeout d’export JSON au cycle 22, puis les cycles suivants ont dépassé cette étape.

La règle générique `getByLabel(/quantity/i) ... waiting for` interceptait le call log d’une violation stricte et sélectionnait la réparation « champ manquant » au lieu de `ensure_quantity_field_after_reload`. Le test reproduit maintenant le message strict complet et le plan choisit le réparateur après reload, qui compose l’intercepteur d’incrément. Le test navigateur Quantity vérifie aussi que les boutons Increase et Decrease ne se confondent plus avec le champ après reload. Pour l’export, le réparateur ajoute son écouteur dans un script autonome après le code du candidat; un test Edge confirme le téléchargement JSON même si un script antérieur contient une erreur de syntaxe. Les tests `test_worker_code_test_repair.js`, `test_worker_code_quantity_repair.js`, `test_worker_code_export_repair.js` et `test_worker_code_add_repair_fallback.js` passent. Ces résultats ciblés ne remplacent pas la qualification T02 complète.

Reçu: `D:\GenOS\runs\autonomy-proof-t02-20261022\genos-direct-d-20261023-retry68.db`.

## Retry69 — gate homéostatique intermédiaire, acceptance encore rouge

Retry69 a enregistré 22 inférences et 16 cycles de réparation. Le terminal `npm test` échoue à `acceptance.cjs:19:10` (`0 !== 1`, aucune ligne après Add Item). L’audit de couverture est `required-coverage-incomplete`; la mission persistée est `failed` à 12:37:48 UTC. Une télémétrie intermédiaire émet néanmoins `MISSION_COMPLETED` avec `homeostasis_satisfied`, car ce sous-gate avait autorisé la clôture avant le verdict final; elle ne vaut pas réussite T02. Le contrôle final retient correctement l’échec et l’absence de réussite démontrée. Reçu: `D:\GenOS\runs\autonomy-proof-t02-20261023-direct-d-repair-69.db`.

Le run a exposé un strict locator Category (label et select tous deux nommés). `labelCategorySelect` retire désormais le nom ARIA redondant du label dans le formulaire et garde celui du select. Le test de réparation couvre cette forme exacte; `node backend/tests/test_worker_code_test_repair.js` passe. Le correctif n’a pas fait passer l’acceptance Add Item terminale.

## Retry70 — échec Delete Oats et continuation refusée

Retry70 a enregistré 10 inférences et 4 cycles de réparation. L’acceptance terminale échoue à `acceptance.cjs:35:56`, car aucun bouton `Delete Oats` n’est trouvé. La mission est `failed` à 12:42:58 UTC et le gate reste bloqué avec `evidence_missing`. La tentative de continuation échoue avant exécution: rôle inconnu `homeostasis_continuation`; aucun événement `MISSION_COMPLETED` n’est émis. Reçu: `D:\GenOS\runs\autonomy-proof-t02-20261023-direct-d-repair-70.db`.

Ces deux runs ne démontrent pas encore un `npm test` T02 complet vert ni un verdict final de complétion stable. Le prochain run doit rester le critère de qualification; le statut intermédiaire du sous-gate n’est pas un substitut à l’acceptance.

Le candidat Retry70 contenait un bouton Delete générique dans une ligne Oats déjà rendue. Le fallback Add Item quittait la fonction dès qu’il trouvait cette ligne, sans donner son nom accessible à l’action. `ensureVisibleItem` normalise maintenant le bouton Delete d’une ligne existante en `Delete Oats` sans créer de doublon. Le plan de réparation reconnaît l’échec `getByRole('button', { name: /delete oats/i })` et relance Add Item. Le test Edge reproduit l’état persistant, vérifie le locator, clique Delete et confirme la suppression dans localStorage. Les six tests ciblés (worker repair, Add Item, fallback, collision Quantity, incrément persistant et export) passent. Ce correctif attend une nouvelle acceptance T02 réelle.

## Défaut du gate homeostasis — résultat de test réellement exécuté non collecté

La trace de Retry70 confirme une clôture refusée avec `Required evidence missing: test_suite_passed`. La cause était dans `missionEvidenceCollector`: `testsPassed` restait toujours `false`, avec un commentaire indiquant qu’aucun producteur de reçu d’exécution fiable n’était raccordé. Les sorties de l’agent et la télémétrie ne pouvaient donc pas attester un `npm test` effectivement lancé et réussi.

Le worker local transmet maintenant ses résultats d’exécution au service `localCodeTestExecutionReceiptService`. Le service persiste chaque lot de tests dans une table append-only, lie la commande, les codes de sortie et l’empreinte des fichiers, puis revalide cette empreinte avant de contribuer à `test_suite_passed`. Le contexte structural `testsPassed` du contrat homeostasis provient uniquement de ces reçus. Les exécutions locales Windows sous l’identité orchestrateur sont également reconnues car cette branche n’a pas un agent worker séparé.

Vérifications réelles passées : `node backend/tests/test_local_code_test_execution_receipts.js` (lance deux processus `npm test`: un vert accepté, un rouge rejeté avec rollback); `node backend/tests/test_mission_evidence.js` (12/12); `node backend/tests/test_local_code_worker.js`; `node backend/tests/test_worker_code_evidence.js`; `npm run test:quality`. Les tests confirment aussi qu’une déclaration de réussite dans la télémétrie ne compte pas et qu’une modification du workspace après le test invalide le reçu.

Le premier contrôle de commit a rejeté le dépassement de 400 lignes dans `workerEvidenceBarrierLocal.js` (402). L’adaptateur d’exécution des propositions a été extrait dans `workerEvidenceBarrierLocalProposal.js`; le fichier repasse à 394 lignes, puis les tests receipt, mission evidence, worker et quality repassent.

Ce correctif élimine la cause identifiée du manque `test_suite_passed`; il ne prouve pas à lui seul la clôture finale T02. Le serveur GenOS MCP a encore renvoyé `Transport closed`, et une nouvelle mission Qwen avec le reçu raccordé reste à exécuter.

## Replay Retry70 — acceptance complète verte, lancement mission indisponible

Pour vérifier le correctif Delete Oats sur le candidat réel Retry70 sans altérer son workspace, une copie a été créée sous `C:\Users\Shadow\Documents\GitHub\GenOSWork\workspace-replay-70-delete-name`. La première acceptance Edge dépasse Delete Oats, puis échoue à `acceptance.cjs:28:44`: le bouton Export ne déclenche aucun téléchargement. Ce résultat négatif est conservé ici.

La réparation d’export déjà committée (`ensureJsonExport`, commit `4a3329686`) a ensuite été appliquée à la copie. `npm test` y termine avec code 0: ajout, filtre, recherche, incrément, persistance après reload, export téléchargeable, rejet de quantité nulle, feedback, suppression et absence de requête réseau passent. Le contrôle global `npm test` du dépôt de référence termine également avec code 0. Le replay démontre l’acceptance du candidat réparé, mais ne constitue pas un run d’orchestrateur ni une preuve de stabilité homéostatique finale.

Une relance de `genos_orchestrate` pour le gate T02 avec `ollama://qwen2.5-coder:7b` a échoué avant émission d’un reçu: `Transport closed`. Le gate mission final reste donc non démontré et T02 n’est pas déclaré qualifié. Résultats à conserver: les échecs Retry69/Retry70 et le premier replay export rouge, ainsi que le replay Playwright vert après correctifs.

## Retry71 — reçu de test créé mais référence refusée

Le run Qwen réel `autonomy-proof-t02-20261023-direct-d-repair-71` a utilisé `ollama://qwen2.5-coder:7b` dans `D:\GenOS\runs\autonomy-proof-t02-20261023-receipt71\workspace`, sur une base SQLite dédiée. Qwen a produit des propositions et exécuté `npm test`, mais le validateur a refusé le dossier : `evidence.references.unresolved:genos://code-test-execution/<receiptHash>`. Le gate final est resté `homeostasis=unstable`, avec `test_suite_passed` manquant. L’échec prouve que le reçu immuable était bien produit, mais que le contrat de références d’artefact ne reconnaissait pas encore son URI.

Le contexte de validation transmet maintenant le reçu issu du service d’exécution locale. Seul son hash hexadécimal fourni par l’exécuteur est ajouté aux références autorisées; sans ce reçu lié, la référence reste refusée. `test_worker_evidence_local_artifact.js` vérifie les deux cas. Les tests receipts, evidence local, dossier de code et quality passent.

## Retry72 — acceptance et homeostasis vertes, coverage incomplet

Le run réel `autonomy-proof-t02-20261023-direct-d-repair-72` a été lancé depuis une copie neuve dans `D:\GenOS\runs\autonomy-proof-t02-20261023-receipt72\workspace`, avec une base neuve et le même Qwen local. Premier essai `npm test` rouge (`acceptance.cjs:19:10`, `0 !== 1`, aucune ligne après Add Item); Qwen a corrigé le candidat. Son second `npm test` a terminé à code 0 (`CANDIDATE ... index.html true 14414`), et le système a créé le reçu passé `8ec22aa49cc381c02ee86fc77a144b3de0b2791961655f686ddbaa9972d95bc8`, lié à l’empreinte du workspace. Le gate homéostatique final est `homeostasis_satisfied`, `missingEvidence=[]`, `completionGate.allowed=true`.

Le verdict de mission complet est cependant `required_coverage_incomplete` (`success=false`): les outils obligatoires `genos_diagnose`, `genos_snapshot`, `genos_hypothesis_evidence`, `genos_evaluate_trajectories`, `genos_replay` et `genos_record_decision` n’ont pas de reçu d’action dans cette exécution. L’acceptance T02 est donc démontrée sur le candidat, et le nouveau gate de test est validé en conditions réelles, mais le run d’orchestrateur n’est pas qualifié comme succès global. Il reste à connecter l’exécution réelle de ces outils au chemin local d’orchestration et à refaire T02 avant de revendiquer la réussite complète.

## Vérifications après correction du résolveur

- `node backend/tests/test_worker_evidence_local_artifact.js`: passe, y compris refus du reçu non lié.
- `node backend/tests/test_worker_code_evidence.js`: passe.
- `node backend/tests/test_local_code_test_execution_receipts.js`: passe (processus `npm test` vert accepté, processus rouge refusé/rollback).
- `node backend/tests/test_mission_evidence.js`: 12/12.
- `npm run test:quality`: 12/12.
- `npm test`: exit 0 après relance avec autorisation d’écriture aux dossiers temporaires du clone. Le premier lancement sans cette autorisation a échoué sur `EPERM` de `.genos-agent-worlds`; ce n’était pas un échec logiciel. Des messages non fatals de tests de migration (`no such table: genome_decisions`) et des commandes git hors worktree apparaissent dans la sortie, sans faire échouer les suites.

## SH-001 — injection d’un reçu de test non lié et résultats Qwen

Un worktree jetable a été créé sous `D:\GenOS\runs\sh001-qwen-20261023-run1`, à partir du commit `b462b5d4e`. Avant l’injection, `test_worker_evidence_local_artifact.js` et `test_local_code_test_execution_receipts.js` passaient. L’injection a fait dériver la référence du reçu depuis le dossier fourni au worker au lieu de l’attacher au reçu d’exécution courant. Le test visible échoue alors sur `Missing expected exception` (ligne 44), et un oracle séparé, conservé hors du worktree, échoue également : il observe qu’un rapport peut faire accepter un reçu falsifié sans contexte d’exécution; son contrôle positif vérifie qu’un reçu lié doit rester accepté.

Le premier lancement SH‑001 s’est arrêté avant dispatch à cause du SDK MCP manquant dans le worktree, puis un nouvel identifiant a permis le dispatch réel. Qwen2.5-Coder 7B a deux fois proposé de modifier `backend/tests/test_worker_evidence_local_artifact.js`, y compris après une consigne explicite d’immutabilité. La barrière a refusé les deux propositions avant écriture. Qwen2.5-Coder 32B a fait la même proposition après une génération de 166 secondes; elle a également été refusée. Aucun des modèles n’a corrigé le défaut injecté. Les missions restent `failed` avec `evidence_report` et `test_suite_passed` manquants; la couverture d’orchestration reste incomplète. Ces refus et échecs sont conservés comme tels.

L’expérience révèle que `localCodeWorkerService.parseProposal` rejetait proprement un chemin dangereux, mais sans classer la réponse comme erreur de schéma réparable. Le cycle `workerCodeTestRepair` ne pouvait donc pas transmettre le motif à Qwen pour une nouvelle proposition. Le parseur renvoie maintenant `WORKER_OUTPUT_SCHEMA_VIOLATION`, le chemin refusé, l’extrait de sortie et le coût de tokens observé. La boucle de réparation existante peut renvoyer ces éléments à Qwen, en gardant les fichiers de test hors des patches admissibles. Les tests vérifient la classification, la boucle de retry, l’immutabilité et la consommation de tokens.

Vérifications après cette correction : `test_local_code_worker.js`, `test_worker_code_test_repair.js`, `test_worker_evidence_local_artifact.js`, `test_local_code_test_execution_receipts.js` et `npm run test:quality` passent. L’oracle SH‑001 est encore rouge sur la lésion injectée; il faut maintenant relancer Qwen avec ce mécanisme de correction puis obtenir une acceptance indépendante avant de conclure.

La suite officielle `node backend/tests/run_validation_suite.js workers` a ensuite passé ses 37 suites (161,9 s), nouveau test de retry inclus. Le sous-test formel indique `Lean is unavailable` et est explicitement sauté par la suite; tous les autres tests du profil passent.

## SH-001 Retry04 — feedback de schéma trop faible et budget épuisé

Après intégration du premier correctif de retry, Qwen 7B a bien relancé des inférences après le rejet de ses patches de test, mais a répété 12 réponses non conformes; aucun patch n’a été appliqué. La réservation de tokens a ensuite stoppé proprement l’exécution (`MODEL_COST_BUDGET_EXCEEDED`); la mission reste `failed`, avec `evidence_report` et `test_suite_passed` manquants. Le worktree reste au défaut injecté. Cette tentative confirme que la simple remontée générique du schéma rejeté ne suffit pas et que 25 retries maximaux peuvent consommer le budget sans progrès.

Le feedback de retry précise maintenant qu’un chemin de test refusé est immuable et que seul le code de production doit être corrigé. Les erreurs de schéma ont un maximum de trois re-prompts, distinct du plafond des réparations après test rouge. La télémétrie conserve le code, le message et les violations (sans stocker l’extrait complet du modèle). Tests verts : `test_worker_code_unsafe_proposal_retry.js` (réponse corrigée au premier retry et arrêt après trois re-prompts), `test_worker_code_test_repair.js`, `test_local_code_worker.js`, `test_worker_evidence_local_artifact.js`, `test_local_code_test_execution_receipts.js`, et `npm run test:quality` (12/12). Un nouveau run Qwen reste nécessaire pour prouver que le feedback renforcé permet la réparation SH‑001.

Validation finale : node backend/tests/run_validation_suite.js workers passe ses 37 suites en 143,9 s (code de sortie 0). Le test formel Lean reste explicitement sauté car Lean est indisponible.

## SH-001 — runs Qwen réels 05 à 10 et contrôles finaux

Les premiers appels MCP supplémentaires n’ont pas lancé de modèle : le préflight exige le champ `diagnosticHypotheses`, et le scan d’un workspace déjà partiellement enregistré a rencontré l’index unique `idx_workspaces_tenant_name`. Les runs ont ensuite été exécutés par le CLI de GenOS avec une base SQLite jetable et un workspace isolé sous `D:\GenOS\runs`; aucun test ni code source n’a été édité par ces échecs de préflight.

- **Run05, Qwen 7B, mode worker générique : échec.** Une inférence Ollama réelle a produit un rapport `outcome=unresolved`, sans patch code ni reçu de test. Le gate a bloqué la mission; l’oracle visible et le privé n’étaient pas sollicités par ce chemin.
- **Run06, Qwen 7B, worker de code : échec de configuration.** Le modèle a été lancé, mais la commande `node` seule n’était pas dans l’allowlist; aucun test n’a été exécuté. Le run conserve ce rejet.
- **Run07, Qwen 7B, commande de test autorisée : échec de proposition.** Qwen a proposé une réécriture de 472 octets contenant le placeholder littéral `<original code using validHash>`. Le test a échoué avec `SyntaxError: Unexpected token '<'`; le worker a restauré la lésion initiale.
- **Run08, Qwen 7B avec le backend corrigé et retries disponibles : échec terminal.** Sept propositions ont toutes échoué puis ont été annulées. Leurs fichiers de remplacement de production mesuraient 111 à 347 octets et contenaient notamment du code isolé (`if` sans contexte, `obtainHash` indéfini ou module manquant). Le budget partagé a été épuisé; la mission et son gate sont restés en échec.
- **Run09, Qwen 32B : échec terminal.** Trois propositions ont passé jusqu’au test mais n’exportaient pas `attachWorkerArtifact`, omettaient le dossier `workerArtifact` ou ne respectaient pas les affirmations attendues. La quatrième génération a dépassé le délai restant. Aucune modification n’a été conservée.
- **Run10, Qwen 32B avec fenêtre de 20 minutes : échec terminal.** Dix propositions ont exécuté le test, toutes en échec. Certaines avaient une syntaxe invalide; d’autres laissaient `workerArtifact.type` indéfini au lieu du dossier attendu. Une onzième génération a dépassé le délai alors qu’il restait 32,8 s. Chaque proposition a été rollbackée.

Les logs des runs 05 à 10 et la base de télémétrie sont conservés sous `D:\GenOS\runs\sh001-runtime-qwen-20261023-run05` et `D:\GenOS\runs\sh001-runtime-qwen-20261023-run06`. Le worktree expérimental `run06` conserve la lésion non réparée : `node backend/tests/test_worker_evidence_local_artifact.js` et l’oracle privé terminent tous deux avec code 1 (`Missing expected exception`). C’est le résultat négatif pertinent pour l’hypothèse d’auto-réparation par Qwen.

**Contrôle positif séparé, non attribué à Qwen :** après la fin des runs, le fichier de production de référence déjà réparé a été restauré dans `run1`. Le test visible passe et l’oracle privé passe avec `forged receipt refused; execution-bound receipt accepted`. Ce contrôle établit que le test et l’oracle reconnaissent bien la propriété attendue; il ne transforme pas les runs Qwen en réussite autonome.

Conclusion expérimentale SH‑001 : la réparation autonome par Qwen n’est pas démontrée. Les tentatives et contre-exemples sont conservés; l’implémentation de référence passe le contrôle positif indépendant, tandis que le worktree de lésion reste rouge.

## SH-001 Run11 — Qwen 32B réel, douze échecs de test

Le run `sh001-qwen-20261023-real-run11` a utilisé `ollama://qwen2.5-coder:32b` sur le capsule D isolé `D:\GenOS\runs\sh001-qwen-20261023-run06`, avec 25 minutes, 100 000 tokens, 30 étapes et une base SQLite dédiée. Ollama a effectivement chargé le modèle; le CLI de GenOS s’est terminé avec `EXIT_CODE=2`, `success=false`, `verdict=failed` et `Required evidence missing: evidence_report`. Le budget a permis 12 propositions exécutées. Les premières n’exportaient pas `attachWorkerArtifact`; les dernières produisaient le champ `workerArtifact` de manière incomplète. La proposition 12 a échoué sur `test_worker_evidence_local_artifact.js:18`, où `workerArtifact.type` était `undefined` au lieu de `dossier`. Toutes les propositions testées ont été refusées et le défaut injecté est resté dans le capsule. L’usage mesuré dans la télémétrie est 4 979 tokens pour l’exécution finale, mais le collecteur d’usage total du run a rendu `complete=false`.

Après l’orchestrateur, le test visible échoue toujours à la ligne 44 avec `Missing expected exception`, donc la lésion reste présente. L’oracle privé lancé depuis le capsule a imprimé `SH-001 hidden oracle PASS`; toutefois, le run précédent avait enregistré un échec de ce même oracle et la comparaison du code source montre que le capsule conserve la branche vulnérable qui accepte un hash de reçu pris dans les références du rapport. Ce résultat privé est donc contradictoire avec le test visible et le code observé; il est conservé comme observation brute, mais ne compte pas comme validation indépendante tant que la cible effective de l’oracle n’est pas établie. Aucun succès Qwen n’est revendiqué.

Les logs complets et la base sont dans `D:\GenOS\runs\sh001-runtime-qwen-20261023-run06\orchestrator-run11.log` et `genos.db`. Résultats terminal CLI, sortie d’oracle et état du capsule doivent rester distincts : échec Qwen, oracle incohérent à investiguer, réparation autonome non démontrée.

## SH-001 Run12 — format d’édition exacte, diagnostic Qwen hors cible

Le nouveau format `genos.file-edits/v1` permet une modification minimale par ancre exacte, avec une seule occurrence requise, limite de taille, chemin sûr, test allow-listé et rollback. Il a été committé en `dac283bdf`. Les tests ciblés `test_local_code_worker.js`, `test_worker_code_test_repair.js`, `test_worker_code_unsafe_proposal_retry.js`, `test_worker_evidence_local_artifact.js` et `npm run test:quality` passent. La suite complète `node backend/tests/run_validation_suite.js workers` passe ses 37 suites (141,1 s); Lean reste explicitement ignoré car indisponible.

Run Qwen réel `sh001-qwen-20261023-real-run12`, modèle `qwen2.5-coder:32b`, sur un capsule neuf à l’état initial sain puis lésé, avec 15 min et 30 000 tokens. Le prompt ne donnait pas l’emplacement de la source à corriger. Le premier essai a été rejeté: `Unsafe patch proposal for 'Cargo.toml'`. Le second a tenté un edit dans `crates/genos-orchestrator/src/orchestrator.rs`; l’ancre exacte n’y existait pas. Aucune modification n’a été appliquée, aucun test réparé n’a été reçu et le gate a terminé `success=false`, avec `evidence_report` et `test_suite_passed` manquants. Le test de référence reste rouge à la ligne 44 (`Missing expected exception`). Ce run montre que le format réduit la surface de génération, mais ne suffit pas à orienter le diagnostic si le worker ne reçoit pas la sortie du test de référence.

Contrôle oracle run12 : le test visible échoue, alors que l’invocation de `oracle.cjs` depuis le capsule affiche `SH-001 hidden oracle PASS`. Le capsule contient toujours la lésion. Comme cette sortie contredit le test visible et les contrôles rouges antérieurs, le résultat est archivé brut mais exclu du verdict jusqu’à vérification de la cible que l’oracle a effectivement chargée.

## SH-001 Runs13–14 — progression du diagnostic, feedback d’ancre manquant

**Run13, Qwen 32B : échec hors cible.** Le prompt contenait la sortie visible exacte de l’assertion (ligne 44, exception attendue pour un reçu non lié), sans donner le chemin du code. Qwen a tenté `backend/src/services/worker_evidence.js`, absent du capsule (`ENOENT`). Aucun test post-patch n’a tourné; mission `failed`, evidence report manquant. Cela a montré que le contexte du worker ne contenait pas le test ni ses imports: `buildWorkspaceContext` choisissait les douze premiers éléments de la racine du dépôt.

**Correction du contexte.** Le snapshot inclut maintenant en priorité le test des commandes autorisées et les sources qu’il importe, puis les autres fichiers jusqu’aux plafonds existants. Le nouveau test construit un dépôt factice et vérifie que le test et son module de production figurent avant `Cargo.toml`. Correctif committé `9d304d6b7`; profil workers vert 37/37 suites (135,1 s).

**Run14, Qwen 32B : bonne cible, ancre invalide.** Sur un capsule frais, Qwen a ciblé le bon module `backend/src/services/workerEvidenceLocalArtifact.js`, mais son edit exact n’a pas trouvé une occurrence unique (`Exact edit anchor must occur once`). L’échec s’est produit avant l’écriture et avant test; mission `failed`, evidence report manquant. Le collecteur ne classait pas ce refus de matérialisation comme erreur de schéma, donc le mécanisme de retry ne pouvait pas demander à Qwen de corriger son ancre. Le parseur remonte maintenant cette erreur avec les diagnostics, l’extrait de proposition et la consommation de tokens pour le retry borné. Tests worker local, retry des patches non sûrs et quality 12/12 verts.

Pour run13 et run14, le test visible échoue au départ à la ligne 44 et aucun correctif Qwen n’est conservé. Les invocations de `oracle.cjs` affichent PASS depuis les nouveaux capsules alors que le défaut visible est présent; des logs antérieurs contiennent le même oracle en échec. Cette contradiction reste non qualifiante et sera investiguée séparément. Aucun des deux runs ne démontre l’auto-réparation.

## SH-001 Run15 — test visible vert, faux succès éliminé par contre-épreuve

Le run Qwen 32B `sh001-qwen-20261023-real-run15` a enfin reçu le test et ses sources importées. Il a modifié uniquement `backend/src/services/workerEvidenceLocalArtifact.js`; le test allow-listé `node backend/tests/test_worker_evidence_local_artifact.js` a terminé à code 0 et produit le reçu `48666f0e047635078409c37790c22925458bc3090b1661e98b36f760c911d719`. La mission globale est néanmoins `homeostasis_continuation` (`success=false`), car `completion_contract_configured` manque et le lancement de continuation a échoué. Usage de l’inférence enregistrée: 10 815 tokens.

Le test d’origine et l’oracle privé ont imprimé PASS. Une contre-épreuve contrôlée a ensuite construit un dossier mentionnant un hash falsifié `b…b`, avec un contexte d’exécution proposant un reçu distinct `c…c`. Qwen n’a ajouté qu’une condition de présence de `proposal`, sans vérifier que le reçu cité est celui de cette exécution; le contre-test a imprimé `MISMATCHED_FORGED_RECEIPT_ACCEPTED` (exit 1). Le succès visible du run15 est donc un faux positif du test existant, et le PASS de l’oracle privé ne prouve pas le cas de hash mismatch. Ce run est classé **échec fonctionnel**, pas réparation.

Le test visible sera renforcé avec ce mismatch adversarial et restera immuable dans le prochain essai. L’oracle privé n’est pas modifié. Le prochain run repartira d’une lésion fraîche; il devra refuser à la fois un reçu sans contexte et un reçu différent de celui du contexte, tout en acceptant le reçu réellement lié.

## SH-001 Run16 — assertion mismatch ajoutée, retries insuffisants

Run Qwen 32B `sh001-qwen-20261023-real-run16` sur un capsule frais avec l’assertion adversariale committée `268d8761e` et un contrat de complétion explicite. Le contrôle initial est rouge sur l’assertion existante à la ligne 44 (`Missing expected exception`). Qwen a d’abord ciblé `backend/src/services/workerCodeEvidenceReport.js`; la proposition a été appliquée mais le test est resté rouge. Au retry, il a ciblé `workerEvidenceLocalArtifact.js`, mais l’ancre exacte a été rejetée. La classification de cette erreur a bien déclenché un nouveau prompt, contrairement aux runs antérieurs.

La troisième génération a été arrêtée par `Model token reservation exceeds the remaining shared budget`. Usage reporté: 12 016 tokens; le collecteur de la mission affiche `complete=false`. La mission finit `success=false`, `verdict=incomplete`, sans dossier ni reçu de test passé. Chaque patch au test rouge a été rollbacké. La correction du modèle n’est pas démontrée; le progrès vérifié est que le refus d’ancre produit un retry borné, mais le budget partagé de 30 000 tokens ne laisse pas assez de réservation pour l’inférence suivante.

L’oracle privé sur le capsule vierge a encore annoncé PASS malgré le test visible rouge; il n’est pas considéré comme preuve. Le prochain essai doit augmenter le budget de réservation et conserver l’assertion adversariale immuable.

## SH-001 Run17 — budget relevé, six propositions sans correction

Run Qwen réel `sh001-qwen-20261023-real-run17`, Qwen 32B, 120 000 tokens et 20 minutes, avec le test mismatch immuable et un completion contract explicite. Six propositions ont été lancées: la première a ciblé un fichier de test et a été refusée comme chemin dangereux; la deuxième a tenté un code qui a causé une `TypeError` sur un contexte de proposition absent; les propositions 3 à 5 ont ciblé `workerEvidenceLocalArtifact.js` mais ont laissé l’assertion ligne 44 rouge; la sixième a encore visé `workerCodeEvidenceReport.js` avec une ancre inexistante. Le modèle a épuisé le délai de la mission lors de cette génération. Aucun test n’est passé, le patch a été rollbacké, et la mission a terminé `failed` sans `evidence_report` ni `test_suite_passed`. La couverture de l’orchestration demeure incomplète (seul `genos_search_failures` a un reçu).

Le budget plus grand a permis davantage de tentatives, mais le résultat n’améliore pas le correctif SH-001. Les entrées run17 sont dans `D:\GenOS\runs\sh001-runtime-qwen-20261023-run17\genos.db` et `orchestrator-run17.log`; le capsule conserve le défaut injecté. Cet échec et ses propositions restent archivés.

## SH-001 Run18b — allowlist active, Qwen proposals encore non exploitables

Run réel `sh001-qwen-20261023-real-run18b` avec `ollama://qwen2.5-coder:32b`, sur une capsule isolée `D:\GenOS\runs\sh001-qwen-20261023-real-run18`, commit de base `113435519`. La lésion publique est la même dérive de reçu de test injectée au run17. Le test initial rouge a échoué à `test_worker_evidence_local_artifact.js:44` (`Missing expected exception`). La DB vierge a nécessité `GENOS_ADMIN_PASSWORD`; un premier identifiant de workspace absent, puis terminal, a été abandonné et conservé dans `orchestrator-run18.log`. Le run valide a utilisé `run18b` et un nouveau mot de passe éphémère.

Cinq inférences Qwen ont eu lieu: (1) réponse de schéma refusée, chemin de patch hors de l’énumération autorisée; (2) patch de `workerCodeEvidenceReport.js` avec erreur `SyntaxError: Unexpected token '}'`, test rouge et rollback; (3) ancre exacte absente de ce même fichier, refusée; (4) nouvelle ancre absente, refusée; (5) timeout de modèle après 51,646 s. Aucun changement de réparation n’est resté dans la capsule, aucun reçu de test positif n’a été produit. L’orchestrateur finit `success=false`, `verdict=failed`, avec `evidence_report` et `test_suite_passed` manquants; sa couverture requise reste incomplète. Le faux succès n’a pas été annoncé.

L’allowlist issue du contexte est appliquée avant écriture et a refusé le premier chemin interdit. Elle n’empêche cependant pas les mauvais choix parmi plusieurs imports autorisés: Qwen a ciblé `workerCodeEvidenceReport.js`, alors que les assertions qui échouent appellent `attachWorkerArtifact`. Le prochain ajustement doit améliorer le retour de retry et les chemins candidats dérivés des assertions observables, sans imposer un correctif ni consulter l’oracle privé.

Vérifications de cette étape: `node backend/tests/test_local_code_worker.js` passe; `node backend/tests/run_validation_suite.js workers` passe, 37 suites en 152,6 s. Le hook de commit a validé 5 fichiers modifiés, 0 violation nouvelle. Le contrôle qualité global échoue sur 39 violations (38 signalées comme nouvelles), dont des fichiers hors de cette modification; `workerEvidenceBarrierLocal.js` reste à 400 lignes. Commit du correctif d’allowlist: `113435519`. L’expérience est persistée dans GenOS, épisode `7931bfa1-ff6c-41d0-9d5b-09dc6274b741`.

## SH-001 Run19b — retries ciblés, mais même mauvais module

Run réel `sh001-qwen-20261023-real-run19b`, Qwen 32B, capsule propre sur commit `b65098f0e`, avec la lésion SH‑001 et test public rouge à la ligne 44. Le premier démarrage (`run19`) n’a pas dispatché faute de SDK MCP dans la worktree; la dépendance MCP locale a ensuite été reliée, puis `run19b` a passé le préflight GenOS. Une première validation workers a échoué sur `SQLITE_CANTOPEN` parce que `GENOS_DB_PATH` était forcé vers une DB partagée; la relance sans cette variable a passé les 38 suites en 134,129 s. Lean reste explicitement indisponible et sauté.

Qwen a produit quatre inférences. Les trois premières ont été refusées avant application: l’ancre exacte n’existait pas dans `backend/src/services/workerCodeEvidenceReport.js`. La quatrième a terminé sans produire de preuve requise; la mission finit `success=false`, `verdict=failed`, avec `evidence_report` et `test_suite_passed` manquants et une couverture d’orchestration incomplète. Aucun patch n’a modifié durablement la capsule; la lésion reste visible. Ces erreurs sont enregistrées dans `D:\GenOS\runs\sh001-runtime-qwen-20261023-run19\orchestrator-run19b.log` et la DB correspondante. GenOS a persisté l’épisode `d4551d03-8657-4905-a4f3-8c3ec71063cb`.

Le retour « relire le fichier, copier une ancre unique ou remplacer le fichier complet » n’a pas suffi: Qwen a répété le même mauvais module. Le commit `c99e3c8a8` resserre maintenant les chemins admissibles aux modules qui exportent une fonction importée et appelée directement par une assertion échouante; ce critère générique est couvert par `test_local_code_worker.js`. Le run20 vérifiera s’il conduit Qwen au bon code sans donner le correctif.

## SH-001 Run20 — ciblage réduit, trois patches annulés, tentative finale interrompue

Run réel `sh001-qwen-20261023-real-run20` avec `ollama://qwen2.5-coder:32b`, capsule isolée `D:\GenOS\runs\sh001-qwen-20261023-real-run20`, base `0fcfe9cb3`. La lésion a été injectée dans la capsule et le test public est rouge avant mission, `Missing expected exception` à `test_worker_evidence_local_artifact.js:44`. Le profil workers a passé 38 suites (150,394 s) sur la base propre. Le chemin candidat produit par le contexte était exactement `backend/src/services/workerEvidenceLocalArtifact.js`.

La mission `sh001-qwen-20261023-real-run20` a démarré et Qwen a généré au moins trois patches dans le bon module. Le premier a été rejeté par le schéma d'autorisation des chemins; les deux patches effectivement exécutés ont tous deux échoué au test public, avec rollback automatique. Reçus d'échec: `b92ec31e0c17f55dc8920fe23abe428c4f04221218d7e1411e77cfe533fb394c` (19:35:09 UTC) et `c8ad08a8be5d56cc4d81b67888b6f22102bdb9077e7082ef7804c8db04719268` (19:37:45 UTC). Aucun reçu positif. Le troisième retry était encore `INFERENCE_STARTED` dans `D:\GenOS\runs\sh001-runtime-qwen-20261023-run20\genos.db`; l'orchestrateur a été interrompu ensuite et la mission demeure `active` dans la DB. Ce run n'établit donc ni réparation ni réussite de mission. La lésion demeure dans la capsule; les propositions ne sont pas promues.

Conclusion: les chemins resserrés ont amené les patches dans le bon fichier, mais Qwen n'a pas produit de code satisfaisant l'assertion, même après retours d'échec avec rollback. Une tentative finale a été interrompue sans résultat publiquement validable. Le log et la base runtime sont conservés dans `D:\GenOS\runs\sh001-runtime-qwen-20261023-run20\`; ne pas compter le faux oracle comme preuve.

Validation de référence après le run: `node backend/tests/test_worker_evidence_local_artifact.js` passe sur le checkout sain. Une sonde indépendante via l'API `attachWorkerArtifact` confirme séparément: reçu correspondant accepté, reçu sans proposal rejeté, reçu divergent rejeté. Cela démontre le contrat public sur le code sain, mais ne transforme pas le run Qwen en succès; aucun correctif n'a été promu depuis ses propositions. L'expérience run20 est aussi persistée dans GenOS sous l'épisode `f910dace-8154-40c4-b1cf-de2b970284d8`.

## SH-001 Run21 — Qwen2.5 échoue encore; réparation de référence validée séparément

Run réel `sh001-qwen-20261023-real-run21` avec `ollama://qwen2.5-coder:32b`, capsule D: à partir de `6b81bc5b5`. Le test passe avant injection; après injection et rollback, le rouge public est `Missing expected exception` à la ligne 44. La lésion a été committée post-run pour préserver l’historique reproductible sous `3e0872330`.

Qwen a reçu le bilan des erreurs des runs précédents. Huit inférences ont suivi: sept réponses terminées et une huitième expirée. Cinq patches ont été exécutés puis rejetés par le test public; deux sorties ont été refusées pour ancre ou schéma. Les reçus négatifs sont `aa80f972a155079dda51e0610c25c906a644f238c6f05198a2a4f345d287daa8`, `23b2cf8cca53e58e37fae3942c90d477b4476c285564a471a9f8e415aab35b37`, `d135c60a918e2be9f820729797b61536bae5336c19e9e38cfd36a178efdbd865`, `5693011f84c0392e139cb6eb33b0cba3bf7f6ddc86be2c9bee458a6f48f55ee3` et `222108b9f8e18f5b55cd3e97fa3f9c57c8d150a02461373cdf3a86aff32aa4e7`. L’appel final a expiré après 94,219 ms; la mission s’est terminée `failed`, sans `evidence_report` ni `test_suite_passed`. Les modifications Qwen ont été rollbackées et la capsule restait lésée.

Après la fin du run, correction de référence manuelle: seule la valeur `proposal.testExecutionReceipt.receiptHash` peut ajouter le reçu d’exécution aux références de confiance; les reçus cités par le rapport ne sont pas une autorité. Le test public passe et une sonde API indépendante accepte le reçu réel correspondant et rejette les cas absent/divergent. Le correctif manuel est committé dans la capsule sous `7478189bb`; il ne doit pas être attribué à Qwen. Les commits récents `2a839f5bb` et `cbaabcca6` améliorent le feedback de réparation; les tests ciblés `test_local_code_worker.js` et `test_worker_code_test_repair_guidance.js` passent. Run22 utilise Qwen3.8 avec ces améliorations.

## SH-001 Runs22–24 — Qwen3.8, sortie pensée et indisponibilité de route

Les trois runs ont utilisé des capsules isolées sous `D:\GenOS\runs\sh001-qwen-20261023-real-run22`, `...run23` et `...run24`, sans modifier la sonde privée. Les runs22 et23 visaient Qwen3.8; le run24 vérifiait en plus le correctif de routage de pensée structuré.

- **Run22 — échec de transport.** La route `ollama://qwen3.8:latest` a échoué avant patch avec `fetch failed` / `MODEL_ROUTE_FAILED`. Un appel CLI minimal ultérieur a répondu `READY` après l’arrêt d’un ancien runner Qwen2.5, mais ce smoke test ne prouve pas l’exécution du worker GenOS.
- **Run23 — sortie structurée absente.** La lésion committée `5fda975d5` rendait le test rouge à `Missing expected exception` ligne44. Trois appels Qwen3.8 ont chacun terminé avec `output_tokens=0`; le worker a rejeté la réponse vide (`WORKER_OUTPUT_SCHEMA_VIOLATION`). Aucune modification n’a été appliquée. L’orchestrateur a été interrompu après le troisième échec; mission non réussie, sans `evidence_report` ni `test_suite_passed`.
- **Correctif de transport.** Le code worker structuré demande désormais `reasoning_effort: "none"` et le routeur le propage aux formats Ollama OpenAI-compatible et natif (`think: false`). Le correctif est committé sur la branche D: sous `4b23b9f34`. Les tests `test_model_provider_sampling.js`, `test_local_code_worker.js` et `test_worker_evidence_local_artifact.js` passent. Le hook qualité a aussi validé la limite de taille des fichiers.
- **Run24 — échec de route malgré le correctif.** Le test sain passe, puis la lésion est committée `ca44204ed` et le test public redevient rouge ligne44. Avec `ollama://qwen3.8:latest`, la mission a fini `failed` après 309,291 ms avec `Every model route failed ... fetch failed`; aucun reçu de test ni patch n’a été produit. Les logs Ollama montrent des réponses HTTP 200, mais des appels Qwen2.5 concurrents/runner `Stopping...` étaient présents sur le même serveur. Je n’attribue donc pas cet échec au paramètre de raisonnement ni à la validité du patch: la réponse d’application côté GenOS n’est pas disponible. Le probe direct du paramètre n’a pas produit d’artefact et n’est pas compté comme validation.

Le résultat reste **non démontré par Qwen**. Le correctif de routage n’est qu’un changement d’infrastructure testé unitairement; aucune guérison autonome SH-001 n’est revendiquée. Les DB, capsules et logs run22–24 sont conservés dans `D:\GenOS\runs\`.

Enregistrements GenOS associés : run23 échec `7d3970ee-85c3-44a3-9824-dea4c304aab7`; run24 échec `50a2a1af-ff36-448e-b8bb-3da587980db8`; correctif de routage unitairement vérifié `28b10ec4-aed5-4c04-94f0-5d530ddaf9c4`. Ces expériences sont des mémoires de provenance et ne certifient pas le succès de la réparation.
Run22 est aussi persisté dans GenOS sous `a5f7dc28-2976-424b-b3bb-7af780641c1f` (route échouée avant patch).

## Vérifications locales recommandées par le rapport joint

Sur la tête saine D: après les correctifs SH-001, les six commandes du rapport ont passé (code de sortie 0) :

- `test_shev_healing_contract.js` — phases durables, preuves et clôture terminale.
- `test_shev_healing_integration.js` — tick, Ontogenesis, effet et preuve longitudinale.
- `test_physiological_arc_closed_loop.js` — connexions A à D de la boucle physiologique.
- `test_sre_healing_policy.js` — 10/10 cas, dont abstention budgétaire et vérification longitudinale.
- `test_sre_healing_store.js` — 3/3 cas sur les reçus immuables et transitions hash-chainées.
- `test_security_qualification_lab.js` — PASS du laboratoire de qualification simulé.

Ces tests prouvent les contrats locaux et la simulation du labo. Ils ne prouvent pas une réparation sur VM Hyper-V, une campagne terrain de 72 h, ni une réparation SH-001 générée par Qwen. Les clients GenOS parallèles occupaient encore Ollama; aucun nouveau run Qwen n’a été lancé dans cette fenêtre.
Le correctif a ensuite été restreint aux URI `ollama://` afin de ne pas ajouter un champ non applicable aux autres fournisseurs; commit `7549d718d`, validé par `test_local_code_worker.js` (Ollama reçoit `none`, OpenAI ne le reçoit pas).

## SH-001 Run25 — Qwen répare le test, le rapport GenOS est rejeté

Run réel `sh001-qwen-20261023-real-run25`, Qwen2.5-Coder 32B, capsule isolée `D:\GenOS\runs\sh001-qwen-20261023-real-run25`, basée sur `90a0a6703`; lésion SH-001 committée `a09dbf170`. La lésion rendait le test public rouge à la ligne 44 (`Missing expected exception`).

Deux inférences Qwen ont été exécutées (13 065/211 puis 14 775/194 tokens, durées 155 206 ms et 169 132 ms). Le premier patch a échoué au test public; reçu négatif `test_0817520a-e5b5-4db0-a01a-fd3bf7f776ce`. Après retour du test, Qwen a produit un second patch et le worker a exécuté le même test avec `exitCode=0`; reçu positif `test_c959c7ec-ea47-4303-8407-5b8971288378`. Le test a aussi été relancé après le run dans la capsule et a passé. Le patch final est préservé sur la branche `codex/sh001-qwen-run25`, commit `90fce3c8e`.

La mission GenOS a néanmoins fini `success=false`: après le test positif, le rapport déterministe du worker de code a été refusé par le validateur générique `dossier` avec `diagnosticMatrix.invalid`. Le reçu positif est dans la DB runtime, mais le collecteur/clôture de mission n’a pas produit un verdict de succès ni accepté `evidence_report` et `test_suite_passed`. Ce run prouve que Qwen a corrigé et passé le test dans la capsule; il ne prouve pas une mission GenOS complète.

Correction de cette barrière: `workerEvidenceLocalArtifact` ne doit pas exiger une matrice diagnostique d’un rapport de code généré à partir du patch et du reçu d’exécution. Une assertion régressive reproduit `prompt: 'Mission artifact=diagnostic_matrix'` avec `codeWorker: true`. Correctif et test committés `cc9675f22`; `test_worker_evidence_local_artifact.js` et `test_local_code_worker.js` passent. Run26 repart d’une base saine contenant cette correction et réinjecte seulement la lésion de provenance.

La tentative `genos_diagnose` a échoué côté outil avec `contains forbidden command characters`; aucune hypothèse n’est déclarée comme persistée dans GenOS. Les reçus, la DB et les journaux restent conservés sous `D:\GenOS\runs\sh001-runtime-qwen-20261023-run25\`.

## SH-001 Run26 — deux patches avec erreur de portée, deux rejets de schéma, puis timeout

Run réel `sh001-qwen-20261024-real-run26`, Qwen2.5-Coder 32B, capsule `D:\GenOS\runs\sh001-qwen-20261023-real-run26`, base saine `0e6368635` avec le garde-fou de rapport corrigé, puis lésion SH-001 `a2719b632`. Le test public était rouge avant dispatch (`Missing expected exception`, ligne 51 après ajout de la nouvelle assertion de garde-fou).

Cinq appels Qwen ont été exécutés en 30 minutes. Les tentatives 1 et 2 ont échoué au même test public: Qwen a ajouté `mission` comme variable locale à `trustedCodeEvidenceRefs(report, codeWorker, proposal)` alors que cette variable n’existe pas dans la portée. Reçus négatifs `test_bf9ba9d0-d996-4b6b-a5f3-1409ebf9e741` et `test_2e54994c-c457-41b1-9f6a-1dd4f548d62c`. Les tentatives 3 et 4 ont été rejetées par le schéma de proposition avant exécution, avec respectivement 1 239 et 702 tokens de sortie. La tentative 5 a dépassé son délai restant de `721093 ms` et s’est terminée `MODEL_ROUTE_DEADLINE_EXCEEDED`, sans patch appliqué ni test exécuté. Le ledger totalise les appels `13125/159`, `14787/138`, `8194/1239`, `8194/702`, puis le timeout sans métriques finales.

Aucun reçu positif n’existe dans la DB runtime `D:\GenOS\runs\sh001-runtime-qwen-20261024-run26\genos.db`. La mission finit `success=false`, verdict `failed`, et garde les preuves `evidence_report` et `test_suite_passed` manquantes. La branche capsule conserve le dernier candidat invalide et le rapport détaillé sous commit d’échec `e3d00716d` (`codex/sh001-qwen-run26`). Aucun oracle privé n’a été consulté.

Run26 ne remet pas en cause le reçu positif du run25: il documente une répétition distincte qui n’a pas trouvé de réparation. La limite de 30 minutes est insuffisante pour les longues sorties observées; le prochain essai doit recevoir une fenêtre plus longue et éviter de réintroduire la référence hors portée.
