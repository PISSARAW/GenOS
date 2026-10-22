# Échec observé — test de délégation identité (2026-10-22)

Commande : `node backend/tests/test_worker_delegation_identity.js`

Résultat : échec avant exécution du runner d’identité, à l’assertion `assert.match(controller, /role: scopedPair\.role/)`.

Le test lisait initialement `backend/src/controllers/deployController.js`, qui délègue désormais la construction des paramètres à `backend/src/controllers/deployHelpers.js`. Après avoir réaligné cette première assertion sur `params.agent.role`, le test a atteint une seconde assertion périmée : elle exige `workspace_id = (SELECT ...)`, alors que `workerGarageService.js` utilise `workspace_id IS (SELECT ...) OR workspace_id IS NULL` pour préserver la portée et le cas sans workspace. La suite n’était donc pas adaptée à deux refactors déjà présents; aucun défaut de production n’a été démontré par ces assertions.

Correction de l’oracle : lecture de `deployHelpers.js`, vérification que le rôle provient de `params.agent.role` et assertion de la forme SQL actuelle `IS (...) OR ... IS NULL`. Vérification : `node backend/tests/test_worker_delegation_identity.js` — PASS (`Worker delegation preserves identity and workspace scope.`). Le test n’a plus de raison d’échouer sur ces deux détails d’implémentation.

Les tests ciblés des prompts d’identité, `test_worker_runtime_identity_prompt.js` et `test_homeostasis_default_evidence.js` passent également.
