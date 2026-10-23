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
