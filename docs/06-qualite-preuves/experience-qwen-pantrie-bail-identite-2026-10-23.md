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