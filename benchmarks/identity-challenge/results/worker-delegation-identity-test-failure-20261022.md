# Échec observé — test de délégation identité (2026-10-22)

Commande : `node backend/tests/test_worker_delegation_identity.js`

Résultat : échec avant exécution du runner d’identité, à l’assertion `assert.match(controller, /role: scopedPair\.role/)`.

Le test lit `backend/src/controllers/deployController.js`, qui délègue désormais la construction des paramètres à `backend/src/controllers/deployHelpers.js`. Le contrôleur n’y contient plus littéralement `role: scopedPair.role`; le rôle est construit dans `buildStartMissionParams` depuis `params.agent.role`. La trace d’assertion confirme que la suite est obsolète par rapport au refactor, mais la commande seule ne permettait pas encore de confirmer que le test vérifie le bon contrat de sécurité. Aucune modification du contrôleur n’a été faite sur la base de cette assertion.

Le test ciblé des prompts d’identité, le test `test_worker_runtime_identity_prompt.js` et la syntaxe des fichiers expérimentaux passent. Le test de délégation est conservé comme échec jusqu’à correction de son oracle.
