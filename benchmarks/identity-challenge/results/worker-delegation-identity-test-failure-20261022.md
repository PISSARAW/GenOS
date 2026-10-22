# Échec observé — test de délégation identité (2026-10-22)

Commande : `node backend/tests/test_worker_delegation_identity.js`

Résultat : échec avant exécution du runner d’identité, à l’assertion `assert.match(controller, /role: scopedPair\.role/)`.

Le test lisait initialement `backend/src/controllers/deployController.js`, qui délègue désormais la construction des paramètres à `backend/src/controllers/deployHelpers.js`. Après avoir réaligné cette première assertion sur `params.agent.role`, le test a atteint une seconde assertion périmée : elle exige `workspace_id = (SELECT ...)`, alors que `workerGarageService.js` utilise `workspace_id IS (SELECT ...) OR workspace_id IS NULL` pour préserver la portée et le cas sans workspace. La suite n’était donc pas adaptée à deux refactors déjà présents; aucun défaut de production n’a été démontré par ces assertions.

Le test ciblé des prompts d’identité, le test `test_worker_runtime_identity_prompt.js` et la syntaxe des fichiers expérimentaux passent. Le test de délégation est conservé comme échec jusqu’à correction de son oracle.
